import type { Actor, SessionState } from "@adm/schemas";
import { checkCampaignEnd, dispatch, makeRng, TOOLS, type GameState } from "@adm/engine";
import { createSrdIndex, type SrdEquipment } from "@adm/srd";
import { loadSrdDataset, type SrdOverrides } from "../srd/load.js";
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
    private srdOverrides: SrdOverrides,
  ) {}

  static async open(campaignDir: string, opts?: { srdDir?: string }): Promise<SessionManager> {
    const campaign = await loadCampaign(campaignDir);
    const session = await loadSession(campaign);
    // Merge the mounted SRD dataset (if any) with homebrew items from the
    // campaign, so inventory/weapon/armor ids resolve in the engine (§6.4).
    const dataset = opts?.srdDir ? await loadSrdDataset(opts.srdDir) : { monsters: {}, spells: {}, equipment: {} };
    for (const item of Object.values(campaign.items)) {
      const eq: SrdEquipment = {
        id: item.id,
        name: item.name,
        category: item.category,
        weight: item.weight ?? 0,
        damage: item.damage,
        properties: item.properties,
        ac: item.ac,
      };
      dataset.equipment[item.id] = eq;
    }
    return new SessionManager(campaign, session, dataset);
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
      if (overlay?.dead !== undefined) resolved.dead = overlay.dead;
      actors[id] = resolved;
    }
    return {
      actors,
      session: this.session,
      srd: createSrdIndex(this.srdOverrides),
      rng: makeRng(`${this.campaign.config.name}:${Date.now()}`),
      variant: {
        flanking: this.campaign.config.variant_rules.flanking,
        diagonals: this.campaign.config.variant_rules.diagonals,
        gridShape: this.campaign.config.variant_rules.grid_shape ?? "square",
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
        dead: actor.dead,
      };
    }
  }

  /** Run a single tool through the engine, persisting the resulting state. */
  async applyTool(gs: GameState, name: string, args: unknown) {
    const result = dispatch(gs, name, args);
    // A solo hero's death ends the campaign; the roster lives in the config,
    // so the engine can't decide this on its own (#23).
    checkCampaignEnd(gs, this.campaign.config.party ?? []);
    this.syncOverlay(gs);
    return result;
  }

  async persist(): Promise<void> {
    await saveSession(this.campaign, this.session);
  }

  /**
   * Persist state. Combat-transient values (mid-fight HP, positions) stay in the
   * session overlay; durable changes are flushed to actor notes only OUT of
   * combat, so a fight in progress never clobbers the authored sheets (§7).
   */
  async checkpoint(gs: GameState): Promise<void> {
    if (!this.session.combat) {
      for (const actor of Object.values(gs.actors)) {
        await flushActor(this.campaign, actor);
      }
    }
    await this.persist();
  }

  /** Force-flush durable actor changes to notes (e.g. when combat ends). */
  async flushDurable(gs: GameState): Promise<void> {
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
