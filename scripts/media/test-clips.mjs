/**
 * 差し込み口の動作確認用に、場面名を大きく書いた試験映像と試験曲を作る（ffmpeg が要る）。
 *
 *   npm run media:test            local-assets/_test/ に作り、manifest.json が無ければ書く
 *   npm run media:test -- --force manifest.json を上書きする
 *
 * 本物の素材を入れたら local-assets/_test/ は消してよい。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "local-assets";
const OUT = join(ROOT, "_test");
const force = process.argv.includes("--force");

/** [場面, 秒, 色, 映像の音（Hz、無ければ無音）] */
const CLIPS = [
  ["normal", 8, "0x3050c0"],
  ["reach", 6, "0xc04080"],
  ["sp", 6, "0x8040c0"],
  ["spsp", 8, "0xc02030"],
  ["spsp_story", 8, "0x4060a0"],
  ["win", 4, "0xd0a020", 880],
  ["lose", 3, "0x303030"],
  ["revival", 3, "0xe0c040", 1320],
  ["opening", 4, "0xe08020", 660],
  ["round", 8, "0xc06000"],
  ["ending", 4, "0x806020"],
  ["rush", 8, "0x6020a0"],
];

/** [場面, 秒, Hz] 場面ごとの試験曲（ゆっくり揺れるサイン波） */
const SONGS = [
  ["reach", 8, 440],
  ["spsp", 8, 330],
];

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (r.error) throw new Error(`ffmpeg を起動できません: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg が失敗しました（${args.at(-1)}）`);
}

/** drawtext に渡す字形。fontconfig の設定が無い環境でも動くよう、ファイルを直接指す */
const FONT_FILES = [
  "C:/Windows/Fonts/arialbd.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
];
const fontFile = FONT_FILES.find((f) => existsSync(f));
if (!fontFile) throw new Error(`文字を描く字形が見つかりません（${FONT_FILES.join(" / ")}）`);
const font = `fontfile='${fontFile.replace(/:/g, "\\:")}'`;

function clip([scene, sec, color, tone]) {
  const label = scene.toUpperCase();
  const text = `drawtext=${font}:text='${label}':fontsize=150:fontcolor=white:borderw=10:bordercolor=black:x=(w-tw)/2:y=(h-th)/2-60`;
  const clock = `drawtext=${font}:text='%{pts\\:hms}':fontsize=64:fontcolor=white:borderw=6:bordercolor=black:x=(w-tw)/2:y=h/2+110`;
  const vf = `drawbox=c=${color}@0.75:t=fill,${text},${clock}`;
  const audio = tone
    ? ["-f", "lavfi", "-i", `sine=frequency=${tone}:duration=${sec}:beep_factor=4`, "-c:a", "aac", "-b:a", "96k"]
    : [];
  ffmpeg([
    "-f", "lavfi", "-i", `testsrc2=size=1280x720:rate=30:duration=${sec}`,
    ...audio,
    "-vf", vf,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "28", "-movflags", "+faststart",
    ...(tone ? ["-shortest"] : ["-an"]),
    join(OUT, `${scene}.mp4`),
  ]);
}

function song([scene, sec, hz]) {
  ffmpeg([
    "-f", "lavfi", "-i", `sine=frequency=${hz}:duration=${sec}`,
    "-af", "tremolo=f=2:d=0.6,volume=0.5",
    "-c:a", "libmp3lame", "-b:a", "96k",
    join(OUT, `${scene}.mp3`),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const c of CLIPS) clip(c);
for (const s of SONGS) song(s);

const scenes = {};
for (const [scene, , , tone] of CLIPS) {
  scenes[scene] = { video: `_test/${scene}.mp4`, ...(tone ? { sound: true } : {}) };
}
for (const [scene] of SONGS) scenes[scene] = { ...scenes[scene], bgm: `_test/${scene}.mp3` };
// 決着の映像は図柄を薄くして、映像側の絵を見せる例
scenes.win.ui = 0.4;

const manifest = join(ROOT, "manifest.json");
if (existsSync(manifest) && !force) {
  console.log(`${manifest} があるので書きません（上書きは --force）。使うなら次を scenes に足してください:`);
  console.log(JSON.stringify(scenes, null, 2));
} else {
  writeFileSync(manifest, `${JSON.stringify({ scenes }, null, 2)}\n`);
  console.log(`${manifest} を書きました`);
}
console.log(`${OUT}/ に試験映像 ${CLIPS.length} 本・試験曲 ${SONGS.length} 本`);
