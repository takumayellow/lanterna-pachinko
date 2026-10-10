"""録音サンプルを numpy で鳴らす小さなサンプラー.

1 本のパートを「1 周ぶん」描いてから, ループ曲はそれを 2 周ぶん重ねる（FluidSynth 版と同じく
2 周目を切り出すため）. 1 周ぶんの中の判断（ラウンドロビン・揺らぎ）は音符の番号から決めるので,
2 周は同じ音になり, 切り出した 1 周を繰り返しても継ぎ目が出ない.

音の高さはファイル名の音名を信用しきらず, 各ファイルの基本周波数を測って決める
（ライブラリによって C3=60 と C4=60 が混ざり, 半音ずれた名前もあるため）.
測定値は置き場の _analysis/ に JSON で残し, 次からはそれを使う.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

import samples

SR = 48000  # パイプライン全体の標本化周波数（ほかのモジュールはここを参照する）
ANALYSIS_VERSION = 5

_NOTE_RE = re.compile(r"^([a-g])(#|b)?(-?\d)$")
_DYN = {"pppp": 0, "ppp": 1, "pp": 2, "p": 3, "mp": 4, "mf": 5, "f": 6, "ff": 7, "fff": 8}
_PC = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}


@dataclass(frozen=True)
class Src:
    """録音サンプルの 1 セット（1 楽器の 1 奏法）.

    kind: sus（持続音. ノートオフで離す）/ damp（減衰音. ノートオフで止める）/ ring（鳴らし切る）
    mics: ドラムの複数マイクを足し合わせるときのマイク名 → 音量（ファイル名の先頭の語）
    """

    lib: str
    pattern: str
    kind: str = "sus"
    release: float = 0.3
    vel_db: float = 18.0
    pitched: bool = True
    pitch_mode: str = "yin"  # yin（名前の音 + 測定で補正）/ peak（スペクトルの山. ティンパニ）
    mics: tuple[tuple[str, float], ...] = ()
    max_len: float = 10.0
    attack: float = 0.002
    skip: float = 0.0  # 頭を切る秒数（弓の雑音などを詰める）


@dataclass
class Zone:
    files: list[str]
    root: float | None
    layer: int
    norm: list[float]
    trim: list[int]


@dataclass
class Voice:
    """1 音ぶんの発音指示. pitch=None は録音そのままの高さ（打楽器）."""

    src: str
    t: float  # 秒
    dur: float  # 秒
    pitch: float | None
    vel: int
    gain_db: float = 0.0
    pan: float = 0.0
    cents: float = 0.0
    attack: float | None = None
    release: float | None = None
    legato: bool = False  # 前の音から切れ目なく移る（頭の発音を飛ばしてフェードインする）
    seed: int = 0


# ---------------------------------------------------------------- 読み込みと解析

def _name_tokens(stem: str) -> list[str]:
    return [t for t in re.split(r"[_ \-]+", stem.lower()) if t]


def _parse(stem: str) -> tuple[int | None, int]:
    """ファイル名から（音名の MIDI 番号, 強弱の順位）を読む."""
    note = None
    layer = 0
    toks = _name_tokens(stem)
    for tok in toks:
        m = _NOTE_RE.match(tok)
        if m and note is None:
            # "a-1" のような負のオクターブは区切りで分かれるので前後をつなぐ
            note = _PC[m.group(1)] + {"#": 1, "b": -1, None: 0}[m.group(2)] + 12 * (int(m.group(3)) + 1)
            continue
        mv = re.fullmatch(r"v[l]?(\d+)", tok)
        if mv:
            layer = int(mv.group(1))
        elif tok in _DYN:
            layer = _DYN[tok]
    # "A#-1" は分割で "a#" "1" になる
    if note is None:
        m = re.search(r"_([A-Ga-g])(#|b)?-1_", stem)
        if m:
            note = _PC[m.group(1).lower()] + {"#": 1, "b": -1, None: 0}[m.group(2)]
    return note, layer


def _read(path: Path) -> np.ndarray:
    x, sr = sf.read(str(path), dtype="float32", always_2d=True)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    elif x.shape[1] > 2:
        x = x[:, :2]
    if sr != SR:
        g = math.gcd(sr, SR)
        x = signal.resample_poly(x, SR // g, sr // g, axis=0).astype(np.float32)
    return x


def _yin(x: np.ndarray, fmin: float = 25.0, fmax: float = 2200.0) -> float | None:
    n = len(x)
    if n < 2048:
        return None
    x = x - x.mean()
    tmax = min(int(SR / fmin), n // 2)
    tmin = max(int(SR / fmax), 2)
    w = n - tmax
    f = np.fft.rfft(x, 2 * n)
    acf = np.fft.irfft(f * np.conj(f))[: tmax + 1]
    cs = np.concatenate([[0.0], np.cumsum(x * x)])
    e0 = cs[w]
    et = cs[np.arange(tmax + 1) + w] - cs[np.arange(tmax + 1)]
    d = e0 + et - 2 * acf
    d[0] = 0
    cm = d[1:] * np.arange(1, tmax + 1) / np.maximum(np.cumsum(d[1:]), 1e-12)
    cm = np.concatenate([[1.0], cm])
    cand = np.where(cm[tmin:] < 0.12)[0]
    if len(cand):
        tau = cand[0] + tmin
        while tau + 1 < len(cm) and cm[tau + 1] < cm[tau]:
            tau += 1
    else:
        tau = int(np.argmin(cm[tmin:]) + tmin)
        if cm[tau] > 0.4:
            return None
    if 1 <= tau < len(cm) - 1:
        a, b, c = cm[tau - 1], cm[tau], cm[tau + 1]
        den = a - 2 * b + c
        tau = tau + (0.5 * (a - c) / den if abs(den) > 1e-12 else 0.0)
    if tau <= 0 or not fmin <= SR / tau <= fmax:
        return None
    return SR / tau


def _peak_pitch(x: np.ndarray) -> float | None:
    seg = x[int(0.05 * SR): int(0.8 * SR)]
    if len(seg) < 4096:
        return None
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), 1 << 18))
    freqs = np.fft.rfftfreq(1 << 18, 1 / SR)
    band = (freqs > 60) & (freqs < 320)
    return float(freqs[band][np.argmax(spec[band])])


def _midi(f: float) -> float:
    return 69 + 12 * math.log2(f / 440.0)


def _measure(x: np.ndarray, src: Src) -> tuple[float | None, float, int]:
    """（測った高さ MIDI, 正規化の倍率, 頭の空白の長さ）."""
    mono = x.mean(axis=1)
    peak = float(np.abs(mono).max()) or 1e-9
    above = np.where(np.abs(mono) > peak * 10 ** (-40 / 20))[0]
    trim = max(int(above[0]) - int(0.001 * SR), 0) if len(above) else 0
    trim += int(src.skip * SR)
    hop = int(0.05 * SR)
    body = mono[trim:]
    nblk = max(len(body) // hop, 1)
    rms = np.sqrt((body[: nblk * hop].reshape(nblk, -1) ** 2).mean(axis=1)) if len(body) >= hop else np.array([peak])
    norm = 10 ** (-18 / 20) / max(float(rms.max()), 1e-6)
    f0 = None
    if src.pitched:
        if src.pitch_mode == "peak":
            f0 = _peak_pitch(body)
        else:
            # 歌や弦はビブラートや音程の揺れがあるので, 頭を外した数か所で測って中央値を取る
            start = int(min(0.15, len(body) / SR * 0.3) * SR)
            win = int(0.2 * SR)
            end = min(len(body), start + int(1.6 * SR))
            fs = [f for a in range(start, max(end - win, start) + 1, win // 2)
                  if (f := _yin(body[a: a + win])) is not None]
            f0 = float(np.median(fs)) if fs else None
    return (_midi(f0) if f0 else None), norm, trim


def _files_for(src: Src) -> list[tuple[str, int]]:
    lock = samples.load_lock()
    pat = re.compile(src.pattern)
    return [(p, s) for p, s, _ in lock["files"][src.lib] if pat.fullmatch(p)]


def _group_key(path: str, src: Src) -> tuple[str, str | None]:
    """ドラムのマイク違いを 1 つにまとめるための鍵と, そのファイルのマイク名."""
    stem = Path(path).stem
    if not src.mics:
        return stem, None
    mic, _, rest = stem.partition("_")
    return rest, mic


def load_group(src: Src, members: list[tuple[str, str | None]]) -> np.ndarray:
    base = samples.cache_dir() / src.lib
    gains = dict(src.mics)
    parts = []
    for path, mic in members:
        x = _read(base / path)
        if mic is not None:
            x = x * np.float32(gains.get(mic, 0.0))
        parts.append(x)
    n = max(len(p) for p in parts)
    out = np.zeros((n, 2), dtype=np.float32)
    for p in parts:
        out[: len(p)] += p
    return out


def _analysis_path(name: str) -> Path:
    return samples.cache_dir() / "_analysis" / f"{name}.json"


def _src_key(src: Src) -> str:
    return hashlib.sha1(f"{ANALYSIS_VERSION}|{src}".encode()).hexdigest()[:12]


def analyze_src(name: str, src: Src) -> list[Zone]:
    """1 セットの全ファイルを読み, 高さ・音量・頭の空白を測る（結果は JSON に残す）."""
    cache = _analysis_path(name)
    key = _src_key(src)
    if cache.exists():
        data = json.loads(cache.read_text(encoding="utf-8"))
        if data.get("key") == key:
            return [Zone(**z) for z in data["zones"]]

    groups: dict[str, list[tuple[str, str | None]]] = defaultdict(list)
    for path, _ in _files_for(src):
        gk, mic = _group_key(path, src)
        groups[gk].append((path, mic))
    if not groups:
        raise RuntimeError(f"{name}: サンプルが 1 つも無い（{src.pattern}）")

    recs = []
    for gk, members in sorted(groups.items()):
        x = load_group(src, members)
        meas, norm, trim = _measure(x, src)
        named, layer = _parse(Path(members[0][0]).stem if src.mics else gk)
        recs.append({"gk": gk, "members": members, "meas": meas, "norm": norm, "trim": trim,
                     "named": named, "layer": layer})

    # 名前と測定のずれ（半音単位）を楽器全体の多数決で決め, 個々は測った値が 0.8 半音以内ならそれを使う（歌い手の音程のずれも拾う）
    offs = Counter(round(r["meas"] - r["named"]) for r in recs if r["meas"] is not None and r["named"] is not None)
    shift = offs.most_common(1)[0][0] if offs else 0
    by_root: dict[tuple, Zone] = {}
    for r in recs:
        root: float | None
        if not src.pitched:
            root = None
        elif r["named"] is not None:
            root = r["named"] + shift
            if r["meas"] is not None and abs(r["meas"] - root) < 0.8:
                root = r["meas"]
        else:
            root = r["meas"]
            if root is None:
                continue
        rk = (r["named"] if (src.pitched and r["named"] is not None) else
              (round(root, 1) if root is not None else r["gk"].split("rr")[0]), r["layer"])
        z = by_root.get(rk)
        files = [json.dumps(r["members"])]
        if z is None:
            by_root[rk] = Zone(files=files, root=root, layer=r["layer"], norm=[r["norm"]], trim=[r["trim"]])
        else:
            z.files += files
            z.norm.append(r["norm"])
            z.trim.append(r["trim"])
            if root is not None and z.root is not None:
                z.root = (z.root * (len(z.files) - 1) + root) / len(z.files)

    zones = list(by_root.values())
    # 強弱の番号を 0.. の連番に詰める
    layers = sorted({z.layer for z in zones})
    for z in zones:
        z.layer = layers.index(z.layer)
    cache.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps({"key": key, "shift": shift, "zones": [z.__dict__ for z in zones]},
                              ensure_ascii=False, indent=0), encoding="utf-8")
    os.replace(tmp, cache)  # 並列の書き込みでも読み手が途中の JSON を見ないように
    return zones


# ---------------------------------------------------------------- 発音

def _hermite(x: np.ndarray, pos: np.ndarray) -> np.ndarray:
    i = np.floor(pos).astype(np.int64)
    f = (pos - i).astype(np.float32)[:, None]
    n = len(x)
    xm1 = x[np.clip(i - 1, 0, n - 1)]
    x0 = x[np.clip(i, 0, n - 1)]
    x1 = x[np.clip(i + 1, 0, n - 1)]
    x2 = x[np.clip(i + 2, 0, n - 1)]
    c1 = 0.5 * (x1 - xm1)
    c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2
    c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1)
    return ((c3 * f + c2) * f + c1) * f + x0


def _extend(x: np.ndarray, need: int) -> np.ndarray:
    """持続音が録音より長いとき, 後半の定常部を重ね継ぎで繰り返して伸ばす."""
    n = len(x)
    if need <= n:
        return x
    a, b = int(n * 0.4), int(n * 0.85)
    xf = max(min(int(0.12 * SR), (b - a) // 3), 64)
    ang = np.linspace(0, np.pi / 2, xf, dtype=np.float32)[:, None]
    fo, fi = np.cos(ang), np.sin(ang)
    out = [x[:b]]
    total = b
    seg = x[a:b]
    while total < need:
        prev = out[-1]
        head = prev[-xf:] * fo + seg[:xf] * fi
        out[-1] = prev[:-xf]
        out += [head, seg[xf:]]
        total += len(seg) - xf
    return np.concatenate(out)


class Bank:
    """1 プロセスの中で使うサンプルの置き場（使うファイルだけ遅延して読む）."""

    MAX_BYTES = 3 << 30

    def __init__(self, sources: dict[str, Src]):
        self.sources = sources
        self.zones: dict[str, list[Zone]] = {}
        self.audio: dict[str, np.ndarray] = {}
        self.nbytes = 0

    def zones_of(self, name: str) -> list[Zone]:
        if name not in self.zones:
            self.zones[name] = analyze_src(name, self.sources[name])
        return self.zones[name]

    def wave(self, name: str, member_json: str) -> np.ndarray:
        k = name + "|" + member_json
        if k not in self.audio:
            if self.nbytes > self.MAX_BYTES:
                self.audio.clear()  # 1 プロセスのメモリを抑える（次に要る分だけ読み直す）
                self.nbytes = 0
            x = load_group(self.sources[name], [tuple(m) for m in json.loads(member_json)])
            self.audio[k] = x
            self.nbytes += x.nbytes
        return self.audio[k]

    def pick(self, name: str, pitch: float | None, vel: int, seed: int) -> tuple[Zone, int]:
        zones = self.zones_of(name)
        nl = max(z.layer for z in zones) + 1
        want = min(int(vel / 128 * nl), nl - 1)
        rnd = (seed * 2654435761) & 0xFFFFFFFF
        # 強弱の境目は少しぼかす（同じ強さでも隣の層がときどき出る）
        if nl > 1 and (rnd % 7) == 0:
            want = min(max(want + (1 if rnd & 8 else -1), 0), nl - 1)

        def cost(z: Zone) -> float:
            dist = 0.0 if pitch is None or z.root is None else abs(pitch - z.root)
            return dist + 6.0 * abs(z.layer - want) + (0.0 if dist <= 7 else 50.0)

        best = min(zones, key=cost)
        return best, rnd % len(best.files)


def render_voice(bank: Bank, v: Voice) -> np.ndarray:
    """1 音を描く（発音位置から始まるステレオの波形）."""
    src = bank.sources[v.src]
    zone, idx = bank.pick(v.src, v.pitch, v.vel, v.seed)
    x = bank.wave(v.src, zone.files[idx])
    trim = zone.trim[idx]
    norm = zone.norm[idx]
    semis = (v.pitch - zone.root) if (v.pitch is not None and zone.root is not None) else 0.0
    ratio = 2 ** ((semis + v.cents / 100.0) / 12)
    attack = v.attack if v.attack is not None else src.attack
    release = v.release if v.release is not None else src.release
    lead = 0
    if v.legato:
        lead = int(0.07 * SR)  # 発音の頭を飛ばし, 前の音とつながって聞こえるようにする
        attack = max(attack, 0.05)

    if src.kind == "ring":
        out_len = int(min((len(x) - trim) / ratio, src.max_len * SR))
    else:
        out_len = int((v.dur + release) * SR)
        if src.kind == "damp":
            out_len = int(min(out_len, (len(x) - trim) / ratio))
    out_len = max(out_len, 32)
    need = int(trim + lead * ratio + out_len * ratio) + 4
    if src.kind == "sus":
        x = _extend(x, need)
    pos = trim + lead * ratio + np.arange(out_len) * ratio
    pos = pos[pos < len(x) - 2]
    y = _hermite(x, pos)

    env = np.ones(len(y), dtype=np.float32)
    na = min(int(attack * SR), len(y))
    if na > 1:
        env[:na] = np.sin(np.linspace(0, np.pi / 2, na, dtype=np.float32)) ** 2
    if src.kind != "ring":
        off = int(v.dur * SR)
        nr = max(int(release * SR), 16)
        if off < len(env):
            env[off:] *= np.exp(-6.0 * np.arange(len(env) - off, dtype=np.float32) / nr)
    fade = min(int(0.004 * SR), len(env))
    env[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)

    gain = norm * 10 ** ((src.vel_db * (v.vel / 127.0 - 1.0) + v.gain_db) / 20)
    a = (v.pan + 1) * np.pi / 4
    g = np.array([math.cos(a), math.sin(a)], dtype=np.float32) * math.sqrt(2) * np.float32(gain)
    return y * env[:, None] * g[None, :]
