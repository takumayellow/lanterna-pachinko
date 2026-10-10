import type { Bonus } from "../game/lottery";
import type { Jackpot } from "../game/machine";
import { SPEC, isStMode, spinsFor, stContinueRate } from "../game/spec";
import { drawChara } from "./charaArt";
import {
  GOLD,
  H,
  PINK,
  SILVER,
  W,
  confetti,
  easeOut,
  easeOutBack,
  flash,
  rainbow,
  span,
  sparkles,
  stripes,
  sunburst,
  text,
  vGrad,
} from "./paint";
import { CHARA, drawLantern, drawShadowSeal, roundChara } from "./heroines";
import type { SceneCtx } from "./spinScene";
import { SYM_H, SYM_W } from "./sprites";

/** 大当たり中の液晶（オープニング・ラウンド・エンディング） */

/** エンディングで RUSH 昇格を明かす時刻 */
export const PROMOTE_AT = 2.4;

export interface JackpotView {
  jackpot: Jackpot;
  /** 今の RUSH が何連目か（RUSH 中の当たりなら 1 以上） */
  chain: number;
}

const BONUS_NAME: Record<Bonus, string> = {
  lantern: "灯守BONUS",
  challenge: "チャレンジBONUS",
  aurora: "オーロラBONUS",
  upper: "超RUSH 3000発",
  lower: "超RUSH",
};

export function drawJackpot(c: SceneCtx, v: JackpotView): void {
  const j = v.jackpot;
  if (j.phase === "opening") drawOpening(c, v);
  else if (j.phase === "ending") drawEnding(c, v);
  else drawRound(c, v);
}

function drawOpening(c: SceneCtx, v: JackpotView): void {
  const { g } = c;
  const j = v.jackpot;
  const r = j.result;
  const t = j.t;
  g.save();
  g.globalCompositeOperation = "lighter";
  sunburst(g, W / 2, H * 0.4, 900, 28, c.now * 0.5, "rgba(255,255,255,0.22)");
  g.globalAlpha = 0.2;
  g.fillStyle = rainbow(g, 0, W, c.now * 0.2);
  g.fillRect(0, 0, W, H);
  g.restore();
  confetti(g, c.now, 70);

  // 当たった図柄を真ん中に大きく
  const k = easeOutBack(t / 0.4);
  const sym = c.sprites.sharp[r.number];
  const bob = Math.sin(c.now * 4) * 8;
  for (let i = -1; i <= 1; i++) {
    const s = 0.82 * k;
    g.drawImage(sym, W / 2 + i * 240 - (SYM_W * s) / 2, 300 + bob - (SYM_H * s) / 2, SYM_W * s, SYM_H * s);
  }

  g.save();
  const tk = easeOutBack(span(t, 0.2, 0.55));
  g.translate(W / 2, 110);
  g.scale(tk, tk);
  text(g, "大当たり", 0, 0, { size: 140, fill: rainbow(g, -300, 300, c.now * 0.8), stroke: "#fff", strokeW: 16, outer: "#200840", outerW: 36, glow: "#fff" });
  g.restore();

  if (t >= 1.4) {
    const sk = easeOutBack(span(t, 1.4, 1.7));
    const rush = isStMode(r.next) && !r.promote;
    const line = r.bonus ? `${BONUS_NAME[r.bonus]}!!` : `${r.rounds}R 大当たり`;
    g.save();
    g.translate(W / 2, 520);
    g.scale(sk, sk);
    text(g, line, 0, 0, {
      size: rush || r.next === "lt" ? 84 : 76,
      fill: vGrad(g, -40, 40, rush ? PINK : GOLD),
      stroke: "#fff",
      strokeW: 10,
      outer: "#2a0620",
      outerW: 24,
    });
    if (rush) text(g, `${r.rounds}R`, 0, 82, { size: 54, fill: vGrad(g, 60, 104, GOLD), stroke: "#fff", strokeW: 7, outer: "#3a1800", outerW: 16 });
    g.restore();
  }
  if (t >= 2.6) drawRightArrow(c, 660, span(t, 2.6, 2.9));
}

