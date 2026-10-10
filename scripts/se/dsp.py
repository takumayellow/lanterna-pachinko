"""SE 合成用の DSP 部品（48 kHz・float64・モノラルは (N,)・ステレオは (2, N)）."""
from __future__ import annotations

import numpy as np
from scipy import signal

SR = 48000
NYQ = SR / 2


def n_of(sec: float) -> int:
    return max(1, int(round(sec * SR)))


def tt(dur: float) -> np.ndarray:
    return np.arange(n_of(dur)) / SR


# ---------------------------------------------------------------- 周波数・エンベロープ

def const(v: float, dur: float) -> np.ndarray:
    return np.full(n_of(dur), float(v))


def sweep(f0: float, f1: float, dur: float, t_sweep: float, curve: float = 1.0) -> np.ndarray:
    """f0 → f1 へ t_sweep 秒で指数的に動き，その後は f1 に留まる周波数列."""
    x = np.clip(tt(dur) / max(t_sweep, 1e-6), 0, 1) ** curve
    return f0 * (f1 / f0) ** x


def glide(points: list[tuple[float, float]], dur: float) -> np.ndarray:
    """(時刻, 値) の折れ線を対数補間（値は正）."""
    ts, vs = zip(*points)
    return np.exp(np.interp(tt(dur), ts, np.log(vs)))


def lin(points: list[tuple[float, float]], dur: float) -> np.ndarray:
    ts, vs = zip(*points)
    return np.interp(tt(dur), ts, vs)


def decay(dur: float, t60: float) -> np.ndarray:
    return 10 ** (-3 * tt(dur) / max(t60, 1e-4))


def ad(dur: float, attack: float, t60: float) -> np.ndarray:
    t = tt(dur)
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    d = 10 ** (-3 * np.maximum(t - attack, 0) / max(t60, 1e-4))
    return a * d


def ahd(dur: float, attack: float, hold: float, t60: float) -> np.ndarray:
    t = tt(dur)
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    d = 10 ** (-3 * np.maximum(t - attack - hold, 0) / max(t60, 1e-4))
    return a * d


def fade(x: np.ndarray, fin: float = 0.0, fout: float = 0.0) -> np.ndarray:
    y = np.array(x, dtype=float)
    n = y.shape[-1]
    if fin > 0:
        k = min(n, n_of(fin))
        y[..., :k] *= np.linspace(0, 1, k)
    if fout > 0:
        k = min(n, n_of(fout))
        y[..., n - k:] *= np.linspace(1, 0, k) ** 2
    return y


# ---------------------------------------------------------------- 発振器

def _phase(freq: np.ndarray, phase0: float = 0.0) -> np.ndarray:
    return phase0 + 2 * np.pi * np.cumsum(freq) / SR


def _polyblep(t: np.ndarray, dt: np.ndarray) -> np.ndarray:
    out = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    out[m] = x + x - x * x - 1
    m2 = t > 1 - dt
    x = (t[m2] - 1) / dt[m2]
    out[m2] = x * x + x + x + 1
    return out


def osc(freq: np.ndarray, kind: str = "sine", phase0: float = 0.0, pm: np.ndarray | None = None) -> np.ndarray:
    """基本波形（saw / square は polyBLEP で帯域制限，tri は素朴な形で低音用）．pm は位相変調（rad）."""
    freq = np.asarray(freq, dtype=float)
    ph = _phase(freq, phase0)
    if pm is not None:
        ph = ph + pm
    if kind == "sine":
        return np.sin(ph)
    t = np.mod(ph / (2 * np.pi), 1.0)
    dt = np.clip(np.abs(freq) / SR, 1e-7, 0.5)
    if kind == "saw":
        return 2 * t - 1 - _polyblep(t, dt)
    if kind == "square":
        sq = np.where(t < 0.5, 1.0, -1.0)
        return sq + _polyblep(t, dt) - _polyblep(np.mod(t + 0.5, 1.0), dt)
    if kind == "tri":
        return 2 * np.abs(2 * t - 1) - 1
    raise ValueError(kind)


def fm(carrier: np.ndarray, ratio: float, index: np.ndarray | float, kind: str = "sine") -> np.ndarray:
    mod = np.sin(_phase(carrier * ratio)) * index
    return osc(carrier, kind, pm=mod)


def unison(freq: np.ndarray, kind: str, voices: int, cents: float, rng: np.random.Generator,
           spread: float = 0.8) -> np.ndarray:
    """デチューンした複数声をステレオに広げる."""
    out = np.zeros((2, len(freq)))
    for i in range(voices):
        pos = (i / (voices - 1) * 2 - 1) if voices > 1 else 0.0
        det = 2 ** (pos * cents / 1200)
        out += pan(osc(freq * det, kind, phase0=rng.uniform(0, 2 * np.pi)), pos * spread)
    return out / np.sqrt(voices)


