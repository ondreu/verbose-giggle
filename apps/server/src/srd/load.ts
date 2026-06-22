import { promises as fs } from "node:fs";
import path from "node:path";
import type { SrdEquipment, SrdMonster, SrdSpell } from "@adm/srd";

export interface SrdOverrides {
  monsters: Record<string, SrdMonster>;
  spells: Record<string, SrdSpell>;
  equipment: Record<string, SrdEquipment>;
}

const ABILITY_FULL: Record<string, "str" | "dex" | "con" | "int" | "wis" | "cha"> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
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

/**
 * Load a mounted SRD dataset (5e-bits/5e-database layout) into override maps the
 * engine's SrdIndex can merge. Tolerant: unknown/malformed entries are skipped,
 * so a partial dataset still works. Returns empty maps if no dataset is present.
 */
export async function loadSrdDataset(dir: string): Promise<SrdOverrides> {
  const out: SrdOverrides = { monsters: {}, spells: {}, equipment: {} };
  try {
    await fs.access(dir);
  } catch {
    return out;
  }
  for (const f of await findJson(dir, /monster/i)) {
    for (const m of await readArray(f)) {
      const mapped = mapMonster(m);
      if (mapped) out.monsters[mapped.id] = mapped;
    }
  }
  for (const f of await findJson(dir, /spell/i)) {
    for (const s of await readArray(f)) {
      const mapped = mapSpell(s);
      if (mapped) out.spells[mapped.id] = mapped;
    }
  }
  for (const f of await findJson(dir, /equipment/i)) {
    for (const e of await readArray(f)) {
      const mapped = mapEquipment(e);
      if (mapped) out.equipment[mapped.id] = mapped;
    }
  }
  return out;
}
