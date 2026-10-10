import * as THREE from "three";
import type { SceneMedia, VideoFit } from "../media/manifest";

/**
 * 液晶に流す映像 1 本。
 * source は映像要素を使い回す単位（場面ごとに 1 つ）、key は流し直すかどうかの単位。
 * key が変わって source が同じなら、同じ映像を頭から流し直す（次の変動の同じリーチなど）。
 */
export interface VideoClip {
  key: string;
  source: string;
  url: string;
  media: SceneMedia;
}

/** シェーダに渡す 1 層ぶん */
export interface VideoSlot {
  texture: THREE.Texture;
  weight: number;
  /** 液晶の uv から映像の uv への倍率（中心基準） */
  scale: THREE.Vector2;
  ui: number;
}

interface Source {
  el: HTMLVideoElement;
  texture: THREE.VideoTexture;
  failed: boolean;
  /** 最後に流した clip の key */
  lastKey: string | null;
}

interface Layer {
  clip: VideoClip;
  src: Source;
  weight: number;
  ready: boolean;
}

/**
 * 手元の映像を液晶の背景として流す。新しい映像は最初の 1 コマが出てから上に重ねて溶かし込み、
 * 溶けきったら下の映像を止める。映像が無くなったらコードで描いた背景へ溶かして戻す。
 */
export class VideoLayer {
  private readonly sources = new Map<string, Source>();
  private top: Layer | null = null;
  private under: Layer | null = null;
  private fadeRate = Infinity;
  private soundOn = false;
  private readonly blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  private readonly warned = new Set<string>();

  constructor(private readonly aspect: number) {
    this.blank.needsUpdate = true;
  }

  get current(): VideoClip | null {
    return this.top?.clip ?? null;
  }

  /** 読み込みに失敗していないか（まだ読んでいない映像は true） */
  playable(source: string): boolean {
    return !this.sources.get(source)?.failed;
  }

  /** 流す映像を指示する。null でコードの背景に戻す。fade 秒で溶かす */
  show(clip: VideoClip | null, fade: number): void {
    if ((clip?.key ?? null) === (this.top?.clip.key ?? null)) return;
    this.fadeRate = fade > 0 ? 1 / fade : Infinity;
    if (clip && this.top?.clip.source === clip.source) {
      // 同じ映像を頭から流し直す。溶かす相手がいないのでその場で切り替える
      this.top = { ...this.top, clip };
      this.play(this.top);
      return;
    }
    let carried = 0;
    if (this.top) {
      if (this.under) this.release(this.under);
      this.under = this.top;
    } else if (clip && this.under?.clip.source === clip.source) {
      // 消えかけの映像をもう一度使う。要素は 1 つなので下の層から引き取る
      carried = this.under.weight;
      this.under = null;
    }
    this.top = clip ? { clip, src: this.source(clip), weight: carried, ready: false } : null;
    if (this.top) this.play(this.top);
  }

  /** 流す前に読み込みを始めておく */
  preload(clip: VideoClip): void {
    this.source(clip);
  }

  /** 映像の音を鳴らしてよいか（音の解錠済みかつ消音していない） */
  setSoundEnabled(on: boolean): void {
    if (on === this.soundOn) return;
    this.soundOn = on;
    for (const l of [this.top, this.under]) if (l) this.applySound(l);
  }

  update(dt: number): void {
    const top = this.top;
    if (top) this.keepInRange(top);
    if (this.under) this.keepInRange(this.under);
    if (this.under?.src.failed) {
      this.release(this.under);
      this.under = null;
    }
    if (top?.src.failed) {
      // 読めない映像は外す。次の指示で、より大まかな場面の素材かコードの背景に替わる
      this.release(top);
      this.top = null;
      return;
    }
    const step = dt * this.fadeRate;
    if (top) {
      top.ready ||= top.src.el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !top.src.el.seeking;
      if (!top.ready) return;
      top.weight = Math.min(1, top.weight + step);
      if (top.weight >= 1 && this.under) {
        this.release(this.under);
        this.under = null;
      }
    } else if (this.under) {
      this.under.weight = Math.max(0, this.under.weight - step);
      if (this.under.weight <= 0) {
        this.release(this.under);
        this.under = null;
      }
    }
  }

