"""SPSP（物語）: 80 BPM, ロ短調. オーボエの序奏 → チェロの主題 → 合唱と弦の総奏でロ長調に開いて頭へ戻る."""

from arrange import (GM, KIT, Part, Section, Song, arp, bass, crash, cymbal_swell, lead, pad, progression,
                     rng_for, timp_roll)

BPM = 80
INTRO = "Bm | Gmaj7 | Em7 | F#sus4:2 F#:2"
A = "Bm | G | D | A | Bm | G | Em7 | F#sus4:2 F#:2"
B = "G | A | F#m7 | Bm | Em7 | F#m7 | G:2 A:2 | Bsus4:2 B:2"

MEL_INTRO = "r:2 F#5:1 E5:1 | D5:2 B4:2 | A4:1 B4:1 D5:1 E5:1 | C#5:4"
MEL_A = ("F#4:1.5 B4:.5 C#5:1 D5:1 | E5:1.5 D5:.5 B4:2 | A4:1 D5:1 F#5:1.5 E5:.5 | E5:3 C#5:1 | "
         "D5:1.5 C#5:.5 B4:1 F#4:1 | G4:1 B4:1 E5:1 D5:1 | D5:1.5 B4:.5 G4:1 E5:1 | F#5:2 E5:1 A#4:1")
MEL_B = ("D5:1 G5:1 F#5:1.5 E5:.5 | E5:1 A5:1 G5:1.5 F#5:.5 | F#5:1.5 E5:.5 C#5:1 A4:1 | B4:1 D5:1 F#5:2 | "
         "G5:1.5 F#5:.5 E5:1 B5:1 | A5:1.5 F#5:.5 E5:1 C#5:1 | D5:1 E5:1 F#5:1 A5:1 | F#5:2 D#5:2")


def build() -> Song:
    r = rng_for("spsp_story")
    bar = lambda b: b * 4.0  # noqa: E731
    s_a, s_b = bar(4), bar(12)

    oboe = Part("oboe", GM["oboe"], level=-4, pan=0.1, reverb=0.45, hp=200)
    lead(oboe, MEL_INTRO, 0, vel=78, legato=0.98)

    celli = Part("celli", GM["cello"], level=-3, pan=0.3, reverb=0.4, hp=60, sound="celli")
    lead(celli, MEL_A, s_a, vel=92, legato=1.0, octave=-1)
    celli.swell(s_a, s_a + 0.1, 100, 100, steps=1)
    for i in range(4):  # 2 小節ごとに膨らませて歌わせる
        celli.swell(s_a + 8 * i, s_a + 8 * i + 4, 96, 124, steps=8)
        celli.swell(s_a + 8 * i + 4, s_a + 8 * i + 8, 124, 100, steps=8)

    violins = Part("violins", GM["violin"], level=-2, pan=-0.35, reverb=0.45, hp=180, sound="violins")
    lead(violins, MEL_B, s_b, vel=104, legato=1.0, octave=1)
    violins2 = Part("violins2", GM["violin"], level=-5, pan=-0.15, reverb=0.45, hp=160, sound="violins")
    lead(violins2, MEL_B, s_b, vel=96, legato=1.0)  # 1 オクターブ下の第 2 ヴァイオリン

    strings = Part("strings", GM["slow_strings"], level=-8, pan=0.0, reverb=0.45, hp=90)
    pad(strings, INTRO, 0, 50, 69, vel=58)
    pad(strings, A, s_a, 50, 69, vel=72)
    pad(strings, B, s_b, 43, 62, vel=96)
    strings.swell(0, bar(4), 70, 105)
    strings.swell(s_a, s_a + 0.1, 105, 105, steps=1)

    basses = Part("basses", GM["contrabass"], level=-6, pan=0.4, reverb=0.35, hp=30, sound="basses")
    bass(basses, INTRO, 0, "whole", low=35, vel=70, rng=r)
    bass(basses, A, s_a, "whole", low=35, vel=84, rng=r)
    bass(basses, B, s_b, "half", low=31, vel=100, rng=r)

    choir = Part("choir", GM["choir"], level=-4, pan=0.0, reverb=0.55, hp=150)
    pad(choir, B, s_b, 52, 71, vel=100, size=4)
    oohs = Part("oohs", GM["oohs"], level=-9, pan=-0.1, reverb=0.55, hp=150)
    pad(oohs, A, s_a, 50, 67, vel=70, size=3)

    horns = Part("horns", GM["horn"], level=-6, pan=-0.3, reverb=0.45, hp=80, sound="horns4")
    pad(horns, B, s_b, 50, 65, vel=96, size=3)
    horns.swell(s_b, s_b + bar(2), 90, 127, steps=12)

    harp = Part("harp", GM["harp"], level=-8, pan=-0.35, reverb=0.45, hp=100)
    up = [0, 1, 2, 3, 4, 5, 4, 3]
    arp(harp, INTRO, 0, up, 0.5, 47, vel=72, span=3, rng=r)
    arp(harp, A, s_a, up, 0.5, 47, vel=78, span=3, rng=r)

    piano = Part("piano", GM["piano"], level=-12, pan=0.25, reverb=0.4, hp=120)
    for i, p in enumerate((83, 78, 74, 71)):  # 主題の前に高い音を 4 つ落とす
        piano.add(bar(3) + i, 1.0, p, 64 - 3 * i)

    timp = Part("timpani", GM["timpani"], level=-5, reverb=0.4, hp=40, humanize=0.003)
    for t, _, c in progression(B):  # コードが変わるたびにルートを 1 打
        timp.add(s_b + t, 1.0, 38 + (c.root - 38) % 12, 108 if t == 0 else 92)
    roll = Part("timp_roll", GM["timpani"], level=-6, reverb=0.4, hp=40, sound="timp_roll")
    timp_roll(roll, bar(11), 4.0, 42, 104)  # F# のロールでサビへ
    roll.swell(bar(11), bar(12), 40, 127, steps=16)
    roll.swell(bar(12) + 0.5, bar(12) + 0.6, 127, 127, steps=1)

    bells = Part("bells", GM["tubular"], level=-12, pan=0.25, reverb=0.5, hp=200)
    for b, p in ((12, 74), (16, 71)):
        bells.add(bar(b), 2.0, p, 90)

    dr = Part("drums", KIT["orchestra"], drum=True, level=-7, reverb=0.4, humanize=0.002)
    cymbal_swell(dr, s_b, 8.0, 104)
    crash(dr, s_b, 110)
    for b in range(13, 20):
        dr.add(bar(b), 1.0, 36, 88 if b % 2 else 98)
    cymbal_swell(dr, bar(20), 4.0, 80)  # ループの頭へ柔らかく戻る

    song = Song(
        id="spsp_story", title="SPSP（物語）", bpm=BPM, bars=20, key="B minor", reverb_rt=2.8,
        parts=[oboe, celli, violins, violins2, strings, basses, choir, oohs, horns, harp, piano, timp, roll, bells, dr],
        sections=[
            Section("序奏（オーボエ）", 4, INTRO), Section("A（チェロの主題）", 8, A),
            Section("サビ（合唱と弦）", 8, B),
        ],
    )
    song.check()
    return song
