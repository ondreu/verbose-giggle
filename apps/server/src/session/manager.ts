import type { Actor, SessionState } from "@adm/schemas";
import { dispatch, makeRng, TOOLS, type GameState } from "@adm/engine";
import { createSrdIndex } from "@adm/srd";
import {
  appendSessionLog,
  flushActor,
  loadCampaign,
  loadSession,
  saveSession,
  type LoadedCampaign,
} from "../vault/campaign.js";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/**
 * Owns the server-authoritative game state for one campaign (§5, §7). Resolves
 * actor sheets (base note + session overlay), drives the engine, and persists
 * state to disk. State is mutated ONLY through `applyTool`.
 */
export class SessionManager {
  private constructor(
    public campaign: LoadedCampaign,
    public session: SessionState,
  ) {}

  static async open(campaignDir: string): Promise<SessionManager> {
    const campaign = await loadCampaign(campaignDir);
    const session = await loadSession(campaign);
    return new SessionManager(campaign, session);
  }

  /** Build a fresh engine GameState with actors resolved from base + overlay. */
  buildGameState(): GameState {
    const actors: Record<string, Actor> = {};
    for (const [id, base] of Object.entries(this.campaign.actors)) {
      const resolved = clone(base);
      const overlay = this.session.actors[id];
      if (overlay?.hp) Object.assign(resolved.hp, overlay.hp);
      if (overlay?.position !== undefined) resolved.position = overlay.position;
      if (overlay?.conditions) resolved.conditions = clone(overlay.conditions);
      if (overlay?.concentration !== undefined) resolved.concentration = clone(overlay.concentration);
      actors[id] = resolved;
    }
    return {
      actors,
      session: this.session,
      srd: createSrdIndex(),
      rng: makeRng(`${this.campaign.config.name}:${Date.now()}`),
      variant: {
        flanking: this.campaign.config.variant_rules.flanking,
        diagonals: this.campaign.config.variant_rules.diagonals,
      },
    };
  }

  /** Capture mutable actor state back into the session overlay after engine work. */
  private syncOverlay(gs: GameState): void {
    for (const [id, actor] of Object.entries(gs.actors)) {
      this.session.actors[id] = {
        hp: { current: actor.hp.current, temp: actor.hp.temp },
        position: actor.position,
        conditions: actor.conditions,
        concentration: actor.concentration,
      };
    }
  }

  /** Run a single tool through the engine, persisting the resulting state. */
  async applyTool(gs: GameState, name: string, args: unknown) {
    const result = dispatch(gs, name, args);
    this.syncOverlay(gs);
    return result;
  }

  async persist(): Promise<void> {
    await saveSession(this.campaign, this.session);
  }

  /** Flush durable changes (final HP, xp, slots) back to actor notes (§7). */
  async checkpoint(gs: GameState): Promise<void> {
    for (const actor of Object.values(gs.actors)) {
      await flushActor(this.campaign, actor);
    }
    await this.persist();
  }

  async log(line: string): Promise<void> {
    await appendSessionLog(this.campaign, line);
  }

  toolSpecsJson() {
    return TOOLS;
  }
}
