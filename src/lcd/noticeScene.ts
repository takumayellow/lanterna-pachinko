import { DOOR_LEN, GROUP_LEN, LUMI_LEN, REVIVAL_UP, STEP_GAP, STEP_HOLD, noticeTimes } from "../game/notices";
import type { Chara } from "../game/scenario";
import { CHARA, CHARA_ORDER, drawButterflies, drawLantern, drawShadowSeal } from "./heroines";
import {
  GOLD,
  H,
  RED,
  SILVER,
  W,
  easeOut,
  easeOutBack,
  flash,
  hash,
  rainbow,
  span,
  sparkles,
  sunburst,
  text,
  vGrad,
  vignette,
  type G,
} from "./paint";
import type { SceneCtx, SpinView } from "./spinScene";

/** リーチ前後の予告と復活の絵。時刻は game/notices.ts と共有する */

const LOGO_LEN = 1.8;
const GEM_LEN = 1.5;
const COUNT_LEN = 0.9;

/** ステップアップの枠の色。白 → 青 → 緑 → 赤 → 金 */
const STEP_FRAME = [SILVER, ["#f0fbff", "#7fdcff", "#2f7bff", "#10307a"], ["#f0fff4", "#7affb0", "#18c060", "#0a5a2a"], RED, GOLD];

/** 図柄より奥に描く予告（影の帳の紋様） */
export function drawNoticesBack(c: SceneCtx, v: SpinView): void {
  const s = v.scenario;
  const nt = noticeTimes(s);
  const t = v.t;
  if (nt.zone !== undefined && s.reachAt !== undefined && t >= nt.zone && t < s.reachAt + 0.6) {
    const red = s.notices.zone === "red";
    const a = span(t, nt.zone, nt.zone + 0.5) * (1 - span(t, s.reachAt, s.reachAt + 0.6));
    drawShadowSeal(c.g, W / 2, H * 0.48, 420, c.now * 0.25, red ? "#ff4050" : "#c090ff", 0.55 * a);
    if (red) vignette(c.g, "rgba(200,0,30,0.9)", 0.5 * a);
  }
}

/** 図柄より手前に描く予告 */
export function drawNoticesFront(c: SceneCtx, v: SpinView): void {
  const s = v.scenario;
  const nt = noticeTimes(s);
  const t = v.t;
  if (nt.group !== undefined && t >= nt.group && t < nt.group + GROUP_LEN) {
    drawButterflies(c.g, c.now, (t - nt.group) / GROUP_LEN, 70, "#ffd0f0");
  }
  if (nt.zone !== undefined && s.reachAt !== undefined && t >= nt.zone && t < s.reachAt) drawZoneLabel(c, s.notices.zone === "red", t - nt.zone);
  if (nt.goldDoor !== undefined && t >= nt.goldDoor && t < nt.goldDoor + DOOR_LEN) drawGoldDoor(c, t - nt.goldDoor);
  const steps = nt.steps;
  if (steps.length && t >= steps[0] && t < steps[steps.length - 1] + STEP_GAP + STEP_HOLD) {
    let i = steps.length - 1;
    while (i > 0 && t < steps[i]) i--;
    const end = steps[steps.length - 1] + STEP_GAP + STEP_HOLD;
    drawStep(c, i, t - steps[i], 1 - span(t, end - 0.2, end));
  }
  if (nt.lumi !== undefined && t >= nt.lumi && t < nt.lumi + LUMI_LEN) drawLumi(c, t - nt.lumi);
  if (nt.logo !== undefined && t >= nt.logo && t < nt.logo + LOGO_LEN) drawLogo(c, s.notices.logo === "tilt", t - nt.logo);
  if (nt.gem !== undefined && t >= nt.gem && t < nt.gem + GEM_LEN) drawGoldGem(c, t - nt.gem);
  nt.countdown.forEach((at, i) => {
    if (t >= at && t < at + COUNT_LEN) drawCount(c, 3 - i, t - at);
  });
  if (s.revivalAt !== undefined && t >= s.revivalAt && t < s.stops[1] + 1.5) drawRevival(c, t - s.revivalAt);
}

function drawZoneLabel(c: SceneCtx, red: boolean, dt: number): void {
  const { g } = c;
  const k = easeOutBack(dt / 0.3);
  g.save();
  g.translate(150, 120);
  g.scale(k, k);
  g.fillStyle = red ? "rgba(60,0,10,0.6)" : "rgba(30,0,50,0.55)";
  g.beginPath();
  g.roundRect(-130, -34, 260, 68, 10);
  g.fill();
  const blink = red ? 0.75 + 0.25 * Math.sin(c.now * 12) : 1;
  g.globalAlpha = blink;
  text(g, "影の帳", 0, 2, { size: 44, fill: vGrad(g, -22, 22, red ? RED : ["#f6f0ff", "#c9a6ff", "#8a4dff"]), stroke: "#fff", strokeW: 5, outer: "#14061e", outerW: 12 });
  g.restore();
}

