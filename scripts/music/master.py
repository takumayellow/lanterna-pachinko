"""ffmpeg でマスタリング（EQ・コンプ・リミッタ・loudnorm）して mp3 に書き出す.

ループ曲: 1 周（周期的な信号）を 3 回並べて処理し, 真ん中の 1 周を取る. コンプやリミッタの
内部状態が前の周から続いた状態になるので, 切り出した 1 周も周期的なまま.

ループのファイルは [前置き PRE][本体 1 周][後ろ POST] の並び. 前置きは本体の最後の部分,
後ろは本体の最初の部分なので, どちらも継ぎ目の外側まで同じ波形が続く. エンコーダの先頭
パディングを取り除かないデコーダでも, 全体が数十 ms ずれるだけでループは継ぎ目なしのまま.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

from render import SR

PRE_SEC = 0.25  # loopStart より前に置く部分
PRE_FADE_SEC = 0.08  # 前置きの最初だけフェードイン（ファイル頭から再生したときのプツ音を防ぐ）
POST_SEC = 0.35
MP3_BITRATE = "192k"

EQ = ",".join([
    "highpass=f=30:poles=2",
    "equalizer=f=250:t=q:w=1.1:g=-2.5",  # 低中域の濁り
    "equalizer=f=3000:t=q:w=1.0:g=1.5",  # 前に出す帯域
    "highshelf=f=9000:g=2",
])


def _ffmpeg(args: list[str]) -> str:
    res = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", *args], capture_output=True,
                         text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        raise RuntimeError(res.stderr[-1500:])
    return res.stderr


def measure(path: Path) -> dict[str, float]:
    """ebur128 で統合ラウドネス（LUFS）とトゥルーピーク（dBTP）を測る."""
    err = _ffmpeg(["-i", str(path), "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"])
    summary = err[err.rfind("Summary:"):]
    found = {}
    for key, pattern in (("lufs", r"I:\s+(-?[\d.]+|-inf) LUFS"), ("tp", r"Peak:\s+(-?[\d.]+|-inf) dBFS"),
                         ("lra", r"LRA:\s+(-?[\d.]+|-inf) LU")):
        m = re.search(pattern, summary)
        if not m:
            raise RuntimeError(f"ebur128 の出力から {key} を読めない: {path}")
        found[key] = float(m.group(1))
    return found


def _chain(gain_db: float, ceiling_db: float) -> str:
    limit = 10 ** (ceiling_db / 20)
    return ",".join([
        EQ,
        "acompressor=threshold=-18dB:ratio=2.5:attack=12:release=160:knee=4:makeup=1",
        f"volume={gain_db:.3f}dB",
        # 4 倍オーバーサンプルで掛けてサンプル間のピーク（トゥルーピーク）も抑える
        f"aresample={SR * 4}",
        f"alimiter=limit={limit:.5f}:attack=1:release=50:level=disabled",
        f"aresample={SR}",
    ])


def _loudnorm(src: Path, dst: Path, target: float) -> str:
    """loudnorm の 2 パス（linear=true）で最後の音量合わせ. 戻り値は normalization_type."""
    base = f"loudnorm=I={target}:TP=-1.0:LRA=20"
    err = _ffmpeg(["-i", str(src), "-af", base + ":print_format=json", "-f", "null", "-"])
    m = json.loads(err[err.rfind("{"): err.rfind("}") + 1])
    second = (f"{base}:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
              f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}"
              f":offset={m['target_offset']}:print_format=json")
    err = _ffmpeg(["-i", str(src), "-af", second + f",aresample={SR}", "-c:a", "pcm_f32le", str(dst)])
    m2 = json.loads(err[err.rfind("{"): err.rfind("}") + 1])
    return m2["normalization_type"]


def master(x: np.ndarray, work: Path, name: str, target: float, loop: bool,
           ceiling_db: float = -2.0) -> tuple[np.ndarray, str]:
    """マスタリングした信号（ループなら 1 周ぶん）と loudnorm の動作モードを返す."""
    work.mkdir(parents=True, exist_ok=True)
    n = len(x)
    src = work / f"{name}-premaster.wav"
    sf.write(src, np.tile(x, (3, 1)) if loop else x, SR, subtype="FLOAT")
    lim = work / f"{name}-limited.wav"
    pre = measure(src)
    gain = target + 0.6 - pre["lufs"]  # コンプで少し下がるぶんを見込む
    for _ in range(4):
        _ffmpeg(["-i", str(src), "-af", _chain(gain, ceiling_db), "-c:a", "pcm_f32le", str(lim)])
        got = measure(lim)
        if abs(got["lufs"] - (target + 0.3)) < 0.25:
            break
        gain += target + 0.3 - got["lufs"]
    out = work / f"{name}-mastered.wav"
    mode = _loudnorm(lim, out, target)
    if loop and mode != "linear":
        # dynamic だと 3 周の間で音量が動き, 切り出した 1 周の両端がつながらない
        raise RuntimeError(f"{name}: loudnorm が {mode} になった（ループは linear でないと継ぎ目がずれる）")
    y, _ = sf.read(out, dtype="float32", always_2d=True)
    if loop:
        y = y[n: 2 * n]
    else:
        y = y[:n]
    return y, mode


def assemble_loop(body: np.ndarray) -> tuple[np.ndarray, int, int]:
    """[前置き][本体][後ろ] を作り, (信号, loopStart のサンプル, loopEnd のサンプル) を返す."""
    pre = int(PRE_SEC * SR)
    post = int(POST_SEC * SR)
    head = body[-pre:].copy()
    fade = int(PRE_FADE_SEC * SR)
    head[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)[:, None]
    tail = body[:post].copy()
    tail[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)[:, None]
    return np.concatenate([head, body, tail]), pre, pre + len(body)


def encode(x: np.ndarray, work: Path, out: Path) -> Path:
    wav = work / (out.stem + "-final.wav")
    sf.write(wav, x, SR, subtype="FLOAT")
    out.parent.mkdir(parents=True, exist_ok=True)
    _ffmpeg(["-i", str(wav), "-c:a", "libmp3lame", "-b:a", MP3_BITRATE, "-ar", str(SR),
             "-map_metadata", "-1", str(out)])
    return wav


def decode(path: Path) -> np.ndarray:
    res = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2",
                          "-ar", str(SR), "-"], capture_output=True, check=True)
    return np.frombuffer(res.stdout, dtype=np.float32).reshape(-1, 2)
