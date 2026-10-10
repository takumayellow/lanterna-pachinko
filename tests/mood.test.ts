import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOOD_BGM, spinMood } from "../src/audio/mood";
import { judge, makeHold } from "../src/game/lottery";
import { mulberry32 } from "../src/game/rng";
import { buildScenario, type Scenario } from "../src/game/scenario";

function* scenarios(seed: number, n: number): Generator<Scenario> {
  const rand = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const hold = makeHold(1, "normal", rand);
    yield buildScenario(judge(hold, "normal", rand), "normal", k % 4, hold.color, rand);
  }
}

describe("変動中の曲", () => {
  it("リーチ演出の前は台の状態に任せる", () => {
    for (const s of scenarios(7, 2000)) {
      const first = Math.min(s.spAt ?? Infinity, s.spspAt ?? Infinity);
      expect(spinMood(s, Math.min(first, s.duration) - 0.01)).toBeNull();
    }
  });

  it("SP は影法師バトル（SPSP へ発展する SP を含む）だけバトル曲，SPSP は種類ごとの曲", () => {
    const seen = new Set<string>();
    for (const s of scenarios(11, 200_000)) {
      if (s.spAt === undefined) continue;
      const atSp = spinMood(s, s.spAt);
      expect(atSp).toBe(s.sp === "shade" || s.spspAt !== undefined ? "battle" : "reach");
      if (s.spspAt !== undefined) {
        expect(s.spsp).toBeDefined();
        const atSpsp = spinMood(s, s.spspAt);
        expect(atSpsp).toBe(`spsp_${s.spsp}`);
        seen.add(atSpsp!);
      }
    }
    expect([...seen].sort()).toEqual(["spsp_abyss", "spsp_storm", "spsp_story"]);
  });
});

describe("台の状態ごとの曲", () => {
  const dir = new URL("../public/audio/bgm/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf-8")) as {
    tracks: { id: string; file: string; loop: boolean; loopStart: number | null; loopEnd: number | null }[];
  };
  const tracks = new Map(manifest.tracks.map((t) => [t.id, t]));

  it("どの状態の曲も書き出し済みのループ曲", () => {
    for (const id of Object.values(MOOD_BGM)) {
      if (id === null) continue;
      const t = tracks.get(id);
      expect(t, id).toBeDefined();
      expect(t!.loop, id).toBe(true);
      expect(t!.loopEnd! > t!.loopStart!, id).toBe(true);
      expect(existsSync(new URL(t!.file, dir)), t!.file).toBe(true);
    }
  });

  it("チャンス中と LT は専用曲", () => {
    expect(MOOD_BGM.chance).toBe("chance");
    expect(MOOD_BGM.lt).toBe("lt");
  });
});
