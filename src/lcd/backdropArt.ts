import * as THREE from "three";
import { BACKDROPS, type Backdrop } from "./stageShader";

/** 読めた絵を、コードで描いた背景から何秒かけて差し替えるか */
const ART_FADE = 0.5;

interface ArtMotion {
  el: HTMLVideoElement;
  texture: THREE.VideoTexture;
  failed: boolean;
}

interface ArtSlot {
  art: THREE.Texture;
  depth: THREE.Texture;
  /** 絵を動かした映像（public/art/bg/<名前>.mp4）。最初のコマが出るまでは絵を使う */
  motion: ArtMotion | null;
  /** 0〜1。読めたら ART_FADE 秒で 1 へ */
  ok: number;
  loaded: number;
}

/**
 * 背景の絵（public/art/bg/）と奥行きを読む。読めるまでは 1×1 の黒を返し、
 * シェーダはその間コードで描いた背景を使う。読めなかった背景もそのまま。
 *
 * 絵を動かした映像があれば、見えている背景だけ流して絵の代わりに使う。映像は絵と同じ構図なので、
 * 奥行きは絵のものをそのまま使う。
 */
export class BackdropArt {
  private readonly slots = new Map<Backdrop, ArtSlot>();
  private readonly blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);

  constructor(root: string) {
    this.blank.needsUpdate = true;
    const loader = new THREE.TextureLoader();
    for (const b of BACKDROPS) {
      const motion = loadMotion(`${root}art/bg/${b}.mp4`);
      const slot: ArtSlot = { art: this.blank, depth: this.blank, motion, ok: 0, loaded: 0 };
      this.slots.set(b, slot);
      const done = (): void => {
        slot.loaded++;
      };
      const fail = (): void => console.warn(`[art] 背景 ${b} の絵を読めません`);
      loader.load(
        `${root}art/bg/${b}.webp`,
        (t) => {
          t.anisotropy = 4;
          slot.art = t;
          done();
        },
        undefined,
        fail,
      );
      loader.load(
        `${root}art/bg/${b}.depth.webp`,
        (t) => {
          // 奥行きは視差のずれを読むだけで縮めて見せないので、縮小用の段階は要らない
          t.generateMipmaps = false;
          t.minFilter = THREE.LinearFilter;
          slot.depth = t;
          done();
        },
        undefined,
        fail,
      );
    }
  }

  /** 背景の絵（動かせるなら映像）と奥行きと、絵の効き具合（0 ならコードの背景） */
  get(b: Backdrop): { art: THREE.Texture; depth: THREE.Texture; ok: number } {
    const s = this.slots.get(b)!;
    const m = s.motion;
    const moving = m && !m.failed && m.el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    return { art: moving ? m.texture : s.art, depth: s.depth, ok: s.ok };
  }

  /** shown は今見えている背景。その映像だけ流し、ほかは止めておく */
  update(dt: number, shown: readonly Backdrop[]): void {
    for (const [b, s] of this.slots) {
      if (s.loaded === 2 && s.ok < 1) s.ok = Math.min(1, s.ok + dt / ART_FADE);
      const m = s.motion;
      if (!m || m.failed) continue;
      const on = shown.includes(b);
      if (on && m.el.paused) void m.el.play().catch(() => undefined);
      else if (!on && !m.el.paused) m.el.pause();
    }
  }

  dispose(): void {
    for (const s of this.slots.values()) {
      if (s.art !== this.blank) s.art.dispose();
      if (s.depth !== this.blank) s.depth.dispose();
      if (s.motion) {
        // 外した src で出る error を読めなかったと数えない
        s.motion.failed = true;
        s.motion.el.pause();
        s.motion.el.removeAttribute("src");
        s.motion.el.load();
        s.motion.texture.dispose();
      }
    }
    this.blank.dispose();
  }
}

/** 映像を読み始める。video を作れない所（テストなど）では null */
function loadMotion(url: string): ArtMotion | null {
  if (typeof document === "undefined") return null;
  const el = document.createElement("video");
  el.muted = true;
  el.loop = true;
  el.playsInline = true;
  // 出る前に読み切っておく。出てから読むと、最初のコマが出た所で絵から映像へ跳んで見える
  el.preload = "auto";
  const m: ArtMotion = { el, texture: new THREE.VideoTexture(el), failed: false };
  el.addEventListener("error", () => {
    if (m.failed) return;
    m.failed = true;
    console.warn(`[art] 背景の映像を読めません: ${url}`);
  });
  el.src = url;
  return m;
}
