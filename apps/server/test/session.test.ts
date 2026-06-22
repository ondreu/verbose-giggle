import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { toolSpecs } from "@adm/engine";
import { SessionManager } from "../src/session/manager.js";
import { runTurn } from "../src/session/loop.js";
import type { EventBus } from "../src/session/events.js";
import type { LlmClient } from "../src/llm/client.js";

const SOURCE = fileURLToPath(
  new URL("../../../data/vault.example/campaigns/velen-roads", import.meta.url),
);

// Each test gets its own throwaway copy so persisted session.json never leaks
// between tests, and the committed vault is never touched.
const tmpDirs: string[] = [];
async function freshCampaign(): Promise<string> {
  const dir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "adm-test-")), "velen-roads");
  await fs.cp(SOURCE, dir, { recursive: true });
  tmpDirs.push(path.dirname(dir));
  return dir;
}
afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("SessionManager + example vault", () => {
  it("loads the example campaign actors and config", async () => {
    const mgr = await SessionManager.open(await freshCampaign());
    expect(mgr.campaign.config.name).toBe("The Velen Roads");
    expect(mgr.campaign.actors.thorin?.name).toBe("Thorin");
    expect(mgr.campaign.actors["goblin-boss"]?.faction).toBe("hostile");
  });

  it("loads homebrew items and lore notes, resolving items in the engine", async () => {
    const mgr = await SessionManager.open(await freshCampaign());
    expect(mgr.campaign.items["cint-rodu"]?.name).toBe("Čepel rodu");
    expect(Object.keys(mgr.campaign.lore)).toContain("goblini-z-mlyna");
    // Homebrew item is merged into the engine's equipment index.
    const gs = mgr.buildGameState();
    expect(gs.srd.equipment("cint-rodu")?.damage).toBe("1d8+1");
  });

  it("dispatches a deterministic engine command and records the dice log", async () => {
    const mgr = await SessionManager.open(await freshCampaign());
    const gs = mgr.buildGameState();
    const res = await mgr.applyTool(gs, "start_combat", {
      participants: ["thorin", "goblin-1"],
    });
    expect(res.ok).toBe(true);
    expect(mgr.session.combat).not.toBeNull();
    expect(mgr.session.log.some((l) => l.kind === "initiative")).toBe(true);
  });
});

