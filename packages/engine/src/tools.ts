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
import { advanceTime } from "./time.js";
import { applyAbilityIncrease, awardXp, chooseSubclass, grantFeats, learnSpells, levelUp } from "./leveling.js";
import { advanceQuest, completeQuest, failQuest, startQuest } from "./quests.js";
import { advanceFaction, setFactionRelation, setLocationDanger, triggerWorldEvent } from "./world.js";

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

  // Off-turn activity: only reactions (opportunity attacks etc.) are permitted.
  // An action or bonus action off-turn would let a wrong character act on another's turn.
  if (!onTurn) {
    if (kind !== "reaction") {
      // Name the actor who IS on turn (with id) so the caller can self-correct:
      // a hotseat mix-up (acting as the protagonist when a second PC is up) is
      // fixed by re-issuing the tool with the active actor's id.
      const activeName = (activeId && state.actors[activeId]?.name) || activeId || "—";
      return {
        ok: false,
        error:
          `${name} není na tahu — na tahu je ${activeName} (${activeId ?? "—"}). ` +
          `Jde-li o akci aktivního hráče, zopakuj nástroj s id „${activeId ?? ""}" ` +
          `(attacker/caster/actor). Mimo své kolo lze provést jen reakci (reaction:true).`,
      };
    }
    if (!c.budget.reaction) {
      return { ok: false, error: `${name} nemá volnou reakci v tomto kole.` };
    }
    c.budget.reaction = false;
    return { ok: true };
  }

  // On own turn: action / bonus / reaction each use their respective slot.
  if (kind === "reaction") {
    if (!c.budget.reaction) return { ok: false, error: `${name} už v tomto kole použil reakci.` };
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

/**
 * Give a previously spent action-economy slot back (§8.2). Used when a charged
 * tool turns out to be a no-op — e.g. an attack on a target out of range, or a
 * spell the caster can't actually cast. The action was never taken, so burning
 * the slot would strand the actor (it would move into range and then be unable
 * to attack). Mirror of `spendEconomy`; safe to call outside combat (no-op).
 */
export function refundEconomy(state: GameState, actorId: string, kind: ActionKind): void {
  const c = state.session.combat;
  if (!c || !c.budget) return;
  const activeId = c.order[c.turn_index]?.actor;
  // Off-turn activity only ever spends a reaction; refund that.
  if (actorId !== activeId || kind === "reaction") {
    c.budget.reaction = true;
    return;
  }
  if (kind === "bonus") c.budget.bonus = true;
  else c.budget.action = true;
}

/**
 * A handler result counts as a "no-op refusal" when the action never actually
 * happened: the engine returned an `error`, or a combat resolver flagged
 * `noop` (out of range, no line of sight, can't act, friendly-fire unconfirmed).
 */
function isNoopResult(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const r = result as { noop?: unknown; error?: unknown };
  return r.noop === true || typeof r.error === "string";
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
    description:
      "Resolve a weapon attack from attacker against target (to-hit vs AC, damage on hit). " +
      "Set reaction:true ONLY for off-turn opportunity attacks (uses the attacker's reaction slot).",
    readOnly: false,
    schema: z.object({
      attacker: z.string(),
      target: z.string(),
      weapon: z.string().optional(),
      advantage: Advantage,
      allow_friendly: z.boolean().optional(),
      reaction: z.boolean().optional(),
    }),
    parameters: {
      type: "object",
      properties: {
        attacker: { type: "string" },
        target: { type: "string" },
        weapon: { type: "string", description: "Weapon item id; omit for monster default action" },
        advantage: { type: "string", enum: ["advantage", "disadvantage", "none"] },
        allow_friendly: {
          type: "boolean",
          description: "Set true ONLY when the player has explicitly confirmed attacking a party/ally member.",
        },
        reaction: {
          type: "boolean",
          description: "Set true ONLY for off-turn opportunity attacks; uses the attacker's reaction slot.",
        },
      },
      required: ["attacker", "target"],
    },
    cost: (args) => ({ kind: args.reaction ? "reaction" : "action", actorId: args.attacker }),
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
    description:
      "Roll initiative and begin combat. " +
      "ALWAYS provide positions for every participant — place them to match the narrative " +
      "(melee ambush ≈ 1 cell apart, dungeon room ≈ 4–6 cells, open field ≈ 8+ cells). " +
      "Friendly party starts on the left side (low x); hostiles on the right (higher x). " +
      "Example: party at x=0–1, goblins at x=3–4 for a tight corridor. " +
      "If you omit positions the engine auto-places them, which may not match the scene.",
    readOnly: false,
    schema: z.object({
      encounter: z.string().optional(),
      participants: z.array(z.string()).min(1),
      grid: z
        .object({
          w: z.number().int(),
          h: z.number().int(),
          cell_ft: z.number().int(),
          shape: z.enum(["square", "hex"]).optional(),
        })
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
        positions: {
          type: "object",
          description:
            "Starting token positions keyed by actor id. Match the scene: " +
            "tight corridor → 1 cell apart; dungeon room → 4–6 cells; open field → 8+ cells. " +
            "Party at low x, hostiles at higher x.",
          additionalProperties: {
            type: "object",
            properties: { x: { type: "integer" }, y: { type: "integer" } },
            required: ["x", "y"],
          },
        },
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
    name: "ability_increase",
    description: "Apply an Ability Score Improvement: up to +2 total across abilities (each capped at 20).",
    readOnly: false,
    schema: z.object({
      actor: z.string(),
      increments: z.record(z.enum(["str", "dex", "con", "int", "wis", "cha"]), z.number().int()),
    }),
    parameters: {
      type: "object",
      properties: {
        actor: { type: "string" },
        increments: { type: "object", description: "e.g. { str: 2 } or { dex: 1, con: 1 }" },
      },
      required: ["actor", "increments"],
    },
    handler: (state, args) => applyAbilityIncrease(state, args),
  }),
  def({
    name: "learn_spell",
    description: "Add one or more spells to an actor's known/prepared list.",
    readOnly: false,
    schema: z.object({ actor: z.string(), spells: z.array(z.string()) }),
    parameters: {
      type: "object",
      properties: { actor: { type: "string" }, spells: { type: "array", items: { type: "string" } } },
      required: ["actor", "spells"],
    },
    handler: (state, args) => learnSpells(state, args),
  }),
  def({
    name: "choose_subclass",
    description: "Choose an actor's subclass (e.g. at level 3); validated against the SRD class.",
    readOnly: false,
    schema: z.object({ actor: z.string(), subclass: z.string() }),
    parameters: {
      type: "object",
      properties: { actor: { type: "string" }, subclass: { type: "string", description: "SRD subclass id" } },
      required: ["actor", "subclass"],
    },
    handler: (state, args) => chooseSubclass(state, args),
  }),
  def({
    name: "grant_feat",
    description: "Grant one or more feats to an actor (creation or an ASI-level choice).",
    readOnly: false,
    schema: z.object({ actor: z.string(), feats: z.array(z.string()) }),
    parameters: {
      type: "object",
      properties: { actor: { type: "string" }, feats: { type: "array", items: { type: "string" } } },
      required: ["actor", "feats"],
    },
    handler: (state, args) => grantFeats(state, args),
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
    description:
      "Resolve a point-crawl travel edge to a connected location. Pass the journey's duration (days/hours, from the location's authored travel time when known) so the in-world clock advances (#24).",
    readOnly: false,
    schema: z.object({
      to: z.string(),
      days: z.number().int().min(0).optional(),
      hours: z.number().int().min(0).optional(),
    }),
    parameters: {
      type: "object",
      properties: {
        to: { type: "string" },
        days: { type: "integer", minimum: 0, description: "Journey length in days" },
        hours: { type: "integer", minimum: 0, description: "Journey length in hours" },
      },
      required: ["to"],
    },
    handler: (state, args) => {
      state.session.current_location = args.to;
      if (!state.session.revealed_locations.includes(args.to)) {
        state.session.revealed_locations.push(args.to);
      }
      log(state, { kind: "travel", detail: `Družina putuje do ${args.to}`, tool: "travel" });
      // Travel consumes time; advance the clock by the journey's duration.
      if (args.days || args.hours) {
        advanceTime(state, { days: args.days, hours: args.hours, reason: `cesta do ${args.to}` });
      }
      return { arrived: args.to };
    },
  }),
  def({
    name: "time_advance",
    description:
      "Advance the in-world clock for travel, downtime, or an extended conversation. The clock must move outside combat too — call this whenever meaningful time passes.",
    readOnly: false,
    schema: z.object({
      hours: z.number().int().min(0).optional(),
      days: z.number().int().min(0).optional(),
      reason: z.string().optional(),
    }),
    parameters: {
      type: "object",
      properties: {
        hours: { type: "integer", minimum: 0 },
        days: { type: "integer", minimum: 0 },
        reason: { type: "string", description: "Short cause, e.g. 'rozhovor s kupcem'" },
      },
    },
    handler: (state, args) => advanceTime(state, args),
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
    description:
      "Set the hotseat active-player pointer (out-of-combat only). " +
      "During combat the active actor is always the one whose turn it is in initiative — " +
      "use next_turn to advance it, never this tool.",
    readOnly: false,
    schema: z.object({ actor: z.string() }),
    parameters: { type: "object", properties: { actor: { type: "string" } }, required: ["actor"] },
    handler: (state, args) => {
      // In combat, active_player must follow the initiative order; block the override
      // so it cannot silently desync from combat.order[turn_index].
      if (state.session.combat) {
        const onTurn = state.session.combat.order[state.session.combat.turn_index]?.actor;
        if (onTurn && args.actor !== onTurn) {
          throw new Error(
            `V boji nelze set_active_player přepsat pořadí iniciativy — na tahu je ${onTurn}, nikoli ${args.actor}. Použij next_turn.`,
          );
        }
      }
      state.session.active_player = args.actor;
      return { active_player: args.actor };
    },
  }),
  def({
    name: "quest_start",
    description:
      "Begin tracking a quest when the player accepts it. Use an authored quest id when one exists (its title/objectives are filled in); otherwise pass a new id, a title, and the objectives. Logged to the visible quest/dice log.",
    readOnly: false,
    schema: z.object({
      id: z.string(),
      title: z.string(),
      giver: z.string().optional(),
      objectives: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
    }),
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Quest id (authored quest id when one exists)" },
        title: { type: "string", description: "Player-facing quest title (Czech)" },
        giver: { type: "string", description: "Who gave the quest (actor/NPC id or name)" },
        objectives: {
          type: "array",
          description: "Steps to complete; each { id, text }",
          items: {
            type: "object",
            properties: { id: { type: "string" }, text: { type: "string" } },
            required: ["id", "text"],
          },
        },
      },
      required: ["id", "title"],
    },
    handler: (state, args) => startQuest(state, args),
  }),
  def({
    name: "quest_advance",
    description: "Tick one objective of an active quest as done when narration shows the player achieved it.",
    readOnly: false,
    schema: z.object({ id: z.string(), objective: z.string() }),
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Quest id" },
        objective: { type: "string", description: "Objective id to mark done" },
      },
      required: ["id", "objective"],
    },
    handler: (state, args) => advanceQuest(state, args),
  }),
  def({
    name: "quest_complete",
    description: "Resolve an active quest as completed (all goals met).",
    readOnly: false,
    schema: z.object({ id: z.string() }),
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: (state, args) => completeQuest(state, args),
  }),
  def({
    name: "quest_fail",
    description: "Resolve an active quest as failed (the chance is lost or the giver is dead).",
    readOnly: false,
    schema: z.object({ id: z.string() }),
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: (state, args) => failQuest(state, args),
  }),
  def({
    name: "faction_advance",
    description:
      "Move a world faction toward (positive delta) or away from (negative) its goal when narration shows it gained or lost ground. delta is a fraction in [-1,1] (e.g. 0.1 = a notable step). Logged to the visible world/dice log (#49).",
    readOnly: false,
    schema: z.object({
      id: z.string(),
      delta: z.number().min(-1).max(1),
      reason: z.string().optional(),
    }),
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Faction id" },
        delta: { type: "number", minimum: -1, maximum: 1, description: "Progress change, e.g. 0.1 / -0.15" },
        reason: { type: "string", description: "Short cause, e.g. 'družina zmařila přepadení'" },
      },
      required: ["id", "delta"],
    },
    handler: (state, args) => advanceFaction(state, args),
  }),
  def({
    name: "faction_relation",
    description:
      "Set the mutual stance between two world factions when narration changes how they regard each other (#49). The relationship is symmetric.",
    readOnly: false,
    schema: z.object({
      a: z.string(),
      b: z.string(),
      stance: z.enum(["allied", "friendly", "neutral", "unfriendly", "hostile"]),
      reason: z.string().optional(),
    }),
    parameters: {
      type: "object",
      properties: {
        a: { type: "string", description: "First faction id" },
        b: { type: "string", description: "Second faction id" },
        stance: { type: "string", enum: ["allied", "friendly", "neutral", "unfriendly", "hostile"] },
        reason: { type: "string" },
      },
      required: ["a", "b", "stance"],
    },
    handler: (state, args) => setFactionRelation(state, args),
  }),
  def({
    name: "world_event_trigger",
    description:
      "Fire an authored world event when its trigger condition comes true (#49). Use the authored event id; its consequences (faction progress/resources/relations, location danger) are applied deterministically. Idempotent — an event fires once.",
    readOnly: false,
    schema: z.object({
      id: z.string(),
      name: z.string().optional(),
      consequences: z.array(z.string()).optional(),
    }),
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "World event id (authored event id)" },
        name: { type: "string", description: "Player-facing event name (filled from the note when omitted)" },
        consequences: {
          type: "array",
          items: { type: "string" },
          description: "Structured effects, e.g. 'location.x.danger: high' (filled from the note when omitted)",
        },
      },
      required: ["id"],
    },
    handler: (state, args) => triggerWorldEvent(state, args),
  }),
  def({
    name: "location_danger",
    description:
      "Set a location's current danger level (low/medium/high) when the world shifts around it — raids, a cleared road, a collapsing front (#49).",
    readOnly: false,
    schema: z.object({
      id: z.string(),
      level: z.enum(["low", "medium", "high"]),
      reason: z.string().optional(),
    }),
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Location id" },
        level: { type: "string", enum: ["low", "medium", "high"] },
        reason: { type: "string" },
      },
      required: ["id", "level"],
    },
    handler: (state, args) => setLocationDanger(state, args),
  }),
  def({
    name: "lookup",
    description:
      "Read-only: fetch SRD or vault entity data to ground narration (never invent stats). Covers monsters, spells, equipment, magic items, races, classes, subclasses, feats, traits, and party actors.",
    readOnly: true,
    schema: z.object({
      kind: z.enum([
        "monster",
        "spell",
        "equipment",
        "magic-item",
        "race",
        "subrace",
        "class",
        "subclass",
        "feat",
        "trait",
        "actor",
      ]),
      id: z.string(),
    }),
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [
            "monster",
            "spell",
            "equipment",
            "magic-item",
            "race",
            "subrace",
            "class",
            "subclass",
            "feat",
            "trait",
            "actor",
          ],
        },
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
        case "magic-item":
          return state.srd.magicItem(args.id) ?? { error: "not found" };
        case "race":
          return state.srd.race(args.id) ?? { error: "not found" };
        case "subrace":
          return state.srd.subrace(args.id) ?? { error: "not found" };
        case "class":
          return state.srd.class(args.id) ?? { error: "not found" };
        case "subclass":
          return state.srd.subclass(args.id) ?? { error: "not found" };
        case "feat":
          return state.srd.feat(args.id) ?? { error: "not found" };
        case "trait":
          return state.srd.trait(args.id) ?? { error: "not found" };
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
  let charged: { kind: ActionKind; actorId: string } | null = null;
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
      charged = cost;
    }
  }
  try {
    const result = tool.handler(state, parsed.data);
    // The slot is charged before the handler validates range/reach/line-of-sight
    // /spell list. If the action turned out to be a no-op, give the slot back so
    // the actor can still act this turn (move into range, then attack) instead
    // of wasting the turn on a refusal (#combat). A genuine miss is not a no-op.
    if (charged && isNoopResult(result)) refundEconomy(state, charged.actorId, charged.kind);
    return { name, ok: true, result };
  } catch (err) {
    // The handler threw after the slot was charged (e.g. unknown actor): the
    // action never ran, so refund rather than silently burning the turn.
    if (charged) refundEconomy(state, charged.actorId, charged.kind);
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
