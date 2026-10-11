import type { Machine, Spin } from "../game/machine";
import { MODE_LABEL, type Mode } from "../game/spec";
import type { StageDirector } from "../lcd/director";
import { BACKDROPS, type Backdrop } from "../lcd/stageShader";
import { defaultSelection, GROUPS, labelOf, toForce, type Field, type Option } from "./options";

/**
 * 開発者向けページ（URL に ?dev）。見たい演出を選んで次の変動に積む。
 * 玉を打たなくても、積んだ保留はそのまま消化される。
 */

export interface DevTargets {
  m: Machine;
  director: StageDirector;
}

const BACKDROP_LABEL: Record<Backdrop, string> = {
  city: "夕景の街",
  barrier: "影の帳",
  circle: "空の紋",
  gold: "金",
  despair: "黒嵐",
  clock: "時計塔",
  night: "月夜",
  abyss: "深海",
  rush: "RUSH",
};

const MODES: readonly Mode[] = ["normal", "rush", "lt"];

const KIND_LABEL: Record<Spin["scenario"]["kind"], string> = {
  hazure: "リーチなし",
  reach: "通常リーチ",
  sp: "SP",
  spsp: "SPSP",
  zenkaiten: "全回転",
  sudden: "突然",
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function select(options: readonly Option[], value: string): HTMLSelectElement {
  const s = el("select");
  for (const [v, label] of options) {
    const o = el("option", undefined, label);
    o.value = v;
    s.append(o);
  }
  s.value = value;
  return s;
}

function row(label: string, control: HTMLElement): HTMLLabelElement {
  const l = el("label", "dev-row");
  l.append(el("span", undefined, label), control);
  return l;
}

/** 変動中の演出を 1 行で */
function describe(sp: Spin | null): string {
  if (!sp) return "変動なし";
  const s = sp.scenario;
  const route = s.spsp ?? s.sp;
  const parts = [route ? labelOf("route", route) : KIND_LABEL[s.kind], s.hit ? "当たり" : "ハズレ"];
  if (s.cutin !== "none") parts.push(`カットイン ${labelOf("cutin", s.cutin)}`);
  if (s.revival) parts.push("復活");
  return `${parts.join(" / ")}  ${sp.t.toFixed(1)}s / ${s.duration.toFixed(1)}s`;
}

export function mountDevPanel({ m, director }: DevTargets): void {
  let sel = defaultSelection();
  const selects = new Map<string, HTMLSelectElement>();

  const root = el("aside", "panel dev");
  root.id = "dev";
  const head = el("div", "dev-head");
  const toggle = el("button", "dev-toggle", "閉じる");
  toggle.type = "button";
  head.append(el("strong", undefined, "開発者向け"), toggle);
  const body = el("div", "dev-body");
  // 畳んでいても見えるように、変動中の演出は見出しのすぐ下に出す
  const now = el("p", "dev-now", "");
  root.append(head, now, body);

  const field = (f: Field): HTMLLabelElement => {
    const s = select(f.options, sel[f.key]);
    s.addEventListener("change", () => {
      sel = { ...sel, [f.key]: s.value };
    });
    selects.set(f.key, s);
    return row(f.label, s);
  };
  for (const g of GROUPS) {
    const fs = el("fieldset");
    fs.append(el("legend", undefined, g.title), ...g.fields.map(field));
    body.append(fs);
  }

  const status = el("p", "dev-status", "");
  const queue = el("button", "dev-go", "次の変動にセット");
  queue.type = "button";
  queue.addEventListener("click", () => {
    m.queueForced(toForce(sel));
    status.textContent = "保留の先頭に積みました";
    // 演出を見やすいように畳む
    setOpen(false);
  });
  const reset = el("button", undefined, "おまかせに戻す");
  reset.type = "button";
  reset.addEventListener("click", () => {
    sel = defaultSelection();
    for (const [k, s] of selects) s.value = sel[k];
  });
  const actions = el("div", "dev-actions");
  actions.append(queue, reset);
  body.append(actions, status);

  const misc = el("fieldset");
  misc.append(el("legend", undefined, "台"));
  const mode = select(
    MODES.map((md): Option => [md, MODE_LABEL[md]]),
    m.mode,
  );
  const enter = el("button", undefined, "切り替え");
  enter.type = "button";
  enter.addEventListener("click", () => {
    const md = MODES.find((x) => x === mode.value);
    if (!md) return;
    status.textContent = m.enterMode(md) ? `${MODE_LABEL[md]}に切り替えました` : "大当たり中は切り替えられません";
  });
  const modeRow = row("モード", mode);
  modeRow.append(enter);
  const backdrop = select([["", "演出どおり"], ...BACKDROPS.map((b): Option => [b, BACKDROP_LABEL[b]])], "");
  backdrop.addEventListener("change", () => {
    director.debugBackdrop = BACKDROPS.find((b) => b === backdrop.value) ?? null;
  });
  misc.append(modeRow, row("背景を固定", backdrop));
  body.append(misc);

  body.append(el("p", "dev-note", "ST 中は予告・擬似連・タイトルの色・復活は出ない"));

  function setOpen(open: boolean): void {
    body.hidden = !open;
    toggle.textContent = open ? "閉じる" : "開く";
  }
  toggle.addEventListener("click", () => setOpen(body.hidden));
  document.body.append(root);

  // 変動中の演出を出す（抽選に任せた項目が何になったか見えるように）
  window.setInterval(() => {
    const text = `${MODE_LABEL[m.mode]}  ${describe(m.spin)}`;
    if (now.textContent !== text) now.textContent = text;
  }, 200);
}
