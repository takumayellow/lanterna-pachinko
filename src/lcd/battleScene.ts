import type { Chara } from "../game/scenario";
import { drawChara } from "./charaArt";
import { ENEMY_GLOW, drawEnemy, enemyArt, enemyBox, type Enemy } from "./enemyArt";
import { CHARA, drawLantern, drawShadowSeal } from "./heroines";
import { H, W, clamp01, easeOut, flash, hash, lerp, span, text, vGrad, type G } from "./paint";

/**
 * 灯守と敵が撃ち合うバトル（SP の影法師バトルと SPSP の黒嵐バトル）。
 *
 * 入り（敵がせり上がる）→ 交互に攻撃 → 力比べ（ここで当落ボタン）→ 押した瞬間に勝ち負けが分かれる。
 * 体力は勝ち負けにかかわらず両方同じだけ減らし、押す前に結果が分からないようにする。
 * 勝ちは灯守の光が押し勝って敵が砕け、負けは敵の闇が押し勝って画面を呑む。
 */

export interface Battle {
  enemy: Enemy;
  chara: Chara;
  /** バトルが始まる時刻（変動内の秒） */
  from: number;
  /** 力比べを始める時刻 */
  charge: number;
  /** 勝ち負けが分かれる時刻。この段で決着しない（SPSP へ発展する）なら undefined */
  decide?: number;
  win: boolean;
}

const INTRO = 1.6;
/** 攻撃 1 回の長さ */
const BEAT = 1.0;
/** 攻撃が当たる所（BEAT に対する割合） */
const IMPACT = 0.4;
/** 押し勝ってから敵が砕け始めるまで */
const SHATTER_AFTER = 0.45;
const SHATTER_LEN = 1.4;
/** 交互の攻撃で減らす体力（両方同じ） */
const HP_LOSS = 0.62;

const HERO = { x: W * 0.2, y: H * 0.3, h: 470 };
/** 立ち絵は横に広いので、ここから右を透明に溶かして敵に掛からないようにする */
const HERO_FADE = [W * 0.4, W * 0.52] as const;
/** 灯守の攻撃が出る所 */
const HERO_HAND = { x: W * 0.36, y: H * 0.42 };
const FOE: Record<Enemy, { x: number; y: number; h: number }> = {
  storm: { x: W * 0.71, y: H * 0.41, h: 620 },
  abyss: { x: W * 0.71, y: H * 0.41, h: 620 },
  shade: { x: W * 0.71, y: H * 0.43, h: 400 },
};
/** 影法師は群れで出る。主役の後ろに並ぶ子分（位置は主役からのずれ、大きさは主役に対する比） */
const MINIONS = [
  { dx: 170, dy: -110, s: 0.55, phase: 1.3 },
  { dx: -150, dy: -130, s: 0.5, phase: 2.6 },
];
const FOE_NAME: Record<Enemy, string> = { storm: "黒嵐", abyss: "深淵の主", shade: "影法師" };

interface Beat {
  at: number;
  hero: boolean;
}

function beats(b: Battle): Beat[] {
  const out: Beat[] = [];
  for (let at = b.from + INTRO + 0.1, i = 0; at + BEAT <= b.charge; at += BEAT, i++) out.push({ at, hero: i % 2 === 0 });
  return out;
}

interface Pose {
  /** 灯守・敵の位置のずれ */
  heroDx: number;
  foeDx: number;
  foeDy: number;
  heroAlpha: number;
  foeAlpha: number;
  /** 敵が白く光る強さ */
  foeHurt: number;
}

