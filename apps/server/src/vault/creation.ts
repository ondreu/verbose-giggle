import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ActorSchema, csClass, csRace, csSubrace, type Actor } from "@adm/schemas";
import { spellsForClass, type SrdIndex } from "@adm/srd";
import type { LoadedCampaign } from "./campaign.js";
import { writeNote } from "./notes.js";
import { slugify } from "./scaffold.js";

/**
 * Guided character creation (#14): a compact SRD 5.1 reference for races and
 * classes, plus a builder that turns a GUI draft into a schema-valid actor note
 * and enrolls it in the campaign party. Identifiers stay English (SRD ids);
 * player-facing labels are Czech.
 *
 * When a full SRD dataset is mounted (#20) the hardcoded base below is enriched
 * with real subraces, class spell lists, subclasses, feats, racial traits and
 * languages. With only the minimal bundled subset, the base alone still yields
 * a valid character — every SRD-derived field degrades to empty/optional.
 */

type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
type CasterKind = "full" | "half" | "warlock" | "none";

interface RaceDef {
  name: string;
  speed: number;
  bonuses: Partial<Record<Ability, number>>;
}

interface ClassDef {
  name: string;
  hitDie: "d6" | "d8" | "d10" | "d12";
  saves: Ability[];
  skillCount: number;
  skills: string[];
  caster: CasterKind;
  /** Level-1 spell picks the GUI offers (caps on the SRD spell list, #20). */
  cantrips?: number;
  spells?: number;
}

const RACES: Record<string, RaceDef> = {
  human: { name: "Člověk", speed: 30, bonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 } },
  elf: { name: "Elf", speed: 30, bonuses: { dex: 2 } },
  dwarf: { name: "Trpaslík", speed: 25, bonuses: { con: 2 } },
  halfling: { name: "Půlčík", speed: 25, bonuses: { dex: 2 } },
  "half-orc": { name: "Půlork", speed: 30, bonuses: { str: 2, con: 1 } },
  "half-elf": { name: "Půlelf", speed: 30, bonuses: { cha: 2, dex: 1, con: 1 } },
  tiefling: { name: "Tiefling", speed: 30, bonuses: { cha: 2, int: 1 } },
  dragonborn: { name: "Drakorozený", speed: 30, bonuses: { str: 2, cha: 1 } },
  gnome: { name: "Gnóm", speed: 25, bonuses: { int: 2 } },
};

const PHYSICAL_SOCIAL = [
  "acrobatics", "athletics", "deception", "insight", "intimidation",
  "investigation", "perception", "performance", "persuasion", "sleight-of-hand",
  "stealth", "history", "arcana", "nature", "religion", "medicine", "survival",
  "animal-handling",
];

