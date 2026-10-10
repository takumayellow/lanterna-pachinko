import type { HoldColor, Hold } from "../game/lottery";
import type { Jackpot, MachineEvent, Spin } from "../game/machine";
import { settleAt, type Scenario } from "../game/scenario";
import { MODE_LABEL, hitProb, stContinueRate, type Mode } from "../game/spec";
import { preloadCharaArt } from "./charaArt";
import { preloadEnemyArt } from "./enemyArt";
import { drawJackpot } from "./jackpotScene";
import { CHARA, CHARA_ORDER, drawLantern, drawShadowSeal } from "./heroines";
import {
  GOLD,
  H,
  PINK,
  W,
  easeOutBack,
  rainbow,
  span,
  sparkles,
  sunburst,
  text,
  vGrad,
  type G,
} from "./paint";
import { planReels, type ReelPlan } from "./reels";
import { drawSpin, type SceneCtx, type SpinView } from "./spinScene";
import { SYM_H, SYM_W, makeSymbolSprites, type SymbolSprites } from "./sprites";

/** 液晶に渡す台の状態 */
export interface LcdInput {
  now: number;
  mode: Mode;
  spinsLeft: number;
  spin: Spin | null;
  jackpot: Jackpot | null;
  holds1: readonly Hold[];
  holds2: readonly Hold[];
  rightShoot: boolean;
  /** プレイヤーが右打ちしているか */
  aimRight: boolean;
  firing: boolean;
  /** RUSH の連チャン数 */
  chain: number;
}

interface LastSpin {
  view: SpinView;
  endedAt: number;
}

/** 何もしていない時間がこれを超えたらデモ画面 */
const DEMO_AFTER = 14;

const HOLD_FILL: Record<HoldColor, string> = {
  white: "#f4f4fa",
  blue: "#3fa0ff",
  green: "#35e08a",
  red: "#ff3550",
  gold: "#ffc93a",
  zebra: "#e8e8e8",
  rainbow: "#ffffff",
};

export class Lcd {
  readonly canvas: HTMLCanvasElement;
  private readonly g: G;
  private readonly scale: number;
  private readonly sprites: SymbolSprites;
  private plans = new WeakMap<Scenario, ReelPlan>();
  private last: LastSpin | null = null;
  /** 何も回っていないときに出す図柄 */
  private idle: [number, number, number] = [1, 5, 3];
  private pushed: { scenario: Scenario; at: number } | null = null;
  private banner: { title: string; sub: string; at: number } | null = null;
  private holdPop: Record<1 | 2, number> = { 1: -9, 2: -9 };
  private shiftAt: Record<1 | 2, number> = { 1: -9, 2: -9 };
  private lastActivity = 0;
  private prevChain = 0;
  private spinT = 0;
  private now = 0;

  constructor(scale = 1) {
    this.scale = scale;
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.round(W * scale);
    this.canvas.height = Math.round(H * scale);
    this.g = this.canvas.getContext("2d")!;
    this.sprites = makeSymbolSprites();
    preloadCharaArt();
    preloadEnemyArt();
  }

  onEvent(e: MachineEvent): void {
    const now = this.now;
    switch (e.type) {
      case "hold":
        this.holdPop[e.kind] = now;
        this.lastActivity = now;
        break;
      case "spin-start":
        this.shiftAt[e.kind] = now;
        this.last = null;
        this.pushed = null;
        this.lastActivity = now;
        break;
      case "push":
        this.pushed = { scenario: e.scenario, at: this.spinT };
        break;
      case "spin-end": {
        const plan = this.planFor(e.scenario);
        this.last = {
          view: { scenario: e.scenario, plan, t: e.scenario.duration, pushedAt: this.pushedAtFor(e.scenario) },
          endedAt: now,
        };
        this.idle = e.scenario.final;
        break;
      }
      case "jackpot-start":
        this.last = null;
        this.idle = [e.result.number, e.result.number, e.result.number];
        break;
      case "mode":
        if (e.mode === "normal" && e.from !== "normal") {
          this.banner =
            e.from === "jitan"
              ? { title: `${MODE_LABEL.jitan} 終了`, sub: "また狙ってね", at: now }
              : { title: "RUSH 終了", sub: `${this.prevChain}連 おつかれさま!`, at: now };
        }
        this.lastActivity = now;
        break;
      default:
        break;
    }
  }

