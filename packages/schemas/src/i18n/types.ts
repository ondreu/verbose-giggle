/**
 * i18n infrastructure (#48a). The project is Czech-first; this layer adds
 * English alongside Czech and the scaffolding for further languages, with
 * runtime switching (no reload). Three independent switches let a player mix
 * languages — e.g. Czech UI but English spell names (#48b/#48c/#48d):
 *
 *  - `ui`    — Switch #1: general UI labels, tooltips, rules descriptions and
 *              the DM narration language.
 *  - `terms` — Switch #2: game terminology (spell/feat/skill/condition/race/…
 *              names).
 *  - `stats` — Switch #3: ability scores and their abbreviations.
 *
 * The label data lives in per-language bundles ({@link LabelBundle}); the
 * resolvers in `./index.ts` are **pure** — the active locale is passed in, never
 * read from global state. That keeps `@adm/schemas` safe to share between the
 * multi-tenant server (#55f) and the browser, where the live switch state is
 * held by the web store and threaded through.
 */
export const LOCALES = ["cs", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** The three independent language switches (#48b/#48c/#48d). */
export interface LocaleSettings {
  /** Switch #1: UI labels, tooltips, rules text and DM narration. */
  ui: Locale;
  /** Switch #2: game terminology (spell/feat/skill/condition/… names). */
  terms: Locale;
  /** Switch #3: ability scores and abbreviations. */
  stats: Locale;
}

/** Czech-first defaults — matches the project's guiding language. */
export const DEFAULT_LOCALE_SETTINGS: LocaleSettings = {
  ui: "cs",
  terms: "cs",
  stats: "cs",
};

/** Narrow an arbitrary string to a {@link Locale}, defaulting to `cs`. */
export function asLocale(value: unknown): Locale {
  return value === "en" ? "en" : "cs";
}

/**
 * One language's worth of player-facing strings. Maps are keyed by the same
 * English SRD ids/enum values used everywhere else (ids never translate);
 * missing entries fall back per category (prettified id for names, the other
 * field's emptiness for descriptions). A bundle may leave the long-tail name
 * maps (`spellName`/`itemName`) partial and lean on the fallback.
 */
export interface LabelBundle {
  ability: Record<string, string>;
  abilityAbbr: Record<string, string>;
  abilityDesc: Record<string, string>;
  condition: Record<string, string>;
  conditionDesc: Record<string, string>;
  damage: Record<string, string>;
  damageDesc: Record<string, string>;
  skill: Record<string, string>;
  skillDesc: Record<string, string>;
  spellSchool: Record<string, string>;
  spellSchoolDesc: Record<string, string>;
  race: Record<string, string>;
  subrace: Record<string, string>;
  className: Record<string, string>;
  feat: Record<string, string>;
  weaponProperty: Record<string, string>;
  weaponPropertyDesc: Record<string, string>;
  alignment: Record<string, string>;
  aoe: Record<string, string>;
  questStatus: Record<string, string>;
  spellName: Record<string, string>;
  itemName: Record<string, string>;
  /** Free-form UI message catalog (#48b), keyed by a stable dot-id. */
  ui: Record<string, string>;
}
