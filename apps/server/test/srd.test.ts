import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadSrdDataset } from "../src/srd/load.js";

const tmpDirs: string[] = [];
afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("SRD dataset loader (5e-bits/5e-database shape)", () => {
  it("maps monster/spell/equipment records tolerantly", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "srd-"));
    tmpDirs.push(dir);
    await fs.writeFile(
      path.join(dir, "5e-SRD-Monsters.json"),
      JSON.stringify([
        {
          index: "orc",
          name: "Orc",
          armor_class: [{ value: 13 }],
          hit_points: 15,
          hit_dice: "2d8",
          speed: { walk: "30 ft." },
          strength: 16,
          dexterity: 12,
          constitution: 16,
          intelligence: 7,
          wisdom: 11,
          charisma: 10,
          challenge_rating: 0.5,
          damage_resistances: [],
          actions: [
            { name: "Greataxe", attack_bonus: 5, damage: [{ damage_dice: "1d12+3", damage_type: { index: "slashing" } }] },
          ],
        },
      ]),
    );
    await fs.writeFile(
      path.join(dir, "5e-SRD-Spells.json"),
      JSON.stringify([
        { index: "fireball", name: "Fireball", level: 3, school: { index: "evocation" }, concentration: false, range: "150 feet", damage: { damage_type: { index: "fire" } }, dc: { dc_type: { index: "dexterity" } } },
      ]),
    );
    await fs.writeFile(
      path.join(dir, "5e-SRD-Equipment.json"),
      JSON.stringify([
        { index: "greataxe", name: "Greataxe", equipment_category: { index: "weapon" }, weight: 7, damage: { damage_dice: "1d12", damage_type: { index: "slashing" } }, properties: [{ index: "heavy" }] },
      ]),
    );

    const out = await loadSrdDataset(dir);
    expect(out.monsters.orc?.ac).toBe(13);
    expect(out.monsters.orc?.abilities.str).toBe(16);
    expect(out.monsters.orc?.actions[0]?.damage).toBe("1d12+3");
    expect(out.spells.fireball?.level).toBe(3);
    expect(out.spells.fireball?.save?.ability).toBe("dex");
    expect(out.spells.fireball?.range_ft).toBe(150);
    expect(out.spells.fireball?.classes ?? []).toEqual([]); // none tagged here
    expect(out.equipment.greataxe?.damage).toBe("1d12");
  });

  it("returns empty maps for a missing directory", async () => {
    const out = await loadSrdDataset("/no/such/dir");
    expect(Object.keys(out.monsters)).toHaveLength(0);
    expect(Object.keys(out.races)).toHaveLength(0);
    expect(Object.keys(out.classes)).toHaveLength(0);
  });

  it("loads races, classes, subclasses, feats, magic items, profs and languages (#20)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "srd-"));
    tmpDirs.push(dir);
    await fs.writeFile(
      path.join(dir, "5e-SRD-Races.json"),
      JSON.stringify([
        {
          index: "dwarf",
          name: "Dwarf",
          speed: 25,
          size: "Medium",
          ability_bonuses: [{ ability_score: { index: "con" }, bonus: 2 }],
          languages: [{ index: "common" }, { index: "dwarvish" }],
          traits: [{ index: "darkvision" }],
          subraces: [{ index: "hill-dwarf" }],
        },
      ]),
    );
    await fs.writeFile(
      path.join(dir, "5e-SRD-Subraces.json"),
      JSON.stringify([
        {
          index: "hill-dwarf",
          name: "Hill Dwarf",
          race: { index: "dwarf" },
          ability_bonuses: [{ ability_score: { index: "wis" }, bonus: 1 }],
          racial_traits: [{ index: "dwarven-toughness" }],
        },
      ]),
    );
    await fs.writeFile(
      path.join(dir, "5e-SRD-Classes.json"),
      JSON.stringify([
        {
          index: "wizard",
          name: "Wizard",
          hit_die: 6,
          saving_throws: [{ index: "int" }, { index: "wis" }],
          proficiencies: [{ index: "daggers" }],
          spellcasting: { spellcasting_ability: { index: "int" } },
          subclasses: [{ index: "evocation" }],
        },
      ]),
    );
    await fs.writeFile(
      path.join(dir, "5e-SRD-Subclasses.json"),
      JSON.stringify([
        { index: "evocation", name: "Evocation", class: { index: "wizard" }, subclass_flavor: "Arcane Tradition", desc: ["Sculpt spells."] },
      ]),
    );
    await fs.writeFile(
      path.join(dir, "5e-SRD-Features.json"),
      JSON.stringify([
        { index: "sculpt-spells", name: "Sculpt Spells", level: 2, class: { index: "wizard" }, subclass: { index: "evocation" }, desc: ["..."] },
      ]),
    );
    await fs.writeFile(
      path.join(dir, "5e-SRD-Traits.json"),
      JSON.stringify([
        { index: "darkvision", name: "Darkvision", races: [{ index: "dwarf" }], desc: ["See in the dark."] },
      ]),
    );
    await fs.writeFile(
      path.join(dir, "5e-SRD-Feats.json"),
      JSON.stringify([
        { index: "grappler", name: "Grappler", prerequisites: [{ ability_score: { index: "str" }, minimum_score: 13 }], desc: ["..."] },
      ]),
    );
    await fs.writeFile(
      path.join(dir, "5e-SRD-Magic-Items.json"),
      JSON.stringify([
        { index: "adamantine-armor", name: "Adamantine Armor", equipment_category: { index: "armor" }, rarity: { name: "Uncommon" }, desc: ["..."] },
      ]),
    );
    await fs.writeFile(
      path.join(dir, "5e-SRD-Proficiencies.json"),
      JSON.stringify([
        { index: "skill-arcana", name: "Skill: Arcana", type: "Skills", classes: [{ index: "wizard" }], races: [] },
      ]),
    );
    await fs.writeFile(
      path.join(dir, "5e-SRD-Languages.json"),
      JSON.stringify([
        { index: "dwarvish", name: "Dwarvish", type: "Standard", typical_speakers: ["Dwarves"], script: "Dwarvish" },
      ]),
    );

    const out = await loadSrdDataset(dir);
    expect(out.races.dwarf?.speed).toBe(25);
    expect(out.races.dwarf?.ability_bonuses.con).toBe(2);
    expect(out.races.dwarf?.subraces).toContain("hill-dwarf");
    expect(out.subraces["hill-dwarf"]?.race).toBe("dwarf");
    expect(out.subraces["hill-dwarf"]?.ability_bonuses.wis).toBe(1);
    expect(out.classes.wizard?.hit_die).toBe(6);
    expect(out.classes.wizard?.saving_throws).toEqual(["int", "wis"]);
    expect(out.classes.wizard?.spellcasting_ability).toBe("int");
    expect(out.subclasses.evocation?.class).toBe("wizard");
    expect(out.features["sculpt-spells"]?.level).toBe(2);
    expect(out.traits.darkvision?.races).toContain("dwarf");
    expect(out.feats.grappler?.prerequisites).toContain("str 13");
    expect(out.magicItems["adamantine-armor"]?.rarity).toBe("Uncommon");
    expect(out.proficiencies["skill-arcana"]?.type).toBe("Skills");
    expect(out.languages.dwarvish?.script).toBe("Dwarvish");
  });

  it("matches filenames specifically, ignoring lookalikes (#20)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "srd-"));
    tmpDirs.push(dir);
    // Real Feats vs the Features lookalike, real Spells vs Spellcasting,
    // real Equipment vs Equipment-Categories, real Races vs Subraces.
    await fs.writeFile(path.join(dir, "5e-SRD-Feats.json"), JSON.stringify([{ index: "alert", name: "Alert" }]));
    await fs.writeFile(path.join(dir, "5e-SRD-Features.json"), JSON.stringify([{ index: "rage", name: "Rage", class: { index: "barbarian" } }]));
    await fs.writeFile(path.join(dir, "5e-SRD-Spellcasting.json"), JSON.stringify([{ index: "spellcasting-wizard", name: "Spellcasting" }]));
    await fs.writeFile(path.join(dir, "5e-SRD-Equipment-Categories.json"), JSON.stringify([{ index: "armor", name: "Armor" }]));

    const out = await loadSrdDataset(dir);
    // Feats and Features land in their own buckets, not mixed.
    expect(out.feats.alert).toBeTruthy();
    expect(out.feats.rage).toBeUndefined();
    expect(out.features.rage).toBeTruthy();
    expect(out.features.alert).toBeUndefined();
    // Spellcasting must not be treated as a spell; Equipment-Categories not equipment.
    expect(out.spells["spellcasting-wizard"]).toBeUndefined();
    expect(out.equipment.armor).toBeUndefined();
  });
});
