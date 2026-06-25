import { describe, expect, it } from "vitest";
import {
  BUNDLES,
  DEFAULT_LOCALE_SETTINGS,
  LOCALES,
  asLocale,
  localizeAbility,
  localizeCondition,
  localizeConditionDesc,
  localizeItemName,
  localizeSpellName,
  localizeUi,
  makeLocalizer,
  type LabelBundle,
  ABILITY_CS,
  CONDITION_CS,
  csCondition,
} from "../src/index.js";
import { AbilityKey, ConditionName, DamageType } from "../src/primitives.js";

/**
 * i18n infrastructure (#48a). The Czech bundle must stay identical to the legacy
 * `*_CS` maps (it reuses them), and English must cover the same closed enums so
 * switching languages never leaves a blank label or description.
 */
describe("i18n bundles (#48a)", () => {
  it("registers every declared locale", () => {
    for (const locale of LOCALES) {
      expect(BUNDLES[locale], `bundle for ${locale}`).toBeTruthy();
    }
  });

  it("Czech bundle mirrors the legacy *_CS maps", () => {
    expect(BUNDLES.cs.ability).toBe(ABILITY_CS);
    expect(BUNDLES.cs.condition).toBe(CONDITION_CS);
    // Resolver parity with the legacy accessor.
    expect(localizeCondition("blinded", "cs")).toBe(csCondition("blinded"));
  });

  it("covers every ability, condition and damage type in both languages", () => {
    const required: Array<[keyof LabelBundle, keyof LabelBundle | null, string[]]> = [
      ["ability", "abilityDesc", AbilityKey.options],
      ["condition", "conditionDesc", ConditionName.options],
      ["damage", "damageDesc", DamageType.options],
    ];
    for (const locale of LOCALES) {
      const b = BUNDLES[locale];
      for (const [labelKey, descKey, ids] of required) {
        for (const id of ids) {
          expect(b[labelKey][id], `${locale} ${labelKey} ${id}`).toBeTruthy();
          if (descKey) expect(b[descKey][id], `${locale} ${descKey} ${id}`).toBeTruthy();
        }
      }
    }
  });

  it("translates abilities and conditions to English", () => {
    expect(localizeAbility("str", "en")).toBe("Strength");
    expect(localizeCondition("poisoned", "en")).toBe("poisoned");
    expect(localizeConditionDesc("grappled", "en")).toMatch(/speed is 0/i);
  });

  it("falls back to a prettified id for untranslated long-tail names", () => {
    // English leaves spell/item names empty on purpose → prettify the id.
    expect(localizeSpellName("fire-bolt", "en")).toBe("Fire Bolt");
    expect(localizeItemName("longsword", "en")).toBe("Longsword");
    // A caller-supplied fallback wins over prettifying.
    expect(localizeSpellName("teleportation-circle", "en", "Teleportation Circle")).toBe(
      "Teleportation Circle",
    );
    // Czech still uses its curated translations.
    expect(localizeSpellName("fire-bolt", "cs")).toBe("Ohnivá střela");
  });

  it("UI catalog falls back to the key when missing", () => {
    expect(localizeUi("common.save", "en")).toBe("Save");
    expect(localizeUi("common.save", "cs")).toBe("Uložit");
    expect(localizeUi("does.not.exist", "en")).toBe("does.not.exist");
    expect(localizeUi("does.not.exist", "en", "Fallback")).toBe("Fallback");
  });

  it("narrows arbitrary input to a known locale", () => {
    expect(asLocale("en")).toBe("en");
    expect(asLocale("cs")).toBe("cs");
    expect(asLocale("fr")).toBe("cs");
    expect(asLocale(undefined)).toBe("cs");
  });
});

/**
 * The three independent switches (#48b/#48c/#48d): a localizer can mix
 * languages — e.g. Czech UI but English terms and stats.
 */
describe("makeLocalizer switch routing (#48a)", () => {
  it("defaults to Czech across all switches", () => {
    const t = makeLocalizer();
    expect(t.settings).toEqual(DEFAULT_LOCALE_SETTINGS);
    expect(t.ability("str")).toBe("Síla");
    expect(t.condition("blinded")).toBe("oslepen");
    expect(t.ui("common.cancel")).toBe("Zrušit");
  });

  it("routes terms/stats/ui to their own switch independently", () => {
    const t = makeLocalizer({ ui: "cs", terms: "en", stats: "en" });
    // stats → English ability name
    expect(t.ability("str")).toBe("Strength");
    // terms → English spell/condition name
    expect(t.condition("blinded")).toBe("blinded");
    expect(t.spellName("fire-bolt")).toBe("Fire Bolt");
    // ui → Czech rules description stays Czech
    expect(t.conditionDesc("blinded")).toBe(csConditionDescExpected());
    expect(t.ui("common.cancel")).toBe("Zrušit");
  });

  it("keeps the ability description on the UI switch, not stats", () => {
    const t = makeLocalizer({ ui: "en", terms: "cs", stats: "cs" });
    // name from stats (cs), description from ui (en)
    expect(t.ability("dex")).toBe("Obratnost");
    expect(t.abilityDesc("dex")).toMatch(/Agility and reflexes/);
  });
});

function csConditionDescExpected(): string {
  return localizeConditionDesc("blinded", "cs");
}
