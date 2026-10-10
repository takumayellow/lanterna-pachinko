import { describe, expect, it } from "vitest";
import { judge, makeHold } from "../src/game/lottery";
import type { Jackpot, Spin } from "../src/game/machine";
import { REVIVAL_UP } from "../src/game/notices";
import { mulberry32 } from "../src/game/rng";
import { buildScenario, settleAt, type Scenario } from "../src/game/scenario";
import type { Mode } from "../src/game/spec";
import { fitScale } from "../src/lcd/videoLayer";
import { parseScenes, relPath, resolveScene } from "../src/media/manifest";
import { revealAt, sceneChain } from "../src/media/scenes";

function find(pred: (s: Scenario) => boolean): Scenario {
  const rand = mulberry32(7);
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

const jackpot = (phase: Jackpot["phase"]): Jackpot => ({ phase, t: 0, round: 1, count: 0, payout: 0 }) as unknown as Jackpot;

describe("場面の並び", () => {
  it("変動していないときはモードの背景", () => {
    expect(sceneChain({ mode: "normal", spin: null, jackpot: null })).toEqual(["normal"]);
    expect(sceneChain({ mode: "jitan", spin: null, jackpot: null })).toEqual(["chance", "normal"]);
    expect(sceneChain({ mode: "lt", spin: null, jackpot: null })).toEqual(["lt", "rush"]);
  });

  it("SPSP は行き先・SPSP・SP・リーチ・背景の順に探す", () => {
    const s = find((x) => x.spsp === "story" && !x.hit && !x.revival);
    expect(sceneChain({ mode: "normal", spin: spin(s, s.spspAt!), jackpot: null })).toEqual([
      "spsp_story",
      "spsp",
      "sp",
      "reach",
      "normal",
    ]);
    expect(sceneChain({ mode: "normal", spin: spin(s, s.reachAt!), jackpot: null })).toEqual(["reach", "normal"]);
  });

  it("決着は当落が見えた瞬間から。押した時刻があればそこから", () => {
    const hit = find((x) => x.kind === "spsp" && x.hit && !x.revival && x.pushAt !== undefined);
    const at = revealAt(hit);
    expect(at).toBeCloseTo(settleAt(hit) - 0.5);
    expect(sceneChain({ mode: "normal", spin: spin(hit, at - 0.01), jackpot: null })[0]).not.toBe("win");
    expect(sceneChain({ mode: "normal", spin: spin(hit, at), jackpot: null })[0]).toBe("win");
    const pushedAt = hit.pushAt! + 0.1;
    expect(sceneChain({ mode: "normal", spin: spin(hit, pushedAt), jackpot: null, pushedAt })[0]).toBe("win");
    const lose = find((x) => x.kind === "spsp" && !x.hit && x.pushAt !== undefined);
    expect(sceneChain({ mode: "normal", spin: spin(lose, revealAt(lose)), jackpot: null })[0]).toBe("lose");
  });

  it("復活は一度ハズレを見せてから当たりに変わる", () => {
    const s = find((x) => x.revival);
    const r = s.revivalAt!;
    expect(sceneChain({ mode: "normal", spin: spin(s, r), jackpot: null })[0]).toBe("lose");
    expect(sceneChain({ mode: "normal", spin: spin(s, r + REVIVAL_UP), jackpot: null }).slice(0, 2)).toEqual(["revival", "win"]);
  });

  it("通常リーチには決着の場面を出さない", () => {
    const s = find((x) => x.kind === "reach");
    expect(sceneChain({ mode: "normal", spin: spin(s, s.duration), jackpot: null })).toEqual(["reach", "normal"]);
  });

  it("大当たりは段階ごと。RUSH 中のラウンドは専用を先に探す", () => {
    expect(sceneChain({ mode: "normal", spin: null, jackpot: jackpot("opening") })).toEqual(["opening"]);
    expect(sceneChain({ mode: "normal", spin: null, jackpot: jackpot("open") })).toEqual(["round"]);
    expect(sceneChain({ mode: "rush", spin: null, jackpot: jackpot("interval") })).toEqual(["round_rush", "round"]);
    expect(sceneChain({ mode: "normal", spin: null, jackpot: jackpot("ending") })).toEqual(["ending", "round"]);
  });
});

describe("local-assets の scenes", () => {
  it("文字列だけなら映像。ループの既定は場面で決まる", () => {
    const { scenes, ignored } = parseScenes({ normal: "video/n.mp4", win: { video: "video/w.mp4", bgm: "music/w.mp3" } });
    expect(ignored).toEqual([]);
    expect(scenes.get("normal")).toMatchObject({ video: "video/n.mp4", loop: true, ui: 1, fit: "cover", sound: false });
    expect(scenes.get("win")).toMatchObject({ video: "video/w.mp4", bgm: "music/w.mp3", loop: false });
  });

  it("知らない場面・外を指すパス・空の項目は捨てる", () => {
    const { scenes, ignored } = parseScenes({
      nomal: "a.mp4",
      reach: "../secret.mp4",
      sp: { video: "/etc/x.mp4" },
      spsp: { video: "https://example.com/x.mp4" },
      lose: {},
      win: "ok.mp4",
    });
    expect([...scenes.keys()]).toEqual(["win"]);
    expect(ignored.sort()).toEqual(["lose", "nomal", "reach", "sp", "spsp"]);
  });

  it("数値は範囲に収め、end が start 以前なら使わない", () => {
    const { scenes } = parseScenes({ sp: { video: "a.mp4", ui: 2, volume: -1, start: 5, end: 3, fit: "zoom" } });
    expect(scenes.get("sp")).toMatchObject({ ui: 1, volume: 0, start: 5, end: undefined, fit: "cover" });
  });

  it("映像と曲は別々に、細かい場面から探す", () => {
    const { scenes } = parseScenes({ sp: { video: "sp.mp4" }, reach: { bgm: "reach.mp3" }, normal: { video: "n.mp4", bgm: "n.mp3" } });
    const chain = ["sp", "reach", "normal"] as const;
    expect(resolveScene(chain, scenes, "video")?.scene).toBe("sp");
    expect(resolveScene(chain, scenes, "bgm")?.scene).toBe("reach");
    expect(resolveScene(["spsp"], scenes, "video")).toBeNull();
  });

  it("相対パスだけ通す", () => {
    expect(relPath("music/a b.mp3")).toBe("music/a b.mp3");
    for (const bad of ["", "C:\\x.mp3", "\\\\host\\x.mp3", "a/../../x.mp3", "data:audio/mp3;base64,AA", "%2e%2e/x.mp3", "a%2f..%2fx.mp3", 3]) expect(relPath(bad)).toBeUndefined();
  });
});

describe("映像の収め方", () => {
  const aspect = 1040 / 770;
  it("横長の映像を cover なら左右を切り、contain なら上下に黒帯", () => {
    const v = { videoWidth: 1920, videoHeight: 1080 };
    const cover = fitScale("cover", v, aspect);
    expect(cover.x).toBeCloseTo(aspect / (16 / 9));
    expect(cover.y).toBe(1);
    const contain = fitScale("contain", v, aspect);
    expect(contain.x).toBe(1);
    expect(contain.y).toBeCloseTo(16 / 9 / aspect);
    expect(fitScale("stretch", v, aspect).toArray()).toEqual([1, 1]);
  });
  it("縦長の映像を cover なら上下を切る", () => {
    const s = fitScale("cover", { videoWidth: 720, videoHeight: 1280 }, aspect);
    expect(s.x).toBe(1);
    expect(s.y).toBeCloseTo((720 / 1280) / aspect);
  });
});