  draw(s: LcdInput): void {
    this.now = s.now;
    const g = this.g;
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const c: SceneCtx = { g, now: s.now, sprites: this.sprites };
    if (s.firing || s.spin || s.jackpot) this.lastActivity = s.now;

    this.drawBackground();
    let inSp = false;
    if (s.jackpot) {
      drawJackpot(c, { jackpot: s.jackpot, chain: s.chain });
    } else if (s.spin) {
      this.spinT = s.spin.t;
      const view: SpinView = {
        scenario: s.spin.scenario,
        plan: this.planFor(s.spin.scenario),
        t: s.spin.t,
        pushedAt: this.pushedAtFor(s.spin.scenario),
      };
      inSp = s.spin.scenario.spAt !== undefined && s.spin.t >= s.spin.scenario.spAt && s.spin.t < settleAt(s.spin.scenario);
      drawSpin(c, view);
    } else if (this.last) {
      drawSpin(c, { ...this.last.view, t: this.last.view.t + (s.now - this.last.endedAt) });
    } else {
      this.drawIdleReels(c);
    }

    const demo = !s.spin && !s.jackpot && s.mode === "normal" && s.holds1.length === 0 && s.now - this.lastActivity > DEMO_AFTER;
    if (demo) this.drawDemo();

    if (!s.jackpot && !inSp) this.drawStatus(s);
    if (!s.jackpot) this.drawHolds(s);
    this.drawShootGuide(s);
    this.drawBanner();
    this.prevChain = s.chain;
  }

  private planFor(scenario: Scenario): ReelPlan {
    let p = this.plans.get(scenario);
    if (!p) {
      p = planReels(scenario);
      this.plans.set(scenario, p);
    }
    return p;
  }

  private pushedAtFor(scenario: Scenario): number | undefined {
    return this.pushed?.scenario === scenario ? this.pushed.at : undefined;
  }

  /** 背景は合成段のシェーダが描くので、2D の層は透明から始める */
  private drawBackground(): void {
    this.g.clearRect(0, 0, W, H);
  }

  private drawIdleReels(c: SceneCtx): void {
    const g = c.g;
    this.idle.forEach((n, i) => {
      const img = this.sprites.sharp[n];
      g.drawImage(img, 230 + i * 290 - SYM_W / 2, 380 - SYM_H / 2);
    });
  }

