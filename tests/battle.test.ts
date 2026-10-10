import { describe, expect, it } from "vitest";
import { judge, makeHold } from "../src/game/lottery";
import { mulberry32 } from "../src/game/rng";
import { buildScenario, settleAt, type Scenario } from "../src/game/scenario";
import { battleOf, type SpinView } from "../src/lcd/spinScene";

function* scenarios(seed: number, n: number): Generator<Scenario> {
  const rand = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const hold = makeHold(1, "normal", rand);
    yield buildScenario(judge(hold, "normal", rand), "normal", k % 4, hold.color, rand);
  }
}

/** battleOf は図柄の動き（plan）を読まないので空にしておく */
const NO_PLAN = {} as SpinView["plan"];

function view(s: Scenario, t: number, pushedAt?: number): SpinView {
  return { scenario: s, plan: NO_PLAN, t, pushedAt };
}

describe("バトルの相手", () => {
  it("SPSP の黒嵐・深淵の主と，SP の影法師リーチで戦う", () => {
    const seen = new Set<string>();
    for (const s of scenarios(5, 100_000)) {
      if (s.spspAt !== undefined) {
        const b = battleOf(view(s, s.spspAt));
        if (s.spsp === "storm") expect(b?.enemy).toBe("storm");
        else if (s.spsp === "abyss") expect(b?.enemy).toBe("abyss");
        else expect(b).toBeNull();
        if (b) seen.add(b.enemy);
      }
      if (s.spAt !== undefined) {
        const b = battleOf(view(s, s.spAt));
        const shade = s.sp === "shade" || s.spspAt !== undefined;
        expect(b?.enemy ?? null).toBe(shade ? "shade" : null);
        if (b) seen.add(b.enemy);
      }
      if (s.spAt === undefined && s.spspAt === undefined) expect(battleOf(view(s, s.duration))).toBeNull();
    }
    expect([...seen].sort()).toEqual(["abyss", "shade", "storm"]);
  });

  it("勝ち負けは当たりで決まり，復活の変動では一度負ける", () => {
    for (const s of scenarios(9, 50_000)) {
      if (s.spspAt === undefined) continue;
      const b = battleOf(view(s, s.spspAt));
      if (b) expect(b.win).toBe(s.hit && !s.revival);
    }
  });

  it("撃ち合いは決着より前に終わり，決着はボタンを押した時に来る", () => {
    for (const s of scenarios(13, 50_000)) {
      const at = s.spspAt ?? s.spAt;
      if (at === undefined) continue;
      const b = battleOf(view(s, at));
      if (!b || b.decide === undefined) continue;
      expect(b.charge).toBeGreaterThan(b.from);
      expect(b.charge).toBeLessThanOrEqual(b.decide);
      expect(b.decide).toBeLessThanOrEqual(settleAt(s));
      if (s.pushAt !== undefined) {
        const pushed = s.pushAt + 0.4;
        expect(battleOf(view(s, at, pushed))?.decide).toBe(pushed);
      }
    }
  });

  it("SPSP へ発展する影法師バトルは決着をつけない", () => {
    let n = 0;
    for (const s of scenarios(17, 50_000)) {
      if (s.spspAt === undefined || s.spAt === undefined) continue;
      const b = battleOf(view(s, s.spAt));
      expect(b?.decide).toBeUndefined();
      expect(b?.charge).toBe(s.spspAt);
      n++;
    }
    expect(n).toBeGreaterThan(0);
  });
});
