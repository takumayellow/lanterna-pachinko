import type { DrawResult, HoldColor } from "./lottery";
import { reliabilityTables, type Choice, type Tables } from "./reliability";
import { isStMode, REF_LOW_PROB, type Mode } from "./spec";
import { pickWeighted, randInt, type Rand } from "./rng";
import { noticeLead, REVIVAL_LEN } from "./notices";

/**
 * 変動の演出（シナリオ）。当否はもう決まっていて、ここではどう見せるかだけを決める。
 * 液晶はこのシナリオと経過時間だけを見て描く。出現率は下の表の信頼度から作る（作り方は reliability.ts）。
 */
export type ScenarioKind = "hazure" | "reach" | "sp" | "spsp" | "zenkaiten" | "sudden";
/** SP リーチ: 楽曲 / 日常 / 影法師バトル */
export const SP_KINDS = ["song", "daily", "shade"] as const;
export type SpKind = (typeof SP_KINDS)[number];
/** SPSP リーチ: 黒嵐バトル / 深淵の主 / ストーリー */
export const SPSP_KINDS = ["storm", "abyss", "story"] as const;
export type SpspKind = (typeof SPSP_KINDS)[number];
export type Chara = "rose" | "violet" | "azure" | "amber" | "scarlet";
/** セリフ予告の色 */
export type Cutin = "none" | "blue" | "red" | "gold";
export type TitleColor = "white" | "red" | "gold" | "rainbow";
/** 当落ボタン（ライジングトリガー） */
export type ButtonKind = "normal" | "red" | "lever";
export type ReachLine = "none" | "purple" | "red" | "gold" | "rainbow";

/** リーチ前の予告 */
export interface Notices {
  /** 武器ステップアップの到達段（0 は出ない） */
  stepUp: 0 | 3 | 4 | 5;
  goldDoor: boolean;
  /** ロゴギミック: 落下 / 落下して傾く */
  logo: "none" | "drop" | "tilt";
  /** 影の帳ゾーン */
  zone: "none" | "barrier" | "red";
  reachLine: ReachLine;
  /** ルミの激熱カットイン */
  lumi: boolean;
  /** 群予告 */
  group: boolean;
  /** ランタンギミックが金に光る */
  gem: boolean;
}

export interface Scenario {
  kind: ScenarioKind;
  hit: boolean;
  /** 最後に揃う図柄 [左, 中, 右] */
  final: [number, number, number];
  /** 各リールが止まる時刻 [左, 中, 右]（変動開始からの秒） */
  stops: [number, number, number];
  duration: number;
  /** 左右がそろってリーチになる時刻 */
  reachAt?: number;
  /** SP リーチへ発展する時刻 */
  spAt?: number;
  /** SPSP へ発展する時刻 */
  spspAt?: number;
  /** 当落ボタンの受付開始。決着は revivalAt（復活なら）か stops[1] */
  pushAt?: number;
  /** 復活: 中リールが一度ハズレ目で止まる時刻。本当に止まるのは stops[1] */
  revivalAt?: number;
  /** 擬似連の「NEXT」が出る時刻 */
  pseudo: number[];
  cutin: Cutin;
  /** カットインを出す時刻 */
  cutinAt?: number;
  /** ST 中の速い変動 */
  fast: boolean;
  sp?: SpKind;
  spsp?: SpspKind;
  /** バトルで戦う灯守（SP の影法師バトルと SPSP） */
  chara: Chara;
  /** リーチタイトルの色（SP・SPSP） */
  title: TitleColor;
  button: ButtonKind;
  notices: Notices;
  /** 一度ハズレを見せてから復活する当たり */
  revival: boolean;
}

/** リーチの行き先。信頼度は 通常リーチ 0.2% / 楽曲 5% / 日常 15% / 影法師 30% / 黒嵐 35% / 深淵 51% / ストーリー 70% */
type Route = "hazure" | "reach" | SpKind | SpspKind;
const ROUTE: Tables<Route> = reliabilityTables<Route>(
  {
    hazure: { hit: 0 },
    reach: { hit: 4, rel: 0.002 },
    song: { hit: 3, rel: 0.05 },
    daily: { hit: 7, rel: 0.15 },
    shade: { hit: 13, rel: 0.3 },
    storm: { hit: 28, rel: 0.35 },
    abyss: { hit: 23, rel: 0.51 },
    story: { hit: 22, rel: 0.7 },
  },
  REF_LOW_PROB,
);
const ROUTE_KIND: Record<Route, ScenarioKind> = {
  hazure: "hazure",
  reach: "reach",
  song: "sp",
  daily: "sp",
  shade: "sp",
  storm: "spsp",
  abyss: "spsp",
  story: "spsp",
};

