"""演出の大きい SE（キュイン・激熱・ボタン・カットイン・リーチ・フリーズ 等）."""
from __future__ import annotations

import numpy as np

from dsp import (Canvas, ad, ahd, bp, boom, click, decay, drive, fm, glide, hp, lin, lp, make_ir, metal_hit,
                 modal, noise, osc, pan, pink, reverb, sparkle, sweep, tremolo, tt, unison, vfilter, vibrato,
                 whoosh, n_of, const, fade)


def kyuin(rng):
    """当たり確定の「キュイーン」.

    0〜0.28 s で 520 Hz → 3.1 kHz へ鋭く上がり，その後も 3.3 kHz までわずかに上がり続けて伸びる．
    主音（矩形 + ノコギリのユニゾン）・1 オクターブ上のサイン・5 度上の FM・帯域ノイズの息・
    頭の低い衝撃・煌めき・長い残響を重ねる．速いトレモロ（電子的な揺れ）とビブラート付き.
    """
    d = 2.2
    rise = glide([(0, 520), (0.08, 900), (0.28, 3100), (1.2, 3250), (d, 3350)], d)
    f = vibrato(rise, 6.5, 18, onset=0.35)
    amp = ahd(d, 0.004, 1.0, 1.4)
    trem = tremolo(len(f), 28, 0.25)
    c = Canvas(d)
    c.add(unison(f, "square", 3, 9, rng) * amp * trem, gain=0.16)
    c.add(unison(f, "saw", 4, 14, rng) * amp * trem, gain=0.16)
    c.add(pan(osc(f * 2) * amp * trem, 0.0), gain=0.28)
    c.add(pan(fm(f * 1.5, 2.0, 0.9) * amp, 0.25), gain=0.12)
    c.add(pan(osc(f * 0.5, "tri") * amp, -0.25), gain=0.18)
    breath = vfilter(noise(d, rng), f * 1.2, 4.0, "bp") * ahd(d, 0.02, 0.6, 0.8)
    c.add(pan(breath, 0.0), gain=0.35)
    # 頭の衝撃（体に響く芯）
    c.add(boom(0.7, 150, 42, 0.12, 0.45, 2.5), gain=0.55)
    c.add(click(0.03, rng, 2000, 9000, 0.01), gain=0.25)
    # 煌めき（上がり切った所から密に）
    env = np.interp(tt(d), [0, 0.25, 0.4, 1.4, d], [0.0, 0.3, 1.0, 0.6, 0.0])
    c.add(sparkle(d, rng, 90, 5000, 13000, 0.14, env), gain=0.35)
    out = reverb(lp(c.out, 14000), make_ir(1.4, rng, predelay=0.015), 0.32)
    return fade(out[:, : n_of(2.45)], 0, 0.5)


def gekiatsu(rng):
    """「激熱」の衝撃: 爆発的な低音・歪んだ胴・金属的な倍音（ゴング）・ノイズのクラッシュ・長い残響."""
    d = 3.0
    c = Canvas(d)
    c.add(boom(2.0, 110, 30, 0.35, 1.4, 2.5), gain=1.0)
    body = drive(lp(noise(1.0, rng), 900) * ad(1.0, 0.002, 0.45), 4.0)
    c.add(pan(body, 0.0), gain=0.45)
    c.add(drive(boom(0.6, 300, 70, 0.06, 0.25), 5.0), gain=0.3)
    gong_l = metal_hit(d, 233, rng, n=18, t60=2.2, spread=4.0, bright=0.7)
    gong_r = metal_hit(d, 236, rng, n=18, t60=2.2, spread=4.0, bright=0.7)
    c.add(np.stack([gong_l, gong_r]) * fade(np.ones(n_of(d)), 0.004), gain=0.45)
    bell = metal_hit(d, 587, rng, n=12, t60=1.8, spread=3.0, bright=0.8)
    c.add(pan(bell, 0.0), gain=0.15)
    crash = hp(noise(2.0, rng), 3000) * ad(2.0, 0.002, 1.6)
    c.add(np.stack([crash, hp(noise(2.0, rng), 3000) * ad(2.0, 0.002, 1.6)]), gain=0.16)
    c.add(click(0.02, rng, 1500, 8000, 0.008), gain=0.5)
    out = reverb(c.out, make_ir(3.0, rng, predelay=0.02, damp=0.35), 0.5)
    return fade(out, 0, 0.6)


def button_press(rng):
    """ボタン押下の「ドン」: ピッチが急降下するサイン（芯）+ 歪みの倍音 + 打撃のクリック + 短い部屋鳴り."""
    d = 0.9
    c = Canvas(d)
    c.add(boom(d, 170, 42, 0.09, 0.55), gain=1.0)
    c.add(lp(boom(0.35, 220, 60, 0.05, 0.18, 6.0), 1800), gain=0.55)
    c.add(lp(drive(boom(0.25, 260, 110, 0.04, 0.12), 4.0), 2500), gain=0.3)
    c.add(lp(noise(0.08, rng), 1200) * ad(0.08, 0.001, 0.05), gain=0.35)
    c.add(click(0.012, rng, 2500, 7000, 0.004), gain=0.3)
    return fade(reverb(c.out, make_ir(0.5, rng, room=0.03), 0.12), 0, 0.15)


