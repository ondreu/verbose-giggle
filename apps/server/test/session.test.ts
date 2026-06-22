import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toolSpecs } from "@adm/engine";
import { SessionManager } from "../src/session/manager.js";
import { runTurn } from "../src/session/loop.js";
import type { EventBus } from "../src/session/events.js";
import type { LlmClient } from "../src/llm/client.js";

const SOURCE = fileURLToPath(
  new URL("../../../data/vault.example/campaigns/velen-roads", import.meta.url),
);

// Work on a throwaway copy so write-back never touches the committed vault.
let CAMPAIGN = "";
beforeAll(async () => {
  CAMPAIGN = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "adm-test-")), "velen-roads");
  await fs.cp(SOURCE, CAMPAIGN, { recursive: true });
});
afterAll(async () => {
  if (CAMPAIGN) await fs.rm(path.dirname(CAMPAIGN), { recursive: true, force: true });
});

describe("SessionManager + example vault", () => {
  it("loads the example campaign actors and config", async () => {
    const mgr = await SessionManager.open(CAMPAIGN);
    expect(mgr.campaign.config.name).toBe("The Velen Roads");
    expect(mgr.campaign.actors.thorin?.name).toBe("Thorin");
    expect(mgr.campaign.actors["goblin-boss"]?.faction).toBe("hostile");
  });

  it("dispatches a deterministic engine command and records the dice log", async () => {
    const mgr = await SessionManager.open(CAMPAIGN);
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
    const mgr = await SessionManager.open(CAMPAIGN);

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

  it("the offline mock narrator drives a real engine attack with no API key", async () => {
    const { MockLlmClient } = await import("../src/llm/mock.js");
    const mgr = await SessionManager.open(CAMPAIGN);
    const llm = new MockLlmClient(() => ({
      activePlayer: "thorin",
      partyIds: ["thorin", "elara"],
      hostileIds: ["goblin-1"],
      inCombat: false,
    }));
    const bus = { emit: () => undefined, subscribe: () => () => undefined } as unknown as EventBus;

    const { narration } = await runTurn({ manager: mgr, llm, bus, input: "Zaútočím na goblina!" });
    expect(narration).toContain("[mock DM]");
    expect(mgr.session.log.some((l) => l.kind === "attack")).toBe(true);
  });

  it("exposes all engine tools to the model", () => {
    const names = toolSpecs().map((t) => t.function.name);
    expect(names).toContain("attack");
    expect(names).toContain("start_combat");
    expect(names).toContain("cast_spell");
  });
});
