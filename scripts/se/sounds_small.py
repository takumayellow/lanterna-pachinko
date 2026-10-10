"""盤面・UI 系の小さい SE．各関数は rng を受け取りステレオ (2, N) を返す（音量は build 側で決める）."""
from __future__ import annotations

import numpy as np

from dsp import (Canvas, ad, bp, boom, click, decay, fm, hp, lin, lp, make_ir, metal_hit, modal, noise,
                 osc, pan, reverb, sparkle, sweep, tt, vfilter, drive, glide, const, tremolo)


def launch(rng):
    """発射の「カシュッ」: バネの小さなクリック + 高域ノイズの短い吹き."""
    c = Canvas(0.09)
    c.add(click(0.02, rng, 2500, 7000, 0.006), gain=0.7)
    hiss = hp(noise(0.08, rng), 3000) * ad(0.08, 0.004, 0.05)
    c.add(lp(hiss, 9000), at=0.003, gain=0.5)
    c.add(modal([1850, 4100], [0.02, 0.012], [0.3, 0.2], 0.04, rng), gain=0.6)
    return c.out


def nail(rng, variant: int):
    """釘に当たる金属音: 高域のモード 3〜5 本が 15〜40 ms で消える."""
    base = [3200, 3900, 2700, 4600][variant]
    k = rng.integers(3, 6)
    freqs = base * np.array([1, 2.41, 3.87, 5.2, 6.9])[:k] * rng.uniform(0.97, 1.03, k)
    t60s = rng.uniform(0.018, 0.045, k)
    amps = 1 / np.arange(1, k + 1) ** 0.6
    body = modal(freqs, t60s, amps, 0.07, rng, attack=0.0002)
    c = Canvas(0.07)
    c.add(body, p=rng.uniform(-0.3, 0.3))
    c.add(click(0.006, rng, 5000, 14000, 0.002), gain=0.5)
    return c.out


def heso_in(rng):
    """ヘソ入賞の「ピロン」: FM ベルで上行 2 音（E6 → B6）."""
    c = Canvas(0.6)
    for at, f in [(0.0, 1318.5), (0.075, 1975.5)]:
        tone = fm(const(f, 0.45), 2.0, 1.2 * decay(0.45, 0.25)) * ad(0.45, 0.002, 0.35)
        c.add(tone + 0.3 * osc(const(f * 2, 0.45)) * ad(0.45, 0.001, 0.12), at=at)
    return reverb(c.out, make_ir(0.6, rng), 0.18)


def payout(rng):
    """払い出しの「ジャラジャラ」: 玉同士の金属の粒を密度の山に沿って散らす + 低いガラガラ."""
    dur = 0.85
    n = len(tt(dur))
    out = np.zeros((2, n))
    density = np.interp(np.arange(n) / 48000, [0, 0.08, 0.6, dur], [0.2, 1.0, 0.8, 0.0])
    count = 110
    for i in range(count):
        s = 0 if i == 0 else int(rng.uniform(0, n - 2400))
        if i and rng.uniform() > density[s]:
            continue
        f = rng.uniform(2200, 5200)
        grain = modal(f * np.array([1, 2.32, 3.7]), rng.uniform(0.01, 0.035, 3), [1, 0.5, 0.3], 0.05, rng, 0.0002)
        out[:, s:s + len(grain)] += pan(grain * rng.uniform(0.3, 1), rng.uniform(-0.8, 0.8))
    rattle = bp(noise(dur, rng), 400, 2200) * np.interp(np.arange(n) / 48000, [0, 0.05, 0.7, dur], [0, 0.35, 0.25, 0])
    out += pan(rattle * tremolo(n, 37, 0.7), 0.0)
    return reverb(out, make_ir(0.35, rng), 0.12)


