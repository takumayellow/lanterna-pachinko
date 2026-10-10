"""LT（上位 RUSH）: 172 BPM, イ長調. RUSH（嬰ヘ短調）の平行調へ明るく上がり, 4 つ打ちとシンセの上に
金管セクション・トランペット・ホルン 4 本・合唱を厚く重ねて, RUSH より一段派手にする."""

from arrange import (GM, KIT, Part, Section, Song, arp, bass, comp, crash, cymbal_swell, drums, fill, lead,
                     pad, power, progression, rng_for, timp_roll)

BPM = 172
INTRO = "A | F#m | D | E"
A = "A | E | F#m | D | A | E | D | E"
B = "Bm | C#m | D | E | Bm | C#m | D | Esus4:2 E:2"
SABI = "D | E | C#m | F#m | Bm | E | A | A | D | E | C#m | F#m | Bm | D | Esus4:2 E:2 | E"
POST = A

# A: ホルン 4 本の呼び掛け（合唱が和音で応える）
HORNS_A = ("E5:1 A5:1 C#6:1 B5:.5 A5:.5 | B5:2 G#5:1 E5:1 | F#5:1 A5:1 C#6:1.5 B5:.5 | A5:2 F#5:2 | "
           "E5:1 A5:1 C#6:1 E6:1 | D6:1.5 C#6:.5 B5:2 | A5:1 B5:1 D6:1 F#6:1 | E6:2 B5:1 G#5:1")
# B: 全音符で上がる弦と, 合唱の伸ばし
RISE = "B4:4 | C#5:4 | D5:4 | E5:4 | F#5:4 | G#5:4 | A5:4 | B5:4"
# サビ: 金管と合唱の主題
SABI_MEL = ("F#5:1 A5:1 D6:1.5 C#6:.5 | B5:1 E6:1 B5:1 G#5:1 | C#6:1.5 B5:.5 G#5:1 E5:1 | "
            "F#5:1 A5:1 C#6:2 | D6:1.5 C#6:.5 B5:1 F#5:1 | G#5:1 B5:1 E6:1 D6:1 | C#6:3 B5:.5 A5:.5 | "
            "A5:2 E5:1 A5:1 | "
            "F#5:1 A5:1 D6:1.5 E6:.5 | E6:1 D6:.5 C#6:.5 B5:1 G#5:1 | E6:1.5 C#6:.5 G#5:1 C#6:1 | "
            "A5:1 C#6:1 F#6:2 | F#6:1 E6:.5 D6:.5 B5:1 D6:1 | A5:1 D6:1 F#6:1 E6:1 | "
            "E6:1 A5:1 B5:1 G#5:1 | E6:3 r:1")
# サビの裏でベルが 8 分の分散和音
BELLS = ("A6:.5 F#6:.5 D6:.5 F#6:.5 A6:2 | G#6:.5 E6:.5 B5:.5 E6:.5 G#6:2 | "
         "G#6:.5 E6:.5 C#6:.5 E6:.5 G#6:2 | A6:.5 F#6:.5 C#6:.5 F#6:.5 A6:2")
# ポスト: 合唱が A の呼び掛けを歌い, 最後はトランペットが頭へ戻す
POST_TPT = "r:4 | r:4 | r:4 | r:4 | r:4 | r:4 | r:4 | E6:1 D6:1 B5:1 G#5:1"


