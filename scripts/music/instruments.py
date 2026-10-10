"""録音サンプルのセット（Src）と, パートが鳴らす「音色」（Sound）の定義.

Sound は 1 つの音符を 1 つ以上の Voice（どのサンプルを・どの高さ・どの定位で）に開く.
弦や金管のセクションは音域で楽器を振り分けて座席どおりに置き, 合唱は数人ぶんを少しずつずらして重ねる.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Callable

import numpy as np

from sampler import Src, Voice

VS = "vsco2"
VC = "vcsl"

SOURCES: dict[str, Src] = {
    # 弦
    "vln_sus": Src(VS, r"Strings/Violin Section/susVib/.*", release=0.35, vel_db=14, attack=0.03),
    "vln_spic": Src(VS, r"Strings/Violin Section/Spic/.*", kind="damp", release=0.12, vel_db=14),
    "vln_pizz": Src(VS, r"Strings/Violin Section/Pizz/.*", kind="ring", vel_db=16, max_len=2.0),
    "vln_trem": Src(VS, r"Strings/Violin Section/Trem/.*", release=0.3, vel_db=14, attack=0.02),
    "vla_sus": Src(VS, r"Strings/Viola Section/susvib/.*", release=0.35, vel_db=14, attack=0.03),
    "vla_spic": Src(VS, r"Strings/Viola Section/spic/.*", kind="damp", release=0.12, vel_db=14),
    "vla_pizz": Src(VS, r"Strings/Viola Section/pizz/.*", kind="ring", vel_db=16, max_len=2.0),
    "vla_trem": Src(VS, r"Strings/Viola Section/trem/.*", release=0.3, vel_db=14, attack=0.02),
    "vc_sus": Src(VS, r"Strings/Cello Section/susvib/.*", release=0.4, vel_db=14, attack=0.03),
    "vc_spic": Src(VS, r"Strings/Cello Section/spic/.*", kind="damp", release=0.12, vel_db=14),
    "vc_pizz": Src(VS, r"Strings/Cello Section/pizzT/.*", kind="ring", vel_db=16, max_len=2.5),
    "vc_trem": Src(VS, r"Strings/Cello Section/trem/.*", release=0.3, vel_db=14, attack=0.02),
    "cb_sus": Src(VS, r"Strings/Solo Contrabass/SusVib/.*", release=0.4, vel_db=14, attack=0.03),
    "cb_spic": Src(VS, r"Strings/Solo Contrabass/Spic/.*", kind="damp", release=0.12, vel_db=14),
    "cb_pizz": Src(VS, r"Strings/Solo Contrabass/Pizz/.*", kind="ring", vel_db=16, max_len=2.5),
    "harp": Src(VS, r"Strings/Harp/.*", kind="ring", vel_db=20, max_len=4.0),
    # 金管
    "tpt_sus": Src(VS, r"Brass/Trumpet/sus/.*", release=0.18, vel_db=16, attack=0.01),
    "tpt_stac": Src(VS, r"Brass/Trumpet/stac/.*", kind="damp", release=0.08, vel_db=16),
    "hn_sus": Src(VS, r"Brass/F Horn/sus/.*", release=0.25, vel_db=16, attack=0.015),
    "hn_stac": Src(VS, r"Brass/F Horn/stac/.*", kind="damp", release=0.1, vel_db=16),
    "tbn_sus": Src(VS, r"Brass/Tenor Trombone/sus/.*", release=0.2, vel_db=16, attack=0.012),
    "tbn_stac": Src(VS, r"Brass/Tenor Trombone/stac/.*", kind="damp", release=0.1, vel_db=16),
    "tuba_sus": Src(VS, r"Brass/Tuba/sus/.*", release=0.25, vel_db=16, attack=0.015),
    "tuba_stac": Src(VS, r"Brass/Tuba/stac/.*", kind="damp", release=0.1, vel_db=16),
    # 木管
    "fl_sus": Src(VS, r"Woodwinds/Flute/susvib/.*", release=0.2, vel_db=12, attack=0.02),
    "fl_stac": Src(VS, r"Woodwinds/Flute/stac/.*", kind="damp", release=0.08, vel_db=12),
    "ob_sus": Src(VS, r"Woodwinds/Oboe/Vib/.*", release=0.18, vel_db=12, attack=0.015),
    "cl_sus": Src(VS, r"Woodwinds/Clarinet/susLong/.*", release=0.2, vel_db=12, attack=0.015),
    # 打楽器
    "timp": Src(VS, r"Percussion/Timpani/Timpani\d_Hit_.*", kind="ring", vel_db=22, pitch_mode="peak", max_len=5.0),
    "timp_roll": Src(VS, r"Percussion/Timpani/Rolls/.*", release=0.6, vel_db=18, pitch_mode="peak", attack=0.05),
    "orch_snare": Src(VS, r"VSCO 1 Percussion/drums/snare/drum1/snare1_(p|mp|f|ff|fff|pp|ppp)_.*",
                      kind="ring", vel_db=22, pitched=False, max_len=1.5),
    "triangle": Src(VS, r"VSCO 1 Percussion/varMetal/triangle/1/triangle1_hit_(mf_pt\d|mp|pp)\.wav",
                    kind="ring", vel_db=14, pitched=False, max_len=3.0),
    "glock": Src(VC, r"Idiophones/Struck Idiophones/Glockenspiel/.*", kind="ring", vel_db=14, max_len=3.0),
    "bells": Src(VC, r"Idiophones/Struck Idiophones/Tubular Bells 2/.*", kind="ring", vel_db=12, max_len=6.0),
    "sus_cym": Src(VC, r"Idiophones/Struck Idiophones/Suspended Cymbal 1/susCymb1_hit_(pp|mp|f|fff)1\.wav",
                   kind="ring", vel_db=18, pitched=False, max_len=6.0),
    "cym_swell": Src(VC, r"Idiophones/Struck Idiophones/Suspended Cymbal 1/susCymb1_cresc_.*",
                     kind="ring", vel_db=10, pitched=False, max_len=9.0),
    "clash": Src(VC, r"Idiophones/Struck Idiophones/Clash Cymbals 1/cymbal_crash1_(pp|mp|mf|ff)\d\.wav",
                 kind="ring", vel_db=18, pitched=False, max_len=6.0),
    "gong": Src(VC, r"Idiophones/Struck Idiophones/Gong 1/.*", kind="ring", vel_db=16, pitched=False, max_len=9.0),
    "bass_drum": Src(VC, r"Membranophones/Struck Membranophones/Bass Drum 1/.*", kind="ring", vel_db=22,
                     pitched=False, max_len=3.0),
    "claps": Src(VC, r"Idiophones/Struck Idiophones/Claps/Clap_rr\d\.wav", kind="ring", vel_db=14, pitched=False,
                 max_len=1.0),
    "tamb": Src(VC, r"Idiophones/Struck Idiophones/Tambourine 1/Tamb1_(Hit|Shake)_.*", kind="ring", vel_db=16,
                pitched=False, max_len=1.0),
    "shaker": Src(VC, r"Idiophones/Struck Idiophones/Shaker, Small/.*", kind="ring", vel_db=14, pitched=False,
                  max_len=0.6),
    # 鍵盤
    "organ": Src(VC, r"Aerophones/Edge-blown Aerophones/Pipe Organ/(Quiet|Quiet Pedal)/.*", release=0.6, vel_db=8,
                 attack=0.04),
    "organ_full": Src(VC, r"Aerophones/Edge-blown Aerophones/Pipe Organ/(Loud|Loud Pedal)/.*", release=0.7,
                      vel_db=8, attack=0.04),
    "piano": Src(VC, r"Chordophones/Zithers/Grand Piano, Kawai/Sustains/.*", kind="damp", release=0.35, vel_db=24,
                 max_len=8.0),
    # 声
    "vox_a": Src("vocal", r"Samples/vowel_sustain/a/.*", release=0.4, vel_db=10, attack=0.06),
    "vox_short": Src("vocal", r"Samples/vowel_short/a/.*", kind="damp", release=0.12, vel_db=10),
    # ドラム（近接 + オーバーヘッド + ルーム）
    "dr_kick": Src("drums", r"Samples/(kickmic|oh|room)/kick/.*", kind="ring", vel_db=20, pitched=False,
                   mics=(("kickmic", 1.0), ("oh", 0.45), ("room", 0.35)), max_len=1.2),
    "dr_snare": Src("drums", r"Samples/(snaremic|oh|room)/snare/\w+_snare_center_.*", kind="ring", vel_db=22,
                    pitched=False, mics=(("snaremic", 1.0), ("oh", 0.6), ("room", 0.45)), max_len=1.5),
    "dr_rim": Src("drums", r"Samples/(snaremic|oh|room)/snare/\w+_snare_rimshot_.*", kind="ring", vel_db=16,
                  pitched=False, mics=(("snaremic", 1.0), ("oh", 0.6), ("room", 0.45)), max_len=1.5),
    "dr_xstick": Src("drums", r"Samples/(snaremic|oh|room)/snare/\w+_snare_crossstick_.*", kind="ring", vel_db=16,
                     pitched=False, mics=(("snaremic", 1.0), ("oh", 0.5), ("room", 0.3)), max_len=0.8),
    "dr_hh_closed": Src("drums", r"Samples/(oh|room)/hh/\w+_hh_closed_.*", kind="ring", vel_db=18, pitched=False,
                        mics=(("oh", 1.0), ("room", 0.3)), max_len=0.6),
    "dr_hh_half": Src("drums", r"Samples/(oh|room)/hh/\w+_hh_half_.*", kind="ring", vel_db=18, pitched=False,
                      mics=(("oh", 1.0), ("room", 0.3)), max_len=1.2),
    "dr_hh_open": Src("drums", r"Samples/(oh|room)/hh/\w+_hh_open_.*", kind="ring", vel_db=18, pitched=False,
                      mics=(("oh", 1.0), ("room", 0.3)), max_len=2.0),
    "dr_hh_pedal": Src("drums", r"Samples/(oh|room)/hh/\w+_hh_pedal_.*", kind="ring", vel_db=14, pitched=False,
                       mics=(("oh", 1.0), ("room", 0.3)), max_len=0.6),
    "dr_crash": Src("drums", r"Samples/(oh|room)/crash/.*", kind="ring", vel_db=16, pitched=False,
                    mics=(("oh", 1.0), ("room", 0.4)), max_len=4.0),
    "dr_ride": Src("drums", r"Samples/(oh|room)/ride/\w+_ride_ride_.*", kind="ring", vel_db=16, pitched=False,
                   mics=(("oh", 1.0), ("room", 0.3)), max_len=3.0),
    "dr_bell": Src("drums", r"Samples/(oh|room)/ride/\w+_ride_bell_.*", kind="ring", vel_db=14, pitched=False,
                   mics=(("oh", 1.0), ("room", 0.3)), max_len=3.0),
    "dr_htom": Src("drums", r"Samples/(oh|room)/htom/.*", kind="ring", vel_db=20, pitched=False,
                   mics=(("oh", 1.0), ("room", 0.5)), max_len=1.8),
    "dr_ltom": Src("drums", r"Samples/(oh|room)/ltom/.*", kind="ring", vel_db=20, pitched=False,
                   mics=(("oh", 1.0), ("room", 0.5)), max_len=2.0),
    # エレキベースとギター（DI. ギターのアンプは fx で掛ける）
    "ebass": Src("bass", r"Samples/darkblack/reg/.*", kind="damp", release=0.08, vel_db=14, max_len=6.0),
    "ebass_stac": Src("bass", r"Samples/darkblack/stac/.*", kind="damp", release=0.05, vel_db=14),
    "egtr": Src("guitar", r"Samples/black/ord/.*", kind="damp", release=0.06, vel_db=10, max_len=6.0),
    "egtr_stac": Src("guitar", r"Samples/black/stac/.*", kind="damp", release=0.04, vel_db=10),
}


@dataclass
class Note:
    t: float  # 秒
    dur: float  # 秒
    pitch: int
    vel: int
    idx: int  # 1 周の中の通し番号（揺らぎの種）


VoiceFn = Callable[[Note, random.Random], list[Voice]]


@dataclass
class Sound:
    """パートが鳴らす音色. voices で音符を Voice に開き, post でパート全体に効果を掛ける."""

    name: str
    voices: VoiceFn
    post: str = ""  # fx.py の効果名（amp_dist, amp_od, bass_drive, lowpass_oohs, bright）
    legato: bool = False  # 単音の旋律で, 重なった音をレガートでつなぐ


def _seat(p: float, pts: list[tuple[int, float]]) -> float:
    xs, ys = zip(*pts)
    return float(np.interp(p, xs, ys))


STRING_SEATS = [(28, 0.55), (40, 0.4), (50, 0.15), (60, -0.25), (72, -0.5)]


def _string_src(p: int, art: str) -> str:
    sec = "vln" if p >= 55 else "vla" if p >= 48 else "vc" if p >= 36 else "cb"
    if art == "trem" and sec == "cb":
        sec = "vc"
    return f"{sec}_{art}"


def strings(art: str = "sus", short_sec: float = 0.3, attack: float | None = None,
            ensemble: int = 2) -> VoiceFn:
    """弦楽セクション. 音域で Vn/Va/Vc/Cb に分け, 短い音は spiccato に替える. ensemble 本を少しずらして重ねる."""

    def fn(n: Note, r: random.Random) -> list[Voice]:
        a = art
        if a == "sus" and n.dur < short_sec:
            a = "spic"
        src = _string_src(n.pitch, a)
        pan = _seat(n.pitch, STRING_SEATS)
        out = []
        for k in range(ensemble):
            out.append(Voice(src, n.t + r.uniform(0, 0.012) * k, n.dur, n.pitch, n.vel,
                             gain_db=-3.0 * (k > 0), pan=max(-1.0, min(1.0, pan + (k - 0.5) * 0.25)),
                             cents=r.uniform(-6, 6), attack=attack, seed=n.idx * 7 + k))
        return out

    return fn


def section(src_prefix: str, pan: float, art_short: float = 0.28, ensemble: int = 1,
            spread: float = 0.2, cents: float = 5.0) -> VoiceFn:
    """独奏楽器（を数本重ねたもの）. 短い音は stac/spic に替える."""

    def fn(n: Note, r: random.Random) -> list[Voice]:
        src = f"{src_prefix}_sus"
        short = {"tpt": "tpt_stac", "hn": "hn_stac", "tbn": "tbn_stac", "tuba": "tuba_stac", "fl": "fl_stac",
                 "vc": "vc_spic", "cb": "cb_spic", "vln": "vln_spic"}.get(src_prefix)
        if short and n.dur < art_short:
            src = short
        return [Voice(src, n.t + r.uniform(0, 0.015) * k, n.dur, n.pitch, n.vel, gain_db=-2.5 * (k > 0),
                      pan=max(-1.0, min(1.0, pan + spread * (k - (ensemble - 1) / 2))), cents=r.uniform(-cents, cents),
                      seed=n.idx * 5 + k)
                for k in range(ensemble)]

    return fn


BRASS_SEATS = {"tpt": 0.25, "hn": -0.3, "tbn": 0.4, "tuba": 0.55}


def brass(ensemble: int = 2) -> VoiceFn:
    """金管セクション. 音域で Tp/Hn/Tb/Tuba に分ける（ホルンは左寄り, トランペット・トロンボーンは右寄り）."""

    def fn(n: Note, r: random.Random) -> list[Voice]:
        p = n.pitch
        inst = "tpt" if p >= 60 else "hn" if p >= 50 else "tbn" if p >= 40 else "tuba"
        return section(inst, BRASS_SEATS[inst], ensemble=ensemble)(n, r)

    return fn


VOX_LOW, VOX_HIGH = 40, 64  # 録音の歌い手（男声. 測った音域は C2〜A3）を無理なく動かせる範囲


def _fold(p: int, low: int, high: int) -> int:
    while p > high:
        p -= 12
    while p < low:
        p += 12
    return p


def choir(src: str = "vox_a", singers: int = 4, attack: float = 0.12) -> VoiceFn:
    """合唱. 同じ母音の録音を数人ぶん, 時刻・音程・定位を少しずつずらして重ねる.

    録音は男声 1 人なので, 高い音はオクターブ下げて男声合唱として歌わせる（声の質が崩れないように）.
    """

    def fn(n: Note, r: random.Random) -> list[Voice]:
        p = _fold(n.pitch, VOX_LOW, VOX_HIGH)
        out = []
        for k in range(singers):
            out.append(Voice(src, n.t + r.uniform(0, 0.04), n.dur, p, n.vel, gain_db=-1.5 * (k > 0),
                             pan=-0.6 + 1.2 * k / max(singers - 1, 1) + r.uniform(-0.1, 0.1),
                             cents=r.uniform(-9, 9), attack=attack if src == "vox_a" else None,
                             seed=n.idx * 11 + k))
        return out

    return fn


def single(src: str, pan: float = 0.0, gain_db: float = 0.0, cents: float = 0.0, keep_pitch: bool = True,
           attack: float | None = None, release: float | None = None) -> VoiceFn:
    def fn(n: Note, r: random.Random) -> list[Voice]:
        return [Voice(src, n.t, n.dur, n.pitch if keep_pitch else None, n.vel, gain_db=gain_db, pan=pan,
                      cents=cents + r.uniform(-2, 2), attack=attack, release=release, seed=n.idx)]

    return fn


def timpani(roll: bool = False) -> VoiceFn:
    """ティンパニ. roll なら録音のロール（音符の長さだけ伸ばす）, そうでなければ 1 打（自然に減衰する）."""

    def fn(n: Note, r: random.Random) -> list[Voice]:
        return [Voice("timp_roll" if roll else "timp", n.t, n.dur, n.pitch, n.vel, pan=0.15, seed=n.idx)]

    return fn


def orch_hit() -> VoiceFn:
    """オーケストラヒット: 金管スタッカート + 弦スピッカート + ティンパニ + シンバルを同時に."""

    def fn(n: Note, r: random.Random) -> list[Voice]:
        p = n.pitch
        out = [Voice("tpt_stac", n.t, 0.2, p + 12 if p < 58 else p, n.vel, seed=n.idx, pan=0.25),
               Voice("hn_stac", n.t, 0.2, p, n.vel, seed=n.idx + 1, pan=-0.3),
               Voice("tbn_stac", n.t, 0.2, p - 12, n.vel, seed=n.idx + 2, pan=0.4),
               Voice("vln_spic", n.t, 0.2, p + 12 if p < 60 else p, n.vel, seed=n.idx + 3, pan=-0.45),
               Voice("vc_spic", n.t, 0.2, p - 12, n.vel, seed=n.idx + 4, pan=0.35),
               Voice("timp", n.t, 0.5, 41 + (p - 41) % 12, n.vel, seed=n.idx + 5, gain_db=-2),
               Voice("clash", n.t, 1.0, None, max(n.vel - 20, 1), seed=n.idx + 6, gain_db=-8)]
        return out

    return fn


def taiko() -> VoiceFn:
    """和太鼓の代わり: 大太鼓（コンサートバスドラム）+ 低いタムを 1 オクターブ下げて重ねる."""

    def fn(n: Note, r: random.Random) -> list[Voice]:
        return [Voice("bass_drum", n.t, 1.0, None, n.vel, seed=n.idx, cents=(n.pitch - 48) * 30),
                Voice("dr_ltom", n.t, 1.0, None, n.vel, seed=n.idx + 1, cents=-700, gain_db=-4)]

    return fn


def swell() -> VoiceFn:
    """シンバルのクレッシェンド. 音符の終わりに頂点が来るよう, 録音の長さを選んで前へずらす."""

    def fn(n: Note, r: random.Random) -> list[Voice]:
        return [Voice("cym_swell", n.t, n.dur, None, n.vel, seed=n.idx, pan=-0.2)]

    return fn


def synth(kind: str, pan: float = 0.0, voices: int = 1) -> VoiceFn:
    def fn(n: Note, r: random.Random) -> list[Voice]:
        return [Voice(f"synth:{kind}", n.t, n.dur, n.pitch, n.vel, pan=pan, seed=n.idx * 3 + k,
                      cents=r.uniform(-4, 4) * (voices > 1))
                for k in range(voices)]

    return fn


# ---------------------------------------------------------------- ドラム

def _kit_map(orchestra: bool) -> dict[int, tuple[str, float, float]]:
    """GM ドラムの音番号 → （サンプル, 音程ずらし cents, 音量 dB）."""
    m = {
        35: ("dr_kick", 0, 0), 36: ("dr_kick", 0, 0),
        37: ("dr_xstick", 0, 0), 38: ("dr_snare", 0, 0), 40: ("dr_rim", 0, 0),
        39: ("claps", 0, -2),
        42: ("dr_hh_closed", 0, 0), 44: ("dr_hh_pedal", 0, 0), 46: ("dr_hh_open", 0, 0),
        49: ("dr_crash", 0, 0), 57: ("dr_crash", 150, 0), 55: ("dr_crash", 500, -4), 52: ("dr_crash", -300, -2),
        51: ("dr_ride", 0, 0), 53: ("dr_bell", 0, 0), 59: ("dr_ride", 100, 0),
        50: ("dr_htom", 200, 0), 48: ("dr_htom", 0, 0), 47: ("dr_htom", -250, 0),
        45: ("dr_ltom", 200, 0), 43: ("dr_ltom", 0, 0), 41: ("dr_ltom", -250, 0),
        54: ("tamb", 0, 0), 70: ("shaker", 0, 0), 69: ("shaker", -200, -2),
        81: ("triangle", 0, 0), 80: ("triangle", 0, -6),
        119: ("cym_swell", 0, 0),
    }
    if orchestra:
        m.update({35: ("bass_drum", 0, 0), 36: ("bass_drum", 0, 0), 38: ("orch_snare", 0, 0),
                  40: ("orch_snare", 0, 2), 49: ("clash", 0, 0), 57: ("clash", 100, 0), 51: ("sus_cym", 0, -4),
                  52: ("gong", 0, 0)})
    return m


DRUM_PANS = {"dr_hh_closed": -0.25, "dr_hh_pedal": -0.25, "dr_hh_open": -0.25, "dr_hh_half": -0.25,
             "dr_ride": 0.3, "dr_bell": 0.3, "dr_htom": -0.15, "dr_ltom": 0.25, "tamb": 0.35, "shaker": -0.35,
             "triangle": 0.4, "claps": 0.0}


def kit(orchestra: bool = False) -> VoiceFn:
    table = _kit_map(orchestra)

    def fn(n: Note, r: random.Random) -> list[Voice]:
        hit = table.get(n.pitch)
        if hit is None:
            return []
        src, cents, gdb = hit
        if src == "cym_swell":
            return swell()(n, r)
        return [Voice(src, n.t, n.dur, None, n.vel, gain_db=gdb, pan=DRUM_PANS.get(src, 0.0),
                      cents=cents + r.uniform(-8, 8), seed=n.idx)]

    return fn


# ---------------------------------------------------------------- 音色の一覧と GM 番号からの既定

SOUNDS: dict[str, Sound] = {
    "strings": Sound("strings", strings()),
    "strings_slow": Sound("strings_slow", strings(attack=0.25)),
    "strings_legato": Sound("strings_legato", strings(ensemble=2), legato=True),
    "strings_trem": Sound("strings_trem", strings("trem")),
    "strings_pizz": Sound("strings_pizz", strings("pizz", ensemble=1)),
    "strings_spic": Sound("strings_spic", strings("spic", ensemble=2)),
    "violins": Sound("violins", section("vln", -0.45, ensemble=3, spread=0.15, cents=7), legato=True),
    "violas": Sound("violas", section("vla", 0.1, ensemble=2, spread=0.15, cents=7)),
    "celli": Sound("celli", section("vc", 0.35, ensemble=2, spread=0.15, cents=6), legato=True),
    "basses": Sound("basses", section("cb", 0.5, ensemble=2, spread=0.1, cents=6)),
    "harp": Sound("harp", single("harp", pan=-0.35)),
    "brass": Sound("brass", brass()),
    "trumpet": Sound("trumpet", section("tpt", 0.2, ensemble=2), legato=True),
    "horn": Sound("horn", section("hn", -0.3, ensemble=2), legato=True),
    "horns4": Sound("horns4", section("hn", -0.3, ensemble=4, spread=0.12)),
    "trombone": Sound("trombone", section("tbn", 0.4, ensemble=2)),
    "tuba": Sound("tuba", section("tuba", 0.5)),
    "flute": Sound("flute", section("fl", -0.15), legato=True),
    "oboe": Sound("oboe", section("ob", 0.1), legato=True),
    "clarinet": Sound("clarinet", section("cl", 0.0), legato=True),
    "timpani": Sound("timpani", timpani()),
    "timp_roll": Sound("timp_roll", timpani(roll=True)),
    "orch_hit": Sound("orch_hit", orch_hit()),
    "taiko": Sound("taiko", taiko()),
    "swell": Sound("swell", swell()),
    "glock": Sound("glock", single("glock", pan=0.3)),
    "bells": Sound("bells", single("bells", pan=0.2)),
    "gong": Sound("gong", single("gong", keep_pitch=False)),
    "organ": Sound("organ", single("organ")),
    "organ_full": Sound("organ_full", single("organ_full")),
    "piano": Sound("piano", single("piano")),
    "bright_piano": Sound("bright_piano", single("piano"), post="bright"),
    "choir": Sound("choir", choir()),
    "oohs": Sound("oohs", choir(singers=4, attack=0.2), post="lowpass_oohs"),
    "chant": Sound("chant", choir("vox_short", singers=5)),
    "bass": Sound("bass", single("ebass"), post="bass_drive"),
    "pick_bass": Sound("pick_bass", single("ebass"), post="bass_pick"),
    "gtr_dist": Sound("gtr_dist", lambda n, r: single("egtr_stac" if n.dur < 0.3 else "egtr")(n, r), post="amp_dist"),
    "gtr_od": Sound("gtr_od", single("egtr"), post="amp_od"),
    "gtr_clean": Sound("gtr_clean", single("egtr"), post="amp_clean"),
    "kit": Sound("kit", kit()),
    "kit_orch": Sound("kit_orch", kit(orchestra=True)),
    # シンセ（録音の元が無い音色は synth.py で合成する）
    "supersaw": Sound("supersaw", synth("supersaw")),
    "synth_brass": Sound("synth_brass", synth("brass")),
    "synth_pad": Sound("synth_pad", synth("pad")),
    "synth_strings": Sound("synth_strings", synth("strings")),
    "square": Sound("square", synth("square")),
    "synth_bass": Sound("synth_bass", synth("bass")),
}

# GM 番号 → 既定の音色（ここに無い番号は FluidSynth のまま）
GM_SOUND: dict[int, str] = {
    0: "piano", 1: "bright_piano", 9: "glock", 14: "bells", 19: "organ",
    27: "gtr_clean", 28: "gtr_clean", 29: "gtr_od", 30: "gtr_dist",
    33: "bass", 34: "pick_bass", 38: "synth_bass", 39: "synth_bass",
    40: "violins", 42: "celli", 43: "basses", 44: "strings_trem", 45: "strings_pizz", 46: "harp",
    47: "timpani", 48: "strings", 49: "strings_slow", 50: "synth_strings",
    52: "choir", 53: "oohs", 54: "oohs", 55: "orch_hit",
    56: "trumpet", 57: "trombone", 58: "tuba", 60: "horn", 61: "brass", 62: "synth_brass",
    68: "oboe", 71: "clarinet", 73: "flute",
    80: "square", 81: "supersaw", 86: "supersaw", 87: "synth_bass", 89: "synth_pad", 90: "synth_pad",
    91: "oohs", 94: "synth_pad",
    116: "taiko", 119: "swell",
}


def sound_for(program: int, drum: bool, explicit: str = "") -> Sound | None:
    if explicit:
        if explicit == "fluid":
            return None
        return SOUNDS[explicit]
    if drum:
        return SOUNDS["kit_orch" if program == 48 else "kit"]
    name = GM_SOUND.get(program)
    return SOUNDS[name] if name else None