def attacker_in(rng):
    """アタッカー入賞の明るい「ピン」: 高い FM ベル + 1 オクターブ上の倍音."""
    d = 0.5
    f = 2093.0
    tone = fm(const(f, d), 3.5, 2.0 * decay(d, 0.08)) * ad(d, 0.001, 0.3)
    tone += 0.35 * osc(const(f * 2, d)) * ad(d, 0.001, 0.15)
    c = Canvas(d).add(tone).add(click(0.01, rng, 6000, 14000, 0.003), gain=0.3)
    return reverb(c.out, make_ir(0.5, rng), 0.15)


def _chime(f, d, bright=1.0, t60=0.4):
    return (fm(const(f, d), 2.0, bright * 1.5 * decay(d, t60 * 0.4)) * ad(d, 0.002, t60)
            + 0.25 * osc(const(f * 3, d)) * ad(d, 0.001, t60 * 0.3))


def hold(rng, color: str):
    """保留が増えた音．白=単音，青=2 音，緑=3 音，赤=3 音 + 低音の芯 + 歪み，虹=上行グリッサンド + 煌めき + 重低音."""
    if color == "white":
        c = Canvas(0.35).add(_chime(1568.0, 0.3, 0.6, 0.18))
        return reverb(c.out, make_ir(0.3, rng), 0.1)
    if color == "blue":
        c = Canvas(0.6)
        for i, f in enumerate([1318.5, 1760.0]):
            c.add(_chime(f, 0.45, 0.9, 0.3), at=i * 0.06, p=(-0.3, 0.3)[i])
        return reverb(c.out, make_ir(0.6, rng), 0.2)
    if color == "green":
        c = Canvas(0.8)
        for i, f in enumerate([1318.5, 1661.2, 1975.5]):
            c.add(_chime(f, 0.55, 1.1, 0.35), at=i * 0.055, p=(-0.4, 0, 0.4)[i])
        c.add(sparkle(0.6, rng, 18, 4000, 9000, 0.08), at=0.1, gain=0.25)
        return reverb(c.out, make_ir(0.8, rng), 0.22)
    if color == "red":
        c = Canvas(1.1)
        c.add(boom(0.6, 160, 55, 0.12, 0.35, 2.5), gain=0.9)
        brass = drive(osc(sweep(220, 440, 0.7, 0.06), "saw") * ad(0.7, 0.005, 0.5), 3.0)
        c.add(lp(brass, 3500), gain=0.35)
        for i, f in enumerate([880.0, 1108.7, 1318.5, 1760.0]):
            c.add(_chime(f, 0.7, 1.4, 0.45), at=0.02 + i * 0.045, p=(-0.5, -0.15, 0.15, 0.5)[i], gain=0.7)
        return reverb(c.out, make_ir(1.1, rng), 0.25)
    if color == "rainbow":
        return _hold_rainbow(rng)
    raise ValueError(color)


def _hold_rainbow(rng):
    d = 1.9
    c = Canvas(d)
    # 重い低音: ピッチが落ちるサブ + 歪ませた倍音の芯
    c.add(boom(1.4, 140, 38, 0.25, 0.9, 3.0), gain=1.0)
    c.add(lp(boom(0.5, 400, 90, 0.05, 0.2, 4.0), 2500), gain=0.35)
    # 上行グリッサンド（2 オクターブ半を 0.35 秒で駆け上がる FM の束）
    gl = glide([(0, 600), (0.35, 3200), (d, 3400)], d)
    lead = fm(gl, 2.0, 1.0) * ad(d, 0.01, 1.0)
    c.add(pan(lead, -0.3), gain=0.22).add(pan(fm(gl * 1.5, 2.0, 0.8) * ad(d, 0.01, 0.9), 0.3), gain=0.16)
    # 和音のベル（ペンタトニックの 5 音）
    for i, f in enumerate([1046.5, 1318.5, 1568.0, 2093.0, 2637.0]):
        c.add(_chime(f, 1.2, 1.6, 0.8), at=0.04 + i * 0.04, p=np.linspace(-0.7, 0.7, 5)[i], gain=0.45)
    # 煌めき（前半に密）
    env = np.interp(tt(d), [0, 0.15, 1.2, d], [0.3, 1.0, 0.4, 0.0])
    c.add(sparkle(d, rng, 70, 4000, 12000, 0.15, env), gain=0.4)
    return reverb(c.out, make_ir(1.8, rng, predelay=0.02), 0.3)


