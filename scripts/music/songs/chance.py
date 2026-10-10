"""チャンス中（時短）: 168 BPM, ハ短調. 弦のスピッカートの 16 分と和太鼓・ティンパニで急かし,
B で上昇して, サビは金管と合唱が長調寄りの進行（Ab → Bb）で主題を吹いて期待を持ち上げる."""

from arrange import (GM, KIT, Part, Section, Song, bass, comp, crash, cymbal_swell, drums, fill, lead,
                     ostinato, pad, progression, rng_for, timp_roll)

BPM = 168
INTRO = "Cm | Ab | Fm | G"
A = "Cm | Cm | Ab | Bb | Cm | Eb | Fm | G"
B = "Ab | Bb | Gm | Cm | Fm | Gm | Ab | Gsus4:2 G:2"
SABI = "Ab | Bb | Gm | Cm | Fm | Bb | Eb | G | Ab | Bb | Gm | Cm | Fm | G | Cm | G7"
OUTRO = "Cm | Ab | Fm | G"

# A: ヴァイオリンの主題（16 分の刻みの上で, 8 分で駆け上がって 4 分で落ちる）
VIOLINS_A = ("G4:.5 C5:.5 D5:.5 Eb5:.5 D5:1 C5:1 | G5:1.5 F5:.5 Eb5:1 D5:1 | "
             "C5:.5 Eb5:.5 Ab5:1 G5:.5 F5:.5 Eb5:1 | D5:1.5 Bb4:.5 F5:2 | "
             "G4:.5 C5:.5 D5:.5 Eb5:.5 G5:1 F5:.5 Eb5:.5 | Bb5:1.5 G5:.5 Eb5:1 G5:1 | "
             "Ab5:1 G5:.5 F5:.5 C5:1 F5:1 | D5:1 B4:1 G4:2")
# B: ホルンの対旋律と, ヴァイオリンの全音符の上昇
HORNS_B = "Eb5:2 C5:2 | D5:2 F5:2 | D5:4 | Eb5:2 G5:2 | F5:2 Ab5:2 | G5:2 Bb5:2 | C6:4 | C6:2 B5:2"
RISE = "C5:4 | D5:4 | D5:4 | Eb5:4 | F5:4 | G5:4 | Ab5:4 | G5:2 B5:2"
# サビ: 金管の主題（前半 8 小節で問い, 後半 8 小節で高い所まで答える）
SABI_MEL = ("C6:1.5 Bb5:.5 Ab5:1 Eb5:1 | F5:1.5 G5:.5 Ab5:1 Bb5:1 | G5:1.5 F5:.5 D5:1 Bb4:1 | "
            "C5:1 Eb5:1 G5:2 | Ab5:1.5 G5:.5 F5:1 C6:1 | Bb5:1.5 Ab5:.5 F5:1 D5:1 | "
            "Eb5:1 G5:1 Bb5:1 Eb6:1 | D6:2 B5:2 | "
            "C6:1.5 Bb5:.5 Ab5:1 Eb5:1 | F5:1.5 G5:.5 Ab5:1 D6:1 | D6:1.5 C6:.5 Bb5:1 G5:1 | "
            "C6:1 G5:1 Eb5:1 G5:1 | Ab5:1 C6:1 F6:1.5 Eb6:.5 | D6:1 B5:1 G5:1 D6:1 | "
            "Eb6:1.5 D6:.5 C6:2 | G5:1 B5:1 D6:1 F6:1")
# サビ後半のグロッケン（主題の隙間を 8 分で埋める）
GLOCK = ("Eb6:.5 C6:.5 Ab5:.5 C6:.5 Eb6:1 r:1 | F6:.5 D6:.5 Bb5:.5 D6:.5 F6:1 r:1 | "
         "D6:.5 Bb5:.5 G5:.5 Bb5:.5 D6:1 r:1 | Eb6:.5 C6:.5 G5:.5 C6:.5 Eb6:1 r:1 | "
         "F6:.5 C6:.5 Ab5:.5 C6:.5 F6:1 r:1 | D6:.5 B5:.5 G5:.5 B5:.5 D6:1 r:1 | "
         "C6:.5 G5:.5 Eb5:.5 G5:.5 C6:1 r:1 | B5:.5 G5:.5 D5:.5 G5:.5 B5:1 r:1")


