import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ActorSchema, type Actor } from "@adm/schemas";
import type { LoadedCampaign } from "./campaign.js";
import { writeNote } from "./notes.js";
import { slugify } from "./scaffold.js";

/**
 * Guided character creation (#14): a compact SRD 5.1 reference for races and
 * classes, plus a builder that turns a GUI draft into a schema-valid actor note
 * and enrolls it in the campaign party. Identifiers stay English (SRD ids);
 * player-facing labels are Czech.
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
  cleric: { name: "Klerik", hitDie: "d8", saves: ["wis", "cha"], skillCount: 2, caster: "full", skills: ["history", "insight", "medicine", "persuasion", "religion"] },
  druid: { name: "Druid", hitDie: "d8", saves: ["int", "wis"], skillCount: 2, caster: "full", skills: ["arcana", "animal-handling", "insight", "medicine", "nature", "perception", "religion", "survival"] },
  wizard: { name: "Kouzelník", hitDie: "d6", saves: ["int", "wis"], skillCount: 2, caster: "full", skills: ["arcana", "history", "insight", "investigation", "medicine", "religion"] },
  sorcerer: { name: "Čaroděj", hitDie: "d6", saves: ["con", "cha"], skillCount: 2, caster: "full", skills: ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"] },
  bard: { name: "Bard", hitDie: "d8", saves: ["dex", "cha"], skillCount: 3, caster: "full", skills: PHYSICAL_SOCIAL },
  warlock: { name: "Černokněžník", hitDie: "d8", saves: ["wis", "cha"], skillCount: 2, caster: "warlock", skills: ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"] },
};

const HIT_DIE_MAX: Record<string, number> = { d6: 6, d8: 8, d10: 10, d12: 12 };
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

const abilityMod = (score: number) => Math.floor((score - 10) / 2);

/** Form options for the creation GUI (labels are Czech, ids stay SRD). */
export function creationOptions() {
  return {
    races: Object.entries(RACES).map(([id, r]) => ({ id, name: r.name, speed: r.speed, bonuses: r.bonuses })),
    classes: Object.entries(CLASSES).map(([id, c]) => ({
      id,
      name: c.name,
      hitDie: c.hitDie,
      saves: c.saves,
      skillCount: c.skillCount,
      skills: c.skills,
      caster: c.caster,
    })),
    standardArray: STANDARD_ARRAY,
    abilityOrder: ["str", "dex", "con", "int", "wis", "cha"] as Ability[],
  };
}

export interface CharacterDraft {
  name: string;
  race: string;
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
): Promise<{ id: string }> {
  const name = draft.name?.trim();
  if (!name) throw new Error("Jméno postavy je povinné");
  const race = RACES[draft.race];
  const cls = CLASSES[draft.class];
  if (!race) throw new Error(`Neznámá rasa: ${draft.race}`);
  if (!cls) throw new Error(`Neznámé povolání: ${draft.class}`);

  // Apply racial bonuses (capped at 20) to the base scores.
  const abilities = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } as Record<Ability, number>;
  for (const key of Object.keys(abilities) as Ability[]) {
    const base = Number(draft.abilities?.[key] ?? 10);
    if (!Number.isFinite(base) || base < 3 || base > 18) {
      throw new Error(`Neplatná hodnota vlastnosti ${key}: ${draft.abilities?.[key]}`);
    }
    abilities[key] = Math.min(20, base + (race.bonuses[key] ?? 0));
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

  const takenIds = new Set(Object.keys(campaign.actors));
  const id = uniqueId(slugify(name), takenIds);

  const actor: Actor = ActorSchema.parse({
    type: "character",
    id,
    name,
    controller: draft.controller ?? "human",
    faction: "party",
    race: race.name,
    class: cls.name,
    level: 1,
    xp: 0,
    abilities,
    proficiency_bonus: 2,
    proficiencies: { saves: cls.saves, skills, weapons: [], armor: [] },
    hp: { max: hpMax, current: hpMax, temp: 0 },
    ac: 10 + dexMod,
    speed: race.speed,
    hit_dice: { type: cls.hitDie, total: 1, remaining: 1 },
    spell_slots,
    spells_known: (draft.spells ?? []).map((s) => s.trim()).filter(Boolean),
    conditions: [],
    concentration: null,
    inventory: [],
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
