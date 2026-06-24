/**
 * Built-in campaign templates (#3).
 *
 * The campaigns under the bundled example vault (`data/vault.example/campaigns`)
 * are authored, ready-to-play scenarios. Rather than seeding them once into the
 * live vault (where they could be mistaken for the player's own and reset on a
 * fresh deploy), we expose them as *templates*: the player instantiates one,
 * which copies it into the live vault under a fresh folder. That copy is the
 * player's own persistent campaign — it survives restarts and never resets.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { bundledVaultDir } from "../config.js";
import { slugify } from "./scaffold.js";

/** Absolute path to the bundled example campaigns that back the templates. */
const templatesRoot = path.join(bundledVaultDir, "campaigns");

export interface TemplateInfo {
  /** Source folder name under the bundled example vault. */
  folder: string;
  name: string;
  /** Party size authored into the template, for the picker. */
  party: number;
  /** Shared world the template lives in, if any. */
  world?: string;
}

/** List the bundled template campaigns. Tolerant: missing/unreadable → []. */
export async function listTemplates(): Promise<TemplateInfo[]> {
  let entries;
  try {
    entries = await fs.readdir(templatesRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: TemplateInfo[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const raw = await fs.readFile(path.join(templatesRoot, e.name, "campaign.yaml"), "utf8");
      const cfg = (YAML.parse(raw) ?? {}) as { name?: string; party?: unknown[]; world?: string };
      out.push({
        folder: e.name,
        name: cfg.name ?? e.name,
        party: Array.isArray(cfg.party) ? cfg.party.length : 0,
        world: typeof cfg.world === "string" ? cfg.world : undefined,
      });
    } catch {
      /* skip an unreadable template */
    }
  }
  return out;
}

/** Pick a campaign folder name that doesn't collide with an existing one. */
async function uniqueFolder(vaultPath: string, base: string): Promise<string> {
  const root = path.join(vaultPath, "campaigns");
  let folder = base;
  for (let i = 2; ; i++) {
    try {
      await fs.access(path.join(root, folder));
      folder = `${base}-${i}`; // taken — try the next suffix
    } catch {
      return folder; // free
    }
  }
}

/**
 * Copy a bundled template into the live vault as a fresh, persistent campaign.
 * Live state (`state/`) is reset so each instantiation is a clean playthrough,
 * and the campaign's referenced shared world is copied into the vault if it
 * isn't already there (so templates work even in a vault that wasn't seeded).
 * Returns the new campaign folder name.
 */
export async function instantiateTemplate(
  vaultPath: string,
  templateFolder: string,
  name?: string,
): Promise<string> {
  const safe = path.basename((templateFolder ?? "").trim());
  if (!safe || safe !== (templateFolder ?? "").trim()) {
    throw new Error("Invalid template folder");
  }
  const src = path.join(templatesRoot, safe);
  let cfg: { name?: string; world?: string };
  try {
    cfg = (YAML.parse(await fs.readFile(path.join(src, "campaign.yaml"), "utf8")) ?? {}) as {
      name?: string;
      world?: string;
    };
  } catch {
    throw new Error(`Unknown template "${templateFolder}"`);
  }

  const displayName = name?.trim() || cfg.name || safe;
  const base = slugify(displayName) || slugify(safe) || "kampan";
  const folder = await uniqueFolder(vaultPath, base);
  const dest = path.join(vaultPath, "campaigns", folder);

  await fs.cp(src, dest, { recursive: true });

  // Reset live state so the copy starts fresh (the template may carry none).
  const stateDir = path.join(dest, "state");
  await fs.rm(stateDir, { recursive: true, force: true });
  await fs.mkdir(stateDir, { recursive: true });

  // Persist an overridden display name onto the copy's config.
  if (name?.trim() && name.trim() !== cfg.name) {
    const merged = { ...cfg, name: name.trim() };
    await fs.writeFile(path.join(dest, "campaign.yaml"), YAML.stringify(merged), "utf8");
  }

  // Make sure the referenced shared world exists in the vault (copy from the
  // bundled example if missing), or the campaign would load without its world.
  if (cfg.world) {
    const worldDest = path.join(vaultPath, "worlds", cfg.world);
    try {
      await fs.access(worldDest);
    } catch {
      const worldSrc = path.join(bundledVaultDir, "worlds", cfg.world);
      try {
        await fs.access(worldSrc);
        await fs.cp(worldSrc, worldDest, { recursive: true });
      } catch {
        /* no bundled world to copy — campaign still loads, just without it */
      }
    }
  }

  return folder;
}
