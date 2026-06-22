import { describe, expect, it } from "vitest";
import { awardXp, levelUp, proficiencyForLevel } from "../src/index.js";
import { makeActor, makeState } from "./helpers.js";

describe("proficiency by level", () => {
  it("follows the SRD bands", () => {
    expect(proficiencyForLevel(1)).toBe(2);
    expect(proficiencyForLevel(4)).toBe(2);
    expect(proficiencyForLevel(5)).toBe(3);
    expect(proficiencyForLevel(9)).toBe(4);
    expect(proficiencyForLevel(20)).toBe(6);
  });
});

describe("level up", () => {
  it("adds HP (avg die + CON) and a hit die, bumps proficiency", () => {
    const a = makeActor({
      id: "f",
      name: "Fighter",
      level: 4,
      abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
      hp: { max: 30, current: 30, temp: 0 },
      hit_dice: { type: "d10", total: 4, remaining: 4 },
    });
    const state = makeState([a]);
    levelUp(state, { actor: "f" });
    expect(a.level).toBe(5);
    expect(a.proficiency_bonus).toBe(3); // level 5
    // d10 avg 6 + CON mod +2 = 8.
    expect(a.hp.max).toBe(38);
    expect(a.hit_dice?.total).toBe(5);
  });

  it("recomputes full-caster slots and caps at level 20", () => {
    const w = makeActor({
      id: "w",
      name: "Wizard",
      level: 4,
      abilities: { str: 8, dex: 12, con: 12, int: 16, wis: 10, cha: 10 },
      hit_dice: { type: "d6", total: 4, remaining: 4 },
      spell_slots: { "1": { max: 4, used: 1 }, "2": { max: 3, used: 0 } },
    });
    const state = makeState([w]);
    levelUp(state, { actor: "w" }); // → level 5
    expect(w.spell_slots["3"]?.max).toBe(2); // gains a 3rd-level slot
    expect(w.spell_slots["1"]?.used).toBe(1); // used preserved

    w.level = 20;
    const r = levelUp(state, { actor: "w" });
    expect(r).toHaveProperty("error");
  });
});

describe("award xp", () => {
  it("auto-levels across thresholds crossed", () => {
    const a = makeActor({ id: "h", name: "Hero", level: 3, xp: 900, hit_dice: { type: "d8", total: 3, remaining: 3 } });
    const state = makeState([a]);
    // 900 → 6500 crosses level 4 (2700) and level 5 (6500).
    const res = awardXp(state, { actors: ["h"], amount: 5600 });
    expect(a.level).toBe(5);
    expect(res.results[0]?.leveled).toBe(true);
    expect(state.session.log.some((l) => l.kind === "level")).toBe(true);
  });
});
