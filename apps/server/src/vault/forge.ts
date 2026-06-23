import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { Llm } from "../llm/client.js";
import { ensureCampaignDir, slugify } from "./scaffold.js";

/**
 * AI-assisted campaign builder ("Postavit si vlastní kampaň"). Runs in 6 phases,
 * each building on the previous to maintain a world bible — NPC locations resolve
 * to real locations, quest objectives point at real NPCs, encounter monsters are
 * defined in the bestiary. Falls back to a deterministic template per-phase if
 * the LLM is unavailable or returns unparseable JSON.
 */

export interface ForgeInput {
  name: string;
  premise?: string;
  length?: "short" | "medium" | "long";
  detail?: "sparse" | "normal" | "rich";
}

/** Called after each generation phase so callers can stream progress. */
export type ProgressCallback = (phase: string, msg: string) => void;

const LEN_TO_COUNT: Record<string, number> = { short: 3, medium: 5, long: 8 };

// ---------------------------------------------------------------------------
// World Bible — the internal consistency backbone (#46d)
// ---------------------------------------------------------------------------

interface LocSpec {
  id: string;
  name: string;
  kind: "city" | "town" | "village" | "landmark" | "dungeon" | "region";
  description: string;
  faction?: string;
}

interface NpcSpec {
  id: string;
  name: string;
  role: string;
  location: string;
  faction?: string;
  personality?: string;
  secrets?: string;
}

interface MonsterSpec {
  id: string;
  name: string;
  srd_ref?: string;
  hp: number;
  ac: number;
  ai_profile: string;
}

interface QuestSpec {
  title: string;
  hook_npc?: string;
  summary: string;
  objectives: string[];
  foreshadowing: string[];
  climax_location?: string;
}

interface EncounterSpec {
  id: string;
  name: string;
  location: string;
  setup: string;
  monster_refs: { ref: string; count: number }[];
}

interface WorldBible {
  name: string;
  premise: string;
  pitch: string;
  tone: string;
  factions: { name: string; role: string }[];
  locations: LocSpec[];
  npcs: NpcSpec[];
  monsters: MonsterSpec[];
  quest: QuestSpec;
  encounters: EncounterSpec[];
  opening: string;
}

// ---------------------------------------------------------------------------
// JSON extraction helper
// ---------------------------------------------------------------------------

function jsonFromContent(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1]! : content;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object found");
  return JSON.parse(raw.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Phase schemas
// ---------------------------------------------------------------------------

const P1Schema = z.object({
  pitch: z.string().default(""),
  tone: z.string().default("temná fantasy"),
  factions: z
    .array(z.object({ name: z.string(), role: z.string().default("") }))
    .default([]),
});

const P2Schema = z.object({
  locations: z
    .array(
      z.object({
        name: z.string(),
        kind: z
          .enum(["city", "town", "village", "landmark", "dungeon", "region"])
          .default("landmark"),
        description: z.string().default(""),
        faction: z.string().optional(),
      }),
    )
    .default([]),
});

const P3Schema = z.object({
  npcs: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().default(""),
        location: z.string().default(""),
        faction: z.string().optional(),
        personality: z.string().optional(),
        secrets: z.string().optional(),
      }),
    )
    .default([]),
  monsters: z
    .array(
      z.object({
        name: z.string(),
        srd_ref: z.string().optional(),
        hp: z.number().int().positive().default(10),
        ac: z.number().int().positive().default(13),
        ai_profile: z.string().default("Útočí na nejbližšího nepřítele."),
      }),
    )
    .default([]),
});

const P4Schema = z.object({
  title: z.string().default("Hlavní úkol"),
  hook_npc: z.string().optional(),
  summary: z.string().default(""),
  objectives: z.array(z.string()).default([]),
  foreshadowing: z.array(z.string()).default([]),
  climax_location: z.string().optional(),
});

const P5Schema = z.object({
  encounters: z
    .array(
      z.object({
        name: z.string(),
        location: z.string().default(""),
        setup: z.string().default(""),
        monster_refs: z
          .array(z.object({ ref: z.string(), count: z.number().int().positive().default(1) }))
          .default([]),
      }),
    )
    .default([]),
});

// ---------------------------------------------------------------------------
// Phase generators — each uses the world bible built so far
// ---------------------------------------------------------------------------

