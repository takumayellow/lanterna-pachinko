# BGM

すべてコードで作曲した曲（`scripts/music/`）．旋律はすべてこのリポジトリのオリジナル．楽器は CC0 の録音サンプル（下の表）で鳴らし，録音の元が無い音色だけ FluidSynth で MuseScore 4 付属の `MS Basic.sf3` を鳴らす（楽器の欄に「FluidSynth」と書いたもの）．
このファイルは `npm run music` が曲の定義から書き出す（手で直さない）．

## 作り方

1. `scripts/music/songs/<id>.py` が音符を並べる（旋律は音名と拍数の文字列，伴奏は型の関数）．発音時刻と強さは曲名・パート名を種にして揺らす（何度作っても同じ結果になる）．
2. `samples.py` が固定したコミットの録音を `sample-libs/`（git 管理外）へ取り，sha1 で検証する．`sampler.py` は各録音の高さと音量を測っておく．
3. `instruments.py` が音符を録音の声部に割り振る．弦は音域でヴァイオリン・ヴィオラ・チェロ・コントラバスに分け，金管はトランペット・ホルン・トロンボーン・テューバに分け，それぞれ座席の位置に置く．強さで録音の強弱の層を選び，短い音はスピッカート／スタッカートの録音にする．合唱は同じ歌い手をずらして重ねる．ギターとベースはライン録りの録音にアンプの歪みを掛ける．シンセの音色は `synth.py` で合成する．
4. ステムの音量をそろえてパン・ホールのリバーブ（初期反射 + 残響）・サイドチェインを掛けて混ぜる．
5. ffmpeg で EQ・コンプ・リミッタ（4 倍オーバーサンプル）・`loudnorm`（2 パス, linear）．ループ曲は -14 LUFS，ジングルは -12 LUFS．トゥルーピークは -1 dBTP 以下．
6. mp3（192 kbps）にして `public/audio/bgm/` へ．`manifest.json` にループ点を書く．

## 録音サンプルの出典

どれも CC0（パブリックドメイン）．リポジトリには入れず，`python scripts/music/samples.py fetch`（`npm run music` も最初に同じことをする）で取る．取るファイルと sha1 は `scripts/music/samples.lock.json`．

