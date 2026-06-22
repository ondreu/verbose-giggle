import { describe, expect, it } from "vitest";
import { castSpell } from "../src/index.js";
import { makeActor, makeState } from "./helpers.js";

describe("cast_spell sheet validation (#29)", () => {
  it("refuses a spell the character does not know — no slot spent, no effect", () => {
    const wizard = makeActor({
      id: "w",
      name: "Elara",
      class: "wizard",
      spells_known: ["fire-bolt"], // knows fire-bolt, NOT cure-wounds
      spell_slots: { "1": { max: 2, used: 0 } },
    });
    const ally = makeActor({ id: "a", name: "Druh", hp: { max: 20, current: 5, temp: 0 } });
    const state = makeState([wizard, ally], "unknown-spell");

    const r = castSpell(state, { caster: "w", spell: "cure-wounds", slot_level: 1, targets: ["a"] });

    expect(r.error).toBeDefined();
    expect(r.slot_consumed).toBeNull();
    expect(wizard.spell_slots["1"]!.used).toBe(0); // slot untouched
    expect(ally.hp.current).toBe(5); // no heal happened
    expect(state.session.log.some((l) => l.kind === "spell" && /neumí kouzlo/.test(l.detail))).toBe(true);
  });

  it("allows a spell on the known list and applies its effect", () => {
    const cleric = makeActor({
      id: "c",
      name: "Sora",
      class: "cleric",
      spells_known: ["cure-wounds"],
      spell_slots: { "1": { max: 2, used: 0 } },
    });
    const ally = makeActor({ id: "a", name: "Druh", hp: { max: 20, current: 5, temp: 0 } });
    const state = makeState([cleric, ally], "known-spell");

    const r = castSpell(state, { caster: "c", spell: "cure-wounds", slot_level: 1, targets: ["a"] });

    expect(r.error).toBeUndefined();
    expect(r.slot_consumed).toBe(1);
    expect(cleric.spell_slots["1"]!.used).toBe(1);
    expect(ally.hp.current).toBeGreaterThan(5); // healed, HP written to state
  });

  it("does not gate monster (statblock) casters on spells_known", () => {
    const monster = makeActor({
      id: "m",
      name: "Mág kultu",
      type: "monster",
      controller: "ai",
      faction: "hostile",
      class: "wizard",
      spells_known: [], // monsters cast from their statblock, not a known list
    });
    const pc = makeActor({ id: "p", name: "Hrdina", hp: { max: 20, current: 20, temp: 0 } });
    const state = makeState([monster, pc], "monster-cast");

    const r = castSpell(state, { caster: "m", spell: "fire-bolt", targets: ["p"] });
    expect(r.error).toBeUndefined();
  });
});
