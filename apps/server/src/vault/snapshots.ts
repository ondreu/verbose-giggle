import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Campaign rollback via on-disk snapshots (§7). A snapshot captures the live
 * `state/` folder (session.json + diary) together with the durable actor notes
 * (characters / companions / bestiary), so restoring rewinds both the runtime
 * overlay and any sheet changes flushed out of combat. Snapshots live under
 * `state/snapshots/<id>/` and are never themselves recursed into.
 */

const SNAP_DIRNAME = "snapshots";
// Durable content captured alongside the runtime state.
const ACTOR_DIRS = ["characters", "companions", "bestiary"];

export interface SnapshotMeta {
  id: string;
  label: string;
  createdAt: string;
  /** Lightweight summary for the rollback list (best-effort). */
  location?: string;
  day?: number;
  auto?: boolean;
}

function snapshotsRoot(campaignDir: string): string {
  return path.join(campaignDir, "state", SNAP_DIRNAME);
}

async function copyIfExists(from: string, to: string): Promise<void> {
  try {
    await fs.access(from);
  } catch {
    return;
  }
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true });
}

/** Create a snapshot of the campaign's mutable state. Returns its metadata. */
export async function createSnapshot(
  campaignDir: string,
  opts: { label?: string; auto?: boolean } = {},
): Promise<SnapshotMeta> {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const dest = path.join(snapshotsRoot(campaignDir), id);
  await fs.mkdir(dest, { recursive: true });

  // Runtime state (session.json + session-log.md), excluding the snapshots dir.
  await copyIfExists(path.join(campaignDir, "state", "session.json"), path.join(dest, "state", "session.json"));
  await copyIfExists(path.join(campaignDir, "state", "session-log.md"), path.join(dest, "state", "session-log.md"));
  // Durable actor sheets.
  for (const sub of ACTOR_DIRS) {
    await copyIfExists(path.join(campaignDir, sub), path.join(dest, sub));
  }

  // Best-effort summary pulled from the session for the rollback list.
  let location: string | undefined;
  let day: number | undefined;
  try {
    const raw = await fs.readFile(path.join(campaignDir, "state", "session.json"), "utf8");
    const s = JSON.parse(raw);
    location = s.current_location;
    day = s.time?.day;
  } catch {
    /* summary is optional */
  }

  const meta: SnapshotMeta = {
    id,
    label: opts.label?.trim() || `Záloha ${new Date().toLocaleString("cs-CZ")}`,
    createdAt: new Date().toISOString(),
    location,
    day,
    auto: opts.auto,
  };
  await fs.writeFile(path.join(dest, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

/** List snapshots, newest first. */
export async function listSnapshots(campaignDir: string): Promise<SnapshotMeta[]> {
  const root = snapshotsRoot(campaignDir);
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
  const metas: SnapshotMeta[] = [];
  for (const id of entries) {
    try {
      const raw = await fs.readFile(path.join(root, id, "meta.json"), "utf8");
      metas.push(JSON.parse(raw) as SnapshotMeta);
    } catch {
      metas.push({ id, label: id, createdAt: id });
    }
  }
  return metas.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Restore a snapshot over the live campaign. Takes a safety auto-snapshot of the
 * current state first, then copies the captured files back into place. The
 * caller is responsible for re-opening the SessionManager afterwards.
 */
export async function restoreSnapshot(campaignDir: string, id: string): Promise<void> {
  const src = path.join(snapshotsRoot(campaignDir), id);
  await fs.access(path.join(src, "meta.json")); // throws if the id is unknown

  // Safety net: never let a restore be irreversible.
  await createSnapshot(campaignDir, { label: "Před obnovením (automatická)", auto: true });

  await copyIfExists(path.join(src, "state", "session.json"), path.join(campaignDir, "state", "session.json"));
  await copyIfExists(path.join(src, "state", "session-log.md"), path.join(campaignDir, "state", "session-log.md"));
  for (const sub of ACTOR_DIRS) {
    await copyIfExists(path.join(src, sub), path.join(campaignDir, sub));
  }
}

/** Delete a snapshot. */
export async function deleteSnapshot(campaignDir: string, id: string): Promise<void> {
  const dir = path.join(snapshotsRoot(campaignDir), id);
  // Guard against path escapes — id must be a plain directory name.
  if (id.includes("/") || id.includes("..") || path.dirname(dir) !== snapshotsRoot(campaignDir)) {
    throw new Error("invalid snapshot id");
  }
  await fs.rm(dir, { recursive: true, force: true });
}
