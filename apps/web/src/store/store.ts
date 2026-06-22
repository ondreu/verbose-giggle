import { create } from "zustand";
import type { Actor, Campaign, Encounter, Location, LogEntry, SessionState } from "@adm/schemas";

interface NarrationLine {
  id: number;
  role: "dm" | "player";
  text: string;
  /** Display name of the acting character (player lines only); falls back in UI. */
  actor?: string;
}

interface Cell {
  x: number;
  y: number;
}

export type ImageSubject = "character" | "location" | "scene";
export interface GeneratedImage {
  url: string;
  prompt: string;
  subject: ImageSubject;
  label: string;
}

export type View = "home" | "play";

export interface CampaignInfo {
  folder: string;
  name: string;
  party: number;
  active: boolean;
}

export interface SnapshotMeta {
  id: string;
  label: string;
  createdAt: string;
  location?: string;
  day?: number;
  auto?: boolean;
}

interface GameStore {
  view: View;
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
  lastImage: GeneratedImage | null;
  imageLoading: boolean;
  imageError: string | null;
  campaigns: CampaignInfo[];
  snapshots: SnapshotMeta[];

  setView: (v: View) => void;
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
  generateImage: (subject: ImageSubject, id?: string, label?: string) => Promise<void>;
  closeImage: () => void;

  // Start menu: campaigns + rollback (§2, §7).
  listCampaigns: () => Promise<void>;
  createCampaign: (input: {
    name: string;
    startingLocationName?: string;
    select?: boolean;
  }) => Promise<{ ok: boolean; error?: string; folder?: string }>;
  selectCampaign: (folder: string) => Promise<void>;
  listSnapshots: () => Promise<void>;
  createSnapshot: (label?: string) => Promise<void>;
  restoreSnapshot: (id: string) => Promise<void>;
  deleteSnapshot: (id: string) => Promise<void>;
  createCharacter: (draft: unknown) => Promise<{ ok: boolean; error?: string; id?: string }>;
  levelUp: (
    actor: string,
    choices?: { asi?: Record<string, number>; spells?: string[] },
  ) => Promise<{ ok: boolean; error?: string }>;
}

let lineSeq = 0;

export const useGame = create<GameStore>((set, get) => ({
  view: "home",
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
  lastImage: null,
  imageLoading: false,
  imageError: null,
  campaigns: [],
  snapshots: [],

  setView: (v) => set({ view: v }),

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
    // The campaign was hot-swapped or rolled back server-side: re-pull everything.
    source.addEventListener("reload", () => {
      set({ narration: [] });
      void get().hydrate();
      void get().listCampaigns();
      void get().listSnapshots();
    });
    source.addEventListener("error", () => set({ connected: false }));
  },

  sendAction: async (input: string) => {
    if (!input.trim() || get().busy) return;
    const { session, actors } = get();
    const activeId = session?.active_player ?? null;
    const actorName = activeId ? actors[activeId]?.name : undefined;
    set((s) => ({
      busy: true,
      error: null,
      narration: [...s.narration, { id: lineSeq++, role: "player", text: input, actor: actorName }],
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

  generateImage: async (subject, id, label) => {
    set({ imageLoading: true, imageError: null, lastImage: null });
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, id }),
      });
      const data = await res.json() as { url?: string; prompt?: string; error?: string };
      if (!res.ok || data.error) {
        set({ imageError: data.error ?? `Chyba ${res.status}`, imageLoading: false });
        return;
      }
      set({
        lastImage: { url: data.url!, prompt: data.prompt!, subject, label: label ?? subject },
        imageLoading: false,
      });
    } catch (err) {
      set({ imageError: err instanceof Error ? err.message : String(err), imageLoading: false });
    }
  },

  closeImage: () => set({ lastImage: null, imageError: null }),

  // --- Start menu: campaigns + rollback ------------------------------------
  listCampaigns: async () => {
    try {
      const res = await fetch("/api/campaigns");
      if (!res.ok) return;
      const data = await res.json();
      set({ campaigns: Array.isArray(data.campaigns) ? data.campaigns : [] });
    } catch {
      /* best-effort */
    }
  },

  createCampaign: async (input) => {
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error ?? `Chyba ${res.status}` };
      await get().listCampaigns();
      return { ok: true, folder: data.folder };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  selectCampaign: async (folder) => {
    set({ busy: true, error: null });
    try {
      const res = await fetch("/api/campaigns/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        set({ error: data.error ?? `Chyba ${res.status}` });
      }
      // The server emits a `reload` event which re-hydrates everything.
    } finally {
      set({ busy: false });
    }
  },

  listSnapshots: async () => {
    try {
      const res = await fetch("/api/snapshots");
      if (!res.ok) return;
      const data = await res.json();
      set({ snapshots: Array.isArray(data.snapshots) ? data.snapshots : [] });
    } catch {
      /* best-effort */
    }
  },

  createSnapshot: async (label) => {
    set({ busy: true });
    try {
      await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      await get().listSnapshots();
    } finally {
      set({ busy: false });
    }
  },

  restoreSnapshot: async (id) => {
    set({ busy: true, error: null });
    try {
      const res = await fetch(`/api/snapshots/${encodeURIComponent(id)}/restore`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        set({ error: data.error ?? `Chyba ${res.status}` });
      }
      // `reload` event re-hydrates; refresh the snapshot list too.
      await get().listSnapshots();
    } finally {
      set({ busy: false });
    }
  },

  deleteSnapshot: async (id) => {
    try {
      await fetch(`/api/snapshots/${encodeURIComponent(id)}`, { method: "DELETE" });
      await get().listSnapshots();
    } catch {
      /* best-effort */
    }
  },

  createCharacter: async (draft) => {
    set({ busy: true, error: null });
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        set({ error: data.error ?? `Chyba ${res.status}` });
        return { ok: false, error: data.error };
      }
      // Server emits `reload`, which re-hydrates the new actor into the store.
      return { ok: true, id: data.id };
    } finally {
      set({ busy: false });
    }
  },

  levelUp: async (actor, choices) => {
    set({ busy: true, error: null });
    try {
      const res = await fetch("/api/level-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor, ...choices }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        set({ error: data.error ?? `Chyba ${res.status}` });
        return { ok: false, error: data.error };
      }
      // Server emits `reload`; the updated sheet re-hydrates into the store.
      return { ok: true };
    } finally {
      set({ busy: false });
    }
  },
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
