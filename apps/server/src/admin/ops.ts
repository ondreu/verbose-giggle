/**
 * Admin / dev-panel operations over the vault (#57b): cross-tenant campaign
 * listing + export + delete, and whole-vault backups.
 *
 * Everything here reads and writes inside the vault root, which is the named
 * Docker volume in production — so backups and any state created here survive a
 * redeploy, exactly like the rest of the vault. Path inputs from the client are
 * confined to the vault (single safe segments only) to prevent traversal.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { dirSize, zipDirToFile, listZipEntries, unzipInto } from "../vault/zip.js";
import { SHARED_SCOPE } from "../session/registry.js";

/** A single path segment with no separators / traversal / dotfiles. */
function isSafeSegment(seg: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(seg) && seg !== "." && seg !== "..";
}

export interface ScopeInfo {
  /** `__shared__` for the self-hosted shared vault, else a user id. */
  scope: string;
  root: string;
}

/**
 * Resolve every data scope in the vault: the shared root plus each
 * `<vault>/users/<id>` subtree (hosted, #55f). Scopes with no `campaigns/`
 * folder are still returned (they may be empty seeds).
 */
export async function listScopes(vaultPath: string): Promise<ScopeInfo[]> {
  const scopes: ScopeInfo[] = [{ scope: SHARED_SCOPE, root: vaultPath }];
  let users: import("node:fs").Dirent[] = [];
  try {
    users = await fs.readdir(path.join(vaultPath, "users"), { withFileTypes: true });
  } catch {
    /* no users/ dir = self-hosted single-tenant */
  }
  for (const u of users) {
    if (u.isDirectory() && isSafeSegment(u.name)) {
      scopes.push({ scope: u.name, root: path.join(vaultPath, "users", u.name) });
    }
  }
  return scopes;
}

/** Resolve a scope id back to its (confined) vault root, or null if invalid. */
export function scopeRoot(vaultPath: string, scope: string): string | null {
  if (scope === SHARED_SCOPE) return vaultPath;
  if (!isSafeSegment(scope)) return null;
  return path.join(vaultPath, "users", scope);
}

/**
 * Permanently delete a user's vault subtree (`<vault>/users/<id>`) on account
 * deletion (GDPR, #59e). No-op (returns false) when the user never had isolated
 * data or the id isn't a safe single segment. Confined to the vault, so it can
 * never reach outside `<vault>/users/`.
 */
export async function deleteUserVault(vaultPath: string, userId: string): Promise<boolean> {
  if (!isSafeSegment(userId)) return false;
  const root = path.join(vaultPath, "users", userId);
  try {
    await fs.stat(root);
  } catch {
    return false; // nothing to delete
  }
  await fs.rm(root, { recursive: true, force: true });
  return true;
}

export interface CampaignInfo {
  scope: string;
  folder: string;
  name: string;
  sizeBytes: number;
}