async function phase1(llm: Llm, input: ForgeInput): Promise<z.infer<typeof P1Schema>> {
  const sys =
    "Jsi designér dobrodružství pro D&D 5e. Vrať POUZE JSON (žádný text okolo) podle schématu: " +
    "{ pitch: string, tone: string, factions: [{name, role}] }. " +
    "pitch = 2 věty o světě a konfliktu. tone = 2-3 slova (např. 'temná gotická záhada'). " +
    "factions = 2-3 frakce s názvem a rolí. Vše česky.";
  const user =
    `Kampaň: „${input.name}". Námět: ${input.premise || "žádný — vymysli originální"}.` +
    " Vygeneruj základ světa.";
  const resp = await llm.chat(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    [],
  );
  if (!resp.content) throw new Error("empty response");
  return P1Schema.parse(jsonFromContent(resp.content));
}

async function phase2(
  llm: Llm,
  bible: WorldBible,
  count: number,
): Promise<z.infer<typeof P2Schema>> {
  const factionList = bible.factions.map((f) => `${f.name} (${f.role})`).join(", ");
  const sys =
    "Vrať POUZE JSON: { locations: [{name, kind, description, faction}] }. " +
    "kind: city|town|village|landmark|dungeon|region. " +
    "description = 2-4 věty atmosferické prózy. Vše česky.";
  const user =
    `Svět: „${bible.pitch}". Tón: ${bible.tone}. Frakce: ${factionList}. ` +
    `Vygeneruj přesně ${count} lokací. První = hub (vesnice nebo město) s discovered: true. ` +
    "Každá lokace odkazuje na frakci, která ji ovládá nebo má zájem.";
  const resp = await llm.chat(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    [],
  );
  if (!resp.content) throw new Error("empty response");
  return P2Schema.parse(jsonFromContent(resp.content));
}

async function phase3(llm: Llm, bible: WorldBible): Promise<z.infer<typeof P3Schema>> {
  const locList = bible.locations.map((l) => `${l.name} [${l.id}]`).join(", ");
  const npcCount = Math.max(2, Math.round(bible.locations.length / 2));
  const sys =
    "Vrať POUZE JSON: { npcs: [{name, role, location, faction, personality, secrets}], " +
    "monsters: [{name, srd_ref?, hp, ac, ai_profile}] }. Vše česky.";
  const user =
    `Svět: „${bible.pitch}". Lokace: ${locList}. ` +
    `Vygeneruj ${npcCount} NPC a 2-3 typy nepřátel. ` +
    "Každý NPC musí mít location = přesný název jedné z lokací výše. " +
    "Pro běžné příšery (goblin, skeleton, zombie, bandit, wolf, orc, troll) nastav srd_ref.";
  const resp = await llm.chat(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    [],
  );
  if (!resp.content) throw new Error("empty response");
  return P3Schema.parse(jsonFromContent(resp.content));
}

async function phase4(llm: Llm, bible: WorldBible): Promise<z.infer<typeof P4Schema>> {
  const npcList = bible.npcs.map((n) => `${n.name} — ${n.role} (${n.location})`).join("; ");
  const locList = bible.locations.map((l) => l.name).join(", ");
  const sys =
    "Vrať POUZE JSON: { title, hook_npc, summary, objectives: string[], foreshadowing: string[], climax_location }. " +
    "Vše česky.";
  const user =
    `Svět: „${bible.pitch}". NPC: ${npcList}. Lokace: ${locList}. ` +
    "Vygeneruj hlavní úkol se 3 cíli odkazujícími na konkrétní NPC nebo lokace ze seznamu. " +
    "hook_npc = jméno NPC v hub lokaci, který úkol zadá. " +
    "foreshadowing = 2 konkrétní náznaky, které se odhalí v klimaxu. " +
    "climax_location = název nebezpečné lokace (dungeon/landmark) pro finální konfrontaci.";
  const resp = await llm.chat(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    [],
  );
  if (!resp.content) throw new Error("empty response");
  return P4Schema.parse(jsonFromContent(resp.content));
}

