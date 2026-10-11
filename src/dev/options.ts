import { HOLD_COLORS, type HoldColor } from "../game/lottery";
import type { SpinForce } from "../game/machine";
import type { ButtonKind, Chara, Cutin, Notices, ReachLine, ScenarioForce, TitleColor } from "../game/scenario";
import { CHARA, CHARA_ORDER } from "../lcd/heroines";

/**
 * 開発者向けページ（?dev）の選択肢と、選んだ値から次の変動の指定（SpinForce）を作る処理。
 * 値が "" の項目は「おまかせ」で、普段どおり抽選する。
 */

export type Option = readonly [value: string, label: string];

export interface Field {
  key: string;
  label: string;
  options: readonly Option[];
}

export interface Group {
  title: string;
  fields: readonly Field[];
}

export type Selection = Readonly<Record<string, string>>;

const ANY: Option = ["", "おまかせ"];
const YES_NO: readonly Option[] = [ANY, ["yes", "あり"], ["no", "なし"]];

const RESULTS = {
  miss: { bonus: null, promote: false },
  lantern: { bonus: "lantern", promote: false },
  "challenge-win": { bonus: "challenge", promote: true },
  "challenge-lose": { bonus: "challenge", promote: false },
  aurora: { bonus: "aurora", promote: false },
  upper: { bonus: "upper", promote: false },
  lower: { bonus: "lower", promote: false },
} as const satisfies Record<string, Pick<SpinForce, "bonus" | "promote">>;

const ROUTES = ["hazure", "reach", "song", "daily", "shade", "storm", "abyss", "story", "zenkaiten", "sudden"] as const;
const CUTINS: readonly Cutin[] = ["none", "blue", "red", "gold"];
const TITLES: readonly TitleColor[] = ["white", "red", "gold", "rainbow"];
const BUTTONS: readonly ButtonKind[] = ["normal", "red", "lever"];
const PSEUDOS = ["0", "1", "2", "3"] as const;
const STEP_UPS = ["0", "3", "4", "5"] as const;
const LOGOS: readonly Notices["logo"][] = ["none", "drop", "tilt"];
const ZONES: readonly Notices["zone"][] = ["none", "barrier", "red"];
const REACH_LINES: readonly ReachLine[] = ["none", "purple", "red", "gold", "rainbow"];

const HOLD_LABEL: Record<HoldColor, string> = {
  white: "白",
  blue: "青",
  green: "緑",
  red: "赤",
  gold: "金",
  zebra: "ゼブラ",
  rainbow: "虹",
};

export const GROUPS: readonly Group[] = [
  {
    title: "当否",
    fields: [
      {
        key: "result",
        label: "結果",
        options: [
          ANY,
          ["miss", "ハズレ"],
          ["lantern", "灯守BONUS（7 揃い → 灯火RUSH）"],
          ["challenge-win", "チャレンジBONUS 成功"],
          ["challenge-lose", "チャレンジBONUS 失敗"],
          ["aurora", "1500（→ 超RUSH）"],
          ["upper", "3000（超RUSH 中）"],
          ["lower", "750（超RUSH 中）"],
        ],
      },
      { key: "color", label: "保留の色", options: HOLD_COLORS.map((c): Option => [c, HOLD_LABEL[c]]) },
    ],
  },
  {
    title: "リーチ",
    fields: [
      {
        key: "route",
        label: "行き先",
        options: [
          ANY,
          ["hazure", "リーチなし"],
          ["reach", "通常リーチ"],
          ["song", "SP 楽曲リーチ"],
          ["daily", "SP 日常リーチ"],
          ["shade", "SP 影法師バトル"],
          ["storm", "SPSP 黒嵐バトル"],
          ["abyss", "SPSP 深淵の主"],
          ["story", "SPSP ストーリー"],
          ["zenkaiten", "全回転"],
          ["sudden", "突然"],
        ],
      },
      { key: "chara", label: "灯守", options: [ANY, ...CHARA_ORDER.map((c): Option => [c, CHARA[c].name])] },
      { key: "cutin", label: "カットイン", options: [ANY, ["none", "なし"], ["blue", "青"], ["red", "赤"], ["gold", "金"]] },
      { key: "title", label: "タイトルの色", options: [ANY, ["white", "白"], ["red", "赤"], ["gold", "金"], ["rainbow", "虹"]] },
      { key: "push", label: "SP の PUSH", options: YES_NO },
      { key: "button", label: "ボタン", options: [ANY, ["normal", "通常"], ["red", "赤"], ["lever", "レバー"]] },
      { key: "pseudo", label: "擬似連", options: [ANY, ...PSEUDOS.map((n): Option => [n, n === "0" ? "なし" : `${n} 回`])] },
      { key: "revival", label: "復活（当たりのみ）", options: YES_NO },
    ],
  },
  {
    title: "予告",
    fields: [
      { key: "stepUp", label: "ステップアップ", options: [ANY, ...STEP_UPS.map((n): Option => [n, n === "0" ? "なし" : `${n} 段`])] },
      { key: "goldDoor", label: "金扉", options: YES_NO },
      { key: "logo", label: "ロゴ", options: [ANY, ["none", "なし"], ["drop", "落下"], ["tilt", "落下して傾く"]] },
      { key: "zone", label: "影の帳ゾーン", options: [ANY, ["none", "なし"], ["barrier", "通常"], ["red", "赤"]] },
      {
        key: "reachLine",
        label: "リーチライン",
        options: [ANY, ["none", "なし"], ["purple", "紫"], ["red", "赤"], ["gold", "金"], ["rainbow", "虹"]],
      },
      { key: "lumi", label: "ルミのカットイン", options: YES_NO },
      { key: "group", label: "群予告", options: YES_NO },
      { key: "gem", label: "ランタンが金に光る", options: YES_NO },
    ],
  },
];

