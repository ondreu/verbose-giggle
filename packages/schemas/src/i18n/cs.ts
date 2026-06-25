import type { LabelBundle } from "./types.js";
import {
  ABILITY_ABBR,
  ABILITY_CS,
  ABILITY_DESC_CS,
  ALIGNMENT_CS,
  AOE_SHAPE_CS,
  CLASS_CS,
  CONDITION_CS,
  CONDITION_DESC_CS,
  DAMAGE_CS,
  DAMAGE_DESC_CS,
  FEAT_CS,
  ITEM_NAME_CS,
  QUEST_STATUS_CS,
  RACE_CS,
  SKILL_CS,
  SKILL_DESC_CS,
  SPELL_NAME_CS,
  SPELL_SCHOOL_CS,
  SPELL_SCHOOL_DESC_CS,
  SUBRACE_CS,
  WEAPON_PROPERTY_CS,
  WEAPON_PROPERTY_DESC_CS,
} from "../labels.js";

/**
 * Czech bundle (#48a). Reuses the existing `*_CS` maps in `labels.ts` as the
 * single source of truth — those stay the canonical Czech data and keep their
 * own `csXxx` accessors for backward compatibility.
 */
export const CS_UI: Record<string, string> = {
  // Starter UI catalog (#48b expands this). Keyed by stable dot-ids.
  "common.cancel": "Zrušit",
  "common.save": "Uložit",
  "common.close": "Zavřít",
  "common.back": "Zpět",
  "common.continue": "Pokračovat",
  "common.loading": "Načítání…",
  "settings.language.ui": "Jazyk rozhraní",
  "settings.language.terms": "Jazyk herních pojmů",
  "settings.language.stats": "Jazyk vlastností",
};

export const CS: LabelBundle = {
  ability: ABILITY_CS,
  abilityAbbr: ABILITY_ABBR,
  abilityDesc: ABILITY_DESC_CS,
  condition: CONDITION_CS,
  conditionDesc: CONDITION_DESC_CS,
  damage: DAMAGE_CS,
  damageDesc: DAMAGE_DESC_CS,
  skill: SKILL_CS,
  skillDesc: SKILL_DESC_CS,
  spellSchool: SPELL_SCHOOL_CS,
  spellSchoolDesc: SPELL_SCHOOL_DESC_CS,
  race: RACE_CS,
  subrace: SUBRACE_CS,
  className: CLASS_CS,
  feat: FEAT_CS,
  weaponProperty: WEAPON_PROPERTY_CS,
  weaponPropertyDesc: WEAPON_PROPERTY_DESC_CS,
  alignment: ALIGNMENT_CS,
  aoe: AOE_SHAPE_CS,
  questStatus: QUEST_STATUS_CS,
  spellName: SPELL_NAME_CS,
  itemName: ITEM_NAME_CS,
  ui: CS_UI,
};
