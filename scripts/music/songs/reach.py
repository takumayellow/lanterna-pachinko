"""リーチ: 150 BPM, ホ短調. 低弦の 16 分のオスティナートとティンパニで緊張を作り, サビでブラスが主題を吹く."""

from arrange import (GM, KIT, Part, Section, Song, bass, comp, crash, cymbal_swell, drums, fill, lead,
                     ostinato, pad, progression, rng_for, timp_roll)

BPM = 150
INTRO = "Em | C | Em | B7"
A = "Em | C | Am | B7 | Em | C | Am | B7"
B = "Am | Bm | C | D | Em | F#m7b5 | G | B7"
C = A
BRIDGE = "Em | C | Am | B7sus4:2 B7:2"

THEME = ("B4:1.5 E5:.5 G5:2 | E5:1.5 D5:.5 C5:1 E5:1 | A5:2 G5:1 E5:1 | F#5:2 D#5:2 | "
         "B4:1.5 E5:.5 G5:1.5 B5:.5 | C6:1 B5:1 G5:1 E5:1 | A5:1 C6:1 B5:1 A5:1 | ")
THEME_A = THEME + "F#5:1 A5:1 B5:2"
THEME_C = THEME + "B5:2 A5:1 F#5:1"
RISE = "E5:4 | F#5:4 | G5:4 | A5:4 | B5:4 | C6:4 | D6:4 | D#6:4"
BRIDGE_MEL = "E5:2 G5:2 | E5:2 C5:2 | C5:2 E5:2 | D#5:2 F#5:2"