  private drawDemo(): void {
    const g = this.g;
    g.save();
    g.globalAlpha = span(this.now - this.lastActivity, DEMO_AFTER, DEMO_AFTER + 1);
    g.fillStyle = "rgba(10,4,30,0.6)";
    g.fillRect(0, 0, W, H);
    drawShadowSeal(g, W / 2, H * 0.42, 340, this.now * 0.15, "#c9a6ff", 0.35);
    g.save();
    g.globalCompositeOperation = "lighter";
    sunburst(g, W / 2, H * 0.4, 900, 20, this.now * 0.15, "rgba(255,200,240,0.1)");
    g.restore();
    sparkles(g, this.now, 50, "#fff", 25, 7);
    // 五人のランタンが輪になって回る
    CHARA_ORDER.forEach((k, i) => {
      const a = this.now * 0.5 + (i / CHARA_ORDER.length) * Math.PI * 2;
      drawLantern(g, W / 2 + Math.cos(a) * 360, H * 0.36 + Math.sin(a) * 90, 46 + 10 * (1 + Math.sin(a)), CHARA[k].grad, 0.5);
    });
    text(g, "灯守少女", W / 2, 150, { size: 64, fill: vGrad(g, 118, 182, ["#fff", "#ffd6ec", "#ff8cc6"]), stroke: "#fff", strokeW: 6, outer: "#2a0a3a", outerW: 16 });
    text(g, "LANTERNA", W / 2, 260, { size: 150, fill: vGrad(g, 185, 335, PINK), stroke: "#fff", strokeW: 12, outer: "#2a0a3a", outerW: 30, glow: "#ffb0e0" });
    const odds = (m: Mode) => `1/${(1 / hitProb(m)).toFixed(1)}`;
    text(g, `大当たり ${odds("normal")} ・ RUSH ${odds("rush")}`, W / 2, 470, { size: 38, fill: "#fff", stroke: "#2a0a4a", strokeW: 8 });
    text(g, `RUSH 継続率 約${Math.round(stContinueRate("rush") * 100)}%`, W / 2, 525, { size: 38, fill: vGrad(g, 506, 544, GOLD), stroke: "#2a0a4a", strokeW: 8 });
    const blink = 0.6 + 0.4 * Math.sin(this.now * 4);
    g.globalAlpha *= blink;
    text(g, "左打ちでスタートを狙ってね", W / 2, 620, { size: 42, fill: vGrad(g, 600, 640, PINK), stroke: "#fff", strokeW: 6, outer: "#2a0620", outerW: 14 });
    g.restore();
  }

  /** 上の帯: モードと残り回数 */
  private drawStatus(s: LcdInput): void {
    if (s.mode === "normal") return;
    const g = this.g;
    g.save();
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.fillRect(0, 0, W, 64);
    const fill = s.mode === "jitan" ? vGrad(g, 12, 52, ["#f0fff8", "#7affc8"]) : s.mode === "lt" ? rainbow(g, 20, 420, s.now * 0.5) : vGrad(g, 12, 52, PINK);
    text(g, MODE_LABEL[s.mode], 24, 33, { size: 40, fill, stroke: "#1a0620", strokeW: 8, align: "left" });
    if (s.chain > 0) text(g, `${s.chain}連`, 500, 33, { size: 40, fill: vGrad(g, 12, 52, GOLD), stroke: "#1a0620", strokeW: 8 });
    text(g, `残り ${s.spinsLeft} 回`, W - 24, 33, { size: 40, fill: "#fff", stroke: "#1a0620", strokeW: 8, align: "right" });
    g.restore();
  }

  /** 下の保留アイコン。左から消化され、真ん中寄りの大きいのが今回っている保留 */
  private drawHolds(s: LcdInput): void {
    const g = this.g;
    const y = 728;
    if (s.spin) this.holdIcon(250, y, 32, s.spin.hold.color, 0);
    g.save();
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    g.roundRect(200, y - 40, 100, 80, 20);
    g.fill();
    g.restore();
    const row = (list: readonly Hold[], kind: 1 | 2, x0: number) => {
      const shift = 1 - span(this.now, this.shiftAt[kind], this.shiftAt[kind] + 0.22);
      list.forEach((h, i) => {
        const pop = i === list.length - 1 ? 1 + 0.7 * (1 - easeOutBack(span(this.now, this.holdPop[kind], this.holdPop[kind] + 0.3))) : 1;
        this.holdIcon(x0 + (i + shift) * 66, y, 22 * pop, h.color, kind === 2 ? 1 : 0);
      });
    };
    row(s.holds1, 1, 360);
    if (s.mode !== "normal" || s.holds2.length > 0) {
      row(s.holds2, 2, 690);
      text(g, "電", 650, y, { size: 26, fill: "#9ff3ff", stroke: "#06203a", strokeW: 6 });
    }
  }

