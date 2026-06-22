import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { Llm } from "../llm/client.js";
import { ensureCampaignDir, slugify } from "./scaffold.js";

/**
 * AI-assisted campaign builder ("Postavit si vlastní kampaň"). The player
 * supplies as much or as little as they like — a premise, a length, a detail
 * level — and the LLM drafts a small but coherent world (locations, NPCs, a
 * starting quest, an opening) that is written into a valid vault. When no LLM is
 * configured (offline mock), a deterministic template keeps the feature working.
 */

export interface ForgeInput {
  name: string;
  premise?: string;
  length?: "short" | "medium" | "long";
  detail?: "sparse" | "normal" | "rich";
}

const LEN_TO_COUNT: Record<string, number> = { short: 3, medium: 5, long: 8 };

const SpecSchema = z.object({
  pitch: z.string().default(""),
  opening: z.string().default(""),
  locations: z
    .array(
      z.object({
        name: z.string(),
        kind: z.enum(["city", "town", "village", "landmark", "dungeon", "region"]).default("landmark"),
        description: z.string().default(""),
      }),
    )
    .default([]),
  npcs: z
    .array(z.object({ name: z.string(), role: z.string().default(""), location: z.string().default("") }))
    .default([]),
  quest: z
    .object({
      title: z.string().default("Hlavní úkol"),
      summary: z.string().default(""),
      objectives: z.array(z.string()).default([]),
    })
    .default({ title: "Hlavní úkol", summary: "", objectives: [] }),
});
type Spec = z.infer<typeof SpecSchema>;

function jsonFromContent(content: string): unknown {
  // Tolerate code fences / surrounding prose: extract the outermost JSON object.
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1]! : content;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object found");
  return JSON.parse(raw.slice(start, end + 1));
}

/** Ask the LLM for a structured campaign spec; throws if it can't be parsed. */
async function generateSpec(llm: Llm, input: ForgeInput, count: number): Promise<Spec> {
  const detail = input.detail ?? "normal";
  const sys =
    "Jsi designér dobrodružství pro D&D 5e. Navrhni malou, soudržnou kampaň a vrať POUZE JSON " +
    "(žádný text okolo) podle schématu: { pitch: string, opening: string, " +
    "locations: [{ name, kind: city|town|village|landmark|dungeon|region, description }], " +
    "npcs: [{ name, role, location }], quest: { title, summary, objectives: string[] } }. " +
    "Vše česky, atmosféricky a stručně.";
  const user =
    `Vytvoř kampaň s názvem „${input.name}“. ` +
    (input.premise ? `Námět od hráče: ${input.premise}. ` : "Hráč nedal žádný námět — vymysli originální. ") +
    `Vygeneruj přesně ${count} lokací, ${Math.max(2, Math.round(count / 2))} NPC a jeden hlavní úkol s 3 cíli. ` +
    `Úroveň detailu: ${detail}.`;

  const resp = await llm.chat(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    [],
  );
  if (!resp.content) throw new Error("empty LLM response");
  return SpecSchema.parse(jsonFromContent(resp.content));
}

/** Deterministic fallback world so the builder works without an LLM. */
function templateSpec(input: ForgeInput, count: number): Spec {
  const theme = input.premise?.trim() || "tajemství skryté v kraji";
  const pool: { name: string; kind: Spec["locations"][number]["kind"]; description: string }[] = [
    { name: "Osada Křižovatka", kind: "village", description: "Ospalá víska, kde každá cesta začíná i končí." },
    { name: "Šeptající les", kind: "landmark", description: "Hvozd, jehož stromy si pamatují víc, než by měly." },
    { name: "Zřícenina Vraního hradu", kind: "dungeon", description: "Pobořené zdi, pod nimiž něco dlí." },
    { name: "Říční brod", kind: "landmark", description: "Mělčina hlídaná starým mýtem i starým výběrčím." },
    { name: "Hornické městečko Rud", kind: "town", description: "Kouř, krumpáče a tajnůstkářští havíři." },
    { name: "Mlžné blato", kind: "region", description: "Bažina, kde se ztrácí cesta i rozum." },
    { name: "Klášter na Výšině", kind: "landmark", description: "Mniši mlčí, zvony však promlouvají." },
    { name: "Podzemní tržiště", kind: "dungeon", description: "Kde se obchoduje se vším, co nesnese světlo." },
  ];
  const locations = pool.slice(0, count);
  return {
    pitch: `Kampaň o tématu: ${theme}.`,
    opening:
      `Družina se schází v osadě Křižovatka. ${theme[0]!.toUpperCase()}${theme.slice(1)} visí ve vzduchu ` +
      "jako vůně blížící se bouře. Místní mluví polohlasem a do soumraku zbývá jen pár hodin.",
    locations,
    npcs: [
      { name: "Stará Vesna", role: "vědma a rádkyně družiny", location: locations[0]?.name ?? "" },
      { name: "Rychtář Bořek", role: "ustaraný představený osady", location: locations[0]?.name ?? "" },
      { name: "Zahalený poutník", role: "nositel tajemství a zápletky", location: locations[1]?.name ?? "" },
    ],
    quest: {
      title: "Stín nad krajem",
      summary: `Odhalit a zažehnat ${theme}.`,
      objectives: ["Vyslechnout místní v Křižovatce", "Najít zdroj neklidu", "Postavit se hrozbě"],
    },
  };
}

