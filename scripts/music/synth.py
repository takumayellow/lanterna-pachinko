"""録音の元が無い電子音（スーパーソウ・パッド・シンセブラス・矩形波・シンセベース）を numpy で合成する.

折り返し雑音を抑えるため, のこぎり波と矩形波は polyBLEP で角を丸める.
発音ごとの揺らぎ（位相・デチューン）は Voice.seed から決めるので, ループの 2 周は同じ音になる.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import signal

from sampler import SR


def _blep(ph: np.ndarray, dt: float) -> np.ndarray:
    out = np.zeros_like(ph)
    a = ph < dt
    t = ph[a] / dt
    out[a] = t + t - t * t - 1.0
    b = ph > 1.0 - dt
    t = (ph[b] - 1.0) / dt
    out[b] = t * t + t + t + 1.0
    return out


def saw(freq: float, n: int, phase0: float = 0.0) -> np.ndarray:
    dt = freq / SR
    ph = (phase0 + dt * np.arange(n)) % 1.0
    return (2.0 * ph - 1.0 - _blep(ph, dt)).astype(np.float32)


def square(freq: float, n: int, phase0: float = 0.0, width: float = 0.5) -> np.ndarray:
    dt = freq / SR
    ph = (phase0 + dt * np.arange(n)) % 1.0
    ph2 = (ph + 1.0 - width) % 1.0
    y = np.where(ph < width, 1.0, -1.0) + _blep(ph, dt) - _blep(ph2, dt)
    return y.astype(np.float32)


def _lp(x: np.ndarray, hz: float, order: int = 2) -> np.ndarray:
    hz = min(hz, SR * 0.45)
    sos = signal.butter(order, hz, "lowpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0).astype(np.float32)


def _adsr(n: int, on: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    env = np.full(n, s, dtype=np.float32)
    na, nd = max(int(a * SR), 1), max(int(d * SR), 1)
    k = np.arange(n)
    env[k < na] = (k[k < na] / na).astype(np.float32)
    dec = (k >= na) & (k < na + nd)
    env[dec] = 1.0 - (1.0 - s) * ((k[dec] - na) / nd)
    if on < n:
        level = env[min(on, n - 1)]
        rel = np.arange(n - on, dtype=np.float32)
        env[on:] = level * np.exp(-5.0 * rel / max(int(r * SR), 1))
    return env


# 種類ごとの（アタック, ディケイ, サステイン, リリース, ローパス Hz, 音量 dB）
PRESETS = {
    "supersaw": (0.008, 0.3, 0.75, 0.25, 7000.0, 0.0),
    "pad": (0.45, 0.8, 0.85, 1.1, 2600.0, -2.0),
    "strings": (0.25, 0.5, 0.9, 0.6, 3800.0, -1.0),
    "brass": (0.04, 0.35, 0.7, 0.2, 0.0, 0.0),  # ローパスは包絡で開閉する
    "square": (0.005, 0.15, 0.8, 0.12, 6000.0, -3.0),
    "bass": (0.004, 0.25, 0.7, 0.08, 900.0, 0.0),
}


def render(kind: str, pitch: float, dur: float, vel: int, seed: int, cents: float = 0.0) -> np.ndarray:
    """1 音を（サンプル数, 2）で返す（定位は呼び出し側で掛ける）."""
    a, d, s, r, cutoff, gdb = PRESETS[kind]
    f = 440.0 * 2 ** ((pitch - 69 + cents / 100.0) / 12)
    on = int(dur * SR)
    n = on + int(r * 5 * SR) // 2 + 64
    rng = np.random.default_rng(seed & 0xFFFFFFFF)
    if kind in ("supersaw", "pad", "strings"):
        # デチューン（半音）. スーパーソウは ±22 セント, パッドと弦は ±14 セントに広げる
        if kind == "supersaw":
            det = [-0.22, -0.126, -0.038, 0.0, 0.042, 0.122, 0.214]
        else:
            det = [-0.14, -0.04, 0.0, 0.05, 0.13]
        left = np.zeros(n, dtype=np.float32)
        right = np.zeros(n, dtype=np.float32)
        for i, dd in enumerate(det):
            w = saw(f * 2 ** (dd / 12), n, float(rng.random()))
            pan = -0.8 + 1.6 * i / (len(det) - 1)
            left += w * math.cos((pan + 1) * math.pi / 4)
            right += w * math.sin((pan + 1) * math.pi / 4)
        y = np.stack([left, right], axis=1) / math.sqrt(len(det))
        y = _lp(y, cutoff)
    elif kind == "brass":
        w = saw(f, n, float(rng.random())) + 0.7 * saw(f * 1.004, n, float(rng.random()))
        dark = _lp(w, max(f * 2.5, 400.0))
        bright = _lp(w, min(f * 14, 9000.0))
        fenv = _adsr(n, on, 0.06, 0.4, 0.35, r)
        mono = dark + (bright - dark) * fenv * (0.4 + 0.6 * vel / 127.0)
        y = np.stack([mono, mono], axis=1)
    elif kind == "square":
        mono = _lp(square(f, n, float(rng.random()), 0.5), cutoff)
        y = np.stack([mono, mono], axis=1)
    elif kind == "bass":
        w = saw(f, n, 0.0) * 0.7 + np.sin(2 * np.pi * f * np.arange(n) / SR).astype(np.float32)
        mono = _lp(w, cutoff + 1200 * vel / 127.0)
        y = np.stack([mono, mono], axis=1)
    else:
        raise ValueError(kind)
    env = _adsr(n, on, a, d, s, r)
    rms = float(np.sqrt((y[: max(on, 1)] ** 2).mean())) or 1e-6
    g = 10 ** ((-18 + gdb + 18 * (vel / 127.0 - 1.0)) / 20) / rms
    return (y * env[:, None] * np.float32(g)).astype(np.float32)
