import { reliabilityTables } from "./reliability";
import { hitProb, isStMode, REF_LOW_PROB, SPEC, type Mode } from "./spec";
import { pickWeighted, randInt, type Rand } from "./rng";

/** 保留の色（ランタン）。後ろほど熱い。虹は ST 濃厚 */
export type HoldColor = "white" | "blue" | "green" | "red" | "gold" | "zebra" | "rainbow";
export const HOLD_COLORS: HoldColor[] = ["white", "blue", "green", "red", "gold", "zebra", "rainbow"];

/** 保留 1 個。入賞した時点で乱数を取得しておく（実機と同じ「事前判定」） */
export interface Hold {
  /** 1 = ヘソ（特図1）、2 = 電チュー（特図2） */
  kind: 1 | 2;
  /** 当否判定に使う乱数。消化時のモードの確率と比べる */
  r: number;
  /** 振り分け用の乱数 */
  sub: number;
  /** チャレンジBONUS の成否に使う乱数 */
  roll: number;
  color: HoldColor;
}

/**
 * 大当たりの種類。
 * - lantern: 7 揃いの灯守BONUS（450 → 灯火RUSH）
 * - challenge: チャレンジBONUS（450。成功で灯火RUSH、失敗で通常）
 * - aurora: 1500 → オーロラ超RUSH（ヘソの全回転、灯火RUSH中の当たり）
 * - upper / lower: 超RUSH 中の 3000 / 750
 */
export type Bonus = "lantern" | "challenge" | "aurora" | "upper" | "lower";

export interface DrawResult {
  hit: boolean;
  bonus: Bonus | null;
  rounds: number;
  /** 大当たり後に移るモード */
  next: Mode;
  /** 図柄。7 は灯守BONUS・超RUSH 突入・3000 */
  number: number;
  /** チャレンジBONUS の成功。エンディングで灯火RUSHへの突入を明かす */
  promote: boolean;
}

/** 保留の信頼度（青 3% / 緑 21% / 赤 65% / 金 90% / ゼブラ 95% / 虹 ST 濃厚） */
const HOLD = reliabilityTables<HoldColor>(
  {
    white: { hit: 38 },
    blue: { hit: 17, rel: 0.03 },
    green: { hit: 14, rel: 0.21 },
    red: { hit: 15, rel: 0.65 },
    gold: { hit: 8, rel: 0.9 },
    zebra: { hit: 4, rel: 0.95 },
    rainbow: { hit: 4, rel: 1 },
  },
  REF_LOW_PROB,
);

type Outcome = Omit<DrawResult, "number">;

const MISS = (mode: Mode): Outcome => ({ hit: false, bonus: null, rounds: 0, next: mode, promote: false });

/** 当否と振り分け。乱数は保留に入っているので、入賞時（先読み）と消化時で同じ答えになる */
/** 当否と振り分けに使う乱数 */
export type Draw = Pick<Hold, "r" | "sub" | "roll">;

export function outcome(hold: Draw, mode: Mode): Outcome {
  if (hold.r >= hitProb(mode)) return MISS(mode);
  const R = SPEC.rounds;
  if (mode === "lt") {
    const upper = hold.sub < SPEC.ltUpperRate;
    return { hit: true, bonus: upper ? "upper" : "lower", rounds: upper ? R.upper : R.lower, next: "lt", promote: false };
  }
  if (mode === "rush") return { hit: true, bonus: "aurora", rounds: R.aurora, next: "lt", promote: false };
  // 通常時（ヘソでも電チューでも同じ振り分け）
  const h = SPEC.heso;
  if (hold.sub < h.zenkaitenRate) return { hit: true, bonus: "aurora", rounds: R.aurora, next: "lt", promote: false };
  if (hold.sub < h.zenkaitenRate + h.lanternRate) return { hit: true, bonus: "lantern", rounds: R.challenge, next: "rush", promote: false };
  const win = hold.roll < h.challengeWinRate;
  return { hit: true, bonus: "challenge", rounds: R.challenge, next: win ? "rush" : "normal", promote: win };
}

/** 先読みの色。そのモードで消化したときの当否を見て決める */
function pickColor(draw: Draw, mode: Mode, rand: Rand): HoldColor {
  const o = outcome(draw, mode);
  const color = pickWeighted(rand, o.hit ? HOLD.onHit : HOLD.onMiss);
  // 虹は ST に入る当たりだけ
  return color === "rainbow" && !isStMode(o.next) ? "zebra" : color;
}

/** 入賞時に保留を作る */
export function makeHold(kind: 1 | 2, mode: Mode, rand: Rand): Hold {
  const draw: Draw = { r: rand(), sub: rand(), roll: rand() };
  return { kind, ...draw, color: pickColor(draw, mode, rand) };
}

/** モードが変わったら、残っている保留の色を新しいモードでの当否に合わせて引き直す */
export function recolor(hold: Hold, mode: Mode, rand: Rand): Hold {
  return { ...hold, color: pickColor(hold, mode, rand) };
}

export function judge(hold: Hold, mode: Mode, rand: Rand): DrawResult {
  return withNumber(outcome(hold, mode), rand);
}

/** 大当たりの種類ごとのラウンド数と移るモード（チャレンジBONUS は成否で分かれる） */
const BONUS_ROUTE: Record<Exclude<Bonus, "challenge">, { rounds: number; next: Mode }> = {
  lantern: { rounds: SPEC.rounds.challenge, next: "rush" },
  aurora: { rounds: SPEC.rounds.aurora, next: "lt" },
  upper: { rounds: SPEC.rounds.upper, next: "lt" },
  lower: { rounds: SPEC.rounds.lower, next: "lt" },
};

/** 開発者向けページ: 当否と大当たりの種類を決め打ちする。bonus が null ならハズレ */
export function forcedResult(bonus: Bonus | null, promote: boolean, mode: Mode, rand: Rand): DrawResult {
  if (!bonus) return withNumber(MISS(mode), rand);
  if (bonus === "challenge") {
    return withNumber({ hit: true, bonus, rounds: SPEC.rounds.challenge, next: promote ? "rush" : "normal", promote }, rand);
  }
  return withNumber({ hit: true, bonus, ...BONUS_ROUTE[bonus], promote: false }, rand);
}

function withNumber(o: Outcome, rand: Rand): DrawResult {
  if (!o.hit) return { ...o, number: 0 };
  const seven = o.bonus === "lantern" || o.bonus === "aurora" || o.bonus === "upper";
  return { ...o, number: seven ? 7 : plainNumber(rand) };
}

/** 7 以外の図柄 */
function plainNumber(rand: Rand): number {
  const n = randInt(rand, 1, 8);
  return n >= 7 ? n + 1 : n;
}
