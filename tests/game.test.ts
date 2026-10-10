import { describe, expect, it } from "vitest";
import { HOLD_COLORS, judge, makeHold, outcome, recolor, type DrawResult, type Hold, type HoldColor } from "../src/game/lottery";
import { Machine, type MachineEvent } from "../src/game/machine";
import { mulberry32 } from "../src/game/rng";
import { buildScenario, type Scenario, type ScenarioKind } from "../src/game/scenario";
import { reliabilityTables } from "../src/game/reliability";
import { hitProb, PRESET, PRESETS, REF_LOW_PROB, SPEC, spinsFor, stContinueRate, type Mode } from "../src/game/spec";

function holdWith(kind: 1 | 2, r: number, sub: number, roll = 0.5): Hold {
  return { kind, r, sub, roll, color: "white" };
}

describe("lottery", () => {
  it("当選確率はモードの確率どおり", () => {
    const rand = mulberry32(1);
    const N = 400_000;
    for (const mode of ["normal", "rush", "lt"] as Mode[]) {
      const p = hitProb(mode);
      let hits = 0;
      for (let i = 0; i < N; i++) if (judge(makeHold(1, mode, rand), mode, rand).hit) hits++;
      const sd = Math.sqrt(N * p * (1 - p));
      expect(Math.abs(hits - N * p)).toBeLessThan(4 * sd);
    }
  });

  it("通常時の確率はプリセットで変わるが、演出の基準は 1/319.9 に固定", () => {
    // テストには location が無いので既定（甘）になる
    expect(PRESET).toBe("ama");
    expect(SPEC.lowProb).toBe(PRESETS.ama.lowProb);
    expect(1 / PRESETS.full.lowProb).toBeCloseTo(319.9, 6);
    expect(REF_LOW_PROB).toBe(PRESETS.full.lowProb);
  });

  it("ST の継続率は 灯火RUSH ≒ 50%、超RUSH ≒ 80%", () => {
    expect(stContinueRate("rush")).toBeCloseTo(0.495, 2);
    expect(stContinueRate("lt")).toBeCloseTo(0.795, 2);
    expect(spinsFor("rush")).toBe(100);
    expect(spinsFor("lt")).toBe(130);
    expect(spinsFor("normal")).toBe(0);
  });

  it("ヘソの振り分け: 全回転 1% は超RUSH、7 揃いは灯火RUSH、チャレンジは成否で分かれる", () => {
    const rand = mulberry32(2);
    expect(judge(holdWith(1, 0, 0.005), "normal", rand)).toMatchObject({ bonus: "aurora", rounds: 10, next: "lt", number: 7 });
    expect(judge(holdWith(1, 0, 0.1), "normal", rand)).toMatchObject({ bonus: "lantern", rounds: 3, next: "rush", number: 7, promote: false });
    const win = judge(holdWith(1, 0, 0.9, 0.1), "normal", rand);
    const lose = judge(holdWith(1, 0, 0.9, 0.9), "normal", rand);
    expect(win).toMatchObject({ bonus: "challenge", rounds: 3, next: "rush", promote: true });
    expect(lose).toMatchObject({ bonus: "challenge", rounds: 3, next: "normal", promote: false });
    expect(win.number).not.toBe(7);
    expect(lose.number).not.toBe(7);
  });

  it("ヘソ当たりの 70% が ST に入る（灯火RUSH 69% + 超RUSH 1%）", () => {
    const rand = mulberry32(3);
    const N = 200_000;
    let st = 0;
    for (let i = 0; i < N; i++) if (judge(holdWith(1, 0, rand(), rand()), "normal", rand).next !== "normal") st++;
    expect(st / N).toBeCloseTo(0.7, 2);
  });

  it("灯火RUSH中は 1500 で超RUSH、超RUSH 中は 3000 が 75%", () => {
    const rand = mulberry32(4);
    expect(judge(holdWith(2, 0, 0.5), "rush", rand)).toMatchObject({ bonus: "aurora", rounds: 10, next: "lt" });
    expect(judge(holdWith(2, 0, 0.5), "lt", rand)).toMatchObject({ bonus: "upper", rounds: 20, next: "lt", number: 7 });
    expect(judge(holdWith(2, 0, 0.9), "lt", rand)).toMatchObject({ bonus: "lower", rounds: 5, next: "lt" });
    expect(SPEC.rounds.upper * SPEC.roundCount * SPEC.payout.attacker).toBe(3000);
    expect(SPEC.rounds.challenge * SPEC.roundCount * SPEC.payout.attacker).toBe(450);
  });

  it("保留の信頼度は 白 < 青 < 緑 < 赤 < 金 < ゼブラ < 虹、虹は ST 濃厚", () => {
    const rand = mulberry32(5);
    const seen = Object.fromEntries(HOLD_COLORS.map((c) => [c, [0, 0]])) as Record<HoldColor, [number, number]>;
    let rainbowToNormal = 0;
    for (let i = 0; i < 2_000_000; i++) {
      const h = makeHold(1, "normal", rand);
      const o = outcome(h, "normal");
      seen[h.color][o.hit ? 0 : 1]++;
      if (h.color === "rainbow" && o.next === "normal") rainbowToNormal++;
    }
    const rate = (c: HoldColor) => seen[c][0] / Math.max(1, seen[c][0] + seen[c][1]);
    for (let i = 1; i < HOLD_COLORS.length - 1; i++) expect(rate(HOLD_COLORS[i - 1])).toBeLessThan(rate(HOLD_COLORS[i]));
    expect(rate("rainbow")).toBe(1);
    expect(rainbowToNormal).toBe(0);
  });
});

