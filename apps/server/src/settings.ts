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

/**
 * One selectable model in the operator-managed "model pool" (#56g). Every entry
 * is routed through the same OpenRouter chat-completions URL — only the slug
 * differs. `intelligence` / `price` are 1–5 "star" indicators shown to players
 * in the model picker; `perMessage` is the credit charge per message for it.
 */
export interface ModelPoolEntry {
  /** Player-facing display name. */
  name: string;
  /** OpenRouter model slug sent to the chat-completions endpoint. */
  model: string;
  /** Credits charged per message when this model runs (#56f). */
  perMessage: number;
  /** Intelligence rating, 1–5 stars. */
  intelligence: number;
  /** Price rating, 1–5 stars. */
  price: number;
  /** Free-text tooltip shown to the player on hover in the model picker. */
  tooltip: string;
}

export interface Settings {
  llm?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    /** "mock" forces the offline narrator even when a key is present. */
    provider?: "auto" | "mock";
    /**
     * Alternate model ids the player can re-roll a turn with ("Jiným modelem",
     * #54). Same provider/key as `model`; only the model name differs.
     */
    altModels?: string[];
  };
  image?: {
    enabled?: boolean;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  /** Azure AI Speech TTS (expressive Czech). Piper URL stays env-only. */
  tts?: {
    azureKey?: string;
    azureRegion?: string;
    voice?: string;
    rate?: string;
    pitch?: string;
    style?: string;
  };
  srdPath?: string;
  /** Campaign folder name under <vault>/campaigns (applied on next start). */
  campaign?: string;
  /**
   * Operational server settings editable from the admin/dev panel (#57b).
   * These overlay the env defaults (`applySettings`) the same way provider
   * credentials do, so they persist with the vault and survive a redeploy.
   * Distinct from per-user settings: this section is global / op-level.
   */
  server?: {
    /** Hosted edition gate: false = a session is required for protected routes. */
    allowAnonymous?: boolean;
    /** Whether self-service registration is open. */
    registrationEnabled?: boolean;
    /** Require a verified email before login. */
    requireVerifiedEmail?: boolean;
    /** Charge metered token/image/TTS usage against user credits. */
    creditsEnabled?: boolean;
    /**
     * Selectable model pool (#56g): the models a player can pick / re-roll
     * with, each with its OpenRouter slug, per-message credit price, and 1–5
     * star intelligence/price indicators. Authoritative source for the
     * per-model price table (folded into `pricing.perModelMessage`).
     */
    modelPool?: ModelPoolEntry[];
    /** Credit pricing (smallest unit). Missing fields fall back to env/defaults. */
    pricing?: {
      /** Per-action billing (#56f). */
      perMessage?: number;
      perModelMessage?: Record<string, number>;
      perCampaign?: number;
      perImage?: number;
      perThousandTtsChars?: number;
      /** Token cost-basis (logging). */
      perThousandPromptTokens?: number;
      perThousandCompletionTokens?: number;
    };
  };
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
    tts: { ...current.tts, ...patch.tts },
    server: { ...current.server, ...patch.server,
      pricing: { ...current.server?.pricing, ...patch.server?.pricing } },
  };
  // Drop empty sub-objects so the file stays tidy.
  if (merged.llm && Object.keys(merged.llm).length === 0) delete merged.llm;
  if (merged.image && Object.keys(merged.image).length === 0) delete merged.image;
  if (merged.tts && Object.keys(merged.tts).length === 0) delete merged.tts;
  if (merged.server?.pricing && Object.keys(merged.server.pricing).length === 0)
    delete merged.server.pricing;
  if (merged.server && Object.keys(merged.server).length === 0) delete merged.server;

  const file = settingsPath(vaultPath);
  const tmp = `${file}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(merged, null, 2), "utf8");
  await fs.rename(tmp, file);
  return merged;
}
