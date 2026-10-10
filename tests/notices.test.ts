import { describe, expect, it } from "vitest";
import { judge, makeHold } from "../src/game/lottery";
import { DOOR_LEN, LUMI_LEN, REVIVAL_UP, noticeCues, noticeTimes } from "../src/game/notices";
import { mulberry32 } from "../src/game/rng";
import { buildScenario, type Scenario } from "../src/game/scenario";
import { planReels, reelPos, symbolAt } from "../src/lcd/reels";

function* scenarios(seed: number, n: number): Generator<Scenario> {
  const rand = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const hold = makeHold(1, "normal", rand);
    yield buildScenario(judge(hold, "normal", rand), "normal", k % 4, hold.color, rand);
  }
}

describe("予告の時刻", () => {
  it("リーチ前の予告はリーチまでに出し終わり、重ならない", () => {
    let seen = 0;
    for (const s of scenarios(31, 200_000)) {
      if (s.reachAt === undefined) continue;
      const nt = noticeTimes(s);
      if (nt.goldDoor !== undefined && nt.steps.length) expect(nt.steps[0]).toBeGreaterThanOrEqual(nt.goldDoor + DOOR_LEN - 1e-9);
      for (let i = 1; i < nt.steps.length; i++) expect(nt.steps[i]).toBeGreaterThan(nt.steps[i - 1]);
      if (nt.lumi !== undefined) {
        expect(nt.lumi + LUMI_LEN).toBeLessThanOrEqual(s.reachAt + 1e-9);
        if (nt.steps.length) expect(nt.lumi).toBeGreaterThan(nt.steps[nt.steps.length - 1]);
      }
      const last = nt.steps.length ? nt.steps[nt.steps.length - 1] : -Infinity;
      expect(last).toBeLessThan(s.reachAt);
      if (s.pseudo.length) {
        for (const t of [nt.group, nt.goldDoor, nt.steps[0], nt.lumi]) {
          if (t !== undefined) expect(t).toBeGreaterThan(s.pseudo[s.pseudo.length - 1]);
        }
      }
      if (nt.countdown.length) {
        expect(nt.countdown).toEqual([s.pushAt! - 3, s.pushAt! - 2, s.pushAt! - 1]);
        expect(nt.countdown[0]).toBeGreaterThan(s.spspAt!);
      }
      for (const { t } of noticeCues(s)) expect(t).toBeLessThanOrEqual(s.duration);
      seen++;
    }
    expect(seen).toBeGreaterThan(1000);
  });
});

describe("復活", () => {
  it("中リールはハズレ目で止まって待ち、REVIVAL_UP 後に回り直して当たり目で止まる", () => {
    let seen = 0;
    for (const s of scenarios(32, 400_000)) {
      if (s.revivalAt === undefined) continue;
      expect(s.hit).toBe(true);
      const plan = planReels(s);
      const down = reelPos(plan, 1, s.revivalAt);
      expect(Math.abs(down - Math.round(down))).toBeLessThan(1e-6);
      expect(symbolAt(Math.round(down))).not.toBe(s.final[1]);
      // 止まっている間は動かない
      expect(reelPos(plan, 1, s.revivalAt + REVIVAL_UP - 0.01)).toBeCloseTo(down, 9);
      expect(reelPos(plan, 1, s.revivalAt + REVIVAL_UP + 0.3)).toBeGreaterThan(down);
      expect(symbolAt(Math.round(reelPos(plan, 1, s.stops[1])))).toBe(s.final[1]);
      const cues = noticeCues(s).map((c) => c.cue);
      expect(cues).toContain("revival-down");
      expect(cues).toContain("revival");
      if (++seen >= 30) return;
    }
    throw new Error(`復活が足りない: ${seen}`);
  });
});
