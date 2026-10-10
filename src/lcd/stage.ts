import * as THREE from "three";
import { BackdropArt } from "./backdropArt";
import { BACKDROPS, stageFragment, stageVertex, type Backdrop } from "./stageShader";
import { VideoLayer } from "./videoLayer";

/**
 * 液晶の合成段。背景（同梱の絵を動かしたもの）をシェーダで描き、2D キャンバス（文字・図柄）を重ねてレンダーターゲットに書く。
 * 盤面の液晶はこのテクスチャを貼る。フラッシュ・衝撃波・パンチはここで掛ける。
 */
export class LcdStage {
  readonly texture: THREE.Texture;
  /** 手元の映像。流れている間はコードの背景の代わりに敷く */
  readonly video: VideoLayer;
  private readonly art: BackdropArt;
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly ui: THREE.CanvasTexture;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mat: THREE.ShaderMaterial;
  private current: Backdrop = "city";
  /** 0 ならフェードしていない */
  private fadeRate = 0;
  /** フェード中に来た次の背景。今のフェードが終わってから始める（途中で切ると見えていた絵が飛ぶ） */
  private queued: { b: Backdrop; fade: number } | null = null;
  private flashLevel = 0;
  private flashDecay = 0;
  private waveStart = -1;
  private punchLevel = 0;
  private time = 0;

  /** root は public/ の置き場（import.meta.env.BASE_URL） */
  constructor(uiCanvas: HTMLCanvasElement, root: string) {
    const w = uiCanvas.width;
    const h = uiCanvas.height;
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    this.texture = this.rt.texture;
    this.texture.anisotropy = 4;

    this.ui = new THREE.CanvasTexture(uiCanvas);
    this.ui.colorSpace = THREE.SRGBColorSpace;
    this.video = new VideoLayer(w / h);
    this.art = new BackdropArt(root);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: stageVertex,
      fragmentShader: stageFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uUi: { value: this.ui },
        uTime: { value: 0 },
        uAspect: { value: w / h },
        uSceneA: { value: 0 },
        uSceneB: { value: 0 },
        uMix: { value: 0 },
        uHeat: { value: 0 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 1, 1) },
        uWave: { value: -1 },
        uWaveColor: { value: new THREE.Color(1, 0.8, 0.9) },
        uPunch: { value: 0 },
        uVid0: { value: null },
        uVid0W: { value: 0 },
        uVid0S: { value: new THREE.Vector2(1, 1) },
        uVid1: { value: null },
        uVid1W: { value: 0 },
        uVid1S: { value: new THREE.Vector2(1, 1) },
        uUiAlpha: { value: 1 },
        uArtA: { value: null },
        uDepA: { value: null },
        uArtAOk: { value: 0 },
        uArtB: { value: null },
        uDepB: { value: null },
        uArtBOk: { value: 0 },
        uArtAspect: { value: 4 / 3 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  get backdrop(): Backdrop {
    return this.current;
  }

  /** 背景を切り替える。fade 秒でクロスフェードする（0 で即座に） */
  setBackdrop(b: Backdrop, fade = 0.6): void {
    if (this.fadeRate > 0) {
      this.queued = b === this.current ? null : { b, fade };
      return;
    }
    if (b === this.current) return;
    const u = this.mat.uniforms;
    u.uSceneB.value = BACKDROPS.indexOf(b);
    u.uMix.value = 0;
    this.fadeRate = fade > 0 ? 1 / fade : Infinity;
    this.current = b;
  }

  /** 画面全体を光らせる。decay 秒で消える */
  flash(color: THREE.ColorRepresentation = 0xffffff, strength = 1, decay = 0.35): void {
    // 強い光が残っている間に弱い光が来ても、色と消え方は強い方のまま
    if (strength < this.flashLevel) return;
    (this.mat.uniforms.uFlashColor.value as THREE.Color).set(color);
    this.flashLevel = strength;
    this.flashDecay = strength / decay;
  }

  /** 中心から衝撃波の輪を出す */
  wave(color: THREE.ColorRepresentation = 0xffd0e8): void {
    (this.mat.uniforms.uWaveColor.value as THREE.Color).set(color);
    this.waveStart = this.time;
  }

  /** 2D の層を一瞬寄せて色ずれさせる */
  punch(strength = 1): void {
    this.punchLevel = Math.max(this.punchLevel, strength);
  }

  /** 熱さ（0〜1）。背景の動きと色を強める */
  setHeat(h: number): void {
    this.mat.uniforms.uHeat.value = THREE.MathUtils.clamp(h, 0, 1);
  }

  update(dt: number): void {
    this.time += dt;
    const u = this.mat.uniforms;
    u.uTime.value = this.time;
    if (this.fadeRate > 0) {
      u.uMix.value = Math.min(1, u.uMix.value + dt * this.fadeRate);
      if (u.uMix.value >= 1) {
        u.uSceneA.value = u.uSceneB.value;
        u.uMix.value = 0;
        this.fadeRate = 0;
        const q = this.queued;
        this.queued = null;
        if (q) this.setBackdrop(q.b, q.fade);
      }
    }
    this.flashLevel = Math.max(0, this.flashLevel - dt * this.flashDecay);
    u.uFlash.value = this.flashLevel;
    this.punchLevel = Math.max(0, this.punchLevel - dt * 4);
    u.uPunch.value = this.punchLevel;
    const w = this.waveStart < 0 ? -1 : this.time - this.waveStart;
    u.uWave.value = w > 0.8 ? -1 : w;
    if (w > 0.8) this.waveStart = -1;
    this.updateArt(dt);
    this.updateVideo(dt);
  }

  private updateArt(dt: number): void {
    const u = this.mat.uniforms;
    const sceneA = BACKDROPS[u.uSceneA.value as number];
    const sceneB = BACKDROPS[u.uSceneB.value as number];
    this.art.update(dt, [sceneA, sceneB]);
    const a = this.art.get(sceneA);
    const b = this.art.get(sceneB);
    u.uArtA.value = a.art;
    u.uDepA.value = a.depth;
    u.uArtAOk.value = a.ok;
    u.uArtB.value = b.art;
    u.uDepB.value = b.depth;
    u.uArtBOk.value = b.ok;
  }

  private updateVideo(dt: number): void {
    this.video.update(dt);
    const u = this.mat.uniforms;
    const [under, top] = this.video.slots();
    u.uVid0.value = under.texture;
    u.uVid0W.value = under.weight;
    (u.uVid0S.value as THREE.Vector2).copy(under.scale);
    u.uVid1.value = top.texture;
    u.uVid1W.value = top.weight;
    (u.uVid1S.value as THREE.Vector2).copy(top.scale);
    // 映像ごとに決めた 2D の層の濃さへ、溶け具合に合わせて寄せる
    const a = THREE.MathUtils.lerp(1, under.ui, under.weight);
    u.uUiAlpha.value = THREE.MathUtils.lerp(a, top.ui, top.weight);
  }

  /** 2D キャンバスを描き終えたあと、盤面を描く前に呼ぶ */
  render(renderer: THREE.WebGLRenderer): void {
    this.ui.needsUpdate = true;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
  }

  dispose(): void {
    this.rt.dispose();
    this.ui.dispose();
    this.mat.dispose();
    this.video.dispose();
    this.art.dispose();
  }
}
