import { describe, expect, it } from "vitest";
import { SKILL_CS } from "@adm/schemas";
import { SKILL_ABILITY } from "../src/state.js";

/**
 * Cross-check the engine's skill→ability map against the localized skill list
 * (#21). The two are authored separately (engine mechanics vs Czech labels), so
 * this guards that they never drift out of sync — every skill the engine scores
 * has a Czech label, and vice versa.
 */
describe("skill map ↔ labels (#21)", () => {
  it("the engine skill→ability keys exactly match the localized skill ids", () => {
    expect(Object.keys(SKILL_ABILITY).sort()).toEqual(Object.keys(SKILL_CS).sort());
  });

  it("maps each skill to a valid ability", () => {
    const abilities = new Set(["str", "dex", "con", "int", "wis", "cha"]);
    for (const ability of Object.values(SKILL_ABILITY)) {
      expect(abilities.has(ability)).toBe(true);
    }
  });
});
