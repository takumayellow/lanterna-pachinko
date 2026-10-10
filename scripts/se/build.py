"""SE を合成し，mp3 に書き出して public/audio/se/ と manifest.json を作る.

使い方: python scripts/se/build.py [id ...]   （id を省くと全部）
中間物（wav・スペクトログラム・計測表）は build-audio/se/ に出す.
"""
from __future__ import annotations

import json
import subprocess
import sys
import zlib
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dsp import SR  # noqa: E402
import sounds_big as big  # noqa: E402
import sounds_small as small  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "public" / "audio" / "se"
WORK_DIR = ROOT / "build-audio" / "se"
EXT = "mp3"
BITRATE = "192k"
SIZE_LIMIT = 3 * 1024 * 1024
HEAD_LIMIT_MS = 5.0
SPECTRO_IDS = {"kyuin", "gekiatsu", "button_press", "cutin_gold", "hold_rainbow", "reach"}

# id → (合成関数, 目標 true peak [dBTP])．相対音量はここで決め，再生側はそのまま鳴らす.
SOUNDS: dict[str, tuple] = {
    "launch": (small.launch, -26.0),
    "nail1": (lambda r: small.nail(r, 0), -24.0),
    "nail2": (lambda r: small.nail(r, 1), -25.0),
    "nail3": (lambda r: small.nail(r, 2), -24.5),
    "nail4": (lambda r: small.nail(r, 3), -25.5),
    "heso_in": (small.heso_in, -9.0),
    "payout": (small.payout, -13.0),
    "attacker_in": (small.attacker_in, -10.0),
    "hold_white": (lambda r: small.hold(r, "white"), -11.0),
    "hold_blue": (lambda r: small.hold(r, "blue"), -8.0),
    "hold_green": (lambda r: small.hold(r, "green"), -6.0),
    "hold_red": (lambda r: small.hold(r, "red"), -3.5),
    "hold_rainbow": (lambda r: small.hold(r, "rainbow"), -1.5),
    "hold_change": (small.hold_change, -4.0),
    "reel_stop": (lambda r: small.reel_stop(r, False), -12.0),
    "reel_stop_center": (lambda r: small.reel_stop(r, True), -6.0),
    "reach": (big.reach, -2.0),
    "cutin_blue": (lambda r: big.cutin(r, "blue"), -4.0),
    "cutin_red": (lambda r: big.cutin(r, "red"), -2.5),
    "cutin_gold": (lambda r: big.cutin(r, "gold"), -1.0),
    "button_appear": (big.button_appear, -5.0),
    "button_press": (big.button_press, -1.0),
    "gekiatsu": (big.gekiatsu, -1.0),
    "kyuin": (big.kyuin, -1.0),
    "freeze": (big.freeze, -1.0),
    "miss": (small.miss, -20.0),
    "gimmick": (big.gimmick, -1.0),
    "round_start": (small.round_start, -4.0),
    "denchu_open": (small.denchu_open, -11.0),
    "count_tick": (small.count_tick, -24.0),
    "flash": (big.flash, -4.0),
}


def db(x: float) -> float:
    return 20 * np.log10(max(x, 1e-12))


def true_peak(x: np.ndarray) -> float:
    return db(float(np.max(np.abs(signal.resample_poly(x, 4, 1, axis=-1)))))


def finish(x: np.ndarray) -> np.ndarray:
    """先頭の完全な無音と末尾の -60 dB 以下を落とし，端を短くフェード."""
    a = np.max(np.abs(x), axis=0)
    peak = a.max()
    if peak == 0:
        raise ValueError("silent render")
    nz = np.nonzero(a > peak * 1e-4)[0]
    tail_idx = np.nonzero(a > peak * 10 ** (-60 / 20))[0]
    s, e = nz[0], min(len(a), tail_idx[-1] + 1)
    y = x[:, s:e].copy()
    k_in = min(y.shape[1], 12)
    y[:, :k_in] *= np.linspace(0.3, 1, k_in)
    k_out = min(y.shape[1], int(0.02 * SR))
    y[:, -k_out:] *= np.linspace(1, 0, k_out)
    return y


def ffmpeg(*args: str, stdout=None) -> bytes:
    res = subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", *args], stdout=subprocess.PIPE, check=True)
    return res.stdout


def encode(x: np.ndarray, wav: Path, dst: Path) -> None:
    wavfile.write(wav, SR, x.T.astype(np.float32))
    ffmpeg("-y", "-i", str(wav), "-c:a", "libmp3lame", "-b:a", BITRATE, "-ar", str(SR), str(dst))


