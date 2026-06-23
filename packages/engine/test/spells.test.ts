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

  it("scales SRD damage by slot and halves on a save (#20)", () => {
    // A mounted SRD-style leveled save spell with slot scaling.
    const srd = {
      spells: {
        scorch: {
          id: "scorch",
          name: "Scorch",
          level: 1,
          attack: "none" as const,
          concentration: false,
          ritual: false,
          classes: ["wizard"],
          damage_type: "fire",
          save: { ability: "dex" as const, effect: "half" },
          damage_by_slot: { "1": "1d6", "3": "100d1" }, // huge dice at slot 3 to make the save effect unmistakable
        },
      },
    };
    const wizard = makeActor({
      id: "w",
      name: "Elara",
      class: "wizard",
      abilities: { str: 8, dex: 10, con: 12, int: 18, wis: 10, cha: 10 },
      spells_known: ["scorch"],
      spell_slots: { "1": { max: 2, used: 0 }, "3": { max: 1, used: 0 } },
    });
    const foe = makeActor({ id: "f", name: "Cíl", faction: "hostile", abilities: { str: 1, dex: 1, con: 10, int: 1, wis: 1, cha: 1 }, hp: { max: 500, current: 500, temp: 0 } });
    const state = makeState([wizard, foe], "scale-seed", srd as never);

    const r = castSpell(state, { caster: "w", spell: "scorch", slot_level: 3, targets: ["f"] });
    const dmg = r.saves?.[0]?.damage ?? 0;
    // Slot-3 dice = 100; a failed DEX save (foe dex 1) takes full; a success halves.
    expect(r.saves?.[0]?.success ? dmg === 50 : dmg === 100).toBe(true);
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
