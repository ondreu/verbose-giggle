import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { zipDirToFile, unzipInto } from "../src/vault/zip.js";
import {
  backupsDir,
  pruneBackups,
  listBackups,
  stageRestore,
  applyPendingRestore,
  RestoreValidationError,
} from "../src/admin/ops.js";

const tmpDirs: string[] = [];
afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});
async function tmp(prefix: string): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

describe("zipDirToFile (#59c streaming backup)", () => {
  it("round-trips through unzipInto and excludes matched paths", async () => {
    const src = await tmp("adm-zip-src-");
    await fs.mkdir(path.join(src, "campaigns", "c"), { recursive: true });
    await fs.writeFile(path.join(src, "campaigns", "c", "a.txt"), "hello");
    await fs.writeFile(path.join(src, "big.bin"), Buffer.alloc(200_000, 7));
    await fs.mkdir(path.join(src, "backups"), { recursive: true });
    await fs.writeFile(path.join(src, "backups", "old.zip"), "should be skipped");

    const zipPath = path.join(await tmp("adm-zip-out-"), "out.zip");
    await zipDirToFile(src, zipPath, (rel) => rel === "backups" || rel.startsWith("backups/"));

    // 0o600 perms: the archive holds sensitive data (password hashes).
    const mode = (await fs.stat(zipPath)).mode & 0o777;
    expect(mode).toBe(0o600);

    const out = await tmp("adm-unzip-");
    const zip = await fs.readFile(zipPath);
    const written = await unzipInto(out, zip);
    expect(written).toBe(2); // a.txt + big.bin, backups/ excluded

    expect(await fs.readFile(path.join(out, "campaigns", "c", "a.txt"), "utf8")).toBe("hello");
    expect((await fs.stat(path.join(out, "big.bin"))).size).toBe(200_000);
    await expect(fs.stat(path.join(out, "backups", "old.zip"))).rejects.toThrow();
  });
});

describe("pruneBackups (#59c retention)", () => {
  it("keeps only the newest N backups", async () => {
    const vault = await tmp("adm-ret-");
    const dir = backupsDir(vault);
    await fs.mkdir(dir, { recursive: true });
    // Three backups with strictly increasing mtimes so ordering is deterministic.
    const names = ["vault-1.zip", "vault-2.zip", "vault-3.zip"];
    for (let i = 0; i < names.length; i++) {
      const p = path.join(dir, names[i]!);
      await fs.writeFile(p, "x");
      const t = new Date(2026, 0, 1 + i);
      await fs.utimes(p, t, t);
    }

    const removed = await pruneBackups(vault, 2);
    expect(removed).toEqual(["vault-1.zip"]); // oldest pruned
    const left = (await listBackups(vault)).map((b) => b.name);
    expect(left).toEqual(["vault-3.zip", "vault-2.zip"]); // newest first
  });

  it("is a no-op when keep is 0", async () => {
    const vault = await tmp("adm-ret0-");
    const dir = backupsDir(vault);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "vault-1.zip"), "x");
    expect(await pruneBackups(vault, 0)).toEqual([]);
  });
});

describe("guarded restore (#59c)", () => {
  /** A minimal vault with a DB file and one campaign; returns its path. */
  async function vaultWith(dbContent: string): Promise<string> {
    const vault = await tmp("adm-restore-");
    await fs.mkdir(path.join(vault, "db"), { recursive: true });
    await fs.writeFile(path.join(vault, "db", "app.db"), dbContent);
    await fs.mkdir(path.join(vault, "campaigns", "c"), { recursive: true });
    await fs.writeFile(path.join(vault, "campaigns", "c", "x.txt"), "hello");
    return vault;
  }

  it("stages a valid backup and swaps it in at next start", async () => {
    const vault = await vaultWith("v1");
    // Keep an existing backup around to prove backups/ survives a restore.
    await fs.mkdir(backupsDir(vault), { recursive: true });
    await fs.writeFile(path.join(backupsDir(vault), "keep.zip"), "earlier");

    const zipPath = path.join(await tmp("adm-restore-zip-"), "b.zip");
    await zipDirToFile(vault, zipPath, (rel) => rel === "backups" || rel.startsWith("backups/"));
    const zip = await fs.readFile(zipPath);

    // Mutate the live vault: new DB, campaign deleted.
    await fs.writeFile(path.join(vault, "db", "app.db"), "v2-MUTATED");
    await fs.rm(path.join(vault, "campaigns"), { recursive: true, force: true });

    const staged = await stageRestore(vault, zip);
    expect(staged.entries).toBeGreaterThan(0);

    const applied = await applyPendingRestore(vault);
    expect(applied).toBe(true);

    expect(await fs.readFile(path.join(vault, "db", "app.db"), "utf8")).toBe("v1");
    expect(await fs.readFile(path.join(vault, "campaigns", "c", "x.txt"), "utf8")).toBe("hello");
    // Pre-existing backups are untouched, staging + marker are cleaned up.
    expect(await fs.readFile(path.join(backupsDir(vault), "keep.zip"), "utf8")).toBe("earlier");
    await expect(fs.stat(path.join(vault, ".restore-pending.zip"))).rejects.toThrow();
    await expect(fs.stat(path.join(vault, ".restore-staging"))).rejects.toThrow();
  });

  it("rejects an archive that isn't a vault backup", async () => {
    const vault = await tmp("adm-restore-bad-");
    const zipPath = path.join(await tmp("adm-restore-badzip-"), "b.zip");
    // A valid zip, but with no db/app.db.
    const src = await tmp("adm-restore-src-");
    await fs.writeFile(path.join(src, "note.txt"), "not a vault");
    await zipDirToFile(src, zipPath);
    const zip = await fs.readFile(zipPath);

    await expect(stageRestore(vault, zip)).rejects.toBeInstanceOf(RestoreValidationError);
    await expect(stageRestore(vault, Buffer.from("garbage"))).rejects.toBeInstanceOf(RestoreValidationError);
  });

  it("applyPendingRestore is a no-op with nothing staged", async () => {
    const vault = await tmp("adm-restore-none-");
    await fs.mkdir(vault, { recursive: true });
    expect(await applyPendingRestore(vault)).toBe(false);
  });
});
