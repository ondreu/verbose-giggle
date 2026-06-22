import { z } from "zod";
import { AbilityKey, ConditionName } from "@adm/schemas";
import { getActor, log, type GameState } from "./state.js";
import { roll } from "./dice.js";
import { abilityCheck, savingThrow } from "./checks.js";
import {
  applyCondition,
  applyDamage,
  attack,
  deathSave,
  heal,
  removeCondition,
} from "./combat.js";
import { castSpell, concentrationCheck } from "./spells.js";
import { aoe, coverBetween, move, reachableCells } from "./grid.js";
import { endCombat, nextTurn, startCombat } from "./turns.js";
import { longRest, shortRest } from "./rest.js";
import { awardXp, levelUp } from "./leveling.js";

const Advantage = z.enum(["advantage", "disadvantage", "none"]).optional();

/** Action-economy categories an in-combat tool can consume (§8.2). */
export type ActionKind = "action" | "bonus" | "reaction";

/** A tool the LLM may call. `parameters` is a JSON Schema for the provider. */
export interface ToolDef {
  name: string;
  description: string;
  /** Read-only tools don't mutate state (lookup, get_state). */
  readOnly: boolean;
  schema: z.ZodTypeAny;
  parameters: Record<string, unknown>;
  /**
   * Action-economy cost in combat. Resolved per-call so casting can charge an
   * action or a bonus action depending on the spell. Returns `null` when the
   * call is free (e.g. a cantrip declared as a reaction-less free effect).
   */
  cost?: (args: unknown, state: GameState) => { kind: ActionKind; actorId: string } | null;
  handler: (state: GameState, args: unknown) => unknown;
}

/** Authoring helper: keeps `handler` args inferred from `schema`, erases on store. */
function def<S extends z.ZodTypeAny>(d: {
  name: string;
  description: string;
  readOnly: boolean;
  schema: S;
  parameters: Record<string, unknown>;
  cost?: (args: z.infer<S>, state: GameState) => { kind: ActionKind; actorId: string } | null;
  handler: (state: GameState, args: z.infer<S>) => unknown;
}): ToolDef {
  return d as ToolDef;
}

/**
 * Charge the active actor's action-economy budget for a combat action (§8.2).
 * Outside combat there is no budget and everything is free. On the actor's own
 * turn an `action`/`bonus` is required and spent; a creature acting off its turn
 * spends its single `reaction`. Returns an error (and spends nothing) when the
 * required slot is already used, so the caller can refuse the tool.
 */
export function spendEconomy(
  state: GameState,
  actorId: string,
  kind: ActionKind,
): { ok: boolean; error?: string } {
  const c = state.session.combat;
  if (!c || !c.budget) return { ok: true };
  const name = state.actors[actorId]?.name ?? actorId;
  const activeId = c.order[c.turn_index]?.actor;
  const onTurn = actorId === activeId;

  // Off-turn activity is only possible via a reaction (e.g. opportunity attack).
  if (!onTurn || kind === "reaction") {
    if (!c.budget.reaction) {
      return {
        ok: false,
        error: onTurn
          ? `${name} už v tomto kole použil reakci.`
          : `${name} není na tahu a nemá volnou reakci.`,
      };
    }
    c.budget.reaction = false;
    return { ok: true };
  }

  if (kind === "bonus") {
    if (!c.budget.bonus) return { ok: false, error: `${name} už v tomto tahu použil bonusovou akci.` };
    c.budget.bonus = false;
    return { ok: true };
  }
  if (!c.budget.action) return { ok: false, error: `${name} už v tomto tahu provedl akci.` };
  c.budget.action = false;
  return { ok: true };
}