const CLASSES: Record<string, ClassDef> = {
  fighter: { name: "Bojovník", hitDie: "d10", saves: ["str", "con"], skillCount: 2, caster: "none", skills: ["acrobatics", "athletics", "history", "insight", "intimidation", "perception", "survival"] },
  barbarian: { name: "Barbar", hitDie: "d12", saves: ["str", "con"], skillCount: 2, caster: "none", skills: ["animal-handling", "athletics", "intimidation", "nature", "perception", "survival"] },
  rogue: { name: "Tulák", hitDie: "d8", saves: ["dex", "int"], skillCount: 4, caster: "none", skills: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "performance", "persuasion", "sleight-of-hand", "stealth"] },
  monk: { name: "Mnich", hitDie: "d8", saves: ["str", "dex"], skillCount: 2, caster: "none", skills: ["acrobatics", "athletics", "history", "insight", "religion", "stealth"] },
  ranger: { name: "Hraničář", hitDie: "d10", saves: ["str", "dex"], skillCount: 3, caster: "half", skills: ["animal-handling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"] },
  paladin: { name: "Paladin", hitDie: "d10", saves: ["wis", "cha"], skillCount: 2, caster: "half", skills: ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"] },
  cleric: { name: "Klerik", hitDie: "d8", saves: ["wis", "cha"], skillCount: 2, caster: "full", cantrips: 3, spells: 3, skills: ["history", "insight", "medicine", "persuasion", "religion"] },
  druid: { name: "Druid", hitDie: "d8", saves: ["int", "wis"], skillCount: 2, caster: "full", cantrips: 2, spells: 3, skills: ["arcana", "animal-handling", "insight", "medicine", "nature", "perception", "religion", "survival"] },
  wizard: { name: "Kouzelník", hitDie: "d6", saves: ["int", "wis"], skillCount: 2, caster: "full", cantrips: 3, spells: 6, skills: ["arcana", "history", "insight", "investigation", "medicine", "religion"] },
  sorcerer: { name: "Čaroděj", hitDie: "d6", saves: ["con", "cha"], skillCount: 2, caster: "full", cantrips: 4, spells: 2, skills: ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"] },
  bard: { name: "Bard", hitDie: "d8", saves: ["dex", "cha"], skillCount: 3, caster: "full", cantrips: 2, spells: 4, skills: PHYSICAL_SOCIAL },
  warlock: { name: "Černokněžník", hitDie: "d8", saves: ["wis", "cha"], skillCount: 2, caster: "warlock", cantrips: 2, spells: 2, skills: ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"] },
};

const HIT_DIE_MAX: Record<string, number> = { d6: 6, d8: 8, d10: 10, d12: 12 };
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

const abilityMod = (score: number) => Math.floor((score - 10) / 2);

/**
 * Armor Class from equipped SRD armor (#20): the best body armor (base + a
 * dex contribution capped per category) plus any shield, else unarmored
 * (10 + DEX). Items without armor data are ignored, so this degrades to the
 * unarmored value when no dataset is mounted.
 */
function computeArmorClass(
  srd: SrdIndex | undefined,
  inventory: { id: string; equipped?: boolean }[],
  dexMod: number,
): number {
  let bestBody = 10 + dexMod; // unarmored default
  let shield = 0;
  for (const entry of inventory) {
    if (!entry.equipped) continue;
    const eq = srd?.equipment(entry.id);
    if (!eq || eq.ac === undefined) continue;
    const cat = eq.armor_category ?? "";
    if (cat === "shield" || eq.id.includes("shield")) {
      shield = Math.max(shield, eq.ac);
      continue;
    }
    // dex_bonus flag controls whether DEX adds; max_bonus caps it (medium armor).
    const dexPart = eq.ac_dex_bonus ? Math.min(dexMod, eq.ac_max_bonus ?? Infinity) : 0;
    bestBody = Math.max(bestBody, eq.ac + dexPart);
  }
  return bestBody + shield;
}

export interface SubraceOption {
  id: string;
  name: string;
  bonuses: Partial<Record<Ability, number>>;
  traits: string[];
}
export interface SpellOption {
  id: string;
  name: string;
  level: number;
  school?: string;
}

/** Subraces of a race id from the mounted SRD (empty without a dataset). */
function subracesFor(srd: SrdIndex | undefined, raceId: string): SubraceOption[] {
  if (!srd) return [];
  return srd.list
    .subraces()
    .filter((s) => s.race === raceId)
    .map((s) => ({
      id: s.id,
      name: csSubrace(s.id, s.name),
      bonuses: s.ability_bonuses as Partial<Record<Ability, number>>,
      traits: s.traits,
    }));
}

/** Subclasses of a class id from the mounted SRD (empty without a dataset). */
function subclassesFor(srd: SrdIndex | undefined, classId: string) {
  if (!srd) return [];
  return srd.list
    .subclasses()
    .filter((s) => s.class === classId)
    .map((s) => ({ id: s.id, name: s.name, flavor: s.flavor }));
}

/** The cantrip + level-1 spell list a class may pick from (SRD, #20). */
function spellListFor(srd: SrdIndex | undefined, classId: string, cls: ClassDef) {
  if (!srd || (!cls.cantrips && !cls.spells)) return undefined;
  const spells = spellsForClass(srd, classId, 1);
  if (spells.length === 0) return undefined;
  const toOpt = (lvl: number): SpellOption[] =>
    spells.filter((s) => s.level === lvl).map((s) => ({ id: s.id, name: s.name, level: s.level, school: s.school }));
  return {
    cantripsAllowed: cls.cantrips ?? 0,
    spellsAllowed: cls.spells ?? 0,
    cantrips: toOpt(0),
    level1: toOpt(1),
  };
}

/**
 * Form options for the creation GUI (labels are Czech, ids stay SRD). Pass the
 * SRD index to enrich with subraces, subclasses, real spell lists and feats;
 * omit it (or mount only the minimal subset) for the hardcoded base alone.
 */
export function creationOptions(srd?: SrdIndex) {
  const feats = srd
    ? srd.list.feats().map((f) => ({ id: f.id, name: f.name, prerequisites: f.prerequisites }))
    : [];
  return {
    races: Object.entries(RACES).map(([id, r]) => ({
      id,
      name: csRace(id, r.name),
      speed: r.speed,
      bonuses: r.bonuses,
      subraces: subracesFor(srd, id),
    })),
    classes: Object.entries(CLASSES).map(([id, c]) => ({
      id,
      name: csClass(id, c.name),
      hitDie: c.hitDie,
      saves: c.saves,
      skillCount: c.skillCount,
      skills: c.skills,
      caster: c.caster,
      subclasses: subclassesFor(srd, id),
      spellList: spellListFor(srd, id, c),
    })),
    feats,
    standardArray: STANDARD_ARRAY,
    abilityOrder: ["str", "dex", "con", "int", "wis", "cha"] as Ability[],
  };
}

/** SRD class id for a stored class label/id (the sheet now stores ids). */
function classIdOf(actorClass: string | undefined): string | undefined {
  if (!actorClass) return undefined;
  const lc = actorClass.toLowerCase();
  if (CLASSES[lc]) return lc;
  // Tolerate a Czech label stored by older saves.
  const byLabel = Object.entries(CLASSES).find(([, c]) => c.name.toLowerCase() === lc);
  return byLabel?.[0];
}

/**
 * What the *next* level-up offers an actor, derived from the SRD when mounted
 * (#13/#20): spells castable at the actor's tier, subclass choices when the
 * class needs one and none is set yet, and the feat list as an ASI alternative.
 */
export function levelUpOptions(
  srd: SrdIndex,
  actor: { class?: string; subclass?: string; spell_slots?: Record<string, unknown>; spells_known?: string[] },
) {
  const classId = classIdOf(actor.class);
  // Highest spell tier the actor currently has a slot for (cantrips always ok).
  const tiers = Object.keys(actor.spell_slots ?? {}).map((t) => Number(t)).filter((n) => Number.isFinite(n));
  const maxLevel = tiers.length ? Math.max(...tiers) : 0;
  const isCaster = (actor.spells_known?.length ?? 0) > 0 || tiers.length > 0;

  let spellList: { id: string; name: string; level: number; school?: string }[] | undefined;
  if (classId && isCaster) {
    const known = new Set(actor.spells_known ?? []);
    const spells = spellsForClass(srd, classId, maxLevel).filter((s) => !known.has(s.id));
    if (spells.length) spellList = spells.map((s) => ({ id: s.id, name: s.name, level: s.level, school: s.school }));
  }

  const subclasses = classId && !actor.subclass ? subclassesFor(srd, classId) : [];
  const feats = srd.list.feats().map((f) => ({ id: f.id, name: f.name }));
  return { spellList, subclasses, feats };
}

export interface CharacterDraft {
  name: string;
  race: string;
  /** Optional SRD subrace id (when the chosen race offers subraces, #20). */
  subrace?: string;
  class: string;
  /** Base ability scores before racial bonuses. */
  abilities: Record<Ability, number>;
  skills: string[];
  spells?: string[];
  controller?: "human" | "ai";
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base || "postava";
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

/**
 * Build a schema-valid actor from a draft and write it into the campaign:
 * a note under characters/ and an entry in campaign.yaml `party`. Returns the
 * new actor id. The caller is responsible for re-opening the SessionManager.
 */
export async function createCharacter(
  campaign: LoadedCampaign,
  draft: CharacterDraft,
  srd?: SrdIndex,
): Promise<{ id: string }> {
  const name = draft.name?.trim();
  if (!name) throw new Error("Jméno postavy je povinné");
  const race = RACES[draft.race];
  const cls = CLASSES[draft.class];
  if (!race) throw new Error(`Neznámá rasa: ${draft.race}`);
  if (!cls) throw new Error(`Neznámé povolání: ${draft.class}`);

  // Resolve an optional subrace (must belong to the chosen race when SRD-backed).
  const subrace = draft.subrace ? srd?.subrace(draft.subrace) : undefined;
  if (draft.subrace && srd && (!subrace || subrace.race !== draft.race)) {
    throw new Error(`Neplatná podrasa pro ${draft.race}: ${draft.subrace}`);
  }
  const subraceBonuses = (subrace?.ability_bonuses ?? {}) as Partial<Record<Ability, number>>;

  // Apply racial + subrace bonuses (capped at 20) to the base scores.
  const abilities = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } as Record<Ability, number>;
  for (const key of Object.keys(abilities) as Ability[]) {
    const base = Number(draft.abilities?.[key] ?? 10);
    if (!Number.isFinite(base) || base < 3 || base > 18) {
      throw new Error(`Neplatná hodnota vlastnosti ${key}: ${draft.abilities?.[key]}`);
    }
    abilities[key] = Math.min(20, base + (race.bonuses[key] ?? 0) + (subraceBonuses[key] ?? 0));
  }

  // Validate chosen skills against the class list and its pick count.
  const chosen = (draft.skills ?? []).filter((s) => cls.skills.includes(s));
  const skills = chosen.slice(0, cls.skillCount);

  const conMod = abilityMod(abilities.con);
  const dexMod = abilityMod(abilities.dex);
  const hpMax = Math.max(1, HIT_DIE_MAX[cls.hitDie]! + conMod);

  // Level-1 slots: full casters get two 1st-level slots; warlock one; else none.
  const spell_slots: Record<string, { max: number; used: number }> = {};
  if (cls.caster === "full") spell_slots["1"] = { max: 2, used: 0 };
  else if (cls.caster === "warlock") spell_slots["1"] = { max: 1, used: 0 };

  // Spells: when the class has an SRD spell list, only accept ids on it (and at
  // most a cantrip + level-1 spell). Without a dataset, accept the raw ids.
  const requestedSpells = (draft.spells ?? []).map((s) => s.trim()).filter(Boolean);
  let spells_known = requestedSpells;
  if (srd) {
    const allowed = new Set(spellsForClass(srd, draft.class, 1).map((s) => s.id));
    if (allowed.size > 0) {
      const unknown = requestedSpells.filter((s) => !allowed.has(s));
      if (unknown.length) throw new Error(`Kouzla mimo seznam ${cls.name}: ${unknown.join(", ")}`);
    }
  }

  // Languages, racial traits and level-1 features (SRD-derived; empty without it).
  const srdRace = srd?.race(draft.race);
  const languages = Array.from(new Set(srdRace?.languages ?? []));
  const traits = Array.from(new Set([...(srdRace?.traits ?? []), ...(subrace?.traits ?? [])]));
  const features = srd
    ? srd.list.features().filter((f) => f.class === draft.class && (f.level ?? 1) === 1 && !f.subclass).map((f) => f.id)
    : [];

  // Starting equipment from the SRD class (the guaranteed grants). Armor,
  // shields and weapons start equipped so AC and attacks resolve out of the box.
  const inventory = (srd ? srd.class(draft.class)?.starting_equipment ?? [] : []).map((e) => {
    const eq = srd?.equipment(e.id);
    const equipped = eq ? eq.ac !== undefined || eq.damage !== undefined : undefined;
    return { id: e.id, qty: e.qty, ...(equipped ? { equipped: true } : {}) };
  });
  const ac = computeArmorClass(srd, inventory, dexMod);

  const takenIds = new Set(Object.keys(campaign.actors));
  const id = uniqueId(slugify(name), takenIds);

  // Store SRD ids (English) on the sheet — the UI localizes them to Czech via
  // labels. When a subrace is chosen its id stands in for the lineage, matching
  // the example vault (e.g. `race: high-elf`).
  const actor: Actor = ActorSchema.parse({
    type: "character",
    id,
    name,
    controller: draft.controller ?? "human",
    faction: "party",
    race: subrace ? subrace.id : draft.race,
    class: draft.class,
    level: 1,
    xp: 0,
    abilities,
    proficiency_bonus: 2,
    proficiencies: { saves: cls.saves, skills, weapons: [], armor: [] },
    hp: { max: hpMax, current: hpMax, temp: 0 },
    ac,
    speed: srdRace?.speed ?? race.speed,
    hit_dice: { type: cls.hitDie, total: 1, remaining: 1 },
    spell_slots,
    spells_known,
    languages,
    features: [...traits, ...features],
    feats: [],
    conditions: [],
    concentration: null,
    inventory,
    attunement: [],
    death_saves: { success: 0, fail: 0 },
    position: null,
    srd_ref: null,
    ai_profile: null,
  });

  // Write the actor note.
  const file = path.join(campaign.dir, "characters", `${id}.md`);
  const body = `# ${name}\n\n${race.name} ${cls.name}, 1. úroveň. Vytvořeno průvodcem tvorby postavy.\n`;
  await writeNote({ filePath: file, data: actor as unknown as Record<string, unknown>, body });

  // Enroll in the campaign party (campaign.yaml).
  const cfgPath = path.join(campaign.dir, "campaign.yaml");
  const cfg = YAML.parse(await fs.readFile(cfgPath, "utf8")) ?? {};
  cfg.party = Array.isArray(cfg.party) ? cfg.party : [];
  if (!cfg.party.includes(id)) cfg.party.push(id);
  await fs.writeFile(cfgPath, YAML.stringify(cfg), "utf8");

  return { id };
}

/**
 * Remove an actor id from the campaign party roster (campaign.yaml). Used when
 * a fallen hero is replaced after a game-over so the roster stays accurate and
 * a single-character campaign remains single-character (#23). The actor note is
 * left on disk as history; it is simply no longer an active party member.
 */
export async function removeFromParty(campaignDir: string, id: string): Promise<void> {
  const cfgPath = path.join(campaignDir, "campaign.yaml");
  const cfg = YAML.parse(await fs.readFile(cfgPath, "utf8")) ?? {};
  if (!Array.isArray(cfg.party)) return;
  const next = cfg.party.filter((p: string) => p !== id);
  if (next.length === cfg.party.length) return;
  cfg.party = next;
  await fs.writeFile(cfgPath, YAML.stringify(cfg), "utf8");
}
