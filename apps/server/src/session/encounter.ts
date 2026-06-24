import type { GameState } from "@adm/engine";
import type { SessionManager } from "./manager.js";

export interface EncounterStartResult {
  ok: boolean;
  error?: string;
  participants?: string[];
}

/**
 * Instantiate an authored encounter into live combat (§6.3, §15): place the
 * party at `party_start`, place each spawn at its cell, carry the grid + static
 * terrain, then start combat via the engine. Token placement and terrain are
 * passed to `start_combat`; the engine still rolls initiative deterministically.
 */
export async function startEncounter(
  manager: SessionManager,
  gs: GameState,
  encounterId: string,
): Promise<EncounterStartResult> {
  const enc = manager.campaign.encounters[encounterId];
  if (!enc) return { ok: false, error: `Unknown encounter: ${encounterId}` };

  const positions: Record<string, { x: number; y: number }> = {};

  // Party + companions present in the campaign, placed at party_start cells.
  // Members resting in camp sit the fight out (party-roster management).
  const camped = new Set(manager.session.camp ?? []);
  const partyIds = [...manager.campaign.config.party, ...manager.campaign.config.companions].filter(
    (id) => manager.campaign.actors[id] && !camped.has(id),
  );
  partyIds.forEach((id, i) => {
    const cell = enc.party_start[i] ?? enc.party_start[enc.party_start.length - 1];
    if (cell) positions[id] = { x: cell.x, y: cell.y };
  });

  // Spawns reference existing bestiary actors by id.
  const spawnIds: string[] = [];
  for (const spawn of enc.spawns) {
    if (manager.campaign.actors[spawn.ref]) {
      positions[spawn.ref] = { x: spawn.at.x, y: spawn.at.y };
      spawnIds.push(spawn.ref);
    }
  }

  const participants = [...partyIds, ...spawnIds];
  if (participants.length === 0) return { ok: false, error: "No placeable participants" };

  const result = await manager.applyTool(gs, "start_combat", {
    encounter: enc.id,
    participants,
    grid: enc.grid,
    positions,
    terrain: enc.terrain,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, participants };
}