def build() -> Song:
    r = rng_for("reach")
    bar = lambda b: b * 4.0  # noqa: E731
    s_a, s_b, s_c, s_br = bar(4), bar(12), bar(20), bar(28)

    low = Part("low_strings", GM["strings"], level=-4, pan=-0.15, reverb=0.25, hp=60)
    pattern = [0, 12, 0, 7, 0, 12, 7, 12]
    for prog, start, vel in ((INTRO, 0, 72), (A, s_a, 82), (B, s_b, 88), (C, s_c, 96), (BRIDGE, s_br, 90)):
        ostinato(low, prog, start, pattern, 0.25, 40, vel=vel, gate=0.7, rng=r)

    horns = Part("horns", GM["horn"], level=-3, pan=0.1, reverb=0.4, hp=90)
    lead(horns, THEME_A, s_a, vel=96, octave=-1)
    lead(horns, BRIDGE_MEL, s_br, vel=88, octave=-1, legato=1.0)

    brass = Part("brass", GM["brass"], level=-2, pan=0.05, reverb=0.35, hp=120)
    lead(brass, THEME_C, s_c, vel=108)

    violins = Part("violins", GM["strings"], level=-5, pan=0.3, reverb=0.4, hp=200, sound="violins")
    lead(violins, RISE, s_b, vel=96, legato=1.0)
    for i in range(8):
        violins.swell(s_b + 4 * i, s_b + 4 * i + 3.5, 70 + 6 * i, 100 + 3 * i, steps=8)
    violins.swell(s_c - 0.25, s_c, 127, 110, steps=1)
    lead(violins, THEME_C, s_c, vel=92, octave=1)
    violins.swell(s_br, s_br + 0.1, 110, 110, steps=1)

    trem = Part("tremolo", GM["trem_str"], level=-11, pan=0.25, reverb=0.45, hp=250)
    pad(trem, INTRO, 0, 64, 80, vel=70, size=3)
    pad(trem, BRIDGE, s_br, 64, 80, vel=74, size=3)
    trem.swell(0, 16, 60, 110)
    trem.swell(s_br, s_br + 16, 70, 120)
    trem.swell(s_a - 0.25, s_a, 110, 100, steps=1)

    trombones = Part("trombones", GM["trombone"], level=-6, pan=-0.3, reverb=0.3, hp=80)
    comp(trombones, B, s_b, "x--x--x-", 48, 64, vel=92, size=3, step=0.5, gate=0.7, rng=r)
    comp(trombones, C, s_c, "X.......", 48, 64, vel=100, size=3, step=0.5, gate=0.9, rng=r)

    choir = Part("choir", GM["choir"], level=-8, pan=-0.05, reverb=0.5, hp=180)
    pad(choir, A, s_a, 52, 69, vel=64, size=3)
    pad(choir, C, s_c, 55, 74, vel=84, size=4)
    pad(choir, BRIDGE, s_br, 55, 72, vel=72, size=3)
    oohs = Part("oohs", GM["oohs"], level=-10, pan=0.15, reverb=0.5, hp=180)
    pad(oohs, B, s_b, 55, 72, vel=70, size=3)

    bs = Part("bass", GM["pick_bass"], level=-6, reverb=0.03, humanize=0.003)
    bass(bs, INTRO, 0, "whole", low=28, vel=84, rng=r)
    bass(bs, A, s_a, "half", low=28, vel=90, rng=r)
    bass(bs, B, s_b, "eighth", low=28, vel=92, rng=r)
    bass(bs, C, s_c, "eighth", low=28, vel=100, rng=r)
    bass(bs, BRIDGE, s_br, "half", low=28, vel=92, rng=r)

    timp = Part("timpani", GM["timpani"], level=-4, reverb=0.35, hp=40, humanize=0.003)
    for prog, start, beats in ((INTRO, 0, (0,)), (A, s_a, (0,)), (B, s_b, (0, 2)), (C, s_c, (0, 2.5)),
                               (BRIDGE, s_br, (0,))):
        for t, d, c in progression(prog):
            root = 40 + (c.root - 40) % 12
            for b in beats:
                if b < d:
                    timp.add(start + t + b, 1.0, root, 108 if b == 0 else 92)
    # ブリッジ最後の小節はロールで盛り上げてイントロへ戻る. B の終わりもロールでサビへ
    roll = Part("timp_roll", GM["timpani"], level=-5, reverb=0.35, hp=40, sound="timp_roll")
    timp_roll(roll, bar(31), 4.0, 40, 110)
    timp_roll(roll, bar(19) + 2, 2.0, 47, 112)
    roll.swell(bar(19) + 2, bar(20), 50, 127, steps=8)
    roll.swell(bar(31), bar(32), 40, 127, steps=16)

    taiko = Part("taiko", GM["taiko"], level=-7, reverb=0.3, hp=40)
    for b in list(range(4, 12)) + list(range(20, 28)):
        for pos, p, v in ((0, 45, 112), (1.5, 45, 96), (2.5, 52, 100), (3, 45, 104)):
            taiko.add(bar(b) + pos, 1.0, p, v + r.randint(-6, 6))

    dr = Part("drums", KIT["power"], drum=True, level=-4, reverb=0.15, humanize=0.002)
    crash(dr, 0, 112)
    for b in (2, 3):
        drums(dr, bar(b), {"k": "x.......x......."}, vel=92, rng=r)
    fill(dr, bar(3) + 2, 2, "roll", 40, 100, rng=r)
    crash(dr, s_a, 112)
    for b in range(4, 12):
        drums(dr, bar(b), {"k": "x.....x...x.....", "s": "........X.......",
                           "ch": "x.x.x.x.x.x.x.x."}, vel=96, rng=r)
    fill(dr, bar(11) + 3, 1, "snare", 70, 110, rng=r)
    cymbal_swell(dr, s_b, 4.0, 96)
    crash(dr, s_b, 110)
    for b in range(12, 16):
        drums(dr, bar(b), {"k": "x...x...x...x...", "s": "....x.......x...",
                           "ch": "x.x.x.x.x.x.x.x."}, vel=96, rng=r)
    for b in (16, 17):
        drums(dr, bar(b), {"k": "x...x...x...x...", "s": "x.x.x.x.x.x.x.x."}, vel=94, rng=r)
    for b in (18, 19):
        drums(dr, bar(b), {"k": "x...x...x...x..."}, vel=100, rng=r)
    fill(dr, bar(18), 8, "snare", 64, 122, rng=r)
    cymbal_swell(dr, s_c, 8.0, 108)
    for b in range(20, 28):
        drums(dr, bar(b), {"k": "x.....x.x.x.....", "s": "....X.......X...",
                           "rd": "x.x.x.x.x.x.x.x."}, vel=100, rng=r)
        if b % 2 == 0:
            crash(dr, bar(b), 116)
    fill(dr, bar(27) + 2, 2, "toms", 80, 118, rng=r)
    crash(dr, s_br, 112)
    for b in range(28, 31):
        drums(dr, bar(b), {"k": "x.........x.....", "t5": "....x.......x...",
                           "ch": "x.x.x.x.x.x.x.x."}, vel=94, rng=r)
    drums(dr, bar(31), {"k": "x...x...x...x..."}, vel=100, rng=r)
    fill(dr, bar(31), 4, "roll", 50, 118, rng=r)

    song = Song(
        id="reach", title="リーチ", bpm=BPM, bars=32, key="E minor", reverb_rt=2.0,
        parts=[low, horns, brass, violins, trem, trombones, choir, oohs, bs, timp, roll, taiko, dr],
        sections=[
            Section("イントロ", 4, INTRO), Section("A（ホルンの主題）", 8, A),
            Section("B（上昇）", 8, B), Section("サビ（ブラスの主題）", 8, C),
            Section("ブリッジ", 4, BRIDGE),
        ],
    )
    song.check()
    return song
