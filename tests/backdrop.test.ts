import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { judge, makeHold } from "../src/game/lottery";
import type { Jackpot, Spin } from "../src/game/machine";
import { mulberry32 } from "../src/game/rng";
import { buildScenario, type Scenario } from "../src/game/scenario";
import type { Mode } from "../src/game/spec";
import { CHARA_FILE } from "../src/lcd/charaArt";
import { backdropFor } from "../src/lcd/director";
import { CHARA_ORDER } from "../src/lcd/heroines";
import { BACKDROPS } from "../src/lcd/stageShader";

function find(pred: (s: Scenario) => boolean): Scenario {
  const rand = mulberry32(3);
  for (let k = 0; k < 500_000; k++) {
    const hold = makeHold(1, "normal", rand);
    const s = buildScenario(judge(hold, "normal", rand), "normal", k % 4, hold.color, rand);
    if (pred(s)) return s;
  }
  throw new Error("条件に合う変動が見つからない");
}

function spin(scenario: Scenario, t: number, mode: Mode = "normal"): Spin {
  return { scenario, t, mode, pushed: false, cues: [], cueIdx: 0 } as unknown as Spin;
}

describe("背景の選び方", () => {
  it("止まっているときはモードの背景、大当たり中は金", () => {
    expect(backdropFor({ mode: "normal", spin: null, jackpot: null })).toBe("city");
    expect(backdropFor({ mode: "jitan", spin: null, jackpot: null })).toBe("night");
    expect(backdropFor({ mode: "rush", spin: null, jackpot: null })).toBe("rush");
    expect(backdropFor({ mode: "lt", spin: null, jackpot: null })).toBe("gold");
    expect(backdropFor({ mode: "normal", spin: null, jackpot: { phase: "open" } as unknown as Jackpot })).toBe("gold");
  });

  it("リーチ → SP → SPSP と段階ごとに、行き先の背景へ変わる", () => {
    const want = { song: "night", daily: "city", shade: "barrier" } as const;
    for (const [kind, bg] of Object.entries(want)) {
      const s = find((x) => x.sp === kind && x.spAt !== undefined && x.reachAt !== undefined && !x.revival);
      expect(backdropFor({ mode: "normal", spin: spin(s, 0), jackpot: null })).toBe("city");
      expect(backdropFor({ mode: "normal", spin: spin(s, s.reachAt!), jackpot: null })).toBe("circle");
      expect(backdropFor({ mode: "normal", spin: spin(s, s.spAt!), jackpot: null })).toBe(bg);
    }
    const spsp = { storm: "despair", abyss: "abyss", story: "clock" } as const;
    for (const [kind, bg] of Object.entries(spsp)) {
      const s = find((x) => x.spsp === kind && x.spspAt !== undefined && !x.revival);
      expect(backdropFor({ mode: "normal", spin: spin(s, s.spspAt!), jackpot: null })).toBe(bg);
    }
  });
});

describe("同梱の絵", () => {
  it("背景はどれも絵と奥行きがそろっている", () => {
    for (const b of BACKDROPS) {
      expect(existsSync(`public/art/bg/${b}.webp`), b).toBe(true);
      expect(existsSync(`public/art/bg/${b}.depth.webp`), `${b} の奥行き`).toBe(true);
    }
  });

  it("キャラはどれも立ち絵がある", () => {
    for (const c of CHARA_ORDER) expect(existsSync(`public/art/chara/${CHARA_FILE[c]}.webp`), c).toBe(true);
  });
});
