"""SP リーチ（黒嵐との戦い）: 160 BPM, ニ短調. 歪んだギターの刻みと強いドラムの上で, ブラスとクワイアが歌う."""

from arrange import (GM, KIT, Part, Section, Song, bass, comp, crash, cymbal_swell, drums, fill, lead, pad,
                     power, progression, rng_for, timp_roll)

BPM = 160
INTRO = "Dm | Dm | Bb:2 C:2 | A"
A = "Dm | Dm | Bb | A | Dm | Dm | Eb | A"
B = "Bb | C | Dm | Dm | Bb | C | A | A"
C = "Dm | Bb | Gm | A | Dm | Bb | Eb | A7"
D = "Gm | Dm | Eb | A | Gm | Dm | Eb | A"
E = "Dm | Bb | Eb | A"

BRASS_C = ("D5:1.5 E5:.5 F5:1 A5:1 | Bb5:1.5 A5:.5 F5:1 D5:1 | G5:1 Bb5:1 A5:1 G5:1 | "
           "A5:2 C#5:1 E5:1 | D6:1.5 C6:.5 A5:1 F5:1 | F5:1 Bb5:1 D6:1 C6:1 | "
           "Bb5:1.5 G5:.5 Eb5:1 G5:1 | A5:2 E5:1 C#5:1")
CHOIR_B = "D5:2 F5:2 | E5:2 G5:2 | A5:3 F5:1 | D5:4 | D5:2 F5:2 | G5:2 C6:2 | C#6:2 A5:2 | E5:4"
HORN_D = "G4:4 | F4:2 A4:2 | Bb4:3 G4:1 | A4:4 | G4:2 Bb4:2 | A4:2 F4:2 | G4:2 Bb4:2 | A4:2 C#5:2"
INTRO_HITS = "D5:1 r:3 | D5:1 r:3 | Bb4:2 C5:2 | A4:2 C#5:1 E5:1"


