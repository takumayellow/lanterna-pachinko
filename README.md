# LANTERNA パチンコ

ブラウザで遊べるオリジナルのパチンコ．玉は物理で転がり，ヘソに入った瞬間に当否が決まる．保留の色・リーチ・カットイン・PUSH から，ST の RUSH まで．

灯ヶ丘の町を「影の帳」から守る灯守（ひもり）の少女 5 人と，ランタンの妖精ルミの物語．キャラ・曲・声・絵はすべてこのリポジトリのオリジナルで，実在の機種・メーカーとは関係ない．お金は賭けられない．

- 遊ぶ: <https://takumayellow.github.io/lanterna-pachinko/>
- 通常時は甘デジ（1/99.9）．URL に `?spec=full` を付けるとミドル（1/319.9）で動く．

## 開発

```bash
npm ci
npm run dev
npm test
```

URL に `?dev` を付けると開発者向けパネルが出る．当否・リーチの行き先・キャラ・カットイン・予告などを選んで「次の変動にセット」を押すと，その保留が先頭に積まれる．選ばなかった項目は普段どおり抽選する．このときはセーブしない．

## 素材

- 曲: コードで作曲して書き出したもの（[docs/music.md](docs/music.md)）．楽器は CC0 の録音サンプルと MuseScore の `MS Basic.sf3` で鳴らす．
- 効果音: コードで合成したもの（[docs/se.md](docs/se.md)）．
- 声: VOICEVOX で書き出して加工したもの（`scripts/voice/build.mjs`）．
- 液晶の絵: 画像生成 AI で作ったオリジナルの絵．背景は手元の GPU で動画生成 AI に動かさせた映像を流す（[docs/art.md](docs/art.md)）．
- `local-assets/` に自分で用意した映像や曲を置くと，場面ごとに差し替えて試せる（git には入れない）．

## クレジット

- 音声: VOICEVOX:青山龍星 ／ VOICEVOX:中部つるぎ ／ VOICEVOX:冥鳴ひまり ／ VOICEVOX:No.7 ／ VOICEVOX:東北ずん子 ／ VOICEVOX 離途 ／ VOICEVOX:四国めたん ／ VOICEVOX:九州そら
- 録音サンプル（CC0）: Versilian Studios（VSCO 2 CE・VCSL・Virtuosity Drums），Karoryfer Samples（Black And Blue Basses・Black And Green Guitars・Hadzi-Fia legato vocal）
- サウンドフォント: MS Basic（MuseScore_General．MIT）— FluidR3 (original version) by Frank Wen Copyright (c) 2000-02 ／ Mono conversion (FluidR3Mono) by Michael Cowgill Copyright (c) 2014-17 ／ Adaptation for MuseScore_General.sf2 by S. Christian Collins Copyright (c) 2018-19 ／ Temple Blocks instrument provided by Ethan Winer Copyright (c) 2002 ／ Drumline Cymbals provided by Michael Schorsch Copyright (c) 2016
- 奥行き推定: Depth Anything V2（Apache-2.0）／ 背景の映像: Wan2.2 TI2V-5B（Apache-2.0）

## 音声の利用規約

`public/audio/voice/` の音声は VOICEVOX の各キャラクターの規約に従って作ったもの．音声を取り出して使うときは，次の規約に従い，同じクレジットを書くこと．

- 青山龍星: <https://www.virvoxproject.com/voicevoxの利用規約>
- 中部つるぎ・四国めたん・九州そら・東北ずん子: <https://zunko.jp/con_ongen_kiyaku.html>
- 冥鳴ひまり: <https://www.meimeihimari.com/terms-of-use>
- No.7: <https://voiceseven.com/>
- 離途: <https://litmus9.com/voicebank/>
