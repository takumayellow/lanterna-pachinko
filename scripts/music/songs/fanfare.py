"""大当たり確定のファンファーレ: 132 BPM, ハ長調, 約 5.5 秒. 総奏の一撃 → トランペットの上昇 → bVI-bVII-I で決める."""

from arrange import GM, KIT, Part, Section, Song, crash, fill, lead, pad, rng_for

BPM = 132
CHORDS = "C | Ab:1 Bb:1 C:2"
TRUMPET = "C5:.5 r:.5 G4:.333 C5:.333 E5:.334 G5:1 E5:.5 G5:.5 | C6:1 D6:1 E6:2"
END = 6.0  # 最後の和音の拍
HOLD = 4.5  # 最後の和音を伸ばす拍数


def build() -> Song:
    r = rng_for("fanfare")
    trumpets = Part("trumpets", GM["trumpet"], level=-1, pan=0.1, reverb=0.4, hp=200)
    lead(trumpets, TRUMPET, 0, vel=112)
    trumpets.notes = [(t, HOLD if t >= END else d, p, v) for t, d, p, v in trumpets.notes]

    brass = Part("brass", GM["brass"], level=-3, pan=-0.1, reverb=0.4, hp=120)
    pad(brass, "C:0.75", 0, 55, 72, vel=118, size=4)
    pad(brass, "Ab:1 Bb:1", 4, 55, 72, vel=108, size=4, legato=0.9)
    pad(brass, f"C:{HOLD}", END, 55, 72, vel=118, size=4)

    horns = Part("horns", GM["horn"], level=-6, pan=-0.3, reverb=0.45, hp=90)
    pad(horns, f"C:4 Ab:1 Bb:1 C:{HOLD}", 0, 48, 64, vel=96, size=3)

    hit = Part("orch_hit", GM["orch_hit"], level=-5, reverb=0.4, hp=150)
    for t in (0, END):
        for p in (60, 64, 67, 72):
            hit.add(t, 1.0, p, 118)

    strings = Part("strings", GM["strings"], level=-6, pan=0.3, reverb=0.45, hp=150)
    run = [55, 57, 59, 60, 62, 64, 65, 67]  # 3 拍目からの 16 分の駆け上がり
    for i, p in enumerate(run):
        strings.add(2 + i * 0.25, 0.25, p + 12, 80 + 4 * i)
    pad(strings, f"Ab:1 Bb:1 C:{HOLD}", 4, 67, 84, vel=104, size=3)

    glock = Part("glock", GM["glock"], level=-10, pan=0.35, reverb=0.45, hp=500)
    for i, p in enumerate((72, 76, 79, 84, 88, 91, 96)):
        glock.add(END + i * 0.25, 1.0, p, 96)

    timp = Part("timpani", GM["timpani"], level=-3, reverb=0.4, hp=40, humanize=0.002)
    timp.add(0, 1.5, 43, 120)
    timp.add(0, 1.5, 48, 116)
    timp.add(4, 1.0, 44, 104)
    timp.add(5, 1.0, 46, 108)
    for i in range(8):
        timp.add(5 + i * 0.125, 0.125, 46, 80 + 4 * i)
    timp.add(END, 2.0, 48, 124)
    timp.add(END, 2.0, 43, 116)

    bs = Part("bass", GM["contrabass"], level=-6, reverb=0.2)
    for t, d, p in ((0, 1.5, 36), (4, 1, 32), (5, 1, 34), (END, HOLD, 36)):
        bs.add(t, d, p, 110)

    dr = Part("drums", KIT["orchestra"], drum=True, level=-4, reverb=0.3, humanize=0.0015)
    crash(dr, 0, 122)
    fill(dr, 4, 2, "roll", 60, 118, rng=r)
    crash(dr, END, 124)
    dr.add(END, 3.0, 57, 116)  # 2 枚目のクラッシュを重ねて厚く

    song = Song(id="fanfare", title="大当たりファンファーレ", bpm=BPM, bars=2, key="C major",
                loop=False, tail_beats=4.0, reverb_rt=2.2, lufs=-12.0,
                parts=[trumpets, brass, horns, hit, strings, glock, timp, bs, dr],
                sections=[Section("ファンファーレ", 2, CHORDS)])
    song.check()
    return song
