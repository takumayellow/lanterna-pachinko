"""曲の定義から docs/music.md（構成・コード進行・楽器）を書く. 定義と文書がずれないよう自動で作る."""

from __future__ import annotations

import json
from pathlib import Path

import instruments
import samples
from arrange import GM, KIT, Song

LABEL = {
    "piano": "ピアノ", "bright_piano": "ブライトピアノ", "celesta": "チェレスタ", "glock": "グロッケン",
    "music_box": "オルゴール", "tubular": "チューブラーベル", "mute_gtr": "ギター（ブリッジミュート）",
    "od_gtr": "オーバードライブギター", "dist_gtr": "ディストーションギター", "finger_bass": "エレキベース（指）",
    "pick_bass": "エレキベース（ピック）", "synth_bass": "シンセベース", "cello": "チェロ",
    "contrabass": "コントラバス", "trem_str": "弦（トレモロ）", "pizz": "弦（ピチカート）", "harp": "ハープ",
    "timpani": "ティンパニ", "strings": "弦", "slow_strings": "弦（遅い立ち上がり）",
    "synth_strings": "シンセストリングス", "choir": "クワイア（Aahs）", "oohs": "クワイア（Oohs）",
    "orch_hit": "オーケストラヒット", "trumpet": "トランペット", "trombone": "トロンボーン",
    "horn": "ホルン", "brass": "ブラスセクション", "synth_brass": "シンセブラス", "flute": "フルート",
    "square": "シンセ（矩形波）", "saw": "シンセリード（鋸歯状波）", "polysynth": "シンセパッド",
    "warm_pad": "パッド", "taiko": "和太鼓", "violin": "ヴァイオリン", "oboe": "オーボエ",
    "church_organ": "パイプオルガン",
}
# 録音サンプルで鳴らす音色の呼び名（GM の名前と違うものだけ）
SOUND_LABEL = {
    "violins": "ヴァイオリン", "celli": "チェロ", "basses": "コントラバス", "horns4": "ホルン 4 本",
    "strings_spic": "弦（スピッカート）", "timp_roll": "ティンパニ（ロール）", "chant": "詠唱（短い母音）",
    "organ_full": "パイプオルガン（フル）", "organ": "パイプオルガン",
}
KIT_LABEL = {v: k for k, v in KIT.items()}
GM_KEY = {v: k for k, v in GM.items()}


def _label(p) -> str:
    if p.drum:
        return f"ドラム（{KIT_LABEL.get(p.program, p.program)} キット）"
    if p.sound in SOUND_LABEL:
        return SOUND_LABEL[p.sound]
    return LABEL.get(GM_KEY.get(p.program, ""), p.name)


def _instruments(song: Song) -> str:
    seen: list[str] = []
    for p in song.parts:
        name = _label(p)
        if instruments.sound_for(p.program, p.drum, p.sound) is None:
            name += "（FluidSynth）"
        if name not in seen:
            seen.append(name)
    extra = "・合成のサブキック" if song.sub_kick is not None else ""
    return "・".join(seen) + extra


def _credits() -> list[str]:
    files = json.loads(samples.LOCK.read_text(encoding="utf-8"))["files"]
    counts = {lib: len(entries) for lib, entries in files.items()}
    lines = ["| ライブラリ | 作者 | ライセンス | 固定したコミット | 使うファイル数 |", "|---|---|---|---|---|"]
    for name, lib in samples.LIBRARIES.items():
        url = f"https://github.com/{lib['repo']}/tree/{lib['commit']}"
        lines.append(f"| [{lib['title']}]({url}) | {lib['author']} | {lib['license']} | "
                     f"`{lib['commit'][:12]}` | {counts.get(name, 0)} |")
    return lines


def write_docs(songs: list[Song], path: Path) -> None:
    lines = [
        "# BGM",
        "",
        "すべてコードで作曲した曲（`scripts/music/`）．旋律はすべてこのリポジトリのオリジナル．"
        "楽器は CC0 の録音サンプル（下の表）で鳴らし，録音の元が無い音色だけ FluidSynth で"
        " MuseScore 4 付属の `MS Basic.sf3` を鳴らす（楽器の欄に「FluidSynth」と書いたもの）．",
        "このファイルは `npm run music` が曲の定義から書き出す（手で直さない）．",
        "",
        "## 作り方",
        "",
        "1. `scripts/music/songs/<id>.py` が音符を並べる（旋律は音名と拍数の文字列，伴奏は型の関数）．"
        "発音時刻と強さは曲名・パート名を種にして揺らす（何度作っても同じ結果になる）．",
        "2. `samples.py` が固定したコミットの録音を `sample-libs/`（git 管理外）へ取り，sha1 で検証する．"
        "`sampler.py` は各録音の高さと音量を測っておく．",
        "3. `instruments.py` が音符を録音の声部に割り振る．弦は音域でヴァイオリン・ヴィオラ・チェロ・コントラバスに"
        "分け，金管はトランペット・ホルン・トロンボーン・テューバに分け，それぞれ座席の位置に置く．"
        "強さで録音の強弱の層を選び，短い音はスピッカート／スタッカートの録音にする．合唱は同じ歌い手を"
        "ずらして重ねる．ギターとベースはライン録りの録音にアンプの歪みを掛ける．シンセの音色は `synth.py` で合成する．",
        "4. ステムの音量をそろえてパン・ホールのリバーブ（初期反射 + 残響）・サイドチェインを掛けて混ぜる．",
        "5. ffmpeg で EQ・コンプ・リミッタ（4 倍オーバーサンプル）・`loudnorm`（2 パス, linear）．"
        "ループ曲は -14 LUFS，ジングルは -12 LUFS．トゥルーピークは -1 dBTP 以下．",
        "6. mp3（192 kbps）にして `public/audio/bgm/` へ．`manifest.json` にループ点を書く．",
        "",
        "## 録音サンプルの出典",
        "",
        "どれも CC0（パブリックドメイン）．リポジトリには入れず，`python scripts/music/samples.py fetch`"
        "（`npm run music` も最初に同じことをする）で取る．取るファイルと sha1 は `scripts/music/samples.lock.json`．",
        "",
        *_credits(),
        "",
        "## ループの形式",
        "",
        "ループ曲のファイルは `[前置き 0.25 秒][本体 1 周][続き 0.35 秒]`．前置きは本体の最後，"
        "続きは本体の最初と同じ波形なので，`loopStart`〜`loopEnd` を繰り返すと継ぎ目が出ない．"
        "エンコーダの先頭パディングを捨てないデコーダでも全体が数十 ms ずれるだけで，"
        "継ぎ目は前置き・続きの中に収まる．再生は `start(0, loopStart)` から始めるとよい"
        "（0 から始めると前置きの 0.25 秒がフェードインで先に鳴る）．",
        "",
    ]
    for s in songs:
        sec = s.beats * 60 / s.bpm
        kind = f"ループ {sec:.2f} 秒" if s.loop else f"ワンショット 約 {(s.beats + s.tail_beats) * 60 / s.bpm:.1f} 秒"
        meter = f"{s.meter}/4 拍子・" if s.meter != 4 else ""
        lines += [f"## {s.id}（{s.title}）", "",
                  f"{s.bpm:g} BPM・{meter}{s.key}・{s.bars} 小節・{kind}", "",
                  "| セクション | 小節 | コード |", "|---|---|---|"]
        for part in s.sections:
            lines.append(f"| {part.name} | {part.bars} | {part.chords} |")
        lines += ["", f"楽器: {_instruments(s)}", ""]
    path.write_text("\n".join(lines), encoding="utf-8")