describe("recolor", () => {
  it("通常時に当たりだった保留も、ST でハズレになるなら虹にはならない", () => {
    const rand = mulberry32(5);
    // 1/99.9 では当たり、1/146.8 ではハズレになる乱数
    const hold = holdWith(1, 0.008, 0.5);
    expect(outcome(hold, "normal").hit).toBe(true);
    expect(outcome(hold, "rush").hit).toBe(false);
    for (let i = 0; i < 5000; i++) expect(recolor({ ...hold, color: "rainbow" }, "rush", rand).color).not.toBe("rainbow");
  });
});

describe("reliability", () => {
  it("当たり時の出現率と信頼度からハズレ時の出現率を逆算できる", () => {
    const q = 1 / 319.9;
    const t = reliabilityTables({ none: { hit: 50 }, a: { hit: 30, rel: 0.2 }, b: { hit: 20, rel: 0.9 } }, q);
    const rel = (k: "a" | "b") => (q * t.onHit[k]) / (q * t.onHit[k] + (1 - q) * t.onMiss[k]);
    expect(rel("a")).toBeCloseTo(0.2, 6);
    expect(rel("b")).toBeCloseTo(0.9, 6);
    expect(t.onMiss.none + t.onMiss.a + t.onMiss.b).toBeCloseTo(1, 9);
  });

  it("既定の選択肢が無い表や、ハズレ側が 1 を超える表は作れない", () => {
    expect(() => reliabilityTables({ a: { hit: 1, rel: 0.5 } }, 0.01)).toThrow();
    expect(() => reliabilityTables({ none: { hit: 1 }, a: { hit: 99, rel: 0.0001 } }, 0.5)).toThrow();
  });
});

