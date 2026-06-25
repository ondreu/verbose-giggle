import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { deleteUserVault } from "../src/admin/ops.js";

const tmpDirs: string[] = [];
afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function freshVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "adm-gdpr-"));
  tmpDirs.push(root);
  return path.join(root, "vault");
}

describe("deleteUserVault (#59e)", () => {
  it("removes the user's subtree and reports it", async () => {
    const vault = await freshVault();
    const userDir = path.join(vault, "users", "u1", "campaigns", "c");
    await fs.mkdir(userDir, { recursive: true });
    await fs.writeFile(path.join(userDir, "campaign.yaml"), "name: x", "utf8");

    const removed = await deleteUserVault(vault, "u1");
    expect(removed).toBe(true);
    await expect(fs.stat(path.join(vault, "users", "u1"))).rejects.toThrow();
  });

  it("is a no-op when the user has no isolated data", async () => {
    const vault = await freshVault();
    await fs.mkdir(vault, { recursive: true });
    expect(await deleteUserVault(vault, "ghost")).toBe(false);
  });

  it("refuses an unsafe id and never escapes the vault", async () => {
    const vault = await freshVault();
    const sibling = path.join(path.dirname(vault), "secret");
    await fs.mkdir(sibling, { recursive: true });
    await fs.writeFile(path.join(sibling, "keep.txt"), "keep", "utf8");

    expect(await deleteUserVault(vault, "../../secret")).toBe(false);
    // The traversal target is untouched.
    expect(await fs.readFile(path.join(sibling, "keep.txt"), "utf8")).toBe("keep");
  });
});
