"""パートごとのステム（32bit float の wav）を作る.

録音サンプルで鳴らせるパートは sampled.py で描く. 録音の元が無い音色（チェレスタ等）だけ, MIDI を書いて
FluidSynth + MS Basic.sf3 で鳴らす（MuseScore 4 の CLI は wav の書き出しに失敗し, MIDI 取り込みで
音価の量子化も掛かるため）.
"""

from __future__ import annotations

import hashlib
import io
import os
import shutil
import subprocess
import urllib.request
import zipfile
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from pathlib import Path

import mido
import numpy as np
import soundfile as sf

import instruments
import sampled
from arrange import Part, Song, humanized
from sampler import SR

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build-audio"
LEAD_IN_BEATS = 4.0  # 1 小節目の前に置く空白（揺らぎで先に出る音を切らないため）
TICKS = 960

FLUIDSYNTH_URL = (
    "https://github.com/FluidSynth/fluidsynth/releases/download/v2.6.1/"
    "fluidsynth-v2.6.1-win10-x64-cpp11.zip"
)
# GitHub のリリース資産に記載の sha256（取ってきた zip がこれと違えば使わない）
FLUIDSYNTH_SHA256 = "fab7a2e4b85675b66970f97a39bbc239729c5e0f237198b5922a6a73cbc8677c"
DEFAULT_SF = r"C:\Program Files\MuseScore 4\sound\MS Basic.sf3"


def soundfont() -> str:
    path = os.environ.get("MS_BASIC_SF", DEFAULT_SF)
    if not Path(path).exists():
        raise FileNotFoundError(f"MS Basic.sf3 が見つからない: {path}（MS_BASIC_SF で指定できる）")
    return path


def fluidsynth() -> str:
    """FluidSynth の実行ファイル. 環境変数 → PATH → build-audio/tools の順に探し, 無ければ公式配布を取ってくる."""
    env = os.environ.get("FLUIDSYNTH")
    if env and Path(env).exists():
        return env
    found = shutil.which("fluidsynth")
    if found:
        return found
    tools = BUILD / "tools" / "fluidsynth"
    stamp = tools / "VERIFIED_SHA256"
    hits = list(tools.rglob("fluidsynth.exe")) if tools.exists() else []
    # 検証済みの zip から展開したものだけを使い回す
    if hits and stamp.exists() and stamp.read_text(encoding="utf-8").strip() == FLUIDSYNTH_SHA256:
        return str(hits[0])
    if os.name != "nt":
        raise FileNotFoundError("fluidsynth が無い（パッケージマネージャで入れる）")
    tools.mkdir(parents=True, exist_ok=True)
    print("FluidSynth を取得中:", FLUIDSYNTH_URL)
    with urllib.request.urlopen(FLUIDSYNTH_URL, timeout=120) as res:  # noqa: S310 (固定の公式 URL)
        data = res.read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != FLUIDSYNTH_SHA256:
        raise RuntimeError(f"FluidSynth の zip のハッシュが違う: {digest}")
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        base = tools.resolve()
        for name in z.namelist():
            if not (base / name).resolve().is_relative_to(base):
                raise RuntimeError(f"zip に展開先の外を指すパスがある: {name}")
        z.extractall(tools)
    stamp.write_text(FLUIDSYNTH_SHA256, encoding="utf-8")
    return str(next(tools.rglob("fluidsynth.exe")))


def _midi_bytes(song: Song, part: Part) -> bytes:
    passes = 2 if song.loop else 1
    notes = humanized(song, part)
    ch = 9 if part.drum else 0
    events: list[tuple[int, int, mido.Message]] = []

    def tick(beat: float) -> int:
        return max(0, int(round((beat + LEAD_IN_BEATS) * TICKS)))

    for k in range(passes):
        off = k * song.beats
        for t, d, p, v in notes:
            events.append((tick(off + t), 1, mido.Message("note_on", channel=ch, note=p, velocity=v)))
            events.append((tick(off + t + d), 0, mido.Message("note_off", channel=ch, note=p, velocity=0)))
        for t, num, val in part.cc:
            events.append((tick(off + t), 0, mido.Message("control_change", channel=ch, control=num, value=val)))
    events.sort(key=lambda e: (e[0], e[1]))

    mid = mido.MidiFile(ticks_per_beat=TICKS)
    tr = mido.MidiTrack()
    mid.tracks.append(tr)
    tr.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(song.bpm)))
    # 音量・パン・エクスプレッションを既定にし, 内蔵リバーブ/コーラスへの送りを切る（リバーブはミックスで掛ける）
    for num, val in ((7, 100), (10, 64), (11, 127), (91, 0), (93, 0)):
        tr.append(mido.Message("control_change", channel=ch, control=num, value=val))
    # チャンネル 10（ch=9）はバンク 128 を引くので, プログラム番号がそのままキットの番号になる
    tr.append(mido.Message("program_change", channel=ch, program=part.program))
    last = 0
    for tk, _, msg in events:
        tr.append(msg.copy(time=tk - last))
        last = tk
    # 余韻を残すため, 最後の音から 2 小節 + 2 秒ぶん空けて終わる
    tail_ticks = int((8 + song.bpm / 30.0) * TICKS)
    tr.append(mido.MetaMessage("end_of_track", time=tail_ticks))
    buf = io.BytesIO()
    mid.save(file=buf)
    return buf.getvalue()


