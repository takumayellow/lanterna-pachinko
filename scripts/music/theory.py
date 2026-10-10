"""音名・コード・旋律の記法を MIDI の音番号に直す小さな道具.

旋律は "E5:1 D5:.5 C5:.5 r:2" のように「音名:拍数」を空白で並べる.
`|` は小節線（読みやすさのためだけ. 各小節の拍数が合っているかの検査に使う）.
音名の後ろの `!` はアクセント（ベロシティを上げる）.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# コードの種類 → ルートからの半音
_QUALITY = {
    "": (0, 4, 7),
    "m": (0, 3, 7),
    "7": (0, 4, 7, 10),
    "maj7": (0, 4, 7, 11),
    "m7": (0, 3, 7, 10),
    "m7b5": (0, 3, 6, 10),
    "dim": (0, 3, 6),
    "dim7": (0, 3, 6, 9),
    "aug": (0, 4, 8),
    "sus4": (0, 5, 7),
    "7sus4": (0, 5, 7, 10),
    "sus2": (0, 2, 7),
    "add9": (0, 4, 7, 14),
    "madd9": (0, 3, 7, 14),
    "m6": (0, 3, 7, 9),
    "6": (0, 4, 7, 9),
    "5": (0, 7),
}

_NOTE_RE = re.compile(r"^([A-G])([#b]?)(-?\d)$")
_CHORD_RE = re.compile(r"^([A-G][#b]?)([a-z0-9]*)(?:/([A-G][#b]?))?$")


def pc(name: str) -> int:
    """音名（オクターブなし）→ ピッチクラス 0..11."""
    base = _PC[name[0]]
    if len(name) > 1:
        base += 1 if name[1] == "#" else -1
    return base % 12


def n(name: str) -> int:
    """'C4' → 60."""
    m = _NOTE_RE.match(name)
    if not m:
        raise ValueError(f"音名が読めない: {name!r}")
    letter, acc, octave = m.groups()
    return 12 * (int(octave) + 1) + pc(letter + acc)


@dataclass(frozen=True)
class Chord:
    symbol: str
    root: int  # ピッチクラス
    tones: tuple[int, ...]  # ルートからの半音
    bass: int  # ベースのピッチクラス（分数コードならその音）

    def pcs(self) -> list[int]:
        return [(self.root + t) % 12 for t in self.tones]


def chord(symbol: str) -> Chord:
    m = _CHORD_RE.match(symbol)
    if not m:
        raise ValueError(f"コードが読めない: {symbol!r}")
    root_name, quality, bass_name = m.groups()
    if quality not in _QUALITY:
        raise ValueError(f"コードの種類が未対応: {symbol!r}")
    root = pc(root_name)
    bass = pc(bass_name) if bass_name else root
    return Chord(symbol, root, _QUALITY[quality], bass)


def progression(text: str, beats_per_bar: int = 4) -> list[tuple[float, float, Chord]]:
    """'Am F | G:2 C:2' → [(開始拍, 拍数, Chord)].

    小節線で区切り, 小節内のコードは拍数指定がなければ均等に割る.
    """
    out: list[tuple[float, float, Chord]] = []
    t = 0.0
    for bar in text.split("|"):
        items = bar.split()
        if not items:
            continue
        specified = [i for i in items if ":" in i]
        rest = beats_per_bar - sum(float(i.split(":")[1]) for i in specified)
        free = [i for i in items if ":" not in i]
        each = rest / len(free) if free else 0.0
        for item in items:
            sym, _, d = item.partition(":")
            dur = float(d) if d else each
            out.append((t, dur, chord(sym)))
            t += dur
    return out


def voicing(c: Chord, low: int, high: int, prev: list[int] | None = None, size: int = 4) -> list[int]:
    """low..high の範囲で構成音を並べる. prev があれば動きが最小になる転回を選ぶ."""
    pcs = c.pcs()
    candidates: list[list[int]] = []
    for start in range(low, low + 12):
        if start % 12 not in pcs:
            continue
        notes = [start]
        idx = pcs.index(start % 12)
        while len(notes) < size:
            idx = (idx + 1) % len(pcs)
            nxt = notes[-1] + 1
            while nxt % 12 != pcs[idx]:
                nxt += 1
            notes.append(nxt)
        if notes[-1] <= high:
            candidates.append(notes)
    if not candidates:
        raise ValueError(f"{c.symbol} を {low}..{high} に収められない")
    if prev is None:
        return candidates[len(candidates) // 2]
    return min(candidates, key=lambda v: sum(abs(a - b) for a, b in zip(v, prev)))


@dataclass(frozen=True)
class MelNote:
    t: float
    d: float
    p: int | None  # None は休符
    accent: bool


def melody(text: str, start: float = 0.0, beats_per_bar: int = 4) -> list[MelNote]:
    """旋律の記法を読む. 小節ごとの拍数が合わなければ例外にする（書き間違いの検出）."""
    out: list[MelNote] = []
    t = start
    for bar_no, bar in enumerate(text.split("|")):
        tokens = bar.split()
        if not tokens:
            continue
        bar_len = 0.0
        for tok in tokens:
            name, _, d = tok.partition(":")
            dur = float(d)
            accent = name.endswith("!")
            name = name.rstrip("!")
            p = None if name == "r" else n(name)
            out.append(MelNote(t, dur, p, accent))
            t += dur
            bar_len += dur
        if abs(bar_len - beats_per_bar) > 1e-6:
            raise ValueError(f"{bar_no + 1} 小節目が {bar_len} 拍: {bar.strip()!r}")
    return out


def transpose(notes: list[MelNote], semis: int) -> list[MelNote]:
    return [MelNote(m.t, m.d, None if m.p is None else m.p + semis, m.accent) for m in notes]


def shift(notes: list[MelNote], beats: float) -> list[MelNote]:
    return [MelNote(m.t + beats, m.d, m.p, m.accent) for m in notes]