def hold_change(rng):
    """保留変化「キュイン」: 短い急上昇の音（キュインの縮小版）+ 煌めき."""
    d = 1.0
    f = glide([(0, 800), (0.14, 2600), (d, 2750)], d)
    env = ad(d, 0.005, 0.7)
    c = Canvas(d)
    c.add(osc(f, "square") * env, gain=0.18, p=-0.2)
    c.add(osc(f * 1.005, "saw") * env, gain=0.2, p=0.2)
    c.add(osc(f * 2) * env, gain=0.25)
    c.add(sparkle(0.9, rng, 45, 4500, 11000, 0.12), at=0.08, gain=0.35)
    c.add(boom(0.25, 200, 70, 0.05, 0.15, 2.0), gain=0.4)
    out = lp(c.out, 12000)
    return reverb(out, make_ir(1.0, rng), 0.25)


def reel_stop(rng, center: bool):
    """図柄停止の「カッ」: 短いノイズ + 樹脂の共鳴．center は低い芯と残響を足して重く."""
    d = 0.25 if center else 0.12
    c = Canvas(d)
    c.add(click(0.03, rng, 1500, 5000, 0.012))
    c.add(modal([920, 2310, 3700], [0.05, 0.03, 0.02], [0.6, 0.35, 0.2], 0.08, rng), gain=0.7)
    if center:
        c.add(boom(0.2, 180, 70, 0.03, 0.12, 2.5), gain=0.9)
        c.add(modal([620, 1490], [0.09, 0.06], [0.5, 0.3], 0.15, rng), gain=0.5)
        return reverb(c.out, make_ir(0.5, rng), 0.15)
    return c.out


def denchu_open(rng):
    """電チュー開放の「カシャ」: 2 つの機械音のクリック + 短いノイズ."""
    c = Canvas(0.2)
    c.add(click(0.03, rng, 1800, 6000, 0.01))
    c.add(modal([1450, 3200], [0.03, 0.02], [0.5, 0.3], 0.05, rng), gain=0.6)
    c.add(click(0.05, rng, 3000, 9000, 0.02), at=0.045, gain=0.7)
    c.add(hp(noise(0.08, rng), 4000) * ad(0.08, 0.002, 0.04), at=0.05, gain=0.3)
    return c.out


def count_tick(rng):
    """残り回転カウントの「チッ」: 6 kHz 付近の極短いクリック."""
    c = Canvas(0.04)
    c.add(click(0.03, rng, 4500, 11000, 0.008))
    c.add(modal([6200], [0.015], [0.4], 0.03, rng), gain=0.6)
    return c.out


def miss(rng):
    """ハズレの鈍い「ブッ」: 下がる矩形波を低域通過 + 柔らかいノイズ."""
    d = 0.35
    f = sweep(130, 85, d, 0.25)
    y = lp(osc(f, "square"), 700) * ad(d, 0.005, 0.25)
    y += 0.2 * lp(noise(d, rng), 500) * ad(d, 0.003, 0.1)
    return pan(y, 0.0)


def round_start(rng):
    """ラウンド開始のチャイム: 長三和音の上行（C6-E6-G6-C7）+ 最後に和音で伸ばす."""
    d = 1.6
    c = Canvas(d)
    notes = [1046.5, 1318.5, 1568.0, 2093.0]
    for i, f in enumerate(notes):
        c.add(_chime(f, 0.5, 1.2, 0.3), at=i * 0.09, p=(-0.5, -0.15, 0.15, 0.5)[i], gain=0.7)
    for i, f in enumerate(notes):
        c.add(_chime(f, 1.2, 1.0, 0.9), at=0.36, p=(-0.6, -0.2, 0.2, 0.6)[i], gain=0.45)
    c.add(sparkle(1.0, rng, 25, 4500, 10000, 0.12), at=0.36, gain=0.25)
    return reverb(c.out, make_ir(1.2, rng), 0.25)
