import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listFiles, zipDir } from "../src/vault/zip.js";

const CAMPAIGN = fileURLToPath(
  new URL("../../../data/vault.example/campaigns/konvoj-do-vresoviste", import.meta.url),
);

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
