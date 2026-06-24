import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { listFiles, unzipInto, zipDir } from "../src/vault/zip.js";

const CAMPAIGN = fileURLToPath(
  new URL("../../../data/vault.example/campaigns/konvoj-do-vresoviste", import.meta.url),
);

const tmpRoots: string[] = [];
async function tmpDir(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), "adm-zip-"));
  tmpRoots.push(d);
  return d;
}
afterAll(async () => {
  await Promise.all(tmpRoots.map((d) => fs.rm(d, { recursive: true, force: true })));
});

/** Build a minimal one-entry DEFLATE zip in-memory, for the inflate path. */
function deflateZip(name: string, data: Buffer): Buffer {
  const comp = zlib.deflateRawSync(data);
  const crc = zlib.crc32 ? zlib.crc32(data) : 0; // crc only needed by strict readers
  const nameBuf = Buffer.from(name, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8); // method: deflate
  local.writeUInt32LE(crc >>> 0, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const localAll = Buffer.concat([local, nameBuf, comp]);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(crc >>> 0, 16);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(0, 42); // local header offset
  const cdAll = Buffer.concat([cd, nameBuf]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdAll.length, 12);
  eocd.writeUInt32LE(localAll.length, 16);
  return Buffer.concat([localAll, cdAll, eocd]);
}

describe("vault zip/export (#35)", () => {
  it("lists campaign vault files as relative POSIX paths", async () => {
    const files = await listFiles(CAMPAIGN);
    expect(files).toContain("campaign.yaml");
    expect(files).toContain("characters/thorin.md");
    // sorted, forward-slash separators only
    expect(files.every((f) => !f.includes("\\"))).toBe(true);
    expect([...files]).toEqual([...files].sort());
  });

  it("produces a valid ZIP archive (PK signature + EOCD)", async () => {
    const zip = await zipDir(CAMPAIGN);
    expect(zip.length).toBeGreaterThan(64);
    // Local file header signature at the start.
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    // End-of-central-directory record at the tail.
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    // Entry count in EOCD matches the file list.
    const files = await listFiles(CAMPAIGN);
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(files.length);
  });
});

describe("vault zip import (#worlds upload)", () => {
  it("round-trips: zipDir → unzipInto reproduces every file byte-for-byte", async () => {
    const zip = await zipDir(CAMPAIGN);
    const dest = await tmpDir();
    const written = await unzipInto(dest, zip);

    const src = await listFiles(CAMPAIGN);
    expect(written).toBe(src.length);
    expect((await listFiles(dest)).sort()).toEqual([...src].sort());

    // Spot-check content equality on a known file.
    const a = await fs.readFile(path.join(CAMPAIGN, "campaign.yaml"));
    const b = await fs.readFile(path.join(dest, "campaign.yaml"));
    expect(b.equals(a)).toBe(true);
  });

  it("inflates DEFLATE-compressed entries", async () => {
    const payload = Buffer.from("# Svět\n".repeat(500), "utf8");
    const zip = deflateZip("lore/kronika.md", payload);
    const dest = await tmpDir();
    const written = await unzipInto(dest, zip);
    expect(written).toBe(1);
    expect((await fs.readFile(path.join(dest, "lore", "kronika.md")).then((b) => b.equals(payload)))).toBe(true);
  });

  it("skips zip-slip entries that escape the destination", async () => {
    const evil = deflateZip("../escape.md", Buffer.from("nope"));
    const dest = await tmpDir();
    const written = await unzipInto(dest, evil);
    expect(written).toBe(0);
    await expect(fs.access(path.join(path.dirname(dest), "escape.md"))).rejects.toThrow();
  });

  it("rejects a non-zip buffer", async () => {
    await expect(unzipInto(await tmpDir(), Buffer.from("not a zip at all"))).rejects.toThrow();
  });
});
