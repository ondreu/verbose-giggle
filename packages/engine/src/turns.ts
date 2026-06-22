import type { CombatState } from "@adm/schemas";
import { rollD20 } from "./dice.js";
import { abilityMod, getActor, log, type GameState } from "./state.js";

function freshBudget(speed: number): CombatState["budget"] {
  return { action: true, bonus: true, reaction: true, movement: speed };
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
    grid?: { w: number; h: number; cell_ft: number };
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
    grid: args.grid ?? { w: 12, h: 10, cell_ft: 5 },
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
