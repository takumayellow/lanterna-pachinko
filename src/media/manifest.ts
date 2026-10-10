import { loopsByDefault, MEDIA_SCENES, type MediaScene } from "./scenes";

/**
 * local-assets/manifest.json の scenes の読み取り。場面ごとに映像と曲を 1 本ずつ差し込める。
 *
 *   "scenes": {
 *     "normal": { "video": "video/normal.mp4", "bgm": "music/normal.mp3" },
 *     "spsp_story": { "video": "video/story.mp4", "sound": true, "ui": 0.3 }
 *   }
 *
 * ファイル名は local-assets/ からの相対。書いていない場面は、より大まかな場面の素材か、
 * 素材が無ければコードで描いた液晶と同梱の曲になる。
 */

export type VideoFit = "cover" | "contain" | "stretch";

export interface SceneMedia {
  video?: string;
  bgm?: string;
  /** ループさせるか。省略時は場面で決まる（背景・リーチはループ、決着・オープニングは 1 回） */
  loop: boolean;
  /** 映像の使う範囲 [s]。end を省くと最後まで */
  start: number;
  end?: number;
  /** 映像の音を鳴らす（その間は曲を止める） */
  sound: boolean;
  /** 映像の音量 0〜1 */
  volume: number;
  /** 図柄・文字（2D の層）の濃さ 0〜1。映像に図柄が入っているなら下げる */
  ui: number;
  /** 液晶（約 4:3）への収め方。cover は端を切って全面、contain は黒帯、stretch は引き伸ばし */
  fit: VideoFit;
}

export type SceneMediaMap = ReadonlyMap<MediaScene, SceneMedia>;

const FITS: readonly VideoFit[] = ["cover", "contain", "stretch"];

function isScene(k: string): k is MediaScene {
  return (MEDIA_SCENES as readonly string[]).includes(k);
}

/** 相対パスだけ通す（manifest から local-assets/ の外を指させない）。% は URL で ../ に化けるので通さない */
export function relPath(v: unknown): string | undefined {
  if (typeof v !== "string" || v === "" || v.includes("%")) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith("/") || v.startsWith("\\")) return undefined;
  if (v.split(/[\\/]/).includes("..")) return undefined;
  return v;
}

function num(v: unknown, lo: number, hi: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;
}

function parseEntry(scene: MediaScene, raw: unknown): SceneMedia | null {
  const r = (typeof raw === "string" ? { video: raw } : raw) as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const video = relPath(r.video);
  const bgm = relPath(r.bgm);
  if (!video && !bgm) return null;
  const start = num(r.start, 0, Infinity) ?? 0;
  const end = num(r.end, 0, Infinity);
  return {
    video,
    bgm,
    loop: typeof r.loop === "boolean" ? r.loop : loopsByDefault(scene),
    start,
    end: end !== undefined && end > start ? end : undefined,
    sound: r.sound === true,
    volume: num(r.volume, 0, 1) ?? 1,
    ui: num(r.ui, 0, 1) ?? 1,
    fit: FITS.includes(r.fit as VideoFit) ? (r.fit as VideoFit) : "cover",
  };
}

/** manifest の scenes を読む。知らない場面名・壊れた項目は捨てて、名前だけ返す */
export function parseScenes(raw: unknown): { scenes: SceneMediaMap; ignored: string[] } {
  const scenes = new Map<MediaScene, SceneMedia>();
  const ignored: string[] = [];
  if (!raw || typeof raw !== "object") return { scenes, ignored };
  for (const [k, v] of Object.entries(raw)) {
    const e = isScene(k) ? parseEntry(k, v) : null;
    if (e) scenes.set(k as MediaScene, e);
    else ignored.push(k);
  }
  return { scenes, ignored };
}

/** 場面の並び（細かい順）から、その種類の素材を持つ最初の場面を探す */
export function resolveScene(
  chain: readonly MediaScene[],
  scenes: SceneMediaMap,
  kind: "video" | "bgm",
): { scene: MediaScene; media: SceneMedia } | null {
  for (const scene of chain) {
    const media = scenes.get(scene);
    if (media?.[kind]) return { scene, media };
  }
  return null;
}
