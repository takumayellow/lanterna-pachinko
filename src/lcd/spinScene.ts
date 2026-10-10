import { settleAt, type Chara, type ReachLine, type Scenario, type TitleColor } from "../game/scenario";
import { drawBattle, drawBattleAftermath, type Battle } from "./battleScene";
import { drawChara } from "./charaArt";
import { CHARA, CHARA_ORDER, PURPLE, drawLantern, drawShadowSeal } from "./heroines";
import { drawNoticesBack, drawNoticesFront } from "./noticeScene";
import { reelPos, reelSpeed, symbolAt, type ReelPlan } from "./reels";
import {
  BLUE,
  GOLD,
  H,
  RED,
  SILVER,
  W,
  clamp01,
  easeOut,
  easeOutBack,
  flash,
  hash,
  lerp,
  rainbow,
  span,
  sparkles,
  sunburst,
  text,
  vGrad,
  vignette,
  type G,
} from "./paint";
import { SYM_H, SYM_W, type SymbolSprites } from "./sprites";

/** 変動中の液晶。シナリオと変動の経過時間だけから描く */

export interface SceneCtx {
  g: G;
  /** 実時間 [s]（背景の揺らぎ用） */
  now: number;
  sprites: SymbolSprites;
}

export interface SpinView {
  scenario: Scenario;
  plan: ReelPlan;
  /** 変動開始からの秒。止まった後も進み続ける */
  t: number;
  /** PUSH ボタンを押した時刻（変動内の秒） */
  pushedAt?: number;
}

interface Slot {
  x: number;
  y: number;
  s: number;
}

const NORMAL: Slot[] = [
  { x: 230, y: 380, s: 1 },
  { x: 520, y: 380, s: 1 },
  { x: 810, y: 380, s: 1 },
];
/** SP リーチ中は図柄を下に小さく並べ、真ん中で演出を見せる */
const BOTTOM: Slot[] = [
  { x: 190, y: 615, s: 0.56 },
  { x: 520, y: 615, s: 0.56 },
  { x: 850, y: 615, s: 0.56 },
];

/** 押さなくても決着の少し前に自動で押したことにする */
const AUTO_PUSH_LEAD = 0.5;

const SP_TITLE: Record<NonNullable<Scenario["sp"]>, (c: Chara) => string> = {
  song: () => "楽曲リーチ",
  daily: () => "日常リーチ",
  shade: (c) => `${CHARA[c].name} VS 影法師`,
};
const SPSP_TITLE: Record<NonNullable<Scenario["spsp"]>, string> = {
  storm: "黒嵐バトル",
  abyss: "深淵の主",
  story: "ストーリーリーチ",
};

/** リーチラインの色。none は通常の赤 */
const REACH_GLOW: Record<ReachLine, string> = {
  none: "255,60,80",
  purple: "170,90,255",
  red: "255,30,50",
  gold: "255,200,60",
  rainbow: "255,255,255",
};

export function pushTime(v: SpinView): number | undefined {
  const s = v.scenario;
  if (s.pushAt === undefined) return undefined;
  return v.pushedAt ?? settleAt(s) - AUTO_PUSH_LEAD;
}

/** ボタンの無い変動で、バトルの勝ち負けを見せるのは止まる何秒前か */
const DECIDE_LEAD = 1.0;
/** 最後の撃ち合い（ビームのぶつかり合い）を勝ち負けの何秒前から見せるか */
const CHARGE_LEAD = 1.2;

/** バトルで戦う相手。SPSP の黒嵐・深淵、SP の影法師。その場面でなければ null */
export function battleOf(v: SpinView): Battle | null {
  const s = v.scenario;
  const win = s.hit && !s.revival;
  const decide = pushTime(v) ?? settleAt(s) - DECIDE_LEAD;
  const charge = s.pushAt ?? decide - CHARGE_LEAD;
  if (s.spspAt !== undefined && v.t >= s.spspAt) {
    if (s.spsp !== "storm" && s.spsp !== "abyss") return null;
    return { enemy: s.spsp === "storm" ? "storm" : "abyss", chara: s.chara, from: s.spspAt, charge, decide, win };
  }
  if (spKind(s) !== "shade" || s.spAt === undefined || v.t < s.spAt) return null;
  // SPSP へ発展するなら、影法師とは決着をつけずに撃ち合いだけ見せる
  if (s.spspAt !== undefined) return { enemy: "shade", chara: s.chara, from: s.spAt, charge: s.spspAt, win };
  return { enemy: "shade", chara: s.chara, from: s.spAt, charge, decide, win };
}

