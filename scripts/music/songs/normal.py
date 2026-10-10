"""通常時: 128 BPM, ニ短調. ピチカートとチェレスタ, クワイアのパッドで神秘的に. 聴き疲れしない薄めの編成."""

from arrange import GM, KIT, Part, Section, Song, arp, bass, crash, cymbal_swell, drums, fill, lead, pad, rng_for

BPM = 128
INTRO = "Dmadd9 | Bbmaj7 | Gm7 | A7sus4:2 A7:2"
A = "Dm | Bbmaj7 | Gm7 | A7 | Dm | F/C | Bbmaj7 | Asus4:2 A:2"
B = "Gm7 | C7 | Fmaj7 | Bbmaj7 | Em7b5 | A7 | Dm | A7/C#"
C = "Bb | C | Am7 | Dm | Gm7 | C | F | A7"
OUTRO = "Dm | Bbmaj7 | Gm6 | A7sus4:2 A7:2"

MEL_INTRO = ("D5:.5 A5:.5 F5:.5 E5:.5 D5:1 A4:1 | D5:.5 F5:.5 A5:.5 C6:.5 A5:2 | "
             "G5:.5 Bb5:.5 D6:.5 Bb5:.5 A5:1 G5:1 | E5:1 A4:1 C#5:1 E5:1")
MEL_A = ("A4:1 D5:.5 E5:.5 F5:1.5 E5:.5 | D5:1 C5:.5 D5:.5 A4:2 | Bb4:1 A4:.5 Bb4:.5 D5:1 F5:1 | "
         "E5:1.5 C#5:.5 A4:2 | A4:1 D5:.5 E5:.5 F5:1 A5:1 | G5:.5 F5:.5 E5:.5 F5:.5 C5:2 | "
         "D5:1 F5:.5 E5:.5 D5:1 Bb4:1 | D5:2 C#5:2")
MEL_B = ("D5:1.5 C5:.5 Bb4:1 G4:1 | E5:1.5 D5:.5 C5:1 Bb4:1 | A4:.5 C5:.5 F5:1 E5:2 | "
         "D5:1.5 C5:.5 A4:2 | G5:1.5 F5:.5 E5:1 D5:1 | C#5:1.5 E5:.5 G5:2 | "
         "F5:1 E5:.5 D5:.5 A4:2 | A4:1 C#5:1 E5:1 G5:1")
MEL_C = ("F5:2 D5:1 F5:1 | G5:1.5 E5:.5 C5:1 G5:1 | A5:1.5 G5:.5 E5:1 C5:1 | F5:1 E5:1 D5:2 | "
         "Bb5:1.5 A5:.5 G5:1 D5:1 | C6:1.5 Bb5:.5 G5:1 E5:1 | A5:1 G5:.5 F5:.5 C5:1 F5:1 | "
         "E5:2 C#5:1 E5:1")
MEL_OUTRO = "A5:1.5 F5:.5 D5:2 | D5:1.5 C5:.5 A4:2 | Bb4:1 D5:1 E5:1 G5:1 | E5:2 C#5:2"


