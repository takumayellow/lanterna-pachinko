"""パート全体に掛ける効果（ギターアンプ・ベースの歪み・声のこもり・ピアノの明るさ）.

録音は DI（ライン直結）なので, ギターはここでアンプとスピーカーの箱の特性を真似る:
入力の高域を持ち上げ → tanh で歪ませ → 箱の帯域（およそ 90 Hz〜5 kHz）に絞る.
"""

from __future__ import annotations

import numpy as np
from scipy import signal

from sampler import SR


def _sos(kind: str, hz, order: int = 2) -> np.ndarray:
    return signal.butter(order, hz, kind, fs=SR, output="sos")


def _filt(x: np.ndarray, sos: np.ndarray) -> np.ndarray:
    return signal.sosfilt(sos, x, axis=0).astype(np.float32)


def _peak(x: np.ndarray, hz: float, q: float, db: float) -> np.ndarray:
    b, a = _peak_coeffs(hz, q, db)
    return signal.lfilter(b, a, x, axis=0).astype(np.float32)


def _peak_coeffs(hz: float, q: float, db: float):
    big_a = 10 ** (db / 40)
    w = 2 * np.pi * hz / SR
    alpha = np.sin(w) / (2 * q)
    b = np.array([1 + alpha * big_a, -2 * np.cos(w), 1 - alpha * big_a])
    a = np.array([1 + alpha / big_a, -2 * np.cos(w), 1 - alpha / big_a])
    return b / a[0], a / a[0]


def _rms(x: np.ndarray) -> float:
    return float(np.sqrt((x ** 2).mean())) or 1e-9


def _level(x: np.ndarray) -> float:
    """鳴っている部分の振幅の目安（休みの長さに左右されないよう, 0 でない標本の 99 パーセンタイル）."""
    a = np.abs(x[np.abs(x) > 1e-6])
    return float(np.percentile(a, 99)) if len(a) else 1e-9


def amp(x: np.ndarray, drive: float, tone_hz: float = 4800.0) -> np.ndarray:
    ref = _rms(x)
    y = _filt(x, _sos("highpass", 110.0))
    y = _peak(y, 900.0, 0.7, 6.0 if drive > 4 else 3.0)  # 歪ませる前に中域を持ち上げる
    y = y / _level(y)
    y = np.tanh(drive * y) / np.tanh(drive)
    if drive > 4:
        y = np.tanh(1.8 * y)  # 2 段目（ハイゲイン）
    y = _filt(y, _sos("highpass", 90.0))
    y = _filt(y, _sos("lowpass", tone_hz, order=4))
    y = _peak(y, 420.0, 1.0, -3.0)  # 箱鳴りのこもりを抜く
    y = _peak(y, 2600.0, 1.2, 2.5)
    return y * np.float32(ref / _rms(y))


def bass_drive(x: np.ndarray, drive: float = 1.8, bright: float = 0.0) -> np.ndarray:
    ref = _rms(x)
    y = np.tanh(drive * x / _level(x))
    y = _filt(y, _sos("lowpass", 3500.0 + bright))
    if bright:
        y = _peak(y, 1800.0, 1.0, 4.0)
    return y * np.float32(ref / _rms(y))


POST = {
    "amp_dist": lambda x: amp(x, 14.0, 5200.0),
    "amp_od": lambda x: amp(x, 5.0, 5000.0),
    "amp_clean": lambda x: amp(x, 1.2, 6500.0),
    "bass_drive": lambda x: bass_drive(x, 1.6),
    "bass_pick": lambda x: bass_drive(x, 2.2, 1500.0),
    "lowpass_oohs": lambda x: _filt(x, _sos("lowpass", 2500.0)),
    "bright": lambda x: _peak(x, 5000.0, 0.6, 4.0),
}


def apply(name: str, x: np.ndarray) -> np.ndarray:
    if not name:
        return x
    if not np.any(x):
        return x
    return POST[name](x)
