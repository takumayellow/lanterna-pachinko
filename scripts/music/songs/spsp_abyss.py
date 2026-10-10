"""SPSP（深淵）: 3 拍子 150 BPM, ト短調の悲しいワルツ. オルガンとハープの序奏 → 弦のワルツ →
合唱とフルオルガンの総奏 → ピアノで静まって頭へ戻る."""

from arrange import (GM, KIT, Part, Section, Song, arp, bass, comp, crash, cymbal_swell, lead, pad, progression,
                     rng_for, timp_roll)

# 揺らしと乱数の種
SEED = "spsp_abyss"

BPM = 150
M = 3  # 拍子
INTRO = "Gm | Gm | Eb | Eb | Cm | Cm | D7 | D7"
A = "Gm | Gm | Cm | Cm | F | F | Bb | Bb | Eb | Eb | Cm | Cm | D | D | D7 | D7"
B = "Eb | Eb | F | F | Dm | Dm | Gm | Gm | Cm | Cm | Gm/D | Gm/D | Eb | D7 | Gm | Gm"
BRIDGE = "Cm | Cm | Gm | Gm | Ab | Ab | D7 | D7"

MEL_INTRO = "D5:2 G5:1 | Bb5:2 A5:1 | G5:2 Eb5:1 | Bb4:3 | C5:2 Eb5:1 | G5:2 F5:1 | F#5:2 A5:1 | D5:3"
MEL_A = ("D5:2 G5:1 | Bb5:2 A5:1 | G5:2 Eb5:1 | C5:3 | A4:1 C5:1 F5:1 | A5:2 G5:1 | F5:2 D5:1 | Bb4:3 | "
         "G4:1 Bb4:1 Eb5:1 | G5:2 F5:1 | Eb5:2 C5:1 | G5:2 Eb5:1 | F#5:2 A5:1 | D6:2 C6:1 | "
         "A5:1 F#5:1 D5:1 | C5:2 A4:1")
MEL_B = ("G5:3 | Bb5:2 G5:1 | A5:3 | C6:2 A5:1 | F5:2 D5:1 | A5:2 F5:1 | Bb5:2 A5:1 | G5:3 | "
         "Eb6:2 D6:1 | C6:2 G5:1 | Bb5:2 A5:1 | G5:1 F#5:1 G5:1 | Eb6:2 D6:1 | C6:1 Bb5:1 A5:1 | G5:3 | D5:3")
MEL_BRIDGE = "Eb5:2 D5:1 | C5:2 G4:1 | Bb4:2 A4:1 | G4:3 | C5:2 Eb5:1 | Ab5:2 G5:1 | F#5:2 A5:1 | D5:3"