def build() -> Song:
    r = rng_for("battle")
    bar = lambda b: b * 4.0  # noqa: E731
    s_a, s_b, s_c, s_d, s_e = bar(4), bar(12), bar(20), bar(28), bar(36)

    # 刻み（ブリッジミュート）: 左右に 1 本ずつ
    chug_l = Part("chug_l", GM["dist_gtr"], level=-6, pan=-0.7, reverb=0.05, hp=90, humanize=0.003)
    chug_r = Part("chug_r", GM["dist_gtr"], level=-6, pan=0.7, reverb=0.05, hp=90, humanize=0.003)
    gallop = "x.xxx.xxx.xxx.xx"
    straight = "xxxxxxxxxxxxxxxx"
    for part in (chug_l, chug_r):
        rr = rng_for("battle", part.name)
        power(part, A, s_a, gallop, vel=96, low=38, step=0.25, gate=0.5, fifth_only=True, rng=rr)
        power(part, C, s_c, straight, vel=98, low=38, step=0.25, gate=0.5, fifth_only=True, rng=rr)
        power(part, E, s_e, gallop, vel=100, low=38, step=0.25, gate=0.5, fifth_only=True, rng=rr)

    # 伸ばすパワーコード（オーバードライブ）
    od = Part("od_gtr", GM["od_gtr"], level=-7, pan=0.35, reverb=0.15, hp=110)
    power(od, INTRO, 0, "X-------", vel=100, low=38, step=0.5, gate=0.95, rng=r)
    power(od, B, s_b, "X---x---", vel=96, low=38, step=0.5, gate=0.95, rng=r)
    power(od, D, s_d, "X-------", vel=92, low=38, step=0.5, gate=0.95, rng=r)

    # A のリフ: 8 分で「ルート・ルート・3 度・ルート・4 度・ルート・5 度・経過音」. 属和音の小節は上へ抜ける
    riff = Part("riff", GM["dist_gtr"], level=-6, pan=-0.3, reverb=0.08, hp=100)
    for t, d, c in progression(A):
        root = 38 + (c.root - 38) % 12
        third = 3 if 3 in c.tones else 4
        shape = [0, 0, third, 0, 7, 10, 12, 13] if c.root == 9 else [0, 0, third, 0, 5, 0, 7, 6]
        for i, semi in enumerate(shape):
            riff.add(s_a + t + i * 0.5, 0.4, root + semi, 100 + (12 if i % 2 == 0 else 0) + r.randint(-5, 5))

    brass = Part("brass", GM["brass"], level=-2, pan=0.1, reverb=0.35, hp=120)
    lead(brass, INTRO_HITS, 0, vel=110)
    lead(brass, BRASS_C, s_c, vel=112)
    comp(brass, E, s_e, "X..X..X.", 58, 74, vel=104, size=3, step=0.5, gate=0.6, rng=r)

    trumpets = Part("trumpets", GM["trumpet"], level=-6, pan=-0.2, reverb=0.35, hp=200)
    lead(trumpets, BRASS_C, s_c, vel=100, octave=1)

    horns = Part("horns", GM["horn"], level=-4, pan=-0.1, reverb=0.4, hp=90)
    lead(horns, HORN_D, s_d, vel=100, legato=1.0)
    for i in range(4):  # 2 小節ごとのクレッシェンド
        horns.swell(s_d + 8 * i, s_d + 8 * i + 7, 88, 127, steps=10)
    horns.swell(s_e, s_e + 0.1, 127, 127, steps=1)
    pad(horns, A, s_a, 50, 62, vel=78, size=2)

    choir = Part("choir", GM["choir"], level=-4, pan=0.0, reverb=0.5, hp=160)
    lead(choir, CHOIR_B, s_b, vel=108, legato=1.0)
    pad(choir, C, s_c, 57, 74, vel=88, size=3)
    pad(choir, D, s_d, 55, 72, vel=80, size=3)
    pad(choir, INTRO, 0, 57, 72, vel=84, size=3)

    strings = Part("strings", GM["strings"], level=-6, pan=-0.35, reverb=0.35, hp=150)
    for prog, start in ((B, s_b), (C, s_c), (E, s_e)):
        comp(strings, prog, start, "xxxxxxxx", 55, 72, vel=84, size=3, step=0.5, gate=0.6, rng=r)
    pad(strings, D, s_d, 62, 79, vel=90, size=3)

    bs = Part("bass", GM["pick_bass"], level=-5, reverb=0.03, humanize=0.003)
    bass(bs, INTRO, 0, "whole", low=26, vel=96, rng=r)
    bass(bs, A, s_a, "gallop", low=26, vel=96, rng=r)
    bass(bs, B, s_b, "eighth", low=26, vel=96, rng=r)
    bass(bs, C, s_c, "eighth", low=26, vel=102, rng=r)
    bass(bs, D, s_d, "half", low=26, vel=94, rng=r)
    bass(bs, E, s_e, "gallop", low=26, vel=102, rng=r)

    timp = Part("timpani", GM["timpani"], level=-5, reverb=0.35, hp=40, humanize=0.003)
    whole = " | ".join([INTRO, A, B, C, D, E])
    for t, d, c in progression(whole):
        b = int(t // 4)
        root = 38 + (c.root - 38) % 12
        if root > 45:
            root -= 12
        hits = (0,) if b < 4 or 28 <= b < 36 else (0, 2.5)
        for p in hits:
            if p < d:
                timp.add(t + p, 1.0, root, 110 if p == 0 else 94)
    roll = Part("timp_roll", GM["timpani"], level=-5, reverb=0.35, hp=40, sound="timp_roll")
    timp_roll(roll, bar(39), 4.0, 38, 110)  # 最後の小節はロールで頭へ戻る
    roll.swell(bar(39), bar(40), 40, 127, steps=16)

    dr = Part("drums", KIT["power"], drum=True, level=-3, reverb=0.12, humanize=0.002)
    crash(dr, 0, 118)
    crash(dr, bar(1), 110)
    drums(dr, bar(2), {"k": "x.x.x.x.x.x.x.x.", "s": "....x.......x..."}, vel=100, rng=r)
    drums(dr, bar(3), {"k": "x...x...x...x..."}, vel=104, rng=r)
    fill(dr, bar(3), 4, "snare", 70, 120, rng=r)
    for b in range(4, 12):
        drums(dr, bar(b), {"k": "x.xxx.x.x.xxx.x.", "s": "....X.......X...",
                           "ch": "x.x.x.x.x.x.x.x."}, vel=100, rng=r)
    for b in (4, 8):
        crash(dr, bar(b), 118)
    fill(dr, bar(11) + 2, 2, "toms", 80, 118, rng=r)
    cymbal_swell(dr, s_b, 4.0, 100)
    for b in range(12, 20):
        drums(dr, bar(b), {"k": "x.....x.x.......", "s": "....X.......X...",
                           "rd": "x.x.x.x.x.x.x.x."}, vel=100, rng=r)
    for b in (12, 16):
        crash(dr, bar(b), 118)
    fill(dr, bar(19), 4, "snare", 70, 122, rng=r)
    cymbal_swell(dr, s_c, 8.0, 110)
    for b in range(20, 28):
        drums(dr, bar(b), {"k": "xxxxxxxxxxxxxxxx", "s": "....X.......X...",
                           "cr2": "x...x...x...x..."}, vel=100, rng=r)
    crash(dr, bar(20), 122)
    crash(dr, bar(24), 118)
    fill(dr, bar(27) + 2, 2, "toms", 86, 122, rng=r)
    crash(dr, bar(28), 118)
    for b in range(28, 36):  # 半分のテンポ感で大きく
        drums(dr, bar(b), {"k": "x.....x...x.....", "s": "........X.......",
                           "rd": "x...x...x...x..."}, vel=100, rng=r)
    crash(dr, bar(32), 112)
    fill(dr, bar(35), 4, "toms", 70, 120, rng=r)
    for b in range(36, 40):
        drums(dr, bar(b), {"k": "x.xxx.xxx.xxx.xx", "s": "....X.......X...",
                           "ch": "x.x.x.x.x.x.x.x."}, vel=104, rng=r)
    crash(dr, bar(36), 122)
    fill(dr, bar(39) + 2, 2, "snare", 90, 124, rng=r)

    song = Song(
        id="battle", title="SP リーチ（黒嵐戦）", bpm=BPM, bars=40, key="D minor", reverb_rt=1.8,
        parts=[chug_l, chug_r, od, riff, brass, trumpets, horns, choir, strings, bs, timp, roll, dr],
        sections=[
            Section("イントロ", 4, INTRO), Section("A（ギターのリフ）", 8, A),
            Section("B（クワイア）", 8, B), Section("サビ（ブラス）", 8, C),
            Section("D（半分のテンポ感）", 8, D), Section("E（戻り）", 4, E),
        ],
    )
    song.check()
    return song