# ---------------------------------------------------------------- ノイズ

def noise(dur: float, rng: np.random.Generator) -> np.ndarray:
    return rng.standard_normal(n_of(dur))


def pink(dur: float, rng: np.random.Generator) -> np.ndarray:
    n = n_of(dur)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec[1:] /= np.sqrt(f[1:])
    spec[0] = 0
    y = np.fft.irfft(spec, n)
    return y / (np.std(y) + 1e-12)


# ---------------------------------------------------------------- フィルタ

def _sos(kind: str, fc, order: int):
    if kind == "band":
        lo, hi = fc
        return signal.butter(order, [max(lo, 10) / NYQ, min(hi, NYQ * 0.98) / NYQ], "bandpass", output="sos")
    return signal.butter(order, min(fc, NYQ * 0.98) / NYQ, kind, output="sos")


def lp(x, fc, order=2):
    return signal.sosfilt(_sos("lowpass", fc, order), x, axis=-1)


def hp(x, fc, order=2):
    return signal.sosfilt(_sos("highpass", fc, order), x, axis=-1)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(_sos("band", (lo, hi), order), x, axis=-1)


def _rbj(mode: str, fc: float, q: float):
    w = 2 * np.pi * min(fc, NYQ * 0.95) / SR
    cw, sw = np.cos(w), np.sin(w)
    alpha = sw / (2 * q)
    if mode == "lp":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
    elif mode == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
    else:  # bp（ピーク 0 dB）
        b = [alpha, 0, -alpha]
    a = [1 + alpha, -2 * cw, 1 - alpha]
    return np.array(b) / a[0], np.array(a) / a[0]


def vfilter(x: np.ndarray, fc: np.ndarray, q: float = 0.707, mode: str = "lp", block: int = 64) -> np.ndarray:
    """カットオフが時間変化する 2 次フィルタ（ブロックごとに係数を更新）."""
    if x.ndim == 2:
        return np.stack([vfilter(ch, fc, q, mode, block) for ch in x])
    y = np.zeros_like(x)
    zi = np.zeros(2)
    for s in range(0, len(x), block):
        e = min(len(x), s + block)
        b, a = _rbj(mode, float(fc[min(len(fc) - 1, (s + e) // 2)]), q)
        y[s:e], zi = signal.lfilter(b, a, x[s:e], zi=zi)
    return y


# ---------------------------------------------------------------- 歪み・変調

def drive(x, g: float):
    return np.tanh(g * x) / np.tanh(g)


def fold(x, g: float):
    return np.sin(g * x * np.pi / 2)


def tremolo(n: int, rate: float, depth: float, phase0: float = 0.0) -> np.ndarray:
    t = np.arange(n) / SR
    return 1 - depth * 0.5 * (1 - np.cos(2 * np.pi * rate * t + phase0))


def vibrato(freq: np.ndarray, rate: float, cents: float, onset: float = 0.0) -> np.ndarray:
    t = np.arange(len(freq)) / SR
    ramp = np.clip((t - onset) / 0.15, 0, 1)
    return freq * 2 ** (ramp * cents / 1200 * np.sin(2 * np.pi * rate * t))


# ---------------------------------------------------------------- 物理っぽい音源

def modal(freqs, t60s, amps, dur: float, rng: np.random.Generator, attack: float = 0.0005) -> np.ndarray:
    """減衰する正弦波（モード）の和．金属・ベル・板の打撃."""
    t = tt(dur)
    y = np.zeros_like(t)
    for f, t60, a in zip(freqs, t60s, amps):
        if f >= NYQ * 0.95:
            continue
        y += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)) * 10 ** (-3 * t / t60)
    return y * np.clip(t / attack, 0, 1)


def metal_hit(dur: float, f0: float, rng: np.random.Generator, n: int = 14, t60: float = 0.6,
              spread: float = 3.2, bright: float = 0.6) -> np.ndarray:
    """非整数次の倍音を持つ金属打撃（高い倍音ほど早く減衰）."""
    ratios = 1 + np.sort(rng.uniform(0, spread, n)) ** 1.6
    freqs = f0 * np.concatenate([[1.0], ratios])
    amps = (1 / np.arange(1, n + 2)) ** (1 - bright) * rng.uniform(0.5, 1, n + 1)
    t60s = t60 * (f0 / freqs) ** 0.5 * rng.uniform(0.6, 1.2, n + 1)
    return modal(freqs, t60s, amps, dur, rng)


def click(dur: float, rng: np.random.Generator, lo: float, hi: float, t60: float = 0.01) -> np.ndarray:
    return bp(noise(dur, rng), lo, hi, 2) * decay(dur, t60)


def boom(dur: float, f0: float, f1: float, t_drop: float, t60: float, drive_g: float = 1.0) -> np.ndarray:
    """ピッチが落ちるサイン（キック／ドーン）．drive_g>1 で倍音を足し小型スピーカーでも聞こえるように."""
    y = osc(sweep(f0, f1, dur, t_drop, 0.5)) * ad(dur, 0.002, t60)
    return drive(y, drive_g) if drive_g > 1 else y


def whoosh(dur: float, rng: np.random.Generator, f0: float, f1: float, q: float = 1.2,
           swell: float = 2.0) -> np.ndarray:
    """帯域が移動するノイズ（風切り）．終端に向けて膨らむ."""
    fc = sweep(f0, f1, dur, dur, 1.0)
    env = (0.15 + 0.85 * np.linspace(0, 1, n_of(dur)) ** swell)
    return vfilter(noise(dur, rng), fc, q, "bp") * env


def sparkle(dur: float, rng: np.random.Generator, rate: float, fmin: float = 3500, fmax: float = 11000,
            t60: float = 0.12, env: np.ndarray | None = None) -> np.ndarray:
    """ランダムに散らばる短い高音のピン（煌めき）．ステレオ."""
    n = n_of(dur)
    out = np.zeros((2, n))
    count = rng.poisson(rate * dur)
    plen = n_of(t60 * 1.2)
    tp = np.arange(plen) / SR
    for _ in range(count):
        s = int(rng.uniform(0, n - 1))
        f = np.exp(rng.uniform(np.log(fmin), np.log(fmax)))
        ping = (np.sin(2 * np.pi * f * tp) + 0.35 * np.sin(2 * np.pi * f * 2.76 * tp)) * 10 ** (-3 * tp / t60)
        amp = rng.uniform(0.3, 1.0) * (env[s] if env is not None else 1.0)
        e = min(n, s + plen)
        out[:, s:e] += pan(ping[: e - s] * amp, rng.uniform(-0.9, 0.9))
    return out


# ---------------------------------------------------------------- 空間

def pan(x: np.ndarray, p: float) -> np.ndarray:
    if x.ndim == 2:
        return x
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)]) * np.sqrt(2)


