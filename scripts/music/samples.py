"""BGM 用の録音サンプル（CC0 のみ）を取ってきて, 版を固定したまま検証する.

    python scripts/music/samples.py fetch   # samples.lock.json に載った全ファイルを取得・検証
    python scripts/music/samples.py lock    # LIBRARIES と SETS から samples.lock.json を作り直す

サンプルはリポジトリに入れない. 置き場は既定で <repo>/sample-libs/（.gitignore 済み）,
環境変数 LANTERNA_SAMPLES で変えられる. 各ファイルは commit を固定した raw URL から取り,
git の blob sha1（"blob <size>\\0" + 本体）が lock と一致したものだけを使う.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCK = Path(__file__).resolve().parent / "samples.lock.json"

# ライブラリ: 名前 → GitHub リポジトリ, 固定コミット, ライセンス, 出典
LIBRARIES: dict[str, dict[str, str]] = {
    "vsco2": {
        "repo": "sgossner/VSCO-2-CE",
        "commit": "440300901dfe9275fd84e0b7763af1f8443ae62e",
        "license": "CC0-1.0",
        "title": "Versilian Studios Chamber Orchestra 2 Community Edition",
        "author": "Versilian Studios (Samuel Gossner)",
    },
    "vcsl": {
        "repo": "sgossner/VCSL",
        "commit": "c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e",
        "license": "CC0-1.0",
        "title": "Versilian Community Sample Library",
        "author": "Versilian Studios (Samuel Gossner)",
    },
    "vocal": {
        "repo": "sfzinstruments/legato_vocal_tutorial",
        "commit": "fac6461ee4c7f498b23246eced644616fa58d2ec",
        "license": "CC0-1.0",
        "title": "Hadzi-Fia legato vocal tutorial (vowel a)",
        "author": "Karoryfer Samples / sfzinstruments",
    },
    "drums": {
        "repo": "sfzinstruments/virtuosity_drums",
        "commit": "9f04cf9a734527edfbb0a4eee1f674e45bbf71bc",
        "license": "CC0-1.0",
        "title": "Virtuosity Drums",
        "author": "Versilian Studios / sfzinstruments",
    },
    "bass": {
        "repo": "sfzinstruments/karoryfer.black-and-blue-basses",
        "commit": "6e7d674cdb41be7a54dbccb15472401ad01099b9",
        "license": "CC0-1.0",
        "title": "Black And Blue Basses (dark black)",
        "author": "Karoryfer Samples",
    },
    "guitar": {
        "repo": "sfzinstruments/karoryfer.black-and-green-guitars",
        "commit": "b3b3249d37dc977a1a297bd2dc053e6d9b6b805c",
        "license": "CC0-1.0",
        "title": "Black And Green Guitars (black)",
        "author": "Karoryfer Samples",
    },
}

_DRUM_MICS = r"(oh|room)"
# 取得する部分集合: (ライブラリ, パスの正規表現). 正規表現はパス全体に対して fullmatch する.
SETS: list[tuple[str, str]] = [
    # 弦（セクション + コントラバス独奏）
    ("vsco2", r"Strings/Violin Section/(susVib|Spic|Pizz|Trem)/.*\.wav"),
    ("vsco2", r"Strings/Viola Section/(susvib|spic|pizz|trem)/.*\.wav"),
    ("vsco2", r"Strings/Cello Section/(susvib|spic|pizzT|trem)/.*\.wav"),
    ("vsco2", r"Strings/Solo Contrabass/(SusVib|Spic|Pizz)/.*\.wav"),
    ("vsco2", r"Strings/Harp/.*\.wav"),
    # 金管
    ("vsco2", r"Brass/Trumpet/(sus|stac)/.*\.wav"),
    ("vsco2", r"Brass/F Horn/(sus|stac)/.*\.wav"),
    ("vsco2", r"Brass/Tenor Trombone/(sus|stac)/.*\.wav"),
    ("vsco2", r"Brass/Tuba/(sus|stac)/.*\.wav"),
    # 木管
    ("vsco2", r"Woodwinds/Flute/(susvib|stac)/.*\.wav"),
    ("vsco2", r"Woodwinds/Oboe/Vib/.*\.wav"),
    ("vsco2", r"Woodwinds/Clarinet/susLong/.*\.wav"),
    # 打楽器
    ("vsco2", r"Percussion/Timpani/.*\.wav"),
    ("vsco2", r"VSCO 1 Percussion/drums/snare/drum1/.*\.wav"),
    ("vsco2", r"VSCO 1 Percussion/varMetal/triangle/1/.*\.wav"),
    ("vcsl", r"Idiophones/Struck Idiophones/Glockenspiel/.*\.wav"),
    ("vcsl", r"Idiophones/Struck Idiophones/Tubular Bells 2/.*_v4_.*\.wav"),
    ("vcsl", r"Idiophones/Struck Idiophones/Suspended Cymbal 1/susCymb1_(cresc|hit_(pp|mp|f|fff)1|roll).*\.wav"),
    ("vcsl", r"Idiophones/Struck Idiophones/Clash Cymbals 1/.*\.wav"),
    ("vcsl", r"Idiophones/Struck Idiophones/Gong 1/gong_(p|mf|f|fff)\.wav"),
    ("vcsl", r"Membranophones/Struck Membranophones/Bass Drum 1/.*\.wav"),
    ("vcsl", r"Idiophones/Struck Idiophones/Claps/.*\.wav"),
    ("vcsl", r"Idiophones/Struck Idiophones/Tambourine 1/Tamb1_(Hit|Shake).*\.wav"),
    ("vcsl", r"Idiophones/Struck Idiophones/Shaker, Small/Mid_Shaker(Double|HighFaster)_.*\.wav"),
    # 鍵盤（パイプオルガンとグランドピアノの中音域）
    ("vcsl", r"Aerophones/Edge-blown Aerophones/Pipe Organ/(Quiet|Quiet Pedal|Loud|Loud Pedal)/.*\.wav"),
    ("vcsl", r"Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_[A-G]#?[1-6]_v[24]_rr1_Player\.wav"),
    # 声（母音 a の持続と短音）
    ("vocal", r"Samples/vowel_(sustain|short)/a/.*\.wav"),
    # ドラム（近接マイク + オーバーヘッド + ルーム）
    ("drums", r"Samples/(kickmic|oh|room)/kick/\w+_kick_snon_.*\.flac"),
    ("drums", r"Samples/(snaremic|oh|room)/snare/\w+_snare_(center|rimshot|crossstick)_.*\.flac"),
    ("drums", rf"Samples/{_DRUM_MICS}/hh/\w+_hh_(closed|half|open|pedal)_.*\.flac"),
    ("drums", rf"Samples/{_DRUM_MICS}/crash/\w+_crash_crash_.*\.flac"),
    ("drums", rf"Samples/{_DRUM_MICS}/ride/\w+_ride_(ride|bell)_.*\.flac"),
    ("drums", rf"Samples/{_DRUM_MICS}/(htom|ltom)/\w+_(htom|ltom)_center_.*\.flac"),
    # エレキベース（指弾き, f と mf の 2 ラウンドロビン, E1〜E4）
    ("bass", r"Samples/darkblack/reg/darkblack_[a-g]b?[1-4]_(f|mf)_rr[12]\.wav"),
    ("bass", r"Samples/darkblack/stac/darkblack_[a-g]b?[1-4]_stac_rr[12]\.wav"),
    # エレキギター（DI 録音. アンプは numpy 側で掛ける）
    ("guitar", r"Samples/black/ord/twang_[a-g]b?[3-6]_f_rr[12]\.wav"),
    ("guitar", r"Samples/black/stac/staccato_[a-g]b?[3-6]_rr[12]\.wav"),
]


def cache_dir() -> Path:
    return Path(os.environ.get("LANTERNA_SAMPLES", str(ROOT / "sample-libs")))


def blob_sha1(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def raw_url(lib: str, path: str) -> str:
    meta = LIBRARIES[lib]
    return (f"https://raw.githubusercontent.com/{meta['repo']}/{meta['commit']}/"
            + urllib.parse.quote(path))


def local_path(lib: str, path: str) -> Path:
    root = (cache_dir() / lib).resolve()
    dst = (root / path).resolve()
    if not dst.is_relative_to(root):  # ロックファイルの ".." でキャッシュの外へ書かせない
        raise ValueError(f"{lib}: キャッシュの外を指すパス {path!r}")
    return dst


def _api(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def make_lock() -> dict:
    """固定コミットのツリーから SETS に合うファイルを選び, サイズと blob sha1 を記録する."""
    files: dict[str, list] = {}
    for lib, meta in LIBRARIES.items():
        tree = _api(f"https://api.github.com/repos/{meta['repo']}/git/trees/{meta['commit']}?recursive=1")
        if tree.get("truncated"):
            raise RuntimeError(f"{lib}: ツリーが途中で切れた")
        pats = [re.compile(p) for l, p in SETS if l == lib]
        picked = sorted(
            [e["path"], e["size"], e["sha"]] for e in tree["tree"]
            if e["type"] == "blob" and any(p.fullmatch(e["path"]) for p in pats)
        )
        files[lib] = picked
        print(f"{lib:7s} {len(picked):5d} files {sum(f[1] for f in picked) / 1e6:7.1f} MB")
    return {"libraries": LIBRARIES, "files": files}


def load_lock() -> dict:
    return json.loads(LOCK.read_text(encoding="utf-8"))


def _verified(dst: Path, size: int, sha: str) -> bool:
    if not dst.exists() or dst.stat().st_size != size:
        return False
    return blob_sha1(dst.read_bytes()) == sha


def _fetch_one(lib: str, path: str, size: int, sha: str) -> str | None:
    dst = local_path(lib, path)
    stamp = dst.with_name(dst.name + ".ok")
    if dst.exists() and stamp.exists() and stamp.read_text(encoding="utf-8") == sha and dst.stat().st_size == size:
        return None
    if _verified(dst, size, sha):
        stamp.write_text(sha, encoding="utf-8")
        return None
    dst.parent.mkdir(parents=True, exist_ok=True)
    last = ""
    for attempt in range(4):
        try:
            with urllib.request.urlopen(raw_url(lib, path), timeout=120) as r:
                data = r.read()
            if blob_sha1(data) != sha:
                last = "sha1 不一致"
                continue
            tmp = dst.with_name(dst.name + ".part")
            tmp.write_bytes(data)
            tmp.replace(dst)
            stamp.write_text(sha, encoding="utf-8")
            return None
        except OSError as e:  # urllib の HTTP/通信エラーは OSError 系
            last = str(e)
            time.sleep(1 + attempt * 2)
    return f"{lib}/{path}: {last}"


def ensure(workers: int = 12) -> Path:
    """lock に載った全ファイルが揃って検証済みであることを保証し, 置き場を返す."""
    lock = load_lock()
    jobs = [(lib, *f) for lib, fs in lock["files"].items() for f in fs]
    missing = [j for j in jobs if not (local_path(j[0], j[1]).with_name(Path(j[1]).name + ".ok")).exists()]
    if missing:
        total = sum(j[2] for j in missing) / 1e6
        print(f"サンプル取得: {len(missing)} ファイル / {total:.0f} MB → {cache_dir()}")
    with ThreadPoolExecutor(workers) as ex:
        errors = [e for e in ex.map(lambda j: _fetch_one(*j), jobs) if e]
    if errors:
        raise RuntimeError("サンプルの取得に失敗:\n" + "\n".join(errors[:20]))
    return cache_dir()


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else "fetch"
    if cmd == "lock":
        LOCK.write_text(json.dumps(make_lock(), ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
        return 0
    if cmd == "fetch":
        print(ensure())
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
