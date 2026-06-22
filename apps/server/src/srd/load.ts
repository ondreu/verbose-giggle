import { promises as fs } from "node:fs";
import path from "node:path";
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
} from "@adm/srd";

/**
 * Override maps the engine's SrdIndex can merge. `monsters`/`spells`/
 * `equipment` ship a bundled default; the richer creation/leveling categories
 * (#20) are only populated when a full dataset is mounted.
 */
export interface SrdOverrides {
  monsters: Record<string, SrdMonster>;
  spells: Record<string, SrdSpell>;
  equipment: Record<string, SrdEquipment>;
  races: Record<string, SrdRace>;
  subraces: Record<string, SrdSubrace>;
  classes: Record<string, SrdClass>;
  subclasses: Record<string, SrdSubclass>;
  features: Record<string, SrdFeature>;
  traits: Record<string, SrdTrait>;
  feats: Record<string, SrdFeat>;
  magicItems: Record<string, SrdMagicItem>;
  proficiencies: Record<string, SrdProficiency>;
  languages: Record<string, SrdLanguage>;
}

/** An empty set of overrides — the minimal setup with no mounted dataset. */
export function emptyOverrides(): SrdOverrides {
  return {
    monsters: {},
    spells: {},
    equipment: {},
    races: {},
    subraces: {},
    classes: {},
    subclasses: {},
    features: {},
    traits: {},
    feats: {},
    magicItems: {},
    proficiencies: {},
    languages: {},
  };
}

const ABILITY_FULL: Record<string, "str" | "dex" | "con" | "int" | "wis" | "cha"> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
  // The dataset also uses three-letter ability indices in places.
  str: "str",
  dex: "dex",
  con: "con",
  int: "int",
  wis: "wis",
  cha: "cha",
};

function intFrom(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "string") {
    const m = v.match(/-?\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return fallback;
}

function idxList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => (typeof e === "string" ? e : (e?.index ?? e?.name)))
    .filter((x): x is string => typeof x === "string");
}

/** First `index` of a `{ index }` reference (e.g. `class`, `race`). */
function refIndex(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  const idx = (v as { index?: unknown })?.index;
  return typeof idx === "string" ? idx : undefined;
}

/** Join a `desc` field (string or string[]) into one paragraph. */
function descText(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return (v as unknown[]).filter((x) => typeof x === "string").join(" ");
  return undefined;
}

/** Map `[{ ability_score: { index }, bonus }]` → `{ str: 1, … }`. */
function abilityBonuses(v: unknown): Partial<Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>> {
  const out: Partial<Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>> = {};
  if (!Array.isArray(v)) return out;
  for (const b of v as Record<string, unknown>[]) {
    const idx = refIndex(b.ability_score);
    const key = idx ? ABILITY_FULL[idx] : undefined;
    if (key) out[key] = intFrom(b.bonus, 0);
  }
  return out;
}

function abilityList(v: unknown): ("str" | "dex" | "con" | "int" | "wis" | "cha")[] {
  return idxList(v)
    .map((i) => ABILITY_FULL[i])
    .filter((a): a is "str" | "dex" | "con" | "int" | "wis" | "cha" => Boolean(a));
}

/** Map a 5e-bits/5e-database monster record to our minimal SrdMonster. */
function mapMonster(m: Record<string, unknown>): SrdMonster | null {
  const id = (m.index ?? m.id) as string | undefined;
  const name = m.name as string | undefined;
  if (!id || !name) return null;
  const ac = Array.isArray(m.armor_class)
    ? intFrom((m.armor_class[0] as { value?: number })?.value, 10)
    : intFrom(m.armor_class, 10);
  const abilities = {
    str: intFrom(m.strength, 10),
    dex: intFrom(m.dexterity, 10),
    con: intFrom(m.constitution, 10),
    int: intFrom(m.intelligence, 10),
    wis: intFrom(m.wisdom, 10),
    cha: intFrom(m.charisma, 10),
  };
  const speed = intFrom((m.speed as { walk?: string })?.walk, 30);
  const actions = Array.isArray(m.actions)
    ? (m.actions as Record<string, unknown>[])
        .map((a) => {
          const dmg = Array.isArray(a.damage) ? (a.damage[0] as Record<string, unknown>) : undefined;
          return {
            name: String(a.name ?? "Attack"),
            attack_bonus: a.attack_bonus !== undefined ? intFrom(a.attack_bonus) : undefined,
            damage: dmg?.damage_dice ? String(dmg.damage_dice) : undefined,
            damage_type: (dmg?.damage_type as { index?: string })?.index,
          };
        })
        .filter((a) => a.damage)
    : [];
  return {
    id,
    name,
    ac,
    hp: intFrom(m.hit_points, 1),
    hit_dice: typeof m.hit_dice === "string" ? m.hit_dice : undefined,
    speed,
    abilities,
    proficiency_bonus: intFrom(m.proficiency_bonus, 2),
    cr: typeof m.challenge_rating === "number" ? m.challenge_rating : undefined,
    resistances: idxList(m.damage_resistances),
    immunities: idxList(m.damage_immunities),
    vulnerabilities: idxList(m.damage_vulnerabilities),
    actions,
  };
}

