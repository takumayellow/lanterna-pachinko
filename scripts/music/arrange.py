"""パート（楽器 1 本）と曲の入れ物, それに伴奏の型（ドラム・ベース・アルペジオ等）を作る関数."""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from theory import Chord, MelNote, melody, progression, voicing

# GM ドラムの音番号
DRUM = {
    "k": 36, "k2": 35, "s": 38, "s2": 40, "ss": 37, "cl": 39,
    "ch": 42, "ph": 44, "oh": 46, "cr": 49, "cr2": 57, "rd": 51, "rb": 53,
    "sp": 55, "cn": 52, "t1": 50, "t2": 48, "t3": 47, "t4": 45, "t5": 43, "t6": 41,
    "tam": 54, "sh": 70, "cab": 69, "tri": 81, "mtri": 80, "rev": 119,
}

# GM の音色番号（0 始まり. MS Basic.sf3 の名前で引ける）
GM = {
    "piano": 0, "bright_piano": 1, "celesta": 8, "glock": 9, "music_box": 10, "vibes": 11,
    "tubular": 14, "church_organ": 19, "nylon": 24, "clean_gtr": 27, "mute_gtr": 28,
    "od_gtr": 29, "dist_gtr": 30, "finger_bass": 33, "pick_bass": 34, "synth_bass": 38,
    "synth_bass2": 39, "violin": 40, "cello": 42, "contrabass": 43, "trem_str": 44,
    "pizz": 45, "harp": 46, "timpani": 47, "strings": 48, "slow_strings": 49,
    "synth_strings": 50, "choir": 52, "oohs": 53, "synth_voice": 54, "orch_hit": 55,
    "trumpet": 56, "trombone": 57, "tuba": 58, "horn": 60, "brass": 61, "synth_brass": 62,
    "flute": 73, "oboe": 68, "square": 80, "saw": 81, "fifth_saw": 86, "bass_lead": 87,
    "warm_pad": 89, "polysynth": 90, "space_voice": 91, "halo_pad": 94, "crystal": 98,
    "taiko": 116, "rev_cymbal": 119,
}

# ドラムキット（バンク 128 のプリセット番号）
KIT = {"standard": 0, "room": 8, "power": 16, "electronic": 24, "tr808": 25, "orchestra": 48}


@dataclass
class Part:
    name: str
    program: int
    drum: bool = False
    level: float = 0.0  # ミックスでの音量（dB. 各パートを RMS でそろえた後に掛ける）
    pan: float = 0.0  # -1（左）..1（右）
    reverb: float = 0.15  # リバーブへの送り量（0..1）
    hp: float = 0.0  # ハイパスの周波数（Hz. 0 で無効）
    duck: float = 0.0  # キックで音量を沈める深さ（0..1. トランスのポンピング）
    humanize: float = 0.004  # 発音時刻の揺らぎ（秒の標準偏差）
    sound: str = ""  # 鳴らす音色（instruments.SOUNDS の名前. 空なら program から決める. "fluid" で FluidSynth）
    notes: list[tuple[float, float, int, int]] = field(default_factory=list)
    cc: list[tuple[float, int, int]] = field(default_factory=list)

    def add(self, t: float, d: float, p: int, v: int) -> None:
        self.notes.append((t, max(d, 0.02), p, max(1, min(127, int(v)))))

    def mel(self, notes: list[MelNote], vel: int = 90, legato: float = 0.92,
            accent: int = 14, octave: int = 0) -> None:
        for m in notes:
            if m.p is None:
                continue
            self.add(m.t, m.d * legato, m.p + 12 * octave, vel + (accent if m.accent else 0))

    def swell(self, t0: float, t1: float, v0: int, v1: int, steps: int = 16) -> None:
        """CC11（エクスプレッション）を t0..t1 拍で v0 → v1 に動かす."""
        for i in range(steps + 1):
            a = i / steps
            self.cc.append((t0 + (t1 - t0) * a, 11, int(v0 + (v1 - v0) * a)))