  /** シェーダに渡す 2 層（下・上）。無い層は重み 0 */
  slots(): [VideoSlot, VideoSlot] {
    return [this.slot(this.under), this.slot(this.top)];
  }

  dispose(): void {
    for (const s of this.sources.values()) {
      s.el.pause();
      s.el.removeAttribute("src");
      s.el.load();
      s.texture.dispose();
    }
    this.sources.clear();
    this.blank.dispose();
  }

  private slot(l: Layer | null): VideoSlot {
    if (!l?.ready) return { texture: this.blank, weight: 0, scale: new THREE.Vector2(1, 1), ui: 1 };
    const m = l.clip.media;
    return { texture: l.src.texture, weight: l.weight, scale: fitScale(m.fit, l.src.el, this.aspect), ui: m.ui };
  }

  private source(clip: VideoClip): Source {
    const have = this.sources.get(clip.source);
    if (have) return have;
    const el = document.createElement("video");
    el.src = clip.url;
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    const src: Source = { el, texture: new THREE.VideoTexture(el), failed: false, lastKey: null };
    el.addEventListener("error", () => {
      src.failed = true;
      if (this.warned.has(clip.url)) return;
      this.warned.add(clip.url);
      console.warn(`[local-assets] 映像を読めません: ${clip.url}`);
    });
    // 範囲を切ってループさせる映像は、終わりで自分で頭に戻す
    el.addEventListener("ended", () => {
      const l = [this.top, this.under].find((x) => x?.src === src);
      if (l?.clip.media.loop) this.play(l, true);
    });
    this.sources.set(clip.source, src);
    return src;
  }

  /** rewind なら必ず start から。そうでなければ、同じ key に戻ったループ映像は止めた所から続ける */
  private play(l: Layer, rewind = false): void {
    const { el } = l.src;
    const m = l.clip.media;
    el.loop = m.loop && m.start === 0 && m.end === undefined;
    this.applySound(l);
    const resume = !rewind && m.loop && l.src.lastKey === l.clip.key;
    if (!resume) el.currentTime = m.start;
    l.src.lastKey = l.clip.key;
    el.play().catch(() => {
      // 音つきの自動再生が止められたら音無しで流す（音は解錠後の setSoundEnabled で戻る）
      if (el.muted) return;
      el.muted = true;
      void el.play().catch(() => undefined);
    });
  }

  private applySound(l: Layer): void {
    const m = l.clip.media;
    l.src.el.muted = !(m.sound && this.soundOn);
    l.src.el.volume = m.volume;
  }

  /** end を決めた映像を範囲内に留める */
  private keepInRange(l: Layer): void {
    const m = l.clip.media;
    const { el } = l.src;
    if (m.end === undefined || el.currentTime < m.end) return;
    if (m.loop) this.play(l, true);
    else if (!el.paused) el.pause();
  }

  private release(l: Layer): void {
    l.src.el.pause();
  }
}

/** fit に合わせた uv の倍率。cover は映像の端を切り、contain は液晶の端に黒帯を出す */
export function fitScale(fit: VideoFit, el: { videoWidth: number; videoHeight: number }, aspect: number): THREE.Vector2 {
  const va = el.videoWidth > 0 && el.videoHeight > 0 ? el.videoWidth / el.videoHeight : aspect;
  if (fit === "stretch" || va === aspect) return new THREE.Vector2(1, 1);
  // r < 1 なら映像のほうが横長
  const r = aspect / va;
  if (fit === "cover") return r < 1 ? new THREE.Vector2(r, 1) : new THREE.Vector2(1, 1 / r);
  return r < 1 ? new THREE.Vector2(1, 1 / r) : new THREE.Vector2(r, 1);
}