/** バトルの層。図柄より奥に描く */
export function drawBattle(g: G, now: number, b: Battle, t: number): void {
  const dt = t - b.from;
  const bs = beats(b);
  const pose: Pose = { heroDx: 0, foeDx: 0, foeDy: 0, heroAlpha: 1, foeAlpha: 1, foeHurt: 0 };
  // 入り: 敵が下からせり上がり、灯守が左から入る
  const rise = easeOut(dt / 1.2);
  pose.foeDy = (1 - rise) * 260;
  pose.foeAlpha = easeOut(dt / 0.8);
  pose.heroDx = -(1 - easeOut(dt / 0.6)) * 420;

  const cur = bs.find((x) => t >= x.at && t < x.at + BEAT);
  if (cur) applyBeat(pose, b, cur, (t - cur.at) / BEAT, now);
  const decided = b.decide !== undefined && t >= b.decide;
  if (decided) applyOutcome(pose, b, t - b.decide!, now);

  const foe = FOE[b.enemy];
  drawShadowSeal(g, foe.x, foe.y, 300, now * 0.3, ENEMY_GLOW[b.enemy], 0.35 * pose.foeAlpha);
  const shatter = b.win && decided ? t - b.decide! - SHATTER_AFTER : -1;
  if (shatter < 0) drawFoe(g, now, b.enemy, pose);
  else drawShards(g, b.enemy, shatter);

  drawHero(g, b.chara, pose, now);

  if (cur) drawStrike(g, b, cur, (t - cur.at) / BEAT, now, pose);
  if (t >= b.charge) drawClash(g, b, t, now);
  if (decided && !b.win) drawDarkWave(g, b.enemy, t - b.decide!);
  drawHp(g, b, bs, t, dt);
}

/** 決着の後も砕けた敵の欠片を飛ばし続ける（勝ったときだけ） */
export function drawBattleAftermath(g: G, b: Battle, t: number): void {
  if (!b.win || b.decide === undefined) return;
  const p = t - b.decide - SHATTER_AFTER;
  if (p >= 0 && p < SHATTER_LEN) drawShards(g, b.enemy, p);
}

let heroLayer: HTMLCanvasElement | null = null;

/** 灯守を左側に描く。右へ伸びた絵は HERO_FADE で溶かす */
function drawHero(g: G, chara: Chara, pose: Pose, now: number): void {
  const hx = HERO.x + pose.heroDx;
  const y = HERO.y + Math.sin(now * 1.3) * 6;
  heroLayer ??= document.createElement("canvas");
  const layer = heroLayer;
  if (layer.width !== W || layer.height !== H) {
    layer.width = W;
    layer.height = H;
  }
  const lg = layer.getContext("2d")!;
  lg.clearRect(0, 0, W, H);
  if (!drawChara(lg, chara, hx, y, HERO.h)) {
    drawLantern(g, hx, H * 0.36, 100, CHARA[chara].grad, 0.9 * pose.heroAlpha);
    return;
  }
  lg.save();
  lg.globalCompositeOperation = "destination-in";
  const fade = lg.createLinearGradient(HERO_FADE[0] + pose.heroDx, 0, HERO_FADE[1] + pose.heroDx, 0);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  lg.fillStyle = fade;
  lg.fillRect(0, 0, W, H);
  lg.restore();
  g.save();
  g.globalAlpha *= pose.heroAlpha;
  g.drawImage(layer, 0, 0, W, H);
  g.restore();
}

function applyBeat(pose: Pose, b: Battle, beat: Beat, k: number, now: number): void {
  const hit = span(k, IMPACT, IMPACT + 0.35);
  const hurt = k >= IMPACT ? 1 - hit : 0;
  const shake = k >= IMPACT ? Math.sin(now * 70) * 10 * hurt : 0;
  if (beat.hero) {
    // 踏み込んで撃ち、敵がのけぞる
    pose.heroDx += Math.sin(span(k, 0, IMPACT) * Math.PI) * 50;
    // 白く光るのは当たった一瞬だけ。長く光らせると絵が白い塊に見える
    pose.foeHurt = Math.max(pose.foeHurt, k >= IMPACT ? 0.7 * (1 - span(k, IMPACT, IMPACT + 0.15)) : 0);
    pose.foeDx += 36 * hurt + shake;
    return;
  }
  // 影法師は自分で突っ込んでくる
  if (b.enemy === "shade") pose.foeDx -= Math.sin(span(k, 0.05, 0.7) * Math.PI) * (FOE.shade.x - HERO.x - 220);
  else pose.foeDx -= Math.sin(span(k, 0, IMPACT) * Math.PI) * 30;
  pose.heroDx -= 40 * hurt - shake;
  pose.heroAlpha = k >= IMPACT && k < IMPACT + 0.3 && Math.sin(now * 60) > 0 ? 0.55 : 1;
}