def build() -> Song:
    r = rng_for("lt")
    bar = lambda b: b * 4.0  # noqa: E731
    s_a, s_b, s_s, s_p = bar(4), bar(12), bar(20), bar(36)

    brass = Part("brass", GM["brass"], level=-1, pan=0.0, reverb=0.35, hp=110)
    comp(brass, INTRO, 0, "X..X..X.", 57, 74, vel=112, size=4, step=0.5, gate=0.6, rng=r)
    lead(brass, SABI_MEL, s_s, vel=114)
    comp(brass, POST, s_p, "X..x..x.", 57, 74, vel=104, size=3, step=0.5, gate=0.55, rng=r)

    trumpets = Part("trumpets", GM["trumpet"], level=-5, pan=0.25, reverb=0.35, hp=220)
    lead(trumpets, SABI_MEL, s_s, vel=104)
    lead(trumpets, POST_TPT, s_p, vel=108)

    horns = Part("horns", GM["horn"], level=-3, pan=-0.25, reverb=0.4, hp=90, sound="horns4")
    lead(horns, HORNS_A, s_a, vel=104, octave=-1)
    lead(horns, SABI_MEL, s_s, vel=96, octave=-1)

    trombones = Part("trombones", GM["trombone"], level=-5, pan=0.4, reverb=0.3, hp=70)
    comp(trombones, A, s_a, "X---x---", 45, 60, vel=92, size=3, step=0.5, gate=0.85, rng=r)
    comp(trombones, B, s_b, "x--x--x-", 45, 60, vel=96, size=3, step=0.5, gate=0.7, rng=r)
    comp(trombones, SABI, s_s, "X-------", 45, 60, vel=104, size=3, step=0.5, gate=0.95, rng=r)

    choir = Part("choir", GM["choir"], level=-3, pan=0.0, reverb=0.5, hp=150)
    pad(choir, INTRO, 0, 55, 72, vel=96, size=4)
    pad(choir, A, s_a, 52, 69, vel=78, size=3)
    lead(choir, SABI_MEL, s_s, vel=112, legato=1.0)
    lead(choir, HORNS_A, s_p, vel=104, legato=1.0)
    oohs = Part("oohs", GM["oohs"], level=-7, pan=0.1, reverb=0.55, hp=170)
    pad(oohs, B, s_b, 55, 74, vel=80, size=4)
    pad(oohs, SABI, s_s, 55, 74, vel=86, size=4)
    oohs.swell(s_b, s_s, 70, 124, steps=24)

    violins = Part("violins", GM["strings"], level=-5, pan=-0.3, reverb=0.4, hp=200, sound="violins")
    lead(violins, RISE, s_b, vel=98, legato=1.0, octave=1)
    for i in range(8):
        violins.swell(s_b + 4 * i, s_b + 4 * i + 3.5, 72 + 5 * i, 102 + 3 * i, steps=8)
    violins.swell(s_s - 0.25, s_s, 127, 110, steps=1)
    lead(violins, SABI_MEL, s_s, vel=94)

    strings = Part("strings", GM["strings"], level=-7, pan=-0.2, reverb=0.35, hp=150, sound="strings_spic")
    for prog, start in ((A, s_a), (SABI, s_s), (POST, s_p)):
        comp(strings, prog, start, "xxxxxxxx", 55, 72, vel=86, size=3, step=0.5, gate=0.5, rng=r)

    saw = Part("lead", GM["saw"], level=-8, pan=0.1, reverb=0.3, hp=300, duck=0.2)
    lead(saw, SABI_MEL, s_s, vel=100)

    arp_p = Part("arp", GM["square"], level=-11, pan=-0.35, reverb=0.25, hp=300, duck=0.35)
    order = [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 6, 5, 4, 3, 2]
    for prog, start in ((A, s_a), (B, s_b), (SABI, s_s), (POST, s_p)):
        arp(arp_p, prog, start, order, 0.25, 57, vel=78, span=2, gate=0.6, rng=r)

    padp = Part("pad", GM["polysynth"], level=-11, pan=0.2, reverb=0.4, hp=200, duck=0.6)
    for prog, start, vel in ((INTRO, 0, 74), (A, s_a, 74), (B, s_b, 80), (SABI, s_s, 86), (POST, s_p, 78)):
        pad(padp, prog, start, 57, 76, vel=vel, size=4)

    bells = Part("bells", GM["glock"], level=-12, pan=0.35, reverb=0.35, hp=500, duck=0.2)
    lead(bells, BELLS + " | " + BELLS, s_s, vel=84)

    gtr_l = Part("gtr_l", GM["dist_gtr"], level=-9, pan=-0.7, reverb=0.05, hp=110, humanize=0.003)
    gtr_r = Part("gtr_r", GM["dist_gtr"], level=-9, pan=0.7, reverb=0.05, hp=110, humanize=0.003)
    for part in (gtr_l, gtr_r):
        rr = rng_for("lt", part.name)
        power(part, B, s_b, "X---x---", vel=90, low=40, step=0.5, gate=0.9, rng=rr)
        power(part, SABI, s_s, "xxxxxxxx", vel=96, low=40, step=0.5, gate=0.45, rng=rr)
        power(part, POST, s_p, "X--x--x-", vel=94, low=40, step=0.5, gate=0.6, rng=rr)

    bs = Part("bass", GM["synth_bass"], level=-5, reverb=0.0, humanize=0.0, duck=0.5)
    bass(bs, INTRO, 0, "whole", low=33, vel=92, rng=r)
    for prog, start, vel in ((A, s_a, 100), (B, s_b, 100), (SABI, s_s, 108), (POST, s_p, 102)):
        bass(bs, prog, start, "roll", low=33, vel=vel, rng=r)

    timp = Part("timpani", GM["timpani"], level=-5, reverb=0.35, hp=40, humanize=0.003)
    for prog, start, beats in ((INTRO, 0, (0, 1.5, 3)), (B, s_b, (0, 2)), (SABI, s_s, (0, 2.5)),
                               (POST, s_p, (0, 1.5, 3))):
        for t, d, c in progression(prog):
            root = 38 + (c.root - 38) % 12
            for b in beats:
                if b < d:
                    timp.add(start + t + b, 1.0, root, 112 if b == 0 else 96)
    roll = Part("timp_roll", GM["timpani"], level=-5, reverb=0.35, hp=40, sound="timp_roll")
    timp_roll(roll, bar(19), 4.0, 40, 114)  # ビルドの終わり → サビ
    roll.swell(bar(19), bar(20), 50, 127, steps=12)
    timp_roll(roll, bar(43), 4.0, 40, 112)  # 最後の小節 → 頭へ戻る
    roll.swell(bar(43), bar(44), 40, 127, steps=16)

    hit = Part("orch_hit", GM["orch_hit"], level=-7, reverb=0.35, hp=80)
    for t, d, c in progression(INTRO):
        hit.add(t, 0.5, 57 + (c.root - 57) % 12, 112)
    for b in (36, 40):
        hit.add(bar(b), 0.5, 57, 112)
    for b in range(20, 36, 4):
        hit.add(bar(b), 0.5, 57, 116)

    dr = Part("drums", KIT["standard"], drum=True, level=-3, reverb=0.1, humanize=0.0015)
    four = "x...x...x...x..."
    crash(dr, 0, 118)
    for b in range(0, 4):
        drums(dr, bar(b), {"k": four, "s": "....x.......x...", "oh": "..x...x...x...x."}, vel=100, rng=r)
    fill(dr, bar(3) + 2, 2, "toms", 80, 118, rng=r)
    crash(dr, s_a, 118)
    for b in range(4, 12):
        drums(dr, bar(b), {"k": four, "cl": "....x.......x...", "oh": "..x...x...x...x.",
                           "ch": "x.xxx.xxx.xxx.xx"}, vel=100, rng=r)
    crash(dr, bar(8), 112)
    fill(dr, bar(11) + 3, 1, "snare", 80, 114, rng=r)
    cymbal_swell(dr, s_b, 4.0, 100)
    crash(dr, s_b, 112)
    for b in range(12, 16):
        drums(dr, bar(b), {"k": four, "s": "x...x...x...x...", "oh": "..x...x...x...x."}, vel=98, rng=r)
    for b in (16, 17):
        drums(dr, bar(b), {"k": four, "s": "x.x.x.x.x.x.x.x."}, vel=100, rng=r)
    drums(dr, bar(18), {"k": four}, vel=102, rng=r)
    fill(dr, bar(18), 8, "snare", 70, 126, rng=r)
    cymbal_swell(dr, s_s, 8.0, 112)
    for b in range(20, 36):
        drums(dr, bar(b), {"k": four, "cl": "....X.......X...", "s": "....x.......x...",
                           "oh": "..x...x...x...x.", "ch": "x.xxx.xxx.xxx.xx"}, vel=104, rng=r)
        if b % 2 == 0:
            crash(dr, bar(b), 120)
    fill(dr, bar(27) + 3, 1, "snare", 88, 122, rng=r)
    fill(dr, bar(35) + 2, 2, "toms", 88, 124, rng=r)
    crash(dr, s_p, 120)
    for b in range(36, 43):
        drums(dr, bar(b), {"k": four, "s": "....X.......X...", "rd": "x.x.x.x.x.x.x.x."}, vel=102, rng=r)
    crash(dr, bar(40), 114)
    drums(dr, bar(43), {"k": four}, vel=104, rng=r)
    fill(dr, bar(43), 4, "snare", 76, 124, rng=r)

    song = Song(
        id="lt", title="LT（上位 RUSH）", bpm=BPM, bars=44, key="A major", reverb_rt=1.8, sub_kick=-7.0,
        parts=[brass, trumpets, horns, trombones, choir, oohs, violins, strings, saw, arp_p, padp, bells,
               gtr_l, gtr_r, bs, timp, roll, hit, dr],
        sections=[
            Section("イントロ（金管と合唱の和音）", 4, INTRO), Section("A（ホルンの呼び掛け）", 8, A),
            Section("ビルド", 8, B), Section("サビ（金管と合唱の主題）", 16, SABI),
            Section("ポスト（合唱）", 8, POST),
        ],
    )
    song.check()
    return song
