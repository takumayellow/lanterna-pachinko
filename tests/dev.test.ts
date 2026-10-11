import { describe, expect, it } from "vitest";
import { defaultSelection, GROUPS, labelOf, toForce } from "../src/dev/options";
import { forcedResult, type Bonus } from "../src/game/lottery";
import { Machine, type MachineEvent, type SpinForce } from "../src/game/machine";
import { mulberry32 } from "../src/game/rng";
import { buildScenario, type Route, type ScenarioForce } from "../src/game/scenario";
import { SPEC, spinsFor, type Mode } from "../src/game/spec";

const ROUTES: (Route | "zenkaiten" | "sudden")[] = [
  "hazure",
  "reach",
  "song",
  "daily",
  "shade",
  "storm",
  "abyss",
  "story",
  "zenkaiten",
  "sudden",
];

describe("forcedResult", () => {
  it("大当たりの種類どおりのラウンド数・移るモード・図柄になる", () => {
    const rand = mulberry32(1);
    const R = SPEC.rounds;
    expect(forcedResult(null, false, "normal", rand)).toMatchObject({ hit: false, bonus: null, next: "normal", number: 0 });
    expect(forcedResult(null, false, "rush", rand)).toMatchObject({ hit: false, next: "rush" });
    expect(forcedResult("lantern", false, "normal", rand)).toMatchObject({ rounds: R.challenge, next: "rush", number: 7 });
    expect(forcedResult("aurora", false, "normal", rand)).toMatchObject({ rounds: R.aurora, next: "lt", number: 7 });
    expect(forcedResult("upper", false, "lt", rand)).toMatchObject({ rounds: R.upper, next: "lt", number: 7 });
    expect(forcedResult("lower", false, "lt", rand)).toMatchObject({ rounds: R.lower, next: "lt" });
    const win = forcedResult("challenge", true, "normal", rand);
    const lose = forcedResult("challenge", false, "normal", rand);
    expect(win).toMatchObject({ hit: true, next: "rush", promote: true });
    expect(lose).toMatchObject({ hit: true, next: "normal", promote: false });
    expect(win.number).not.toBe(7);
  });
});

describe("buildScenario の決め打ち", () => {
  const hit = forcedResult("lantern", false, "normal", mulberry32(2));
  const miss = forcedResult(null, false, "normal", mulberry32(2));

  it("何も決め打ちしなければ普段と同じ演出になる（乱数の消費も変わらない）", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const r of [hit, miss]) {
        const a = buildScenario(r, "normal", 2, "white", mulberry32(seed));
        const b = buildScenario(r, "normal", 2, "white", mulberry32(seed), {});
        expect(b).toEqual(a);
      }
    }
  });

  it("行き先を決め打ちすると、通常時でも ST 中でもその行き先で変動する", () => {
    for (const mode of ["normal", "rush", "lt"] as Mode[]) {
      for (const route of ROUTES) {
        for (const r of [hit, miss]) {
          const s = buildScenario(r, mode, 1, "white", mulberry32(3), { route });
          const kind = { song: "sp", daily: "sp", shade: "sp", storm: "spsp", abyss: "spsp", story: "spsp" }[route as string] ?? route;
          expect(s.kind).toBe(kind);
          if (kind === "sp") expect(s.sp).toBe(route);
          if (kind === "spsp") expect(s.spsp).toBe(route);
          expect(s.hit).toBe(r.hit);
          // どのリールも変動の終わりまでに止まる
          for (const t of s.stops) expect(t).toBeLessThanOrEqual(s.duration);
        }
      }
    }
  });

  it("キャラ・カットイン・タイトル・ボタン・擬似連・予告・復活を決め打ちできる", () => {
    const force: ScenarioForce = {
      route: "story",
      chara: "violet",
      cutin: "gold",
      title: "rainbow",
      button: "lever",
      pseudo: 2,
      revival: true,
      notices: { stepUp: 5, lumi: true, zone: "red" },
    };
    for (let seed = 0; seed < 50; seed++) {
      const s = buildScenario(hit, "normal", 0, "white", mulberry32(seed), force);
      expect(s).toMatchObject({ kind: "spsp", spsp: "story", chara: "violet", cutin: "gold", title: "rainbow", button: "lever", revival: true });
      expect(s.pseudo).toHaveLength(2);
      expect(s.revivalAt).toBeDefined();
      expect(s.notices).toMatchObject({ stepUp: 5, lumi: true, zone: "red" });
    }
  });

  it("SP の PUSH は出す / 出さないを決め打ちできる", () => {
    for (let seed = 0; seed < 50; seed++) {
      const on = buildScenario(hit, "normal", 0, "white", mulberry32(seed), { route: "song", push: true, button: "red" });
      const off = buildScenario(hit, "normal", 0, "white", mulberry32(seed), { route: "song", push: false });
      expect(on.pushAt).toBeDefined();
      expect(on.button).toBe("red");
      expect(off.pushAt).toBeUndefined();
    }
  });

  it("復活はハズレには付かない", () => {
    const s = buildScenario(miss, "normal", 0, "white", mulberry32(4), { route: "abyss", revival: true });
    expect(s.revival).toBe(false);
  });
});