/** 演出が出うる変動（リーチあり）のうち当たりの割合 */
function hitShare(onHit: number, onMiss: number): number {
  const q = REF_LOW_PROB;
  return (q * onHit) / (q * onHit + (1 - q) * onMiss);
}
const Q_REACH = hitShare(1, 1 - ROUTE.onMiss.hazure);
const SP_ROUTES: Route[] = [...SP_KINDS, ...SPSP_KINDS];
const sumOver = (t: Record<Route, number>) => SP_ROUTES.reduce((s, r) => s + t[r], 0);
const Q_SP = hitShare(sumOver(ROUTE.onHit), sumOver(ROUTE.onMiss));
const isSpRoute = (r: Route | null): r is SpKind => (SP_KINDS as readonly string[]).includes(r ?? "");
const isSpspRoute = (r: Route | null): r is SpspKind => (SPSP_KINDS as readonly string[]).includes(r ?? "");

const flag = (hit: number, rel: number): Record<"no" | "yes", Choice> => ({ no: { hit: 100 - hit }, yes: { hit, rel } });

const NOTICE = {
  stepUp: reliabilityTables({ s0: { hit: 35 }, s3: { hit: 15, rel: 0.03 }, s4: { hit: 20, rel: 0.12 }, s5: { hit: 30, rel: 0.4 } }, Q_REACH),
  cutin: reliabilityTables<Cutin>({ none: { hit: 30 }, blue: { hit: 25, rel: 0.04 }, red: { hit: 30, rel: 0.15 }, gold: { hit: 15, rel: 0.55 } }, Q_REACH),
  goldDoor: reliabilityTables(flag(12, 0.7), Q_REACH),
  logo: reliabilityTables({ none: { hit: 65 }, drop: { hit: 25, rel: 0.35 }, tilt: { hit: 10, rel: 0.8 } }, Q_REACH),
  zone: reliabilityTables({ none: { hit: 60 }, barrier: { hit: 25, rel: 0.2 }, red: { hit: 15, rel: 0.62 } }, Q_REACH),
  reachLine: reliabilityTables<ReachLine>(
    { none: { hit: 27 }, purple: { hit: 25, rel: 0.25 }, red: { hit: 30, rel: 0.5 }, gold: { hit: 15, rel: 0.91 }, rainbow: { hit: 3, rel: 1 } },
    Q_REACH,
  ),
  lumi: reliabilityTables(flag(15, 0.9), Q_REACH),
  group: reliabilityTables(flag(20, 0.7), Q_REACH),
  gem: reliabilityTables(flag(10, 0.9), Q_REACH),
  title: reliabilityTables<TitleColor>({ white: { hit: 40 }, red: { hit: 35, rel: 0.5 }, gold: { hit: 20, rel: 0.8 }, rainbow: { hit: 5, rel: 1 } }, Q_SP),
  button: reliabilityTables<ButtonKind>({ normal: { hit: 50 }, red: { hit: 30, rel: 0.6 }, lever: { hit: 20, rel: 0.85 } }, Q_SP),
};

/** キャラの期待度: しずく ≒ ゆずは < あかね < すみれ < こはる */
const CHARA_ON_HIT: Record<Chara, number> = { azure: 15, amber: 15, scarlet: 20, violet: 22, rose: 28 };
const CHARA_ON_MISS: Record<Chara, number> = { azure: 30, amber: 30, scarlet: 20, violet: 13, rose: 7 };

const KIND_ON_HIT_FAST: Record<ScenarioKind, number> = { hazure: 0, reach: 25, sp: 25, spsp: 0, zenkaiten: 10, sudden: 40 };
const KIND_ON_MISS_FAST: Record<ScenarioKind, number> = { hazure: 92, reach: 7, sp: 1, spsp: 0, zenkaiten: 0, sudden: 0 };