@dataclass
class Section:
    name: str
    bars: int
    chords: str  # docs 用のコード進行の表記


@dataclass
class Song:
    id: str
    title: str
    bpm: float
    bars: int
    parts: list[Part]
    sections: list[Section]
    loop: bool = True
    tail_beats: float = 0.0  # ワンショットの余韻
    key: str = ""
    reverb_rt: float = 1.8  # リバーブの残響時間（秒）
    sub_kick: float | None = None  # キックに重ねる合成の低域（dB. None で無し）
    lufs: float = -14.0  # マスタリングの目標ラウドネス
    meter: int = 4  # 1 小節の拍数（3 でワルツ）
    seed: str = ""  # 揺らしの種（空なら id）. 書き出し済みの音と同じ揺れを保ったまま id を変えるときに使う

    @property
    def beats(self) -> float:
        return self.bars * float(self.meter)

    @property
    def kick_times(self) -> list[float]:
        """キックの拍位置（サイドチェインの包絡を作るのに使う）."""
        out: list[float] = []
        for p in self.parts:
            if p.drum:
                out += [t for t, _, pitch, _ in p.notes if pitch in (35, 36)]
        return sorted(set(out))

    def check(self) -> None:
        total = sum(s.bars for s in self.sections)
        if total != self.bars:
            raise ValueError(f"{self.id}: セクションの小節数 {total} != {self.bars}")


def rng_for(*keys: str) -> random.Random:
    return random.Random("/".join(keys))


def humanized(song: Song, part: Part) -> list[tuple[float, float, int, int]]:
    """発音時刻（秒の標準偏差 part.humanize）と強さ（±4）を揺らした音符. 曲名とパート名で種を決める."""
    rng = rng_for(song.seed or song.id, part.name)
    beat_sec = 60.0 / song.bpm
    out = []
    for t, d, p, v in part.notes:
        jitter = rng.gauss(0.0, part.humanize) / beat_sec if part.humanize else 0.0
        vel = max(1, min(127, v + rng.randint(-4, 4)))
        out.append((t + jitter, d, p, vel))
    return out


# ---------------------------------------------------------------- ドラム

def drums(part: Part, start: float, grid: dict[str, str], vel: int = 100,
          step: float = 0.25, rng: random.Random | None = None) -> None:
    """grid = {'k': 'x...x...', ...}. x=通常, X=強, o=弱（ゴースト）."""
    r = rng or random.Random(0)
    for inst, pat in grid.items():
        for i, ch in enumerate(pat.replace(" ", "")):
            if ch == ".":
                continue
            v = {"x": vel, "X": vel + 18, "o": vel - 40}[ch]
            if inst in ("ch", "ph", "rd", "sh", "cab", "tam"):
                v -= 18 if i % 2 else 4  # 裏拍のハットは弱く
            part.add(start + i * step, step * 0.9, DRUM[inst], v + r.randint(-6, 6))


def fill(part: Part, start: float, beats: float, kind: str = "snare",
         vel0: int = 70, vel1: int = 120, rng: random.Random | None = None) -> None:
    """フィル. kind: snare（16 分の連打）/ toms（高→低のタム回し）/ roll（32 分のロール）."""
    r = rng or random.Random(0)
    step = 0.125 if kind == "roll" else 0.25
    count = int(round(beats / step))
    toms = ["t1", "t1", "t2", "t2", "t4", "t4", "t6", "t6"]
    for i in range(count):
        a = i / max(count - 1, 1)
        v = int(vel0 + (vel1 - vel0) * a) + r.randint(-5, 5)
        if kind == "toms":
            inst = toms[min(int(a * len(toms)), len(toms) - 1)]
        else:
            inst = "s"
        part.add(start + i * step, step * 0.9, DRUM[inst], v)
        if kind == "toms" and i % 4 == 0:
            part.add(start + i * step, step, DRUM["k"], v)