async function phase5(llm: Llm, bible: WorldBible): Promise<z.infer<typeof P5Schema>> {
  const locList = bible.locations.map((l) => l.name).join(", ");
  const monsterList = bible.monsters.map((m) => m.name).join(", ");
  const sys =
    "Vrať POUZE JSON: { encounters: [{name, location, setup, monster_refs: [{ref, count}]}] }. " +
    "Česky.";
  const user =
    `Kampaň: „${bible.pitch}". Klimax: ${bible.quest.climax_location ?? ""}. ` +
    `Lokace: ${locList}. Nepřátelé: ${monsterList}. ` +
    "Vygeneruj 2-3 taktická střetnutí na konkrétních lokacích ze seznamu. " +
    "ref = přesný název nepřítele ze seznamu. Jedno střetnutí = klimaxové.";
  const resp = await llm.chat(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    [],
  );
  if (!resp.content) throw new Error("empty response");
  return P5Schema.parse(jsonFromContent(resp.content));
}

async function phase6(llm: Llm, bible: WorldBible): Promise<string> {
  const hookNpc = bible.npcs.find(
    (n) => bible.quest.hook_npc && n.name.includes(bible.quest.hook_npc),
  );
  const startLoc = bible.locations[0]?.name ?? "výchozím místě";
  const foreshadowing = bible.quest.foreshadowing.slice(0, 2).join("; ");
  const sys =
    "Jsi mistr vypravěč D&D 5e. Piš česky, atmosfericky. Bez emoji. Vrať POUZE prózu, žádný JSON.";
  const user =
    `Svět: ${bible.pitch}. Tón: ${bible.tone}. ` +
    `Výchozí lokace: ${startLoc}. ` +
    `Hook NPC: ${hookNpc ? `${hookNpc.name} — ${hookNpc.role}` : (bible.quest.hook_npc ?? "místní informátor")}. ` +
    `První cíl: ${bible.quest.objectives[0] ?? ""}. ` +
    `Foreshadowing k zasadit: ${foreshadowing}. ` +
    "Napiš úvodní scénu (3 odstavce): (1) zasadit do světa, (2) představit hook NPC s urgentní situací, " +
    "(3) první volba pro hráče. Zmiň alespoň jeden foreshadowing prvek přirozeně.";
  const resp = await llm.chat(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    [],
  );
  return resp.content ?? "";
}

// ---------------------------------------------------------------------------
// Template fallbacks (phase-level granularity for resilience)
// ---------------------------------------------------------------------------

function templatePhase1(input: ForgeInput): z.infer<typeof P1Schema> {
  const theme = input.premise?.trim() || "tajemství skryté v kraji";
  return {
    pitch: `Kampaň o tématu ${theme}. Zlo se probouzí ve stínu, zatímco místní mlčí ze strachu.`,
    tone: "temná fantasy s gothickým nádechem",
    factions: [
      { name: "Rada starších", role: "místní vládní orgán — neutrální, ustaraný" },
      { name: "Temní kultisté", role: "skrytí antagonisté za vším zlým" },
      { name: "Poutníci", role: "spojenci a nositelé zpráv" },
    ],
  };
}

function templateLocations(input: ForgeInput, count: number): LocSpec[] {
  const pool: LocSpec[] = [
    {
      id: "krizovatkova-osada",
      name: "Křižovatková osada",
      kind: "village",
      description:
        "Ospalá víska na rozcestí starých cest. Místní se v hospodě bavili naposledy před měsícem — od té doby jen šeptají.",
      faction: "Rada starších",
    },
    {
      id: "septajici-les",
      name: "Šeptající les",
      kind: "landmark",
      description:
        "Hvozd, jehož stromy si pamatují víc, než by měly. Za soumraku se z korun line tichý hluk, který není vítr.",
      faction: "Poutníci",
    },
    {
      id: "zricenina-vraniho-hradu",
      name: "Zřícenina Vraního hradu",
      kind: "dungeon",
      description:
        "Pobořené věže starého hradu. Pod nimi se táhnou katakombami chodby, jejichž konec nikdo neviděl.",
      faction: "Temní kultisté",
    },
    {
      id: "ricni-brod",
      name: "Říční brod",
      kind: "landmark",
      description:
        "Mělčina, kde se kdysi uzavíraly smlouvy. Výběrčí mýtného zmizel před třemi dny — říkají, že jen přes noc.",
      faction: "Rada starších",
    },
    {
      id: "hornicke-mestecko-rud",
      name: "Hornické městečko Rud",
      kind: "town",
      description: "Kouř, krumpáče a tajnůstkářští havíři. Hluboko v šachtách něco klepalo.",
      faction: "Poutníci",
    },
    {
      id: "mlzne-blato",
      name: "Mlžné blato",
      kind: "region",
      description: "Bažina, kde se ztrácí cesta i rozum. Bludičky jsou jen začátek.",
      faction: "Temní kultisté",
    },
    {
      id: "klaster-na-vysine",
      name: "Klášter na Výšině",
      kind: "landmark",
      description: "Mniši mlčí, zvony však promlouvají každou půlnoc — přesně třikrát.",
      faction: "Poutníci",
    },
    {
      id: "podzemni-trziste",
      name: "Podzemní tržiště",
      kind: "dungeon",
      description: "Kde se obchoduje se vším, co nesnese světlo. Vstup stojí tajemství.",
      faction: "Temní kultisté",
    },
  ];
  return pool.slice(0, Math.min(count, pool.length)).map((l, i) => ({
    ...l,
    id: `${input.name ? slugify(input.name.split(" ")[0] ?? "loc") + "-" : ""}${l.id}`.slice(0, 30),
  }));
}