export const TOOLS: ToolDef[] = [
  def({
    name: "roll",
    description: "Roll a dice expression like '2d6+3' or '1d20'. Use for generic rolls only; prefer specific tools for checks/attacks.",
    readOnly: false,
    schema: z.object({ expr: z.string(), advantage: Advantage }),
    parameters: {
      type: "object",
      properties: {
        expr: { type: "string", description: "Dice expression, e.g. '2d6+3'" },
        advantage: { type: "string", enum: ["advantage", "disadvantage", "none"] },
      },
      required: ["expr"],
    },
    handler: (state, args) => {
      const r = roll(args.expr, state.rng);
      log(state, { kind: "roll", detail: `${args.expr}: ${r.detail}`, tool: "roll", result: r });
      return { rolls: r.groups, total: r.total, detail: r.detail };
    },
  }),
  def({
    name: "ability_check",
    description: "Make an ability check or skill check for an actor against a DC.",
    readOnly: false,
    schema: z.object({
      actor: z.string(),
      ability: AbilityKey,
      skill: z.string().optional(),
      dc: z.number().int(),
      advantage: Advantage,
    }),
    parameters: {
      type: "object",
      properties: {
        actor: { type: "string" },
        ability: { type: "string", enum: ["str", "dex", "con", "int", "wis", "cha"] },
        skill: { type: "string" },
        dc: { type: "integer", description: "DC from SRD bands: 5,10,15,20,25,30" },
        advantage: { type: "string", enum: ["advantage", "disadvantage", "none"] },
      },
      required: ["actor", "ability", "dc"],
    },
    handler: (state, args) => abilityCheck(state, args),
  }),
  def({
    name: "saving_throw",
    description: "Roll a saving throw for an actor against a DC.",
    readOnly: false,
    schema: z.object({ actor: z.string(), ability: AbilityKey, dc: z.number().int(), advantage: Advantage }),
    parameters: {
      type: "object",
      properties: {
        actor: { type: "string" },
        ability: { type: "string", enum: ["str", "dex", "con", "int", "wis", "cha"] },
        dc: { type: "integer" },
        advantage: { type: "string", enum: ["advantage", "disadvantage", "none"] },
      },
      required: ["actor", "ability", "dc"],
    },
    handler: (state, args) => savingThrow(state, args),
  }),
  def({
    name: "attack",
    description: "Resolve a weapon attack from attacker against target (to-hit vs AC, damage on hit).",
    readOnly: false,
    schema: z.object({
      attacker: z.string(),
      target: z.string(),
      weapon: z.string().optional(),
      advantage: Advantage,
    }),
    parameters: {
      type: "object",
      properties: {
        attacker: { type: "string" },
        target: { type: "string" },
        weapon: { type: "string", description: "Weapon item id; omit for monster default action" },
        advantage: { type: "string", enum: ["advantage", "disadvantage", "none"] },
      },
      required: ["attacker", "target"],
    },
    cost: (args) => ({ kind: "action", actorId: args.attacker }),
    handler: (state, args) => {
      const res = attack(state, args);
      // Auto-apply damage on hit so the LLM never narrates an unapplied number.
      if (res.hit && res.damage) applyDamage(state, { target: args.target, amount: res.damage, type: res.type });
      return res;
    },
  }),
  def({
    name: "apply_damage",
    description: "Apply raw damage to a target (use when not from a standard attack).",
    readOnly: false,
    schema: z.object({ target: z.string(), amount: z.number().int(), type: z.string().optional() }),
    parameters: {
      type: "object",
      properties: { target: { type: "string" }, amount: { type: "integer" }, type: { type: "string" } },
      required: ["target", "amount"],
    },
    handler: (state, args) => applyDamage(state, args),
  }),
  def({
    name: "heal",
    description: "Restore hit points to a target.",
    readOnly: false,
    schema: z.object({ target: z.string(), amount: z.number().int() }),
    parameters: {
      type: "object",
      properties: { target: { type: "string" }, amount: { type: "integer" } },
      required: ["target", "amount"],
    },
    handler: (state, args) => heal(state, args),
  }),
  def({
    name: "cast_spell",
    description: "Cast a spell: consumes a slot, resolves attacks/saves and damage/healing.",
    readOnly: false,
    schema: z.object({
      caster: z.string(),
      spell: z.string(),
      slot_level: z.number().int().min(0).max(9).default(0),
      targets: z.array(z.string()).optional(),
      advantage: Advantage,
    }),
    parameters: {
      type: "object",
      properties: {
        caster: { type: "string" },
        spell: { type: "string", description: "SRD spell id" },
        slot_level: { type: "integer", minimum: 0, maximum: 9 },
        targets: { type: "array", items: { type: "string" } },
        advantage: { type: "string", enum: ["advantage", "disadvantage", "none"] },
      },
      required: ["caster", "spell"],
    },
    cost: (args, state) => {
      // Casting time decides the slot: "1 bonus action" / "1 reaction" / action.
      const ct = (state.srd.spell(args.spell)?.casting_time ?? "1 action").toLowerCase();
      const kind: ActionKind = ct.includes("bonus")
        ? "bonus"
        : ct.includes("reaction")
          ? "reaction"
          : "action";
      return { kind, actorId: args.caster };
    },
    handler: (state, args) => castSpell(state, args),
  }),
  def({
    name: "apply_condition",
    description: "Apply a condition to a target.",
    readOnly: false,
    schema: z.object({
      target: z.string(),
      condition: ConditionName,
      source: z.string().optional(),
      duration: z.number().int().nullable().optional(),
    }),
    parameters: {
      type: "object",
      properties: {
        target: { type: "string" },
        condition: { type: "string" },
        source: { type: "string" },
        duration: { type: "integer", description: "rounds; omit for indefinite" },
      },
      required: ["target", "condition"],
    },
    handler: (state, args) => applyCondition(state, args),
  }),
  def({
    name: "remove_condition",
    description: "Remove a condition from a target.",
    readOnly: false,
    schema: z.object({ target: z.string(), condition: ConditionName }),
    parameters: {
      type: "object",
      properties: { target: { type: "string" }, condition: { type: "string" } },
      required: ["target", "condition"],
    },
    handler: (state, args) => removeCondition(state, args),
  }),
  def({
    name: "concentration_check",
    description: "Force a CON save to maintain concentration after a caster takes damage.",
    readOnly: false,
    schema: z.object({ actor: z.string(), damage: z.number().int() }),
    parameters: {
      type: "object",
      properties: { actor: { type: "string" }, damage: { type: "integer" } },
      required: ["actor", "damage"],
    },
    handler: (state, args) => concentrationCheck(state, args),
  }),
  def({
    name: "start_combat",
    description: "Roll initiative and begin combat for the given participants.",
    readOnly: false,
    schema: z.object({
      encounter: z.string().optional(),
      participants: z.array(z.string()).min(1),
      grid: z
        .object({ w: z.number().int(), h: z.number().int(), cell_ft: z.number().int() })
        .optional(),
      positions: z
        .record(z.string(), z.object({ x: z.number().int(), y: z.number().int() }))
        .optional(),
      terrain: z
        .array(z.object({ x: z.number().int(), y: z.number().int(), kind: z.string() }))
        .optional(),
    }),
    parameters: {
      type: "object",
      properties: {
        encounter: { type: "string" },
        participants: { type: "array", items: { type: "string" } },
      },
      required: ["participants"],
    },
    handler: (state, args) => startCombat(state, args),
  }),
  def({
    name: "next_turn",
    description: "Advance to the next actor in initiative order.",
    readOnly: false,
    schema: z.object({}),
    parameters: { type: "object", properties: {} },
    handler: (state) => nextTurn(state),
  }),
  def({
    name: "end_combat",
    description: "End the current combat encounter.",
    readOnly: false,
    schema: z.object({}),
    parameters: { type: "object", properties: {} },
    handler: (state) => {
      endCombat(state);
      return { ok: true };
    },
  }),
  def({
    name: "move",
    description: "Move an actor's token to a grid cell; validated against speed and terrain.",
    readOnly: false,
    schema: z.object({ actor: z.string(), to: z.object({ x: z.number().int(), y: z.number().int() }) }),
    parameters: {
      type: "object",
      properties: {
        actor: { type: "string" },
        to: {
          type: "object",
          properties: { x: { type: "integer" }, y: { type: "integer" } },
          required: ["x", "y"],
        },
      },
      required: ["actor", "to"],
    },
    handler: (state, args) => move(state, args),
  }),
  def({
    name: "death_save",
    description: "Roll a death saving throw for a downed actor (DC 10 flat d20).",
    readOnly: false,
    schema: z.object({ actor: z.string() }),
    parameters: { type: "object", properties: { actor: { type: "string" } }, required: ["actor"] },
    handler: (state, args) => deathSave(state, args),
  }),
  def({
    name: "cover",
    description: "Read-only: cover and line-of-sight between two actors (terrain-based).",
    readOnly: true,
    schema: z.object({ attacker: z.string(), target: z.string() }),
    parameters: {
      type: "object",
      properties: { attacker: { type: "string" }, target: { type: "string" } },
      required: ["attacker", "target"],
    },
    handler: (state, args) => {
      const c = state.session.combat;
      const a = getActor(state, args.attacker);
      const t = getActor(state, args.target);
      const from = c?.tokens[args.attacker] ?? a.position;
      const to = c?.tokens[args.target] ?? t.position;
      if (!from || !to) return { cover: "none", acBonus: 0, clearLineOfSight: true };
      return coverBetween(state, from, to);
    },
  }),
  def({
    name: "reachable",
    description: "Read-only: cells an actor can reach this turn within its movement budget.",
    readOnly: true,
    schema: z.object({ actor: z.string() }),
    parameters: { type: "object", properties: { actor: { type: "string" } }, required: ["actor"] },
    handler: (state, args) => reachableCells(state, args),
  }),
  def({
    name: "aoe",
    description: "Compute the cells and tokens covered by an area-of-effect template.",
    readOnly: false,
    schema: z.object({
      shape: z.enum(["sphere", "cube", "cone", "line"]),
      origin: z.object({ x: z.number().int(), y: z.number().int() }),
      size: z.number().int(),
      direction: z.object({ x: z.number().int(), y: z.number().int() }).optional(),
    }),
    parameters: {
      type: "object",
      properties: {
        shape: { type: "string", enum: ["sphere", "cube", "cone", "line"] },
        origin: { type: "object", properties: { x: { type: "integer" }, y: { type: "integer" } } },
        size: { type: "integer", description: "radius/length in feet" },
        direction: { type: "object", properties: { x: { type: "integer" }, y: { type: "integer" } } },
      },
      required: ["shape", "origin", "size"],
    },
    handler: (state, args) => aoe(state, args),
  }),
  def({
    name: "short_rest",
    description: "Resolve a short rest; actors may spend hit dice to heal.",
    readOnly: false,
    schema: z.object({ actors: z.array(z.string()), spend: z.record(z.string(), z.number().int()).optional() }),
    parameters: {
      type: "object",
      properties: { actors: { type: "array", items: { type: "string" } } },
      required: ["actors"],
    },
    handler: (state, args) => shortRest(state, args),
  }),
  def({
    name: "long_rest",
    description: "Resolve a long rest; restore HP, spell slots, and hit dice.",
    readOnly: false,
    schema: z.object({ actors: z.array(z.string()) }),
    parameters: {
      type: "object",
      properties: { actors: { type: "array", items: { type: "string" } } },
      required: ["actors"],
    },
    handler: (state, args) => longRest(state, args),
  }),
  def({
    name: "award_xp",
    description: "Award XP to actors and auto-level them across any thresholds crossed.",
    readOnly: false,
    schema: z.object({ actors: z.array(z.string()).min(1), amount: z.number().int() }),
    parameters: {
      type: "object",
      properties: { actors: { type: "array", items: { type: "string" } }, amount: { type: "integer" } },
      required: ["actors", "amount"],
    },
    handler: (state, args) => awardXp(state, args),
  }),
  def({
    name: "level_up",
    description: "Apply a single level-up to an actor (HP, proficiency, slots).",
    readOnly: false,
    schema: z.object({ actor: z.string() }),
    parameters: { type: "object", properties: { actor: { type: "string" } }, required: ["actor"] },
    handler: (state, args) => levelUp(state, args),
  }),
  def({
    name: "update_sheet",
    description: "Write durable changes to an actor (xp, inventory, etc.). Patch is shallow-merged.",
    readOnly: false,
    schema: z.object({ actor: z.string(), patch: z.record(z.string(), z.unknown()) }),
    parameters: {
      type: "object",
      properties: { actor: { type: "string" }, patch: { type: "object" } },
      required: ["actor", "patch"],
    },
    handler: (state, args) => {
      const actor = getActor(state, args.actor);
      Object.assign(actor, args.patch);
      log(state, { kind: "sheet", actor: args.actor, detail: `${actor.name} — list aktualizován`, tool: "update_sheet" });
      return { ok: true };
    },
  }),
  def({
    name: "give_item",
    description: "Add an item to an actor's inventory.",
    readOnly: false,
    schema: z.object({ actor: z.string(), item: z.string(), qty: z.number().int().positive().default(1) }),
    parameters: {
      type: "object",
      properties: { actor: { type: "string" }, item: { type: "string" }, qty: { type: "integer" } },
      required: ["actor", "item"],
    },
    handler: (state, args) => {
      const actor = getActor(state, args.actor);
      const existing = actor.inventory.find((i) => i.id === args.item);
      if (existing) existing.qty += args.qty;
      else actor.inventory.push({ id: args.item, qty: args.qty });
      log(state, { kind: "item", actor: args.actor, detail: `${actor.name} získává ${args.qty}× ${args.item}`, tool: "give_item" });
      return { inventory: actor.inventory };
    },
  }),
  def({
    name: "remove_item",
    description: "Remove (or decrement) an item from an actor's inventory.",
    readOnly: false,
    schema: z.object({ actor: z.string(), item: z.string(), qty: z.number().int().positive().default(1) }),
    parameters: {
      type: "object",
      properties: { actor: { type: "string" }, item: { type: "string" }, qty: { type: "integer" } },
      required: ["actor", "item"],
    },
    handler: (state, args) => {
      const actor = getActor(state, args.actor);
      const existing = actor.inventory.find((i) => i.id === args.item);
      if (existing) {
        existing.qty -= args.qty;
        if (existing.qty <= 0) actor.inventory = actor.inventory.filter((i) => i.id !== args.item);
      }
      log(state, { kind: "item", actor: args.actor, detail: `${actor.name} ztrácí ${args.qty}× ${args.item}`, tool: "remove_item" });
      return { inventory: actor.inventory };
    },
  }),
  def({
    name: "equip_item",
    description: "Toggle the equipped state of an item in an actor's inventory.",
    readOnly: false,
    schema: z.object({ actor: z.string(), item: z.string(), equipped: z.boolean().default(true) }),
    parameters: {
      type: "object",
      properties: { actor: { type: "string" }, item: { type: "string" }, equipped: { type: "boolean" } },
      required: ["actor", "item"],
    },
    handler: (state, args) => {
      const actor = getActor(state, args.actor);
      const entry = actor.inventory.find((i) => i.id === args.item);
      if (entry) entry.equipped = args.equipped;
      return { inventory: actor.inventory };
    },
  }),
  def({
    name: "travel",
    description: "Resolve a point-crawl travel edge to a connected location.",
    readOnly: false,
    schema: z.object({ to: z.string() }),
    parameters: { type: "object", properties: { to: { type: "string" } }, required: ["to"] },
    handler: (state, args) => {
      state.session.current_location = args.to;
      if (!state.session.revealed_locations.includes(args.to)) {
        state.session.revealed_locations.push(args.to);
      }
      log(state, { kind: "travel", detail: `Party travels to ${args.to}`, tool: "travel" });
      return { arrived: args.to };
    },
  }),
  def({
    name: "show_location",
    description: "Focus the overworld camera on a location and reveal it (fog of war).",
    readOnly: false,
    schema: z.object({ id: z.string() }),
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: (state, args) => {
      if (!state.session.revealed_locations.includes(args.id)) {
        state.session.revealed_locations.push(args.id);
      }
      return { focus: args.id };
    },
  }),
  def({
    name: "set_active_player",
    description: "Set the hotseat active-player pointer.",
    readOnly: false,
    schema: z.object({ actor: z.string() }),
    parameters: { type: "object", properties: { actor: { type: "string" } }, required: ["actor"] },
    handler: (state, args) => {
      state.session.active_player = args.actor;
      return { active_player: args.actor };
    },
  }),
  def({
    name: "lookup",
    description: "Read-only: fetch SRD or vault entity data to ground narration (never invent stats).",
    readOnly: true,
    schema: z.object({ kind: z.enum(["monster", "spell", "equipment", "actor"]), id: z.string() }),
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["monster", "spell", "equipment", "actor"] },
        id: { type: "string" },
      },
      required: ["kind", "id"],
    },
    handler: (state, args) => {
      switch (args.kind) {
        case "monster":
          return state.srd.monster(args.id) ?? { error: "not found" };
        case "spell":
          return state.srd.spell(args.id) ?? { error: "not found" };
        case "equipment":
          return state.srd.equipment(args.id) ?? { error: "not found" };
        case "actor":
          return state.actors[args.id] ?? { error: "not found" };
      }
    },
  }),
  def({
    name: "get_state",
    description: "Read-only: snapshot of the current scene/combat for grounding.",
    readOnly: true,
    schema: z.object({ scope: z.enum(["scene", "combat", "actors"]).optional() }),
    parameters: {
      type: "object",
      properties: { scope: { type: "string", enum: ["scene", "combat", "actors"] } },
    },
    handler: (state, args) => {
      const s = state.session;
      if (args.scope === "combat") return s.combat ?? { combat: null };
      if (args.scope === "actors") {
        return Object.fromEntries(
          Object.entries(state.actors).map(([id, a]) => [
            id,
            { name: a.name, hp: a.hp, ac: a.ac, faction: a.faction, conditions: a.conditions, position: a.position },
          ]),
        );
      }
      return {
        current_location: s.current_location,
        time: s.time,
        active_player: s.active_player,
        in_combat: s.combat !== null,
        round: s.combat?.round,
      };
    },
  }),
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export interface DispatchResult {
  name: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Validate args with the tool's zod schema and execute it against the engine.
 * This is the ONLY path by which the LLM can affect game state (§9.2).
 */
export function dispatch(state: GameState, name: string, rawArgs: unknown): DispatchResult {
  const tool = TOOL_MAP.get(name);
  if (!tool) return { name, ok: false, error: `Unknown tool: ${name}` };
  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { name, ok: false, error: `Invalid args: ${parsed.error.message}` };
  }
  // Enforce the action-economy budget before mutating state (§8.2): a refused
  // action spends nothing, and the refusal is logged so it's visible/auditable.
  if (tool.cost) {
    const cost = tool.cost(parsed.data, state);
    if (cost) {
      const spent = spendEconomy(state, cost.actorId, cost.kind);
      if (!spent.ok) {
        log(state, {
          kind: "economy",
          actor: cost.actorId,
          detail: spent.error ?? "Akce není v tomto tahu k dispozici.",
          tool: name,
        });
        return { name, ok: false, error: spent.error };
      }
    }
  }
  try {
    const result = tool.handler(state, parsed.data);
    return { name, ok: true, result };
  } catch (err) {
    return { name, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** OpenAI-compatible tool definitions to register with the LLM. */
export function toolSpecs(): {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}[] {
  return TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}