function drawGoldDoor(c: SceneCtx, dt: number): void {
  const { g } = c;
  // 0〜0.3 で閉まり、0.6 から開く
  const close = easeOut(dt / 0.3);
  const open = easeOut(span(dt, 0.6, DOOR_LEN));
  const half = W / 2;
  const off = (1 - close) * half + open * half;
  if (open > 0) {
    g.save();
    g.globalCompositeOperation = "lighter";
    const gr = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 600);
    gr.addColorStop(0, `rgba(255,236,160,${0.9 * (1 - open * 0.6)})`);
    gr.addColorStop(1, "rgba(255,180,40,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.restore();
  }
  for (const side of [-1, 1]) {
    g.save();
    const x0 = side < 0 ? -off : half + off;
    g.translate(x0, 0);
    g.fillStyle = vGrad(g, 0, H, ["#fff1b0", "#e0a020", "#8a5a00", "#e0a020"]);
    g.fillRect(0, 0, half, H);
    g.strokeStyle = "#fff6d0";
    g.lineWidth = 8;
    g.strokeRect(24, 24, half - 48, H - 48);
    g.lineWidth = 3;
    g.strokeRect(46, 46, half - 92, H - 92);
    // 扉の紋
    drawShadowSeal(g, side < 0 ? half - 20 : 20, H / 2, 150, side * 0.4, "#fff6d0", 0.8);
    g.restore();
  }
  // 閉じている間に走る光
  if (dt > 0.3 && dt < 0.6) {
    const k = (dt - 0.3) / 0.3;
    g.save();
    g.globalCompositeOperation = "lighter";
    const x = -200 + k * (W + 400);
    const gr = g.createLinearGradient(x - 120, 0, x + 120, 0);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.5, "rgba(255,255,255,0.7)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.restore();
  }
}

/** ステップアップ: 段ごとに灯守の武器を出し、枠と大きさを上げる */
function drawStep(c: SceneCtx, i: number, dt: number, fade: number): void {
  const { g } = c;
  const chara = CHARA_ORDER[i];
  const st = CHARA[chara];
  const k = easeOutBack(dt / 0.18);
  const size = 0.72 + i * 0.09;
  g.save();
  g.globalAlpha = fade;
  g.translate(W / 2, H * 0.44);
  g.scale(size * k, size * k);
  // 枠
  g.fillStyle = "rgba(8,0,20,0.72)";
  g.beginPath();
  g.roundRect(-260, -190, 520, 380, 30);
  g.fill();
  g.lineWidth = 14;
  g.strokeStyle = vGrad(g, -190, 190, [...STEP_FRAME[i]]);
  if (i >= 3) {
    g.shadowColor = i === 4 ? "#ffd040" : "#ff3050";
    g.shadowBlur = 40;
  }
  g.stroke();
  g.shadowBlur = 0;
  // 武器
  g.save();
  g.translate(0, 20);
  drawWeapon(g, chara, st.color);
  g.restore();
  text(g, `STEP ${i + 1}`, 0, -140, { size: 56, fill: vGrad(g, -168, -112, [...STEP_FRAME[i]]), stroke: "#fff", strokeW: 7, outer: "#14061e", outerW: 16 });
  text(g, st.name, 0, 150, { size: 46, fill: vGrad(g, 128, 172, [...st.grad]), stroke: "#fff", strokeW: 6, outer: "#14061e", outerW: 14 });
  g.restore();
  if (dt < 0.12) flash(g, i >= 3 ? "#ffe0a0" : "#ffffff", 0.35 * fade * (1 - dt / 0.12));
}

/** 武器の記号。灯の杖・和傘・輪刃・鈴・炎の籠手 */
function drawWeapon(g: G, chara: Chara, color: string): void {
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.lineCap = "round";
  g.lineJoin = "round";
  WEAPON[chara](g);
  g.restore();
}