describe("LLM turn loop (mocked model)", () => {
  it("executes the model's tool call through the engine, then narrates", async () => {
    const mgr = await SessionManager.open(await freshCampaign());

    // Mock LLM: first response requests an attack tool, second narrates.
    let call = 0;
    const llm = {
      async chat() {
        call++;
        if (call === 1) {
          return {
            content: null,
            toolCalls: [
              { id: "t1", name: "attack", args: { attacker: "thorin", target: "goblin-1", weapon: "longsword" } },
            ],
          };
        }
        return { content: "Thorinova čepel zasviští vzduchem.", toolCalls: [] };
      },
    } as unknown as LlmClient;

    const events: string[] = [];
    const bus = {
      emit: (e: { type: string }) => events.push(e.type),
      subscribe: () => () => undefined,
    } as unknown as EventBus;

    const before = mgr.session.log.length;
    const { narration } = await runTurn({ manager: mgr, llm, bus, input: "Zaútočím na goblina." });

    expect(narration).toContain("Thorinova");
    expect(mgr.session.log.length).toBeGreaterThan(before);
    expect(mgr.session.log.some((l) => l.kind === "attack")).toBe(true);
    expect(events).toContain("narration");
  });

  it("runIntro narrates an opening scene and records it once (#31)", async () => {
    const { MockLlmClient } = await import("../src/llm/mock.js");
    const { runIntro } = await import("../src/session/loop.js");
    const mgr = await SessionManager.open(await freshCampaign());
    const llm = new MockLlmClient(() => ({
      activePlayer: mgr.session.active_player,
      partyIds: ["thorin", "elara"],
      hostileIds: [],
      inCombat: false,
      enemyOf: () => null,
    }));
    const bus = { emit: () => undefined, subscribe: () => () => undefined } as unknown as EventBus;

    const { intro } = await runIntro({ manager: mgr, llm, bus });
    expect(intro).toContain("[mock DM]");
    // The intro is recorded as an assistant message so reloads won't re-trigger.
    expect(mgr.session.chat.some((m) => m.role === "assistant")).toBe(true);
  });

  it("the offline mock narrator drives a real engine attack with no API key", async () => {
    const { MockLlmClient } = await import("../src/llm/mock.js");
    const mgr = await SessionManager.open(await freshCampaign());
    const llm = new MockLlmClient(() => ({
      activePlayer: "thorin",
      partyIds: ["thorin", "elara"],
      hostileIds: ["goblin-1"],
      inCombat: false,
      enemyOf: (id: string) => (id === "thorin" ? "goblin-1" : "thorin"),
    }));
    const bus = { emit: () => undefined, subscribe: () => () => undefined } as unknown as EventBus;

    const { narration } = await runTurn({ manager: mgr, llm, bus, input: "Zaútočím na goblina!" });
    expect(narration).toContain("[mock DM]");
    expect(mgr.session.log.some((l) => l.kind === "attack")).toBe(true);
  });

  it("auto-resolves an AI enemy's turn until it is a human's turn (§8.3)", async () => {
    const { MockLlmClient } = await import("../src/llm/mock.js");
    const { resolveAiTurns } = await import("../src/session/loop.js");
    const mgr = await SessionManager.open(await freshCampaign());
    const friendly = new Set(["party", "ally"]);
    const liveActors = () => mgr.campaign.actors;
    const alive = (id: string) => (mgr.session.actors[id]?.hp?.current ?? 1) > 0;

    const llm = new MockLlmClient(() => ({
      activePlayer: mgr.session.active_player,
      partyIds: Object.values(liveActors()).filter((a) => friendly.has(a.faction)).map((a) => a.id),
      hostileIds: Object.values(liveActors()).filter((a) => a.faction === "hostile").map((a) => a.id),
      inCombat: mgr.session.combat !== null,
      enemyOf: (actorId: string) => {
        const self = liveActors()[actorId];
        if (!self) return null;
        const wantHostile = friendly.has(self.faction);
        const t = Object.values(liveActors()).find(
          (a) => a.id !== actorId && alive(a.id) && (wantHostile ? a.faction === "hostile" : friendly.has(a.faction)),
        );
        return t?.id ?? null;
      },
    }));
    const bus = { emit: () => undefined, subscribe: () => () => undefined } as unknown as EventBus;

    const gs = mgr.buildGameState();
    // Combat with one human (thorin) and one AI enemy (goblin-1).
    await mgr.applyTool(gs, "start_combat", { participants: ["thorin", "goblin-1"] });
    // Advance until the AI goblin is on point, then auto-resolve.
    while (mgr.session.combat && mgr.campaign.actors[mgr.session.combat.order[mgr.session.combat.turn_index]!.actor]?.controller !== "ai") {
      await mgr.applyTool(gs, "next_turn", {});
    }
    await resolveAiTurns({ manager: mgr, llm, bus, gs });

    // The goblin took its turn (an attack it authored is in the log) and the
    // pointer has come to rest on a human.
    expect(mgr.session.log.some((l) => l.kind === "attack" && l.actor === "goblin-1")).toBe(true);
    const active = mgr.session.combat?.order[mgr.session.combat.turn_index]?.actor;
    expect(active ? mgr.campaign.actors[active]?.controller : "human").toBe("human");
  });

  it("instantiates an authored encounter with placed tokens and terrain", async () => {
    const { startEncounter } = await import("../src/session/encounter.js");
    const mgr = await SessionManager.open(await freshCampaign());
    const gs = mgr.buildGameState();
    const res = await startEncounter(mgr, gs, "mill-ambush");
    expect(res.ok).toBe(true);
    const combat = mgr.session.combat!;
    expect(combat).not.toBeNull();
    // Party placed at party_start; spawns placed at their cells.
    expect(combat.tokens["thorin"]).toEqual({ x: 2, y: 7 });
    expect(combat.tokens["goblin-boss"]).toEqual({ x: 7, y: 3 });
    // Encounter terrain carried into the combat snapshot.
    expect(combat.terrain.some((t) => t.kind === "wall")).toBe(true);
    expect(combat.grid.w).toBe(12);
  });

  it("generates a recap from the story so far (mock)", async () => {
    const { MockLlmClient } = await import("../src/llm/mock.js");
    const { runRecap } = await import("../src/session/loop.js");
    const mgr = await SessionManager.open(await freshCampaign());
    mgr.session.chat.push({ role: "assistant", content: "Družina dorazila na Rozcestí." });
    const llm = new MockLlmClient(() => ({
      activePlayer: null,
      partyIds: [],
      hostileIds: [],
      inCombat: false,
      enemyOf: () => null,
    }));
    const bus = { emit: () => undefined, subscribe: () => () => undefined } as unknown as EventBus;
    const { recap } = await runRecap({ manager: mgr, llm, bus });
    expect(recap).toContain("V minulém díle");
  });

  it("exposes all engine tools to the model", () => {
    const names = toolSpecs().map((t) => t.function.name);
    expect(names).toContain("attack");
    expect(names).toContain("start_combat");
    expect(names).toContain("cast_spell");
  });
});
