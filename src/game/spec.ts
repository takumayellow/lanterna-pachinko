/**
 * 機種のスペック。1 種 2 種混合の ST 機（RUSH は ST100 / 超RUSH は ST130）として組んである。
 * 数値はすべてここに集め、ロジックと演出からはここを読む。
 *
 * 通常時の確率は遊びやすく甘くしてある（既定 1/99.9）。URL に `?spec=full` を付けるとミドル機の 1/319.9 で動く。
 */

/** rush = 灯火RUSH（ST100）、lt = オーロラ超RUSH（ST130）。jitan は使わない */
export type Mode = "normal" | "jitan" | "rush" | "lt";

export const MODE_LABEL: Record<Mode, string> = {
  normal: "通常",
  jitan: "時短",
  rush: "灯火RUSH",
  lt: "オーロラ超RUSH",
};

export type PresetName = "ama" | "full";

/** 通常時の大当たり確率 */
export const PRESETS: Record<PresetName, { lowProb: number; label: string }> = {
  ama: { lowProb: 1 / 99.9, label: "甘デジ（1/99.9）" },
  full: { lowProb: 1 / 319.9, label: "ミドル（1/319.9）" },
};

function readPreset(): PresetName {
  if (typeof location === "undefined") return "ama";
  return new URLSearchParams(location.search).get("spec") === "full" ? "full" : "ama";
}

export const PRESET: PresetName = readPreset();

/** 演出の出現率を決めるときの基準の確率。どのプリセットでもリーチや予告の頻度はミドル機の 1/319.9 に合わせる */
export const REF_LOW_PROB = PRESETS.full.lowProb;

export const SPEC = {
  lowProb: PRESETS[PRESET].lowProb,
  /** ST の確率と回数。継続率は 灯火RUSH ≒ 50%、超RUSH ≒ 80% */
  st: {
    rush: { prob: 1 / 146.8, spins: 100 },
    lt: { prob: 1 / 82.4, spins: 130 },
  },

  /** ヘソ当たりの振り分け。全回転（1500 → 超RUSH）と 7 揃い（灯守BONUS → 灯火RUSH） */
  heso: {
    zenkaitenRate: 0.01,
    lanternRate: 0.24,
    /** 残り（チャレンジBONUS）のうち、灯火RUSHに昇格する割合。ヘソ全体で 69% が灯火RUSH、1% が超RUSH */
    challengeWinRate: 0.6,
    rounds: 3,
  },
  /** 超RUSH 中の電チュー当たりのうち 3000 発（ロゴギミック作動）の割合。残りは 750 発 */
  ltUpperRate: 0.75,
  /** ラウンド数 → 払い出し（1R = 10 カウント × 15 玉 = 150 玉） */
  rounds: { challenge: 3, aurora: 10, lower: 5, upper: 20 },

  /** 保留の上限（特図1・特図2・普図とも） */
  maxHold: 4,

  /** 賞球 */
  payout: { heso: 1, denchu: 1, attacker: 15, pocket: 3 },

  /** 1 ラウンドのカウント数と最長開放時間 [s] */
  roundCount: 10,
  roundMaxOpen: 25,
  /** ラウンド間のインターバル・オープニング・エンディング [s] */
  roundInterval: 1.2,
  opening: 4.5,
  ending: 5.5,

  /** 普図: 低確（電サポなし）と電サポ中 */
  futo: {
    lowProb: 1 / 12,
    lowSpin: 12,
    lowOpen: [0.15],
    supportProb: 255 / 256,
    supportSpin: 0.8,
    supportOpen: [1.4, 1.4, 1.4],
    openGap: 0.5,
  },

  /** 玉貸し: 500 円で 125 玉（4 円パチンコ） */
  rent: { yen: 500, balls: 125 },
} as const;

export function isStMode(mode: Mode): boolean {
  return mode === "rush" || mode === "lt";
}

/** 電サポ（電チューが頻繁に開く状態）があるか */
export function hasSupport(mode: Mode): boolean {
  return mode !== "normal";
}

export function hitProb(mode: Mode): number {
  return mode === "rush" || mode === "lt" ? SPEC.st[mode].prob : SPEC.lowProb;
}

/** そのモードに入ったときの回数。ST 以外は 0 */
export function spinsFor(mode: Mode): number {
  return mode === "rush" || mode === "lt" ? SPEC.st[mode].spins : 0;
}

/** ST の継続率（ST 中に 1 回以上当たる確率） */
export function stContinueRate(mode: "rush" | "lt"): number {
  const { prob, spins } = SPEC.st[mode];
  return 1 - (1 - prob) ** spins;
}
