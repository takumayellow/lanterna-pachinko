"""
液晶の絵（背景・キャラ・敵）を配る形に変える。

  py -3 -P scripts/art/build.py --src art-src [--model <depth-anything-v2-small の model.onnx>]

- 背景: art-src/bg/<名前>.png → public/art/bg/<名前>.webp と <名前>.depth.webp
  奥行き（手前ほど白）は液晶のシェーダが視差に使う。alpha に入れるとブラウザが色を
  乗算済みにして遠景（alpha が 0 に近い所）の色が崩れるので、別の画像にする。
- キャラ: art-src/chara/<名前>.png（緑一色の背景）→ public/art/chara/<名前>.webp
  緑を抜いて縁の緑かぶりを取り、絵のある範囲で切り詰める。
- 敵: art-src/enemy/<名前>.png（緑一色の背景）→ public/art/enemy/<名前>.webp。作り方はキャラと同じ
- 奥行きの推定モデル（--model）は背景を作るときだけ要る。省くと背景は作らない。

元の絵は scripts/art/prompts.json の指示文で作ったもの（手順は docs/art.md）。art-src/ は git に入れない。
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

OUT = Path("public/art")
BG_SIZE = (1280, 960)
# 奥行きはぼかしてから使うので小さくてよい
DEPTH_SIZE = (320, 240)
# 深度モデルへの入力（14 の倍数で 4:3 に近いもの）
DEPTH_IN = (518, 392)
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def estimate_depth(session, rgb: np.ndarray) -> np.ndarray:
    """手前ほど 1 の奥行き（0..1）。視差で絵が裂けないよう、なめらかにしておく"""
    x = cv2.resize(rgb, DEPTH_IN, interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    x = ((x - MEAN) / STD).transpose(2, 0, 1)[None]
    d = session.run(None, {"pixel_values": x})[0][0]
    lo, hi = np.percentile(d, [2, 98])
    d = np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)
    d = cv2.resize(d, BG_SIZE, interpolation=cv2.INTER_CUBIC)
    # 輪郭を残したまま面を均す → 大きくぼかして段差を緩める
    d = cv2.bilateralFilter(d.astype(np.float32), 9, 0.1, 9)
    d = cv2.GaussianBlur(d, (0, 0), 6)
    return np.clip(d, 0, 1)


def build_bg(session, src: Path, dst: Path) -> Path:
    img = Image.open(src).convert("RGB").resize(BG_SIZE, Image.LANCZOS)
    img.save(dst, "WEBP", quality=84, method=6)
    depth = estimate_depth(session, np.asarray(img))
    small = cv2.resize(depth, DEPTH_SIZE, interpolation=cv2.INTER_AREA)
    ddst = dst.with_suffix(".depth.webp")
    Image.fromarray((small * 255).round().astype(np.uint8), "L").convert("RGB").save(ddst, "WEBP", lossless=True)
    return ddst


def key_green(rgb: np.ndarray) -> np.ndarray:
    """緑一色の背景を抜いた RGBA（髪の間に囲まれた緑も抜く）。炎や煙の中に混じった緑も、赤・青の大きい方まで落とす
    （絵には緑を使わせていない）"""
    f = rgb.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    excess = g - np.maximum(r, b)
    alpha = 1.0 - np.clip((excess - 40.0) / 90.0, 0, 1)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.7)
    g2 = np.minimum(g, np.maximum(r, b))
    out = np.dstack([r, g2, b, alpha * 255]).round().clip(0, 255).astype(np.uint8)
    return out


def build_cutout(src: Path, dst: Path) -> dict:
    rgba = key_green(np.asarray(Image.open(src).convert("RGB")))
    ys, xs = np.nonzero(rgba[..., 3] > 8)
    if xs.size == 0:
        raise SystemExit(f"{src}: 緑を抜くと何も残りません（背景の緑が明るすぎないか確かめる）")
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = rgba[y0:y1, x0:x1]
    Image.fromarray(crop, "RGBA").save(dst, "WEBP", quality=88, alpha_quality=90, method=6)
    return {"w": int(x1 - x0), "h": int(y1 - y0)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=Path("art-src"))
    ap.add_argument("--model", type=Path, help="depth-anything-v2-small の model.onnx（省くと背景は作らない）")
    a = ap.parse_args()

    if a.model:
        import onnxruntime as ort

        session = ort.InferenceSession(str(a.model), providers=["CPUExecutionProvider"])
        (OUT / "bg").mkdir(parents=True, exist_ok=True)
        for src in sorted((a.src / "bg").glob("*.png")):
            dst = OUT / "bg" / f"{src.stem}.webp"
            ddst = build_bg(session, src, dst)
            print(f"{dst}  {dst.stat().st_size // 1024} KB  + {ddst.stat().st_size // 1024} KB")
    for kind in ("chara", "enemy"):
        (OUT / kind).mkdir(parents=True, exist_ok=True)
        sizes = {}
        for src in sorted((a.src / kind).glob("*.png")):
            dst = OUT / kind / f"{src.stem}.webp"
            sizes[src.stem] = build_cutout(src, dst)
            print(f"{dst}  {dst.stat().st_size // 1024} KB  {sizes[src.stem]}")
        if sizes:
            print(json.dumps(sizes))


if __name__ == "__main__":
    main()
