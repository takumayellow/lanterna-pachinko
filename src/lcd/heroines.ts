import type { Chara } from "../game/scenario";
import { BLUE, GOLD, PINK, RED, hash, type G } from "./paint";

/**
 * 液晶で使う灯守のモチーフ（色・ランタン・影の帳の紋様）。立ち絵は charaArt.ts の同梱の絵で、
 * 読めるまではここのランタンで代わりをする。
 */

export const PURPLE = ["#f6f0ff", "#c9a6ff", "#8a4dff", "#3a1080"];

export interface CharaStyle {
  name: string;
  /** 光や帯に使う代表色 */
  color: string;
  /** 文字とジェムのグラデーション（明 → 暗） */
  grad: readonly string[];
}

export const CHARA: Record<Chara, CharaStyle> = {
  rose: { name: "こはる", color: "#ff6fb5", grad: PINK },
  violet: { name: "すみれ", color: "#a070ff", grad: PURPLE },
  azure: { name: "しずく", color: "#4a9cff", grad: BLUE },
  amber: { name: "ゆずは", color: "#ffcc33", grad: GOLD },
  scarlet: { name: "あかね", color: "#ff4040", grad: RED },
};

export const CHARA_ORDER: readonly Chara[] = ["rose", "violet", "azure", "amber", "scarlet"];

/** 大当たりのラウンドを受け持つ灯守（当たり図柄の番号で決まる） */
export function roundChara(number: number): Chara {
  return CHARA_ORDER[number % CHARA_ORDER.length];
}

/**
 * ランタン: 色ガラスの火袋に金の笠と提げ輪、下に台。中で炎が灯る。glow は周りの光の強さ（0..1）。
 * 高さはおよそ -1.5r（提げ輪の上）〜 1.05r（台の下）
 */
