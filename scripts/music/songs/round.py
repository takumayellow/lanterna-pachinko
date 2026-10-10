"""大当たりラウンド: 170 BPM, ホ長調. アニソン系の J-ROCK. 王道進行（IV-V-iii-vi）のサビをシンセリードと弦で歌う."""

from arrange import (GM, KIT, Part, Section, Song, bass, comp, crash, drums, fill, lead, pad, power,
                     rng_for)

BPM = 170
INTRO = "E | C#m | A | B"
A = "C#m | A | B | E | C#m | A | F#m | B"
B = "A | B | G#m | C#m | F#m | G#m | A | Bsus4:2 B:2"
CHORUS = ("Amaj7 | B | G#m7 | C#m | F#m7 | B | E | E | "
          "Amaj7 | B | G#m7 | C#m | F#m7 | G#m7 | A | B")
INTER = INTRO

RIFF = ("E5:.5 F#5:.5 G#5:.5 B5:1 G#5:.5 F#5:.5 E5:.5 | E5:.5 F#5:.5 G#5:.5 C#6:1 B5:.5 G#5:.5 E5:.5 | "
        "F#5:.5 G#5:.5 A5:.5 C#6:1 B5:.5 A5:.5 F#5:.5 | D#5:1 F#5:1 B5:2")
VERSE = ("G#4:.5 G#4:.5 B4:.5 C#5:1 B4:.5 G#4:1 | A4:.5 B4:.5 C#5:.5 E5:1 C#5:.5 B4:1 | "
         "B4:.5 D#5:.5 F#5:1 E5:.5 D#5:.5 B4:1 | G#4:2 r:1.5 B4:.5 | "
         "G#4:.5 G#4:.5 B4:.5 C#5:1 B4:.5 G#4:1 | C#5:.5 E5:.5 F#5:.5 E5:1 C#5:.5 A4:1 | "
         "F#4:.5 A4:.5 C#5:.5 E5:1 D#5:.5 C#5:1 | D#5:2 F#5:2")
PRE = ("C#5:1 E5:1 A5:1.5 G#5:.5 | F#5:1 D#5:1 B4:2 | B4:1 D#5:1 G#5:1.5 F#5:.5 | E5:3 r:1 | "
       "A5:1 G#5:1 F#5:1 E5:1 | D#5:1 F#5:1 B5:1.5 A5:.5 | C#6:1 B5:1 A5:1 C#6:1 | B5:2 r:2")
HOOK = ("E5:.5 A5:.5 B5:.5 C#6:1 B5:.5 A5:1 | F#5:.5 B5:.5 C#6:.5 D#6:1 C#6:.5 B5:1 | "
        "B5:1 G#5:.5 B5:.5 D#6:1.5 C#6:.5 | C#6:2 r:.5 G#5:.5 C#6:.5 D#6:.5 | ")
CHORUS_MEL = (HOOK + "E6:1 C#6:.5 A5:.5 F#5:1 A5:1 | D#6:1 B5:.5 F#5:.5 A5:1 B5:1 | "
              "G#5:1.5 B5:.5 E6:2 | E6:1.5 D#6:.5 C#6:.5 B5:.5 G#5:1 | "
              + HOOK + "A5:.5 B5:.5 C#6:1 E6:1 C#6:1 | D#6:.5 E6:.5 D#6:1 B5:1 G#5:1 | "
              "C#6:1.5 B5:.5 A5:1 C#6:1 | D#6:2 F#6:2")


