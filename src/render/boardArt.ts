import { BOARD_R, INNER_RAIL_END_DEG, INNER_RAIL_IN, RAIL_START_DEG, type BoardLayout } from "../sim/board";
import { mulberry32 } from "../game/rng";
import { CHARA, CHARA_ORDER, drawLantern, drawShadowSeal } from "../lcd/heroines";
import { FONT } from "./font";

/**
 * 盤面に印刷された絵柄。実機の盤面はセル板に絵を刷った合板なので、
 * 釘や役物は 3D で立て、絵柄はこのテクスチャ 1 枚で描く。
 */
export const ART_SIZE = 2048;
/** テクスチャが覆う範囲 [mm]（-ART_HALF..ART_HALF の正方形） */
export const ART_HALF = 250;

const S = ART_SIZE / (ART_HALF * 2);
const cx = (x: number) => (x + ART_HALF) * S;
const cy = (y: number) => (ART_HALF - y) * S;

export function drawBoardArt(layout: BoardLayout): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = ART_SIZE;
  const g = c.getContext("2d")!;
  const rand = mulberry32(20261008);

  // 地: 影の帳の暗い紫 → 黒に近い紺
  const bg = g.createLinearGradient(0, 0, 0, ART_SIZE);
  bg.addColorStop(0, "#3a1660");
  bg.addColorStop(0.45, "#22104a");
  bg.addColorStop(1, "#0c0a2a");
  g.fillStyle = bg;
  g.fillRect(0, 0, ART_SIZE, ART_SIZE);

  // センター役物の後光
  const halo = g.createRadialGradient(cx(0), cy(30), 40 * S, cx(0), cy(30), 230 * S);
  halo.addColorStop(0, "rgba(255,214,110,0.55)");
  halo.addColorStop(0.5, "rgba(255,140,190,0.18)");
  halo.addColorStop(1, "rgba(255,140,190,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, ART_SIZE, ART_SIZE);

  // 桃色と紫の帯（左下から右上へ）
  ribbon(g, [
    [-240, -150],
    [-120, -60],
    [40, -190],
    [240, -40],
  ], 34, "rgba(255,111,181,0.5)", "rgba(255,214,236,0.75)");
  ribbon(g, [
    [-240, 170],
    [-140, 210],
    [60, 230],
    [240, 150],
  ], 22, "rgba(160,112,255,0.4)", "rgba(220,200,255,0.55)");

  // 影の帳の紋様を右ルートと左下に薄く刷る
  drawShadowSeal(g, cx(150), cy(-120), 105 * S, 0.3, "#d8b0ff", 0.35);
  drawShadowSeal(g, cx(-170), cy(-60), 70 * S, -0.5, "#ff9fd2", 0.25);

  // 五人のランタンを上の飾りに並べる
  CHARA_ORDER.forEach((k, i) => {
    const a = Math.PI * (0.25 + (i / (CHARA_ORDER.length - 1)) * 0.5);
    drawLantern(g, cx(Math.cos(a) * -205), cy(Math.sin(a) * 205), 11 * S, CHARA[k].grad, 0.35);
  });

  // きらめき
  for (let i = 0; i < 170; i++) {
    const x = (rand() - 0.5) * 480;
    const y = (rand() - 0.5) * 480;
    sparkle(g, cx(x), cy(y), (1.2 + rand() * 3.5) * S, rand() < 0.3 ? "#ffe9a8" : "#ffffff", 0.25 + rand() * 0.6);
  }

  // 発射レール（内レールと外レールの間）は暗く塗る
  g.save();
  g.beginPath();
  const a0 = (-RAIL_START_DEG * Math.PI) / 180;
  const a1 = (-INNER_RAIL_END_DEG * Math.PI) / 180;
  g.arc(cx(0), cy(0), BOARD_R * S, a1, a0, true);
  g.arc(cx(0), cy(0), INNER_RAIL_IN * S, a0, a1, false);
  g.closePath();
  g.fillStyle = "rgba(10,8,30,0.55)";
  g.fill();
  g.restore();

  // 外レールの外側
  g.save();
  g.beginPath();
  g.rect(0, 0, ART_SIZE, ART_SIZE);
  g.arc(cx(0), cy(0), (BOARD_R + 1) * S, 0, Math.PI * 2, true);
  g.fillStyle = "#0d0a22";
  g.fill("evenodd");
  g.restore();

  // 印刷の文字
  label(g, "右打ち", 168, 128, 15, "#fff3b0", -0.22);
  arrow(g, 150, 108, 196, 96, "#fff3b0");
  label(g, "START", 0, -146, 6.5, "#ffe27a");
  label(g, "V", 145, -158, 9, "#ff7a9a");
  label(g, "電チュー", 160, -62, 5.5, "#9ff3ff");
  label(g, "GATE", 200, 70, 5.5, "#9ff3ff");
  label(g, "OUT", 0, -214, 7, "#8890c0");
  for (const s of layout.sensors) {
    if (s.kind === "pocket") label(g, "3", (s.x0 + s.x1) / 2, s.y0 - 9, 6, "#ffd2e4");
  }

  // ヘソ周りのハカマ（受けの台座）
  g.save();
  g.fillStyle = "rgba(255,226,122,0.18)";
  g.beginPath();
  g.ellipse(cx(0), cy(-130), 22 * S, 12 * S, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  return c;
}

function ribbon(g: CanvasRenderingContext2D, pts: number[][], width: number, fill: string, edge: string): void {
  g.save();
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(cx(pts[0][0]), cy(pts[0][1]));
  g.bezierCurveTo(cx(pts[1][0]), cy(pts[1][1]), cx(pts[2][0]), cy(pts[2][1]), cx(pts[3][0]), cy(pts[3][1]));
  g.strokeStyle = fill;
  g.lineWidth = width * S;
  g.stroke();
  g.strokeStyle = edge;
  g.lineWidth = 1.6 * S;
  g.setLineDash([10 * S, 6 * S]);
  g.stroke();
  g.restore();
}

function sparkle(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - r * 2);
  g.quadraticCurveTo(x, y, x + r * 2, y);
  g.quadraticCurveTo(x, y, x, y + r * 2);
  g.quadraticCurveTo(x, y, x - r * 2, y);
  g.quadraticCurveTo(x, y, x, y - r * 2);
  g.fill();
  g.restore();
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, rot = 0): void {
  g.save();
  g.translate(cx(x), cy(y));
  g.rotate(rot);
  g.font = `${size * S}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = size * S * 0.22;
  g.strokeStyle = "rgba(20,10,50,0.85)";
  g.strokeText(text, 0, 0);
  g.fillStyle = color;
  g.fillText(text, 0, 0);
  g.restore();
}

function arrow(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string): void {
  const ang = Math.atan2(cy(y1) - cy(y0), cx(x1) - cx(x0));
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 4 * S;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(cx(x0), cy(y0));
  g.lineTo(cx(x1), cy(y1));
  g.stroke();
  g.translate(cx(x1), cy(y1));
  g.rotate(ang);
  g.beginPath();
  g.moveTo(6 * S, 0);
  g.lineTo(-8 * S, 7 * S);
  g.lineTo(-8 * S, -7 * S);
  g.closePath();
  g.fill();
  g.restore();
}