/** SP の種類。SPSP へ発展する変動の SP は影法師バトル（勝ち負けをつけずに黒嵐が出てくる） */
function spKind(s: Scenario): NonNullable<Scenario["sp"]> {
  return s.sp ?? "shade";
}

export function drawSpin(c: SceneCtx, v: SpinView): void {
  const { g } = c;
  const s = v.scenario;
  const t = v.t;
  // 演出の層は「決着」で引く。復活ではハズレ目で一度止まる時刻が決着に見える
  const end = settleAt(s);
  const settled = t >= end;

  // ---- 背景の上に重ねる演出の層（図柄より奥）
  if (s.kind === "zenkaiten" && t >= 0.3) drawZenkaitenBack(c, t);
  drawNoticesBack(c, v);
  const spK = s.spAt !== undefined ? span(t, s.spAt, s.spAt + 0.6) : 0;
  const backK = settled ? span(t, end, end + 0.5) : 0;
  const layoutK = spK * (1 - backK);
  if (s.spspAt !== undefined && t >= s.spspAt && !settled) drawSpsp(c, v);
  else if (s.spAt !== undefined && t >= s.spAt && !settled) drawSp(c, v);

  // リーチ中は真ん中の列の後ろをリーチラインの色で光らせる
  const reach = s.reachAt !== undefined && t >= s.reachAt && !settled;
  if (reach && layoutK < 0.5) drawReachGlow(c, s.notices.reachLine);

  // ---- 図柄
  const blackout = s.kind === "sudden" && t >= 0.5 && t < s.stops[0];
  if (blackout) drawSuddenBlackout(c, t);
  else {
    const frozen = pseudoFreeze(v);
    for (let i = 0; i < 3; i++) {
      const slot = mix(NORMAL[i], BOTTOM[i], easeOut(layoutK));
      drawReel(c, v, i, slot, frozen?.[i]);
    }
  }

  // ---- 図柄より手前の演出
  if (reach) drawReachTitle(c, t - s.reachAt!, s.notices.reachLine);
  if (s.kind === "zenkaiten" && t >= 0.3 && t < 3) drawSlam(c, "全回転", t - 0.3, "rainbow");
  for (let i = 0; i < s.pseudo.length; i++) {
    const p = s.pseudo[i];
    if (t >= p - 0.2 && t < p + 1) drawNext(c, t - p + 0.2, i + 2);
  }
  drawNoticesFront(c, v);
  if (s.cutinAt !== undefined && s.cutin !== "none" && t >= s.cutinAt && t < s.cutinAt + 1.7) {
    drawCutin(c, s.cutin, s.chara, t - s.cutinAt);
  }
  drawPush(c, v);
  if (t >= s.stops[1]) drawSettle(c, v, t - s.stops[1]);
  if (s.kind === "sudden" && t >= s.stops[0]) flash(g, "#fff6c0", 1 - span(t, s.stops[0], s.stops[0] + 0.5));
}

function mix(a: Slot, b: Slot, k: number): Slot {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), s: lerp(a.s, b.s, k) };
}

/** 擬似連: NEXT の直前に図柄を一瞬止める */
function pseudoFreeze(v: SpinView): number[] | null {
  for (const p of v.scenario.pseudo) {
    if (v.t >= p - 0.45 && v.t < p + 0.15) {
      return [0, 1, 2].map((i) => Math.round(reelPos(v.plan, i, p - 0.45)));
    }
  }
  return null;
}

