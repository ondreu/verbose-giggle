import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { afterAll, describe, expect, it } from "vitest";
import { SessionManager } from "../src/session/manager.js";
import { createCharacter, creationOptions } from "../src/vault/creation.js";

const SOURCE = fileURLToPath(
  new URL("../../../data/vault.example/campaigns/velen-roads", import.meta.url),
);

const tmpRoots: string[] = [];
async function freshCampaign(): Promise<string> {
  const dir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "adm-cc-")), "velen-roads");
  await fs.cp(SOURCE, dir, { recursive: true });
  tmpRoots.push(path.dirname(dir));
  return dir;
}
afterAll(async () => {
  await Promise.all(tmpRoots.map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("character creation", () => {
  it("exposes races and classes for the GUI", () => {
    const opts = creationOptions();
    expect(opts.races.find((r) => r.id === "elf")?.bonuses.dex).toBe(2);
    expect(opts.classes.find((c) => c.id === "wizard")?.caster).toBe("full");
    expect(opts.standardArray).toEqual([15, 14, 13, 12, 10, 8]);
  });

  it("builds a valid actor, applies racial bonuses, and enrolls in the party", async () => {
    const dir = await freshCampaign();
    const mgr = await SessionManager.open(dir);
    const { id } = await createCharacter(mgr.campaign, {
      name: "Lyra Větrná",
      race: "elf",
      class: "wizard",
      abilities: { str: 8, dex: 15, con: 13, int: 14, wis: 12, cha: 10 },
      skills: ["arcana", "investigation", "history"], // 3 chosen, wizard allows 2
      spells: ["fire-bolt"],
    });

    // Re-open to read the persisted note back through the schema.
    const reloaded = await SessionManager.open(dir);
    const actor = reloaded.campaign.actors[id];
    expect(actor).toBeDefined();
    expect(actor!.abilities.dex).toBe(17); // 15 base + 2 elf
    expect(actor!.class).toBe("Kouzelník");
    // Wizard caps skills at 2.
    expect(actor!.proficiencies.skills.length).toBe(2);
    // Full caster gets two level-1 slots; HP = 6 (d6) + CON mod (13 -> +1) = 7.
    expect(actor!.spell_slots["1"]?.max).toBe(2);
    expect(actor!.hp.max).toBe(7);
    expect(actor!.spells_known).toContain("fire-bolt");

    // Party membership recorded in campaign.yaml.
    const cfg = YAML.parse(await fs.readFile(path.join(dir, "campaign.yaml"), "utf8"));
    expect(cfg.party).toContain(id);
  });

  it("rejects out-of-range ability scores", async () => {
    const mgr = await SessionManager.open(await freshCampaign());
    await expect(
      createCharacter(mgr.campaign, {
        name: "Bad",
        race: "human",
        class: "fighter",
        abilities: { str: 99, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        skills: [],
      }),
    ).rejects.toThrow();
  });
});
