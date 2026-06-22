import { EQUIPMENT, MONSTERS, SPELLS } from "./data.js";
import type {
  SrdClass,
  SrdEquipment,
  SrdFeat,
  SrdFeature,
  SrdLanguage,
  SrdMagicItem,
  SrdMonster,
  SrdProficiency,
  SrdRace,
  SrdSpell,
  SrdSubclass,
  SrdSubrace,
  SrdTrait,
} from "./types.js";

export * from "./types.js";
export { MONSTERS, SPELLS, EQUIPMENT } from "./data.js";

/**
 * Read-only typed accessors over the bundled SRD subset. A production loader
 * can merge a mounted /data/srd dataset on top of these defaults; the
 * accessors stay pure (no IO) so the engine can depend on them safely.
 *
 * The monster/spell/equipment categories ship a small bundled default
 * (`data.ts`); the richer creation/leveling categories (races, classes,
 * feats…) are only populated when a full dataset is mounted (#20), so they
 * default to empty and are tolerant of a minimal setup.
 */
export interface SrdIndex {
  monster(id: string): SrdMonster | undefined;
  spell(id: string): SrdSpell | undefined;
  equipment(id: string): SrdEquipment | undefined;
  race(id: string): SrdRace | undefined;
  subrace(id: string): SrdSubrace | undefined;
  class(id: string): SrdClass | undefined;
  subclass(id: string): SrdSubclass | undefined;
  feature(id: string): SrdFeature | undefined;
  trait(id: string): SrdTrait | undefined;
  feat(id: string): SrdFeat | undefined;
  magicItem(id: string): SrdMagicItem | undefined;
  proficiency(id: string): SrdProficiency | undefined;
  language(id: string): SrdLanguage | undefined;
  /** Enumerate a whole category (for creation/leveling pickers). */
  list: {
    monsters(): SrdMonster[];
    spells(): SrdSpell[];
    equipment(): SrdEquipment[];
    races(): SrdRace[];
    subraces(): SrdSubrace[];
    classes(): SrdClass[];
    subclasses(): SrdSubclass[];
    features(): SrdFeature[];
    traits(): SrdTrait[];
    feats(): SrdFeat[];
    magicItems(): SrdMagicItem[];
    proficiencies(): SrdProficiency[];
    languages(): SrdLanguage[];
  };
}

export interface SrdOverrides {
  monsters?: Record<string, SrdMonster>;
  spells?: Record<string, SrdSpell>;
  equipment?: Record<string, SrdEquipment>;
  races?: Record<string, SrdRace>;
  subraces?: Record<string, SrdSubrace>;
  classes?: Record<string, SrdClass>;
  subclasses?: Record<string, SrdSubclass>;
  features?: Record<string, SrdFeature>;
  traits?: Record<string, SrdTrait>;
  feats?: Record<string, SrdFeat>;
  magicItems?: Record<string, SrdMagicItem>;
  proficiencies?: Record<string, SrdProficiency>;
  languages?: Record<string, SrdLanguage>;
}

export function createSrdIndex(overrides?: SrdOverrides): SrdIndex {
  const monsters = { ...MONSTERS, ...(overrides?.monsters ?? {}) };
  const spells = { ...SPELLS, ...(overrides?.spells ?? {}) };
  const equipment = { ...EQUIPMENT, ...(overrides?.equipment ?? {}) };
  const races = { ...(overrides?.races ?? {}) };
  const subraces = { ...(overrides?.subraces ?? {}) };
  const classes = { ...(overrides?.classes ?? {}) };
  const subclasses = { ...(overrides?.subclasses ?? {}) };
  const features = { ...(overrides?.features ?? {}) };
  const traits = { ...(overrides?.traits ?? {}) };
  const feats = { ...(overrides?.feats ?? {}) };
  const magicItems = { ...(overrides?.magicItems ?? {}) };
  const proficiencies = { ...(overrides?.proficiencies ?? {}) };
  const languages = { ...(overrides?.languages ?? {}) };
  return {
    monster: (id) => monsters[id],
    spell: (id) => spells[id],
    equipment: (id) => equipment[id],
    race: (id) => races[id],
    subrace: (id) => subraces[id],
    class: (id) => classes[id],
    subclass: (id) => subclasses[id],
    feature: (id) => features[id],
    trait: (id) => traits[id],
    feat: (id) => feats[id],
    magicItem: (id) => magicItems[id],
    proficiency: (id) => proficiencies[id],
    language: (id) => languages[id],
    list: {
      monsters: () => Object.values(monsters),
      spells: () => Object.values(spells),
      equipment: () => Object.values(equipment),
      races: () => Object.values(races),
      subraces: () => Object.values(subraces),
      classes: () => Object.values(classes),
      subclasses: () => Object.values(subclasses),
      features: () => Object.values(features),
      traits: () => Object.values(traits),
      feats: () => Object.values(feats),
      magicItems: () => Object.values(magicItems),
      proficiencies: () => Object.values(proficiencies),
      languages: () => Object.values(languages),
    },
  };
}

export const srd: SrdIndex = createSrdIndex();

/**
 * Spells on a class's list (#20), optionally capped at `maxLevel`, sorted by
 * level then name. Returns `[]` when no SRD spell data with class tags is
 * mounted, so callers can fall back to free-text entry.
 */
export function spellsForClass(index: SrdIndex, classId: string, maxLevel?: number): SrdSpell[] {
  return index.list
    .spells()
    .filter((s) => s.classes.includes(classId) && (maxLevel === undefined || s.level <= maxLevel))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}
