"""
gen.py で作った背景の動画を、液晶で流す形に変える。

  py -3 -P scripts/video/build.py [名前 ...]

- 入力: art-src/video/<名前>.mp4 と、その元の絵 art-src/bg/<名前>.png
- 出力: public/art/bg/<名前>.mp4（H.264、ループの継ぎ目なし、音なし）

最後の XFADE コマを最初のコマへ溶かし込み、その分を短くして継ぎ目を消す。
gen.py は絵の上下を少し切って動画にするので、絵を SIZE に縮めた上の中央へ戻して、背景の絵（<名前>.webp）と
同じ構図にする。切った上下は止まった絵のままだが、液晶では寄せて見せるので映らない。
奥行き（<名前>.depth.webp）もそのまま使える。
要るもの: ffmpeg（PATH）、Python 3.11 以上、numpy。
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np

SRC = Path("art-src/video")
STILL = Path("art-src/bg")
OUT = Path("public/art/bg")
# 背景の絵（1280×960）と同じ縦横比。液晶ではこれ以上の大きさで見せない
SIZE = (960, 720)
FPS = 24
# 継ぎ目を溶かすコマ数（1 秒）
XFADE = 24
# 画質（x264 の量子化値）。数字が大きいほど小さく粗い
QP = 28
# 前へ流れ続ける映像はコマごとに中身が入れ替わって 4 倍ほど重くなる。動きで粗さは見えないので粗くする
QP_BY_NAME = {"rush": 32}
# 全部のコマを同じ画質にする。x264 の既定ではキーフレームだけ細かく、ほかのコマは水面などの細かい動きを
# 捨てがちなので、ループの頭と終わりで動きが止まってから跳んで見える
X264 = "mbtree=0:ipratio=1.0:pbratio=1.0"
PROMPTS = Path(__file__).with_name("prompts.json")


def probe(path: Path) -> tuple[int, int]:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    s = json.loads(r.stdout)["streams"][0]
    return s["width"], s["height"]


def decode(path: Path, w: int, h: int) -> np.ndarray:
    """w×h に縮めたコマ（n, h, w, 3 の uint8）。絵なら 1 コマ"""
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"scale={w}:{h}:flags=lanczos", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        check=True,
        capture_output=True,
    )
    return np.frombuffer(r.stdout, np.uint8).reshape(-1, h, w, 3)


def read_frames(video: Path, still: Path) -> np.ndarray:
    """動画を SIZE の絵の中央へ重ねたコマ（n, h, w, 3 の uint8）。動画は絵を幅で合わせて上下を切ったもの"""
    w, h = SIZE
    vw, vh = probe(video)
    sh = round(vh * w / vw)
    if sh > h:
        raise SystemExit(f"{video} は絵より縦長（{vw}x{vh}）")
    frames = decode(video, w, sh)
    out = np.repeat(decode(still, w, h), len(frames), axis=0)
    y = (h - sh) // 2
    out[:, y : y + sh] = frames
    return out


def seamless(frames: np.ndarray, k: int) -> np.ndarray:
    """末尾 k コマを先頭 k コマに重ねて溶かし、長さ n - k のループにする"""
    n = len(frames)
    if n < k * 3:
        raise SystemExit(f"コマが少なすぎる（{n} コマ、継ぎ目に {k} コマ使う）")
    out = frames[: n - k].astype(np.float32)
    a = (np.arange(k, dtype=np.float32) + 0.5) / k
    out[:k] = frames[n - k :] * (1 - a)[:, None, None, None] + frames[:k] * a[:, None, None, None]
    return out.round().clip(0, 255).astype(np.uint8)


def encode(frames: np.ndarray, dst: Path, qp: int) -> None:
    h, w = frames.shape[1:3]
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-",
            "-c:v", "libx264", "-preset", "slow", "-qp", str(qp), "-pix_fmt", "yuv420p",
            "-profile:v", "high", "-x264-params", X264, "-movflags", "+faststart", "-an", str(dst),
        ],
        input=frames.tobytes(),
        check=True,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*", help="変える背景（省くと art-src/video にある全部）")
    a = ap.parse_args()
    known = {k.removeprefix("bg/") for k in json.loads(PROMPTS.read_text(encoding="utf-8"))["clips"]}
    names = a.names or sorted(p.stem for p in SRC.glob("*.mp4"))
    for name in names:
        if name not in known:
            raise SystemExit(f"prompts.json に無い背景: {name}")
        src = SRC / f"{name}.mp4"
        w, h = probe(src)
        loop = seamless(read_frames(src, STILL / f"{name}.png"), XFADE)
        dst = OUT / f"{name}.mp4"
        encode(loop, dst, QP_BY_NAME.get(name, QP))
        print(f"{dst}  {w}x{h} → {SIZE[0]}x{SIZE[1]}  {len(loop) / FPS:.2f}s  {dst.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
