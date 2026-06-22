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
    expect(out.equipment.greataxe?.damage).toBe("1d12");
  });

  it("returns empty maps for a missing directory", async () => {
    const out = await loadSrdDataset("/no/such/dir");
    expect(Object.keys(out.monsters)).toHaveLength(0);
  });
});
