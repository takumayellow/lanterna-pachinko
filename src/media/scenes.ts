import type { Jackpot } from "../game/machine";
import { REVIVAL_UP } from "../game/notices";
import { settleAt, type Scenario } from "../game/scenario";
import type { Mode } from "../game/spec";
import type { StageInput } from "../lcd/director";

/**
 * 手元の映像・曲を差し込む場面。local-assets/manifest.json の scenes のキーと対応する。
 * 決着（win / lose / revival）は SP 以上の変動だけで出す。
 */
export const MEDIA_SCENES = [
  "normal",
  "chance",
  "rush",
  "lt",
  "reach",
  "sp",
  "spsp",
  "spsp_story",
  "spsp_storm",
  "spsp_abyss",
  "win",
  "lose",
  "revival",
  "zenkaiten",
  "opening",
  "round",
  "round_rush",
  "ending",
] as const;
export type MediaScene = (typeof MEDIA_SCENES)[number];

/** 既定でループする場面。それ以外（決着・オープニング・エンディング）は 1 回だけ流して最後の絵で止める */
const LOOP_SCENES: ReadonlySet<MediaScene> = new Set<MediaScene>([
  "normal",
  "chance",
  "rush",
  "lt",
  "reach",
  "sp",
  "spsp",
  "spsp_story",
  "spsp_storm",
  "spsp_abyss",
  "round",
  "round_rush",
]);

export function loopsByDefault(s: MediaScene): boolean {
  return LOOP_SCENES.has(s);
}

/** 変動をまたいで流し続ける場面（背景とラウンド）。それ以外は変動（大当たり）ごとに頭から流す */
const CONTINUOUS_SCENES: ReadonlySet<MediaScene> = new Set<MediaScene>(["normal", "chance", "rush", "lt", "round", "round_rush"]);

export function continuesAcrossSpins(s: MediaScene): boolean {
  return CONTINUOUS_SCENES.has(s);
}

/** ボタンを押さなかったとき、決着のどれだけ前に自動で押したことにするか（液晶の表示と同じ） */
const AUTO_PUSH_LEAD = 0.5;

/** 場面を選ぶのに要る台の状態 */
export interface MediaInput extends StageInput {
  /** 今の変動でボタンを押した時刻（変動開始からの秒） */
  pushedAt?: number;
}

const MODE_SCENES: Record<Mode, MediaScene[]> = {
  normal: ["normal"],
  jitan: ["chance", "normal"],
  rush: ["rush"],
  lt: ["lt", "rush"],
};

/** 当落が見える時刻。ボタンがあれば押した瞬間（押さなければ決着の少し前）、無ければ中リールが止まるとき */
export function revealAt(s: Scenario, pushedAt?: number): number {
  if (s.pushAt === undefined) return settleAt(s);
  return pushedAt ?? settleAt(s) - AUTO_PUSH_LEAD;
}

/** 発展の段階。決着より前の、見えている一番上の段から順に */
function stageScenes(s: Scenario, t: number): MediaScene[] {
  const out: MediaScene[] = [];
  if (s.spspAt !== undefined && t >= s.spspAt) out.push(s.spsp ? `spsp_${s.spsp}` : "spsp", "spsp");
  if (s.spAt !== undefined && t >= s.spAt) out.push("sp");
  if (s.reachAt !== undefined && t >= s.reachAt) out.push("reach");
  return out;
}

/** 決着の場面。復活は一度ハズレを見せてから当たりに変わる */
function outcomeScenes(s: Scenario, t: number, pushedAt?: number): MediaScene[] {
  if (s.spAt === undefined || t < revealAt(s, pushedAt)) return [];
  if (s.revivalAt !== undefined) return t >= s.revivalAt + REVIVAL_UP ? ["revival", "win"] : ["lose"];
  return [s.hit ? "win" : "lose"];
}

function jackpotScenes(j: Jackpot, mode: Mode): MediaScene[] {
  if (j.phase === "opening") return ["opening"];
  const round: MediaScene[] = mode === "rush" || mode === "lt" ? ["round_rush", "round"] : ["round"];
  return j.phase === "ending" ? ["ending", ...round] : round;
}

/**
 * 今の場面を、細かい順に並べる。差し込む素材はこの順に探し、最初に見つかったものを使う。
 * 例: ストーリー SPSP の当たり → win, spsp_story, spsp, sp, reach, normal
 */
export function sceneChain(input: MediaInput): MediaScene[] {
  if (input.jackpot) return jackpotScenes(input.jackpot, input.mode);
  const sp = input.spin;
  if (!sp) return MODE_SCENES[input.mode];
  const s = sp.scenario;
  const base = MODE_SCENES[sp.mode];
  if (s.kind === "zenkaiten") return ["zenkaiten", ...base];
  return [...outcomeScenes(s, sp.t, input.pushedAt), ...stageScenes(s, sp.t), ...base];
}
