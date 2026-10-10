"""SPSP（黒嵐）: 132 BPM, ニ短調（フリギアの bII を混ぜる）. 短い母音の詠唱と弦のスピッカート,
大太鼓で影の帳の不気味さを出し, 後半は金管が主題を吹く."""

from arrange import (GM, KIT, Part, Section, Song, bass, comp, crash, cymbal_swell, drums, fill, lead,
                     ostinato, pad, progression, rng_for, timp_roll)

# 揺らしと乱数の種
SEED = "spsp_storm"

BPM = 132
INTRO = "Dm | Eb | Dm | A7"
A = "Dm | Eb | Dm | C | Bb | C | Dm:2 Eb:2 | Dm"
B = "Gm | Dm | Bb | A | Gm | Dm | Eb | A7"
C = A
BRIDGE = "Dm | Eb | Dm | A7"

# 詠唱（短い "a" の母音を 8 分で刻む）
CHANT = ("D4!:.5 D4:.5 F4:.5 D4:.5 Eb4:.5 D4:.5 C4:.5 D4:.5 | "
         "Eb4!:.5 Eb4:.5 G4:.5 Eb4:.5 F4:.5 Eb4:.5 D4:.5 Eb4:.5 | "
         "F4!:.5 F4:.5 A4:.5 F4:.5 G4:.5 F4:.5 Eb4:.5 D4:.5 | "
         "E4!:.5 E4:.5 G4:.5 E4:.5 C4:1 r:1 | "
         "D4!:.5 D4:.5 F4:.5 D4:.5 Bb3:.5 C4:.5 D4:.5 F4:.5 | "
         "E4!:.5 E4:.5 G4:.5 E4:.5 C4:.5 D4:.5 E4:.5 G4:.5 | "
         "A4!:.5 F4:.5 D4:.5 F4:.5 G4!:.5 Eb4:.5 Bb3:.5 Eb4:.5 | "
         "D4!:1.5 r:.5 D4:.5 D4:.5 D4!:1")
CHANT_INTRO = "D4!:1 r:1 D4:.5 D4:.5 r:1 | Eb4!:1 r:1 Eb4:.5 Eb4:.5 r:1 | D4!:1 r:1 D4:.5 D4:.5 r:1 | " \
              "C#4!:.5 C#4:.5 E4:.5 C#4:.5 G4:.5 E4:.5 C#4:.5 E4:.5"
VIOLINS_B = "D6:3 C6:1 | A5:2 F5:2 | Bb5:3 A5:1 | E5:4 | G5:2 Bb5:2 | A5:3 F5:1 | G5:2 Bb5:2 | A5:4"
BRASS_C = ("D5:1.5 A4:.5 D5:1 F5:1 | Eb5:3 D5:1 | F5:1.5 E5:.5 D5:1 A4:1 | G4:2 C5:2 | "
           "D5:1.5 F5:.5 Bb5:2 | G5:1.5 E5:.5 C5:2 | A5:2 G5:1 Eb5:1 | D5:4")