def _render_one(fs: str, sf2: str, mid_path: Path, wav_path: Path) -> None:
    cmd = [fs, "-ni", "-q", "-r", str(SR), "-O", "float", "-T", "wav", "-F", str(wav_path),
           "-g", "0.5", "-R", "0", "-C", "0", "-o", "synth.polyphony=512"]
    cmd += [sf2, str(mid_path)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not wav_path.exists():
        raise RuntimeError(f"FluidSynth 失敗 {mid_path.name}: {res.stderr[-500:]}")


def _sampled_job(song: Song, name: str, wav_path: str) -> None:
    part = next(p for p in song.parts if p.name == name)
    sound = instruments.sound_for(part.program, part.drum, part.sound)
    sf.write(wav_path, sampled.render_part(song, part, sound), SR, subtype="FLOAT")


def render_song(song: Song, pool: ProcessPoolExecutor | None = None, workers: int = 6) -> dict[str, np.ndarray]:
    """各パートのステム（float32, shape=(samples, 2)）を返す. 先頭は 1 小節目の頭.

    録音サンプル（instruments.SOUNDS）で鳴らせるパートは sampled.py で描き, 残りだけ FluidSynth で鳴らす.
    """
    out_dir = BUILD / "stems" / song.id
    out_dir.mkdir(parents=True, exist_ok=True)
    fluid_jobs = []
    sample_jobs = []
    for part in song.parts:
        sound = instruments.sound_for(part.program, part.drum, part.sound)
        if sound is not None:
            key = sampled.stem_key(song, part, sound)
            sample_jobs.append((part, out_dir / f"{part.name}-s{key}.wav"))
        else:
            fluid_jobs.append(part)

    jobs: list[tuple[Part, Path, Path | None]] = [(p, w, None) for p, w in sample_jobs]
    if fluid_jobs:
        fs, sf2 = fluidsynth(), soundfont()
        st = Path(sf2).stat()
        # 音源や FluidSynth を替えたら作り直すよう, それらもキャッシュのキーに入れる
        env_key = f"{SR}|{sf2}|{st.st_size}|{st.st_mtime_ns}|{fs}".encode()
        for part in fluid_jobs:
            data = _midi_bytes(song, part)
            key = hashlib.sha1(data + env_key + f"|{part.drum}|{part.program}".encode()).hexdigest()[:10]
            mid_path = out_dir / f"{part.name}.mid"
            mid_path.write_bytes(data)
            jobs.append((part, out_dir / f"{part.name}-{key}.wav", mid_path))
        todo = [j for j in jobs if j[2] is not None and not j[1].exists()]
        with ThreadPoolExecutor(max_workers=workers) as ex:
            list(ex.map(lambda j: _render_one(fs, sf2, j[2], j[1]), todo))

    todo_s = [(p, w) for p, w in sample_jobs if not w.exists()]
    if todo_s:
        own = pool is None
        ex = pool or ProcessPoolExecutor(max_workers=workers)
        try:
            for f in [ex.submit(_sampled_job, song, p.name, str(w)) for p, w in todo_s]:
                f.result()
        finally:
            if own:
                ex.shutdown()
    keep = {j[1] for j in jobs}
    for stale in out_dir.glob("*.wav"):
        if stale not in keep:
            stale.unlink()

    lead = int(round(LEAD_IN_BEATS * 60.0 / song.bpm * SR))
    stems: dict[str, np.ndarray] = {}
    for part, wav_path, mid in jobs:
        x, sr = sf.read(wav_path, dtype="float32", always_2d=True)
        assert sr == SR
        stems[part.name] = x[lead:] if mid is not None else x
    return stems
