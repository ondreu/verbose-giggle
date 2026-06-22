import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Llm } from "../src/llm/client.js";
import { forgeCampaign } from "../src/vault/forge.js";
import { SessionManager } from "../src/session/manager.js";

const tmpRoots: string[] = [];
async function freshVault(): Promise<string> {
  const v = await fs.mkdtemp(path.join(os.tmpdir(), "adm-forge-"));
  tmpRoots.push(v);
  return v;
}
afterAll(async () => {
  await Promise.all(tmpRoots.map((d) => fs.rm(d, { recursive: true, force: true })));
});

// No content → forge falls back to the deterministic template.
const silentLlm: Llm = { chat: async () => ({ content: null, toolCalls: [] }) };

const jsonLlm: Llm = {
  chat: async () => ({
    content:
      'Tady je návrh:\n```json\n{"pitch":"P","opening":"Začínáte v lese.","locations":[' +
      '{"name":"Lesní Brod","kind":"village","description":"Brod přes řeku."},' +
      '{"name":"Černá Sluj","kind":"dungeon","description":"Temná jeskyně."}],' +
      '"npcs":[{"name":"Vědma Mara","role":"rádkyně","location":"Lesní Brod"}],' +
      '"quest":{"title":"Stín v lese","summary":"Najít zdroj temnoty.","objectives":["a","b","c"]}}\n```',
    toolCalls: [],
  }),
};

describe("AI campaign builder", () => {
  it("falls back to a template when the LLM gives nothing, producing a valid campaign", async () => {
    const vault = await freshVault();
    const { folder, usedLlm } = await forgeCampaign(vault, silentLlm, {
      name: "Mlha nad Krajem",
      premise: "prokletí, které krade vzpomínky",
      length: "short",
    });
    expect(usedLlm).toBe(false);

    const dir = path.join(vault, "campaigns", folder);
    const locs = await fs.readdir(path.join(dir, "locations"));
    expect(locs.length).toBe(3); // short → 3 locations

    // The result must load as a real campaign with a valid starting location.
    const mgr = await SessionManager.open(dir);
    expect(mgr.campaign.config.name).toBe("Mlha nad Krajem");
    expect(mgr.campaign.locations[mgr.campaign.config.starting_location]).toBeDefined();
    expect(Object.keys(mgr.campaign.lore)).toContain("hlavni-ukol");
  });

  it("uses the LLM spec when it returns valid JSON", async () => {
    const vault = await freshVault();
    const { folder, usedLlm } = await forgeCampaign(vault, jsonLlm, { name: "Lesní Stíny", length: "medium" });
    expect(usedLlm).toBe(true);

    const mgr = await SessionManager.open(path.join(vault, "campaigns", folder));
    expect(mgr.campaign.locations["lesni-brod"]?.name).toBe("Lesní Brod");
    expect(mgr.campaign.locations["lesni-brod"]?.discovered).toBe(true); // hub starts revealed
  });
});