function templatePhase3(): z.infer<typeof P3Schema> {
  return {
    npcs: [
      {
        name: "Stará Vesna",
        role: "vědma a rádkyně družiny",
        location: "Křižovatková osada",
        personality: "Moudrá, přímočará, skrývá strach",
        secrets: "Ví, kdo stojí za kultisty, ale bojí se jejich pomsty",
      },
      {
        name: "Rychtář Bořek",
        role: "ustaraný správce osady",
        location: "Křižovatková osada",
        personality: "Pragmatický, váhavý, miluje pořádek",
        secrets: "Přijímal peníze od kultistů za mlčení",
      },
      {
        name: "Zahalený poutník",
        role: "nositel záhady",
        location: "Šeptající les",
        personality: "Záhadný, mluví v narážkách",
        secrets: "Je posledním přeživším předchozí dobrodružné skupiny",
      },
    ],
    monsters: [
      { name: "Goblin", srd_ref: "goblin", hp: 7, ac: 15, ai_profile: "Zbabělý, útočí ve skupině na nejslabšího. Prchá pod 25% HP." },
      { name: "Zombie", srd_ref: "zombie", hp: 22, ac: 8, ai_profile: "Pomalá, neúnavná. Vždy jde za nejbližší živou bytostí." },
      { name: "Temný kultista", srd_ref: "cultist", hp: 9, ac: 12, ai_profile: "Fanatiký, boji za víru. Pokouší se přivolat posilu." },
    ],
  };
}

function templatePhase4(npcs: NpcSpec[], locs: LocSpec[]): z.infer<typeof P4Schema> {
  const hookNpc = npcs[0]?.name ?? "Stará Vesna";
  const climaxLoc = locs.find((l) => l.kind === "dungeon")?.name ?? locs[locs.length - 1]?.name;
  return {
    title: "Stín nad krajem",
    hook_npc: hookNpc,
    summary: "Odhalit původ temného vlivu, který sužuje kraj, a zničit ho v jeho vlastním doupěti.",
    objectives: [
      `Vyslechnout ${hookNpc} a zjistit, co se v kraji děje`,
      `Najít stopy kultistů v ${locs[1]?.name ?? "lese"}`,
      `Konfrontovat zlo v ${climaxLoc ?? "jeho doupěti"}`,
    ],
    foreshadowing: [
      "Staré runy vyřezané do stromů v lese — nikdo si nepamatuje, kdo je udělal",
      "Výběrčí mýtného zmizel beze stopy — jeho kůň se vrátil sám, bez sedla",
    ],
    climax_location: climaxLoc,
  };
}

function templatePhase5(locs: LocSpec[], monsters: MonsterSpec[]): z.infer<typeof P5Schema> {
  const monsterRef = monsters[0]?.name ?? "Goblin";
  const encounter2Ref = monsters[1]?.name ?? "Zombie";
  return {
    encounters: [
      {
        name: "Přepadení na cestě",
        location: locs[1]?.name ?? "",
        setup: "Nepřátelé číhají za stromy. Zaútočí ze zálohy při přechodu cesty.",
        monster_refs: [{ ref: monsterRef, count: 3 }],
      },
      {
        name: "Finální střet",
        location: locs.find((l) => l.kind === "dungeon")?.name ?? locs[locs.length - 1]?.name ?? "",
        setup: "Hlavní sál. Příšery brání rituální kruh. Přerušit rituál = okamžitá agrese.",
        monster_refs: [
          { ref: encounter2Ref, count: 2 },
          { ref: monsterRef, count: 2 },
        ],
      },
    ],
  };
}