function applyOutcome(pose: Pose, b: Battle, dt: number, now: number): void {
  const push = easeOut(dt / 0.35);
  if (b.win) {
    pose.foeHurt = Math.max(pose.foeHurt, 0.85 * push);
    pose.foeDx += push * 40 + Math.sin(now * 80) * 12 * push;
    return;
  }
  pose.heroDx -= push * 80;
  pose.heroAlpha *= 1 - 0.75 * span(dt, 0.3, 1.0);
}

function drawFoe(g: G, now: number, enemy: Enemy, pose: Pose): void {
  const foe = FOE[enemy];
  const float = enemy === "abyss" ? Math.sin(now * 0.9) * 16 : Math.sin(now * 1.1) * 9;
  const x = foe.x + pose.foeDx;
  const y = foe.y + pose.foeDy + float;
  if (enemy === "shade") {
    for (const m of MINIONS) {
      const my = y + m.dy + Math.sin(now * 2.2 + m.phase) * 14;
      drawEnemy(g, "shade", x + m.dx + Math.sin(now * 1.4 + m.phase) * 10, my, foe.h * m.s, 0.85 * pose.foeAlpha, pose.foeHurt * 0.6);
    }
  }
  // 黒嵐はゆっくり身を揺らす
  g.save();
  if (enemy === "storm") {
    g.translate(x, y + foe.h * 0.4);
    g.rotate(Math.sin(now * 0.7) * 0.025);
    g.translate(-x, -(y + foe.h * 0.4));
  }
  const drawn = drawEnemy(g, enemy, x, y, foe.h, pose.foeAlpha, pose.foeHurt);
  g.restore();
  if (!drawn) drawShadowSeal(g, x, y, 130, now * 0.8, ENEMY_GLOW[enemy], 0.9 * pose.foeAlpha);
}

/** 敵の胸のあたり（攻撃の当たる所） */
function foeTarget(enemy: Enemy, pose?: Pose): { x: number; y: number } {
  const foe = FOE[enemy];
  return { x: foe.x + (pose?.foeDx ?? 0) - 20, y: foe.y - foe.h * (enemy === "shade" ? 0.08 : 0.16) };
}

function drawStrike(g: G, b: Battle, beat: Beat, k: number, now: number, pose: Pose): void {
  const from = beat.hero ? HERO_HAND : foeTarget(b.enemy);
  const to = beat.hero ? foeTarget(b.enemy, pose) : { x: HERO.x + 40, y: H * 0.36 };
  g.save();
  g.globalCompositeOperation = "lighter";
  if (beat.hero) heroWeapon(g, b.chara, k, from, to, now);
  else foeWeapon(g, b.enemy, k, from, to, now);
  g.restore();
  if (k >= IMPACT) {
    const color = beat.hero ? CHARA[b.chara].color : ENEMY_GLOW[b.enemy];
    burst(g, to.x, to.y, 190, color, span(k, IMPACT, IMPACT + 0.4));
    flash(g, beat.hero ? "#ffffff" : "#ff4060", 0.22 * (1 - span(k, IMPACT, IMPACT + 0.15)));
  }
}

interface P {
  x: number;
  y: number;
}

const along = (a: P, b: P, p: number): P => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });

/** 灯守ごとの攻撃: 灯の玉 / 傘から降る花びら / 投げる輪刃 / 鈴の音の輪 / 炎の拳 */
function heroWeapon(g: G, chara: Chara, k: number, a: P, b: P, now: number): void {
  const color = CHARA[chara].color;
  const p = easeOut(span(k, 0.15, IMPACT));
  const dir = Math.atan2(b.y - a.y, b.x - a.x);
  switch (chara) {
    case "rose":
      // 少しずつずらして 3 つの灯の玉
      for (let j = 0; j < 3; j++) {
        const pj = easeOut(span(k, 0.12 + j * 0.05, IMPACT + j * 0.03));
        if (pj <= 0 || pj >= 1) continue;
        const end = { x: b.x, y: b.y + (j - 1) * 50 };
        const at = along(a, end, pj);
        const tail = along(a, end, Math.max(0, pj - 0.25));
        glowLine(g, tail.x, tail.y, at.x, at.y, 6, color);
        orb(g, at, 30, color);
      }
      break;
    case "azure":
      // 回る輪刃を投げ、当たった所に十字の斬り跡
      if (p > 0 && p < 1) ringBlade(g, along(a, b, p), 70, now * 24, color);
      if (k >= IMPACT && k < IMPACT + 0.3) {
        const q = span(k, IMPACT, IMPACT + 0.3);
        glowLine(g, b.x - 120, b.y - 120 * q, b.x + 120, b.y + 120 * q, 8 * (1 - q), "#d8f0ff");
        glowLine(g, b.x - 120, b.y + 120 * q, b.x + 120, b.y - 120 * q, 8 * (1 - q), "#d8f0ff");
      }
      break;
    case "amber":
      // 鈴の音が輪になって次々に飛ぶ
      for (let j = 0; j < 4; j++) {
        const pj = span(k, 0.12 + j * 0.06, IMPACT + j * 0.06);
        if (pj <= 0 || pj >= 1) continue;
        soundRing(g, along(a, b, easeOut(pj)), 50 + pj * 70, dir, color, 10 * (1 - pj * 0.5));
      }
      break;
    case "scarlet": {
      // 炎をまとった拳が突っ込む
      if (p > 0 && p < 1) {
        const at = along(a, b, p);
        for (let j = 1; j <= 5; j++) orb(g, along(a, at, 1 - j * 0.07), 26 - j * 3, "#ff7a30");
        flameFist(g, at, dir, color, now);
      }
      break;
    }
    default: {
      // 敵の上で傘を開き、花びらを降らせて何か所も同時に当てる
      const open = span(k, 0.05, 0.2) * (1 - span(k, 0.6, 0.8));
      if (open > 0) umbrella(g, { x: b.x, y: b.y - 200 }, 150, open, color, now);
      for (let j = 0; j < 14; j++) {
        const pj = span(k, 0.12 + hash(j) * 0.15, IMPACT + hash(j + 4) * 0.2);
        if (pj <= 0 || pj >= 1) continue;
        const x = b.x + (hash(j + 9) - 0.5) * 300 + Math.sin(now * 6 + j) * 20;
        petal(g, { x, y: b.y - 200 + pj * 260 }, 16, now * 5 + j, color);
      }
      if (k >= IMPACT) for (let j = 0; j < 4; j++) burst(g, b.x + (hash(j) - 0.5) * 260, b.y + (hash(j + 7) - 0.5) * 300, 110, color, span(k, IMPACT + j * 0.04, IMPACT + 0.3 + j * 0.04));
      break;
    }
  }
}