| ライブラリ | 作者 | ライセンス | 固定したコミット | 使うファイル数 |
|---|---|---|---|---|
| [Versilian Studios Chamber Orchestra 2 Community Edition](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e) | Versilian Studios (Samuel Gossner) | CC0-1.0 | `440300901dfe` | 1104 |
| [Versilian Community Sample Library](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e) | Versilian Studios (Samuel Gossner) | CC0-1.0 | `c1ea7bcc3c73` | 211 |
| [Hadzi-Fia legato vocal tutorial (vowel a)](https://github.com/sfzinstruments/legato_vocal_tutorial/tree/fac6461ee4c7f498b23246eced644616fa58d2ec) | Karoryfer Samples / sfzinstruments | CC0-1.0 | `fac6461ee4c7` | 115 |
| [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums/tree/9f04cf9a734527edfbb0a4eee1f674e45bbf71bc) | Versilian Studios / sfzinstruments | CC0-1.0 | `9f04cf9a7345` | 482 |
| [Black And Blue Basses (dark black)](https://github.com/sfzinstruments/karoryfer.black-and-blue-basses/tree/6e7d674cdb41be7a54dbccb15472401ad01099b9) | Karoryfer Samples | CC0-1.0 | `6e7d674cdb41` | 222 |
| [Black And Green Guitars (black)](https://github.com/sfzinstruments/karoryfer.black-and-green-guitars/tree/b3b3249d37dc977a1a297bd2dc053e6d9b6b805c) | Karoryfer Samples | CC0-1.0 | `b3b3249d37dc` | 176 |

## ループの形式

ループ曲のファイルは `[前置き 0.25 秒][本体 1 周][続き 0.35 秒]`．前置きは本体の最後，続きは本体の最初と同じ波形なので，`loopStart`〜`loopEnd` を繰り返すと継ぎ目が出ない．エンコーダの先頭パディングを捨てないデコーダでも全体が数十 ms ずれるだけで，継ぎ目は前置き・続きの中に収まる．再生は `start(0, loopStart)` から始めるとよい（0 から始めると前置きの 0.25 秒がフェードインで先に鳴る）．

## normal（通常時）

128 BPM・D minor・32 小節・ループ 60.00 秒

| セクション | 小節 | コード |
|---|---|---|
| イントロ | 4 | Dmadd9 | Bbmaj7 | Gm7 | A7sus4:2 A7:2 |
| A | 8 | Dm | Bbmaj7 | Gm7 | A7 | Dm | F/C | Bbmaj7 | Asus4:2 A:2 |
| B | 8 | Gm7 | C7 | Fmaj7 | Bbmaj7 | Em7b5 | A7 | Dm | A7/C# |
| サビ | 8 | Bb | C | Am7 | Dm | Gm7 | C | F | A7 |
| アウトロ | 4 | Dm | Bbmaj7 | Gm6 | A7sus4:2 A7:2 |

楽器: チェレスタ（FluidSynth）・フルート・グロッケン・ヴァイオリン・弦（ピチカート）・ハープ・弦（遅い立ち上がり）・クワイア（Aahs）・エレキベース（指）・ドラム（room キット）

## chance（チャンス中）

168 BPM・C minor・40 小節・ループ 57.14 秒

| セクション | 小節 | コード |
|---|---|---|
| イントロ（和太鼓と刻み） | 4 | Cm | Ab | Fm | G |
| A（ヴァイオリンの主題） | 8 | Cm | Cm | Ab | Bb | Cm | Eb | Fm | G |
| B（上昇） | 8 | Ab | Bb | Gm | Cm | Fm | Gm | Ab | Gsus4:2 G:2 |
| サビ（金管の主題） | 16 | Ab | Bb | Gm | Cm | Fm | Bb | Eb | G | Ab | Bb | Gm | Cm | Fm | G | Cm | G7 |
| アウトロ | 4 | Cm | Ab | Fm | G |

楽器: 弦（スピッカート）・ヴァイオリン・弦（トレモロ）・ホルン 4 本・ブラスセクション・トロンボーン・クワイア（Aahs）・クワイア（Oohs）・グロッケン・エレキベース（ピック）・ティンパニ・ティンパニ（ロール）・和太鼓・ドラム（power キット）

## reach（リーチ）

150 BPM・E minor・32 小節・ループ 51.20 秒

| セクション | 小節 | コード |
|---|---|---|
| イントロ | 4 | Em | C | Em | B7 |
| A（ホルンの主題） | 8 | Em | C | Am | B7 | Em | C | Am | B7 |
| B（上昇） | 8 | Am | Bm | C | D | Em | F#m7b5 | G | B7 |
| サビ（ブラスの主題） | 8 | Em | C | Am | B7 | Em | C | Am | B7 |
| ブリッジ | 4 | Em | C | Am | B7sus4:2 B7:2 |

楽器: 弦・ホルン・ブラスセクション・ヴァイオリン・弦（トレモロ）・トロンボーン・クワイア（Aahs）・クワイア（Oohs）・エレキベース（ピック）・ティンパニ・ティンパニ（ロール）・和太鼓・ドラム（power キット）

## battle（SP リーチ（黒嵐戦））

160 BPM・D minor・40 小節・ループ 60.00 秒

| セクション | 小節 | コード |
|---|---|---|
| イントロ | 4 | Dm | Dm | Bb:2 C:2 | A |
| A（ギターのリフ） | 8 | Dm | Dm | Bb | A | Dm | Dm | Eb | A |
| B（クワイア） | 8 | Bb | C | Dm | Dm | Bb | C | A | A |
| サビ（ブラス） | 8 | Dm | Bb | Gm | A | Dm | Bb | Eb | A7 |
| D（半分のテンポ感） | 8 | Gm | Dm | Eb | A | Gm | Dm | Eb | A |
| E（戻り） | 4 | Dm | Bb | Eb | A |

楽器: ディストーションギター・オーバードライブギター・ブラスセクション・トランペット・ホルン・クワイア（Aahs）・弦・エレキベース（ピック）・ティンパニ・ティンパニ（ロール）・ドラム（power キット）

## round（大当たりラウンド）

170 BPM・E major・40 小節・ループ 56.47 秒

| セクション | 小節 | コード |
|---|---|---|
| イントロ（リフ） | 4 | E | C#m | A | B |
| A メロ | 8 | C#m | A | B | E | C#m | A | F#m | B |
| B メロ | 8 | A | B | G#m | C#m | F#m | G#m | A | Bsus4:2 B:2 |
| サビ | 16 | Amaj7 | B | G#m7 | C#m | F#m7 | B | E | E | Amaj7 | B | G#m7 | C#m | F#m7 | G#m7 | A | B |
| 間奏（ギターのリフ） | 4 | E | C#m | A | B |

楽器: シンセリード（鋸歯状波）・弦・グロッケン・オーバードライブギター・ブラスセクション・ディストーションギター・ブライトピアノ・エレキベース（ピック）・ドラム（power キット）

## rush（RUSH）

165 BPM・F# minor・44 小節・ループ 64.00 秒

| セクション | 小節 | コード |
|---|---|---|
| イントロ | 4 | F#m | D | A | E |
| A（ベルの対旋律） | 8 | F#m | D | A | E | F#m | D | Bm | C#7 |
| ビルド | 8 | D | E | C#m | F#m | Bm | C#m | D | E |
| ドロップ（サビ） | 16 | F#m | D | A | E | F#m | D | Bm | C#7 | F#m | D | A | E | Bm | D | E | E |
| ポスト（ギターの旋律） | 8 | F#m | D | A | E | F#m | D | E | C#7 |

楽器: シンセリード（鋸歯状波）・シンセブラス・オーバードライブギター・グロッケン・シンセ（矩形波）・シンセパッド・シンセストリングス・ディストーションギター・シンセベース・ドラム（standard キット）・合成のサブキック

## lt（LT（上位 RUSH））

172 BPM・A major・44 小節・ループ 61.40 秒

| セクション | 小節 | コード |
|---|---|---|
| イントロ（金管と合唱の和音） | 4 | A | F#m | D | E |
| A（ホルンの呼び掛け） | 8 | A | E | F#m | D | A | E | D | E |
| ビルド | 8 | Bm | C#m | D | E | Bm | C#m | D | Esus4:2 E:2 |
| サビ（金管と合唱の主題） | 16 | D | E | C#m | F#m | Bm | E | A | A | D | E | C#m | F#m | Bm | D | Esus4:2 E:2 | E |
| ポスト（合唱） | 8 | A | E | F#m | D | A | E | D | E |

楽器: ブラスセクション・トランペット・ホルン 4 本・トロンボーン・クワイア（Aahs）・クワイア（Oohs）・ヴァイオリン・弦（スピッカート）・シンセリード（鋸歯状波）・シンセ（矩形波）・シンセパッド・グロッケン・ディストーションギター・シンセベース・ティンパニ・ティンパニ（ロール）・オーケストラヒット・ドラム（standard キット）・合成のサブキック

## fanfare（大当たりファンファーレ）

132 BPM・C major・2 小節・ワンショット 約 5.5 秒

| セクション | 小節 | コード |
|---|---|---|
| ファンファーレ | 2 | C | Ab:1 Bb:1 C:2 |

楽器: トランペット・ブラスセクション・ホルン・オーケストラヒット・弦・グロッケン・ティンパニ・コントラバス・ドラム（orchestra キット）

## rush_in（RUSH 突入）

165 BPM・F# major・2 小節・ワンショット 約 4.4 秒

| セクション | 小節 | コード |
|---|---|---|
| 突入 | 2 | D | E → F# |

楽器: 弦・ブラスセクション・クワイア（Aahs）・オーケストラヒット・ディストーションギター・ティンパニ・ティンパニ（ロール）・エレキベース（ピック）・ドラム（power キット）

## rush_end（RUSH 終了）

84 BPM・D minor・1 小節・ワンショット 約 3.9 秒

| セクション | 小節 | コード |
|---|---|---|
| 終止 | 1 | Bbmaj7:1.5 A7sus4:.75 A7:.75 Dm:1 |

楽器: ピアノ・弦（遅い立ち上がり）・クワイア（Oohs）・チェロ

## spsp_story（SPSP（物語））

80 BPM・B minor・20 小節・ループ 60.00 秒

| セクション | 小節 | コード |
|---|---|---|
| 序奏（オーボエ） | 4 | Bm | Gmaj7 | Em7 | F#sus4:2 F#:2 |
| A（チェロの主題） | 8 | Bm | G | D | A | Bm | G | Em7 | F#sus4:2 F#:2 |
| サビ（合唱と弦） | 8 | G | A | F#m7 | Bm | Em7 | F#m7 | G:2 A:2 | Bsus4:2 B:2 |

楽器: オーボエ・チェロ・ヴァイオリン・弦（遅い立ち上がり）・コントラバス・クワイア（Aahs）・クワイア（Oohs）・ホルン 4 本・ハープ・ピアノ・ティンパニ・ティンパニ（ロール）・チューブラーベル・ドラム（orchestra キット）

## spsp_storm（SPSP（黒嵐））

132 BPM・D minor（Phrygian の bII 入り）・32 小節・ループ 58.18 秒

| セクション | 小節 | コード |
|---|---|---|
| 序奏（オルガンと鐘） | 4 | Dm | Eb | Dm | A7 |
| A（詠唱） | 8 | Dm | Eb | Dm | C | Bb | C | Dm:2 Eb:2 | Dm |
| B（合唱と弦） | 8 | Gm | Dm | Bb | A | Gm | Dm | Eb | A7 |
| C（詠唱と金管の主題） | 8 | Dm | Eb | Dm | C | Bb | C | Dm:2 Eb:2 | Dm |
| ブリッジ | 4 | Dm | Eb | Dm | A7 |

楽器: 詠唱（短い母音）・クワイア（Aahs）・弦（スピッカート）・ヴァイオリン・弦（トレモロ）・ブラスセクション・トロンボーン・パイプオルガン（フル）・コントラバス・チューブラーベル・ティンパニ・ティンパニ（ロール）・和太鼓・ドラム（orchestra キット）

## spsp_abyss（SPSP（深淵））

150 BPM・3/4 拍子・G minor・48 小節・ループ 57.60 秒

| セクション | 小節 | コード |
|---|---|---|
| 序奏（オルガンとハープ） | 8 | Gm | Gm | Eb | Eb | Cm | Cm | D7 | D7 |
| A（弦のワルツ） | 16 | Gm | Gm | Cm | Cm | F | F | Bb | Bb | Eb | Eb | Cm | Cm | D | D | D7 | D7 |
| サビ（合唱とフルオルガン） | 16 | Eb | Eb | F | F | Dm | Dm | Gm | Gm | Cm | Cm | Gm/D | Gm/D | Eb | D7 | Gm | Gm |
| ブリッジ（ピアノ） | 8 | Cm | Cm | Gm | Gm | Ab | Ab | D7 | D7 |

楽器: パイプオルガン・パイプオルガン（フル）・ハープ・ヴァイオリン・フルート・コントラバス・チェロ・弦（ピチカート）・弦（スピッカート）・クワイア（Aahs）・クワイア（Oohs）・ホルン 4 本・ピアノ・ティンパニ・ティンパニ（ロール）・チューブラーベル・ドラム（orchestra キット）
