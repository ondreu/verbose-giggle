/**
 * One-shot migration of a legacy single-tenant vault into the designated
 * admin's per-user subtree (#55f part 2, decision 3).
 *
 * When multi-tenant isolation first comes up, the existing `<vault>/campaigns`
 * and `<vault>/worlds` belong to nobody. The first time the bootstrap admin
 * (`ADMIN_EMAIL`) resolves their scope, we move that data into
 * `<vault>/users/<admin-id>/` so the operator keeps access to everything they
 * authored. The split is marker-latched and idempotent: a marker file written
 * as the LAST step means "done"; its absence means "redo from scratch", and
 * every move tolerates "already moved". Moves are same-filesystem `fs.rename`
 * (atomic per step). The provider credentials in the global `settings.json`
 * stay global; only the `campaign` selection is copied into the user's settings.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadSettings, saveSettings } from "../settings.js";

const MARKER = ".migrated-from-root";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Move legacy `<vault>/campaigns` + `worlds` into `userRoot` if not already
 * done. Returns true when a migration was performed. Safe to call repeatedly
 * and from concurrent callers only when the caller serializes via a memoized
 * resolve promise (see SessionRegistry).
 */
export async function migrateLegacyVaultToUser(
  vaultPath: string,
  userRoot: string,
): Promise<boolean> {
  const marker = path.join(userRoot, MARKER);
  if (await exists(marker)) return false; // already migrated

  const legacyCampaigns = path.join(vaultPath, "campaigns");
  if (!(await exists(legacyCampaigns))) return false; // nothing to migrate

  // If the admin already has their own campaigns, never clobber them — just
  // latch the marker so we stop re-checking.
  const userCampaigns = path.join(userRoot, "campaigns");
  await fs.mkdir(userRoot, { recursive: true });
  if (await exists(userCampaigns)) {
    await fs.writeFile(marker, new Date().toISOString(), "utf8");
    return false;
  }

  // Ordered so an interrupted run resumes cleanly: worlds → campaigns →
  // settings split → marker (the latch).
  const legacyWorlds = path.join(vaultPath, "worlds");
  if ((await exists(legacyWorlds)) && !(await exists(path.join(userRoot, "worlds")))) {
    await fs.rename(legacyWorlds, path.join(userRoot, "worlds"));
  }
  await fs.rename(legacyCampaigns, userCampaigns);

  // Copy (not move) the campaign selection; provider creds stay in the global
  // settings file so anonymous/self-hosted reads still see them.
  const global = await loadSettings(vaultPath);
  if (global.campaign) await saveSettings(userRoot, { campaign: global.campaign });

  await fs.writeFile(marker, new Date().toISOString(), "utf8");
  return true;
}
