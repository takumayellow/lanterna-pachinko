"""録音サンプル（と合成音）でパート 1 本のステムを描く.

1 周ぶんの音を描いてから, ループ曲は 1 周ずらしてもう 1 つ重ねる（FluidSynth 版の 2 周ぶんの MIDI と同じ並び）.
1 周の中の判断はすべて音符の番号を種にするので 2 周は同じ音になり, mix で切り出す 2 周目が継ぎ目なく回る.
CC11（エクスプレッション）は FluidSynth と同じく音量の包絡として, 2 周ぶん並べてから掛ける.
"""

from __future__ import annotations

import dataclasses
import hashlib
import math
import random
from pathlib import Path

import numpy as np

import fx
import instruments
import sampler
import synth
from arrange import Part, Song, humanized
from instruments import Note, Sound

SR = sampler.SR
VERSION = 1  # 描き方を変えたら上げる（ステムのキャッシュを作り直す）
TAIL_SEC = 6.0  # 1 周の後ろに残す余韻

_bank: sampler.Bank | None = None


def bank() -> sampler.Bank:
    global _bank
    if _bank is None:
        _bank = sampler.Bank(instruments.SOURCES)
    return _bank


def _analyze(name: str) -> int:
    return len(sampler.analyze_src(name, instruments.SOURCES[name]))


def prepare(pool) -> None:
    """全セットの高さ・音量を先に測っておく（初回だけ時間が掛かる. 結果は置き場に残る）."""
    list(pool.map(_analyze, list(instruments.SOURCES)))


def _notes(song: Song, part: Part) -> list[Note]:
    beat = 60.0 / song.bpm
    hn = humanized(song, part)
    return [Note(t * beat, d * beat, p, v, i) for i, (t, d, p, v) in enumerate(hn)]


def _legato_pairs(notes: list[Note]) -> dict[int, int]:
    """単音の旋律で, 前の音の終わりから 80 ms 以内に始まる音 → その前の音（同時に鳴る音は除く）."""
    order = sorted(notes, key=lambda n: (n.t, n.pitch))
    out: dict[int, int] = {}
    for a, b in zip(order, order[1:]):
        gap = b.t - (a.t + a.dur)
        if -0.05 < gap < 0.08 and b.t - a.t > 0.06 and b.pitch != a.pitch:
            out[b.idx] = a.idx
    return out


def part_voices(part: Part, sound: Sound, notes: list[Note], song_id: str) -> list[sampler.Voice]:
    pairs = _legato_pairs(notes) if sound.legato else {}
    if pairs:
        # レガートの前の音は次の音の頭まで伸ばし, 60 ms 重ねてつなぐ
        by_idx = {n.idx: n for n in notes}
        ext = {a: by_idx[b].t - by_idx[a].t + 0.06 for b, a in pairs.items()}
        notes = [dataclasses.replace(n, dur=max(n.dur, ext[n.idx])) if n.idx in ext else n for n in notes]
    voices: list[sampler.Voice] = []
    for n in notes:
        r = random.Random(f"{song_id}/{part.name}/{n.idx}")
        vs = sound.voices(n, r)
        if n.idx in pairs:
            vs = [dataclasses.replace(v, legato=True) for v in vs]
        voices += vs
    return voices


def _render_voice(v: sampler.Voice) -> np.ndarray:
    if v.src.startswith("synth:"):
        y = synth.render(v.src[6:], v.pitch or 60, v.dur, v.vel, v.seed, v.cents)
        y *= np.float32(10 ** (v.gain_db / 20))
        a = (v.pan + 1) * math.pi / 4
        return y * np.array([math.cos(a), math.sin(a)], dtype=np.float32) * np.float32(math.sqrt(2))
    y = sampler.render_voice(bank(), v)
    return y


def _cc_env(song: Song, part: Part, length: int, passes: int) -> np.ndarray | None:
    evs = sorted((t, val) for t, num, val in part.cc if num == 11)
    if not evs:
        return None
    beat = 60.0 / song.bpm
    pts_t = [0.0]
    pts_v = [127.0]
    for k in range(passes):
        for t, val in evs:
            pts_t.append((t + k * song.beats) * beat)
            pts_v.append(float(val))
    order = np.argsort(pts_t, kind="stable")
    tt = np.array(pts_t)[order]
    vv = np.array(pts_v)[order]
    # 段々のまま掛けるとジッパー音が出るので, 区間ごとの値を 15 ms で均す
    idx = np.searchsorted(tt, np.arange(length) / SR, side="right") - 1
    step = vv[np.clip(idx, 0, len(vv) - 1)]
    k = int(0.015 * SR)
    ker = np.ones(k) / k
    smooth = np.convolve(np.pad(step, (k, k), mode="edge"), ker, mode="same")[k:-k]
    # FluidSynth の既定（CC11 は振幅に対して 2 乗の曲線）
    return ((smooth / 127.0) ** 2).astype(np.float32)


def stem_key(song: Song, part: Part, sound: Sound) -> str:
    h = hashlib.sha1()
    h.update(repr((VERSION, sampler.ANALYSIS_VERSION, song.id, song.bpm, song.beats, song.loop,
                   song.tail_beats, part.name, part.notes, part.cc, part.humanize, part.program, part.drum,
                   part.sound, sound.name, sound.post)).encode())
    for f in ("instruments.py", "sampler.py", "synth.py", "fx.py", "sampled.py"):
        h.update(Path(__file__).with_name(f).read_bytes())
    return h.hexdigest()[:12]


def render_part(song: Song, part: Part, sound: Sound) -> np.ndarray:
    """ステム（float32, (samples, 2)）. 先頭が 1 小節目の頭. ループ曲は 2 周ぶん."""
    notes = _notes(song, part)
    voices = part_voices(part, sound, notes, song.id)
    period = int(round(song.beats * 60.0 / song.bpm * SR))
    lead = int(1.0 * SR)  # 揺らぎで 1 小節目より前に出る音のための余白
    tail = int((TAIL_SEC + song.tail_beats * 60.0 / song.bpm) * SR)
    one = np.zeros((lead + period + tail, 2), dtype=np.float32)
    for v in voices:
        y = _render_voice(v)
        s = lead + int(round(v.t * SR))
        e = min(s + len(y), len(one))
        if s < 0:
            y, s = y[-s:], 0
        if e > s:
            one[s:e] += y[: e - s]

    passes = 2 if song.loop else 1
    length = passes * period + len(one)
    out = np.zeros((length + lead, 2), dtype=np.float32)
    for k in range(passes):
        out[k * period: k * period + len(one)] += one
    out = out[lead:]  # 先頭を 1 小節目の頭にそろえる（1 周目より前にはみ出た音は捨てる. FluidSynth 版と同じ）
    out = fx.apply(sound.post, out)
    env = _cc_env(song, part, len(out), passes)
    if env is not None:
        out = out * env[:, None]
    return out.astype(np.float32)
