import { create } from "zustand";
import type { Actor, Campaign, Encounter, Location, LogEntry, SessionState } from "@adm/schemas";

interface NarrationLine {
  id: number;
  role: "dm" | "player";
  text: string;
}

interface Cell {
  x: number;
  y: number;
}

interface GameStore {
  connected: boolean;
  busy: boolean;
  thinking: string | null;
  aiActing: string | null;
  error: string | null;
  campaign: Campaign | null;
  session: SessionState | null;
  actors: Record<string, Actor>;
  locations: Record<string, Location>;
  encounters: Record<string, Encounter>;
  narration: NarrationLine[];
  ttsEnabled: boolean;
  reachable: Cell[];
  aoeCells: Cell[];

  hydrate: () => Promise<void>;
  connect: () => void;
  sendAction: (input: string) => Promise<void>;
  sendCommand: (tool: string, args: unknown) => Promise<void>;
  castAoe: (args: {
    shape: string;
    origin: Cell;
    size: number;
    direction?: Cell;
  }) => Promise<string[]>;
  clearAoe: () => void;
  startEncounter: (id: string) => Promise<void>;
  fetchReachable: (actor: string) => Promise<void>;
  recap: () => Promise<void>;
  fetchLog: () => Promise<string>;
  toggleTts: () => void;
}

let lineSeq = 0;

export const useGame = create<GameStore>((set, get) => ({
  connected: false,
  busy: false,
  thinking: null,
  aiActing: null,
  error: null,
  campaign: null,
  session: null,
  actors: {},
  locations: {},
  encounters: {},
  narration: [],
  ttsEnabled: false,
  reachable: [],
  aoeCells: [],

  hydrate: async () => {
    const res = await fetch("/api/state");
    if (!res.ok) {
      set({ error: `Nelze načíst stav (${res.status})` });
      return;
    }
    const data = await res.json();
    set({
      campaign: data.campaign,
      session: data.session,
      actors: data.actors,
      locations: data.locations ?? {},
      encounters: data.encounters ?? {},
      ttsEnabled: data.campaign?.tts?.enabled ?? false,
      narration: (data.session?.chat ?? [])
        .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
        .map((m: { role: string; content: string }) => ({
          id: lineSeq++,
          role: m.role === "assistant" ? "dm" : "player",
          text: m.content,
        })),
    });
  },

  connect: () => {
    const source = new EventSource("/api/events");
    source.addEventListener("ready", () => set({ connected: true }));
    source.addEventListener("narration", (e) => {
      const { text } = JSON.parse((e as MessageEvent).data);
      set((s) => ({ narration: [...s.narration, { id: lineSeq++, role: "dm", text }] }));
      if (get().ttsEnabled) void speak(text);
    });
    source.addEventListener("log", (e) => {
      const { entry } = JSON.parse((e as MessageEvent).data) as { entry: LogEntry };
      set((s) =>
        s.session ? { session: { ...s.session, log: [...s.session.log, entry] } } : {},
      );
    });
    source.addEventListener("state", (e) => {
      const { state } = JSON.parse((e as MessageEvent).data) as { state: SessionState };
      // Clear the "AI is acting" banner once the pointer rests on a human.
      const active = state.combat?.order[state.combat.turn_index]?.actor;
      const activeIsHuman = active ? get().actors[active]?.controller === "human" : true;
      set({ session: state, thinking: null, aiActing: activeIsHuman ? null : get().aiActing });
    });
    source.addEventListener("thinking", (e) => {
      const { tool } = JSON.parse((e as MessageEvent).data);
      set({ thinking: tool });
    });
    source.addEventListener("actor_turn", (e) => {
      const { name, controller } = JSON.parse((e as MessageEvent).data);
      set({ aiActing: controller === "ai" ? name : null });
    });
    source.addEventListener("error", () => set({ connected: false }));
  },

  sendAction: async (input: string) => {
    if (!input.trim() || get().busy) return;
    set((s) => ({
      busy: true,
      error: null,
      narration: [...s.narration, { id: lineSeq++, role: "player", text: input }],
    }));
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        set({ error: body.error ?? `Chyba ${res.status}` });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ busy: false, thinking: null });
    }
  },

  sendCommand: async (tool: string, args: unknown) => {
    set({ busy: true });
    try {
      await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, args }),
      });
    } finally {
      set({ busy: false });
    }
  },

  castAoe: async (args) => {
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "aoe", args }),
      });
      const data = await res.json();
      const result = data?.result ?? {};
      set({ aoeCells: Array.isArray(result.cells) ? result.cells : [] });
      return Array.isArray(result.tokens) ? result.tokens : [];
    } catch {
      return [];
    }
  },
  clearAoe: () => set({ aoeCells: [] }),

  startEncounter: async (id: string) => {
    set({ busy: true });
    try {
      await fetch(`/api/encounter/${encodeURIComponent(id)}`, { method: "POST" });
    } finally {
      set({ busy: false });
    }
  },

  fetchReachable: async (actor: string) => {
    try {
      const res = await fetch(`/api/reachable/${encodeURIComponent(actor)}`);
      if (!res.ok) return set({ reachable: [] });
      const data = await res.json();
      set({ reachable: Array.isArray(data.cells) ? data.cells : [] });
    } catch {
      set({ reachable: [] });
    }
  },

  recap: async () => {
    if (get().busy) return;
    set({ busy: true });
    try {
      await fetch("/api/recap", { method: "POST" });
    } finally {
      set({ busy: false });
    }
  },

  fetchLog: async () => {
    try {
      const res = await fetch("/api/log");
      if (!res.ok) return "";
      const data = await res.json();
      return typeof data.text === "string" ? data.text : "";
    } catch {
      return "";
    }
  },

  toggleTts: () => set((s) => ({ ttsEnabled: !s.ttsEnabled })),
}));

async function speak(text: string): Promise<void> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    await audio.play().catch(() => undefined);
  } catch {
    /* TTS is best-effort */
  }
}
