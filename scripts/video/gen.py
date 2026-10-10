"""
液晶の背景の絵を、手元の GPU で動画にする（Wan2.2 TI2V-5B、Apache-2.0）。

  python scripts/video/gen.py --model <Wan2.2-TI2V-5B-Diffusers のフォルダ> [名前 ...]

- 入力: art-src/bg/<名前>.png（scripts/art/prompts.json で作った絵）
- 出力: art-src/video/<名前>.mp4（生のまま。配る形には scripts/video/build.py で変える）
- 指示文と設定は scripts/video/prompts.json。名前を渡すとその背景だけ作り直す

要るもの: CUDA の使える PyTorch と diffusers 0.35 以降（python はそれを入れた環境のもの）、16 GB 以上の GPU（足りない分は CPU に逃がす）。
手順は docs/art.md。
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from diffusers import WanImageToVideoPipeline
from diffusers.utils import export_to_video
from PIL import Image

PROMPTS = Path(__file__).with_name("prompts.json")


def cover(img: Image.Image, w: int, h: int) -> Image.Image:
    """縦横比を保って w×h を覆うように縮め、はみ出た分を中央で切る"""
    s = max(w / img.width, h / img.height)
    r = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x, y = (r.width - w) // 2, (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, required=True, help="Wan2.2-TI2V-5B-Diffusers のフォルダ")
    ap.add_argument("--src", type=Path, default=Path("art-src"))
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument(
        "--fp8",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Transformer の重みを fp8 で持つ（計算は bf16）。16 GB の GPU で溢れて遅くなるのを防ぐ",
    )
    ap.add_argument("names", nargs="*", help="作る背景（省くと全部）")
    a = ap.parse_args()

    cfg = json.loads(PROMPTS.read_text(encoding="utf-8"))
    clips = {k.removeprefix("bg/"): v for k, v in cfg["clips"].items()}
    unknown = [n for n in a.names if n not in clips]
    if unknown:
        raise SystemExit(f"prompts.json に無い背景: {', '.join(unknown)}")
    names = a.names or list(clips)
    w, h = cfg["size"]

    pipe = WanImageToVideoPipeline.from_pretrained(str(a.model), torch_dtype=torch.bfloat16)
    if a.fp8:
        pipe.transformer.enable_layerwise_casting(storage_dtype=torch.float8_e4m3fn, compute_dtype=torch.bfloat16)
    pipe.enable_model_cpu_offload()
    pipe.vae.enable_tiling()

    out = a.src / "video"
    out.mkdir(parents=True, exist_ok=True)
    for name in names:
        t0 = time.time()
        image = cover(Image.open(a.src / "bg" / f"{name}.png").convert("RGB"), w, h)
        frames = pipe(
            image=image,
            prompt=clips[name],
            negative_prompt=cfg["negative"],
            width=w,
            height=h,
            num_frames=cfg["frames"],
            num_inference_steps=cfg["steps"],
            guidance_scale=cfg["guidance"],
            generator=torch.Generator("cuda").manual_seed(a.seed),
        ).frames[0]
        dst = out / f"{name}.mp4"
        # 継ぎ目を作る段でもう一度圧縮するので、ここでは画質を落とさない
        export_to_video(frames, str(dst), fps=cfg["fps"], quality=9.5)
        print(f"{dst}  {len(frames)} frames  {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