/** 敵ごとの攻撃: 渦巻く風と稲妻 / 水の波と泡 / 影の爪 */
function foeWeapon(g: G, enemy: Enemy, k: number, a: P, b: P, now: number): void {
  const color = ENEMY_GLOW[enemy];
  switch (enemy) {
    case "storm":
      for (let j = 0; j < 3; j++) {
        const pj = easeOut(span(k, 0.1 + j * 0.05, IMPACT));
        if (pj <= 0 || pj >= 1) continue;
        const start = { x: a.x, y: a.y + (j - 1) * 110 };
        crescent(g, along(start, b, pj), 70, Math.atan2(b.y - start.y, b.x - start.x) + Math.sin(now * 20 + j) * 0.4, "#e8e8f8", 9);
      }
      if (k >= IMPACT && k < IMPACT + 0.25) lightning(g, b.x, b.y, color, Math.floor(now * 20));
      break;
    case "abyss": {
      const p = easeOut(span(k, 0.1, IMPACT));
      if (p > 0 && p < 1) {
        const dir = Math.atan2(b.y - a.y, b.x - a.x);
        crescent(g, along(a, b, p), 150, dir, color, 22);
        crescent(g, along(a, b, p * 0.85), 110, dir, "#c8e8ff", 8);
      }
      g.strokeStyle = "rgba(200,235,255,0.8)";
      g.lineWidth = 3;
      for (let j = 0; j < 14; j++) {
        const pj = span(k, 0.05 + hash(j) * 0.2, 0.6 + hash(j) * 0.3);
        if (pj <= 0 || pj >= 1) continue;
        const pos = along(a, b, pj);
        g.beginPath();
        g.arc(pos.x + (hash(j + 3) - 0.5) * 200, pos.y + (hash(j + 5) - 0.5) * 220 - pj * 40, 6 + hash(j + 9) * 16, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    }
    default:
      // 影法師そのものが突っ込むので、爪の先の光だけ
      if (k > 0.3 && k < IMPACT + 0.1) glowLine(g, b.x + 60, b.y, b.x + 260, b.y - 30, 6, "#f0f0ff");
      break;
  }
}

/** 力比べ: 両方の光が真ん中でぶつかり、押した瞬間に勝った方へ押し切る */
function drawClash(g: G, b: Battle, t: number, now: number): void {
  const k = span(t, b.charge, b.charge + 0.4);
  const hero = HERO_HAND;
  const foe = foeTarget(b.enemy);
  let mid = 0.5 + Math.sin(now * 3.1) * 0.05;
  let heroW = 1;
  let foeW = 1;
  if (b.decide !== undefined && t >= b.decide) {
    const p = easeOut((t - b.decide) / 0.35);
    mid = b.win ? lerp(mid, 1, p) : lerp(mid, 0, p);
    if (b.win) heroW = 1 + p * 1.6;
    else foeW = 1 + p * 1.6;
    // 押し切った後は負けた側の光が消える
    if (b.win) foeW *= 1 - p;
    else heroW *= 1 - p;
    if (t - b.decide > SHATTER_AFTER + 0.3) return;
  }
  const at = along(hero, foe, mid);
  const heroColor = CHARA[b.chara].color;
  const foeColor = ENEMY_GLOW[b.enemy];
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = k;
  const wob = 1 + Math.sin(now * 40) * 0.12;
  if (heroW > 0) glowLine(g, hero.x, hero.y, at.x, at.y, 30 * heroW * wob, heroColor);
  if (foeW > 0) glowLine(g, foe.x, foe.y, at.x, at.y, 30 * foeW * wob, foeColor);
  const r = 70 + Math.sin(now * 25) * 10;
  const gr = g.createRadialGradient(at.x, at.y, 4, at.x, at.y, r * 2);
  gr.addColorStop(0, "rgba(255,255,255,0.95)");
  gr.addColorStop(0.35, "rgba(255,230,255,0.5)");
  gr.addColorStop(1, "rgba(255,200,255,0)");
  g.fillStyle = gr;
  g.fillRect(at.x - r * 2, at.y - r * 2, r * 4, r * 4);
  // 火花
  g.strokeStyle = "#fff";
  g.lineWidth = 3;
  const seed = Math.floor(now * 30);
  for (let j = 0; j < 10; j++) {
    const ang = hash(seed * 11 + j) * Math.PI * 2;
    const len = 40 + hash(seed * 7 + j) * 110;
    g.beginPath();
    g.moveTo(at.x + Math.cos(ang) * 20, at.y + Math.sin(ang) * 20);
    g.lineTo(at.x + Math.cos(ang) * len, at.y + Math.sin(ang) * len);
    g.stroke();
  }
  g.restore();
}

/** 負け: 敵の闇が広がって画面を呑む */
function drawDarkWave(g: G, enemy: Enemy, dt: number): void {
  const foe = FOE[enemy];
  const k = easeOut(span(dt, 0.2, 1.1));
  if (k <= 0) return;
  const r = 60 + k * 1300;
  g.save();
  const gr = g.createRadialGradient(foe.x, foe.y, r * 0.2, foe.x, foe.y, r);
  gr.addColorStop(0, "rgba(10,0,20,0.85)");
  gr.addColorStop(0.75, "rgba(30,0,40,0.7)");
  gr.addColorStop(1, "rgba(60,0,60,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  // 闇の縁で伸びる触手
  g.strokeStyle = ENEMY_GLOW[enemy];
  g.globalAlpha = 0.5 * (1 - span(dt, 0.9, 1.5));
  g.lineWidth = 5;
  for (let j = 0; j < 9; j++) {
    const ang = Math.PI * (0.55 + (j / 8) * 0.9);
    g.beginPath();
    g.moveTo(foe.x, foe.y);
    const len = r * (0.6 + hash(j) * 0.3);
    const bend = (hash(j + 4) - 0.5) * 1.2;
    g.quadraticCurveTo(
      foe.x + Math.cos(ang + bend) * len * 0.5,
      foe.y + Math.sin(ang + bend) * len * 0.5,
      foe.x + Math.cos(ang) * len,
      foe.y + Math.sin(ang) * len,
    );
    g.stroke();
  }
  g.restore();
}

/** 体力のゲージ。攻撃が当たるたびに減る。両方同じ割合で減らすので、押す前に勝ち負けは分からない */
function drawHp(g: G, b: Battle, bs: Beat[], t: number, dt: number): void {
  const total = { hero: bs.filter((x) => x.hero).length, foe: bs.filter((x) => !x.hero).length };
  const landed = (hero: boolean): number => bs.filter((x) => x.hero === hero && t >= x.at + IMPACT * BEAT).length;
  // 片方しか攻撃しない短いバトルでは減らさない（片方だけ減ると勝ち負けが透ける）
  const lost = (n: number, of: number): number => (total.hero === 0 || total.foe === 0 ? 0 : (HP_LOSS * n) / of);
  let heroHp = 1 - lost(landed(false), total.foe);
  let foeHp = 1 - lost(landed(true), total.hero);
  if (b.decide !== undefined && t >= b.decide) {
    const p = easeOut(span(t, b.decide + 0.2, b.decide + SHATTER_AFTER));
    if (b.win) foeHp *= 1 - p;
    else heroHp *= 1 - p;
  }
  const a = easeOut((dt - 0.6) / 0.4);
  if (a <= 0) return;
  g.save();
  g.globalAlpha = a;
  const y = 156;
  hpBar(g, 40, y, 380, heroHp, CHARA[b.chara].color, false);
  hpBar(g, W - 420, y, 380, foeHp, ENEMY_GLOW[b.enemy], true);
  const ch = CHARA[b.chara];
  text(g, ch.name, 40 + 60, y - 22, { size: 30, fill: vGrad(g, y - 37, y - 7, [...ch.grad]), stroke: "#fff", strokeW: 5, outer: "#14061e", outerW: 11 });
  text(g, FOE_NAME[b.enemy], W - 40 - 80, y - 22, { size: 30, fill: "#fff", stroke: "#3a0018", strokeW: 6, outer: "#14061e", outerW: 11 });
  g.restore();
}

function hpBar(g: G, x: number, y: number, w: number, hp: number, color: string, right: boolean): void {
  const h = 20;
  g.fillStyle = "rgba(0,0,0,0.6)";
  g.beginPath();
  g.roundRect(x - 4, y - 4, w + 8, h + 8, 8);
  g.fill();
  const fw = Math.max(0, w * clamp01(hp));
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, "#ffffff");
  gr.addColorStop(0.35, color);
  gr.addColorStop(1, "#200010");
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(right ? x + w - fw : x, y, fw, h, 6);
  g.fill();
}

// ---- 砕ける敵

interface Shard {
  /** 絵の中心からの多角形（-0.5〜0.5 の割合） */
  pts: P[];
  /** 飛ぶ向きと速さ・回る速さ */
  vx: number;
  vy: number;
  spin: number;
}

const SHARDS: Shard[] = makeShards();

function makeShards(): Shard[] {
  const n = 12;
  const rim: P[] = [];
  const mid: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + hash(i) * 0.5) / n) * Math.PI * 2;
    rim.push({ x: Math.cos(a) * 0.75, y: Math.sin(a) * 0.75 });
    const r = 0.22 + hash(i + 30) * 0.14;
    mid.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  const out: Shard[] = [];
  const add = (pts: P[], seed: number): void => {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const len = Math.hypot(cx, cy) || 0.1;
    const speed = 500 + hash(seed) * 600;
    out.push({ pts, vx: (cx / len) * speed, vy: (cy / len) * speed - 250, spin: (hash(seed + 5) - 0.5) * 7 });
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    add([{ x: 0, y: 0 }, mid[i], mid[j]], i);
    add([mid[i], rim[i], rim[j], mid[j]], i + 50);
  }
  return out;
}

