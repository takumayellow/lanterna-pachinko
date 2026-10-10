"""RUSH: 165 BPM, 嬰ヘ短調. 4 つ打ちのトランス × ロック. キックでパッドとベースを沈めて（ポンピング）走らせる."""

from arrange import (GM, KIT, Part, Section, Song, arp, bass, crash, drums, fill, lead, pad, power,
                     rng_for)

BPM = 165
INTRO = "F#m | D | A | E"
A = "F#m | D | A | E | F#m | D | Bm | C#7"
B = "D | E | C#m | F#m | Bm | C#m | D | E"
DROP = "F#m | D | A | E | F#m | D | Bm | C#7 | F#m | D | A | E | Bm | D | E | E"
POST = "F#m | D | A | E | F#m | D | E | C#7"

HOOK = ("F#5:.5 A5:.5 C#6:1 B5:.5 A5:.5 C#6:1 | D6:1.5 C#6:.5 A5:1 F#5:1 | "
        "E5:.5 A5:.5 C#6:1 B5:.5 A5:.5 E6:1 | E6:1.5 D6:.5 B5:1 G#5:1")
HOOK2 = "F#5:.5 A5:.5 C#6:1 B5:.5 A5:.5 F#6:1 | F#6:1 E6:.5 D6:.5 A5:1 D6:1"
DROP_MEL = (HOOK + " | " + HOOK2 + " | D6:1 C#6:.5 B5:.5 F#5:1 B5:1 | C#6:2 E#5:1 G#5:1 | " + HOOK
            + " | B5:.5 C#6:.5 D6:1 F#6:1 D6:1 | A5:.5 B5:.5 D6:1 E6:1 F#6:1 | G#6:1.5 F#6:.5 E6:1 B5:1 | E6:3 r:1")
COUNTER = "C#5:2 A4:2 | D5:2 F#5:2 | E5:2 C#5:2 | B4:4 | C#5:2 F#5:2 | A5:2 F#5:2 | D5:2 F#5:2 | E#5:2 G#5:2"
RISE = "A5:4 | B5:4 | C#6:4 | C#6:4 | D6:4 | E6:4 | F#6:4 | G#6:4"
POST_END = "E5:1 B4:1 G#4:1 B4:1 | C#5:2 E#4:1 G#4:1"


