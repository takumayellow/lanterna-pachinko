"""BGM を作曲 → 録音サンプル（一部 FluidSynth）で演奏 → ミックス → ffmpeg でマスタリング → mp3 と manifest.json に書き出す.

    python scripts/music/build.py            # 全曲
    python scripts/music/build.py normal rush  # 指定した曲だけ（manifest は既存の値とマージ）

中間物（MIDI・ステム・wav）は build-audio/ に, 成果物は public/audio/bgm/ に置く.
測定結果（ラウドネス・ピーク・継ぎ目など）は build-audio/report.json に書く.
"""

from __future__ import annotations

import importlib
import json
import sys
import os
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analyze import analyze  # noqa: E402
from arrange import Song  # noqa: E402
from docs import write_docs  # noqa: E402
from master import assemble_loop, encode, master  # noqa: E402
from mix import mix_song  # noqa: E402
from render import BUILD, ROOT, SR, render_song  # noqa: E402

import sampled  # noqa: E402
import samples  # noqa: E402

SONG_IDS = ["normal", "chance", "reach", "battle", "round", "rush", "lt", "fanfare", "rush_in", "rush_end",
            "spsp_story", "spsp_storm", "spsp_abyss"]
OUT_DIR = ROOT / "public" / "audio" / "bgm"
SIZE_LIMIT = 15 * 1024 * 1024
TP_MAX = -1.0  # mp3 のトゥルーピークの上限（dBTP）


def load(song_id: str) -> Song:
    return importlib.import_module(f"songs.{song_id}").build()


def build_one(song: Song, pool: ProcessPoolExecutor) -> tuple[dict, dict]:
    t0 = time.time()
    stems = render_song(song, pool)
    x = mix_song(song, stems)
    work = BUILD / "master"
    mp3 = OUT_DIR / f"{song.id}.mp3"
    ceiling = -2.0
    while True:
        body, mode = master(x, work, song.id, song.lufs, song.loop, ceiling_db=ceiling)
        if song.loop:
            y, start, end = assemble_loop(body)
            loop = (start, end)
            body_end = end
        else:
            y, loop, body_end = body, None, len(body)
        encode(y, work, mp3)
        rep = analyze(mp3, y, loop, body_end)
        # mp3 にするとサンプル間のピークが少し上がる. -1 dBTP を超えたらリミッタを下げて作り直す
        if rep["true_peak"] <= TP_MAX:
            break
        if ceiling <= -5.0:
            raise RuntimeError(f"{song.id}: トゥルーピークが {rep['true_peak']} dBTP（上限 {TP_MAX}）")
        ceiling -= 1.0
    rep["loudnorm"] = mode
    entry = {
        "id": song.id,
        "file": f"{song.id}.mp3",
        "loop": song.loop,
        "loopStart": round(loop[0] / SR, 9) if loop else None,
        "loopEnd": round(loop[1] / SR, 9) if loop else None,
        "loopStartSample": loop[0] if loop else None,
        "loopEndSample": loop[1] if loop else None,
        "bpm": song.bpm,
        "lufs": rep["lufs"],
    }
    print(f"{song.id:9s} {rep['seconds']:6.2f}s  {rep['lufs']:6.1f} LUFS  TP {rep['true_peak']:5.1f}  "
          f"offset {rep['offset']}  seam {rep.get('seam')}  {rep['kbytes']} KB  ({time.time() - t0:.0f}s)")
    return entry, rep


def main(argv: list[str]) -> int:
    ids = argv or SONG_IDS
    unknown = [i for i in ids if i not in SONG_IDS]
    if unknown:
        print("未知の曲:", unknown)
        return 2
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT_DIR / "manifest.json"
    report_path = BUILD / "report.json"
    old = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"tracks": []}
    entries = {e["id"]: e for e in old["tracks"]}
    reports = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {}

    samples.ensure()
    songs = {}
    workers = max(2, min(10, (os.cpu_count() or 4) - 2))
    with ProcessPoolExecutor(max_workers=workers) as pool:
        sampled.prepare(pool)
        for song_id in ids:
            song = load(song_id)
            songs[song_id] = song
            entries[song_id], reports[song_id] = build_one(song, pool)

    manifest = {"sampleRate": SR, "tracks": [entries[i] for i in SONG_IDS if i in entries]}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    BUILD.mkdir(exist_ok=True)
    report_path.write_text(json.dumps(reports, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    written = [i for i in SONG_IDS if (Path(__file__).parent / "songs" / f"{i}.py").exists()]
    write_docs([songs.get(i) or load(i) for i in written], ROOT / "docs" / "music.md")

    total = sum((OUT_DIR / f"{i}.mp3").stat().st_size for i in SONG_IDS if (OUT_DIR / f"{i}.mp3").exists())
    print(f"合計 {total / 1024 / 1024:.2f} MB")
    if total > SIZE_LIMIT:
        print("合計サイズが 15 MB を超えた")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