/** 保留の色に見合う最低限の演出（赤保留なのに即ハズレ、を避ける） */
const MIN_KIND_FOR_COLOR: Record<HoldColor, ScenarioKind> = {
  white: "hazure",
  blue: "reach",
  green: "sp",
  red: "spsp",
  gold: "spsp",
  zebra: "spsp",
  rainbow: "spsp",
};
const KIND_RANK: ScenarioKind[] = ["hazure", "reach", "sp", "spsp"];
const rank = (k: ScenarioKind) => KIND_RANK.indexOf(k);

const NO_NOTICES: Notices = {
  stepUp: 0,
  goldDoor: false,
  logo: "none",
  zone: "none",
  reachLine: "none",
  lumi: false,
  group: false,
  gem: false,
};

/** SP・SPSP の当たりのうち、一度ハズレを見せてから復活する割合 */
const REVIVAL_RATE = 0.08;
/** SP リーチでボタン（PUSH）を出す割合。SPSP は必ず出す */
const SP_PUSH_RATE = 0.3;

/** ST 中のセリフ予告 */
const CUTIN_FAST_HIT: Record<Cutin, number> = { none: 40, blue: 20, red: 25, gold: 15 };
const CUTIN_FAST_MISS: Record<Cutin, number> = { none: 70, blue: 25, red: 5, gold: 0 };

/** 疑似連の回数。当たりほど多い */
const PSEUDO_ON_HIT = { "0": 30, "1": 25, "2": 25, "3": 20 };
const PSEUDO_ON_MISS_REACH = { "0": 75, "1": 20, "2": 5, "3": 0 };
const PSEUDO_ON_MISS_SP = { "0": 45, "1": 35, "2": 15, "3": 5 };
const PSEUDO_GAP = 2.4;

function pickPseudo(rand: Rand, hit: boolean, kind: ScenarioKind): number[] {
  const n = Number(pickWeighted(rand, hit ? PSEUDO_ON_HIT : kind === "reach" ? PSEUDO_ON_MISS_REACH : PSEUDO_ON_MISS_SP));
  return Array.from({ length: n }, (_, i) => 2.2 + i * PSEUDO_GAP);
}

function pick<K extends string>(rand: Rand, t: Tables<K>, hit: boolean): K {
  return pickWeighted(rand, hit ? t.onHit : t.onMiss);
}

/** 保留の色が求める段まで行き先を引き上げる。引き上げ先は同じ表から選ぶ */
function pickRoute(rand: Rand, hit: boolean, color: HoldColor): Route {
  const route = pick(rand, ROUTE, hit);
  const min = rank(MIN_KIND_FOR_COLOR[color]);
  if (rank(ROUTE_KIND[route]) >= min) return route;
  const weights = hit ? ROUTE.onHit : ROUTE.onMiss;
  const allowed = Object.fromEntries(
    (Object.keys(weights) as Route[]).filter((r) => rank(ROUTE_KIND[r]) >= min).map((r) => [r, weights[r]]),
  ) as Record<Route, number>;
  return pickWeighted(rand, allowed);
}

function pickNotices(rand: Rand, hit: boolean): Notices {
  const yes = (t: Tables<"no" | "yes">) => pick(rand, t, hit) === "yes";
  const su = pick(rand, NOTICE.stepUp, hit);
  return {
    stepUp: su === "s5" ? 5 : su === "s4" ? 4 : su === "s3" ? 3 : 0,
    goldDoor: yes(NOTICE.goldDoor),
    logo: pick(rand, NOTICE.logo, hit),
    zone: pick(rand, NOTICE.zone, hit),
    reachLine: pick(rand, NOTICE.reachLine, hit),
    lumi: yes(NOTICE.lumi),
    group: yes(NOTICE.group),
    gem: yes(NOTICE.gem),
  };
}

