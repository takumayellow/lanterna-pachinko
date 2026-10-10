import type { Notices, Scenario } from "./scenario";

/**
 * 予告の出る時刻。シナリオだけから決まるので、液晶・音・合成段が同じ時刻を見る。
 * リーチ前の予告は 金扉 → 武器ステップアップ → ルミ の順に並べ、群と影の帳はその間ずっと重ねる。
 */

export type NoticeCue =
  | "group"
  | "gold-door"
  | "step1"
  | "step2"
  | "step3"
  | "step4"
  | "step5"
  | "lumi"
  | "zone"
  | "logo"
  | "gem"
  | "count3"
  | "count2"
  | "count1"
  | "revival-down"
  | "revival";

export const DOOR_LEN = 1.0;
export const STEP_GAP = 0.55;
/** 最後の段を見せておく時間 */
export const STEP_HOLD = 0.35;
export const LUMI_LEN = 1.0;
export const GROUP_LEN = 1.6;
/** リーチ前に予告へ使える素の時間。これを超える分だけリーチを遅らせる */
const FREE = 2.2;

/** 復活: ハズレに見せて止めてから、何秒後に復活するか */
export const REVIVAL_UP = 1.8;
/** 復活: ハズレに見せてから本当に止まるまで */
export const REVIVAL_LEN = 3.0;

export interface NoticeTimes {
  group?: number;
  goldDoor?: number;
  /** ステップアップの各段が出る時刻（1 段目から） */
  steps: number[];
  lumi?: number;
  /** 影の帳ゾーンに入る時刻（リーチまで続く） */
  zone?: number;
  logo?: number;
  gem?: number;
  /** SPSP のボタン前の 3・2・1 */
  countdown: number[];
}

/** 予告に要る時間のうち、素の時間で足りない分 */
export function noticeLead(n: Notices): number {
  const need = (n.goldDoor ? DOOR_LEN : 0) + (n.stepUp ? n.stepUp * STEP_GAP + STEP_HOLD : 0) + (n.lumi ? LUMI_LEN : 0);
  return Math.max(0, need - FREE);
}

/** 予告を始める時刻。擬似連があれば最後の NEXT が引いてから */
function noticeStart(pseudo: readonly number[]): number {
  return pseudo.length ? pseudo[pseudo.length - 1] + 1.0 : 0.8;
}

const cache = new WeakMap<Scenario, NoticeTimes>();

export function noticeTimes(s: Scenario): NoticeTimes {
  const hit = cache.get(s);
  if (hit) return hit;
  const n = s.notices;
  const start = noticeStart(s.pseudo);
  const out: NoticeTimes = { steps: [], countdown: [] };
  if (n.group) out.group = start;
  if (n.zone !== "none") out.zone = start;
  let t = start;
  if (n.goldDoor) {
    out.goldDoor = t;
    t += DOOR_LEN;
  }
  for (let i = 0; i < n.stepUp; i++) out.steps.push(t + i * STEP_GAP);
  if (n.stepUp) t += n.stepUp * STEP_GAP + STEP_HOLD;
  if (n.lumi) out.lumi = t;
  if (n.logo !== "none" && s.reachAt !== undefined) out.logo = s.reachAt + 0.5;
  if (n.gem && s.reachAt !== undefined) out.gem = s.spAt !== undefined ? s.spAt + 2.5 : s.reachAt + 2.6;
  if (s.spspAt !== undefined && s.pushAt !== undefined) out.countdown = [3, 2, 1].map((k) => s.pushAt! - k);
  cache.set(s, out);
  return out;
}

/** 予告と復活の cue。台の進行（音・合成段）に流す */
export function noticeCues(s: Scenario): { t: number; cue: NoticeCue }[] {
  const nt = noticeTimes(s);
  const list: { t: number; cue: NoticeCue }[] = [];
  const add = (t: number | undefined, cue: NoticeCue) => {
    if (t !== undefined) list.push({ t, cue });
  };
  add(nt.group, "group");
  add(nt.zone, "zone");
  add(nt.goldDoor, "gold-door");
  nt.steps.forEach((t, i) => add(t, `step${i + 1}` as NoticeCue));
  add(nt.lumi, "lumi");
  add(nt.logo, "logo");
  add(nt.gem, "gem");
  nt.countdown.forEach((t, i) => add(t, `count${3 - i}` as NoticeCue));
  if (s.revivalAt !== undefined) {
    add(s.revivalAt, "revival-down");
    add(s.revivalAt + REVIVAL_UP, "revival");
  }
  return list;
}