export function drawLantern(g: G, x: number, y: number, r: number, grad: readonly string[], glow = 0.5): void {
  g.save();
  g.translate(x, y);
  if (glow > 0) {
    g.save();
    g.globalCompositeOperation = "lighter";
    const halo = g.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.8);
    halo.addColorStop(0, grad[1]);
    halo.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = Math.min(1, glow);
    g.fillStyle = halo;
    g.fillRect(-r * 3, -r * 3, r * 6, r * 6);
    g.restore();
  }
  const metal = g.createLinearGradient(0, -r * 1.5, 0, r * 1.05);
  metal.addColorStop(0, "#fff6c0");
  metal.addColorStop(0.5, "#e0b040");
  metal.addColorStop(1, "#8a5a08");
  // 提げ輪
  g.strokeStyle = metal;
  g.lineWidth = r * 0.09;
  g.beginPath();
  g.arc(0, -r * 1.28, r * 0.2, Math.PI * 0.85, Math.PI * 2.15);
  g.stroke();
  // 火袋（色ガラス）
  const body = g.createRadialGradient(-r * 0.2, -r * 0.3, r * 0.05, 0, 0, r * 0.95);
  body.addColorStop(0, grad[0]);
  body.addColorStop(0.35, grad[1]);
  body.addColorStop(0.75, grad[2]);
  body.addColorStop(1, grad[3]);
  g.beginPath();
  g.moveTo(-r * 0.42, -r * 0.8);
  g.bezierCurveTo(-r * 0.78, -r * 0.5, -r * 0.78, r * 0.5, -r * 0.42, r * 0.8);
  g.lineTo(r * 0.42, r * 0.8);
  g.bezierCurveTo(r * 0.78, r * 0.5, r * 0.78, -r * 0.5, r * 0.42, -r * 0.8);
  g.closePath();
  g.fillStyle = body;
  g.fill();
  g.save();
  g.clip();
  // 炎
  g.globalCompositeOperation = "lighter";
  const fire = g.createRadialGradient(0, r * 0.12, 0, 0, r * 0.05, r * 0.42);
  fire.addColorStop(0, "#ffffff");
  fire.addColorStop(0.4, "#fff2b0");
  fire.addColorStop(1, "rgba(255,180,60,0)");
  g.fillStyle = fire;
  g.beginPath();
  g.moveTo(0, -r * 0.32);
  g.bezierCurveTo(r * 0.24, -r * 0.02, r * 0.2, r * 0.36, 0, r * 0.38);
  g.bezierCurveTo(-r * 0.2, r * 0.36, -r * 0.24, -r * 0.02, 0, -r * 0.32);
  g.fill();
  g.globalCompositeOperation = "source-over";
  // 枠の縦桟と映り込み
  g.strokeStyle = metal;
  g.lineWidth = r * 0.05;
  g.beginPath();
  for (const k of [-0.5, 0.5]) {
    g.moveTo(k * r * 0.84, -r * 0.8);
    g.quadraticCurveTo(k * r * 1.42, 0, k * r * 0.84, r * 0.8);
  }
  g.stroke();
  g.globalAlpha = 0.8;
  g.fillStyle = "#fff";
  g.beginPath();
  g.ellipse(-r * 0.36, -r * 0.3, r * 0.07, r * 0.26, 0.15, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.lineWidth = r * 0.06;
  g.strokeStyle = metal;
  g.stroke();
  // 笠と台
  g.fillStyle = metal;
  g.beginPath();
  g.moveTo(-r * 0.56, -r * 0.76);
  g.lineTo(-r * 0.2, -r * 1.08);
  g.lineTo(r * 0.2, -r * 1.08);
  g.lineTo(r * 0.56, -r * 0.76);
  g.closePath();
  g.fill();
  g.beginPath();
  g.ellipse(0, -r * 1.1, r * 0.12, r * 0.07, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(-r * 0.5, r * 0.76);
  g.lineTo(r * 0.5, r * 0.76);
  g.lineTo(r * 0.36, r * 1.02);
  g.lineTo(-r * 0.36, r * 1.02);
  g.closePath();
  g.fill();
  g.restore();
}

/** 影の帳の紋様: 回る二重の輪と、輪に沿って並ぶ記号 */
export function drawShadowSeal(g: G, x: number, y: number, r: number, rot: number, color: string, alpha: number): void {
  if (alpha <= 0) return;
  g.save();
  g.translate(x, y);
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 18;
  for (const [rr, dir, n] of [
    [r, 1, 24],
    [r * 0.72, -1.6, 16],
  ] as const) {
    g.save();
    g.rotate(rot * dir);
    g.lineWidth = r * 0.012;
    g.beginPath();
    g.arc(0, 0, rr, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, rr * 0.9, 0, Math.PI * 2);
    g.stroke();
    // 輪の間の記号
    g.lineWidth = r * 0.01;
    for (let i = 0; i < n; i++) {
      g.save();
      g.rotate((i / n) * Math.PI * 2);
      g.translate(0, -rr * 0.95);
      const s = rr * 0.035;
      const h = hash(i * 3.7 + rr);
      g.beginPath();
      if (h < 0.33) {
        g.moveTo(-s, s);
        g.lineTo(0, -s);
        g.lineTo(s, s);
      } else if (h < 0.66) {
        g.arc(0, 0, s * 0.8, 0, Math.PI * 1.5);
        g.moveTo(0, -s);
        g.lineTo(0, s);
      } else {
        g.moveTo(-s, -s);
        g.lineTo(s, s);
        g.moveTo(s, -s);
        g.lineTo(-s, s);
      }
      g.stroke();
      g.restore();
    }
    g.restore();
  }
  // 中の星形
  g.rotate(-rot * 0.5);
  g.lineWidth = r * 0.01;
  g.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const px = Math.cos(a) * r * 0.6;
    const py = Math.sin(a) * r * 0.6;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke();
  g.restore();
}

/** 群予告の蝶。k は 0..1 で画面を左下から右上へ横切る */
export function drawButterflies(g: G, now: number, k: number, n: number, color: string): void {
  g.save();
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 12;
  for (let i = 0; i < n; i++) {
    const h1 = hash(i * 1.3);
    const h2 = hash(i * 7.1 + 2);
    const p = k * 1.6 - h1 * 0.6;
    if (p < 0 || p > 1) continue;
    const x = -80 + p * 1200 + Math.sin(now * 3 + i) * 30;
    const y = 820 - p * 900 + (h2 - 0.5) * 520;
    const s = 10 + h2 * 16;
    const flap = Math.abs(Math.sin(now * 18 + i * 2));
    g.save();
    g.translate(x, y);
    g.rotate(-0.7 + (h1 - 0.5) * 0.5);
    g.globalAlpha = 0.85;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.ellipse(side * s * 0.55 * flap, -s * 0.3, s * 0.6 * flap + 1, s * 0.75, side * 0.5, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(side * s * 0.4 * flap, s * 0.45, s * 0.4 * flap + 1, s * 0.45, side * -0.4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  g.restore();
}
