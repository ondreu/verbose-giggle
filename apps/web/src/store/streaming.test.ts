import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Drives the real zustand store through the exact SSE sequence the server emits
 * for a multi-tool-round DM turn, and asserts the chat's two regressions stay
 * fixed:
 *
 *  1. The committed transcript never loses a line mid-turn (the DM message used
 *     to appear then vanish on every tool-call round, #blink).
 *  2. The in-flight DM text is never rendered or rewritten: only a neutral
 *     `dmWriting` indicator is shown, raised on the first token and lowered once
 *     the authoritative narration commits — so nothing flickers or rewrites.
 */

class FakeEventSource {
  static instance: FakeEventSource;
  listeners: Record<string, ((e: { data: string }) => void)[]> = {};
  constructor() {
    FakeEventSource.instance = this;
  }
  addEventListener(type: string, fn: (e: { data: string }) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  fire(type: string, data: unknown) {
    for (const fn of this.listeners[type] ?? []) fn({ data: JSON.stringify(data) });
  }
}

beforeEach(() => {
  // @ts-expect-error test polyfill for the store's connect()
  globalThis.EventSource = FakeEventSource;
});
afterEach(() => {
  // @ts-expect-error cleanup
  delete globalThis.EventSource;
});

describe("DM chat streaming (no blink, no rewrite, rolls stay)", () => {
  it("holds a steady writing indicator across tool rounds and only grows the transcript", async () => {
    const { useGame } = await import("./store");
    useGame.getState().connect();
    const es = FakeEventSource.instance;

    const committedLengths: number[] = [];
    const unsub = useGame.subscribe((s) => committedLengths.push(s.narration.length));

    // Round 1: preamble streams, then a skill check fires.
    es.fire("narration_delta", { text: "Podívám se…" });
    expect(useGame.getState().dmWriting).toBe(true);
    es.fire("narration_discard", {});
    // The indicator stays up — there is no visible text to retract.
    expect(useGame.getState().dmWriting).toBe(true);
    es.fire("log", {
      entry: { t: "2026-06-26T10:00:01.000Z", kind: "check", detail: "Pátrání 17 → úspěch" },
    });

    // Round 2: more preamble, another roll.
    es.fire("narration_delta", { text: "Ještě hodím…" });
    es.fire("narration_discard", {});
    es.fire("log", {
      entry: { t: "2026-06-26T10:00:02.000Z", kind: "save", detail: "Vnímání 10 → neúspěch" },
    });

    // Mid-turn: indicator still up, two roll cards committed, none retracted.
    const mid = useGame.getState();
    expect(mid.dmWriting).toBe(true);
    expect(mid.narration.filter((l) => l.role === "roll")).toHaveLength(2);
    // The raw diagnostic buffer captured both preambles with a discard marker.
    expect(mid.streamingRaw).toContain("Podívám se…");
    expect(mid.streamingRaw).toContain("Ještě hodím…");
    expect(mid.streamingRaw).toContain("zahozeno");

    // Final round commits the narration and lowers the indicator.
    es.fire("narration_delta", { text: "Za uvolněnou deskou " });
    es.fire("narration", { text: "Za uvolněnou deskou najdeš měšec." });

    const final = useGame.getState();
    unsub();

    expect(final.dmWriting).toBe(false);
    // The diagnostic buffer is reset once the turn's narration commits.
    expect(final.streamingRaw).toBe("");

    // Committed transcript only ever grew — no line ever disappeared.
    for (let i = 1; i < committedLengths.length; i++) {
      expect(committedLengths[i]).toBeGreaterThanOrEqual(committedLengths[i - 1]!);
    }

    // Both roll cards survive alongside the final DM narration, in order.
    expect(final.narration.map((l) => l.role)).toEqual(["roll", "roll", "dm"]);
    expect(final.narration.at(-1)!.text).toContain("měšec");
  });

  it("lowers the indicator at turn end when no narration follows (state event)", async () => {
    const { useGame } = await import("./store");
    useGame.getState().connect();
    const es = FakeEventSource.instance;

    es.fire("narration_delta", { text: "Něco zkusím…" });
    es.fire("narration_discard", {});
    expect(useGame.getState().dmWriting).toBe(true);

    // A tool-only turn ends with a `state` event and no `narration`; the
    // indicator must not linger.
    es.fire("state", { state: { combat: null, log: [], chat: [] } });
    expect(useGame.getState().dmWriting).toBe(false);
    expect(useGame.getState().streamingRaw).toBe("");
  });
});