function drawRound(c: SceneCtx, v: JackpotView): void {
  const { g } = c;
  const j = v.jackpot;
  const r = j.result;
  stripes(g, "rgba(255,255,255,0.06)", 46, c.now * 60);
  sparkles(g, c.now, 40, "#ffe9ff", 40, 5);
  confetti(g, c.now, 24);

  // 当たり図柄の番号で決まる灯守が影の帳の上で弾む
  const key = roundChara(r.number);
  const ch = CHARA[key];
  const hop = Math.abs(Math.sin(c.now * 3)) * 12;
  drawShadowSeal(g, W * 0.76, H * 0.42, 250, c.now * 0.3, ch.color, 0.5);
  if (!drawChara(g, key, W * 0.78, H * 0.26 - hop, 600)) drawLantern(g, W * 0.76, H * 0.42 - hop * 1.5, 130, ch.grad, 0.9);
  text(g, ch.name, W * 0.76, H * 0.42 + 200, { size: 56, fill: vGrad(g, H * 0.42 + 172, H * 0.42 + 228, [...ch.grad]), stroke: "#fff", strokeW: 8, outer: "#14061e", outerW: 18 });

  // 情報パネル（半透明。奥の背景を残す）
  g.save();
  g.fillStyle = "rgba(20,0,36,0.5)";
  g.beginPath();
  g.roundRect(36, 30, 600, 640, 30);
  g.fill();
  g.restore();

  // ラウンド表示
  text(g, "ROUND", 70, 70, { size: 46, fill: vGrad(g, 50, 90, SILVER), stroke: "#2a0a4a", strokeW: 10, align: "left" });
  const pop = easeOutBack(span(j.t, 0, 0.3));
  g.save();
  g.translate(150, 210);
  g.scale(j.phase === "open" ? pop : 1, j.phase === "open" ? pop : 1);
  text(g, String(j.round), 0, 0, { size: 200, fill: vGrad(g, -90, 90, GOLD), stroke: "#fff", strokeW: 14, outer: "#3a1000", outerW: 32 });
  g.restore();
  text(g, `/ ${r.rounds}`, 260, 250, { size: 64, fill: "#ffe9ff", stroke: "#2a0a4a", strokeW: 10, align: "left" });

  // カウント（1 ラウンド 10 個）
  const count = j.phase === "open" ? j.count : SPEC.roundCount;
  for (let i = 0; i < SPEC.roundCount; i++) {
    const x = 80 + i * 52;
    const on = i < count;
    g.beginPath();
    g.arc(x, 400, 20, 0, Math.PI * 2);
    g.fillStyle = on ? "#fff4b0" : "rgba(255,255,255,0.12)";
    if (on) {
      g.save();
      g.shadowColor = "#ffcf40";
      g.shadowBlur = 20;
      g.fill();
      g.restore();
    } else g.fill();
  }
  text(g, `COUNT ${Math.min(count, SPEC.roundCount)}/${SPEC.roundCount}`, 80, 455, { size: 36, fill: "#fff", stroke: "#2a0a4a", strokeW: 8, align: "left" });

  // 獲得玉数
  g.save();
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.beginPath();
  g.roundRect(50, 540, 560, 110, 26);
  g.fill();
  g.restore();
  text(g, "獲得", 80, 595, { size: 44, fill: "#ffd6f0", stroke: "#2a0a4a", strokeW: 8, align: "left" });
  text(g, `${j.payout.toLocaleString("ja-JP")}`, 500, 595, { size: 76, fill: vGrad(g, 560, 630, GOLD), stroke: "#fff", strokeW: 8, outer: "#3a1000", outerW: 18, align: "right" });
  text(g, "玉", 520, 600, { size: 40, fill: "#ffd6f0", stroke: "#2a0a4a", strokeW: 8, align: "left" });

  if (v.chain > 0) {
    text(g, `RUSH ${v.chain}連目`, 70, 515, { size: 40, fill: vGrad(g, 495, 535, PINK), stroke: "#fff", strokeW: 6, outer: "#2a0620", outerW: 14, align: "left" });
  }
  if (j.phase === "interval") {
    text(g, "NEXT ROUND", W * 0.36, 330, { size: 52, fill: vGrad(g, 305, 355, GOLD), stroke: "#fff", strokeW: 7, outer: "#3a1000", outerW: 16 });
  }
}