def build() -> Song:
    r = rng_for("chance")
    bar = lambda b: b * 4.0  # noqa: E731
    s_a, s_b, s_s, s_o = bar(4), bar(12), bar(20), bar(36)

    # 低弦のスピッカート: 曲の最初から最後まで 16 分で刻み続ける
    spic = Part("spiccato", GM["strings"], level=-4, pan=-0.1, reverb=0.28, hp=60, sound="strings_spic")
    pattern = [0, 0, 12, 0, 7, 0, 12, 7]
    for prog, start, vel in ((INTRO, 0, 80), (A, s_a, 88), (B, s_b, 94), (SABI, s_s, 100), (OUTRO, s_o, 90)):
        ostinato(spic, prog, start, pattern, 0.25, 36, vel=vel, gate=0.6, rng=r)

    violins = Part("violins", GM["violin"], level=-3, pan=-0.3, reverb=0.4, hp=200, sound="violins")
    lead(violins, VIOLINS_A, s_a, vel=100)
    lead(violins, RISE, s_b, vel=96, legato=1.0, octave=1)
    for i in range(8):
        violins.swell(s_b + 4 * i, s_b + 4 * i + 3.5, 72 + 5 * i, 100 + 3 * i, steps=8)
    violins.swell(s_s - 0.25, s_s, 127, 108, steps=1)
    lead(violins, SABI_MEL, s_s, vel=92)

    trem = Part("tremolo", GM["trem_str"], level=-11, pan=0.3, reverb=0.45, hp=250)
    pad(trem, INTRO, 0, 60, 76, vel=72, size=3)
    pad(trem, OUTRO, s_o, 60, 76, vel=78, size=3)
    trem.swell(0, bar(4), 60, 118)
    trem.swell(s_o, s_o + bar(4), 70, 124)

    horns = Part("horns", GM["horn"], level=-4, pan=-0.15, reverb=0.4, hp=90, sound="horns4")
    lead(horns, HORNS_B, s_b, vel=96, legato=1.0, octave=-1)
    pad(horns, A, s_a, 50, 62, vel=74, size=2)

    brass = Part("brass", GM["brass"], level=-2, pan=0.05, reverb=0.35, hp=120)
    lead(brass, SABI_MEL, s_s, vel=110)
    comp(brass, INTRO, 0, "X..x..x.", 55, 70, vel=100, size=3, step=0.5, gate=0.6, rng=r)
    comp(brass, OUTRO, s_o, "X..x..x.", 55, 70, vel=104, size=3, step=0.5, gate=0.6, rng=r)

    trombones = Part("trombones", GM["trombone"], level=-6, pan=0.35, reverb=0.3, hp=80)
    comp(trombones, B, s_b, "x--x--x-", 46, 62, vel=90, size=3, step=0.5, gate=0.7, rng=r)
    comp(trombones, SABI, s_s, "X-------", 46, 62, vel=98, size=3, step=0.5, gate=0.9, rng=r)

    choir = Part("choir", GM["choir"], level=-6, pan=0.0, reverb=0.5, hp=160)
    pad(choir, SABI, s_s, 55, 72, vel=90, size=4)
    oohs = Part("oohs", GM["oohs"], level=-10, pan=0.15, reverb=0.5, hp=180)
    pad(oohs, B, s_b, 55, 72, vel=72, size=3)

    glock = Part("glock", GM["glock"], level=-12, pan=0.35, reverb=0.35, hp=500)
    lead(glock, GLOCK, s_s + bar(8), vel=84)

    bs = Part("bass", GM["pick_bass"], level=-6, reverb=0.03, humanize=0.003)
    bass(bs, INTRO, 0, "whole", low=26, vel=88, rng=r)
    bass(bs, A, s_a, "eighth", low=26, vel=94, rng=r)
    bass(bs, B, s_b, "gallop", low=26, vel=94, rng=r)
    bass(bs, SABI, s_s, "eighth", low=26, vel=100, rng=r)
    bass(bs, OUTRO, s_o, "gallop", low=26, vel=96, rng=r)

    timp = Part("timpani", GM["timpani"], level=-5, reverb=0.35, hp=40, humanize=0.003)
    for prog, start, beats in ((INTRO, 0, (0, 1.5, 3)), (A, s_a, (0,)), (B, s_b, (0, 2)),
                               (SABI, s_s, (0, 2.5)), (OUTRO, s_o, (0, 1.5, 3))):
        for t, d, c in progression(prog):
            root = 38 + (c.root - 38) % 12
            for b in beats:
                if b < d:
                    timp.add(start + t + b, 1.0, root, 110 if b == 0 else 94)
    roll = Part("timp_roll", GM["timpani"], level=-5, reverb=0.35, hp=40, sound="timp_roll")
    timp_roll(roll, bar(19), 4.0, 43, 112)  # B の終わり → サビ
    roll.swell(bar(19), bar(20), 50, 127, steps=12)
    timp_roll(roll, bar(39), 4.0, 43, 110)  # 最後の小節 → 頭へ戻る
    roll.swell(bar(39), bar(40), 40, 127, steps=16)

    taiko = Part("taiko", GM["taiko"], level=-6, reverb=0.3, hp=40)
    hits = ((0, 45, 114), (0.75, 45, 92), (1.5, 52, 100), (2.5, 45, 104), (3, 52, 96), (3.5, 45, 108))
    for b in list(range(0, 4)) + list(range(12, 20)) + list(range(36, 40)):
        for pos, p, v in hits:
            taiko.add(bar(b) + pos, 1.0, p, v + r.randint(-6, 6))

    dr = Part("drums", KIT["power"], drum=True, level=-4, reverb=0.14, humanize=0.002)
    crash(dr, 0, 114)
    for b in range(0, 4):
        drums(dr, bar(b), {"k": "x.....x...x.....", "ch": "x.x.x.x.x.x.x.x."}, vel=90, rng=r)
    fill(dr, bar(3) + 3, 1, "snare", 70, 110, rng=r)
    crash(dr, s_a, 114)
    for b in range(4, 12):
        drums(dr, bar(b), {"k": "x.....x.x.....x.", "s": "....X.......X...",
                           "ch": "x.xxx.xxx.xxx.xx"}, vel=98, rng=r)
    crash(dr, bar(8), 110)
    fill(dr, bar(11) + 2, 2, "toms", 80, 116, rng=r)
    cymbal_swell(dr, s_b, 4.0, 98)
    crash(dr, s_b, 112)
    for b in range(12, 16):
        drums(dr, bar(b), {"k": "x...x...x...x...", "s": "....x.......x...",
                           "rd": "x.x.x.x.x.x.x.x."}, vel=98, rng=r)
    for b in (16, 17):
        drums(dr, bar(b), {"k": "x...x...x...x...", "s": "x.x.x.x.x.x.x.x."}, vel=100, rng=r)
    drums(dr, bar(18), {"k": "x...x...x...x..."}, vel=102, rng=r)
    fill(dr, bar(18), 8, "snare", 66, 124, rng=r)
    cymbal_swell(dr, s_s, 8.0, 110)
    for b in range(20, 36):
        drums(dr, bar(b), {"k": "x.x...x.x.x...x.", "s": "....X.......X...",
                           "ch": "x.xxx.xxx.xxx.xx"}, vel=102, rng=r)
        if b % 4 == 0:
            crash(dr, bar(b), 120)
    fill(dr, bar(27) + 3, 1, "snare", 86, 120, rng=r)
    fill(dr, bar(35) + 2, 2, "toms", 86, 122, rng=r)
    crash(dr, s_o, 116)
    for b in range(36, 39):
        drums(dr, bar(b), {"k": "x.....x...x.....", "s": "....x.......x...",
                           "ch": "x.x.x.x.x.x.x.x."}, vel=98, rng=r)
    drums(dr, bar(39), {"k": "x...x...x...x..."}, vel=100, rng=r)
    fill(dr, bar(39), 4, "roll", 50, 118, rng=r)

    song = Song(
        id="chance", title="チャンス中", bpm=BPM, bars=40, key="C minor", reverb_rt=1.8,
        parts=[spic, violins, trem, horns, brass, trombones, choir, oohs, glock, bs, timp, roll, taiko, dr],
        sections=[
            Section("イントロ（和太鼓と刻み）", 4, INTRO), Section("A（ヴァイオリンの主題）", 8, A),
            Section("B（上昇）", 8, B), Section("サビ（金管の主題）", 16, SABI),
            Section("アウトロ", 4, OUTRO),
        ],
    )
    song.check()
    return song
