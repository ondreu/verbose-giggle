import type { CombatState } from "@adm/schemas";
import { rollD20 } from "./dice.js";
import { abilityMod, getActor, log, type GameState } from "./state.js";

function freshBudget(speed: number): CombatState["budget"] {
  return { action: true, bonus: true, reaction: true, movement: speed };
}

/**
 * Ensure every participant has a grid position so the tactical map always
 * renders tokens — even when combat is started ad hoc by the DM (no authored
 * encounter, no positions). Rather than dumping the two sides into opposite
 * corners (#5 — far apart and visually marooned), place them as two facing
 * lines straddling the board centre: friendly just left of centre, hostile just
 * right, both vertically centred. The default gap is a couple of cells so melee
 * is one step away, not a board-length march. Columns step further out only when
 * a side has more combatants than fit in one column. Actors that already have a
 * position (authored spawns / party_start) are left untouched.
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
  const midX = Math.floor(grid.w / 2);
  // The two front lines sit one cell either side of centre (≈10 ft apart on a
  // 5 ft grid), clamped so a tiny board still places both sides on the map.
  const frontFor = (side: "left" | "right") =>
    side === "left" ? Math.max(0, midX - 1) : Math.min(grid.w - 1, midX + 1);
  const clampX = (x: number) => Math.max(0, Math.min(grid.w - 1, x));

  const place = (ids: string[], side: "left" | "right") => {
    if (ids.length === 0) return;
    const front = frontFor(side);
    const step = side === "left" ? -1 : 1; // extra ranks fall back behind the line
    // Vertically centre the column so combat starts mid-board, not at the top.
    const startRow = Math.max(0, Math.floor((grid.h - Math.min(ids.length, grid.h)) / 2));
    ids.forEach((id, idx) => {
      const a = state.actors[id];
      if (!a) return;
      const col = Math.floor(idx / grid.h);
      const x = clampX(front + step * col);
      let y = (startRow + (idx % grid.h)) % grid.h;
      let cell = { x, y };
      // Walk down rows to find a free cell, bounded so this always terminates.
      for (let guard = 0; taken.has(`${cell.x},${cell.y}`) && guard < grid.w * grid.h; guard++) {
        y = (y + 1) % grid.h;
        cell = { x, y };
      }
      a.position = cell;
      taken.add(`${cell.x},${cell.y}`);
    });
  };

  const left: string[] = [];
  const right: string[] = [];
  for (const id of participants) {
    const a = state.actors[id];
    if (!a || a.position) continue;
    const friendly = a.faction === "party" || a.faction === "ally";
    (friendly ? left : right).push(id);
  }
  place(left, "left");
  place(right, "right");
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
