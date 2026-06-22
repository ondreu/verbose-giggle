/**
 * GUI-editable runtime settings (§9.1, §14.2).
 *
 * A small JSON file in the vault root holds the subset of configuration the
 * table changes from the web UI — chiefly the LLM/image provider credentials
 * and the campaign selection — so a fresh deployment needs only a minimal
 * bootstrap `.env` (port/host/vault/piper/auth) and everything else is set in
 * the app. File-first, like the rest of the vault: it persists with the
 * mounted data and is overlaid on top of the env defaults (`applySettings`).
 *
 * Infrastructure/bootstrap values (PORT, HOST, VAULT_PATH, PIPER_URL,
 * BASIC_AUTH, WEB_DIST, Cloudflare token) stay in the environment on purpose:
 * they are needed before the server can read this file, or they are the lock
 * that guards the very UI that would edit them.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

export interface Settings {
  llm?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    /** "mock" forces the offline narrator even when a key is present. */
    provider?: "auto" | "mock";
  };
  image?: {
    enabled?: boolean;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  srdPath?: string;
  /** Campaign folder name under <vault>/campaigns (applied on next start). */
  campaign?: string;
}

function settingsPath(vaultPath: string): string {
  return path.join(vaultPath, "settings.json");
}

/** Read the vault settings file. Tolerant: missing/malformed → empty settings. */
export async function loadSettings(vaultPath: string): Promise<Settings> {
  try {
    const raw = await fs.readFile(settingsPath(vaultPath), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Settings) : {};
  } catch {
    return {};
  }
}

/**
 * Deep-merge a patch into the stored settings and write it back atomically.
 * Nested objects (llm/image) are merged key-by-key; an explicit empty string
 * clears a credential. Returns the merged result.
 */
export async function saveSettings(vaultPath: string, patch: Settings): Promise<Settings> {
  const current = await loadSettings(vaultPath);
  const merged: Settings = {
    ...current,
    ...patch,
    llm: { ...current.llm, ...patch.llm },
    image: { ...current.image, ...patch.image },
  };
  // Drop empty sub-objects so the file stays tidy.
  if (merged.llm && Object.keys(merged.llm).length === 0) delete merged.llm;
  if (merged.image && Object.keys(merged.image).length === 0) delete merged.image;

  const file = settingsPath(vaultPath);
  const tmp = `${file}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(merged, null, 2), "utf8");
  await fs.rename(tmp, file);
  return merged;
}
