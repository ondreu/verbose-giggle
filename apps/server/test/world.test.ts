import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { SessionManager } from "../src/session/manager.js";

// The whole example vault, so `worlds/marka-havrani` resolves relative to the
// campaign folder (`<vault>/campaigns/velen-roads` → `<vault>/worlds/...`).
const VAULT = fileURLToPath(new URL("../../../data/vault.example", import.meta.url));

const tmpDirs: string[] = [];
async function freshVaultCampaign(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "adm-world-"));
  await fs.cp(VAULT, path.join(root, "vault"), { recursive: true });
  tmpDirs.push(root);
  return path.join(root, "vault", "campaigns", "velen-roads");
}
afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("living world layer (#49)", () => {
  it("merges the shared world under the campaign", async () => {
    const mgr = await SessionManager.open(await freshVaultCampaign());
    expect(mgr.campaign.world?.name).toBe("marka-havrani");
    // World locations + campaign locations coexist (campaign would win on collision).
    expect(mgr.campaign.locations["novigrad"]?.kind).toBe("city");
    expect(mgr.campaign.locations["rozcesti"]?.name).toBe("Rozcestí");
    // Factions, NPCs and world events come from the world.
    expect(mgr.campaign.factions["kult-marakathe"]?.goal).toMatch(/pečeť|Marakáthé/i);
    expect(mgr.campaign.npcs["prorok-vethis"]?.faction).toBe("kult-marakathe");
    expect(mgr.campaign.worldEvents["vrani-hrad-padl"]?.consequences.length).toBeGreaterThan(0);
  });

  it("seeds live faction state from the authored notes", async () => {
    const mgr = await SessionManager.open(await freshVaultCampaign());
    const kult = mgr.session.factions["kult-marakathe"];
    expect(kult?.progress).toBeCloseTo(0.45);
    expect(kult?.resources).toBe("medium");
    expect(mgr.session.factions["kupecky-cech"]?.resources).toBe("high");
  });

  it("advances a faction through the engine, logging the shift", async () => {
    const mgr = await SessionManager.open(await freshVaultCampaign());
    const gs = mgr.buildGameState();
    const r = await mgr.applyTool(gs, "faction_advance", { id: "kult-marakathe", delta: 0.2 });
    expect(r.ok).toBe(true);
    expect(mgr.session.factions["kult-marakathe"]?.progress).toBeCloseTo(0.65);
    expect(mgr.session.log.some((l) => l.kind === "world" && l.tool === "faction_advance")).toBe(true);
  });

  it("triggers a world event by id and applies the authored consequences", async () => {
    const mgr = await SessionManager.open(await freshVaultCampaign());
    const gs = mgr.buildGameState();
    // id alone — the manager fills name + consequences from the authored note.
    const r = await mgr.applyTool(gs, "world_event_trigger", { id: "vrani-hrad-padl" });
    expect(r.ok).toBe(true);
    expect(mgr.session.world_events["vrani-hrad-padl"]?.triggered).toBe(true);
    // Consequences: kult loses ground + resources, Velen danger drops.
    expect(mgr.session.factions["kult-marakathe"]?.progress).toBeCloseTo(0.05);
    expect(mgr.session.factions["kult-marakathe"]?.resources).toBe("low");
    expect(mgr.session.location_danger["velen"]).toBe("low");
  });
});