/** List campaigns under one scope, reading the display name from campaign.yaml. */
async function scopeCampaigns(info: ScopeInfo): Promise<CampaignInfo[]> {
  const campaignsRoot = path.join(info.root, "campaigns");
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(campaignsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: CampaignInfo[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(campaignsRoot, e.name);
    let name = e.name;
    try {
      const raw = await fs.readFile(path.join(dir, "campaign.yaml"), "utf8");
      const parsed = YAML.parse(raw) as { name?: string } | null;
      if (parsed?.name) name = String(parsed.name);
    } catch {
      /* missing/malformed campaign.yaml — fall back to the folder name */
    }
    out.push({ scope: info.scope, folder: e.name, name, sizeBytes: await dirSize(dir) });
  }
  return out;
}

/** Every campaign across every scope (admin overview). */
export async function listAllCampaigns(vaultPath: string): Promise<CampaignInfo[]> {
  const scopes = await listScopes(vaultPath);
  const nested = await Promise.all(scopes.map(scopeCampaigns));
  return nested.flat();
}

/**
 * Resolve a campaign directory from a (scope, folder) pair, confined to the
 * vault and required to exist (has a campaign.yaml). Returns null on anything
 * unsafe or missing.
 */
export async function campaignDir(
  vaultPath: string,
  scope: string,
  folder: string,
): Promise<string | null> {
  const root = scopeRoot(vaultPath, scope);
  if (!root || !isSafeSegment(folder)) return null;
  const dir = path.join(root, "campaigns", folder);
  try {
    await fs.access(path.join(dir, "campaign.yaml"));
    return dir;
  } catch {
    return null;
  }
}

/** Delete a campaign folder (recursive). Caller must have resolved `dir`. */
export async function deleteCampaign(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

// --- Whole-vault backups (#57b) ---------------------------------------------

/** Where stored backups live (inside the vault → persists across redeploys). */
export function backupsDir(vaultPath: string): string {
  return path.join(vaultPath, "backups");
}

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CreateBackupOptions {
  /**
   * Flush the live SQLite WAL before zipping so the copied `app.db` is a
   * consistent snapshot (#59c). Best-effort; omitted in tests with no live DB.
   */
  checkpoint?: () => void;
  /**
   * Keep at most this many backups (newest wins); older ones are pruned after a
   * successful create. 0 / undefined = keep everything.
   */
  retention?: number;
}

/**
 * Zip the entire vault (DB, campaigns, worlds, settings) into
 * `<vault>/backups/<name>.zip`. The backups folder itself is excluded so a
 * backup never contains older backups. `nowIso` is injected so callers can keep
 * filenames deterministic in tests. The archive is streamed to disk one file at
 * a time (bounded memory, #59c) with 0o600 perms (it contains password hashes).
 * Returns the new backup's metadata.
 */
export async function createBackup(
  vaultPath: string,
  nowIso: string,
  opts: CreateBackupOptions = {},
): Promise<BackupInfo> {
  const dir = backupsDir(vaultPath);
  await fs.mkdir(dir, { recursive: true });
  opts.checkpoint?.();
  // ISO timestamp → filesystem-safe (':' and '.' out).
  const stamp = nowIso.replace(/[:.]/g, "-");
  const name = `vault-${stamp}.zip`;
  const target = path.join(dir, name);
  await zipDirToFile(vaultPath, target, (rel) => rel === "backups" || rel.startsWith("backups/"));
  const sizeBytes = (await fs.stat(target)).size;
  if (opts.retention && opts.retention > 0) await pruneBackups(vaultPath, opts.retention);
  return { name, sizeBytes, createdAt: nowIso };
}

/**
 * Delete backups beyond the newest `keep` (#59c retention). Returns the names
 * removed. No-op when `keep <= 0` or there's nothing to trim.
 */
export async function pruneBackups(vaultPath: string, keep: number): Promise<string[]> {
  if (keep <= 0) return [];
  const all = await listBackups(vaultPath); // newest first
  const stale = all.slice(keep);
  for (const b of stale) await deleteBackup(vaultPath, b.name);
  return stale.map((b) => b.name);
}

/** List stored backups, newest first. */
export async function listBackups(vaultPath: string): Promise<BackupInfo[]> {
  const dir = backupsDir(vaultPath);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: BackupInfo[] = [];
  for (const name of entries) {
    if (!name.endsWith(".zip")) continue;
    try {
      const st = await fs.stat(path.join(dir, name));
      out.push({ name, sizeBytes: st.size, createdAt: st.mtime.toISOString() });
    } catch {
      /* vanished between readdir and stat */
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Resolve a stored backup file path (confined), or null if the name is unsafe. */
export function backupPath(vaultPath: string, name: string): string | null {
  if (!isSafeSegment(name) || !name.endsWith(".zip")) return null;
  return path.join(backupsDir(vaultPath), name);
}

export async function deleteBackup(vaultPath: string, name: string): Promise<boolean> {
  const p = backupPath(vaultPath, name);
  if (!p) return false;
  try {
    await fs.rm(p, { force: true });
    return true;
  } catch {
    return false;
  }
}

// --- Guarded restore (#59c part 4): validate → stage → swap at next start ----

/** Marker file holding the validated backup to swap in on the next boot. */
function pendingRestorePath(vaultPath: string): string {
  return path.join(vaultPath, ".restore-pending.zip");
}

/** Temp dir a pending restore is unpacked into before the atomic swap. */
function restoreStagingDir(vaultPath: string): string {
  return path.join(vaultPath, ".restore-staging");
}

export class RestoreValidationError extends Error {}

/**
 * Validate a backup archive and stage it for a swap-in at the next start (#59c).
 * We never overwrite the live vault while the app (and its open SQLite handle)
 * is running; instead the bytes are parked as a marker and {@link
 * applyPendingRestore} swaps them in at boot, before the DB is opened. Throws
 * {@link RestoreValidationError} if the archive isn't a structurally valid vault
 * backup (must contain `db/app.db`). Returns the entry count.
 */
export async function stageRestore(vaultPath: string, zip: Buffer): Promise<{ entries: number }> {
  let names: string[];
  try {
    names = listZipEntries(zip);
  } catch (err) {
    throw new RestoreValidationError((err as Error).message);
  }
  if (!names.includes("db/app.db")) {
    throw new RestoreValidationError("Tohle nevypadá jako záloha vaultu (chybí db/app.db).");
  }
  await fs.mkdir(vaultPath, { recursive: true });
  await fs.writeFile(pendingRestorePath(vaultPath), zip, { mode: 0o600 });
  return { entries: names.length };
}

/**
 * If a restore was staged, swap it into the vault. MUST run at boot before the
 * database is opened. Extracts into a staging dir, re-validates, then replaces
 * each top-level entry atomically (`rename`). `backups/` is preserved (a backup
 * never contains it). On any failure the live vault is left untouched and the
 * bad marker is cleared. Returns true when a restore was applied.
 */
export async function applyPendingRestore(
  vaultPath: string,
  log?: (msg: string) => void,
): Promise<boolean> {
  const pending = pendingRestorePath(vaultPath);
  let zip: Buffer;
  try {
    zip = await fs.readFile(pending);
  } catch {
    return false; // nothing staged
  }
  const staging = restoreStagingDir(vaultPath);
  try {
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(staging, { recursive: true });
    await unzipInto(staging, zip);
    // Re-validate the unpacked tree before touching live data.
    await fs.access(path.join(staging, "db", "app.db"));
    for (const entry of await fs.readdir(staging)) {
      const dest = path.join(vaultPath, entry);
      await fs.rm(dest, { recursive: true, force: true });
      await fs.rename(path.join(staging, entry), dest);
    }
    log?.("Applied staged vault restore.");
    return true;
  } catch (err) {
    log?.(`Pending restore failed; vault left untouched: ${(err as Error).message}`);
    return false;
  } finally {
    await fs.rm(pending, { force: true }).catch(() => {});
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}