describe("scenario", () => {
  it("当たりは 3 つ揃い、ハズレは揃わない。リーチなしは左右も揃わない", () => {
    const rand = mulberry32(6);
    for (let i = 0; i < 5000; i++) {
      const mode: Mode = rand() < 0.5 ? "normal" : "rush";
      const hold = makeHold(1, mode, rand);
      const result = judge(hold, mode, rand);
      const s = buildScenario(result, mode, Math.floor(rand() * 4), hold.color, rand);
      const [l, c, r] = s.final;
      if (s.hit) expect(l === c && c === r).toBe(true);
      else expect(l === c && c === r).toBe(false);
      if (!s.hit && s.kind === "hazure") expect(l).not.toBe(r);
      if (!s.hit && s.kind !== "hazure") expect(l).toBe(r);
      // 中リールが最後に止まり、変動はその後に終わる
      expect(s.stops[1]).toBeGreaterThanOrEqual(Math.max(s.stops[0], s.stops[2]));
      expect(s.duration).toBeGreaterThan(s.stops[1]);
    }
  });

  it("信頼度は リーチ < SP < SPSP の順に上がる", () => {
    const rand = mulberry32(7);
    const seen: Record<ScenarioKind, [number, number]> = {
      hazure: [0, 0],
      reach: [0, 0],
      sp: [0, 0],
      spsp: [0, 0],
      zenkaiten: [0, 0],
      sudden: [0, 0],
    };
    for (let i = 0; i < 300_000; i++) {
      const hold = makeHold(1, "normal", rand);
      const result = judge(hold, "normal", rand);
      const s = buildScenario(result, "normal", 1, hold.color, rand);
      seen[s.kind][result.hit ? 0 : 1]++;
    }
    const rate = (k: ScenarioKind) => seen[k][0] / (seen[k][0] + seen[k][1]);
    expect(rate("reach")).toBeLessThan(rate("sp"));
    expect(rate("sp")).toBeLessThan(rate("spsp"));
    expect(rate("zenkaiten")).toBe(1);
    expect(seen.hazure[0]).toBe(0);
  });

  it("リーチ・予告・タイトルの信頼度は表の値（1/319.9 換算）に合う", () => {
    const rand = mulberry32(17);
    const q = REF_LOW_PROB;
    const HIT: DrawResult = { hit: true, bonus: "lantern", rounds: 3, next: "rush", number: 7, promote: false };
    const MISS: DrawResult = { hit: false, bonus: null, rounds: 0, next: "normal", number: 0, promote: false };
    const feats: [string, number, (s: Scenario) => boolean][] = [
      ["楽曲", 0.05, (s) => s.sp === "song"],
      ["日常", 0.15, (s) => s.sp === "daily"],
      ["影法師", 0.3, (s) => s.sp === "shade"],
      ["黒嵐", 0.35, (s) => s.spsp === "storm"],
      ["深淵", 0.51, (s) => s.spsp === "abyss"],
      ["ストーリー", 0.7, (s) => s.spsp === "story"],
      ["SU4", 0.12, (s) => s.notices.stepUp === 4],
      ["SU5", 0.4, (s) => s.notices.stepUp === 5],
      ["セリフ赤", 0.15, (s) => s.cutin === "red"],
      ["セリフ金", 0.55, (s) => s.cutin === "gold"],
      ["金扉", 0.7, (s) => s.notices.goldDoor],
      ["ロゴ落下", 0.35, (s) => s.notices.logo === "drop"],
      ["ロゴ傾く", 0.8, (s) => s.notices.logo === "tilt"],
      ["影の帳", 0.2, (s) => s.notices.zone === "barrier"],
      ["影の帳赤", 0.62, (s) => s.notices.zone === "red"],
      ["ライン紫", 0.25, (s) => s.notices.reachLine === "purple"],
      ["ライン赤", 0.5, (s) => s.notices.reachLine === "red"],
      ["ライン金", 0.91, (s) => s.notices.reachLine === "gold"],
      ["ルミ", 0.9, (s) => s.notices.lumi],
      ["群", 0.7, (s) => s.notices.group],
      ["ジェム金", 0.9, (s) => s.notices.gem],
      ["タイトル赤", 0.5, (s) => s.title === "red"],
      ["タイトル金", 0.8, (s) => s.title === "gold"],
    ];
    const freq = (res: DrawResult, n: number) => {
      const c = feats.map(() => 0);
      for (let i = 0; i < n; i++) {
        const s = buildScenario(res, "normal", 1, "white", rand);
        feats.forEach(([, , f], j) => {
          if (f(s)) c[j]++;
        });
      }
      return c.map((x) => x / n);
    };
    const onHit = freq(HIT, 100_000);
    const onMiss = freq(MISS, 1_500_000);
    feats.forEach(([name, target], j) => {
      const rel = (q * onHit[j]) / (q * onHit[j] + (1 - q) * onMiss[j]);
      expect([name, Math.abs(rel - target) < 0.035]).toEqual([name, true]);
    });
    expect(onHit.every((x) => x > 0)).toBe(true);
  });
});

