import type { CombatState } from "@adm/schemas";
import { rollD20 } from "./dice.js";
import { abilityMod, getActor, log, type GameState } from "./state.js";

function freshBudget(speed: number): CombatState["budget"] {
  return { action: true, bonus: true, reaction: true, movement: speed };
}

/**
 * Ensure every participant has a grid position so the tactical map always
 * renders tokens — even when combat is started ad hoc by the DM (no authored
 * encounter, no positions). Friendly factions line up on the left edge, hostile
 * and neutral on the right; both stack down rows, then step inward. Actors that
 * already have a position (authored spawns / party_start) are left untouched.
 */
function autoPlaceParticipants(
  state: GameState,
  participants: string[],
  grid: { w: number; h: number },
): void {
  const taken = new Set<string>();
  for (const id of participants) {
    const p = state.actors[id]?.position;
    if (p) taken.add(`${p.x},${p.y}`);
  }
  const cellFor = (side: "left" | "right", idx: number) => {
    const inward = Math.floor(idx / grid.h);
    if (side === "left") {
      return { x: Math.min(inward, grid.w - 1), y: idx % grid.h };
    }
    // Start hostiles ~30 ft (6 cells) from the friendly edge instead of at the
    // far wall — keeps combat engaging without wasting rounds just closing distance.
    const hostileStart = Math.min(6, Math.floor(grid.w / 2));
    return { x: Math.min(hostileStart + inward, grid.w - 1), y: idx % grid.h };
  };
  let leftIdx = 0;
  let rightIdx = 0;
  for (const id of participants) {
    const a = state.actors[id];
    if (!a || a.position) continue;
    const friendly = a.faction === "party" || a.faction === "ally";
    let cell = cellFor(friendly ? "left" : "right", friendly ? leftIdx++ : rightIdx++);
    // Skip occupied cells, bounded by the grid size so this always terminates.
    for (let guard = 0; taken.has(`${cell.x},${cell.y}`) && guard < grid.w * grid.h; guard++) {
      cell = cellFor(friendly ? "left" : "right", friendly ? leftIdx++ : rightIdx++);
    }
    a.position = cell;
    taken.add(`${cell.x},${cell.y}`);
  }
}

export interface StartCombatResult {
  order: { actor: string; initiative: number }[];
  round: number;
}

/** Roll initiative for participants and build the turn order (desc, DEX tiebreak). */
export function startCombat(
  state: GameState,
  args: {
    encounter?: string;
    participants: string[];
    grid?: { w: number; h: number; cell_ft: number; shape?: "square" | "hex" };
    /** Optional initial token placement, applied to actor positions. */
    positions?: Record<string, { x: number; y: number }>;
    /** Optional static terrain for the encounter grid. */
    terrain?: { x: number; y: number; kind: string }[];
  },
): StartCombatResult {
  // Place tokens before rolling, so the combat snapshot has positions.
  if (args.positions) {
    for (const [id, pos] of Object.entries(args.positions)) {
      const a = state.actors[id];
      if (a) a.position = { x: pos.x, y: pos.y };
    }
  }
  // Anyone still unplaced gets a sensible default spot so the map isn't empty.
  // A roomier default board makes positioning feel tactical (#39).
  const grid = {
    w: args.grid?.w ?? 16,
    h: args.grid?.h ?? 12,
    cell_ft: args.grid?.cell_ft ?? 5,
    // Explicit arg wins; otherwise fall back to the campaign default (#6b).
    shape: args.grid?.shape ?? state.variant.gridShape ?? "square",
  };
  autoPlaceParticipants(state, args.participants, grid);

  const rolls = args.participants.map((id) => {
    const actor = getActor(state, id);
    const mod = abilityMod(actor.abilities.dex);
    const r = rollD20(state.rng, mod);
    log(state, {
      kind: "initiative",
      actor: id,
      detail: `${actor.name} iniciativa: ${r.detail}`,
      tool: "start_combat",
    });
    return { actor: id, initiative: r.total, dex: actor.abilities.dex };
  });
  rolls.sort((a, b) => b.initiative - a.initiative || b.dex - a.dex);
  const order = rolls.map(({ actor, initiative }) => ({ actor, initiative }));

  const tokens: Record<string, { x: number; y: number }> = {};
  for (const id of args.participants) {
    const a = getActor(state, id);
    if (a.position) tokens[id] = a.position;
  }

  const first = getActor(state, order[0]!.actor);
  state.session.combat = {
    encounter: args.encounter,
    round: 1,
    order,
    turn_index: 0,
    grid,
    tokens,
    terrain: args.terrain ?? [],
    budget: freshBudget(first.speed),
  };
  state.session.active_player = order[0]!.actor;
  log(state, {
    kind: "combat",
    detail: `Boj začíná. Pořadí: ${order.map((o) => `${o.actor}(${o.initiative})`).join(", ")}`,
    tool: "start_combat",
  });
  return { order, round: 1 };
}

export interface NextTurnResult {
  active_actor: string;
  round: number;
}

/** Advance to the next actor in initiative order, incrementing round on wrap. */
export function nextTurn(state: GameState): NextTurnResult {
  const c = state.session.combat;
  if (!c) throw new Error("No active combat");
  c.turn_index += 1;
  if (c.turn_index >= c.order.length) {
    c.turn_index = 0;
    c.round += 1;
    // Tick down timed conditions on round wrap.
    for (const actor of Object.values(state.actors)) {
      actor.conditions = actor.conditions
        .map((cond) =>
          cond.duration === null ? cond : { ...cond, duration: cond.duration - 1 },
        )
        .filter((cond) => cond.duration === null || cond.duration > 0);
    }
  }
  const active = c.order[c.turn_index]!.actor;
  const actor = getActor(state, active);
  c.budget = freshBudget(actor.speed);
  state.session.active_player = active;
  log(state, {
    kind: "turn",
    actor: active,
    detail: `Kolo ${c.round} — na tahu ${actor.name}`,
    tool: "next_turn",
  });
  return { active_actor: active, round: c.round };
}

export function endCombat(state: GameState): void {
  log(state, { kind: "combat", detail: "Boj končí.", tool: "end_combat" });
  state.session.combat = null;
}

/**
 * Remove an actor from the active initiative order (e.g. on death, #23),
 * keeping the turn pointer aimed at the same upcoming actor. Drops their token
 * and ends combat if no one is left in the order.
 */
export function removeFromCombat(state: GameState, actorId: string): void {
  const c = state.session.combat;
  if (!c) return;
  const idx = c.order.findIndex((o) => o.actor === actorId);
  if (idx === -1) return;
  c.order.splice(idx, 1);
  delete c.tokens[actorId];
  if (c.order.length === 0) {
    endCombat(state);
    return;
  }
  // Removing someone before the pointer shifts the upcoming actor down a slot.
  if (idx < c.turn_index) c.turn_index -= 1;
  // Clamp in case the removed actor sat at (or past) the end of the order.
  if (c.turn_index >= c.order.length) c.turn_index = 0;
}