function drawEnding(c: SceneCtx, v: JackpotView): void {
  const { g } = c;
  const j = v.jackpot;
  const r = j.result;
  const t = j.t;
  const revealed = !r.promote || t >= PROMOTE_AT;
  const next = revealed ? r.next : "normal";

  if (next === "normal") {
    g.fillStyle = "rgba(4,20,24,0.55)";
    g.fillRect(0, 0, W, H);
  } else {
    g.save();
    g.globalCompositeOperation = "lighter";
    sunburst(g, W / 2, H * 0.45, 900, 26, c.now * 0.4, next === "lt" ? "rgba(255,210,80,0.35)" : "rgba(255,110,190,0.3)");
    g.restore();
    confetti(g, c.now, 60);
  }
  if (r.promote && t >= PROMOTE_AT) flash(g, "#ffffff", 1 - span(t, PROMOTE_AT, PROMOTE_AT + 0.6));

  text(g, "TOTAL", W / 2, 90, { size: 48, fill: vGrad(g, 70, 110, SILVER), stroke: "#200840", strokeW: 10 });
  const n = Math.round(j.payout * easeOut(span(t, 0, 1)));
  text(g, `${n.toLocaleString("ja-JP")} 玉`, W / 2, 180, { size: 100, fill: vGrad(g, 135, 225, GOLD), stroke: "#fff", strokeW: 10, outer: "#3a1000", outerW: 24 });

  const label =
    next === "lt" ? (v.chain > 1 ? "超RUSH 継続!!" : "超RUSH 突入!!") : next === "rush" ? "灯火RUSH!!" : revealed ? "チャレンジ失敗" : "チャレンジBONUS";
  const start = r.promote && revealed ? PROMOTE_AT : 0.6;
  const k = easeOutBack(span(t, start, start + 0.35));
  g.save();
  g.translate(W / 2, 420);
  g.scale(k, k);
  text(g, label, 0, 0, {
    size: next === "normal" ? 100 : 118,
    fill: next === "normal" ? vGrad(g, -50, 50, ["#f0fff8", "#7affc8", "#14a070"]) : rainbow(g, -400, 400, c.now * 0.7),
    stroke: "#fff",
    strokeW: 14,
    outer: "#14061e",
    outerW: 32,
    glow: next === "normal" ? undefined : "#fff",
  });
  g.restore();
  if (t >= start + 0.5) {
    const sub =
      next === "rush" || next === "lt" ? `ST ${spinsFor(next)}回 ・ 継続率 約${Math.round(stContinueRate(next) * 100)}%` : "また狙ってね";
    text(g, sub, W / 2, 540, { size: 52, fill: "#fff", stroke: "#14061e", strokeW: 10 });
  }
  if (next !== "normal" && t >= start + 0.8) drawRightArrow(c, 650, span(t, start + 0.8, start + 1.1));
}

function drawRightArrow(c: SceneCtx, y: number, k: number): void {
  const { g } = c;
  g.save();
  g.globalAlpha = k * (0.7 + 0.3 * Math.sin(c.now * 10));
  text(g, "右打ちしてね", W / 2 - 60, y, { size: 58, fill: vGrad(g, y - 30, y + 30, GOLD), stroke: "#fff", strokeW: 7, outer: "#3a1000", outerW: 18 });
  for (let i = 0; i < 3; i++) {
    const x = W / 2 + 180 + i * 48 + ((c.now * 120) % 48);
    g.fillStyle = "#ffe066";
    g.beginPath();
    g.moveTo(x, y - 24);
    g.lineTo(x + 26, y);
    g.lineTo(x, y + 24);
    g.closePath();
    g.fill();
  }
  g.restore();
}
