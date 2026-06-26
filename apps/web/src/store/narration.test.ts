import { describe, expect, it } from "vitest";
import type { LogEntry } from "@adm/schemas";
import { buildNarration } from "./store";

/** Monotonic id allocator mirroring the store's `lineSeq`. */
function ids() {
  let n = 0;
  return () => n++;
}

function roll(t: string, kind: string, detail: string): LogEntry {
  return { t, kind, detail };
}

describe("buildNarration (reload persistence, chat + dice rolls)", () => {
  it("returns nothing for a missing session", () => {
    expect(buildNarration(null, ids())).toEqual([]);
    expect(buildNarration(undefined, ids())).toEqual([]);
  });

  it("interleaves persisted skill checks back into the transcript by timestamp", () => {
    const session = {
      chat: [
        { role: "user", content: "Prohledám truhlu.", t: "2026-06-26T10:00:00.000Z" },
        { role: "assistant", content: "Najdeš zámek.", t: "2026-06-26T10:00:02.000Z" },
      ],
      log: [
        roll("2026-06-26T10:00:01.000Z", "check", "Vnímání d20: 14 +3 = 17 vs DC 15 → úspěch"),
      ],
    };
    const lines = buildNarration(session, ids());
    expect(lines.map((l) => l.role)).toEqual(["player", "roll", "dm"]);
    expect(lines[1]).toMatchObject({ role: "roll", kind: "check" });
    expect(lines[1]!.text).toContain("Vnímání");
  });

  it("drops non-roll log kinds and system/tool chat messages", () => {
    const session = {
      chat: [
        { role: "system", content: "prompt", t: "2026-06-26T10:00:00.000Z" },
        { role: "user", content: "Jdu dál.", t: "2026-06-26T10:00:01.000Z" },
        { role: "tool", content: "{}", t: "2026-06-26T10:00:02.000Z" },
        { role: "assistant", content: "Kráčíš vpřed.", t: "2026-06-26T10:00:03.000Z" },
      ],
      log: [
        roll("2026-06-26T10:00:02.500Z", "move", "Přesun o 30 ft"),
        roll("2026-06-26T10:00:02.700Z", "attack", "d20: 18 → zásah"),
      ],
    };
    const lines = buildNarration(session, ids());
    expect(lines.map((l) => l.role)).toEqual(["player", "roll", "dm"]);
    // The "move" entry is not a roll kind and is excluded.
    expect(lines.some((l) => l.text.includes("Přesun"))).toBe(false);
  });

  it("surfaces turn-change and combat log kinds as dividers (#3)", () => {
    const session = {
      chat: [{ role: "assistant", content: "Boj propuká!", t: "2026-06-26T10:00:00.000Z" }],
      log: [
        roll("2026-06-26T10:00:01.000Z", "combat", "Boj začíná."),
        roll("2026-06-26T10:00:02.000Z", "turn", "Kolo 1 — na tahu Elara"),
      ],
    };
    const lines = buildNarration(session, ids());
    expect(lines.map((l) => l.role)).toEqual(["dm", "divider", "divider"]);
    expect(lines[2]).toMatchObject({ role: "divider", kind: "turn" });
    expect(lines[2]!.text).toContain("na tahu Elara");
  });

  it("keeps chat ahead of rolls recorded in the same instant (stable sort)", () => {
    const t = "2026-06-26T10:00:00.000Z";
    const session = {
      chat: [{ role: "assistant", content: "Hod na iniciativu!", t }],
      log: [roll(t, "initiative", "Iniciativa d20: 12")],
    };
    const lines = buildNarration(session, ids());
    expect(lines.map((l) => l.role)).toEqual(["dm", "roll"]);
  });

  it("falls back to the previous stamp for legacy messages without timestamps", () => {
    // Pre-timestamp chat (no `t`): rolls still carry real timestamps, so they
    // land after the untimed history rather than being dropped.
    const session = {
      chat: [
        { role: "user", content: "Útočím." },
        { role: "assistant", content: "Tasíš meč." },
      ],
      log: [roll("2026-06-26T10:00:00.000Z", "attack", "d20: 19 → zásah")],
    };
    const lines = buildNarration(session, ids());
    expect(lines.map((l) => l.role)).toEqual(["player", "dm", "roll"]);
    // Ids are unique and monotonic.
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  });
});
