import { create } from "zustand";
import type { Actor, Campaign, Location, LogEntry, SessionState } from "@adm/schemas";

interface NarrationLine {
  id: number;
  role: "dm" | "player";
  text: string;
}

interface GameStore {
  connected: boolean;
  busy: boolean;
  thinking: string | null;
  error: string | null;
  campaign: Campaign | null;
  session: SessionState | null;
  actors: Record<string, Actor>;
  locations: Record<string, Location>;
  narration: NarrationLine[];
  ttsEnabled: boolean;

  hydrate: () => Promise<void>;
  connect: () => void;
  sendAction: (input: string) => Promise<void>;
  sendCommand: (tool: string, args: unknown) => Promise<void>;
  toggleTts: () => void;
}

let lineSeq = 0;

export const useGame = create<GameStore>((set, get) => ({
  connected: false,
  busy: false,
  thinking: null,
  error: null,
  campaign: null,
  session: null,
  actors: {},
  locations: {},
  narration: [],
  ttsEnabled: false,

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
      set({ session: state, thinking: null });
    });
    source.addEventListener("thinking", (e) => {
      const { tool } = JSON.parse((e as MessageEvent).data);
      set({ thinking: tool });
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
