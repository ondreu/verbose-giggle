import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";

/** Lowercase slug suitable for a folder / note id. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export const CAMPAIGN_DIRS = [
  "characters",
  "companions",
  "bestiary",
  "locations",
  "encounters",
  "items",
  "lore",
  "maps",
  "state",
];

/**
 * Create an empty campaign folder with the standard sub-dirs, refusing to
 * clobber an existing one. Returns the absolute campaign dir.
 */
export async function ensureCampaignDir(vaultPath: string, folder: string): Promise<string> {
  const dir = path.join(vaultPath, "campaigns", folder);
  try {
    await fs.access(dir);
    throw new Error(`Campaign folder "${folder}" already exists`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) throw err;
    // ENOENT (not found) is the happy path; anything else propagates.
  }
  for (const sub of CAMPAIGN_DIRS) {
    await fs.mkdir(path.join(dir, sub), { recursive: true });
  }
  return dir;
}

export interface NewCampaignInput {
  name: string;
  /** Optional folder override; defaults to a slug of the name. */
  folder?: string;
  startingLocationName?: string;
}

/**
 * Scaffold a fresh, valid campaign folder under <vault>/campaigns (§2 start
 * menu). Writes campaign.yaml plus the standard sub-folders and a single
 * starting location so the world loads immediately — no map or characters
 * required yet (those come from the GUI). Returns the created folder name.
 */
export async function createCampaign(vaultPath: string, input: NewCampaignInput): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Campaign name is required");
  const folder = slugify(input.folder || name);
  if (!folder) throw new Error("Could not derive a folder name");

  const dir = await ensureCampaignDir(vaultPath, folder);

  const startName = input.startingLocationName?.trim() || "Domovská osada";
  const startId = slugify(startName) || "start";

  const config = {
    name,
    ruleset: "dnd5e-srd",
    starting_location: startId,
    party: [] as string[],
    companions: [] as string[],
    language: "cs",
    tts: { enabled: true },
    llm: {},
    variant_rules: { flanking: false, diagonals: "5-5-5" },
  };
  await fs.writeFile(path.join(dir, "campaign.yaml"), YAML.stringify(config), "utf8");

  // A single discovered starting location, centred on the overworld.
  const locFrontmatter = YAML.stringify({
    type: "location",
    id: startId,
    name: startName,
    kind: "village",
    parent: null,
    coords: { x: 0.5, y: 0.5 },
    connections: [],
    discovered: true,
  }).trim();
  const locBody = `# ${startName}\n\nNová kampaň začíná zde. Uprav tuto lokaci v trezoru, nebo nech Pána jeskyně rozvinout svět.\n`;
  await fs.writeFile(
    path.join(dir, "locations", `${startId}.md`),
    `---\n${locFrontmatter}\n---\n\n${locBody}`,
    "utf8",
  );

  return folder;
}