function drawReel(c: SceneCtx, v: SpinView, i: number, slot: Slot, frozen?: number): void {
  const { g } = c;
  const s = v.scenario;
  const pos = frozen ?? reelPos(v.plan, i, v.t);
  const speed = frozen !== undefined ? 0 : reelSpeed(v.plan, i, v.t);
  const k = Math.floor(pos);
  const frac = pos - k;
  const cell = SYM_H * 0.86 * slot.s;

  // 止まった瞬間に少し沈んで戻る（復活ではハズレ目で止まったときにも）
  const stopAt = i === 1 && s.revivalAt !== undefined && v.t < s.stops[1] ? s.revivalAt : s.stops[i];
  const since = v.t - stopAt;
  const bounce = since >= 0 && since < 0.28 ? Math.sin((since / 0.28) * Math.PI) * 16 * slot.s * (1 - since / 0.28) : 0;
  // 擬似連の停止は小刻みに揺らす
  const shake = frozen !== undefined ? Math.sin(c.now * 70) * 3 : 0;

  g.save();
  g.beginPath();
  g.rect(slot.x - SYM_W * slot.s * 0.62, slot.y - cell * 1.25, SYM_W * slot.s * 1.24, cell * 2.5);
  g.clip();
  for (let j = -1; j <= 2; j++) {
    const y = slot.y - (j - frac) * cell + bounce;
    const d = Math.min(1.4, Math.abs(y - slot.y) / cell);
    if (d >= 1.4) continue;
    const n = symbolAt(k + j);
    const img = speed > 5 ? c.sprites.blur[n] : c.sprites.sharp[n];
    const sc = slot.s * (1 - 0.22 * Math.min(1, d));
    g.globalAlpha = 1 - 0.72 * Math.min(1, d);
    g.drawImage(img, slot.x - (SYM_W * sc) / 2 + shake, y - (SYM_H * sc) / 2, SYM_W * sc, SYM_H * sc);
  }
  g.restore();
}