export function buildScenario(
  result: DrawResult,
  mode: Mode,
  holdsLeft: number,
  color: HoldColor,
  rand: Rand,
): Scenario {
  const fast = isStMode(mode) || mode === "jitan";
  let route: Route | null = null;
  let kind: ScenarioKind;
  if (fast) kind = pickWeighted(rand, result.hit ? KIND_ON_HIT_FAST : KIND_ON_MISS_FAST);
  else if (result.hit && result.bonus === "aurora") kind = "zenkaiten";
  else {
    route = pickRoute(rand, result.hit, color);
    kind = ROUTE_KIND[route];
  }
  const reachLike = kind === "reach" || kind === "sp" || kind === "spsp";
  const spLike = kind === "sp" || kind === "spsp";

  const final = finalReels(result, kind, rand);
  const pseudo = reachLike && !fast ? pickPseudo(rand, result.hit, kind) : [];
  const pre = pseudo.length * PSEUDO_GAP;

  const base = {
    kind,
    hit: result.hit,
    final,
    pseudo,
    cutin: "none" as Cutin,
    fast,
    sp: isSpRoute(route) ? route : kind === "sp" ? ("shade" as const) : undefined,
    spsp: isSpspRoute(route) ? route : undefined,
    chara: pickWeighted(rand, result.hit ? CHARA_ON_HIT : CHARA_ON_MISS),
    title: spLike && !fast ? pick(rand, NOTICE.title, result.hit) : ("white" as TitleColor),
    button: "normal" as ButtonKind,
    notices: reachLike && !fast ? pickNotices(rand, result.hit) : NO_NOTICES,
    revival: spLike && result.hit && !fast && rand() < REVIVAL_RATE,
  };

  if (kind === "hazure") {
    const d = fast ? 1.4 : holdsLeft >= 3 ? 3.0 : holdsLeft >= 1 ? 5.0 : 7.0;
    return { ...base, duration: d, stops: [d * 0.45, d * 0.92, d * 0.7] };
  }
  if (kind === "sudden") {
    return { ...base, duration: 2.8, stops: [2.2, 2.2, 2.2], cutin: "gold", cutinAt: 0.5 };
  }
  if (kind === "zenkaiten") {
    return { ...base, duration: 10, stops: [8.6, 8.6, 8.6] };
  }

  const cutin = fast ? pickWeighted(rand, result.hit ? CUTIN_FAST_HIT : CUTIN_FAST_MISS) : pick(rand, NOTICE.cutin, result.hit);
  // リーチ前の予告が収まらない分だけリーチを遅らせる
  const notice = fast ? 0 : noticeLead(base.notices);
  const reachAt = (fast ? 1.0 : 3.2) + pre + notice;
  const withCutin = (s: Scenario): Scenario =>
    cutin === "none" ? s : { ...s, cutin, cutinAt: (s.spAt ?? reachAt + 2) - 1.2 };

  if (kind === "reach") {
    const c = reachAt + (fast ? 4.5 : 7.5);
    return withCutin({ ...base, reachAt, duration: c + 0.8, stops: [reachAt - 1.2, c, reachAt] });
  }
  const spAt = reachAt + (fast ? 1.5 : 3.2);
  const button = (): ButtonKind => (fast ? "normal" : pick(rand, NOTICE.button, result.hit));
  // 復活は c でいったんハズレ目に止め、REVIVAL_LEN 後に本当に止める
  const settle = (c: number, tail: number) =>
    base.revival
      ? { revivalAt: c, duration: c + REVIVAL_LEN + tail, stops: [reachAt - 1.2, c + REVIVAL_LEN, reachAt] as [number, number, number] }
      : { duration: c + tail, stops: [reachAt - 1.2, c, reachAt] as [number, number, number] };
  if (kind === "sp") {
    const c = spAt + (fast ? 8 : 12);
    const push = rand() < SP_PUSH_RATE;
    return withCutin({
      ...base,
      reachAt,
      spAt,
      pushAt: push ? c - 2.5 : undefined,
      button: push ? button() : "normal",
      ...settle(c, 1),
    });
  }
  const spspAt = spAt + 9;
  const c = spspAt + 12;
  return withCutin({ ...base, reachAt, spAt, spspAt, pushAt: c - 3, button: button(), ...settle(c, 1.2) });
}

/** 当落の決着する時刻（復活なら一度ハズレ目で止まる時刻） */
export function settleAt(s: Scenario): number {
  return s.revivalAt ?? s.stops[1];
}

function finalReels(result: DrawResult, kind: ScenarioKind, rand: Rand): [number, number, number] {
  if (result.hit) return [result.number, result.number, result.number];
  const a = randInt(rand, 1, 9);
  if (kind === "hazure") {
    let b = randInt(rand, 1, 8);
    if (b >= a) b++;
    return [a, randInt(rand, 1, 9), b];
  }
  // リーチハズレ。多くは 1 コマずれで止める
  let c: number;
  if (rand() < 0.65) c = rand() < 0.5 ? (a % 9) + 1 : ((a + 7) % 9) + 1;
  else {
    c = randInt(rand, 1, 8);
    if (c >= a) c++;
  }
  return [a, c, a];
}