def build() -> Song:
    r = rng_for(SEED)
    bar = lambda b: b * float(M)  # noqa: E731
    s_a, s_b, s_br = bar(8), bar(24), bar(40)

    organ = Part("organ", GM["church_organ"], level=-6, pan=0.0, reverb=0.5, hp=50, sound="organ")
    pad(organ, INTRO, 0, 50, 67, vel=90, size=4, bpb=M)
    pad(organ, A, s_a, 50, 67, vel=74, size=3, bpb=M)
    pad(organ, BRIDGE, s_br, 50, 67, vel=86, size=4, bpb=M)
    full = Part("organ_full", GM["church_organ"], level=-7, pan=0.0, reverb=0.5, hp=40, sound="organ_full")
    pad(full, B, s_b, 43, 67, vel=100, size=5, bpb=M)

    harp = Part("harp", GM["harp"], level=-5, pan=-0.35, reverb=0.5, hp=100)
    lead(harp, MEL_INTRO, 0, vel=84, octave=-1, bpb=M)
    arp(harp, B, s_b, [0, 2, 4, 5, 4, 2], 0.5, 55, vel=74, span=2, rng=r, bpb=M)

    violins = Part("violins", GM["violin"], level=-2, pan=-0.4, reverb=0.45, hp=180, sound="violins")
    lead(violins, MEL_A, s_a, vel=96, legato=1.0, bpb=M)
    lead(violins, MEL_B, s_b, vel=110, legato=1.0, bpb=M)
    for i in range(8):  # 4 小節ごとに膨らんで引く
        t0 = s_a + bar(4 * i)
        violins.swell(t0, t0 + bar(2), 92, 124, steps=8)
        violins.swell(t0 + bar(2), t0 + bar(4), 124, 96, steps=8)

    flute = Part("flute", GM["flute"], level=-9, pan=-0.15, reverb=0.45, hp=250)
    lead(flute, MEL_B, s_b, vel=92, legato=0.98, octave=-1, bpb=M)

    # ワルツの「ズン・チャッ・チャッ」: 1 拍目は低弦, 2・3 拍目は内声の弦
    low = Part("low_strings", GM["contrabass"], level=-5, pan=0.4, reverb=0.3, hp=30, sound="basses")
    celli = Part("celli", GM["cello"], level=-7, pan=0.3, reverb=0.35, hp=50, sound="celli")
    for prog, start, vel in ((A, s_a, 92), (B, s_b, 104), (BRIDGE, s_br, 84)):
        bass(low, prog, start, "waltz", low=31, vel=vel, rng=r, bpb=M)
        bass(celli, prog, start, "waltz", low=43, vel=vel - 8, rng=r, bpb=M)
    pizz = Part("pizz", GM["pizz"], level=-7, pan=0.1, reverb=0.35, hp=120)
    comp(pizz, A, s_a, ".xx", 55, 70, vel=84, size=3, step=1.0, gate=0.6, rng=r, bpb=M)
    chords = Part("chords", GM["strings"], level=-9, pan=0.05, reverb=0.4, hp=120, sound="strings_spic")
    comp(chords, B, s_b, ".xx", 55, 72, vel=96, size=3, step=1.0, gate=0.45, rng=r, bpb=M)

    choir = Part("choir", GM["choir"], level=-4, pan=0.0, reverb=0.55, hp=150)
    pad(choir, B, s_b, 52, 70, vel=100, size=4, bpb=M)
    oohs = Part("oohs", GM["oohs"], level=-10, pan=0.15, reverb=0.55, hp=150)
    pad(oohs, BRIDGE, s_br, 52, 69, vel=74, size=3, bpb=M)

    horns = Part("horns", GM["horn"], level=-7, pan=-0.3, reverb=0.45, hp=80, sound="horns4")
    pad(horns, B, s_b, 50, 64, vel=92, size=2, bpb=M)

    piano = Part("piano", GM["piano"], level=-6, pan=0.25, reverb=0.45, hp=90, humanize=0.008)
    lead(piano, MEL_BRIDGE, s_br, vel=80, octave=0, bpb=M)
    arp(piano, BRIDGE, s_br, [0, 2, 3, 2, 1, 2], 0.5, 43, vel=58, span=2, rng=r, bpb=M)

    timp = Part("timpani", GM["timpani"], level=-5, reverb=0.4, hp=40, humanize=0.003)
    for t, _, c in progression(B, M):
        if int(round(t / M)) % 2 == 0:
            timp.add(s_b + t, 1.0, 38 + (c.root - 38) % 12, 104)
    roll = Part("timp_roll", GM["timpani"], level=-6, reverb=0.4, hp=40, sound="timp_roll")
    timp_roll(roll, bar(22), 6.0, 38, 108)  # D のロールでサビへ
    roll.swell(bar(22), bar(24), 40, 127, steps=16)

    bells = Part("bells", GM["tubular"], level=-11, pan=0.25, reverb=0.55, hp=200)
    for b, p in ((24, 67), (28, 69), (32, 67), (36, 62)):
        bells.add(bar(b), 3.0, p, 92)

    dr = Part("drums", KIT["orchestra"], drum=True, level=-8, reverb=0.4, humanize=0.002)
    cymbal_swell(dr, s_b, 6.0, 104)
    crash(dr, s_b, 108)
    crash(dr, bar(32), 96, kick=False)
    cymbal_swell(dr, bar(48), 6.0, 76)  # ループの頭へ柔らかく戻る

    song = Song(
        id="spsp_abyss", seed=SEED, title="SPSP（深淵）", bpm=BPM, bars=48, meter=M, key="G minor", reverb_rt=3.0,
        parts=[organ, full, harp, violins, flute, low, celli, pizz, chords, choir, oohs, horns, piano, timp,
               roll, bells, dr],
        sections=[
            Section("序奏（オルガンとハープ）", 8, INTRO), Section("A（弦のワルツ）", 16, A),
            Section("サビ（合唱とフルオルガン）", 16, B), Section("ブリッジ（ピアノ）", 8, BRIDGE),
        ],
    )
    song.check()
    return song