function drawReachGlow(c: SceneCtx, line: ReachLine): void {
  const { g } = c;
  const pulse = 0.55 + 0.45 * Math.sin(c.now * 9);
  const rgb = REACH_GLOW[line];
  const strong = line === "gold" || line === "rainbow" ? 0.75 : 0.55;
  g.save();
  g.globalCompositeOperation = "lighter";
  const gr = g.createRadialGradient(NORMAL[1].x, NORMAL[1].y, 20, NORMAL[1].x, NORMAL[1].y, 240);
  gr.addColorStop(0, `rgba(${rgb},${strong * pulse})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(NORMAL[1].x - 250, 0, 500, H);
  // リーチライン: 左右の図柄を結ぶ帯
  if (line !== "none") {
    const y = NORMAL[1].y;
    g.globalAlpha = 0.65 + 0.35 * pulse;
    g.fillStyle = line === "rainbow" ? rainbow(g, 0, W, c.now * 0.8) : `rgba(${rgb},0.9)`;
    g.fillRect(40, y - 6, W - 80, 12);
  }
  g.restore();
}

const REACH_TITLE_FILL: Record<ReachLine, readonly string[]> = {
  none: RED,
  purple: PURPLE,
  red: RED,
  gold: GOLD,
  rainbow: RED,
};

function drawReachTitle(c: SceneCtx, dt: number, line: ReachLine): void {
  const { g } = c;
  const fillOf = (y0: number, y1: number) => (line === "rainbow" ? rainbow(g, -300, 300, c.now * 0.8) : vGrad(g, y0, y1, [...REACH_TITLE_FILL[line]]));
  if (dt < 1.2) {
    const k = easeOutBack(dt / 0.25);
    const fade = 1 - span(dt, 0.9, 1.2);
    g.save();
    g.globalAlpha = fade;
    g.translate(W / 2, 130);
    g.scale(2.4 - 1.4 * k, 2.4 - 1.4 * k);
    text(g, "リーチ!", 0, 0, { size: 120, fill: fillOf(-60, 60), stroke: "#fff", strokeW: 14, outer: "#3a0010", outerW: 32, glow: `rgb(${REACH_GLOW[line]})` });
    g.restore();
    vignette(g, `rgba(${REACH_GLOW[line]},0.8)`, 0.6 * fade);
  } else {
    text(g, "リーチ", 90, 48, { size: 38, fill: fillOf(30, 66), stroke: "#fff", strokeW: 6, outer: "#3a0010", outerW: 14 });
  }
}

/** 画面いっぱいに叩きつける文字 */
function drawSlam(c: SceneCtx, s: string, dt: number, style: TitleColor): void {
  const { g } = c;
  const k = easeOutBack(dt / 0.3);
  g.save();
  g.globalAlpha = 1 - span(dt, 2.2, 2.7);
  g.translate(W / 2, H * 0.42);
  g.scale(3 - 2 * k, 3 - 2 * k);
  g.rotate(-0.06);
  const size = s.length > 5 ? 120 : 170;
  text(g, s, 0, 0, { size, fill: titleFill(c, style, size / 2), stroke: "#fff", strokeW: 16, outer: "#1a0630", outerW: 38, glow: "#fff" });
  g.restore();
}

/** タイトルの色。白 → 赤 → 金 → 虹 の順に熱い */
function titleFill(c: SceneCtx, color: TitleColor, half: number): string | CanvasGradient {
  const { g } = c;
  if (color === "rainbow") return rainbow(g, -300, 300, c.now * 0.6);
  const grad = color === "gold" ? GOLD : color === "red" ? RED : SILVER;
  return vGrad(g, -half, half, [...grad]);
}

function drawNext(c: SceneCtx, dt: number, count: number): void {
  const { g } = c;
  flash(g, "#ffffff", 0.7 * (1 - span(dt, 0, 0.25)));
  const k = easeOutBack(dt / 0.25);
  g.save();
  g.globalAlpha = 1 - span(dt, 0.9, 1.2);
  g.translate(W / 2, 140);
  g.scale(k, k);
  text(g, "NEXT", -60, 0, { size: 120, fill: vGrad(g, -60, 60, BLUE), stroke: "#fff", strokeW: 12, outer: "#061a50", outerW: 30, glow: "#5fd0ff" });
  text(g, `×${count}`, 190, 10, { size: 96, fill: vGrad(g, -50, 50, GOLD), stroke: "#fff", strokeW: 10, outer: "#4a1a00", outerW: 26 });
  g.restore();
}

const CUTIN_STYLE = {
  blue: { band: ["#0b2a7a", "#2f7bff", "#0b2a7a"], line: "まだ、いける！", fill: BLUE, rim: "#9fe3ff" },
  red: { band: ["#5a0014", "#ff2a4a", "#5a0014"], line: "ここで、決める！", fill: RED, rim: "#ffd0d8" },
  gold: { band: ["#5a3000", "#ffc23a", "#5a3000"], line: "絶対に、負けない！！", fill: GOLD, rim: "#fff6c0" },
} as const;

/** セリフ予告: 帯の左にキャラ（帯の中で切り抜き、遅れて滑り込む）、右に台詞 */
function drawCutin(c: SceneCtx, kind: "blue" | "red" | "gold", chara: Chara, dt: number): void {
  const { g } = c;
  const st = CUTIN_STYLE[kind];
  const ch = CHARA[chara];
  const inK = easeOut(dt / 0.2);
  const outK = span(dt, 1.45, 1.7);
  const x = (1 - inK) * W - outK * W * 1.2;
  const y0 = 250;
  const h = 250;
  g.save();
  g.translate(x, 0);
  // 斜めの帯
  g.beginPath();
  g.moveTo(-40, y0 + 30);
  g.lineTo(W + 40, y0 - 30);
  g.lineTo(W + 40, y0 + h - 30);
  g.lineTo(-40, y0 + h + 30);
  g.closePath();
  g.fillStyle = vGrad(g, y0 - 30, y0 + h + 30, [...st.band]);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = st.rim;
  g.stroke();
  g.save();
  g.clip();
  // 帯の中を流れる線
  g.globalAlpha = 0.25;
  g.fillStyle = "#fff";
  for (let i = 0; i < 14; i++) {
    const ly = y0 + hash(i) * h;
    const lx = ((hash(i + 9) * W * 2 - dt * 2400) % (W * 2)) + W * 0.5;
    g.fillRect(lx, ly, 160 + hash(i + 3) * 200, 3);
  }
  // 帯より少し遅れて入り、ゆっくり流れる（奥行きのずれ）
  const slide = (1 - easeOut((dt - 0.05) / 0.3)) * -260 + dt * 24;
  g.globalAlpha = 1;
  const drawn = drawChara(g, chara, 190 + slide, y0 + h / 2 - 6, 560);
  g.restore();
  if (!drawn) drawLantern(g, 150, y0 + h / 2, 82, ch.grad, 0.8);
  text(g, ch.name, 150, y0 + h - 20, { size: 40, fill: vGrad(g, y0 + h - 40, y0 + h, [...ch.grad]), stroke: "#fff", strokeW: 6, outer: "#14061e", outerW: 14 });
  const size = st.line.length > 8 ? 84 : 100;
  text(g, st.line, W * 0.62, y0 + h / 2, {
    size,
    fill: vGrad(g, y0 + h / 2 - size / 2, y0 + h / 2 + size / 2, [...st.fill]),
    stroke: "#fff",
    strokeW: 12,
    outer: "#14061e",
    outerW: 30,
    glow: st.rim,
  });
  g.restore();
}

/** SP リーチ: 楽曲 / 日常 / 影法師バトル */
function drawSp(c: SceneCtx, v: SpinView): void {
  const { g } = c;
  const s = v.scenario;
  const dt = v.t - s.spAt!;
  const ch = CHARA[s.chara];
  const enter = easeOut(dt / 0.5);
  g.save();
  g.globalCompositeOperation = "lighter";
  sunburst(g, W / 2, H * 0.42, 900, 24, c.now * 0.25, spKind(s) === "shade" ? "rgba(140,60,200,0.08)" : "rgba(255,170,220,0.1)");
  g.restore();
  switch (spKind(s)) {
    case "song": {
      // 音符が昇る中でこはるが歌う
      drawNotes(c);
      const bob = Math.sin(c.now * 1.6) * 8;
      if (!drawChara(g, "rose", W * 0.5 + (1 - enter) * 120, H * 0.27 + bob, 640, enter)) {
        drawLantern(g, W / 2, H * 0.36 + bob, 110 * enter, CHARA.rose.grad, 0.9);
      }
      break;
    }
    case "daily": {
      // 五人が並ぶ。端から順に下から上がってくる（真ん中を手前に）
      for (const i of [0, 4, 1, 3, 2]) {
        const k = CHARA_ORDER[i];
        const up = easeOut((dt - Math.abs(i - 2) * 0.12) / 0.5);
        const x = W / 2 + (i - 2) * 205;
        const y = H * 0.27 + Math.sin(c.now * 1.4 + i) * 6 + (1 - up) * 260;
        const big = i === 2 ? 1.04 : 1 - Math.abs(i - 2) * 0.05;
        if (!drawChara(g, k, x, y, 370 * big, up)) drawLantern(g, x, H * 0.36 + (1 - up) * 300, 62, CHARA[k].grad, 0.6);
      }
      break;
    }
    default: {
      const b = battleOf(v);
      if (b) drawBattle(g, c.now, b, v.t);
      break;
    }
  }
  sparkles(g, c.now, 40, "#fff", 50, 3);
  drawTitleBand(c, SP_TITLE[spKind(s)](s.chara), s.title, dt);
  drawCountdown(c, v, ["#ffe680", ch.color]);
}

/** 楽曲リーチの音符 */
function drawNotes(c: SceneCtx): void {
  const { g } = c;
  g.save();
  g.fillStyle = "rgba(255,220,240,0.85)";
  g.strokeStyle = "rgba(255,220,240,0.85)";
  g.lineWidth = 4;
  for (let i = 0; i < 14; i++) {
    const p = (c.now * 0.18 + hash(i)) % 1;
    const x = 80 + hash(i + 5) * (W - 160) + Math.sin(c.now * 2 + i) * 20;
    const y = H - p * (H + 80);
    g.globalAlpha = Math.sin(p * Math.PI) * 0.9;
    g.beginPath();
    g.ellipse(x, y, 14, 10, -0.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(x + 12, y - 2);
    g.lineTo(x + 12, y - 50);
    g.lineTo(x + 30, y - 40);
    g.stroke();
  }
  g.restore();
}

/** SPSP リーチ: 黒嵐バトル / 深淵の主 / ストーリー */
function drawSpsp(c: SceneCtx, v: SpinView): void {
  const { g } = c;
  const s = v.scenario;
  const dt = v.t - s.spspAt!;
  const ch = CHARA[s.chara];
  const abyss = s.spsp === "abyss";
  // 背景の絵を沈めすぎない程度に色をかぶせる
  const tint = abyss ? "rgba(0,20,70,0.22)" : s.spsp === "story" ? "rgba(30,0,40,0.22)" : "rgba(60,0,10,0.25)";
  g.fillStyle = tint;
  g.fillRect(0, 0, W, H);
  const battle = battleOf(v);
  if (!battle) drawShadowSeal(g, W / 2, H * 0.4, 360, c.now * 0.3, abyss ? "#60b0ff" : "#ff4060", 0.45);
  g.save();
  g.globalCompositeOperation = "lighter";
  sunburst(g, W / 2, H * 0.42, 900, 18, -c.now * 0.4, abyss ? "rgba(80,160,255,0.08)" : "rgba(255,40,40,0.09)");
  g.restore();
  // 稲妻
  const bolt = Math.floor(c.now * 5);
  if (hash(bolt) > 0.72) {
    g.save();
    g.strokeStyle = "rgba(255,240,255,0.9)";
    g.lineWidth = 5;
    g.shadowColor = abyss ? "#60c0ff" : "#ff60ff";
    g.shadowBlur = 30;
    let x = hash(bolt + 1) * W;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y < H; y += 60) {
      x += (hash(bolt * 13 + y) - 0.5) * 120;
      g.lineTo(x, y);
    }
    g.stroke();
    g.restore();
    flash(g, "#ffd0ff", 0.12);
  }
  // ストーリーはキャラの周りを五人のジェムが回る。それ以外は敵と戦う
  const enter = easeOut(dt / 0.7);
  const breathe = Math.sin(c.now * 1.3) * 6;
  if (battle) drawBattle(g, c.now, battle, v.t);
  else {
    const ring = (front: boolean): void =>
      CHARA_ORDER.forEach((k, i) => {
        const a = c.now * 0.6 + (i / 5) * Math.PI * 2;
        if ((Math.sin(a) > 0) === front) drawLantern(g, W / 2 + Math.cos(a) * 340, H * 0.52 + Math.sin(a) * 70, 46, CHARA[k].grad, 0.7);
      });
    ring(false);
    const drawn = drawChara(g, s.chara, W / 2, H * 0.24 + breathe + (1 - enter) * 120, 660, enter);
    ring(true);
    if (!drawn) drawLantern(g, W / 2, H * 0.36, 90, ch.grad, 0.9);
  }
  vignette(g, "rgba(0,0,0,0.75)", 0.7);
  const title = SPSP_TITLE[s.spsp ?? "storm"];
  if (dt < 1.6) {
    flash(g, abyss ? "#2060ff" : "#ff2040", 0.6 * (1 - dt / 0.4));
    drawSlam(c, title, dt, s.title);
  } else {
    drawTitleBand(c, title, s.title, 99);
  }
  drawCountdown(c, v, abyss ? ["#40a0ff", "#ffd040"] : ["#ff4040", "#ffd040"]);
}

function drawTitleBand(c: SceneCtx, title: string, color: TitleColor, dt: number): void {
  const { g } = c;
  const k = easeOutBack(dt / 0.35);
  const size = title.length > 7 ? 58 : 72;
  g.save();
  g.translate(W / 2, 70);
  g.scale(k, k);
  g.fillStyle = "rgba(10,0,20,0.55)";
  g.beginPath();
  g.roundRect(-340, -48, 680, 96, 48);
  g.fill();
  text(g, title, 0, 2, { size, fill: titleFill(c, color, size / 2), stroke: "#fff", strokeW: 9, outer: "#1a0620", outerW: 22 });
  g.restore();
}

/** 決着までのゲージ */
function drawCountdown(c: SceneCtx, v: SpinView, colors: [string, string]): void {
  const { g } = c;
  const s = v.scenario;
  const from = s.spspAt ?? s.spAt!;
  const k = clamp01((v.t - from) / (settleAt(s) - from));
  const x = 220;
  const y = 548;
  const w = W - 440;
  g.save();
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.beginPath();
  g.roundRect(x - 6, y - 6, w + 12, 30, 15);
  g.fill();
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, colors[0]);
  gr.addColorStop(1, colors[1]);
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(x, y, Math.max(18, w * k), 18, 9);
  g.fill();
  g.restore();
  if (k > 0.82) {
    const blink = Math.sin(c.now * 14) > 0 ? 1 : 0.6;
    g.save();
    g.globalAlpha = blink;
    text(g, "決着!!", W / 2, 505, { size: 58, fill: vGrad(g, 480, 530, GOLD), stroke: "#fff", strokeW: 8, outer: "#3a0a00", outerW: 18 });
    g.restore();
  }
}

function drawPush(c: SceneCtx, v: SpinView): void {
  const { g } = c;
  const s = v.scenario;
  if (s.pushAt === undefined || v.t < s.pushAt) return;
  const pt = pushTime(v)!;
  const end = settleAt(s);
  if (v.t < pt && v.t < end) {
    if (s.button === "lever") drawLever(c);
    else drawButton(c, s.button === "red");
    return;
  }
  const dt = v.t - pt;
  if (dt < 0) return;
  if (s.hit && !s.revival) {
    flash(g, "#ffffff", 1 - span(dt, 0.05, 0.6));
    if (v.t < end) {
      g.save();
      const k = easeOutBack(dt / 0.3);
      g.translate(W / 2, H * 0.36);
      g.scale(k, k);
      text(g, "激アツ!!", 0, 0, { size: 150, fill: rainbow(g, -300, 300, c.now), stroke: "#fff", strokeW: 16, outer: "#1a0630", outerW: 36, glow: "#fff" });
      g.restore();
    }
  } else {
    flash(g, "#ffffff", 0.6 * (1 - span(dt, 0, 0.25)));
  }
}

/** 当落ボタン。赤は大きく、周りに稲妻のような光 */
function drawButton(c: SceneCtx, red: boolean): void {
  const { g } = c;
  const pulse = 1 + (red ? 0.12 : 0.08) * Math.sin(c.now * (red ? 22 : 16));
  const r = red ? 175 : 140;
  g.save();
  g.translate(W / 2, H * 0.45);
  if (red) {
    g.save();
    g.globalCompositeOperation = "lighter";
    sunburst(g, 0, 0, 520, 16, c.now * 2, "rgba(255,40,60,0.35)");
    g.restore();
  }
  g.scale(pulse, pulse);
  const gr = g.createRadialGradient(0, -20, 10, 0, 0, r + 10);
  gr.addColorStop(0, red ? "#ffe0e0" : "#ffd0e0");
  gr.addColorStop(0.5, red ? "#ff1020" : "#ff2d6a");
  gr.addColorStop(1, red ? "#500008" : "#6a0024");
  g.fillStyle = gr;
  g.shadowColor = red ? "#ff2030" : "#ff6aa0";
  g.shadowBlur = red ? 60 : 30;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 14;
  g.strokeStyle = "#ffe9a0";
  g.stroke();
  text(g, "PUSH", 0, 6, { size: red ? 120 : 96, fill: "#fff", stroke: red ? "#500008" : "#6a0024", strokeW: 16 });
  g.restore();
  const y = H * 0.45 + r + 60;
  text(g, red ? "全力で押せ!!" : "ボタンを押して!", W / 2, y, { size: 54, fill: vGrad(g, y - 25, y + 25, red ? RED : GOLD), stroke: "#fff", strokeW: 7, outer: "#3a0a00", outerW: 18 });
}

/** レバー（最上位の当落）。虹の枠で上下に揺れる */
function drawLever(c: SceneCtx): void {
  const { g } = c;
  const bob = Math.sin(c.now * 10) * 16;
  g.save();
  g.translate(W / 2, H * 0.42);
  g.save();
  g.globalCompositeOperation = "lighter";
  sunburst(g, 0, 0, 600, 24, c.now * 1.5, "rgba(255,255,255,0.22)");
  g.restore();
  g.lineCap = "round";
  g.strokeStyle = "#d8dce8";
  g.lineWidth = 26;
  g.beginPath();
  g.moveTo(0, 120);
  g.lineTo(0, -60 + bob);
  g.stroke();
  const gr = g.createRadialGradient(-20, -110 + bob, 8, 0, -90 + bob, 70);
  gr.addColorStop(0, "#fff");
  gr.addColorStop(0.4, "#ff3050");
  gr.addColorStop(1, "#5a0010");
  g.fillStyle = gr;
  g.shadowColor = "#fff";
  g.shadowBlur = 40;
  g.beginPath();
  g.arc(0, -90 + bob, 66, 0, Math.PI * 2);
  g.fill();
  g.restore();
  const y = H * 0.42 + 210;
  text(g, "レバーを引け!!", W / 2, y, { size: 72, fill: rainbow(g, -300, 300, c.now), stroke: "#fff", strokeW: 9, outer: "#1a0630", outerW: 22, glow: "#fff" });
}

/** 決着: 当たりは虹の光、ハズレは暗く沈める。バトルで勝ったなら砕けた敵の欠片を飛ばし続ける */
function drawSettle(c: SceneCtx, v: SpinView, dt: number): void {
  const { g } = c;
  const s = v.scenario;
  const battle = battleOf(v);
  if (battle) drawBattleAftermath(g, battle, v.t);
  if (s.hit) {
    flash(g, "#ffffff", 0.85 * (1 - span(dt, 0, 0.45)));
    const pulse = 0.5 + 0.5 * Math.sin(c.now * 10);
    g.save();
    g.globalCompositeOperation = "lighter";
    const gr = g.createRadialGradient(W / 2, NORMAL[1].y, 60, W / 2, NORMAL[1].y, 520);
    gr.addColorStop(0, `rgba(255,240,180,${0.35 + 0.25 * pulse})`);
    gr.addColorStop(1, "rgba(255,120,200,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.restore();
    sparkles(g, c.now, 50, "#fff7c0", 80, 9);
    return;
  }
  if (s.kind !== "hazure") {
    g.save();
    g.globalAlpha = 0.45 * span(dt, 0, 0.3);
    g.fillStyle = "#0a0a18";
    g.fillRect(0, 0, W, H);
    g.restore();
  }
}

function drawZenkaitenBack(c: SceneCtx, t: number): void {
  const { g } = c;
  g.save();
  g.globalAlpha = span(t, 0.3, 0.8);
  g.globalCompositeOperation = "lighter";
  sunburst(g, W / 2, H * 0.5, 900, 30, c.now * 0.6, "rgba(255,255,255,0.3)");
  g.globalAlpha *= 0.25;
  g.fillStyle = rainbow(g, 0, W, c.now * 0.3);
  g.fillRect(0, 0, W, H);
  g.restore();
}

function drawSuddenBlackout(c: SceneCtx, t: number): void {
  const { g } = c;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  // ひび
  g.save();
  g.strokeStyle = "rgba(255,240,200,0.9)";
  g.lineWidth = 3;
  g.shadowColor = "#ffd060";
  g.shadowBlur = 16;
  const k = span(t, 0.9, 1.6);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + hash(i) * 0.4;
    g.beginPath();
    g.moveTo(W / 2, H / 2);
    let x = W / 2;
    let y = H / 2;
    for (let j = 1; j <= 5; j++) {
      const r = (j / 5) * 520 * k;
      x = W / 2 + Math.cos(a + (hash(i * 9 + j) - 0.5) * 0.4) * r;
      y = H / 2 + Math.sin(a + (hash(i * 9 + j) - 0.5) * 0.4) * r;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.restore();
  if (t > 1.0) {
    const dt = t - 1.0;
    g.save();
    g.translate(W / 2 + Math.sin(c.now * 60) * 4, H / 2);
    const s = easeOutBack(dt / 0.25);
    g.scale(s, s);
    text(g, "!?", 0, 0, { size: 220, fill: vGrad(g, -100, 100, GOLD), stroke: "#fff", strokeW: 16, outer: "#3a1800", outerW: 40, glow: "#ffd060" });
    g.restore();
  }
}
