"""書き出した mp3 をデコードし直して測る: 長さ・ラウドネス・ピーク・ループの継ぎ目・無音・帯域."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from scipy import signal

from master import decode, measure
from render import SR

BANDS = [(20, 60), (60, 250), (250, 2000), (2000, 6000), (6000, 16000)]
BAND_NAMES = ["sub", "low", "mid", "hi-mid", "high"]


def _db(v: float) -> float:
    return float(20 * np.log10(max(v, 1e-12)))


def encoder_offset(ref: np.ndarray, dec: np.ndarray, search: int = 4000) -> int:
    """デコード結果が元の wav から何サンプルずれているか（正ならデコード側が遅れている）."""
    a = ref[SR // 2: SR // 2 + SR, 0].astype(np.float64)
    seg = dec[SR // 2 - search: SR // 2 + SR + search, 0].astype(np.float64)
    corr = signal.correlate(seg, a, mode="valid")
    return int(np.argmax(corr)) - search


def seam(dec: np.ndarray, start: int, end: int) -> dict[str, float]:
    """継ぎ目の検査.
    residual: loopEnd の直後（ファイルに残してある続き）と loopStart の直後 5 ms の差（dB, 信号比）.
    jump: loopEnd-1 → loopStart と飛んだときの 1 サンプルの段差を, その付近の普段の段差の最大と比べた比.
    edge_db: loopEnd 直前 5 ms と loopStart 直後 5 ms の RMS の差（dB）.
    """
    w = int(0.005 * SR)
    a = dec[start: start + w].astype(np.float64)
    b = dec[end: end + w].astype(np.float64)
    residual = _db(np.sqrt(((a - b) ** 2).mean())) - _db(np.sqrt((a ** 2).mean()))
    step = np.abs(dec[start] - dec[end - 1]).max()
    near = np.abs(np.diff(dec[end - 10 * w: end], axis=0)).max()
    before = dec[end - w: end].astype(np.float64)
    edge = _db(np.sqrt((before ** 2).mean())) - _db(np.sqrt((a ** 2).mean()))
    return {"residual_db": round(residual, 1), "jump_ratio": round(float(step / max(near, 1e-9)), 2),
            "edge_db": round(edge, 2)}


def spectrum(x: np.ndarray) -> dict[str, float]:
    f, p = signal.welch(x.mean(axis=1), fs=SR, nperseg=8192)
    total = p[(f >= 20) & (f < 16000)].sum()
    return {name: round(float(10 * np.log10(p[(f >= lo) & (f < hi)].sum() / total)), 1)
            for name, (lo, hi) in zip(BAND_NAMES, BANDS)}


def silence_ratio(x: np.ndarray, until: int | None = None) -> float:
    mono = x[:until].mean(axis=1) if until else x.mean(axis=1)
    block = int(0.05 * SR)
    n = len(mono) // block
    rms = np.sqrt((mono[: n * block].reshape(n, block) ** 2).mean(axis=1))
    return round(float((rms < 10 ** (-50 / 20)).mean()), 3)


def analyze(mp3: Path, ref: np.ndarray, loop: tuple[int, int] | None, body_end: int) -> dict:
    dec = decode(mp3)
    m = measure(mp3)
    rep = {
        "seconds": round(len(dec) / SR, 3),
        "lufs": m["lufs"], "true_peak": m["tp"], "lra": m["lra"],
        "samples_vs_wav": len(dec) - len(ref),
        "offset": encoder_offset(ref, dec),
        "clipped": int((np.abs(dec) >= 0.999).sum()),
        "silence": silence_ratio(dec, body_end),
        "bands_db": spectrum(dec[:body_end]),
        "kbytes": round(mp3.stat().st_size / 1024, 1),
    }
    if loop:
        rep["seam"] = seam(dec, *loop)
        rep["seam_wav"] = seam(ref, *loop)
    return rep