function drawShards(g: G, enemy: Enemy, p: number): void {
  const sp = enemyArt(enemy);
  const foe = FOE[enemy];
  const k = clamp01(p / SHATTER_LEN);
  // 砕けた瞬間の白い光
  flash(g, "#ffffff", 0.75 * (1 - span(p, 0, 0.3)));
  burst(g, foe.x, foe.y, 520, ENEMY_GLOW[enemy], span(p, 0, 0.6));
  if (!sp) return;
  const box = enemyBox(sp, foe.x, foe.y, foe.h);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  g.save();
  g.globalAlpha = 1 - span(k, 0.55, 1);
  for (const s of SHARDS) {
    const ox = s.vx * p;
    const oy = s.vy * p + 900 * p * p;
    g.save();
    g.translate(cx + ox, cy + oy);
    g.rotate(s.spin * p);
    g.translate(-cx, -cy);
    g.beginPath();
    s.pts.forEach((q, i) => (i === 0 ? g.moveTo(cx + q.x * box.w, cy + q.y * box.h) : g.lineTo(cx + q.x * box.w, cy + q.y * box.h)));
    g.closePath();
    g.clip();
    g.drawImage(sp.img, box.x, box.y, box.w, box.h);
    g.globalAlpha *= 1 - span(p, 0, 0.5);
    g.drawImage(sp.white, box.x, box.y, box.w, box.h);
    g.restore();
  }
  g.restore();
}