def crash(part: Part, t: float, vel: int = 115, kick: bool = True) -> None:
    part.add(t, 2.0, DRUM["cr"], vel)
    if kick:
        part.add(t, 0.5, DRUM["k"], vel)


def cymbal_swell(part: Part, peak: float, beats: float = 4.0, vel: int = 100) -> None:
    """サスペンドシンバルのクレッシェンド. peak 拍で頂点になる（ドラムのパートに置く）."""
    part.add(peak - beats, beats, DRUM["rev"], vel)


def timp_roll(part: Part, t: float, beats: float, pitch: int, vel: int = 100) -> None:
    """ティンパニのロール. part は sound="timp_roll" のパート（録音のロールを音符の長さだけ鳴らす）."""
    part.add(t, beats, pitch, vel)


# ---------------------------------------------------------------- 和音の伴奏

def pad(part: Part, prog: str, start: float, low: int, high: int, vel: int = 70,
        size: int = 4, legato: float = 1.0, bpb: int = 4) -> None:
    prev = None
    for t, d, c in progression(prog, bpb):
        v = voicing(c, low, high, prev, size)
        for p in v:
            part.add(start + t, d * legato, p, vel)
        prev = v


def comp(part: Part, prog: str, start: float, rhythm: str, low: int, high: int,
         vel: int = 80, size: int = 3, step: float = 0.5, gate: float = 0.8,
         rng: random.Random | None = None, bpb: int = 4) -> None:
    """コードを rhythm（x=打つ, X=強, -=前の音を伸ばす, .=休み）で刻む. rhythm は 1 小節ぶん."""
    r = rng or random.Random(0)
    prev = None
    for t, d, c in progression(prog, bpb):
        v = voicing(c, low, high, prev, size)
        prev = v
        cells = rhythm.replace(" ", "")
        i = 0
        while i < len(cells):
            pos = i * step
            if pos >= d:
                break
            ch = cells[i]
            if ch in "xX":
                length = 1
                while i + length < len(cells) and cells[i + length] == "-":
                    length += 1
                vv = vel + (14 if ch == "X" else 0) + r.randint(-5, 5)
                for p in v:
                    part.add(start + t + pos, min(length * step, d - pos) * gate, p, vv)
                i += length
            else:
                i += 1


def arp(part: Part, prog: str, start: float, order: list[int], step: float, low: int,
        vel: int = 75, span: int = 2, gate: float = 0.9, rng: random.Random | None = None,
        bpb: int = 4) -> None:
    """コードの構成音を low から span オクターブ分並べ, order の順に step 拍ずつ弾く."""
    r = rng or random.Random(0)
    for t, d, c in progression(prog, bpb):
        pcs = c.pcs()
        tones = sorted(p for p in range(low, low + 12 * span) if p % 12 in pcs)
        k = 0
        pos = 0.0
        while pos < d - 1e-9:
            p = tones[order[k % len(order)] % len(tones)]
            accent = 10 if abs((pos + t) % 1.0) < 1e-6 else 0
            part.add(start + t + pos, step * gate, p, vel + accent + r.randint(-6, 6))
            pos += step
            k += 1


def power(part: Part, prog: str, start: float, rhythm: str, vel: int = 95,
          low: int = 40, step: float = 0.5, gate: float = 0.85, fifth_only: bool = False,
          rng: random.Random | None = None) -> None:
    """パワーコード（ルート+5度+オクターブ）を rhythm で刻む."""
    r = rng or random.Random(0)
    for t, d, c in progression(prog):
        root = low + (c.bass - low) % 12
        notes = [root, root + 7] if fifth_only else [root, root + 7, root + 12]
        cells = rhythm.replace(" ", "")
        i = 0
        while i < len(cells) and i * step < d - 1e-9:
            ch = cells[i]
            if ch in "xX":
                length = 1
                while i + length < len(cells) and cells[i + length] == "-":
                    length += 1
                vv = vel + (12 if ch == "X" else 0) + r.randint(-5, 5)
                for p in notes:
                    part.add(start + t + i * step, min(length * step, d - i * step) * gate, p, vv)
                i += length
            else:
                i += 1


