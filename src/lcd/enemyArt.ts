import type { G } from "./paint";

/**
 * バトルの敵の絵（public/art/enemy/、全身・背景は透過）。読めるまでは描かずに false を返すので、
 * 呼ぶ側はそれまで影の紋で代わりをする。
 *
 * 敵の色の光で縁取った版と、攻撃を受けた瞬間に重ねる白い影の版を作って持つ。
 */

export type Enemy = "storm" | "abyss" | "shade";
export const ENEMIES: readonly Enemy[] = ["storm", "abyss", "shade"];

/** 縁の光の色 */
export const ENEMY_GLOW: Record<Enemy, string> = { storm: "#ff3070", abyss: "#60b8ff", shade: "#ff6a5a" };
/** 作り置きの高さ。液晶では最大でもこのくらいでしか描かない */
const BAKE_H = 640;
const GLOW = 26;

export interface EnemySprite {
  img: HTMLCanvasElement;
  /** 白一色の影（被弾の光に使う） */
  white: HTMLCanvasElement;
}

const ready = new Map<Enemy, EnemySprite>();
let started = false;

function bake(enemy: Enemy, src: HTMLImageElement): EnemySprite {
  const s = BAKE_H / src.naturalHeight;
  const w = Math.round(src.naturalWidth * s);
  const pad = GLOW * 2;
  const img = document.createElement("canvas");
  img.width = w + pad * 2;
  img.height = BAKE_H + pad * 2;
  const g = img.getContext("2d")!;
  g.shadowColor = ENEMY_GLOW[enemy];
  g.shadowBlur = GLOW;
  g.drawImage(src, pad, pad, w, BAKE_H);
  const white = document.createElement("canvas");
  white.width = img.width;
  white.height = img.height;
  const wg = white.getContext("2d")!;
  wg.drawImage(src, pad, pad, w, BAKE_H);
  wg.globalCompositeOperation = "source-in";
  wg.fillStyle = "#fff";
  wg.fillRect(0, 0, white.width, white.height);
  return { img, white };
}

/** 敵の絵を読み始める。何度呼んでもよい */
export function preloadEnemyArt(root: string = import.meta.env.BASE_URL): void {
  if (started || typeof Image === "undefined") return;
  started = true;
  for (const enemy of ENEMIES) {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => ready.set(enemy, bake(enemy, img));
    img.onerror = () => console.warn(`[art] 敵 ${enemy} の絵を読めません`);
    img.src = `${root}art/enemy/${enemy}.webp`;
  }
}

export function enemyArt(enemy: Enemy): EnemySprite | null {
  return ready.get(enemy) ?? null;
}

/** 絵の中心を (x, y) に置いたときの描く大きさ。h は絵の高さ（液晶の px） */
export function enemyBox(sp: EnemySprite, x: number, y: number, h: number): { x: number; y: number; w: number; h: number } {
  const s = h / BAKE_H;
  const w = sp.img.width * s;
  const hh = sp.img.height * s;
  return { x: x - w / 2, y: y - hh / 2, w, h: hh };
}

/**
 * 敵を中心 (x, y) に描く。h は絵の高さ（液晶の px）。hurt（0〜1）で白く光らせる。読めていなければ false
 */
export function drawEnemy(g: G, enemy: Enemy, x: number, y: number, h: number, alpha = 1, hurt = 0): boolean {
  const sp = enemyArt(enemy);
  if (!sp) return false;
  const b = enemyBox(sp, x, y, h);
  g.save();
  g.globalAlpha *= alpha;
  g.drawImage(sp.img, b.x, b.y, b.w, b.h);
  if (hurt > 0) {
    g.globalAlpha *= Math.min(1, hurt);
    g.drawImage(sp.white, b.x, b.y, b.w, b.h);
  }
  g.restore();
  return true;
}
