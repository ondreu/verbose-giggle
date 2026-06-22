import { describe, expect, it } from "vitest";
import { ActorSchema, CampaignSchema, EncounterSchema, LocationSchema } from "../src/index.js";

describe("actor schema", () => {
  it("parses a full character and preserves unknown fields", () => {
    const raw = {
      type: "character",
      id: "thorin",
      name: "Thorin",
      controller: "human",
      faction: "party",
      race: "mountain-dwarf",
      class: "fighter",
      level: 3,
      abilities: { str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 },
      hp: { max: 28, current: 28, temp: 0 },
      ac: 18,
      homebrew_note: "keep me", // unknown field must survive
    };
    const parsed = ActorSchema.parse(raw);
    expect(parsed.name).toBe("Thorin");
    expect((parsed as Record<string, unknown>).homebrew_note).toBe("keep me");
    expect(parsed.proficiency_bonus).toBe(2); // default applied
  });

  it("rejects an invalid slug id", () => {
    const r = ActorSchema.safeParse({
      type: "character",
      id: "Not A Slug",
      name: "x",
      controller: "human",
      faction: "party",
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      hp: { max: 1, current: 1 },
      ac: 10,
    });
    expect(r.success).toBe(false);
  });
});

describe("world schemas", () => {
  it("location coords must be 0..1 ratios", () => {
    const ok = LocationSchema.safeParse({
      type: "location",
      id: "rozcesti",
      name: "Rozcestí",
      kind: "landmark",
      coords: { x: 0.42, y: 0.55 },
    });
    expect(ok.success).toBe(true);
    const bad = LocationSchema.safeParse({
      type: "location",
      id: "x",
      name: "X",
      kind: "city",
      coords: { x: 42, y: 0.5 },
    });
    expect(bad.success).toBe(false);
  });

  it("encounter and campaign parse with defaults", () => {
    const enc = EncounterSchema.parse({
      type: "encounter",
      id: "mill-ambush",
      name: "Ambush",
      grid: { w: 12, h: 10 },
    });
    expect(enc.grid.cell_ft).toBe(5);
    const camp = CampaignSchema.parse({
      type: "campaign",
      name: "Velen",
      starting_location: "rozcesti",
    });
    expect(camp.variant_rules.diagonals).toBe("5-5-5");
  });
});
