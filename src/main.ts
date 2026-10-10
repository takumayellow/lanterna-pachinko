import "@fontsource/dela-gothic-one/index.css";
import "./style.css";
import { GameAudio, type CutinVoice, type Mood, type VoiceId } from "./audio/audio";
import { spinMood } from "./audio/mood";
import { FONT_CHARS } from "./fontChars";
import type { Bonus } from "./game/lottery";
import { Machine, type Cue, type InputKind, type MachineEvent } from "./game/machine";
import { settleAt, type Chara, type Scenario } from "./game/scenario";
import { isStMode } from "./game/spec";
import { StageDirector } from "./lcd/director";
import { loadLocalScenes, MediaDirector } from "./media/director";
import { PROMOTE_AT } from "./lcd/jackpotScene";
import { roundChara } from "./lcd/heroines";
import { Lcd } from "./lcd/lcd";
import { drawBoardArt } from "./render/boardArt";
import { View, type LampName, type LedTheme } from "./render/view";
import { buildBoard } from "./sim/board";
import { PhysicsWorld, type PhysicsEvent } from "./sim/physics";
import { Hud, RIGHT, RIGHT_FROM, balance } from "./ui/hud";
import { applySave, clearSave, loadSave, pushSlump, writeSave } from "./ui/save";

/** 発射の間隔 [s]。実機は 1 分 100 発 */
const FIRE_INTERVAL = 0.6;
const SLUMP_EVERY = 10;

/** 大当たりの種類を告げる台詞。ST 中の当たりはラウンド後に「継続」と言うので、ここでは黙る */
const BONUS_VOICE: Record<Bonus, VoiceId | null> = {
  lantern: "lantern",
  challenge: "challenge",
  aurora: null,
  upper: "upper",
  lower: null,
};

const CUTIN_TIER: { [T in Exclude<Scenario["cutin"], "none">]: Capitalize<T> } = { blue: "Blue", red: "Red", gold: "Gold" };
/** カットインの台詞は出てきた灯守が言う */
function cutinVoice(tier: Exclude<Scenario["cutin"], "none">, chara: Chara): CutinVoice {
  return `cutin${CUTIN_TIER[tier]}_${chara}`;
}