function templateOpening(input: ForgeInput, bible: WorldBible): string {
  const theme = input.premise?.trim() || "tajemství";
  const startLoc = bible.locations[0]?.name ?? "osadě";
  const hookNpc = bible.npcs[0]?.name ?? "místní";
  const fore = bible.quest.foreshadowing[0] ?? "napětí ve vzduchu";
  return (
    `Cesty vás přivedly do ${startLoc} za soumraku. ${theme[0]!.toUpperCase()}${theme.slice(1)} visí ` +
    `ve vzduchu spolu s vůní blížící se bouře. Místní se drží dál od oken.\n\n` +
    `${hookNpc} vás zastaví u vchodu do hospody. Tvář má vážnou a hlas napjatý: ` +
    `„Jsem ráda, že jste přišli. Věci se tu mají špatně a já nevím, komu jinak věřit."\n\n` +
    `Za jejími zády blikají svíčky. ${fore}. Co uděláte jako první?`
  );
}

// ---------------------------------------------------------------------------
// Coord helpers + file writers
// ---------------------------------------------------------------------------

function coordsFor(i: number, n: number): { x: number; y: number } {
  if (i === 0 || n === 1) return { x: 0.5, y: 0.5 };
  const angle = (2 * Math.PI * (i - 1)) / Math.max(1, n - 1);
  const r = 0.3;
  return {
    x: Math.min(0.95, Math.max(0.05, 0.5 + r * Math.cos(angle))),
    y: Math.min(0.95, Math.max(0.05, 0.5 + r * Math.sin(angle))),
  };
}

function noteFile(dir: string, sub: string, id: string): string {
  return path.join(dir, sub, `${id}.md`);
}

async function writeNoteRaw(
  file: string,
  frontmatter: Record<string, unknown>,
  body: string,
): Promise<void> {
  const fm = YAML.stringify(frontmatter).trim();
  await fs.writeFile(file, `---\n${fm}\n---\n\n${body}\n`, "utf8");
}

// ---------------------------------------------------------------------------
// Vault writer
// ---------------------------------------------------------------------------

