import type { HoldColor } from "../game/lottery";
import type { Jackpot, MachineEvent, Spin } from "../game/machine";
import { REVIVAL_UP } from "../game/notices";
import type { Scenario, SpKind, SpspKind } from "../game/scenario";
import type { Mode } from "../game/spec";
import type { LcdStage } from "./stage";
import type { Backdrop } from "./stageShader";

/** 背景を選ぶのに要る台の状態 */
export interface StageInput {
  mode: Mode;
  spin: Spin | null;
  jackpot: Jackpot | null;
}

const MODE_BACKDROP: Record<Mode, Backdrop> = { normal: "city", jitan: "night", rush: "rush", lt: "gold" };
/** SP は行き先で分ける（楽曲 = 月夜、日常 = 夕景の街、影法師 = 影の帳） */
const SP_BACKDROP: Record<SpKind, Backdrop> = { song: "night", daily: "city", shade: "barrier" };
/** SPSP も行き先で分ける（黒嵐 = 絶望の嵐、深淵 = 深海、物語 = 時計塔） */
const SPSP_BACKDROP: Record<SpspKind, Backdrop> = { storm: "despair", abyss: "abyss", story: "clock" };

/** 変動の段階ごとの背景 */
export function backdropFor(s: StageInput): Backdrop {
  if (s.jackpot) return "gold";
  const sp = s.spin;
  if (!sp) return MODE_BACKDROP[s.mode];
  const sc = sp.scenario;
  const t = sp.t;
  if (sc.kind === "zenkaiten") return "gold";
  if (sc.revivalAt !== undefined && t >= sc.revivalAt) return t >= sc.revivalAt + REVIVAL_UP ? "gold" : "despair";
  if (sc.spspAt !== undefined && t >= sc.spspAt) return sc.spsp ? SPSP_BACKDROP[sc.spsp] : "despair";
  if (sc.spAt !== undefined && t >= sc.spAt) return sc.sp ? SP_BACKDROP[sc.sp] : "barrier";
  if (sc.reachAt !== undefined && t >= sc.reachAt) return "circle";
  return MODE_BACKDROP[sp.mode];
}

/** 背景の動きの強さ。結果は漏らさず、見えている予告と段階だけで決める */
export function heatFor(s: StageInput): number {
  if (s.jackpot) return 1;
  const sp = s.spin;
  if (!sp) return s.mode === "normal" ? 0 : 0.35;
  const sc = sp.scenario;
  const t = sp.t;
  let h = s.mode === "normal" ? 0 : 0.3;
  if (sc.reachAt !== undefined && t >= sc.reachAt) h = Math.max(h, 0.3);
  if (sc.spAt !== undefined && t >= sc.spAt) h = Math.max(h, 0.55);
  if (sc.spspAt !== undefined && t >= sc.spspAt) h = Math.max(h, 0.8);
  if (sc.notices.zone === "red") h = Math.min(1, h + 0.2);
  return h;
}

const HOLD_FLASH: Partial<Record<HoldColor, number>> = { red: 0xff3050, gold: 0xffc93a, zebra: 0xffffff, rainbow: 0xffb0f0 };

/** 液晶の合成段を台の出来事に合わせて動かす（背景の切り替え・光・衝撃波） */
export class StageDirector {
  /** 開発用: 背景を固定する */
  debugBackdrop: Backdrop | null = null;

  constructor(private readonly stage: LcdStage) {}

  update(s: StageInput): void {
    const b = this.debugBackdrop ?? backdropFor(s);
    // 段階が上がる切り替えは速く、戻るときはゆっくり
    this.stage.setBackdrop(b, s.spin ? 0.25 : 0.9);
    this.stage.setHeat(heatFor(s));
  }

  onEvent(e: MachineEvent): void {
    switch (e.type) {
      case "spin-start": {
        const c = HOLD_FLASH[e.color];
        if (c !== undefined && e.scenario.kind !== "hazure") this.stage.flash(c, 0.35, 0.3);
        break;
      }
      case "cue":
        this.onCue(e.cue, e.scenario);
        break;
      case "push":
        this.stage.punch(1);
        if (e.scenario.hit && !e.scenario.revival) this.stage.flash(0xffffff, 1, 0.6);
        break;
      case "spin-end":
        if (e.result.hit) {
          this.stage.flash(0xffe9a0, 1, 0.8);
          this.stage.wave(0xffd060);
          this.stage.punch(1);
        }
        break;
      case "jackpot-start":
        this.stage.flash(0xffffff, 0.9, 0.5);
        break;
      case "round-start":
        if (e.round === 1) this.stage.wave(0xff9ad0);
        break;
      case "mode":
        if (e.mode === "rush" || e.mode === "lt") {
          this.stage.flash(e.mode === "lt" ? 0xffd060 : 0xc070ff, 1, 0.9);
          this.stage.wave(e.mode === "lt" ? 0xffd060 : 0xc070ff);
        }
        break;
      default:
        break;
    }
  }

  private onCue(cue: string, sc: Scenario): void {
    switch (cue) {
      case "reach":
        this.stage.punch(0.6);
        this.stage.wave(0xff9ad0);
        break;
      case "sp":
        this.stage.flash(0xffffff, 0.8, 0.45);
        this.stage.punch(0.8);
        break;
      case "spsp":
        this.stage.flash(sc.spsp === "story" ? 0xb080ff : 0xff2040, 1, 0.7);
        this.stage.wave(sc.spsp === "story" ? 0xb080ff : 0xff2040);
        this.stage.punch(1);
        break;
      case "cutin":
        this.stage.punch(sc.cutin === "gold" ? 1 : sc.cutin === "red" ? 0.7 : 0.4);
        if (sc.cutin === "gold") this.stage.flash(0xffc93a, 0.7, 0.4);
        break;
      case "pseudo":
        this.stage.punch(0.5);
        this.stage.wave(0xffffff);
        break;
      case "sudden":
        this.stage.flash(0xffffff, 1, 0.3);
        break;
      case "zenkaiten":
        this.stage.flash(0xffffff, 1, 1.2);
        this.stage.wave(0xffd060);
        break;
      case "gold-door":
      case "gem":
        this.stage.flash(0xffc93a, 0.6, 0.4);
        break;
      case "step5":
        this.stage.flash(0xffc93a, 0.5, 0.3);
        this.stage.punch(0.5);
        break;
      case "lumi":
        this.stage.flash(0xff2040, 0.7, 0.5);
        this.stage.punch(0.8);
        break;
      case "logo":
        this.stage.punch(sc.notices.logo === "tilt" ? 1 : 0.6);
        break;
      case "zone":
        this.stage.wave(sc.notices.zone === "red" ? 0xff2040 : 0xb080ff);
        break;
      case "count1":
        this.stage.punch(0.4);
        break;
      case "revival":
        this.stage.flash(0xffffff, 1, 0.9);
        this.stage.wave(0xffd060);
        this.stage.punch(1);
        break;
      default:
        break;
    }
  }
}
