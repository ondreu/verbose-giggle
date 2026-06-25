import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig, bundledSrdDir, type Config } from "../src/config.js";
import { createCampaign } from "../src/vault/scaffold.js";
import { SessionRegistry, SHARED_SCOPE } from "../src/session/registry.js";
import type { GameEvent } from "../src/session/events.js";

const tmpDirs: string[] = [];
afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function seededVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "adm-reg-"));
  tmpDirs.push(root);
  const vault = path.join(root, "vault");
  await fs.mkdir(vault, { recursive: true });
  await createCampaign(vault, { name: "Test" });
  return vault;
}

function config(vaultPath: string): Config {
  const base = loadConfig();
  return { ...base, vaultPath, srdPath: bundledSrdDir };
}

describe("SessionRegistry.invalidateScope (#59d)", () => {
  it("notifies clients then drops the cached scope so it re-opens fresh", async () => {
    const vault = await seededVault();
    const registry = new SessionRegistry({ getConfig: () => config(vault) });

    const first = await registry.openShared();
    const events: GameEvent[] = [];
    first.bus.subscribe((e) => events.push(e));

    await registry.invalidateScope(SHARED_SCOPE, "campaign-deleted");
    expect(events).toContainEqual({ type: "reload", reason: "campaign-deleted" });

    // Next resolve rebuilds the scope from disk: a brand-new UserSession/bus.
    const second = await registry.openShared();
    expect(second).not.toBe(first);
    expect(second.bus).not.toBe(first.bus);
  });

  it("is a no-op for a scope that was never opened", async () => {
    const vault = await seededVault();
    const registry = new SessionRegistry({ getConfig: () => config(vault) });
    await expect(registry.invalidateScope("never", "x")).resolves.toBeUndefined();
  });
});