/** 看板と盤面の絵は一度しか描かないので、キャンバスを作る前にフォントを揃える */
async function loadFonts(): Promise<void> {
  const sample = `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?/:%+-${FONT_CHARS}`;
  try {
    await Promise.race([
      document.fonts.load(`40px "Dela Gothic One"`, sample),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch {
    // 読めなくても代わりのフォントで動く
  }
}

/** ゲーム内の時刻で後から実行する（ボイスの間合い） */
class Timeline {
  private items: { at: number; fn: () => void }[] = [];
  add(at: number, fn: () => void): void {
    this.items.push({ at, fn });
  }
  clear(): void {
    this.items = [];
  }
  run(now: number): void {
    if (this.items.length === 0) return;
    const due = this.items.filter((i) => i.at <= now);
    this.items = this.items.filter((i) => i.at > now);
    due.forEach((i) => i.fn());
  }
}

async function boot(): Promise<void> {
  await loadFonts();
  const layout = buildBoard();
  const world = new PhysicsWorld(layout);
  const m = new Machine(Math.random);
  const saved = loadSave();
  let slump: number[] = saved?.slump ?? [];
  if (saved) applySave(m, saved);

  const lcdScale = Math.min(window.innerWidth, window.innerHeight) < 700 ? 0.62 : 1;
  const lcd = new Lcd(lcdScale);
  const view = new View(document.getElementById("stage")!, layout, drawBoardArt(layout), lcd.canvas);
  const director = new StageDirector(view.stage);
  const audio = new GameAudio();
  // 手元の映像（local-assets/）。無ければコードで描いた液晶のまま
  const media = new MediaDirector(view.stage.video, import.meta.env.BASE_URL);
  void loadLocalScenes(import.meta.env.BASE_URL).then((s) => media.setScenes(s));
  if (import.meta.env.DEV) Object.assign(window, { __lab: { m, view, director, audio, media } });
  const later = new Timeline();

  let now = 0;
  let fireT = 0;
  let slumpT = 0;

  const hud = new Hud({
    start: () => {
      void audio.unlock().then(() => audio.voice("welcome"));
      // 初回は 500 円ぶん借りてから打ち始める
      if (m.balls === 0) m.rent();
    },
    rent: () => {
      void audio.unlock();
      m.rent();
      hud.toast(`玉貸 500 円 → ${m.balls.toLocaleString("ja-JP")} 玉`, now, 1.6);
    },
    push: () => {
      void audio.unlock();
      view.pressPush();
      m.push();
    },
    toggleSound: () => {
      audio.setMuted(!audio.isMuted);
      return !audio.isMuted;
    },
    toggleZoom: () => {
      view.setZoom(!view.zoomed);
      return view.zoomed;
    },
    reset: () => {
      clearSave();
      window.location.reload();
    },
  });
  if (saved) hud.toast(`続きから（持ち玉 ${m.balls.toLocaleString("ja-JP")} 玉）`, 0, 3);

  const strength = () => (hud.autoRight && m.rightShoot ? RIGHT : hud.handle);
  /** 通常に戻ったとき、まだ右へ飛ぶ強さなら左打ちに戻すよう言う。右打ち自動なら強さは戻っているので黙る */
  const askLeft = (): void => {
    if (strength() >= RIGHT_FROM) audio.voice("leftShoot");
  };

  const onPhysics = (e: PhysicsEvent) => {
    switch (e.type) {
      case "sensor": {
        const kind = e.sensor.kind;
        if (kind === "out") return;
        if (kind !== "attacker") view.flashLamp(kind as LampName);
        if (kind === "warp") return;
        m.input(kind as InputKind);
        break;
      }
      case "foul":
        m.returnBall();
        break;
      case "nail":
        audio.nail(e.speed);
        break;
      case "stage-drop":
        break;
    }
  };

  const onMachine = (e: MachineEvent) => {
    lcd.onEvent(e);
    director.onEvent(e);
    switch (e.type) {
      case "payout":
        audio.payout(e.source);
        break;
      case "hold":
        audio.hold(e.color);
        break;
      case "cue":
        onCue(e.cue, e.scenario);
        break;
      case "push":
        audio.se("button_press");
        // 復活の当たりは押した時点ではハズレに見せる
        if (e.scenario.hit && !e.scenario.revival) {
          view.dropEmblem(now);
          audio.se("gimmick");
          audio.se("kyuin");
        }
        break;
      case "spin-end":
        if (e.result.hit) {
          audio.jingle("fanfare");
          view.kick(4);
          if (e.scenario.kind !== "sudden" && e.scenario.kind !== "zenkaiten") audio.voice("hit");
        } else if (e.scenario.spAt !== undefined) {
          // ハズレの落胆は SP 以上だけ。リーチハズレのたびに嘆くとうるさい
          audio.se("miss");
          audio.voice("miss");
        }
        break;
      case "jackpot-start": {
        const v = BONUS_VOICE[e.result.bonus ?? "lower"];
        if (v) later.add(now + 1.4, () => audio.voice(v));
        if (m.mode === "normal") later.add(now + 3.6, () => audio.voice("rightShoot"));
        break;
      }
      case "round-start":
        audio.se("round_start");
        if (e.round === 1 && m.mode === "normal" && m.jackpot) {
          const chara = roundChara(m.jackpot.result.number);
          later.add(now + 1.2, () => audio.voice(`round_${chara}`));
        }
        break;
      case "round-end": {
        const j = m.jackpot;
        if (!j || e.round < j.result.rounds) break;
        // エンディングの台詞（昇格は液晶が明かす瞬間に合わせる）
        const r = j.result;
        if (r.promote) {
          later.add(now + PROMOTE_AT, () => {
            audio.jingle("rush_in");
            audio.voice("promote");
            view.dropEmblem(now);
          });
        } else if (r.next === "lt") later.add(now + 0.6, () => (audio.jingle("rush_in"), audio.voice("lt")));
        else if (r.next === "rush") {
          const chain = m.stats.chain > 0;
          later.add(now + 0.6, () => {
            if (!chain) audio.jingle("rush_in");
            audio.voice(chain ? "rushHit" : "rush");
          });
        } else {
          // チャレンジ失敗は通常に戻るので左打ちに戻してもらう
          later.add(now + 0.6, () => audio.voice("challengeFail"));
          later.add(now + 3.4, askLeft);
        }
        break;
      }
      case "mode":
        if (e.mode === "normal" && isStMode(e.from)) {
          audio.jingle("rush_end");
          later.add(now + 0.8, () => audio.voice("rushEnd"));
          later.add(now + 3.6, askLeft);
        }
        break;
      case "denchu":
        if (e.open) audio.se("denchu_open", 0.7);
        break;
      default:
        break;
    }
  };

  const onCue = (cue: Cue, s: Scenario) => {
    switch (cue) {
      case "reel-stop-l":
      case "reel-stop-r":
        audio.se("reel_stop");
        break;
      case "reel-stop-c":
        audio.se("reel_stop_center");
        break;
      case "reach":
        audio.se("reach");
        audio.voice("reach");
        break;
      case "pseudo":
        audio.se("hold_change");
        audio.voice("next");
        view.kick(1.5);
        break;
      case "cutin":
        if (s.cutin !== "none") {
          audio.se(`cutin_${s.cutin}`);
          audio.voice(cutinVoice(s.cutin, s.chara));
        }
        break;
      case "sp":
        audio.se("flash");
        audio.voice("sp");
        // 当たりのときほど役物が落ちやすい
        if (Math.random() < (s.hit ? 0.45 : 0.08)) {
          view.dropEmblem(now);
          audio.se("gimmick");
        }
        break;
      case "spsp":
        audio.se(s.title === "red" || s.title === "gold" || s.title === "rainbow" ? "gekiatsu" : "kyuin");
        audio.voice(s.spsp === "story" ? "spStory" : s.spsp === "abyss" ? "spAbyss" : "spStorm");
        view.kick(2);
        break;
      case "push-ready":
        audio.se("button_appear");
        audio.voice(s.button === "lever" ? "lever" : "push");
        break;
      case "sudden":
        audio.se("freeze");
        audio.voice("sudden");
        view.kick(6);
        break;
      case "zenkaiten":
        audio.se("freeze");
        later.add(now + 0.5, () => audio.voice("zenkaiten"));
        view.dropEmblem(now);
        audio.se("gimmick");
        break;
      case "group":
        audio.se("flash", 0.7, 1.1);
        break;
      case "zone":
        audio.se("kyuin", 0.8, s.notices.zone === "red" ? 0.85 : 1);
        break;
      case "gold-door":
        audio.se("gimmick");
        audio.se("kyuin", 0.8, 1.15);
        break;
      case "step1":
      case "step2":
      case "step3":
      case "step4":
      case "step5": {
        // 段が上がるほど音を高くする
        const n = Number(cue.slice(4));
        audio.se("hold_change", 1, 0.85 + n * 0.1);
        if (n === 5) audio.se("gekiatsu");
        break;
      }
      case "lumi":
        audio.se("gekiatsu");
        audio.voice("gekiatsu");
        view.kick(3);
        break;
      case "logo":
        audio.se("gimmick");
        view.dropEmblem(now);
        break;
      case "gem":
        audio.se("kyuin", 1, 1.2);
        break;
      case "count3":
      case "count2":
      case "count1":
        audio.se("count_tick");
        audio.voice(cue);
        break;
      case "revival-down":
        audio.se("miss");
        audio.voice("miss");
        break;
      case "revival":
        audio.se("kyuin");
        audio.se("gimmick");
        audio.voice("revival");
        view.dropEmblem(now);
        view.kick(5);
        break;
      default:
        break;
    }
  };

  const ledTheme = (): LedTheme => {
    if (m.jackpot) return "jackpot";
    const sp = m.spin;
    if (sp) {
      const sc = sp.scenario;
      if (sc.spAt !== undefined && sp.t >= sc.spAt) return "sp";
      if (sc.reachAt !== undefined && sp.t >= sc.reachAt) return "reach";
    }
    return m.mode === "normal" ? "normal" : m.mode === "jitan" ? "jitan" : m.mode;
  };

  const mood = (): Mood => {
    if (m.jackpot) return "jackpot";
    const r = m.spin ? spinMood(m.spin.scenario, m.spin.t) : null;
    if (r) return r;
    return m.mode === "normal" ? "normal" : m.mode === "jitan" ? "chance" : m.mode;
  };

  let last = performance.now();
  let saveT = 0;
  const frame = (t: number) => {
    const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
    last = t;
    now += dt;

    if (hud.firing) {
      fireT += dt;
      if (fireT >= FIRE_INTERVAL) {
        fireT -= FIRE_INTERVAL;
        if (m.useBall()) {
          world.launch(strength());
          audio.se("launch");
        } else {
          hud.setFiring(false);
          hud.toast("玉がありません。玉貸（B）で 125 玉借りられます", now, 3.5);
        }
      }
    } else fireT = Math.min(fireT, FIRE_INTERVAL);

    world.gimmicks = m.gimmicks;
    for (const e of world.advance(dt)) onPhysics(e);
    // PUSH は押さなくても止まる直前に自動で出る
    const sp = m.spin;
    if (sp?.scenario.pushAt !== undefined && !sp.pushed && sp.t >= Math.max(sp.scenario.pushAt, settleAt(sp.scenario) - 0.5)) m.push();
    for (const e of m.update(dt)) onMachine(e);
    later.run(now);
    const stageIn = { mode: m.mode, spin: m.spin, jackpot: m.jackpot };
    const scene = media.update(stageIn);
    view.stage.video.setSoundEnabled(audio.ready && !audio.isMuted);
    audio.setMood(mood(), scene.chain, scene.videoSound);

    const cur = m.spin;
    const pushReady = !!cur && !cur.pushed && cur.scenario.pushAt !== undefined && cur.t >= cur.scenario.pushAt;
    director.update(stageIn);
    lcd.draw({
      now,
      mode: m.mode,
      spinsLeft: m.spinsLeft,
      spin: m.spin,
      jackpot: m.jackpot,
      holds1: m.holds1,
      holds2: m.holds2,
      rightShoot: m.rightShoot,
      aimRight: strength() >= RIGHT_FROM,
      firing: hud.firing,
      chain: m.stats.chain + (m.jackpot && isStMode(m.mode) ? 1 : 0),
    });
    view.update({
      now,
      dt,
      balls: world.visibleBalls(),
      windmillAngle: world.windmillAngle,
      denchuOpen: m.gimmicks.denchu,
      attackerOpen: m.gimmicks.attacker,
      theme: ledTheme(),
      handle: hud.firing ? strength() : 0,
      pushReady,
      trayBalls: m.balls,
      status: {
        holds1: m.holds1.length,
        holds2: m.holds2.length,
        mode: m.mode,
        spinning: !!m.spin,
        futoHit: m.futoBusy,
      },
    });
    view.render();
    if (document.body.dataset.shot !== view.currentShot) document.body.dataset.shot = view.currentShot;

    slumpT += dt;
    if (slumpT >= SLUMP_EVERY && (hud.firing || m.jackpot)) {
      slumpT = 0;
      slump = pushSlump(slump, balance(m));
    }
    hud.update(m, now, pushReady, slump);
    saveT += dt;
    if (saveT >= 5) {
      saveT = 0;
      writeSave(m, slump);
    }
    requestAnimationFrame(frame);
  };
  window.addEventListener("pagehide", () => writeSave(m, slump));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) writeSave(m, slump);
  });
  requestAnimationFrame(frame);
}

void boot();