/** 灯の杖: 長い杖の先に輪と灯 */
function drawStaff(g: G): void {
  g.rotate(Math.PI / 6);
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(0, 160);
  g.lineTo(0, -78);
  g.stroke();
  g.lineWidth = 7;
  g.beginPath();
  g.arc(0, -120, 42, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(0, -120, 18, 0, Math.PI * 2);
  g.fill();
  for (let j = 0; j < 6; j++) {
    const a = (j / 6) * Math.PI * 2;
    g.beginPath();
    g.arc(Math.cos(a) * 62, -120 + Math.sin(a) * 62, 5, 0, Math.PI * 2);
    g.fill();
  }
}

/** 和傘: 開いた傘と骨、曲がった柄 */
function drawUmbrella(g: G): void {
  g.rotate(-0.25);
  g.lineWidth = 8;
  g.beginPath();
  g.arc(0, -10, 130, Math.PI, Math.PI * 2);
  g.closePath();
  g.globalAlpha = 0.35;
  g.fill();
  g.globalAlpha = 1;
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  for (let j = 1; j < 8; j++) {
    const a = Math.PI + (j / 8) * Math.PI;
    g.moveTo(0, -10);
    g.lineTo(Math.cos(a) * 130, -10 + Math.sin(a) * 130);
  }
  g.stroke();
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(0, -150);
  g.lineTo(0, 130);
  g.arc(-22, 130, 22, 0, Math.PI * 0.9);
  g.stroke();
}

/** 輪刃: 外に刃の付いた輪 */
function drawChakram(g: G): void {
  const n = 12;
  g.beginPath();
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2;
    g.lineTo(Math.cos(a) * 92, Math.sin(a) * 92);
    g.lineTo(Math.cos(a + 0.12) * 130, Math.sin(a + 0.12) * 130);
    g.lineTo(Math.cos(a + 0.4) * 98, Math.sin(a + 0.4) * 98);
  }
  g.closePath();
  g.arc(0, 0, 70, 0, Math.PI * 2, true);
  g.fill("evenodd");
  g.lineWidth = 8;
  g.beginPath();
  g.arc(0, 0, 44, 0, Math.PI * 2);
  g.stroke();
}

