"""RUSH 突入: 165 BPM, 約 4.4 秒. D → E で弦が駆け上がり, スネアの 16 分で煽って F# の長和音で決める."""

from arrange import GM, KIT, Part, Section, Song, crash, drums, fill, pad, power, rng_for, timp_roll

BPM = 165
CHORDS = "D | E"
HIT = 8.0  # 決めの一撃の拍
HOLD = 3.5
RISE = [62, 64, 66, 67, 69, 71, 73, 74, 76, 78, 80, 81, 83, 85, 86, 88]  # D4 → E6（8 分）


def build() -> Song:
    r = rng_for("rush_in")
    strings = Part("strings", GM["strings"], level=-3, pan=-0.2, reverb=0.35, hp=150)
    for i, p in enumerate(RISE):
        strings.add(i * 0.5, 0.5, p, 80 + 2 * i)
        strings.add(i * 0.5, 0.5, p - 12, 76 + 2 * i)
    pad(strings, f"F#:{HOLD}", HIT, 66, 85, vel=118, size=4)

    brass = Part("brass", GM["brass"], level=-3, pan=0.15, reverb=0.35, hp=120)
    pad(brass, "D | E", 0, 55, 72, vel=88, size=3)
    brass.swell(0, HIT - 0.1, 50, 120)
    brass.swell(HIT - 0.05, HIT, 127, 127, steps=1)
    pad(brass, f"F#:{HOLD}", HIT, 58, 75, vel=122, size=4)

    choir = Part("choir", GM["choir"], level=-7, reverb=0.5, hp=180)
    pad(choir, f"F#:{HOLD}", HIT, 61, 78, vel=110, size=3)

    hit = Part("orch_hit", GM["orch_hit"], level=-4, reverb=0.35, hp=150)
    for p in (66, 70, 73, 78):
        hit.add(HIT, 1.0, p, 122)

    gtr = Part("gtr", GM["dist_gtr"], level=-6, pan=0.4, reverb=0.1, hp=110)
    power(gtr, f"D:4 E:4 F#:{HOLD}", 0, "X-------", vel=100, low=38, step=0.5, gate=0.95, rng=r)

    timp = Part("timpani", GM["timpani"], level=-4, reverb=0.35, hp=40)
    timp.add(0, 1.0, 38, 112)
    timp.add(4, 1.0, 40, 114)
    timp.add(HIT, 2.0, 42, 124)
    roll = Part("timp_roll", GM["timpani"], level=-5, reverb=0.35, hp=40, sound="timp_roll")
    timp_roll(roll, 5.0, HIT - 5.0, 40, 116)  # E のロールで決めの一撃へ
    roll.swell(5.0, HIT, 50, 127, steps=12)

    bs = Part("bass", GM["pick_bass"], level=-6, reverb=0.05)
    for i in range(16):
        bs.add(i * 0.5, 0.45, 38 if i < 8 else 40, 96 + (10 if i % 2 == 0 else 0))
    bs.add(HIT, HOLD, 42, 116)

    dr = Part("drums", KIT["power"], drum=True, level=-3, reverb=0.15, humanize=0.0015)
    drums(dr, 0, {"k": "x...x...x...x..."}, vel=96, rng=r)
    drums(dr, 4, {"k": "x.x.x.x.x.x.x.x."}, vel=104, rng=r)
    fill(dr, 0, HIT, "snare", 40, 122, rng=r)
    crash(dr, HIT, 126)
    dr.add(HIT, 3.0, 57, 120)

    song = Song(id="rush_in", title="RUSH 突入", bpm=BPM, bars=2, key="F# major", loop=False,
                tail_beats=4.0, reverb_rt=2.0, lufs=-12.0,
                parts=[strings, brass, choir, hit, gtr, timp, roll, bs, dr],
                sections=[Section("突入", 2, CHORDS + " → F#")])
    song.check()
    return song