def _cutin(rng, level: str):
    """風切り → 衝撃．level に応じて衝撃の重さ・金属音・煌めきの尾を足す."""
    w_dur = {"blue": 0.16, "red": 0.18, "gold": 0.22}[level]
    tail = {"blue": 0.9, "red": 1.3, "gold": 2.2}[level]
    d = w_dur + tail
    c = Canvas(d)
    c.add(pan(whoosh(w_dur, rng, 400, 5000, 1.0, 1.6), -0.4), gain=0.6)
    c.add(pan(whoosh(w_dur, rng, 600, 7000, 1.0, 1.6), 0.4), gain=0.5)
    hit = w_dur
    g = {"blue": 1.5, "red": 3.0, "gold": 2.5}[level]
    c.add(boom(tail, 140, 40, 0.15, tail * 0.6, g), at=hit, gain=1.0)
    c.add(click(0.03, rng, 1500, 9000, 0.012), at=hit, gain=0.5)
    snap = drive(bp(noise(0.25, rng), 600, 4000) * ad(0.25, 0.001, 0.12), 3.0)
    c.add(pan(snap, 0.0), at=hit, gain=0.35)
    if level in ("red", "gold"):
        c.add(lp(drive(osc(sweep(110, 55, tail, 0.2), "saw") * ad(tail, 0.002, tail * 0.5), 4.0), 2500),
              at=hit, gain=0.25)
    if level == "gold":
        chord = sum(metal_hit(tail, f, rng, n=10, t60=1.6, spread=3.0, bright=0.8) for f in (523, 659, 784))
        c.add(pan(chord, 0.0), at=hit, gain=0.12)
        rise = glide([(0, 1200), (0.12, 3000), (tail, 3200)], tail)
        c.add(unison(rise, "saw", 3, 12, rng) * ahd(tail, 0.01, 0.3, 1.0), at=hit, gain=0.08)
        env = np.interp(tt(tail), [0, 0.05, 1.0, tail], [0.2, 1.0, 0.5, 0.0])
        c.add(sparkle(tail, rng, 110, 4500, 13000, 0.18, env), at=hit, gain=0.4)
    rt = {"blue": 0.9, "red": 1.3, "gold": 2.2}[level]
    return fade(reverb(c.out, make_ir(rt, rng, predelay=0.015), 0.28), 0, 0.3)


def cutin(rng, level: str):
    return _cutin(rng, level)


def reach(rng):
    """リーチ成立の「ドゥーン」+ 上昇: 低いデチューンのスタブ（フィルタが閉じる）+ 上昇する鋸波とノイズ."""
    d = 2.0
    c = Canvas(d)
    c.add(boom(1.4, 120, 45, 0.2, 1.0, 2.0), gain=0.9)
    stab_f = const(55.0, 1.6)
    stab = unison(stab_f, "saw", 5, 18, rng) + unison(stab_f * 2, "saw", 3, 12, rng) * 0.6
    cutoff = glide([(0, 3500), (0.25, 700), (1.6, 180)], 1.6)
    c.add(drive(vfilter(stab, cutoff, 1.4, "lp") * ad(1.6, 0.004, 1.3), 1.8), gain=0.6)
    up = glide([(0, 180), (1.4, 1600), (d, 1800)], d)
    riser = unison(up, "saw", 3, 15, rng)
    cut_up = glide([(0, 400), (1.4, 6000), (d, 6000)], d)
    riser_env = lin([(0, 0.0), (0.15, 0.25), (1.4, 1.0), (d, 0.0)], d)
    c.add(vfilter(riser, cut_up, 2.0, "lp") * riser_env, gain=0.32)
    nr = vfilter(noise(d, rng), glide([(0, 800), (1.4, 9000), (d, 9000)], d), 1.5, "bp") * riser_env
    c.add(pan(nr, 0.0), gain=0.25)
    return fade(reverb(c.out, make_ir(1.4, rng), 0.25), 0, 0.25)


def button_appear(rng):
    """ボタン出現の煽り: 加速するトレモロ付きの上昇音 + ノイズの吸い込み + 最後に短いピン."""
    d = 1.35
    c = Canvas(d)
    up = glide([(0, 160), (1.1, 1500), (d, 1500)], d)
    rate = lin([(0, 8), (1.1, 32), (d, 32)], d)
    trem = 1 - 0.5 * (1 - np.cos(2 * np.pi * np.cumsum(rate) / 48000))
    env = lin([(0, 0.35), (1.05, 1.0), (1.12, 0.0), (d, 0.0)], d)
    c.add(lp(unison(up, "square", 3, 10, rng), 6000) * trem * env, gain=0.28)
    c.add(pan(vfilter(noise(d, rng), glide([(0, 600), (1.1, 8000), (d, 8000)], d), 1.2, "bp") * env, 0), gain=0.3)
    c.add(pan(boom(0.3, 160, 60, 0.05, 0.2, 2.0), 0), gain=0.35)
    ping = fm(const(2637.0, 0.4), 2.0, 1.5 * decay(0.4, 0.1)) * ad(0.4, 0.001, 0.3)
    c.add(ping, at=1.1, gain=0.4)
    return reverb(c.out, make_ir(0.8, rng), 0.2)