def build() -> Song:
    r = rng_for("round")
    bar = lambda b: b * 4.0  # noqa: E731
    s_a, s_b, s_c, s_i = bar(4), bar(12), bar(20), bar(36)

    synth = Part("lead", GM["saw"], level=-3, pan=0.0, reverb=0.25, hp=250)
    lead(synth, RIFF, 0, vel=100)
    lead(synth, VERSE, s_a, vel=96)
    lead(synth, PRE, s_b, vel=100)
    lead(synth, CHORUS_MEL, s_c, vel=108)

    violins = Part("violins", GM["strings"], level=-5, pan=-0.25, reverb=0.35, hp=220)
    pad(violins, B, s_b, 60, 76, vel=80, size=3)
    lead(violins, CHORUS_MEL, s_c, vel=100, legato=1.0)

    bells = Part("bells", GM["glock"], level=-11, pan=0.35, reverb=0.35, hp=500)
    lead(bells, RIFF, 0, vel=84)
    lead(bells, HOOK, s_c, vel=84)

    gtr_lead = Part("gtr_lead", GM["od_gtr"], level=-5, pan=0.15, reverb=0.2, hp=180)
    lead(gtr_lead, RIFF, s_i, vel=104, octave=-1)

    brass = Part("brass", GM["brass"], level=-6, pan=0.2, reverb=0.3, hp=150)
    comp(brass, INTRO, 0, "X..X..X.", 59, 76, vel=100, size=3, step=0.5, gate=0.5, rng=r)
    comp(brass, CHORUS, s_c, "X.......", 59, 76, vel=96, size=3, step=0.5, gate=0.6, rng=r)
    comp(brass, INTER, s_i, "X..X..X.", 59, 76, vel=100, size=3, step=0.5, gate=0.5, rng=r)

    mute_l = Part("mute_l", GM["dist_gtr"], level=-8, pan=-0.7, reverb=0.05, hp=100, humanize=0.003)
    mute_r = Part("mute_r", GM["dist_gtr"], level=-8, pan=0.7, reverb=0.05, hp=100, humanize=0.003)
    for part in (mute_l, mute_r):
        rr = rng_for("round", part.name)
        power(part, A, s_a, "xxxxxxxx", vel=86, low=40, step=0.5, gate=0.35, fifth_only=True, rng=rr)
        power(part, INTRO, 0, "X-----x-", vel=96, low=40, step=0.5, gate=0.9, rng=rr)
        power(part, INTER, s_i, "X-----x-", vel=96, low=40, step=0.5, gate=0.9, rng=rr)
        power(part, B, s_b, "X---x---", vel=92, low=40, step=0.5, gate=0.9, rng=rr)
        power(part, CHORUS, s_c, "X-x-x-x-", vel=96, low=40, step=0.5, gate=0.9, rng=rr)

    piano = Part("piano", GM["bright_piano"], level=-9, pan=0.3, reverb=0.25, hp=200)
    comp(piano, A, s_a, "x..x..x.", 60, 76, vel=78, size=4, step=0.5, gate=0.7, rng=r)
    comp(piano, CHORUS, s_c, "xxxxxxxx", 60, 76, vel=82, size=4, step=0.5, gate=0.6, rng=r)

    bs = Part("bass", GM["pick_bass"], level=-5, reverb=0.03, humanize=0.003)
    for prog, start in ((INTRO, 0), (A, s_a), (B, s_b), (CHORUS, s_c), (INTER, s_i)):
        bass(bs, prog, start, "eighth", low=28, vel=96, rng=r)

    dr = Part("drums", KIT["power"], drum=True, level=-3, reverb=0.12, humanize=0.002)
    rock = {"k": "x.....x.x.......", "s": "....X.......X...", "ch": "x.x.x.x.x.x.x.x."}
    chorus_beat = {"k": "x.....x.x.x.....", "s": "....X.......X...", "rd": "x.x.x.x.x.x.x.x."}
    crash(dr, 0, 118)
    for b in range(0, 4):
        drums(dr, bar(b), {"k": "x.....x.x.......", "s": "....X.......X...", "oh": "x.x.x.x.x.x.x.x."},
              vel=100, rng=r)
    fill(dr, bar(3) + 3, 1, "snare", 80, 116, rng=r)
    for b in range(4, 12):
        drums(dr, bar(b), rock, vel=96, rng=r)
    crash(dr, s_a, 112)
    fill(dr, bar(7) + 3.5, 0.5, "snare", 90, 104, rng=r)
    fill(dr, bar(11) + 3, 1, "snare", 80, 116, rng=r)
    crash(dr, s_b, 112)
    for b in range(12, 19):
        drums(dr, bar(b), {"k": "x...x...x...x...", "s": "....X.......X...", "ch": "x.x.x.x.x.x.x.x."},
              vel=98, rng=r)
    crash(dr, bar(16), 110)
    drums(dr, bar(19), {"k": "x...x...x...x..."}, vel=104, rng=r)
    fill(dr, bar(19), 4, "snare", 70, 124, rng=r)
    for b in range(20, 36):
        drums(dr, bar(b), chorus_beat, vel=100, rng=r)
        if b % 2 == 0:
            crash(dr, bar(b), 118 if b % 8 == 4 else 112)
    fill(dr, bar(27) + 2, 2, "toms", 84, 120, rng=r)
    fill(dr, bar(35) + 2, 2, "toms", 84, 122, rng=r)
    crash(dr, s_i, 120)
    for b in range(36, 40):
        drums(dr, bar(b), {"k": "x.....x.x.......", "s": "....X.......X...", "oh": "x.x.x.x.x.x.x.x."},
              vel=100, rng=r)
    fill(dr, bar(39) + 2, 2, "snare", 84, 122, rng=r)

    song = Song(
        id="round", title="大当たりラウンド", bpm=BPM, bars=40, key="E major", reverb_rt=1.6,
        parts=[synth, violins, bells, gtr_lead, brass, mute_l, mute_r, piano, bs, dr],
        sections=[
            Section("イントロ（リフ）", 4, INTRO), Section("A メロ", 8, A), Section("B メロ", 8, B),
            Section("サビ", 16, CHORUS), Section("間奏（ギターのリフ）", 4, INTER),
        ],
    )
    song.check()
    return song
