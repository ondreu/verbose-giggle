import { describe, expect, it } from "vitest";
import {
  applyAbilityIncrease,
  awardXp,
  chooseSubclass,
  featuresAtLevel,
  grantFeats,
  learnSpells,
  levelUp,
  proficiencyForLevel,
} from "../src/index.js";
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
      xp: 6500, // enough to reach level 5
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
      xp: 6500, // enough to reach level 5
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

  it("refuses to level up without enough earned XP", () => {
    const a = makeActor({
      id: "h",
      name: "Hero",
      level: 1,
      xp: 0, // level 2 needs 300 XP
      hit_dice: { type: "d8", total: 1, remaining: 1 },
    });
    const state = makeState([a]);
    const r = levelUp(state, { actor: "h" });
    expect(r).toHaveProperty("error");
    expect(a.level).toBe(1); // unchanged

    // With the threshold met, the same call now succeeds.
    a.xp = 300;
    const ok = levelUp(state, { actor: "h" });
    expect(ok).not.toHaveProperty("error");
    expect(a.level).toBe(2);
  });
});

describe("ability score improvement", () => {
  it("distributes up to +2 and caps each score at 20", () => {
    const a = makeActor({ id: "a", name: "A", abilities: { str: 19, dex: 14, con: 12, int: 10, wis: 10, cha: 10 } });
    const state = makeState([a]);
    applyAbilityIncrease(state, { actor: "a", increments: { str: 2 } });
    expect(a.abilities.str).toBe(20); // 19 + 2 capped at 20
  });

  it("rejects more than +2 total", () => {
    const a = makeActor({ id: "a", name: "A" });
    const state = makeState([a]);
    const r = applyAbilityIncrease(state, { actor: "a", increments: { str: 2, dex: 1 } });
    expect(r).toHaveProperty("error");
  });
});

describe("learn spells", () => {
  it("adds new spells and de-duplicates", () => {
    const a = makeActor({ id: "a", name: "A", spells_known: ["fire-bolt"] });
    const state = makeState([a]);
    const r = learnSpells(state, { actor: "a", spells: ["fire-bolt", "shield", "shield"] });
    expect(a.spells_known).toEqual(["fire-bolt", "shield"]);
    expect(r.added).toEqual(["shield"]);
  });
});

describe("SRD-driven features, subclass and feats (#20)", () => {
  const srd = {
    features: {
      "wizard-l3": { id: "wizard-l3", name: "Cantrip Formulas", level: 3, class: "wizard" },
      "evocation-l3": { id: "evocation-l3", name: "Sculpt Spells", level: 3, class: "wizard", subclass: "evocation" },
      "abjuration-l3": { id: "abjuration-l3", name: "Arcane Ward", level: 3, class: "wizard", subclass: "abjuration" },
    },
    subclasses: {
      evocation: { id: "evocation", name: "Evocation", class: "wizard" },
      "life-domain": { id: "life-domain", name: "Life Domain", class: "cleric" },
    },
    feats: { alert: { id: "alert", name: "Alert", prerequisites: [] } },
  };

  it("grants class features for the new level on level-up", () => {
    const w = makeActor({ id: "w", name: "Wizard", class: "wizard", level: 2, xp: 900, hit_dice: { type: "d6", total: 2, remaining: 2 } });
    const state = makeState([w], "seed", srd as never);
    levelUp(state, { actor: "w" }); // → level 3
    expect(w.features).toContain("wizard-l3");
    // No subclass yet, so subclass-gated features are withheld.
    expect(w.features).not.toContain("evocation-l3");
  });

  it("chooseSubclass validates the class and backfills its features", () => {
    const w = makeActor({ id: "w", name: "Wizard", class: "wizard", level: 3 });
    const state = makeState([w], "seed", srd as never);
    const bad = chooseSubclass(state, { actor: "w", subclass: "life-domain" });
    expect(bad).toHaveProperty("error"); // cleric subclass on a wizard
    const ok = chooseSubclass(state, { actor: "w", subclass: "evocation" });
    expect(ok).toEqual({ subclass: "evocation" });
    expect(w.subclass).toBe("evocation");
    expect(w.features).toContain("evocation-l3"); // backfilled
    expect(w.features).not.toContain("abjuration-l3");
  });

  it("grantFeats adds feats by id and de-duplicates", () => {
    const w = makeActor({ id: "w", name: "Wizard", class: "wizard" });
    const state = makeState([w], "seed", srd as never);
    const r = grantFeats(state, { actor: "w", feats: ["alert", "alert"] });
    expect(w.feats).toEqual(["alert"]);
    expect(r.added).toEqual(["Alert"]); // resolved to the SRD name in the log
  });

  it("featuresAtLevel returns nothing without an SRD dataset", () => {
    const w = makeActor({ id: "w", name: "Wizard", class: "wizard" });
    const state = makeState([w]);
    expect(featuresAtLevel(state, "wizard", undefined, 3)).toEqual([]);
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
