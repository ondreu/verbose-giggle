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
    expect(actor!.class).toBe("wizard"); // SRD id stored; UI localizes to Kouzelník
    expect(actor!.race).toBe("elf");
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

  it("enriches options and applies a subrace + spell list when SRD is mounted (#20)", async () => {
    const srdDir = await fs.mkdtemp(path.join(os.tmpdir(), "adm-srd-"));
    tmpRoots.push(srdDir);
    await fs.writeFile(
      path.join(srdDir, "5e-SRD-Races.json"),
      JSON.stringify([
        { index: "elf", name: "Elf", speed: 30, ability_bonuses: [{ ability_score: { index: "dex" }, bonus: 2 }], languages: [{ index: "common" }, { index: "elvish" }], traits: [{ index: "darkvision" }], subraces: [{ index: "high-elf" }] },
      ]),
    );
    await fs.writeFile(
      path.join(srdDir, "5e-SRD-Subraces.json"),
      JSON.stringify([
        { index: "high-elf", name: "High Elf", race: { index: "elf" }, ability_bonuses: [{ ability_score: { index: "int" }, bonus: 1 }], racial_traits: [{ index: "elf-weapon-training" }] },
      ]),
    );
    await fs.writeFile(
      path.join(srdDir, "5e-SRD-Spells.json"),
      JSON.stringify([
        { index: "mage-hand", name: "Mage Hand", level: 0, school: { index: "conjuration" }, classes: [{ index: "wizard" }, { index: "sorcerer" }] },
        { index: "magic-missile", name: "Magic Missile", level: 1, school: { index: "evocation" }, classes: [{ index: "wizard" }, { index: "sorcerer" }] },
        { index: "cure-wounds", name: "Cure Wounds", level: 1, school: { index: "evocation" }, classes: [{ index: "cleric" }] },
      ]),
    );

    const dir = await freshCampaign();
    const mgr = await SessionManager.open(dir, { srdDir });

    const opts = creationOptions(mgr.srd());
    const elf = opts.races.find((r) => r.id === "elf");
    expect(elf?.subraces.map((s) => s.id)).toContain("high-elf");
    const wizard = opts.classes.find((c) => c.id === "wizard");
    expect(wizard?.spellList?.cantrips.map((s) => s.id)).toContain("mage-hand");
    expect(wizard?.spellList?.level1.map((s) => s.id)).toContain("magic-missile");
    // cure-wounds is cleric-only, so it must not appear on the wizard list.
    expect(wizard?.spellList?.level1.map((s) => s.id)).not.toContain("cure-wounds");

    const { id } = await createCharacter(
      mgr.campaign,
      {
        name: "Aelar",
        race: "elf",
        subrace: "high-elf",
        class: "wizard",
        abilities: { str: 8, dex: 15, con: 13, int: 14, wis: 12, cha: 10 },
        skills: ["arcana", "history"],
        spells: ["mage-hand", "magic-missile"],
      },
      mgr.srd(),
    );

    const reloaded = await SessionManager.open(dir, { srdDir });
    const actor = reloaded.campaign.actors[id];
    expect(actor!.abilities.dex).toBe(17); // 15 + 2 elf
    expect(actor!.abilities.int).toBe(15); // 14 + 1 high-elf
    expect(actor!.race).toBe("high-elf"); // subrace id stands in for the lineage
    expect(actor!.languages).toEqual(expect.arrayContaining(["common", "elvish"]));
    expect(actor!.features).toEqual(expect.arrayContaining(["darkvision", "elf-weapon-training"]));
    expect(actor!.spells_known).toEqual(["mage-hand", "magic-missile"]);
  });

  it("rejects a spell that is not on the class list when SRD is mounted (#20)", async () => {
    const srdDir = await fs.mkdtemp(path.join(os.tmpdir(), "adm-srd-"));
    tmpRoots.push(srdDir);
    await fs.writeFile(
      path.join(srdDir, "5e-SRD-Spells.json"),
      JSON.stringify([
        { index: "magic-missile", name: "Magic Missile", level: 1, classes: [{ index: "wizard" }] },
        { index: "cure-wounds", name: "Cure Wounds", level: 1, classes: [{ index: "cleric" }] },
      ]),
    );
    const mgr = await SessionManager.open(await freshCampaign(), { srdDir });
    await expect(
      createCharacter(
        mgr.campaign,
        {
          name: "Cheater",
          race: "human",
          class: "wizard",
          abilities: { str: 8, dex: 12, con: 13, int: 15, wis: 10, cha: 10 },
          skills: ["arcana", "history"],
          spells: ["cure-wounds"], // cleric spell, not on the wizard list
        },
        mgr.srd(),
      ),
    ).rejects.toThrow(/mimo seznam/);
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