async function writeBibleToVault(dir: string, bible: WorldBible): Promise<void> {
  // Locations
  for (let i = 0; i < bible.locations.length; i++) {
    const l = bible.locations[i]!;
    const connections = new Set<string>();
    if (i !== 0) connections.add(bible.locations[0]!.id);
    if (bible.locations[i + 1]) connections.add(bible.locations[i + 1]!.id);
    const fore = bible.quest.foreshadowing[i] ?? null;
    await writeNoteRaw(
      noteFile(dir, "locations", l.id),
      {
        type: "location",
        id: l.id,
        name: l.name,
        kind: l.kind,
        parent: null,
        coords: coordsFor(i, bible.locations.length),
        connections: [...connections].map((to) => ({ to, travel: { days: 1 } })),
        discovered: i === 0,
      },
      `# ${l.name}\n\n${l.description || "Místo čeká na svůj příběh."}` +
        (fore ? `\n\n*${fore}*` : ""),
    );
  }

  // Bestiary (monsters)
  for (const m of bible.monsters) {
    await writeNoteRaw(
      noteFile(dir, "bestiary", m.id),
      {
        type: "monster",
        id: m.id,
        name: m.name,
        controller: "ai",
        faction: "hostile",
        level: 1,
        xp: 0,
        abilities: { str: 10, dex: 12, con: 10, int: 8, wis: 8, cha: 8 },
        proficiency_bonus: 2,
        hp: { max: m.hp, current: m.hp, temp: 0 },
        ac: m.ac,
        speed: 30,
        hit_dice: { type: "d8", total: 1, remaining: 1 },
        spell_slots: {},
        spells_known: [],
        conditions: [],
        concentration: null,
        inventory: [],
        attunement: [],
        death_saves: { success: 0, fail: 0 },
        dead: false,
        position: null,
        srd_ref: m.srd_ref ?? null,
        ai_profile: m.ai_profile,
      },
      `# ${m.name}\n\n${m.ai_profile}`,
    );
  }

  // NPC lore notes
  for (const npc of bible.npcs) {
    await writeNoteRaw(
      noteFile(dir, "lore", `npc-${npc.id}`),
      { id: `npc-${npc.id}`, name: npc.name, type: "npc", location: npc.location, faction: npc.faction },
      `# ${npc.name}\n\n${npc.role}${npc.location ? ` — ${npc.location}` : ""}.` +
        (npc.personality ? `\n\n${npc.personality}.` : "") +
        (npc.secrets ? `\n\n**Tajemství:** ${npc.secrets}` : ""),
    );
  }

  // Quest
  await writeNoteRaw(
    noteFile(dir, "lore", "hlavni-ukol"),
    { id: "hlavni-ukol", name: bible.quest.title, type: "quest", giver: bible.quest.hook_npc },
    `# ${bible.quest.title}\n\n${bible.quest.summary}\n\n` +
      bible.quest.objectives.map((o) => `- [ ] ${o}`).join("\n") +
      (bible.quest.foreshadowing.length > 0
        ? `\n\n## Foreshadowing\n\n${bible.quest.foreshadowing.map((f) => `- ${f}`).join("\n")}`
        : ""),
  );

  // Encounters
  const spawnSlots = [
    { x: 10, y: 4 },
    { x: 11, y: 5 },
    { x: 12, y: 4 },
    { x: 9, y: 6 },
    { x: 12, y: 6 },
    { x: 13, y: 5 },
  ];
  for (const enc of bible.encounters) {
    const encLoc = bible.locations.find(
      (l) => l.name === enc.location || enc.location.includes(l.name) || l.name.includes(enc.location),
    );
    const spawns = enc.monster_refs.flatMap((r, ri) => {
      const monster = bible.monsters.find(
        (m) =>
          m.name.toLowerCase().includes(r.ref.toLowerCase()) ||
          r.ref.toLowerCase().includes(m.name.toLowerCase()),
      ) ?? bible.monsters[0];
      if (!monster) return [];
      return Array.from({ length: Math.min(r.count, 3) }, (_, ci) => ({
        ref: monster.id,
        faction: "hostile",
        at: spawnSlots[(ri * 3 + ci) % spawnSlots.length],
      }));
    });
    await writeNoteRaw(
      noteFile(dir, "encounters", enc.id),
      {
        type: "encounter",
        id: enc.id,
        name: enc.name,
        location: encLoc?.id ?? null,
        grid: { w: 16, h: 12, cell_ft: 5 },
        terrain: [],
        spawns,
        party_start: [
          { x: 3, y: 9 },
          { x: 2, y: 8 },
          { x: 4, y: 8 },
        ],
      },
      `# ${enc.name}\n\n${enc.setup}`,
    );
  }

  // Opening scene
  if (bible.opening.trim()) {
    await writeNoteRaw(
      noteFile(dir, "lore", "uvod"),
      { id: "uvod", name: "Úvodní scéna", type: "intro" },
      `# Úvodní scéna\n\n${bible.opening}`,
    );
  }

  // Campaign config
  const config = {
    name: bible.name,
    ruleset: "dnd5e-srd",
    starting_location: bible.locations[0]?.id ?? "start",
    party: [] as string[],
    companions: [] as string[],
    language: "cs",
    tts: { enabled: true },
    llm: {},
    variant_rules: { flanking: false, diagonals: "5-5-5" },
  };
  await fs.writeFile(path.join(dir, "campaign.yaml"), YAML.stringify(config), "utf8");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build a campaign from a player brief and write it to the vault. Runs in 6
 * LLM phases (world foundation → locations → NPCs → quest → encounters →
 * opening) with a growing world bible so every phase can reference content from
 * previous ones. Per-phase fallbacks keep it working offline.
 */
export async function forgeCampaign(
  vaultPath: string,
  llm: Llm,
  input: ForgeInput,
  onProgress?: ProgressCallback,
): Promise<{ folder: string; usedLlm: boolean }> {
  const name = input.name?.trim();
  if (!name) throw new Error("Campaign name is required");
  const count = LEN_TO_COUNT[input.length ?? "medium"] ?? 5;

  const notify = (phase: string, msg: string) => onProgress?.(phase, msg);
  let usedLlm = false;

  const bible: WorldBible = {
    name,
    premise: input.premise ?? "",
    pitch: "",
    tone: "temná fantasy",
    factions: [],
    locations: [],
    npcs: [],
    monsters: [],
    quest: { title: "", summary: "", objectives: [], foreshadowing: [] },
    encounters: [],
    opening: "",
  };

  // Phase 1: World foundation
  notify("Základ světa", "Generuji premisu, tón a frakce…");
  try {
    const p1 = await phase1(llm, input);
    bible.pitch = p1.pitch;
    bible.tone = p1.tone;
    bible.factions = p1.factions;
    usedLlm = true;
  } catch {
    const fb = templatePhase1(input);
    bible.pitch = fb.pitch;
    bible.tone = fb.tone;
    bible.factions = fb.factions;
  }

  // Phase 2: Locations
  notify("Lokace", `Generuji ${count} lokací…`);
  try {
    const p2 = await phase2(llm, bible, count);
    const seen = new Set<string>();
    bible.locations = p2.locations.map((l, i) => {
      let id = slugify(l.name) || `lokace-${i + 1}`;
      while (seen.has(id)) id = `${id}-${i}`;
      seen.add(id);
      return { ...l, id };
    });
    if (bible.locations.length > 0) usedLlm = true;
  } catch {
    bible.locations = templateLocations(input, count);
  }

  // Phase 3: NPCs and monsters
  notify("Postavy", "Generuji NPC a nepřátele…");
  try {
    const p3 = await phase3(llm, bible);
    const seenNpc = new Set<string>();
    bible.npcs = p3.npcs.map((n, i) => {
      let id = slugify(n.name) || `npc-${i + 1}`;
      while (seenNpc.has(id)) id = `${id}-${i}`;
      seenNpc.add(id);
      return { ...n, id };
    });
    const seenMon = new Set<string>();
    bible.monsters = p3.monsters.map((m, i) => {
      let id = slugify(m.name) || `monster-${i + 1}`;
      while (seenMon.has(id)) id = `${id}-${i}`;
      seenMon.add(id);
      return { ...m, id };
    });
    if (bible.npcs.length > 0) usedLlm = true;
  } catch {
    const fb = templatePhase3();
    bible.npcs = fb.npcs.map((n, i) => ({ ...n, id: slugify(n.name) || `npc-${i + 1}` }));
    bible.monsters = fb.monsters.map((m, i) => ({
      ...m,
      id: slugify(m.name) || `monster-${i + 1}`,
    }));
  }

  // Phase 4: Quest arc
  notify("Úkol", "Generuji quest arc s foreshadowingem…");
  try {
    const p4 = await phase4(llm, bible);
    bible.quest = {
      title: p4.title,
      hook_npc: p4.hook_npc,
      summary: p4.summary,
      objectives: p4.objectives,
      foreshadowing: p4.foreshadowing,
      climax_location: p4.climax_location,
    };
    if (bible.quest.objectives.length > 0) usedLlm = true;
  } catch {
    const fb = templatePhase4(bible.npcs, bible.locations);
    bible.quest = {
      title: fb.title,
      hook_npc: fb.hook_npc,
      summary: fb.summary,
      objectives: fb.objectives,
      foreshadowing: fb.foreshadowing,
      climax_location: fb.climax_location,
    };
  }

  // Phase 5: Encounters
  notify("Střetnutí", "Generuji taktická střetnutí…");
  try {
    const p5 = await phase5(llm, bible);
    const seenEnc = new Set<string>();
    bible.encounters = p5.encounters.map((e, i) => {
      let id = slugify(e.name) || `encounter-${i + 1}`;
      while (seenEnc.has(id)) id = `${id}-${i}`;
      seenEnc.add(id);
      return { ...e, id };
    });
    if (bible.encounters.length > 0) usedLlm = true;
  } catch {
    const fb = templatePhase5(bible.locations, bible.monsters);
    bible.encounters = fb.encounters.map((e, i) => ({
      ...e,
      id: slugify(e.name) || `encounter-${i + 1}`,
    }));
  }

  // Phase 6: Opening scene (session zero)
  notify("Úvodní scéna", "Generuji session zero…");
  try {
    const opening = await phase6(llm, bible);
    if (opening.trim()) {
      bible.opening = opening;
      usedLlm = true;
    } else {
      bible.opening = templateOpening(input, bible);
    }
  } catch {
    bible.opening = templateOpening(input, bible);
  }

  // Write vault
  notify("Zápis", "Ukládám do vaultu…");
  const folder = slugify(name);
  const dir = await ensureCampaignDir(vaultPath, folder);
  await writeBibleToVault(dir, bible);

  const locCount = bible.locations.length;
  const npcCount = bible.npcs.length;
  const encCount = bible.encounters.length;
  notify(
    "Hotovo",
    `Kampaň „${name}" připravena — ${locCount} lokací, ${npcCount} NPC, ${encCount} střetnutí.`,
  );

  return { folder, usedLlm };
}