/** Spread N points roughly around the overworld centre for location coords. */
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

async function writeNoteRaw(file: string, frontmatter: Record<string, unknown>, body: string): Promise<void> {
  const fm = YAML.stringify(frontmatter).trim();
  await fs.writeFile(file, `---\n${fm}\n---\n\n${body}\n`, "utf8");
}

/**
 * Build a campaign from a player brief and write it to the vault. Returns the
 * created folder. Uses the LLM when available, falling back to a template.
 */
export async function forgeCampaign(
  vaultPath: string,
  llm: Llm,
  input: ForgeInput,
): Promise<{ folder: string; usedLlm: boolean }> {
  const name = input.name?.trim();
  if (!name) throw new Error("Campaign name is required");
  const count = LEN_TO_COUNT[input.length ?? "medium"] ?? 5;

  let spec: Spec;
  let usedLlm = true;
  try {
    spec = await generateSpec(llm, input, count);
    if (spec.locations.length === 0) throw new Error("no locations");
  } catch {
    spec = templateSpec(input, count);
    usedLlm = false;
  }

  const folder = slugify(name);
  const dir = await ensureCampaignDir(vaultPath, folder);

  // Locations: unique ids, spread coords, chained connections (start is a hub).
  const seen = new Set<string>();
  const locs = spec.locations.map((l, i) => {
    let id = slugify(l.name) || `lokace-${i + 1}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    return { ...l, id, coords: coordsFor(i, spec.locations.length) };
  });

  for (let i = 0; i < locs.length; i++) {
    const l = locs[i]!;
    // Connect each location back to the starting hub, plus the next in a chain.
    const connections = new Set<string>();
    if (i !== 0) connections.add(locs[0]!.id);
    if (locs[i + 1]) connections.add(locs[i + 1]!.id);
    await writeNoteRaw(
      noteFile(dir, "locations", l.id),
      {
        type: "location",
        id: l.id,
        name: l.name,
        kind: l.kind,
        parent: null,
        coords: l.coords,
        connections: [...connections].map((to) => ({ to, travel: { days: 1 } })),
        discovered: i === 0,
      },
      `# ${l.name}\n\n${l.description || "Místo čeká na svůj příběh."}`,
    );
  }

  // NPCs + quest + opening as lore notes for narration grounding.
  for (let i = 0; i < spec.npcs.length; i++) {
    const npc = spec.npcs[i]!;
    const id = slugify(npc.name) || `npc-${i + 1}`;
    await writeNoteRaw(
      noteFile(dir, "lore", `npc-${id}`),
      { id: `npc-${id}`, name: npc.name, type: "npc" },
      `# ${npc.name}\n\n${npc.role}${npc.location ? ` — ${npc.location}` : ""}.`,
    );
  }
  await writeNoteRaw(
    noteFile(dir, "lore", "hlavni-ukol"),
    { id: "hlavni-ukol", name: spec.quest.title, type: "quest" },
    `# ${spec.quest.title}\n\n${spec.quest.summary}\n\n` +
      spec.quest.objectives.map((o) => `- [ ] ${o}`).join("\n"),
  );
  if (spec.opening.trim()) {
    await writeNoteRaw(
      noteFile(dir, "lore", "uvod"),
      { id: "uvod", name: "Úvodní scéna", type: "intro" },
      `# Úvodní scéna\n\n${spec.opening}`,
    );
  }

  // Campaign config — start at the first (hub) location.
  const config = {
    name,
    ruleset: "dnd5e-srd",
    starting_location: locs[0]?.id ?? "start",
    party: [] as string[],
    companions: [] as string[],
    language: "cs",
    tts: { enabled: true },
    llm: {},
    variant_rules: { flanking: false, diagonals: "5-5-5" },
  };
  await fs.writeFile(path.join(dir, "campaign.yaml"), YAML.stringify(config), "utf8");

  return { folder, usedLlm };
}