function mapSpell(s: Record<string, unknown>): SrdSpell | null {
  const id = (s.index ?? s.id) as string | undefined;
  const name = s.name as string | undefined;
  if (!id || !name) return null;
  const dc = s.dc as { dc_type?: { index?: string } } | undefined;
  const dmg = s.damage as { damage_type?: { index?: string } } | undefined;
  return {
    id,
    name,
    level: intFrom(s.level, 0),
    school: (s.school as { index?: string })?.index,
    range_ft: intFrom(s.range, 0) || undefined,
    concentration: Boolean(s.concentration),
    ritual: Boolean(s.ritual),
    attack: "none",
    save:
      dc?.dc_type?.index && ABILITY_FULL[dc.dc_type.index]
        ? { ability: ABILITY_FULL[dc.dc_type.index]!, effect: "half" }
        : undefined,
    damage_type: dmg?.damage_type?.index,
    description: Array.isArray(s.desc) ? (s.desc as string[]).join(" ") : undefined,
  };
}

function mapEquipment(e: Record<string, unknown>): SrdEquipment | null {
  const id = (e.index ?? e.id) as string | undefined;
  const name = e.name as string | undefined;
  if (!id || !name) return null;
  const dmg = e.damage as { damage_dice?: string; damage_type?: { index?: string } } | undefined;
  const range = e.range as { normal?: number } | undefined;
  return {
    id,
    name,
    category: (e.equipment_category as { index?: string })?.index ?? "gear",
    weight: intFrom(e.weight, 0),
    damage: dmg?.damage_dice,
    damage_type: dmg?.damage_type?.index,
    properties: idxList(e.properties),
    ac: (e.armor_class as { base?: number })?.base,
    range_ft: range?.normal,
  };
}

function mapRace(r: Record<string, unknown>): SrdRace | null {
  const id = (r.index ?? r.id) as string | undefined;
  const name = r.name as string | undefined;
  if (!id || !name) return null;
  return {
    id,
    name,
    speed: intFrom(r.speed, 30),
    size: typeof r.size === "string" ? r.size : undefined,
    ability_bonuses: abilityBonuses(r.ability_bonuses),
    languages: idxList(r.languages),
    traits: idxList(r.traits),
    subraces: idxList(r.subraces),
  };
}

function mapSubrace(r: Record<string, unknown>): SrdSubrace | null {
  const id = (r.index ?? r.id) as string | undefined;
  const name = r.name as string | undefined;
  if (!id || !name) return null;
  return {
    id,
    name,
    race: refIndex(r.race),
    ability_bonuses: abilityBonuses(r.ability_bonuses),
    traits: idxList(r.racial_traits),
    description: descText(r.desc),
  };
}

function mapClass(c: Record<string, unknown>): SrdClass | null {
  const id = (c.index ?? c.id) as string | undefined;
  const name = c.name as string | undefined;
  if (!id || !name) return null;
  const spellAbility = refIndex((c.spellcasting as { spellcasting_ability?: unknown })?.spellcasting_ability);
  return {
    id,
    name,
    hit_die: intFrom(c.hit_die, 8),
    saving_throws: abilityList(c.saving_throws),
    proficiencies: idxList(c.proficiencies),
    spellcasting_ability: spellAbility ? ABILITY_FULL[spellAbility] : undefined,
    subclasses: idxList(c.subclasses),
  };
}

function mapSubclass(c: Record<string, unknown>): SrdSubclass | null {
  const id = (c.index ?? c.id) as string | undefined;
  const name = c.name as string | undefined;
  if (!id || !name) return null;
  return {
    id,
    name,
    class: refIndex(c.class),
    flavor: typeof c.subclass_flavor === "string" ? c.subclass_flavor : undefined,
    description: descText(c.desc),
  };
}

function mapFeature(f: Record<string, unknown>): SrdFeature | null {
  const id = (f.index ?? f.id) as string | undefined;
  const name = f.name as string | undefined;
  if (!id || !name) return null;
  return {
    id,
    name,
    level: f.level !== undefined ? intFrom(f.level) : undefined,
    class: refIndex(f.class),
    subclass: refIndex(f.subclass),
    description: descText(f.desc),
  };
}

function mapTrait(t: Record<string, unknown>): SrdTrait | null {
  const id = (t.index ?? t.id) as string | undefined;
  const name = t.name as string | undefined;
  if (!id || !name) return null;
  return {
    id,
    name,
    races: idxList(t.races),
    subraces: idxList(t.subraces),
    description: descText(t.desc),
  };
}

function mapFeat(f: Record<string, unknown>): SrdFeat | null {
  const id = (f.index ?? f.id) as string | undefined;
  const name = f.name as string | undefined;
  if (!id || !name) return null;
  const prerequisites = Array.isArray(f.prerequisites)
    ? (f.prerequisites as Record<string, unknown>[])
        .map((p) => {
          const ability = refIndex(p.ability_score);
          const min = p.minimum_score;
          if (ability && min !== undefined) return `${ability} ${intFrom(min)}`;
          return undefined;
        })
        .filter((x): x is string => typeof x === "string")
    : [];
  return { id, name, prerequisites, description: descText(f.desc) };
}

