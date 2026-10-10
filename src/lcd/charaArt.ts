import type { Chara } from "../game/scenario";
import { CHARA, CHARA_ORDER } from "./heroines";
import type { G } from "./paint";

/**
 * キャラの立ち絵（public/art/chara/、上半身・背景は透過）。読めるまでは null を返すので、
 * 呼ぶ側はそれまでランタンで代わりをする。
 *
 * 絵は下端で切れているので、下の方を透明に溶かし、キャラの色の光で縁取った版を作って持つ。
 */

export const CHARA_FILE: Record<Chara, string> = { rose: "pink", violet: "purple", azure: "blue", amber: "yellow", scarlet: "red" };
/** 顔の位置（絵の幅・高さに対する割合）。立ち絵を顔で合わせて置くのに使う */
const FACE: Record<Chara, { x: number; y: number }> = {
  rose: { x: 0.43, y: 0.28 },
  violet: { x: 0.37, y: 0.28 },
  azure: { x: 0.58, y: 0.27 },
  amber: { x: 0.37, y: 0.26 },
  scarlet: { x: 0.61, y: 0.3 },
};
/** 作り置きの高さ。液晶では最大でもこのくらいでしか描かない */
const BAKE_H = 760;
const GLOW = 28;

export interface CharaPortrait {
  img: HTMLCanvasElement;
  /** 顔の位置（img 上の px） */
  faceX: number;
  faceY: number;
}

const ready = new Map<Chara, CharaPortrait>();
let started = false;

function bake(chara: Chara, src: HTMLImageElement): CharaPortrait {
  const s = BAKE_H / src.naturalHeight;
  const w = Math.round(src.naturalWidth * s);
  const pad = GLOW * 2;
  const cv = document.createElement("canvas");
  cv.width = w + pad * 2;
  cv.height = BAKE_H + pad;
  const g = cv.getContext("2d")!;
  g.shadowColor = CHARA[chara].color;
  g.shadowBlur = GLOW;
  g.drawImage(src, pad, pad, w, BAKE_H);
  g.shadowBlur = 0;
  // 下の 4 割ほどで透明へ溶かす（絵の切れ目を見せない）
  g.globalCompositeOperation = "destination-in";
  const fade = g.createLinearGradient(0, pad + BAKE_H * 0.62, 0, pad + BAKE_H);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, cv.width, cv.height);
  const f = FACE[chara];
  return { img: cv, faceX: pad + f.x * w, faceY: pad + f.y * BAKE_H };
}

/** 立ち絵を読み始める。何度呼んでもよい */
export function preloadCharaArt(root: string = import.meta.env.BASE_URL): void {
  if (started || typeof Image === "undefined") return;
  started = true;
  for (const chara of CHARA_ORDER) {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => ready.set(chara, bake(chara, img));
    img.onerror = () => console.warn(`[art] ${chara} の立ち絵を読めません`);
    img.src = `${root}art/chara/${CHARA_FILE[chara]}.webp`;
  }
}

export function charaArt(chara: Chara): CharaPortrait | null {
  return ready.get(chara) ?? null;
}

/**
 * 立ち絵を顔の位置 (x, y) に合わせて描く。h は絵の高さ（液晶の px）。読めていなければ false
 */
export function drawChara(g: G, chara: Chara, x: number, y: number, h: number, alpha = 1): boolean {
  const p = charaArt(chara);
  if (!p) return false;
  const s = h / BAKE_H;
  g.save();
  g.globalAlpha *= alpha;
  g.drawImage(p.img, x - p.faceX * s, y - p.faceY * s, p.img.width * s, p.img.height * s);
  g.restore();
  return true;
}
