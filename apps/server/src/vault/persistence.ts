/**
 * Vault persistence guard.
 *
 * Operator config (model pool, pricing, auth flags) lives in
 * `<vault>/settings.json`, accounts/credits in `<vault>/db/app.db`, and play
 * data in `<vault>/campaigns/` — all under the vault directory. They survive a
 * restart or redeploy *only* if that directory is on durable storage (a Docker
 * named volume / bind mount). The most common silent failure is a vault that
 * looks persistent but isn't (e.g. a named volume whose name changed with the
 * Compose project), so a redeploy lands on a fresh, re-seeded vault and the
 * operator's settings appear to "disappear".
 *
 * This module drops a tiny marker file the first time a vault is used and reads
 * it back on every boot. Because the marker lives *inside* the vault, its
 * identity is stable iff the vault is truly persistent: the same `id`/`createdAt`
 * across restarts proves persistence; a regenerated marker proves the vault was
 * reset. We log that loudly at startup and surface it in the admin health view,
 * turning silent data loss into an obvious, diagnosable signal.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface VaultMarker {
  /** Stable id minted once for this vault and persisted with it. */
  id: string;
  /** ISO timestamp the vault was first initialised. */
  createdAt: string;
  /** True when this boot had to create the marker (fresh or non-persistent vault). */
  fresh: boolean;
}

function markerPath(vaultPath: string): string {
  return path.join(vaultPath, ".vault-id");
}

/**
 * Read the vault's persistence marker, creating it if absent. Tolerant of a
 * missing/corrupt file: it is rewritten rather than throwing, so a half-written
 * marker can never block boot.
 */
export async function ensureVaultMarker(vaultPath: string): Promise<VaultMarker> {
  const file = markerPath(vaultPath);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<VaultMarker>;
    if (parsed && typeof parsed.id === "string" && typeof parsed.createdAt === "string") {
      return { id: parsed.id, createdAt: parsed.createdAt, fresh: false };
    }
  } catch {
    /* missing or unreadable — (re)create it below */
  }
  const marker: VaultMarker = { id: randomUUID(), createdAt: new Date().toISOString(), fresh: true };
  try {
    await fs.mkdir(vaultPath, { recursive: true });
    await fs.writeFile(file, JSON.stringify({ id: marker.id, createdAt: marker.createdAt }, null, 2), "utf8");
  } catch {
    /* best-effort: a read-only vault still boots, just without a stable marker */
  }
  return marker;
}

/** Lightweight count of direct subdirectories of `<vault>/<dir>` (0 if absent). */
async function countDirs(vaultPath: string, dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(path.join(vaultPath, dir), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

export interface VaultInventory {
  hasSettings: boolean;
  campaigns: number;
  /** User subtrees (hosted edition). 0 in shared/self-hosted mode. */
  userVaults: number;
}

/** A quick read-only inventory of the vault for the startup persistence log. */
export async function inspectVault(vaultPath: string): Promise<VaultInventory> {
  const hasSettings = await fs
    .access(path.join(vaultPath, "settings.json"))
    .then(() => true)
    .catch(() => false);
  return {
    hasSettings,
    campaigns: await countDirs(vaultPath, "campaigns"),
    userVaults: await countDirs(vaultPath, "users"),
  };
}