/** 選択肢の表示名（パネルの表示用）。見つからなければ値をそのまま返す */
export function labelOf(key: string, value: string): string {
  for (const g of GROUPS) {
    const hit = g.fields.find((f) => f.key === key)?.options.find(([v]) => v === value);
    if (hit) return hit[1];
  }
  return value;
}

/** 何も選んでいない状態（保留は白、他はおまかせ） */
export function defaultSelection(): Record<string, string> {
  const sel: Record<string, string> = {};
  for (const g of GROUPS) for (const f of g.fields) sel[f.key] = f.options[0][0];
  return sel;
}

function oneOf<T extends string>(v: string | undefined, values: readonly T[]): T | undefined {
  return values.includes(v as T) ? (v as T) : undefined;
}

function yesNo(v: string | undefined): boolean | undefined {
  return v === "yes" ? true : v === "no" ? false : undefined;
}

/** undefined の項目を落とす（スプレッドで抽選結果を undefined で上書きしないため） */
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function noticesOf(sel: Selection): Partial<Notices> {
  const step = oneOf(sel.stepUp, STEP_UPS);
  return defined({
    stepUp: step === undefined ? undefined : (Number(step) as Notices["stepUp"]),
    goldDoor: yesNo(sel.goldDoor),
    logo: oneOf(sel.logo, LOGOS),
    zone: oneOf(sel.zone, ZONES),
    reachLine: oneOf(sel.reachLine, REACH_LINES),
    lumi: yesNo(sel.lumi),
    group: yesNo(sel.group),
    gem: yesNo(sel.gem),
  });
}

/** 選んだ値から次の変動の指定を作る。知らない値はおまかせ扱いにする */
export function toForce(sel: Selection): SpinForce {
  const result = Object.hasOwn(RESULTS, sel.result ?? "") ? RESULTS[sel.result as keyof typeof RESULTS] : undefined;
  const pseudo = oneOf(sel.pseudo, PSEUDOS);
  const scenario: ScenarioForce = defined({
    route: oneOf(sel.route, ROUTES),
    pseudo: pseudo === undefined ? undefined : (Number(pseudo) as ScenarioForce["pseudo"]),
    cutin: oneOf(sel.cutin, CUTINS),
    chara: oneOf<Chara>(sel.chara, CHARA_ORDER),
    title: oneOf(sel.title, TITLES),
    push: yesNo(sel.push),
    button: oneOf(sel.button, BUTTONS),
    notices: noticesOf(sel),
    revival: yesNo(sel.revival),
  });
  return {
    ...(result ?? {}),
    color: oneOf(sel.color, HOLD_COLORS) ?? "white",
    scenario,
  };
}