# ---------------------------------------------------------------- ベース

def bass(part: Part, prog: str, start: float, style: str, low: int = 28, vel: int = 96,
         rng: random.Random | None = None, bpb: int = 4) -> None:
    """style: eighth（8 分のルート, 小節末で次のルートへ経過音）/ walk（4 分: ルート・5 度・オクターブ・経過音）
    / half（2 分）/ roll（トランスの 16 分裏打ち）/ gallop（8 分+16 分 2 つ）/ whole
    / waltz（3 拍子: 1 拍目にルート, 次の小節の 1 拍目は 5 度）."""
    r = rng or random.Random(0)
    chords = progression(prog, bpb)
    for idx, (t, d, c) in enumerate(chords):
        root = low + (c.bass - low) % 12
        nxt = chords[(idx + 1) % len(chords)][2]
        nroot = low + (nxt.bass - low) % 12
        approach = nroot - 1 if nroot > root else nroot + 2 if nroot < root else root + 7

        def hit(pos: float, dur: float, p: int, v: int = vel) -> None:
            part.add(start + t + pos, dur, p, v + r.randint(-6, 6))

        if style == "eighth":
            steps = int(round(d / 0.5))
            for i in range(steps):
                p = root
                if i == steps - 1 and steps >= 4 and nroot != root:
                    p = approach
                elif i == steps - 2 and steps >= 8:
                    p = root + 12 if r.random() < 0.3 else root
                hit(i * 0.5, 0.45, p, vel + (10 if i % 2 == 0 else 0))
        elif style == "walk":
            fifth = root + 7
            seq = [root, fifth, root + 12, approach]
            for i in range(int(round(d))):
                hit(float(i), 0.9, seq[i % 4] if d >= 4 else seq[i % 2])
        elif style == "half":
            hit(0.0, min(2.0, d) * 0.95, root)
            if d >= 4:
                hit(2.0, 1.4, root + 7 if nroot == root else root)
                hit(3.5, 0.45, approach, vel - 15)
        elif style == "roll":
            for i in range(int(round(d / 0.25))):
                if i % 4 == 0:
                    continue
                hit(i * 0.25, 0.2, root + (12 if i % 4 == 2 else 0), vel - (8 if i % 4 != 2 else 0))
        elif style == "gallop":
            for b in range(int(round(d))):
                hit(b + 0.0, 0.45, root, vel + 8)
                hit(b + 0.5, 0.22, root)
                hit(b + 0.75, 0.22, root)
        elif style == "whole":
            hit(0.0, d * 0.98, root)
        elif style == "waltz":
            for i in range(int(round(d / bpb))):
                hit(i * bpb, bpb * 0.9, root if i % 2 == 0 else root + 7, vel + (6 if i % 2 == 0 else 0))
        else:
            raise ValueError(style)


def lead(part: Part, text: str, start: float, vel: int = 96, legato: float = 0.92,
         octave: int = 0, bpb: int = 4) -> None:
    part.mel(melody(text, start, bpb), vel=vel, legato=legato, octave=octave)


def ostinato(part: Part, prog: str, start: float, pattern: list[int], step: float = 0.25,
             low: int = 40, vel: int = 85, gate: float = 0.8,
             rng: random.Random | None = None, bpb: int = 4) -> None:
    """ペダル音型. pattern の数は「ルートからの半音」（コードに合わせて移る）."""
    r = rng or random.Random(0)
    for t, d, c in progression(prog, bpb):
        root = low + (c.root - low) % 12
        pos = 0.0
        k = 0
        while pos < d - 1e-9:
            p = root + pattern[k % len(pattern)]
            accent = 14 if k % 4 == 0 else 0
            part.add(start + t + pos, step * gate, p, vel + accent + r.randint(-5, 5))
            pos += step
            k += 1


def chord_tones(c: Chord) -> list[int]:
    return c.pcs()