def freeze(rng):
    """プレミアのフリーズ: 電源が落ちるような短い「ブツッ」→ 約 0.4 秒の無音 → 重いノイズの「ギュイン」.

    再生側はそのまま鳴らす前提なので，先頭は無音にせず「ブツッ」で始め，切断感の後に間を置く．
    """
    gap = 0.42
    g_dur = 2.4
    c = Canvas(gap + g_dur)
    cut = lp(osc(sweep(90, 30, 0.07, 0.05), "square"), 1500) * ad(0.07, 0.0005, 0.05)
    c.add(pan(cut, 0.0), gain=0.55).add(click(0.02, rng, 800, 6000, 0.006), gain=0.33)
    f = glide([(0, 45), (0.45, 260), (1.0, 300), (g_dur, 280)], g_dur)
    env = ahd(g_dur, 0.03, 0.8, 1.2)
    stack = unison(f, "saw", 5, 25, rng) + unison(f * 1.5, "saw", 3, 15, rng) * 0.6
    cutoff = glide([(0, 200), (0.45, 4500), (1.2, 2500), (g_dur, 600)], g_dur)
    heavy = drive(vfilter(stack, cutoff, 2.5, "lp") * env, 3.5)
    c.add(heavy, at=gap, gain=0.45)
    gn = vfilter(pink(g_dur, rng), glide([(0, 300), (0.45, 5000), (g_dur, 1500)], g_dur), 2.0, "bp") * env
    c.add(np.stack([gn, np.roll(gn, 480)]), at=gap, gain=0.35)
    c.add(boom(1.8, 90, 28, 0.4, 1.3, 2.0), at=gap, gain=0.8)
    out = reverb(c.out, make_ir(2.2, rng, predelay=0.02), 0.3)
    return fade(out, 0, 0.5)


def gimmick(rng):
    """役物落下の「ガシャーン」: 短い風切り → 金属の衝突（複数の板）+ 低い衝撃 + 破片のカラカラ + 残響."""
    w = 0.12
    d = w + 2.0
    c = Canvas(d)
    c.add(pan(whoosh(w, rng, 800, 6000, 1.0, 1.4), 0.0), gain=0.5)
    for f, p in [(310, -0.5), (447, 0.3), (612, 0.6), (835, -0.2)]:
        c.add(metal_hit(1.6, f, rng, n=16, t60=0.9, spread=5.0, bright=0.8), at=w + rng.uniform(0, 0.012),
              p=p, gain=0.18)
    crash = hp(noise(1.2, rng), 2500) * ad(1.2, 0.001, 0.6)
    c.add(np.stack([crash, np.roll(crash, 300)]), at=w, gain=0.25)
    c.add(boom(0.8, 130, 45, 0.08, 0.45, 3.0), at=w, gain=0.75)
    c.add(click(0.03, rng, 1000, 8000, 0.01), at=w, gain=0.6)
    for _ in range(14):
        at = w + 0.08 + rng.exponential(0.25)
        if at > d - 0.2:
            continue
        deb = modal(rng.uniform(1800, 5000) * np.array([1, 2.6]), [0.03, 0.02], [1, 0.4], 0.06, rng, 0.0002)
        c.add(deb, at=at, p=rng.uniform(-0.8, 0.8), gain=rng.uniform(0.05, 0.15))
    return fade(reverb(c.out, make_ir(1.6, rng, predelay=0.01), 0.3), 0, 0.3)


def flash(rng):
    """画面フラッシュの「シャキーン」: 上へ掃くハイパスのノイズ + 刃の高いリング + 煌めき."""
    d = 1.3
    c = Canvas(d)
    sweep_n = vfilter(noise(0.25, rng), glide([(0, 1500), (0.2, 9000)], 0.25), 1.5, "hp") * ad(0.25, 0.01, 0.2)
    c.add(pan(sweep_n, 0.0), gain=0.5)
    ring = modal([3150, 4420, 5870, 7930], [0.9, 0.7, 0.5, 0.35], [1, 0.7, 0.5, 0.35], d, rng)
    ring_r = modal([3165, 4440, 5900, 7960], [0.9, 0.7, 0.5, 0.35], [1, 0.7, 0.5, 0.35], d, rng)
    c.add(np.stack([ring, ring_r]), at=0.03, gain=0.18)
    c.add(click(0.02, rng, 3000, 12000, 0.006), at=0.03, gain=0.4)
    c.add(sparkle(0.9, rng, 40, 5000, 12000, 0.12), at=0.05, gain=0.3)
    return fade(reverb(c.out, make_ir(1.2, rng), 0.25), 0, 0.25)