def build() -> Song:
    r = rng_for(SEED)
    bar = lambda b: b * 4.0  # noqa: E731
    s_a, s_b, s_c, s_br = bar(4), bar(12), bar(20), bar(28)

    chant = Part("chant", GM["choir"], level=-2, pan=0.0, reverb=0.45, hp=120, sound="chant",
                 humanize=0.006)
    lead(chant, CHANT_INTRO, 0, vel=84, legato=0.8)
    lead(chant, CHANT, s_a, vel=92, legato=0.8)
    lead(chant, CHANT, s_c, vel=104, legato=0.8)
    lead(chant, CHANT_INTRO, s_br, vel=88, legato=0.8)

    choir = Part("choir", GM["choir"], level=-5, pan=0.05, reverb=0.55, hp=140)
    pad(choir, B, s_b, 50, 67, vel=96, size=4)
    pad(choir, C, s_c, 50, 67, vel=86, size=3)

    spic = Part("spiccato", GM["strings"], level=-5, pan=-0.1, reverb=0.3, hp=60, sound="strings_spic")
    pattern = [0, 12, 0, 7, 0, 12, 0, 1]  # 最後の半音上がフリギアの影
    for prog, start, vel in ((INTRO, 0, 80), (A, s_a, 88), (B, s_b, 92), (C, s_c, 100), (BRIDGE, s_br, 90)):
        ostinato(spic, prog, start, pattern, 0.25, 38, vel=vel, gate=0.6, rng=r)

    violins = Part("violins", GM["violin"], level=-4, pan=-0.35, reverb=0.45, hp=200, sound="violins")
    lead(violins, VIOLINS_B, s_b, vel=104, legato=1.0)
    for i in range(4):
        violins.swell(s_b + 8 * i, s_b + 8 * i + 6, 92, 127, steps=10)
        violins.swell(s_b + 8 * i + 6.5, s_b + 8 * i + 7, 127, 92, steps=2)

    trem = Part("tremolo", GM["trem_str"], level=-12, pan=0.3, reverb=0.45, hp=250)
    pad(trem, INTRO, 0, 62, 77, vel=72, size=3)
    pad(trem, BRIDGE, s_br, 62, 77, vel=80, size=3)
    trem.swell(0, bar(4), 60, 120)
    trem.swell(s_br, bar(32), 60, 124)

    brass = Part("brass", GM["brass"], level=-2, pan=0.05, reverb=0.35, hp=110)
    lead(brass, BRASS_C, s_c, vel=108)
    trombones = Part("trombones", GM["trombone"], level=-6, pan=0.35, reverb=0.3, hp=70)
    comp(trombones, B, s_b, "X..x..x.", 45, 60, vel=96, size=3, step=0.5, gate=0.7, rng=r)
    comp(trombones, C, s_c, "X.......", 45, 60, vel=100, size=3, step=0.5, gate=1.6, rng=r)

    organ = Part("organ", GM["church_organ"], level=-9, pan=0.0, reverb=0.5, hp=50, sound="organ_full")
    pad(organ, INTRO, 0, 50, 67, vel=96, size=4)
    pad(organ, BRIDGE, s_br, 50, 67, vel=96, size=4)

    basses = Part("basses", GM["contrabass"], level=-6, pan=0.4, reverb=0.25, hp=30, sound="basses")
    for prog, start in ((INTRO, 0), (A, s_a), (B, s_b), (C, s_c), (BRIDGE, s_br)):
        bass(basses, prog, start, "half", low=26, vel=96, rng=r)

    bells = Part("bells", GM["tubular"], level=-10, pan=0.25, reverb=0.55, hp=200)
    for b in (0, 2, 28, 30):
        bells.add(bar(b), 3.0, 62, 100)

    timp = Part("timpani", GM["timpani"], level=-4, reverb=0.35, hp=40, humanize=0.003)
    for prog, start in ((A, s_a), (B, s_b), (C, s_c)):
        for t, _, c in progression(prog):
            root = 38 + (c.root - 38) % 12
            timp.add(start + t, 1.0, root, 110)
            timp.add(start + t + 2.5, 0.5, root, 90)
    roll = Part("timp_roll", GM["timpani"], level=-5, reverb=0.35, hp=40, sound="timp_roll")
    timp_roll(roll, bar(31), 4.0, 45, 110)
    roll.swell(bar(31), bar(32), 50, 127, steps=16)
    timp_roll(roll, bar(19), 4.0, 45, 110)

    taiko = Part("taiko", GM["taiko"], level=-6, reverb=0.3, hp=35)
    for b in list(range(4, 12)) + list(range(20, 28)):
        for pos, p, v in ((0, 45, 116), (0.75, 45, 90), (1.5, 52, 100), (2, 45, 110), (3, 52, 104),
                          (3.5, 45, 96)):
            taiko.add(bar(b) + pos, 1.0, p, v + r.randint(-6, 6))

    dr = Part("drums", KIT["orchestra"], drum=True, level=-6, reverb=0.35, humanize=0.002)
    cymbal_swell(dr, s_a, 8.0, 100)
    crash(dr, s_a, 112)
    for b in range(12, 20):
        drums(dr, bar(b), {"s": "x..x..x.x..x..x.", "k": "x.......x......."}, vel=84, rng=r)
    cymbal_swell(dr, s_b, 4.0, 96)
    crash(dr, s_b, 110)
    cymbal_swell(dr, s_c, 8.0, 112)
    crash(dr, s_c, 118)
    dr.add(s_c, 6.0, 52, 110)  # 銅鑼
    fill(dr, bar(27) + 2, 2, "roll", 60, 112, rng=r)
    crash(dr, s_br, 104)

    song = Song(
        id="spsp_storm", seed=SEED, title="SPSP（黒嵐）", bpm=BPM, bars=32, key="D minor（Phrygian の bII 入り）",
        reverb_rt=2.6,
        parts=[chant, choir, spic, violins, trem, brass, trombones, organ, basses, bells, timp, roll, taiko, dr],
        sections=[
            Section("序奏（オルガンと鐘）", 4, INTRO), Section("A（詠唱）", 8, A),
            Section("B（合唱と弦）", 8, B), Section("C（詠唱と金管の主題）", 8, C),
            Section("ブリッジ", 4, BRIDGE),
        ],
    )
    song.check()
    return song
