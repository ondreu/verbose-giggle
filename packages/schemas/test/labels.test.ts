import { describe, expect, it } from "vitest";
import {
  ABILITY_CS,
  ABILITY_DESC_CS,
  CONDITION_CS,
  CONDITION_DESC_CS,
  DAMAGE_CS,
  DAMAGE_DESC_CS,
  csAlignment,
  csDamageDesc,
  csWeaponProperty,
  csWeaponPropertyDesc,
} from "../src/index.js";
import { AbilityKey, ConditionName, DamageType } from "../src/primitives.js";

/**
 * Descriptive SRD data mined into Czech label maps (#21). These guard that the
 * static maps stay complete as the closed enums evolve — every damage type,
 * condition and ability must have both a label and a description so tooltips and
 * the rules-reference panel never show a blank.
 */
describe("Czech label completeness (#21)", () => {
  it("covers every damage type with a label and a description", () => {
    for (const type of DamageType.options) {
      expect(DAMAGE_CS[type], `label for ${type}`).toBeTruthy();
      expect(DAMAGE_DESC_CS[type], `desc for ${type}`).toBeTruthy();
      expect(csDamageDesc(type)).toBe(DAMAGE_DESC_CS[type]);
    }
  });

  it("covers every condition with a label and a description", () => {
    for (const name of ConditionName.options) {
      expect(CONDITION_CS[name], `label for ${name}`).toBeTruthy();
      expect(CONDITION_DESC_CS[name], `desc for ${name}`).toBeTruthy();
    }
  });

  it("covers every ability with a name and a description", () => {
    for (const key of AbilityKey.options) {
      expect(ABILITY_CS[key]).toBeTruthy();
      expect(ABILITY_DESC_CS[key]).toBeTruthy();
    }
  });

  it("labels and describes the SRD weapon properties", () => {
    for (const prop of ["finesse", "versatile", "reach", "two-handed", "thrown"]) {
      expect(csWeaponProperty(prop)).not.toBe(prop); // resolved to Czech
      expect(csWeaponPropertyDesc(prop)).toBeTruthy();
    }
    // Unknown ids fall back to the raw id, never throw.
    expect(csWeaponProperty("nonexistent")).toBe("nonexistent");
  });

  it("localizes alignments and tolerates unknowns", () => {
    expect(csAlignment("chaotic-good")).toBe("chaoticky dobrý");
    expect(csAlignment("unaligned")).toBe("bez přesvědčení");
    expect(csAlignment(undefined)).toBe("");
    expect(csAlignment("weird")).toBe("weird");
  });
});
