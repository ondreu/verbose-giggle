import { CS } from "./cs.js";
import { EN } from "./en.js";
import {
  type LabelBundle,
  type Locale,
  type LocaleSettings,
  DEFAULT_LOCALE_SETTINGS,
} from "./types.js";

export * from "./types.js";

/** Registered language bundles. New languages add a key here (#48a). */
export const BUNDLES: Record<Locale, LabelBundle> = { cs: CS, en: EN };

function bundle(locale: Locale): LabelBundle {
  return BUNDLES[locale] ?? CS;
}

/** Prettify an SRD id ("fire-bolt") into a readable fallback ("Fire Bolt"). */
function prettyId(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Name-style lookup: bundle entry → caller fallback → prettified id. Never
 * returns empty for a non-empty id, so a missing translation degrades to a
 * legible English-ish label rather than a blank.
 */
function name(map: Record<string, string>, id: string | undefined, fallback?: string): string {
  if (!id) return fallback ?? "";
  return map[id] ?? fallback ?? prettyId(id);
}

/** Description-style lookup: bundle entry → "" (descriptions are optional). */
function desc(map: Record<string, string>, id: string | undefined): string {
  if (!id) return "";
  return map[id] ?? "";
}

// --- Pure resolvers (locale passed explicitly) ----------------------------
// Switch routing (ui/terms/stats) is the caller's concern — see makeLocalizer.

export function localizeAbility(k: string, locale: Locale): string {
  return bundle(locale).ability[k] ?? k.toUpperCase();
}
export function localizeAbilityAbbr(k: string, locale: Locale): string {
  return bundle(locale).abilityAbbr[k] ?? k.toUpperCase();
}
export function localizeAbilityDesc(k: string, locale: Locale): string {
  return desc(bundle(locale).abilityDesc, k);
}
export function localizeCondition(id: string, locale: Locale): string {
  return name(bundle(locale).condition, id);
}
export function localizeConditionDesc(id: string, locale: Locale): string {
  return desc(bundle(locale).conditionDesc, id);
}
export function localizeDamage(id: string | undefined, locale: Locale): string {
  if (!id) return "";
  return name(bundle(locale).damage, id);
}
export function localizeDamageDesc(id: string | undefined, locale: Locale): string {
  return desc(bundle(locale).damageDesc, id);
}
export function localizeSkill(id: string, locale: Locale): string {
  return name(bundle(locale).skill, id);
}
export function localizeSkillDesc(id: string, locale: Locale): string {
  return desc(bundle(locale).skillDesc, id);
}
export function localizeSpellSchool(id: string | undefined, locale: Locale): string {
  if (!id) return "";
  return name(bundle(locale).spellSchool, id);
}
export function localizeSpellSchoolDesc(id: string | undefined, locale: Locale): string {
  return desc(bundle(locale).spellSchoolDesc, id);
}
export function localizeRace(id: string, locale: Locale, fallback?: string): string {
  return name(bundle(locale).race, id, fallback);
}
export function localizeSubrace(id: string, locale: Locale, fallback?: string): string {
  return name(bundle(locale).subrace, id, fallback);
}
export function localizeLineage(id: string | undefined, locale: Locale): string {
  if (!id) return "";
  const b = bundle(locale);
  return b.subrace[id] ?? b.race[id] ?? id;
}
export function localizeClass(id: string, locale: Locale, fallback?: string): string {
  return name(bundle(locale).className, id, fallback);
}
export function localizeFeat(id: string, locale: Locale, fallback?: string): string {
  return name(bundle(locale).feat, id, fallback);
}
export function localizeWeaponProperty(id: string, locale: Locale): string {
  return name(bundle(locale).weaponProperty, id);
}
export function localizeWeaponPropertyDesc(id: string, locale: Locale): string {
  return desc(bundle(locale).weaponPropertyDesc, id);
}
export function localizeAlignment(id: string | undefined, locale: Locale): string {
  if (!id) return "";
  return name(bundle(locale).alignment, id);
}
export function localizeAoe(id: string, locale: Locale): string {
  return name(bundle(locale).aoe, id);
}
export function localizeQuestStatus(id: string, locale: Locale): string {
  return name(bundle(locale).questStatus, id);
}
export function localizeSpellName(id: string, locale: Locale, fallback?: string): string {
  return name(bundle(locale).spellName, id, fallback);
}
export function localizeItemName(id: string, locale: Locale, fallback?: string): string {
  return name(bundle(locale).itemName, id, fallback);
}
/** UI message catalog (#48b). Falls back to the key (or `fallback`). */
export function localizeUi(key: string, locale: Locale, fallback?: string): string {
  return bundle(locale).ui[key] ?? fallback ?? key;
}

/**
 * Bind every resolver to a {@link LocaleSettings} triple, routing each category
 * to the switch that governs it: terminology → `terms`, ability scores →
 * `stats`, rules text + UI → `ui`. This is the API the web/server thread their
 * live switch state through (#48b/#48c/#48d); `@adm/schemas` holds no global
 * locale state, so it stays multi-tenant safe.
 */
export function makeLocalizer(settings: LocaleSettings = DEFAULT_LOCALE_SETTINGS) {
  const { ui, terms, stats } = settings;
  return {
    settings,
    // Switch #3 — ability scores
    ability: (k: string) => localizeAbility(k, stats),
    abilityAbbr: (k: string) => localizeAbilityAbbr(k, stats),
    // Switch #2 — game terminology
    condition: (id: string) => localizeCondition(id, terms),
    damage: (id?: string) => localizeDamage(id, terms),
    skill: (id: string) => localizeSkill(id, terms),
    spellSchool: (id?: string) => localizeSpellSchool(id, terms),
    race: (id: string, fb?: string) => localizeRace(id, terms, fb),
    subrace: (id: string, fb?: string) => localizeSubrace(id, terms, fb),
    lineage: (id?: string) => localizeLineage(id, terms),
    className: (id: string, fb?: string) => localizeClass(id, terms, fb),
    feat: (id: string, fb?: string) => localizeFeat(id, terms, fb),
    weaponProperty: (id: string) => localizeWeaponProperty(id, terms),
    alignment: (id?: string) => localizeAlignment(id, terms),
    aoe: (id: string) => localizeAoe(id, terms),
    questStatus: (id: string) => localizeQuestStatus(id, terms),
    spellName: (id: string, fb?: string) => localizeSpellName(id, terms, fb),
    itemName: (id: string, fb?: string) => localizeItemName(id, terms, fb),
    // Switch #1 — UI labels and rules descriptions
    abilityDesc: (k: string) => localizeAbilityDesc(k, ui),
    conditionDesc: (id: string) => localizeConditionDesc(id, ui),
    damageDesc: (id?: string) => localizeDamageDesc(id, ui),
    skillDesc: (id: string) => localizeSkillDesc(id, ui),
    spellSchoolDesc: (id?: string) => localizeSpellSchoolDesc(id, ui),
    weaponPropertyDesc: (id: string) => localizeWeaponPropertyDesc(id, ui),
    ui: (key: string, fb?: string) => localizeUi(key, ui, fb),
  };
}

export type Localizer = ReturnType<typeof makeLocalizer>;