  private holdIcon(x: number, y: number, r: number, color: HoldColor, shape: 0 | 1): void {
    const g = this.g;
    g.save();
    g.translate(x, y);
    let fill: string | CanvasGradient | CanvasPattern = HOLD_FILL[color];
    if (color === "rainbow") {
      const cg = g.createConicGradient(this.now * 4, 0, 0);
      for (let i = 0; i <= 6; i++) cg.addColorStop(i / 6, `hsl(${i * 60}, 100%, 60%)`);
      fill = cg;
    } else if (color === "zebra") {
      const zg = g.createLinearGradient(-r, -r, r, r);
      for (let i = 0; i < 6; i++) {
        const c = i % 2 === 0 ? "#f4f4f4" : "#111";
        zg.addColorStop(i / 6, c);
        zg.addColorStop((i + 1) / 6 - 0.001, c);
      }
      fill = zg;
    }
    g.shadowColor = color === "white" ? "rgba(255,255,255,0.5)" : HOLD_FILL[color];
    g.shadowBlur = color === "white" ? 6 : 18;
    g.fillStyle = fill;
    g.beginPath();
    if (shape === 0) g.arc(0, 0, r, 0, Math.PI * 2);
    else {
      g.moveTo(0, -r);
      g.lineTo(r, 0);
      g.lineTo(0, r);
      g.lineTo(-r, 0);
      g.closePath();
    }
    g.fill();
    g.shadowBlur = 0;
    const hl = g.createRadialGradient(-r * 0.35, -r * 0.4, 1, 0, 0, r);
    hl.addColorStop(0, "rgba(255,255,255,0.9)");
    hl.addColorStop(0.45, "rgba(255,255,255,0.1)");
    hl.addColorStop(1, "rgba(0,0,0,0.25)");
    g.fillStyle = hl;
    g.fill();
    g.restore();
  }

  /** 右打ち・左打ちの案内 */
  private drawShootGuide(s: LcdInput): void {
    const g = this.g;
    const blink = Math.sin(s.now * 8) > -0.3;
    if (s.rightShoot && !s.jackpot && blink) {
      text(g, "右打ち ▶", W - 30, 108, { size: 40, fill: vGrad(g, 88, 128, GOLD), stroke: "#fff", strokeW: 5, outer: "#3a1000", outerW: 12, align: "right" });
    }
    const wrong = s.firing && (s.rightShoot ? !s.aimRight : s.aimRight && !s.jackpot);
    if (!wrong) return;
    g.save();
    g.fillStyle = s.rightShoot ? "rgba(200,20,60,0.85)" : "rgba(20,60,200,0.85)";
    g.fillRect(0, 560, W, 90);
    g.globalAlpha = blink ? 1 : 0.65;
    if (s.rightShoot) text(g, "右打ちしてね!", W / 2, 606, { size: 60, fill: "#fff", stroke: "#1a0010", strokeW: 10 });
    else {
      // 通常時に右へ飛ぶほど強く打っている。ヘソは左なので、強さを下げてもらう
      text(g, "◀ 強さを下げてね", W / 2, 594, { size: 50, fill: "#fff", stroke: "#1a0010", strokeW: 9 });
      text(g, "玉が右へ飛んでいるよ　左打ちでヘソを狙ってね", W / 2, 634, { size: 26, fill: "#fff", stroke: "#1a0010", strokeW: 5 });
    }
    g.restore();
  }

  private drawBanner(): void {
    const b = this.banner;
    if (!b) return;
    const dt = this.now - b.at;
    if (dt > 3.2) {
      this.banner = null;
      return;
    }
    const g = this.g;
    const k = easeOutBack(dt / 0.3);
    g.save();
    g.globalAlpha = 1 - span(dt, 2.8, 3.2);
    g.fillStyle = "rgba(0,0,0,0.6)";
    g.fillRect(0, 300, W, 190);
    g.translate(W / 2, 370);
    g.scale(k, k);
    text(g, b.title, 0, 0, { size: 84, fill: vGrad(g, -40, 40, ["#ffffff", "#c8d0e8"]), stroke: "#1a0620", strokeW: 12 });
    text(g, b.sub, 0, 80, { size: 44, fill: vGrad(g, 60, 100, GOLD), stroke: "#1a0620", strokeW: 8 });
    g.restore();
  }
}