// ---- 描きもの

function glowLine(g: G, x0: number, y0: number, x1: number, y1: number, w: number, color: string): void {
  g.save();
  g.lineCap = "round";
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 30;
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = "#fff";
  g.lineWidth = w * 0.4;
  g.stroke();
  g.restore();
}

function crescent(g: G, at: P, r: number, dir: number, color: string, w: number): void {
  g.save();
  g.translate(at.x, at.y);
  g.rotate(dir);
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 26;
  g.lineCap = "round";
  g.lineWidth = w;
  g.beginPath();
  g.arc(-r * 0.6, 0, r, -1.0, 1.0);
  g.stroke();
  g.strokeStyle = "#fff";
  g.lineWidth = w * 0.35;
  g.stroke();
  g.restore();
}

function lightning(g: G, x: number, y: number, color: string, seed: number): void {
  g.save();
  g.strokeStyle = "#fff";
  g.shadowColor = color;
  g.shadowBlur = 30;
  g.lineWidth = 6;
  g.beginPath();
  let lx = x + (hash(seed) - 0.5) * 80;
  g.moveTo(lx, 0);
  for (let ly = 0; ly < y; ly += 50) {
    lx += (hash(seed * 13 + ly) - 0.5) * 90;
    g.lineTo(lx, ly);
  }
  g.lineTo(x, y);
  g.stroke();
  g.restore();
}

/** 光の玉 */
function orb(g: G, at: P, r: number, color: string): void {
  if (r <= 0) return;
  const gr = g.createRadialGradient(at.x, at.y, 0, at.x, at.y, r * 1.6);
  gr.addColorStop(0, "#ffffff");
  gr.addColorStop(0.35, color);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.beginPath();
  g.arc(at.x, at.y, r * 1.6, 0, Math.PI * 2);
  g.fill();
}