describe("Machine.queueForced", () => {
  function runUntil(m: Machine, type: MachineEvent["type"], limit = 120): MachineEvent[] {
    const all: MachineEvent[] = [];
    for (let t = 0; t < limit; t += 0.05) {
      const ev = m.update(0.05);
      all.push(...ev);
      if (ev.some((e) => e.type === type)) return all;
    }
    throw new Error(`${type} が来ない`);
  }

  const force = (bonus: Bonus | null, scenario: ScenarioForce = {}): SpinForce => ({ bonus, promote: false, color: "gold", scenario });

  it("積んだ保留が、先に入っていた保留より先に消化される", () => {
    const m = new Machine(() => 0.999);
    m.input("heso");
    m.input("heso");
    m.queueForced(force("lantern", { route: "storm" }));
    expect(m.holds1).toHaveLength(3);
    expect(m.holds1[0].color).toBe("gold");
    const ev = runUntil(m, "spin-end");
    const start = ev.find((e) => e.type === "spin-start");
    const end = ev.find((e) => e.type === "spin-end");
    expect(start?.type === "spin-start" && start.scenario.spsp).toBe("storm");
    expect(end?.type === "spin-end" && end.result).toMatchObject({ hit: true, bonus: "lantern" });
  });

  it("当否を省くと普段どおり抽選する", () => {
    const m = new Machine(() => 0.999);
    m.queueForced({ color: "white", scenario: { route: "reach" } });
    const ev = runUntil(m, "spin-end");
    const end = ev.find((e) => e.type === "spin-end");
    expect(end?.type === "spin-end" && end.result.hit).toBe(false);
    expect(end?.type === "spin-end" && end.scenario.kind).toBe("reach");
  });

  it("電サポ中は特図2 に積む", () => {
    const m = new Machine(mulberry32(5));
    m.enterMode("rush");
    m.queueForced(force(null));
    expect(m.holds2).toHaveLength(1);
    expect(m.holds1).toHaveLength(0);
  });

  it("満杯なら末尾を捨てて先頭に積む", () => {
    const m = new Machine(mulberry32(6));
    for (let i = 0; i < 6; i++) m.input("heso");
    const last = m.holds1[SPEC.maxHold - 1];
    m.queueForced(force(null));
    expect(m.holds1).toHaveLength(SPEC.maxHold);
    expect(m.holds1[0].color).toBe("gold");
    expect(m.holds1).not.toContain(last);
  });

  it("モードが変わっても決め打ちした保留の色は変わらない", () => {
    const m = new Machine(mulberry32(7));
    for (let i = 0; i < 2; i++) m.input("heso");
    m.queueForced(force(null));
    for (let i = 0; i < 20; i++) {
      m.enterMode(i % 2 === 0 ? "rush" : "normal");
      expect(m.holds1[0].color).toBe("gold");
    }
  });

  it("モードの切り替えで ST の回数が満タンになる", () => {
    const m = new Machine(mulberry32(8));
    m.enterMode("lt");
    expect(m.mode).toBe("lt");
    expect(m.spinsLeft).toBe(spinsFor("lt"));
    m.enterMode("normal");
    expect(m.spinsLeft).toBe(0);
  });

  it("大当たり中はモードを切り替えない", () => {
    const m = new Machine(() => 0.999);
    m.queueForced(force("lantern", { route: "reach" }));
    runUntil(m, "jackpot-start");
    expect(m.enterMode("lt")).toBe(false);
    expect(m.mode).toBe("normal");
  });
});

describe("開発者向けページの選択肢", () => {
  it("何も選ばなければ当否も演出もおまかせ（保留は白）", () => {
    const f = toForce(defaultSelection());
    expect(f.bonus).toBeUndefined();
    expect(f.color).toBe("white");
    expect(f.scenario).toEqual({ notices: {} });
  });

  it("選んだ値がそのまま決め打ちになる", () => {
    const f = toForce({
      ...defaultSelection(),
      result: "challenge-win",
      color: "rainbow",
      route: "abyss",
      chara: "scarlet",
      cutin: "red",
      title: "gold",
      push: "no",
      button: "red",
      pseudo: "0",
      revival: "yes",
      stepUp: "4",
      goldDoor: "no",
      logo: "tilt",
      reachLine: "rainbow",
    });
    expect(f).toMatchObject({ bonus: "challenge", promote: true, color: "rainbow" });
    expect(f.scenario).toEqual({
      route: "abyss",
      chara: "scarlet",
      cutin: "red",
      title: "gold",
      push: false,
      button: "red",
      pseudo: 0,
      revival: true,
      notices: { stepUp: 4, goldDoor: false, logo: "tilt", reachLine: "rainbow" },
    });
  });

  it("表示名を引ける（知らない値はそのまま）", () => {
    expect(labelOf("route", "story")).toBe("SPSP ストーリー");
    expect(labelOf("cutin", "gold")).toBe("金");
    expect(labelOf("route", "nope")).toBe("nope");
  });

  it("ハズレは null として決め打ちする", () => {
    expect(toForce({ ...defaultSelection(), result: "miss" })).toMatchObject({ bonus: null });
  });

  it("知らない値はおまかせ扱い", () => {
    const f = toForce({ result: "__proto__", color: "black", route: "toString", stepUp: "9", chara: "constructor" });
    expect(f.bonus).toBeUndefined();
    expect(f.color).toBe("white");
    expect(f.scenario).toEqual({ notices: {} });
  });

  it("どの選択肢の値も toForce が受け付ける", () => {
    for (const g of GROUPS) {
      for (const field of g.fields) {
        for (const [value] of field.options) {
          if (value === "" || (field.key === "color" && value === "white")) continue;
          const f = toForce({ ...defaultSelection(), [field.key]: value });
          expect(JSON.stringify(f), `${field.key}=${value}`).not.toBe(JSON.stringify(toForce(defaultSelection())));
        }
      }
    }
  });
});