def build() -> Song:
    r = rng_for("normal")
    bar = lambda b: b * 4.0  # noqa: E731
    s_a, s_b, s_c, s_o = bar(4), bar(12), bar(20), bar(28)

    celesta = Part("celesta", GM["celesta"], level=-3, pan=0.15, reverb=0.4, hp=200)
    lead(celesta, MEL_INTRO, 0, vel=78)
    lead(celesta, MEL_A, s_a, vel=88)
    lead(celesta, MEL_OUTRO, s_o, vel=74)

    flute = Part("flute", GM["flute"], level=-4, pan=-0.1, reverb=0.35, hp=200)
    lead(flute, MEL_B, s_b, vel=86, legato=0.97)

    glock = Part("glock", GM["glock"], level=-9, pan=0.25, reverb=0.4, hp=400)
    lead(glock, MEL_C, s_c, vel=80, octave=1)

    violins = Part("violins", GM["strings"], level=-4, pan=-0.2, reverb=0.35, hp=150, sound="violins")
    lead(violins, MEL_C, s_c, vel=92, legato=1.0)

    pizz = Part("pizz", GM["pizz"], level=-8, pan=-0.35, reverb=0.3, hp=120)
    for prog, start in ((A, s_a), (B, s_b), (C, s_c)):
        arp(pizz, prog, start, [0, 2, 1, 2, 0, 3, 1, 2], 0.5, 50, vel=82, rng=r)

    harp = Part("harp", GM["harp"], level=-10, pan=0.35, reverb=0.45, hp=120)
    up = [0, 1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1]
    arp(harp, INTRO, 0, up, 0.25, 50, vel=70, span=3, rng=r)
    arp(harp, OUTRO, s_o, up, 0.25, 50, vel=64, span=3, rng=r)
    arp(harp, "Gm7:4", s_b - 4, up[:9] + [8] * 7, 0.25, 55, vel=72, span=3, rng=r)

    strings_pad = Part("strings_pad", GM["slow_strings"], level=-10, pan=0.1, reverb=0.4, hp=150)
    pad(strings_pad, A, s_a, 55, 72, vel=62)
    pad(strings_pad, B, s_b, 55, 72, vel=68)
    pad(strings_pad, C, s_c, 50, 67, vel=74)
    pad(strings_pad, OUTRO, s_o, 55, 72, vel=56)

    choir = Part("choir", GM["choir"], level=-11, pan=-0.05, reverb=0.5, hp=180)
    pad(choir, INTRO, 0, 57, 74, vel=58, size=3)
    pad(choir, C, s_c, 57, 76, vel=70, size=3)

    bs = Part("bass", GM["finger_bass"], level=-5, reverb=0.05, humanize=0.003)
    bass(bs, INTRO, 0, "whole", low=26, vel=80, rng=r)
    bass(bs, A, s_a, "half", low=26, vel=88, rng=r)
    bass(bs, B, s_b, "half", low=26, vel=90, rng=r)
    bass(bs, C, s_c, "walk", low=26, vel=92, rng=r)
    bass(bs, OUTRO, s_o, "whole", low=26, vel=80, rng=r)

    dr = Part("drums", KIT["room"], drum=True, level=-6, reverb=0.18, humanize=0.002)
    for b in (2, 3):
        drums(dr, bar(b), {"sh": "x.x.x.x.x.x.x.x.", "k": "x..............."}, vel=72, rng=r)
    for b in range(4, 12):
        drums(dr, bar(b), {"k": "x.......x.x.....", "ss": "....x.......x...",
                           "ch": "x.x.x.x.x.x.x.x."}, vel=86, rng=r)
    fill(dr, bar(11) + 3, 1, "snare", 50, 85, rng=r)
    for b in range(12, 20):
        drums(dr, bar(b), {"k": "x.......x.x.....", "ss": "....x.......x...",
                           "ch": "x.x.x.x.x.x.x.x.", "sh": "xxxxxxxxxxxxxxxx"}, vel=88, rng=r)
    fill(dr, bar(19) + 2, 2, "toms", 60, 100, rng=r)
    cymbal_swell(dr, bar(20), 4.0, 84)
    for b in range(20, 28):
        drums(dr, bar(b), {"k": "x.......x.x.....", "s": "....x.......x...",
                           "rd": "x.x.x.x.x.x.x.x.", "tam": "....x.......x..."}, vel=90, rng=r)
    crash(dr, bar(20), 108)
    crash(dr, bar(24), 100)
    fill(dr, bar(27) + 3, 1, "snare", 60, 95, rng=r)
    crash(dr, bar(28), 96)
    for b in range(28, 31):
        drums(dr, bar(b), {"k": "x.......x.......", "ch": "x.x.x.x.x.x.x.x."}, vel=76, rng=r)
    drums(dr, bar(31), {"sh": "x.x.x.x.x.x.x.x."}, vel=66, rng=r)

    song = Song(
        id="normal", title="通常時", bpm=BPM, bars=32, key="D minor", reverb_rt=2.4,
        parts=[celesta, flute, glock, violins, pizz, harp, strings_pad, choir, bs, dr],
        sections=[
            Section("イントロ", 4, INTRO), Section("A", 8, A), Section("B", 8, B),
            Section("サビ", 8, C), Section("アウトロ", 4, OUTRO),
        ],
    )
    song.check()
    return song
