import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ensureVaultMarker, inspectVault } from "../src/vault/persistence.js";

/**
 * The vault persistence marker proves whether the vault survives a redeploy: a
 * stable id/createdAt across boots means durable storage, a regenerated one
 * means the vault was reset. These tests pin that contract.
 */
const tmpDirs: string[] = [];
async function freshVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "adm-persist-"));
  tmpDirs.push(root);
  return path.join(root, "vault");
}
afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("vault persistence marker", () => {
  it("mints a marker on first use and reuses it on later boots", async () => {
    const vault = await freshVault();
    const first = await ensureVaultMarker(vault);
    expect(first.fresh).toBe(true);
    expect(first.id).toMatch(/[0-9a-f-]{36}/);

    // A second boot against the SAME directory must read the same identity back
    // — this is exactly what persistence across a restart looks like.
    const second = await ensureVaultMarker(vault);
    expect(second.fresh).toBe(false);
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
  });

  it("regenerates a fresh marker for a brand-new (non-persistent) vault", async () => {
    const a = await ensureVaultMarker(await freshVault());
    const b = await ensureVaultMarker(await freshVault());
    // Different vault dir (as a reset volume would be) → a different identity.
    expect(b.id).not.toBe(a.id);
    expect(b.fresh).toBe(true);
  });

  it("rewrites a corrupt marker without throwing", async () => {
    const vault = await freshVault();
    await fs.mkdir(vault, { recursive: true });
    await fs.writeFile(path.join(vault, ".vault-id"), "{ not json", "utf8");
    const m = await ensureVaultMarker(vault);
    expect(m.fresh).toBe(true);
    expect(m.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("inventories settings.json and campaigns for the boot log", async () => {
    const vault = await freshVault();
    await fs.mkdir(path.join(vault, "campaigns", "demo"), { recursive: true });
    await fs.writeFile(path.join(vault, "settings.json"), "{}", "utf8");
    const inv = await inspectVault(vault);
    expect(inv).toEqual({ hasSettings: true, campaigns: 1, userVaults: 0 });
  });
});
