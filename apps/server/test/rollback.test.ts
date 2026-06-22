import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { createSnapshot, listSnapshots, restoreSnapshot } from "../src/vault/snapshots.js";
import { createCampaign, slugify } from "../src/vault/scaffold.js";

const SOURCE = fileURLToPath(
  new URL("../../../data/vault.example/campaigns/velen-roads", import.meta.url),
);

const tmpRoots: string[] = [];
async function freshCampaign(): Promise<string> {
  const dir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "adm-rb-")), "velen-roads");
  await fs.cp(SOURCE, dir, { recursive: true });
  tmpRoots.push(path.dirname(dir));
  return dir;
}
afterAll(async () => {
  await Promise.all(tmpRoots.map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("campaign rollback via snapshots", () => {
  it("captures and restores the live session state", async () => {
    const dir = await freshCampaign();
    const sessionFile = path.join(dir, "state", "session.json");
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });
    await fs.writeFile(sessionFile, JSON.stringify({ current_location: "rozcesti", time: { day: 1 } }), "utf8");

    const snap = await createSnapshot(dir, { label: "Před bojem" });
    expect(snap.label).toBe("Před bojem");
    expect(snap.location).toBe("rozcesti");

    // Mutate the live state, then roll back.
    await fs.writeFile(sessionFile, JSON.stringify({ current_location: "stary-mlyn", time: { day: 9 } }), "utf8");
    await restoreSnapshot(dir, snap.id);

    const restored = JSON.parse(await fs.readFile(sessionFile, "utf8"));
    expect(restored.current_location).toBe("rozcesti");
    expect(restored.time.day).toBe(1);
  });

  it("auto-snapshots before a restore so rollback is reversible", async () => {
    const dir = await freshCampaign();
    const sessionFile = path.join(dir, "state", "session.json");
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });
    await fs.writeFile(sessionFile, JSON.stringify({ current_location: "a" }), "utf8");
    const snap = await createSnapshot(dir, { label: "base" });

    await fs.writeFile(sessionFile, JSON.stringify({ current_location: "b" }), "utf8");
    await restoreSnapshot(dir, snap.id);

    const snaps = await listSnapshots(dir);
    // base + the safety auto-snapshot taken during restore.
    expect(snaps.length).toBe(2);
    expect(snaps.some((s) => s.auto)).toBe(true);
  });

  it("scaffolds a valid new campaign folder", async () => {
    const dir = await freshCampaign();
    const vault = path.dirname(path.dirname(dir)); // <tmp>/<root> containing campaigns/
    const folder = await createCampaign(vault, { name: "Stíny nad Tří Řekami" });
    expect(folder).toBe(slugify("Stíny nad Tří Řekami"));

    const cfg = await fs.readFile(path.join(vault, "campaigns", folder, "campaign.yaml"), "utf8");
    expect(cfg).toContain("name: Stíny nad Tří Řekami");
    // The starting location note must exist so the world loads immediately.
    const locs = await fs.readdir(path.join(vault, "campaigns", folder, "locations"));
    expect(locs.length).toBe(1);

    // Refuses to clobber an existing folder.
    await expect(createCampaign(vault, { name: "x", folder })).rejects.toThrow();
  });
});