/** 外に刃の付いた輪。rot で回す */
function ringBlade(g: G, at: P, r: number, rot: number, color: string): void {
  g.save();
  g.translate(at.x, at.y);
  g.rotate(rot);
  g.fillStyle = "#fff";
  g.shadowColor = color;
  g.shadowBlur = 26;
  g.beginPath();
  for (let j = 0; j < 8; j++) {
    const a = (j / 8) * Math.PI * 2;
    g.lineTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75);
    g.lineTo(Math.cos(a + 0.15) * r, Math.sin(a + 0.15) * r);
    g.lineTo(Math.cos(a + 0.5) * r * 0.78, Math.sin(a + 0.5) * r * 0.78);
  }
  g.closePath();
  g.arc(0, 0, r * 0.5, 0, Math.PI * 2, true);
  g.fill("evenodd");
  g.restore();
}

/** 進む向きにふくらんだ音の輪 */
function soundRing(g: G, at: P, r: number, dir: number, color: string, w: number): void {
  g.save();
  g.translate(at.x, at.y);
  g.rotate(dir);
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.lineCap = "round";
  g.lineWidth = w;
  g.beginPath();
  g.ellipse(0, 0, r * 0.45, r, 0, -1.2, 1.2);
  g.stroke();
  g.strokeStyle = "#fff";
  g.lineWidth = w * 0.35;
  g.stroke();
  g.restore();
}

/** 炎をまとった拳 */
function flameFist(g: G, at: P, dir: number, color: string, now: number): void {
  g.save();
  g.translate(at.x, at.y);
  g.rotate(dir);
  g.shadowColor = color;
  g.shadowBlur = 30;
  for (let j = 0; j < 5; j++) {
    const flick = 1 + Math.sin(now * 30 + j * 1.7) * 0.15;
    g.fillStyle = j % 2 ? "#ffb040" : color;
    g.beginPath();
    g.moveTo(10, (j - 2) * 14);
    g.quadraticCurveTo(-60 * flick, (j - 2) * 22, -120 * flick, (j - 2) * 30);
    g.quadraticCurveTo(-50 * flick, (j - 2) * 6, 10, (j - 2) * 14 + 10);
    g.closePath();
    g.fill();
  }
  g.fillStyle = "#fff";
  g.beginPath();
  g.roundRect(-30, -34, 64, 68, 20);
  g.fill();
  g.restore();
}

/** 開いた和傘を上から見た形。k で開き、ゆっくり回る */
function umbrella(g: G, at: P, r: number, k: number, color: string, now: number): void {
  g.save();
  g.translate(at.x, at.y);
  g.scale(1, 0.4);
  g.rotate(now * 1.5);
  g.globalAlpha *= k;
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 20;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(0, 0, r * k, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
  }
  g.stroke();
  g.restore();
}

/** 花びら 1 枚 */
function petal(g: G, at: P, r: number, rot: number, color: string): void {
  g.save();
  g.translate(at.x, at.y);
  g.rotate(rot);
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 14;
  g.beginPath();
  g.moveTo(0, -r);
  g.quadraticCurveTo(r * 0.8, 0, 0, r);
  g.quadraticCurveTo(-r * 0.8, 0, 0, -r);
  g.fill();
  g.restore();
}

/** 当たった所に広がる輪と光の筋。k は 0〜1 */
function burst(g: G, x: number, y: number, r: number, color: string, k: number): void {
  if (k <= 0 || k >= 1) return;
  const e = easeOut(k);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = 1 - k;
  const gr = g.createRadialGradient(x, y, 0, x, y, r * e);
  gr.addColorStop(0, "rgba(255,255,255,0.9)");
  gr.addColorStop(0.5, color);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r * e, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#fff";
  g.lineWidth = 6 * (1 - k);
  g.beginPath();
  g.arc(x, y, r * 1.1 * e, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}
