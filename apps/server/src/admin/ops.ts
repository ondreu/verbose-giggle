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
import { dirSize, zipDir } from "../vault/zip.js";
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

/**
 * Zip the entire vault (DB, campaigns, worlds, settings) into
 * `<vault>/backups/<name>.zip`. The backups folder itself is excluded so a
 * backup never contains older backups. `nowIso` is injected so callers can keep
 * filenames deterministic in tests. Returns the new backup's metadata.
 */
export async function createBackup(vaultPath: string, nowIso: string): Promise<BackupInfo> {
  const dir = backupsDir(vaultPath);
  await fs.mkdir(dir, { recursive: true });
  // ISO timestamp → filesystem-safe (':' and '.' out).
  const stamp = nowIso.replace(/[:.]/g, "-");
  const name = `vault-${stamp}.zip`;
  const buf = await zipDir(vaultPath, (rel) => rel === "backups" || rel.startsWith("backups/"));
  const target = path.join(dir, name);
  await fs.writeFile(target, buf);
  return { name, sizeBytes: buf.length, createdAt: nowIso };
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
