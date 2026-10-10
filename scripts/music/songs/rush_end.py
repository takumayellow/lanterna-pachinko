"""RUSH 終了: 84 BPM, ニ短調, 約 3.9 秒. ピアノの短い旋律を弦とクワイアで包み, 短調の終止で閉じる."""

from arrange import GM, Part, Section, Song, lead, pad

BPM = 84
CHORDS = "Bbmaj7:1.5 A7sus4:.75 A7:.75 Dm:1"
TAIL = 1.5
HELD = CHORDS.replace("Dm:1", f"Dm:{1 + TAIL}")  # 最後の和音は余韻まで伸ばす
MELODY = "D5:.5 C5:.5 A4:.5 D5:.75 C#5:.75 D5:1"


def build() -> Song:
    piano = Part("piano", GM["piano"], level=-2, pan=0.1, reverb=0.45, hp=80, humanize=0.006)
    lead(piano, MELODY, 0, vel=92, legato=1.0)
    piano.notes = [(t, 1 + TAIL if t >= 3 else d, p, v) for t, d, p, v in piano.notes]
    pad(piano, HELD, 0, 50, 65, vel=70, size=3)

    strings = Part("strings", GM["slow_strings"], level=-5, pan=-0.2, reverb=0.5, hp=120)
    pad(strings, HELD, 0, 57, 74, vel=88, size=4)

    choir = Part("oohs", GM["oohs"], level=-8, pan=0.2, reverb=0.55, hp=180)
    pad(choir, HELD, 0, 60, 76, vel=80, size=3)

    cello = Part("cello", GM["cello"], level=-6, pan=-0.1, reverb=0.4, hp=50)
    for t, d, p in ((0, 1.5, 46), (1.5, 1.5, 45), (3, 1 + TAIL, 38)):
        cello.add(t, d, p, 92)

    song = Song(id="rush_end", title="RUSH 終了", bpm=BPM, bars=1, key="D minor", loop=False,
                tail_beats=TAIL, reverb_rt=2.4, lufs=-12.0,
                parts=[piano, strings, choir, cello],
                sections=[Section("終止", 1, CHORDS)])
    song.check()
    return song