describe("machine", () => {
  /** 当たるまでヘソに入れ続け、大当たりを最後まで消化する */
  function playUntilJackpotEnds(m: Machine, attackerPerRound: number = SPEC.roundCount): MachineEvent[] {
    const all: MachineEvent[] = [];
    for (let t = 0; t < 20_000; t += 0.05) {
      if (!m.jackpot && m.holds1.length < 2) m.input("heso");
      if (m.gimmicks.attacker && attackerPerRound > 0) for (let i = 0; i < attackerPerRound; i++) m.input("attacker");
      const ev = m.update(0.05);
      all.push(...ev);
      if (ev.some((e) => e.type === "jackpot-end")) return all;
    }
    throw new Error("jackpot never ended");
  }

  it("ヘソ入賞 → 変動 → 大当たり → ラウンド消化 → モード移行", () => {
    const m = new Machine(mulberry32(8));
    const ev = playUntilJackpotEnds(m);
    const start = ev.find((e) => e.type === "jackpot-start");
    const end = ev.find((e) => e.type === "jackpot-end");
    expect(start && end).toBeTruthy();
    if (start?.type !== "jackpot-start" || end?.type !== "jackpot-end") return;
    const rounds = ev.filter((e) => e.type === "round-start").length;
    expect(rounds).toBe(start.result.rounds);
    expect(end.payout).toBe(rounds * SPEC.roundCount * SPEC.payout.attacker);
    expect(m.mode).toBe(start.result.next);
    expect(m.spinsLeft).toBe(spinsFor(m.mode));
    expect(m.stats.hits).toHaveLength(1);
  });

  it("アタッカーに入らないラウンドは最長開放時間で閉じる", () => {
    const m = new Machine(mulberry32(9));
    const ev = playUntilJackpotEnds(m, 0);
    const ends = ev.filter((e) => e.type === "round-end");
    expect(ends.length).toBeGreaterThan(0);
    for (const e of ends) if (e.type === "round-end") expect(e.count).toBe(0);
  });

  it("保留は 4 個まで", () => {
    const m = new Machine(mulberry32(10));
    for (let i = 0; i < 10; i++) m.input("heso");
    expect(m.holds1).toHaveLength(SPEC.maxHold);
    expect(m.balls).toBe(10 * SPEC.payout.heso);
  });

  it("電サポ中はゲート通過で電チューが開き、ST は規定回数で終わる", () => {
    const m = new Machine(mulberry32(11));
    m.mode = "rush";
    m.spinsLeft = spinsFor("rush");
    m.input("gate");
    const opened: boolean[] = [];
    for (let t = 0; t < 8; t += 0.02) for (const e of m.update(0.02)) if (e.type === "denchu") opened.push(e.open);
    expect(opened[0]).toBe(true);
    expect(opened[opened.length - 1]).toBe(false);
    expect(opened.filter((o) => o)).toHaveLength(SPEC.futo.supportOpen.length);

    // 特図2 をハズレ固定で規定回数消化させると通常に戻る
    const miss = new Machine(() => 0.999);
    miss.mode = "rush";
    miss.spinsLeft = spinsFor("rush");
    let spins = 0;
    for (let t = 0; t < 2000 && miss.mode === "rush"; t += 0.05) {
      if (miss.holds2.length < 1) miss.input("denchu");
      for (const e of miss.update(0.05)) if (e.type === "spin-end") spins++;
    }
    expect(miss.mode).toBe("normal");
    expect(spins).toBe(spinsFor("rush"));
  });

  it("特図2 を優先して消化する", () => {
    const m = new Machine(mulberry32(12));
    m.input("heso");
    m.input("denchu");
    const ev = m.update(0.01);
    const start = ev.find((e) => e.type === "spin-start");
    expect(start?.type === "spin-start" && start.kind).toBe(2);
  });

  it("PUSH は受付中だけ効く", () => {
    const m = new Machine(mulberry32(13));
    expect(m.push()).toBe(false);
  });

  it("玉貸しと発射", () => {
    const m = new Machine(mulberry32(14));
    expect(m.useBall()).toBe(false);
    m.rent();
    expect(m.balls).toBe(SPEC.rent.balls);
    expect(m.invested).toBe(SPEC.rent.yen);
    expect(m.useBall()).toBe(true);
    expect(m.balls).toBe(SPEC.rent.balls - 1);
  });
});
