import type { Actor, SessionState } from "@adm/schemas";
import { createSrdIndex, type SrdOverrides } from "@adm/srd";
import { makeRng, type GameState } from "../src/index.js";
import { FIXTURE_OVERRIDES } from "./srd-fixtures.js";

export function makeActor(over: Partial<Actor> & { id: string; name: string }): Actor {
  return {
    type: "character",
    controller: "human",
    faction: "party",
    level: 3,
    xp: 0,
    abilities: { str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 },
    proficiency_bonus: 2,
    proficiencies: { saves: ["str", "con"], skills: ["athletics"], weapons: [], armor: [] },
    hp: { max: 28, current: 28, temp: 0 },
    ac: 16,
    speed: 30,
    spell_slots: {},
    spells_known: [],
    languages: [],
    features: [],
    feats: [],
    conditions: [],
    concentration: null,
    inventory: [],
    attunement: [],
    death_saves: { success: 0, fail: 0 },
    position: null,
    srd_ref: null,
    ai_profile: null,
    ...over,
  } as Actor;
}

export function makeState(
  actors: Actor[],
  seed: string | number = "test-seed",
  srdOverrides?: SrdOverrides,
): GameState {
  const actorMap = Object.fromEntries(actors.map((a) => [a.id, a]));
  const session: SessionState = {
    campaign: "test",
    current_location: "start",
    revealed_locations: ["start"],
    time: { day: 1, hour: 8 },
    active_player: actors[0]?.id ?? null,
    camp: [],
    actors: {},
    combat: null,
    log: [],
    chat: [],
    quests: {},
    factions: {},
    world_events: {},
    location_danger: {},
    ending: null,
  };
  // Default to the inline fixture subset (goblin/spells/weapons) so tests that
  // don't supply their own SRD data still resolve those ids; per-test overrides
  // merge on top per id (an override entry wins, fixtures stay otherwise).
  const overrides: SrdOverrides = {
    monsters: { ...FIXTURE_OVERRIDES.monsters, ...srdOverrides?.monsters },
    spells: { ...FIXTURE_OVERRIDES.spells, ...srdOverrides?.spells },
    equipment: { ...FIXTURE_OVERRIDES.equipment, ...srdOverrides?.equipment },
    races: srdOverrides?.races,
    subraces: srdOverrides?.subraces,
    classes: srdOverrides?.classes,
    subclasses: srdOverrides?.subclasses,
    features: srdOverrides?.features,
    traits: srdOverrides?.traits,
    feats: srdOverrides?.feats,
    magicItems: srdOverrides?.magicItems,
    proficiencies: srdOverrides?.proficiencies,
    languages: srdOverrides?.languages,
  };
  return {
    actors: actorMap,
    session,
    srd: createSrdIndex(overrides),
    rng: makeRng(seed),
    variant: { flanking: false, diagonals: "5-5-5", gridShape: "square" },
  };
}