def decode(src: Path, raw: bool = False) -> np.ndarray:
    pre = ["-flags2", "+skip_manual"] if raw else []
    data = ffmpeg(*pre, "-i", str(src), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-")
    return np.frombuffer(data, dtype=np.float32).reshape(-1, 2).T.astype(np.float64)


def head_ms(x: np.ndarray, rel_db: float = -40.0) -> float:
    a = np.max(np.abs(x), axis=0)
    idx = np.nonzero(a > a.max() * 10 ** (rel_db / 20))[0]
    return idx[0] / SR * 1000 if len(idx) else float("nan")


def render(sid: str, fn, target: float) -> dict:
    rng = np.random.default_rng(zlib.crc32(sid.encode()))
    x = finish(fn(rng))
    wav = WORK_DIR / "wav" / f"{sid}.wav"
    dst = OUT_DIR / f"{sid}.{EXT}"
    aim = target - 0.1
    gain = 10 ** ((aim - true_peak(x)) / 20)
    best = None
    for _ in range(8):  # mp3 化で増えるピークを測り直し，target を超えない範囲で寄せる
        encode(x * gain, wav, dst)
        tp = true_peak(decode(dst))
        if tp <= target and (best is None or tp > best[1]):
            best = (gain, tp)
        if target - 0.3 <= tp <= target:
            break
        gain *= 10 ** ((aim - tp) / 20) if tp <= target else 10 ** ((aim - 0.2 - tp) / 20)
    if best is None:
        raise RuntimeError(f"{sid}: decoded true peak stays above {target} dBTP")
    if best[0] != gain:
        encode(x * best[0], wav, dst)
    y = decode(dst)
    tp = true_peak(y)
    raw = decode(dst, raw=True)
    return {
        "id": sid,
        "file": f"{sid}.{EXT}",  # manifest.json からの相対（src/audio/samples.ts が base + file で引く）
        "duration": round(y.shape[1] / SR, 3),
        "peakDb": round(tp, 2),
        "_target": target,
        "_head_ms": round(head_ms(y), 2),
        "_head_ms_60": round(head_ms(y, -60.0), 2),
        "_head_ms_raw": round(head_ms(raw), 2),
        "_bytes": dst.stat().st_size,
        "_signal": y,
    }


def spectrogram(sid: str, y: np.ndarray) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    mono = y.mean(axis=0)
    f, t, s = signal.spectrogram(mono, SR, nperseg=2048, noverlap=2048 - 256, window="hann")
    s_db = 10 * np.log10(s + 1e-14)
    fig, (ax0, ax1) = plt.subplots(2, 1, figsize=(10, 6), sharex=True, gridspec_kw={"height_ratios": [1, 3]})
    tt = np.arange(len(mono)) / SR
    ax0.plot(tt, y[0], lw=0.4, color="#335")
    ax0.set_ylim(-1, 1)
    ax0.set_ylabel("amp")
    ax0.set_title(sid)
    vmax = s_db.max()
    ax1.pcolormesh(t, np.maximum(f, 1), s_db, vmin=vmax - 80, vmax=vmax, shading="auto", cmap="magma")
    ax1.set_yscale("log")
    ax1.set_ylim(25, 20000)
    ax1.set_ylabel("Hz")
    ax1.set_xlabel("s")
    fig.tight_layout()
    fig.savefig(WORK_DIR / f"spec_{sid}.png", dpi=90)
    plt.close(fig)


def main(ids: list[str]) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (WORK_DIR / "wav").mkdir(parents=True, exist_ok=True)
    unknown = [i for i in ids if i not in SOUNDS]
    if unknown:
        print(f"unknown id: {unknown}", file=sys.stderr)
        return 2
    targets = ids or list(SOUNDS)
    results = {}
    for sid in targets:
        fn, target = SOUNDS[sid]
        r = render(sid, fn, target)
        if sid in SPECTRO_IDS or ids:
            spectrogram(sid, r["_signal"])
        results[sid] = r
        print(f"{sid:18s} {r['duration']:6.3f}s  TP {r['peakDb']:6.2f} dBTP (target {target:6.1f})  "
              f"head {r['_head_ms']:5.2f} ms (-60dB {r['_head_ms_60']:5.2f}, raw {r['_head_ms_raw']:6.2f})  "
              f"{r['_bytes'] / 1024:6.1f} KB")

    manifest_path = OUT_DIR / "manifest.json"
    old = {e["id"]: e for e in json.loads(manifest_path.read_text("utf-8"))} if manifest_path.exists() else {}
    merged = {**old, **{k: {f: v for f, v in r.items() if not f.startswith("_")} for k, r in results.items()}}
    manifest = [merged[k] for k in SOUNDS if k in merged]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8")

    report = [{k: v for k, v in r.items() if k != "_signal"} for r in results.values()]
    (WORK_DIR / "report.json").write_text(json.dumps(report, indent=2) + "\n", "utf-8")

    total = sum(p.stat().st_size for p in OUT_DIR.glob(f"*.{EXT}"))
    late = [r["id"] for r in results.values() if not r["_head_ms"] <= HEAD_LIMIT_MS]
    print(f"total {len(manifest)} files, {total / 1024:.1f} KB")
    if total > SIZE_LIMIT:
        print(f"ERROR: total size exceeds {SIZE_LIMIT} bytes", file=sys.stderr)
        return 1
    if late:
        print(f"ERROR: head delay > {HEAD_LIMIT_MS} ms: {late}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
