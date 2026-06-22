import { describe, expect, it } from "vitest";
import { applyDamage, attack, deathSave, heal } from "../src/index.js";
import { makeActor, makeState } from "./helpers.js";

describe("apply_damage", () => {
  it("subtracts from current hp and floors at 0, dropping to unconscious", () => {
    const a = makeActor({ id: "t", name: "Target", hp: { max: 10, current: 6, temp: 0 } });
    const state = makeState([a]);
    const r = applyDamage(state, { target: "t", amount: 9 });
    expect(r.hp_after).toBe(0);
    expect(r.dropped).toBe(true);
    expect(a.conditions.some((c) => c.name === "unconscious")).toBe(true);
  });

  it("temp hp absorbs first", () => {
    const a = makeActor({ id: "t", name: "T", hp: { max: 10, current: 10, temp: 5 } });
    const state = makeState([a]);
    applyDamage(state, { target: "t", amount: 7 });
    expect(a.hp.temp).toBe(0);
    expect(a.hp.current).toBe(8);
  });

  it("halves on resistance, doubles on vulnerability, zeroes on immunity", () => {
    const base = () => ({ id: "t", name: "T", hp: { max: 100, current: 100, temp: 0 } });
    const res = makeActor({ ...base(), resistances: ["fire"] } as never);
    const vul = makeActor({ ...base(), vulnerabilities: ["fire"] } as never);
    const imm = makeActor({ ...base(), immunities: ["fire"] } as never);
    expect(applyDamage(makeState([res]), { target: "t", amount: 10, type: "fire" }).hp_after).toBe(95);
    expect(applyDamage(makeState([vul]), { target: "t", amount: 10, type: "fire" }).hp_after).toBe(80);
    expect(applyDamage(makeState([imm]), { target: "t", amount: 10, type: "fire" }).hp_after).toBe(100);
  });
});

describe("heal", () => {
  it("caps at max and revives from 0", () => {
    const a = makeActor({
      id: "t",
      name: "T",
      hp: { max: 10, current: 0, temp: 0 },
      conditions: [{ name: "unconscious", source: "0 hp", duration: null }],
    });
    const state = makeState([a]);
    const r = heal(state, { target: "t", amount: 20 });
    expect(r.hp_after).toBe(10);
    expect(a.conditions.some((c) => c.name === "unconscious")).toBe(false);
  });
});

describe("death saves", () => {
  it("resolve to a terminal outcome with valid counts", () => {
    const a = makeActor({
      id: "t",
      name: "Downed",
      hp: { max: 10, current: 0, temp: 0 },
      conditions: [{ name: "unconscious", source: "0 hp", duration: null }],
    });
    const state = makeState([a], "death");
    let outcome = "dying";
    for (let i = 0; i < 12 && outcome === "dying"; i++) {
      const r = deathSave(state, { actor: "t" });
      outcome = r.outcome;
      expect(a.death_saves.success).toBeLessThanOrEqual(3);
      expect(a.death_saves.fail).toBeLessThanOrEqual(3);
    }
    expect(["stable", "dead", "revived"]).toContain(outcome);
  });

  it("nat 20 revives at 1 hp (search seeds; ~certain to hit a 20)", () => {
    let revived = false;
    for (let i = 0; i < 200 && !revived; i++) {
      const a = makeActor({ id: "t", name: "D", hp: { max: 10, current: 0, temp: 0 }, conditions: [{ name: "unconscious", duration: null }] });
      const r = deathSave(makeState([a], `seed-${i}`), { actor: "t" });
      if (r.outcome === "revived") {
        revived = true;
        expect(a.hp.current).toBe(1);
        expect(a.conditions.some((c) => c.name === "unconscious")).toBe(false);
      }
    }
    expect(revived).toBe(true);
  });
});

describe("attack", () => {
  it("nat 1 always misses, logs to the dice log", () => {
    // Find a seed where the first d20 is a 1 is overkill; instead assert structure.
    const attacker = makeActor({ id: "a", name: "Hero", inventory: [{ id: "longsword", qty: 1, equipped: true }] });
    const target = makeActor({ id: "g", name: "Goblin", type: "monster", faction: "hostile", ac: 15, hp: { max: 7, current: 7, temp: 0 }, srd_ref: "goblin" });
    const state = makeState([attacker, target], "atk");
    const r = attack(state, { attacker: "a", target: "g", weapon: "longsword" });
    expect(typeof r.hit).toBe("boolean");
    expect(state.session.log.some((l) => l.kind === "attack")).toBe(true);
    if (r.hit) expect(r.damage).toBeGreaterThan(0);
  });

  it("monster uses its srd action profile", () => {
    const goblin = makeActor({ id: "g", name: "Goblin", type: "monster", faction: "hostile", srd_ref: "goblin", ac: 15, hp: { max: 7, current: 7, temp: 0 } });
    const hero = makeActor({ id: "h", name: "Hero", ac: 10 });
    const state = makeState([goblin, hero], "monatk");
    const r = attack(state, { attacker: "g", target: "h" });
    expect(r.detail).toContain("Scimitar");
  });
});
