# 液晶の絵（背景・キャラの立ち絵・敵）

液晶の背景 9 枚とキャラの立ち絵 5 枚，バトルの敵 3 体は，画像生成 AI（Figma AI の `generate_image`）で作ったオリジナルの絵．既存の作品の映像・画像は使っていない．キャラは灯守 5 人（こはる・しずく・ゆずは・あかね・すみれ）．

- 背景: `public/art/bg/<名前>.webp`（1280×960）と `<名前>.depth.webp`（奥行き，320×240）
- 背景の映像: `public/art/bg/<名前>.mp4`（960×720，H.264，音なし，継ぎ目なしでループ）．背景の絵を手元の GPU で動画生成 AI（Wan2.2 TI2V-5B，Apache-2.0）に動かさせたもの
- 立ち絵: `public/art/chara/<色>.webp`（上半身，背景は透過）
- 敵: `public/art/enemy/<名前>.webp`（全身，背景は透過）．`storm`（黒嵐）・`abyss`（深淵の主）・`shade`（影法師）

## 液晶での使い方

- 背景はシェーダ（`src/lcd/artShader.ts`）が奥行きを使って視差をつけ，ゆっくり寄ったり流したりして動かす．背景ごとに雨・稲妻・光の筋・水面の揺らぎなどを重ねる．絵が読めるまでと読めなかったときは，コードで描いた背景を使う．
- 背景の映像があれば，見えている背景（切り替え中は前後の 2 つ）だけ流し，絵の代わりにシェーダへ渡す．映像は絵と同じ構図なので奥行きは絵のものを使い，視差や重ねる効果もそのまま効く．最初のコマが出るまでと読めなかったときは絵を使う．
- どの場面でどの背景を出すかは `src/lcd/director.ts` の `backdropFor`．
- 立ち絵は `src/lcd/charaArt.ts` が読み，キャラの色で縁を光らせ，下端を透明に溶かした版を作っておく．カットイン・SP/SPSP・大当たりのラウンドで顔の位置に合わせて描く．読めるまではランタンで代わりをする．
- 敵は `src/lcd/enemyArt.ts` が読み，敵の色で縁を光らせた版と，被弾で重ねる白い影を作っておく．バトル（`src/lcd/battleScene.ts`）では灯守を左，敵を右に置き，交互に攻撃してから，ボタンの瞬間に勝ち負けを見せる．SPSP の黒嵐・深淵の主と，SP の影法師リーチで出る．読めるまでは影の紋で代わりをする．

## 作り直すとき

1. `scripts/art/prompts.json` の指示文で絵を作る．背景は `art-src/bg/<名前>.png`，立ち絵は `art-src/chara/<色>.png`，敵は `art-src/enemy/<名前>.png` に置く．立ち絵と敵は背景を緑一色（#00FF00）で作る．
2. 奥行き推定のモデル（Depth Anything V2 small，Apache-2.0）の ONNX を取ってくる．
   <https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx>
3. 配る形に変える（Python 3.11 以上，`onnxruntime` `opencv-python` `pillow` `numpy`）．

   ```bash
   py -3 -P scripts/art/build.py --src art-src --model <model.onnx>
   ```

   背景は縮めて webp にし，奥行きを別の画像に書き出す．立ち絵と敵は緑を抜き，絵のある範囲で切り詰める．炎や煙に混じった緑も落とすので，立ち絵と敵には緑を使わない．
   `--model` を省くと背景は作らず，立ち絵と敵だけ作る（このときは `onnxruntime` も要らない）．

立ち絵を差し替えて顔の位置が変わったら，`src/lcd/charaArt.ts` の `FACE`（絵の幅・高さに対する顔の位置）も合わせる．

`art-src/` と元の png は git に入れない．

### 背景の映像

背景の絵を作り直したら映像も作り直す．

1. 動画生成のモデル（Wan2.2 TI2V-5B の Diffusers 版，Apache-2.0，約 34 GB）を取ってくる．
   <https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers>
2. 背景ごとに 5 秒の動画を作る（CUDA の使える PyTorch と `diffusers` 0.35 以降，16 GB 以上の GPU）．指示文と設定は `scripts/video/prompts.json`．出力は `art-src/video/<名前>.mp4`．Transformer の重みは既定で fp8 に詰めて持つ（16 GB の GPU で溢れると数倍遅くなる．`--no-fp8` で切る）．16 GB の GPU で 1 本 10 分ほど．

   ```bash
   python scripts/video/gen.py --model <Wan2.2-TI2V-5B-Diffusers のフォルダ> [名前 ...]
   ```

3. 配る形に変える（ffmpeg，Python 3.11 以上，`numpy`）．960×720 に縮め，最後の 1 秒を最初へ溶かし込んで継ぎ目を消す．動画は絵の上下を少し切って作るので，絵の上へ重ねて元の構図に戻す（切った上下は止まった絵のままだが，液晶では寄せて見せるので映らない）．画質は `build.py` の `QP`（背景ごとに変えるなら `QP_BY_NAME`）で決める．

   ```bash
   py -3 -P scripts/video/build.py [名前 ...]
   ```

モデルは safetensors の重みだけを使う（`.bin` や `.pt` は読み込むときに任意のコードを走らせうる）．
