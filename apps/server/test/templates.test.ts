import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { instantiateTemplate, listTemplates } from "../src/vault/templates.js";
import { SessionManager } from "../src/session/manager.js";

const tmpRoots: string[] = [];
async function freshVault(): Promise<string> {
  const v = await fs.mkdtemp(path.join(os.tmpdir(), "adm-tpl-"));
  tmpRoots.push(v);
  return v;
}
afterAll(async () => {
  await Promise.all(tmpRoots.map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("built-in campaign templates (#3)", () => {
  it("lists the bundled example campaigns as templates", async () => {
    const templates = await listTemplates();
    const folders = templates.map((t) => t.folder);
    expect(folders).toContain("stiny-vraniho-hradu");
    const stiny = templates.find((t) => t.folder === "stiny-vraniho-hradu")!;
    expect(stiny.name).toBe("Stíny Vraního hradu");
    expect(stiny.party).toBeGreaterThan(0);
    expect(stiny.world).toBe("marka-havrani");
  });

  it("instantiates a template into a fresh, persistent campaign that loads", async () => {
    const vault = await freshVault();
    const folder = await instantiateTemplate(vault, "stiny-vraniho-hradu", "Moje výprava");
    const dir = path.join(vault, "campaigns", folder);

    // The copy carries the overridden name and a clean (empty) state dir.
    const cfg = await fs.readFile(path.join(dir, "campaign.yaml"), "utf8");
    expect(cfg).toMatch(/Moje výprava/);
    expect(await fs.readdir(path.join(dir, "state"))).toEqual([]);

    // The referenced shared world was copied into the vault so the campaign loads.
    await fs.access(path.join(vault, "worlds", "marka-havrani"));
    const mgr = await SessionManager.open(dir);
    expect(mgr.campaign.config.name).toBe("Moje výprava");
    expect(mgr.campaign.config.world).toBe("marka-havrani");
  });

  it("never clobbers an existing campaign folder", async () => {
    const vault = await freshVault();
    const a = await instantiateTemplate(vault, "stiny-vraniho-hradu");
    const b = await instantiateTemplate(vault, "stiny-vraniho-hradu");
    expect(a).not.toBe(b);
    await fs.access(path.join(vault, "campaigns", a));
    await fs.access(path.join(vault, "campaigns", b));
  });
});