/** 鈴とリボン: 上に蝶結び、垂れた 2 本の帯 */
function drawBell(g: G): void {
  // 垂れた帯
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(-6, -92);
  g.quadraticCurveTo(-70, -40, -60, 40);
  g.moveTo(6, -92);
  g.quadraticCurveTo(70, -40, 60, 40);
  g.stroke();
  // 鈴の本体（丸い鈴に横の帯と下の切れ目）
  g.beginPath();
  g.arc(0, 30, 82, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.shadowBlur = 0;
  g.fillStyle = "rgba(255,255,255,0.45)";
  g.beginPath();
  g.ellipse(-30, 0, 18, 30, -0.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(20,0,30,0.8)";
  g.fillRect(-80, 22, 160, 9);
  g.beginPath();
  g.arc(0, 64, 12, 0, Math.PI * 2);
  g.fill();
  g.fillRect(-4, 64, 8, 40);
  g.restore();
  // 蝶結び
  g.beginPath();
  g.moveTo(0, -78);
  g.bezierCurveTo(-60, -140, -120, -110, -96, -76);
  g.bezierCurveTo(-80, -52, -30, -64, 0, -78);
  g.moveTo(0, -78);
  g.bezierCurveTo(60, -140, 120, -110, 96, -76);
  g.bezierCurveTo(80, -52, 30, -64, 0, -78);
  g.fill();
  g.beginPath();
  g.arc(0, -78, 16, 0, Math.PI * 2);
  g.fill();
}

/** 炎の籠手: 指の節が並んだ拳と、上に立つ炎 */
function drawGauntlet(g: G): void {
  g.translate(0, -24);
  g.scale(0.85, 0.85);
  g.globalAlpha = 0.75;
  for (let j = 0; j < 5; j++) {
    const x = -80 + j * 40;
    const h = 120 - Math.abs(j - 2) * 22;
    g.beginPath();
    g.moveTo(x - 26, -50);
    g.quadraticCurveTo(x - 20, -50 - h * 0.6, x + 4, -50 - h);
    g.quadraticCurveTo(x + 6, -50 - h * 0.5, x + 26, -50);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
  // 指 4 本
  for (let j = 0; j < 4; j++) {
    g.beginPath();
    g.roundRect(-96 + j * 48, -60, 44, 70, 20);
    g.fill();
  }
  // 手の甲と親指
  g.beginPath();
  g.roundRect(-100, -10, 200, 90, 30);
  g.fill();
  g.beginPath();
  g.roundRect(-130, -20, 60, 70, 26);
  g.fill();
  // 手首の金具
  g.beginPath();
  g.roundRect(-84, 84, 168, 60, 12);
  g.fill();
  g.fillStyle = "rgba(20,0,10,0.7)";
  g.shadowBlur = 0;
  for (let j = 1; j < 4; j++) g.fillRect(-96 + j * 48 - 3, -56, 6, 46);
  g.fillRect(-84, 80, 168, 8);
  g.beginPath();
  g.arc(0, 114, 14, 0, Math.PI * 2);
  g.fill();
}

const WEAPON: Record<Chara, (g: G) => void> = {
  rose: drawStaff,
  violet: drawUmbrella,
  azure: drawChakram,
  amber: drawBell,
  scarlet: drawGauntlet,
};

/** ルミの激熱予告: 暗転した中にランタンの妖精が羽を広げて現れる */
function drawLumi(c: SceneCtx, dt: number): void {
  const { g } = c;
  const fade = 1 - span(dt, LUMI_LEN - 0.2, LUMI_LEN);
  g.save();
  g.globalAlpha = fade;
  g.fillStyle = `rgba(0,0,0,${0.8 * span(dt, 0, 0.1)})`;
  g.fillRect(0, 0, W, H);
  const open = easeOutBack(span(dt, 0.08, 0.3));
  const flap = 1 - 0.12 * (0.5 + 0.5 * Math.sin(c.now * 18));
  g.save();
  g.translate(W / 2, H * 0.36 + Math.sin(c.now * 3) * 8);
  g.globalCompositeOperation = "lighter";
  const halo = g.createRadialGradient(0, 0, 10, 0, 0, 300);
  halo.addColorStop(0, "rgba(255,140,60,0.55)");
  halo.addColorStop(1, "rgba(255,40,40,0)");
  g.fillStyle = halo;
  g.fillRect(-320, -320, 640, 640);
  g.globalCompositeOperation = "source-over";
  // 羽（上の大きい 2 枚と下の小さい 2 枚）
  g.shadowColor = "#ff5030";
  g.shadowBlur = 40;
  for (const side of [-1, 1]) {
    g.save();
    g.scale(side * Math.max(0.02, open * flap), Math.max(0.02, open));
    for (const [ax, ay, rx, ry, rot] of WING) {
      const gr = g.createRadialGradient(ax * 0.6, ay * 0.6, 4, ax, ay, rx);
      gr.addColorStop(0, "rgba(255,240,200,0.95)");
      gr.addColorStop(0.5, "rgba(255,120,60,0.8)");
      gr.addColorStop(1, "rgba(160,0,30,0.15)");
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(ax, ay, rx, ry, rot, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  // 体と触角
  g.shadowColor = "#ffd080";
  g.shadowBlur = 30;
  g.strokeStyle = "#ffe0a0";
  g.lineWidth = 4;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(-10, -50);
  g.quadraticCurveTo(-30, -110, -60, -120);
  g.moveTo(10, -50);
  g.quadraticCurveTo(30, -110, 60, -120);
  g.stroke();
  const body = g.createRadialGradient(-8, -14, 2, 0, 0, 52);
  body.addColorStop(0, "#ffffff");
  body.addColorStop(0.5, "#ffe08a");
  body.addColorStop(1, "#ff8030");
  g.fillStyle = body;
  g.beginPath();
  g.ellipse(0, 0, 34, 52, 0, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = "#3a0010";
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(side * 12, -14, 6, 9, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  if (dt > 0.3) {
    const k = easeOutBack(span(dt, 0.3, 0.5));
    g.translate(W / 2 + Math.sin(c.now * 70) * 3, H * 0.74);
    g.scale(k, k);
    text(g, "激熱!!", 0, 0, { size: 150, fill: vGrad(g, -70, 70, RED), stroke: "#fff", strokeW: 14, outer: "#2a0008", outerW: 34, glow: "#ff2040" });
  }
  g.restore();
}

/** ルミの羽。右側の [中心 x, 中心 y, 半径 x, 半径 y, 傾き]。左は鏡に映す */
const WING = [
  [120, -60, 130, 80, -0.5],
  [90, 70, 80, 52, 0.55],
] as const;

/** ロゴが落ちてくる。tilt は落ちた後に傾いて金に光る */
function drawLogo(c: SceneCtx, tilt: boolean, dt: number): void {
  const { g } = c;
  const drop = easeOutBack(dt / 0.4);
  const fade = 1 - span(dt, LOGO_LEN - 0.3, LOGO_LEN);
  const lean = tilt ? easeOutBack(span(dt, 0.6, 0.9)) * -0.18 : 0;
  g.save();
  g.globalAlpha = fade;
  g.translate(W / 2, -160 + drop * 330);
  g.rotate(lean);
  const golden = tilt && dt > 0.6;
  text(g, "灯守少女", 0, -70, { size: 56, fill: vGrad(g, -98, -42, golden ? GOLD : SILVER), stroke: "#fff", strokeW: 6, outer: "#2a0a3a", outerW: 14 });
  text(g, "LANTERNA", 0, 20, {
    size: 150,
    fill: golden ? vGrad(g, -55, 95, GOLD) : vGrad(g, -55, 95, ["#fff0fa", "#ff9fd2", "#c03d9a", "#4a0848"]),
    stroke: "#fff",
    strokeW: 12,
    outer: "#2a0a3a",
    outerW: 28,
    glow: golden ? "#ffd040" : "#ff9fd2",
  });
  g.restore();
}

/** ランタンが金に光る */
function drawGoldGem(c: SceneCtx, dt: number): void {
  const { g } = c;
  const k = easeOutBack(dt / 0.35);
  const fade = 1 - span(dt, GEM_LEN - 0.3, GEM_LEN);
  g.save();
  g.globalAlpha = fade;
  sunburst(g, W / 2, H * 0.42, 700, 20, c.now * 0.8, "rgba(255,220,120,0.25)");
  drawLantern(g, W / 2, H * 0.42, 130 * k, GOLD, 1);
  sparkles(g, c.now, 30, "#fff7c0", 60, 4);
  g.restore();
  flash(g, "#fff2c0", 0.7 * (1 - span(dt, 0, 0.3)));
}

function drawCount(c: SceneCtx, n: number, dt: number): void {
  const { g } = c;
  const k = easeOutBack(dt / 0.2);
  const fade = 1 - span(dt, COUNT_LEN - 0.25, COUNT_LEN);
  g.save();
  g.globalAlpha = fade;
  g.translate(W / 2, H * 0.4);
  // 縮む輪
  g.strokeStyle = n === 1 ? "#ff3050" : "#ffd040";
  g.lineWidth = 10;
  g.shadowColor = g.strokeStyle;
  g.shadowBlur = 30;
  g.beginPath();
  g.arc(0, 0, 260 - 140 * easeOut(dt / COUNT_LEN), 0, Math.PI * 2);
  g.stroke();
  g.shadowBlur = 0;
  g.scale(k, k);
  text(g, String(n), 0, 0, { size: 240, fill: vGrad(g, -110, 110, n === 1 ? RED : GOLD), stroke: "#fff", strokeW: 16, outer: "#1a0610", outerW: 40 });
  g.restore();
}

/** 復活: ハズレ目で暗く沈めてから、光って「復活!!」 */
function drawRevival(c: SceneCtx, dt: number): void {
  const { g } = c;
  if (dt < REVIVAL_UP) {
    g.save();
    g.fillStyle = `rgba(6,6,20,${0.55 * span(dt, 0, 0.4)})`;
    g.fillRect(0, 0, W, H);
    if (dt > 0.5) {
      g.globalAlpha = span(dt, 0.5, 0.9);
      text(g, "……", W / 2, H * 0.3, { size: 90, fill: "#9aa0b8", stroke: "#0a0a18", strokeW: 10 });
    }
    // 復活の直前に走るひび
    if (dt > REVIVAL_UP - 0.35) {
      const k = span(dt, REVIVAL_UP - 0.35, REVIVAL_UP);
      g.globalAlpha = 1;
      g.strokeStyle = "rgba(255,240,200,0.95)";
      g.lineWidth = 4;
      g.shadowColor = "#ffd060";
      g.shadowBlur = 20;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + hash(i + 40) * 0.5;
        g.beginPath();
        g.moveTo(W / 2, H / 2);
        g.lineTo(W / 2 + Math.cos(a) * 560 * k, H / 2 + Math.sin(a) * 560 * k);
        g.stroke();
      }
    }
    g.restore();
    return;
  }
  const u = dt - REVIVAL_UP;
  flash(g, "#ffffff", 1 - span(u, 0, 0.5));
  if (u > 2.6) return;
  g.save();
  g.globalAlpha = 1 - span(u, 2.2, 2.6);
  sunburst(g, W / 2, H * 0.4, 900, 24, c.now * 0.7, "rgba(255,230,140,0.22)");
  const k = easeOutBack(u / 0.3);
  g.translate(W / 2 + Math.sin(c.now * 50) * (u < 0.5 ? 5 : 0), H * 0.36);
  g.scale(2.6 - 1.6 * k, 2.6 - 1.6 * k);
  text(g, "復活!!", 0, 0, { size: 180, fill: rainbow(g, -300, 300, c.now * 0.8), stroke: "#fff", strokeW: 16, outer: "#1a0630", outerW: 40, glow: "#fff" });
  g.restore();
}