function mapMagicItem(m: Record<string, unknown>): SrdMagicItem | null {
  const id = (m.index ?? m.id) as string | undefined;
  const name = m.name as string | undefined;
  if (!id || !name) return null;
  const rarity = (m.rarity as { name?: string })?.name;
  return {
    id,
    name,
    category: refIndex(m.equipment_category),
    rarity: typeof rarity === "string" ? rarity : undefined,
    description: descText(m.desc),
  };
}

function mapProficiency(p: Record<string, unknown>): SrdProficiency | null {
  const id = (p.index ?? p.id) as string | undefined;
  const name = p.name as string | undefined;
  if (!id || !name) return null;
  return {
    id,
    name,
    type: typeof p.type === "string" ? p.type : undefined,
    classes: idxList(p.classes),
    races: idxList(p.races),
  };
}

function mapLanguage(l: Record<string, unknown>): SrdLanguage | null {
  const id = (l.index ?? l.id) as string | undefined;
  const name = l.name as string | undefined;
  if (!id || !name) return null;
  return {
    id,
    name,
    type: typeof l.type === "string" ? l.type : undefined,
    typical_speakers: Array.isArray(l.typical_speakers)
      ? (l.typical_speakers as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    script: typeof l.script === "string" ? l.script : undefined,
  };
}

/**
 * Specific filename matchers. The dataset names files `5e-SRD-<Category>.json`;
 * we anchor on the exact category so lookalikes don't leak in — e.g. `Spells`
 * must not catch `Spellcasting`, `Equipment` not `Equipment-Categories`,
 * `Feats` not `Features`, `Races` not `Subraces` (the `5e-SRD-` prefix is
 * optional and matching is case-insensitive).
 */
const FILE_MATCH = {
  monsters: /^(5e-srd-)?monsters\.json$/i,
  spells: /^(5e-srd-)?spells\.json$/i,
  equipment: /^(5e-srd-)?equipment\.json$/i,
  races: /^(5e-srd-)?races\.json$/i,
  subraces: /^(5e-srd-)?subraces\.json$/i,
  classes: /^(5e-srd-)?classes\.json$/i,
  subclasses: /^(5e-srd-)?subclasses\.json$/i,
  features: /^(5e-srd-)?features\.json$/i,
  traits: /^(5e-srd-)?traits\.json$/i,
  feats: /^(5e-srd-)?feats\.json$/i,
  magicItems: /^(5e-srd-)?magic-items\.json$/i,
  proficiencies: /^(5e-srd-)?proficiencies\.json$/i,
  languages: /^(5e-srd-)?languages\.json$/i,
} as const;

async function findJson(dir: string, match: RegExp): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.endsWith(".json") && match.test(e.name)) out.push(full);
    }
  }
  await walk(dir);
  return out;
}

async function readArray(file: string): Promise<Record<string, unknown>[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.results)) return parsed.results;
  } catch {
    /* ignore malformed file */
  }
  return [];
}

/** Load every record matching `match`, map it, and index the result by id. */
async function loadInto<T extends { id: string }>(
  dir: string,
  match: RegExp,
  map: (rec: Record<string, unknown>) => T | null,
  target: Record<string, T>,
): Promise<void> {
  for (const f of await findJson(dir, match)) {
    for (const rec of await readArray(f)) {
      const mapped = map(rec);
      if (mapped) target[mapped.id] = mapped;
    }
  }
}

/**
 * Load a mounted SRD dataset (5e-bits/5e-database layout) into override maps the
 * engine's SrdIndex can merge. Tolerant: unknown/malformed entries are skipped
 * and missing files are fine, so a partial (even 3-file) dataset still works.
 * Returns empty maps if no dataset is present.
 */
export async function loadSrdDataset(dir: string): Promise<SrdOverrides> {
  const out = emptyOverrides();
  try {
    await fs.access(dir);
  } catch {
    return out;
  }
  await loadInto(dir, FILE_MATCH.monsters, mapMonster, out.monsters);
  await loadInto(dir, FILE_MATCH.spells, mapSpell, out.spells);
  await loadInto(dir, FILE_MATCH.equipment, mapEquipment, out.equipment);
  await loadInto(dir, FILE_MATCH.races, mapRace, out.races);
  await loadInto(dir, FILE_MATCH.subraces, mapSubrace, out.subraces);
  await loadInto(dir, FILE_MATCH.classes, mapClass, out.classes);
  await loadInto(dir, FILE_MATCH.subclasses, mapSubclass, out.subclasses);
  await loadInto(dir, FILE_MATCH.features, mapFeature, out.features);
  await loadInto(dir, FILE_MATCH.traits, mapTrait, out.traits);
  await loadInto(dir, FILE_MATCH.feats, mapFeat, out.feats);
  await loadInto(dir, FILE_MATCH.magicItems, mapMagicItem, out.magicItems);
  await loadInto(dir, FILE_MATCH.proficiencies, mapProficiency, out.proficiencies);
  await loadInto(dir, FILE_MATCH.languages, mapLanguage, out.languages);
  return out;
}