def to_stereo(x: np.ndarray) -> np.ndarray:
    return x if x.ndim == 2 else np.stack([x, x])


def make_ir(rt60: float, rng: np.random.Generator, predelay: float = 0.01, damp: float = 0.45,
            early: int = 10, room: float = 0.04) -> np.ndarray:
    """合成インパルス応答（ステレオ）．高域ほど早く減衰させ，初期反射を足す."""
    dur = rt60 * 1.1 + predelay
    n = n_of(dur)
    t = np.arange(n) / SR
    ir = np.zeros((2, n))
    for ch in range(2):
        w = rng.standard_normal(n)
        lo = lp(w, 900) * 10 ** (-3 * t / rt60)
        mid = bp(w, 900, 4500) * 10 ** (-3 * t / (rt60 * (1 - damp * 0.5)))
        hi = hp(w, 4500) * 10 ** (-3 * t / (rt60 * (1 - damp)))
        tail = (lo + 0.8 * mid + 0.5 * hi) * np.clip((t - predelay) / 0.03, 0, 1)
        for _ in range(early):
            d = predelay + rng.uniform(0.002, room)
            k = int(d * SR)
            if k < n:
                tail[k] += rng.uniform(-1, 1) * 3.0 * np.exp(-d / room)
        ir[ch] = tail
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def reverb(x: np.ndarray, ir: np.ndarray, wet: float, dry: float = 1.0) -> np.ndarray:
    xs = to_stereo(x)
    n = xs.shape[1] + ir.shape[1] - 1
    out = np.zeros((2, n))
    out[:, : xs.shape[1]] += xs * dry
    for ch in range(2):
        out[ch] += signal.fftconvolve(xs[ch], ir[ch]) * wet
    return out


# ---------------------------------------------------------------- 配置

class Canvas:
    """時刻を指定して層を重ねるステレオのバッファ."""

    def __init__(self, dur: float):
        self.buf = np.zeros((2, n_of(dur)))

    def add(self, sig: np.ndarray, at: float = 0.0, gain: float = 1.0, p: float = 0.0) -> "Canvas":
        s = pan(np.asarray(sig, dtype=float), p) * gain
        k = int(round(at * SR))
        need = k + s.shape[1]
        if need > self.buf.shape[1]:
            self.buf = np.pad(self.buf, ((0, 0), (0, need - self.buf.shape[1])))
        self.buf[:, k:need] += s
        return self

    @property
    def out(self) -> np.ndarray:
        return self.buf