def build() -> Song:
    r = rng_for("rush")
    bar = lambda b: b * 4.0  # noqa: E731
    s_a, s_b, s_d, s_p = bar(4), bar(12), bar(20), bar(36)

    saw = Part("lead", GM["saw"], level=-3, pan=0.0, reverb=0.3, hp=250, duck=0.15)
    lead(saw, RISE, s_b, vel=92, legato=1.0)
    for i in range(8):
        saw.swell(s_b + 4 * i, s_b + 4 * i + 3.75, 70 + 5 * i, 96 + 4 * i, steps=8)
    saw.swell(s_d - 0.1, s_d, 127, 127, steps=1)
    lead(saw, DROP_MEL, s_d, vel=108)

    sbrass = Part("synth_brass", GM["synth_brass"], level=-7, pan=-0.2, reverb=0.25, hp=200, duck=0.2)
    lead(sbrass, DROP_MEL, s_d, vel=100, octave=-1)

    gtr = Part("gtr_lead", GM["od_gtr"], level=-5, pan=0.15, reverb=0.2, hp=180)
    lead(gtr, HOOK + " | " + HOOK2, s_p, vel=104, octave=-1)
    lead(gtr, POST_END, s_p + bar(6), vel=104)

    bells = Part("bells", GM["glock"], level=-10, pan=0.3, reverb=0.35, hp=500, duck=0.2)
    lead(bells, COUNTER, s_a, vel=88, octave=1)
    lead(bells, COUNTER, s_d + bar(8), vel=80, octave=1)

    arp_p = Part("arp", GM["square"], level=-10, pan=-0.3, reverb=0.25, hp=300, duck=0.35)
    order = [0, 1, 2, 4, 3, 2, 1, 2, 0, 1, 2, 4, 5, 4, 2, 1]
    for prog, start in ((INTRO, 0), (A, s_a), (B, s_b), (DROP, s_d), (POST, s_p)):
        arp(arp_p, prog, start, order, 0.25, 57, vel=80, span=2, gate=0.6, rng=r)

    padp = Part("pad", GM["polysynth"], level=-9, pan=0.2, reverb=0.4, hp=200, duck=0.6)
    for prog, start, vel in ((INTRO, 0, 70), (A, s_a, 74), (B, s_b, 80), (DROP, s_d, 86), (POST, s_p, 76)):
        pad(padp, prog, start, 57, 74, vel=vel, size=4)
    strings = Part("strings", GM["synth_strings"], level=-10, pan=-0.2, reverb=0.4, hp=200, duck=0.5)
    pad(strings, B, s_b, 62, 79, vel=78, size=3)
    pad(strings, DROP, s_d, 62, 79, vel=84, size=3)

    gtr_l = Part("gtr_l", GM["dist_gtr"], level=-8, pan=-0.7, reverb=0.05, hp=110, humanize=0.003)
    gtr_r = Part("gtr_r", GM["dist_gtr"], level=-8, pan=0.7, reverb=0.05, hp=110, humanize=0.003)
    for part in (gtr_l, gtr_r):
        rr = rng_for("rush", part.name)
        power(part, DROP, s_d, "xxxxxxxx", vel=94, low=40, step=0.5, gate=0.45, rng=rr)
        power(part, POST, s_p, "X-------", vel=90, low=40, step=0.5, gate=0.95, rng=rr)

    bs = Part("bass", GM["synth_bass"], level=-5, reverb=0.0, humanize=0.0, duck=0.5)
    bass(bs, A, s_a, "roll", low=30, vel=100, rng=r)
    bass(bs, B, s_b, "roll", low=30, vel=100, rng=r)
    bass(bs, DROP, s_d, "roll", low=30, vel=106, rng=r)
    bass(bs, POST, s_p, "roll", low=30, vel=100, rng=r)
    bass(bs, INTRO, 0, "whole", low=30, vel=90, rng=r)

    dr = Part("drums", KIT["standard"], drum=True, level=-3, reverb=0.1, humanize=0.0015)
    four = "x...x...x...x..."
    crash(dr, 0, 112)
    for b in range(0, 4):
        drums(dr, bar(b), {"k": four, "oh": "..x...x...x...x."}, vel=100, rng=r)
    fill(dr, bar(3) + 3, 1, "snare", 70, 108, rng=r)
    crash(dr, s_a, 112)
    for b in range(4, 12):
        drums(dr, bar(b), {"k": four, "cl": "....x.......x...", "oh": "..x...x...x...x.",
                           "ch": "x.xxx.xxx.xxx.xx"}, vel=100, rng=r)
    fill(dr, bar(11) + 3, 1, "snare", 80, 112, rng=r)
    crash(dr, s_b, 110)
    for b in range(12, 16):
        drums(dr, bar(b), {"k": four, "s": "x...x...x...x...", "oh": "..x...x...x...x."}, vel=96, rng=r)
    for b in (16, 17):
        drums(dr, bar(b), {"k": four, "s": "x.x.x.x.x.x.x.x."}, vel=98, rng=r)
    drums(dr, bar(18), {"k": four}, vel=100, rng=r)
    fill(dr, bar(18), 8, "snare", 70, 124, rng=r)
    for b in range(20, 36):
        drums(dr, bar(b), {"k": four, "cl": "....X.......X...", "s": "....x.......x...",
                           "oh": "..x...x...x...x.", "ch": "x.xxx.xxx.xxx.xx"}, vel=102, rng=r)
        if b % 4 == 0:
            crash(dr, bar(b), 120)
    fill(dr, bar(27) + 3, 1, "snare", 86, 120, rng=r)
    fill(dr, bar(35) + 2, 2, "toms", 86, 122, rng=r)
    crash(dr, s_p, 118)
    for b in range(36, 44):
        drums(dr, bar(b), {"k": four, "s": "....X.......X...", "rd": "x.x.x.x.x.x.x.x."}, vel=100, rng=r)
    crash(dr, bar(40), 112)
    fill(dr, bar(43) + 2, 2, "snare", 84, 120, rng=r)

    song = Song(
        id="rush", title="RUSH", bpm=BPM, bars=44, key="F# minor", reverb_rt=1.6, sub_kick=-7.0,
        parts=[saw, sbrass, gtr, bells, arp_p, padp, strings, gtr_l, gtr_r, bs, dr],
        sections=[
            Section("イントロ", 4, INTRO), Section("A（ベルの対旋律）", 8, A),
            Section("ビルド", 8, B), Section("ドロップ（サビ）", 16, DROP),
            Section("ポスト（ギターの旋律）", 8, POST),
        ],
    )
    song.check()
    return song
