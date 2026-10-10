"""ステムを混ぜる: 音量合わせ・パン・ハイパス・サイドチェイン・リバーブ.

ループ曲は 2 周ぶん鳴らしたものを処理してから 2 周目だけを切り出す. こうすると 2 周目の頭に
1 周目の余韻（音の減衰・リバーブ）が入り, 切り出した 1 周ぶんを繰り返したときに継ぎ目が出ない.
"""

from __future__ import annotations

import numpy as np
from scipy import signal

from arrange import Song
from render import SR

STEM_REF_DB = -20.0  # 各ステムをこの RMS にそろえてから Part.level を掛ける


def beats_to_samples(song: Song, beats: float) -> int:
    return int(round(beats * 60.0 / song.bpm * SR))


def _active_rms_db(x: np.ndarray) -> float:
    mono = x.mean(axis=1)
    block = SR // 5
    n = len(mono) // block
    if n == 0:
        return -120.0
    pw = (mono[: n * block].reshape(n, block) ** 2).mean(axis=1)
    peak = pw.max()
    if peak <= 0:
        return -120.0
    loud = pw[pw > peak * 1e-3]  # 最大から -30 dB 以内のブロックだけ（休みの区間で薄まらない）
    return 10 * np.log10(loud.mean())


def _highpass(x: np.ndarray, hz: float) -> np.ndarray:
    sos = signal.butter(2, hz, "highpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0).astype(np.float32)


def _pan(x: np.ndarray, pan: float) -> np.ndarray:
    a = (pan + 1) * np.pi / 4
    g = np.array([np.cos(a), np.sin(a)]) * np.sqrt(2)
    return (x * g[None, :]).astype(np.float32)


def _duck_env(song: Song, length: int, depth: float) -> np.ndarray:
    """キックのたびに depth だけ沈んで戻る包絡. 拍位置から直接作るので周期的になる."""
    env = np.ones(length, dtype=np.float32)
    beat = 60.0 / song.bpm
    tau = 0.28 * beat
    shape_len = int(beat * SR)
    k = np.arange(shape_len) / SR
    attack = np.minimum(k / 0.004, 1.0)
    dip = depth * attack * np.exp(-k / tau) + depth * (1 - attack)
    passes = 2 if song.loop else 1
    for p in range(passes):
        for t in song.kick_times:
            s = beats_to_samples(song, t + p * song.beats)
            e = min(s + shape_len, length)
            if s < length:
                env[s:e] = np.minimum(env[s:e], 1 - dip[: e - s])
    return env


def _sub_kick(song: Song, length: int) -> np.ndarray:
    """キックの位置に合成のサブ（110→48 Hz の掃引 + 減衰）を置く. 生ドラムの音源は低域が軽いので補う."""
    dur = int(0.32 * SR)
    t = np.arange(dur) / SR
    freq = 48 + 62 * np.exp(-t / 0.035)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    hit = np.sin(phase) * np.exp(-t / 0.13) * np.minimum(t / 0.002, 1)
    out = np.zeros(length, dtype=np.float32)
    passes = 2 if song.loop else 1
    for p in range(passes):
        for tk in song.kick_times:
            s = beats_to_samples(song, tk + p * song.beats)
            e = min(s + dur, length)
            if s < length:
                out[s:e] += hit[: e - s]
    return np.stack([out, out], axis=1)


def _reverb_ir(rt60: float, seed: int = 7) -> np.ndarray:
    """初期反射 + 帯域ごとに減衰の速さが違う（高域ほど早く消える）ステレオのノイズ残響."""
    rng = np.random.default_rng(seed)
    n = int(rt60 * 1.3 * SR)
    t = np.arange(n) / SR
    pre = int(0.022 * SR)
    ir = np.zeros((n + pre, 2), dtype=np.float64)
    bands = [(None, 400, 1.15), (400, 4000, 1.0), (4000, None, 0.5)]
    for ch in range(2):
        noise = rng.standard_normal(n)
        acc = np.zeros(n)
        for lo, hi, mul in bands:
            if lo is None:
                sos = signal.butter(2, hi, "lowpass", fs=SR, output="sos")
            elif hi is None:
                sos = signal.butter(2, lo, "highpass", fs=SR, output="sos")
            else:
                sos = signal.butter(2, [lo, hi], "bandpass", fs=SR, output="sos")
            acc += signal.sosfilt(sos, noise) * np.exp(-6.9 * t / (rt60 * mul))
        acc *= np.minimum(t / 0.01, 1.0)  # 立ち上がりを丸める
        acc /= np.sqrt((acc ** 2).sum())
        ir[pre:, ch] = acc
        # 初期反射: 5〜80 ms に左右で違う時刻の反射を 20 本（ホールの壁と天井の跳ね返り）
        taps = np.sort(rng.uniform(0.005, 0.08, 20))
        gains = rng.choice([-1.0, 1.0], 20) * np.exp(-taps / 0.045) * rng.uniform(0.5, 1.0, 20)
        er = np.zeros(len(ir))
        er[(taps * SR).astype(int)] = gains
        er = signal.sosfilt(signal.butter(2, 6000, "lowpass", fs=SR, output="sos"), er)
        ir[:, ch] += er / np.sqrt((er ** 2).sum()) * 0.6
    ir /= np.sqrt((ir ** 2).sum(axis=0, keepdims=True))
    return ir.astype(np.float32)


def mix_song(song: Song, stems: dict[str, np.ndarray]) -> np.ndarray:
    """ステムを混ぜ, ループ曲は 1 周ぶん（周期的）, ワンショットは余韻込みの全体を返す."""
    period = beats_to_samples(song, song.beats)
    if song.loop:
        length = 2 * period + SR  # 2 周 + 少し
    else:
        length = beats_to_samples(song, song.beats + song.tail_beats)
    dry = np.zeros((length, 2), dtype=np.float32)
    send = np.zeros((length, 2), dtype=np.float32)

    for part in song.parts:
        x = stems[part.name]
        x = np.pad(x, ((0, max(0, length - len(x))), (0, 0)))[:length]
        if part.hp:
            x = _highpass(x, part.hp)
        rms = _active_rms_db(x)
        if rms < -100:
            continue
        x = x * np.float32(10 ** ((STEM_REF_DB - rms + part.level) / 20))
        x = _pan(x, part.pan)
        if part.duck:
            x = x * _duck_env(song, length, part.duck)[:, None]
        dry += x
        send += x * np.float32(part.reverb)

    if song.sub_kick is not None and song.kick_times:
        sub = _sub_kick(song, length)
        dry += sub * np.float32(10 ** ((STEM_REF_DB + song.sub_kick) / 20) / 0.25)

    ir = _reverb_ir(song.reverb_rt)
    send = _highpass(send, 220.0)
    wet = np.stack([signal.oaconvolve(send[:, c], ir[:, c])[:length] for c in range(2)], axis=1)
    sos = signal.butter(2, 9000, "lowpass", fs=SR, output="sos")
    wet = signal.sosfilt(sos, wet, axis=0)
    out = dry + wet.astype(np.float32)

    if song.loop:
        return out[period: 2 * period]
    fade = int(0.4 * SR)
    out[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)[:, None] ** 2
    return out
