import { create } from "zustand";
import type { Actor, Campaign, Encounter, Location, LogEntry, SessionState } from "@adm/schemas";

interface NarrationLine {
  id: number;
  role: "dm" | "player" | "roll";
  text: string;
  /** Display name of the acting character (player lines only); falls back in UI. */
  actor?: string;
  /** Log kind for roll lines (attack/check/save/…), used for styling. */
  kind?: string;
}

/** Dice-bearing log kinds surfaced inline in the chat as animated roll cards. */
const ROLL_KINDS = new Set([
  "roll", "check", "save", "attack", "damage", "spell", "death-save", "initiative",
]);

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

/** A chosen target: a known actor, free-text, or `null` for "no specific target". */
export type PickedTarget = { label: string; id?: string } | null;
/** Result of a target request — a pick, or "cancelled" when dismissed. */
export type TargetResult = PickedTarget | "cancelled";

/** Which TTS engine the client asks the server to use. `auto` = Azure with
 *  Piper fallback (server default); the others force a single engine (#30). */
export type TtsProvider = "auto" | "azure" | "piper";

// --- Persisted UI preferences (#22) ----------------------------------------
// The server owns provider/campaign config (settings.json); these are the
// client-only toggles that must survive a page reload.
const PREFS_KEY = "adm.prefs";

interface Prefs {
  ttsEnabled: boolean;
  ttsProvider: TtsProvider;
}

const DEFAULT_PREFS: Prefs = { ttsEnabled: false, ttsProvider: "auto" };

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      ttsEnabled: typeof parsed.ttsEnabled === "boolean" ? parsed.ttsEnabled : DEFAULT_PREFS.ttsEnabled,
      ttsProvider:
        parsed.ttsProvider === "azure" || parsed.ttsProvider === "piper" || parsed.ttsProvider === "auto"
          ? parsed.ttsProvider
          : DEFAULT_PREFS.ttsProvider,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage may be unavailable (private mode); preferences are best-effort */
  }
}

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
  ttsProvider: TtsProvider;
  /** True while narration audio is actively playing (drives the stop button). */
  speaking: boolean;
  reachable: Cell[];
  aoeCells: Cell[];
  lastImage: GeneratedImage | null;
  imageLoading: boolean;
  imageError: string | null;
  campaigns: CampaignInfo[];
  snapshots: SnapshotMeta[];
  /** Active target request (drives the global TargetPicker + map click-to-target). */
  targetRequest: { title: string; allowNone: boolean } | null;
  /** Party tab the rail is currently showing (#47). Out of combat this tracks the
   *  active player; in combat it can point at another member for view-only
   *  inspection without changing whose turn it is. `null` = follow active_player. */
  viewedPlayer: string | null;
  /** Out-of-combat speaker mode (#47): false = act as the active character,
   *  true = address the whole party. Ignored in combat (initiative speaks). */
  partyVoice: boolean;
  /** The DM's current model + configured alternates, for the "Jiným modelem"
   *  re-roll picker (#54). Populated on hydrate from /api/state. */
  models: { current: string; alts: string[] };

  setView: (v: View) => void;
  /** Select which party member the rail (sheet/inventory) displays (#47). */
  setViewedPlayer: (id: string | null) => void;
  /** Toggle whether out-of-combat actions are spoken as the whole party (#47). */
  setPartyVoice: (v: boolean) => void;
  /** Ask the player to choose a target (list / free-text / map click). */
  requestTarget: (title: string, allowNone?: boolean) => Promise<TargetResult>;
  /** Fulfil the active target request (called by the picker or a map click). */
  resolveTarget: (result: TargetResult) => void;
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
  /** Fetch the DM's opening scene for a fresh campaign (#31), once. */
  intro: () => Promise<void>;
  undoTurn: () => Promise<void>;
  /** Re-roll the last DM turn (#54). With `model`, re-rolls using that model
   *  for this single call ("Jiným modelem"); otherwise the configured model. */
  regenerate: (model?: string) => Promise<void>;
  fetchLog: () => Promise<string>;
  toggleTts: () => void;
  setTtsProvider: (provider: TtsProvider) => void;
  /** Stop any narration audio currently playing (#30). */
  stopSpeech: () => void;
  /** Read a specific narration line aloud on demand (per-message control, #47). */
  speakLine: (text: string) => void;
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
  deleteCampaign: (folder: string) => Promise<{ ok: boolean; error?: string }>;
  fetchCampaignFiles: (folder: string) => Promise<string[]>;
  generateCampaignMap: () => Promise<{ ok: boolean; error?: string }>;
  forgeCampaign: (input: {
    name: string;
    premise?: string;
    length?: "short" | "medium" | "long";
    detail?: "sparse" | "normal" | "rich";
  }) => Promise<{ ok: boolean; error?: string; folder?: string; usedLlm?: boolean }>;
  /** Instantiate a built-in template into a fresh persistent campaign (#3). */
  createFromTemplate: (input: {
    template: string;
    name?: string;
  }) => Promise<{ ok: boolean; error?: string; folder?: string }>;
  listSnapshots: () => Promise<void>;
  createSnapshot: (label?: string) => Promise<void>;
  restoreSnapshot: (id: string) => Promise<void>;
  deleteSnapshot: (id: string) => Promise<void>;
  createCharacter: (draft: unknown) => Promise<{ ok: boolean; error?: string; id?: string }>;
  levelUp: (
    actor: string,
    choices?: { asi?: Record<string, number>; spells?: string[]; subclass?: string; feats?: string[] },
  ) => Promise<{ ok: boolean; error?: string }>;
}

let lineSeq = 0;
// The DM line currently being streamed token-by-token (#32), or null when no
// stream is in flight. Deltas append to it; `narration` finalizes it; a
// `narration_discard` (tool-call round) removes it.
let streamingLineId: number | null = null;
// Guards the one-shot campaign intro against concurrent re-entry (#31).
let introInFlight = false;
// Pending resolver for an in-flight target request (#38).
let targetResolver: ((r: TargetResult) => void) | null = null;

const initialPrefs = loadPrefs();

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
  ttsEnabled: initialPrefs.ttsEnabled,
  ttsProvider: initialPrefs.ttsProvider,
  speaking: false,
  reachable: [],
  aoeCells: [],
  lastImage: null,
  imageLoading: false,
  imageError: null,
  campaigns: [],
  snapshots: [],
  targetRequest: null,
  viewedPlayer: null,
  partyVoice: false,
  models: { current: "", alts: [] },

  setView: (v) => set({ view: v }),

  setViewedPlayer: (id) => set({ viewedPlayer: id }),

  setPartyVoice: (v) => set({ partyVoice: v }),

  requestTarget: (title, allowNone = true) =>
    new Promise<TargetResult>((resolve) => {
      // A new request supersedes any previous one (cancel the old).
      targetResolver?.("cancelled");
      targetResolver = resolve;
      set({ targetRequest: { title, allowNone } });
    }),

  resolveTarget: (result) => {
    const r = targetResolver;
    targetResolver = null;
    set({ targetRequest: null });
    r?.(result);
  },

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
      models: data.models ?? { current: "", alts: [] },
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
    // A streamed chunk of the DM's answer (#32): start a fresh DM line on the
    // first chunk, then append to it as more arrive.
    source.addEventListener("narration_delta", (e) => {
      const { text } = JSON.parse((e as MessageEvent).data) as { text: string };
      set((s) => {
        if (streamingLineId === null) {
          streamingLineId = lineSeq++;
          return { narration: [...s.narration, { id: streamingLineId, role: "dm", text }] };
        }
        const id = streamingLineId;
        return {
          narration: s.narration.map((l) => (l.id === id ? { ...l, text: l.text + text } : l)),
        };
      });
    });
    // The partial stream was a tool-call round's preamble, not the final answer:
    // drop the line so only real narration remains (#32).
    source.addEventListener("narration_discard", () => {
      if (streamingLineId === null) return;
      const id = streamingLineId;
      streamingLineId = null;
      set((s) => ({ narration: s.narration.filter((l) => l.id !== id) }));
    });
    source.addEventListener("narration", (e) => {
      const { text } = JSON.parse((e as MessageEvent).data);
      set((s) => {
        // Finalize the in-flight streamed line with the authoritative text…
        if (streamingLineId !== null) {
          const id = streamingLineId;
          streamingLineId = null;
          return { narration: s.narration.map((l) => (l.id === id ? { ...l, text } : l)) };
        }
        // …or append a fresh line when nothing was streamed (recap, mock).
        return { narration: [...s.narration, { id: lineSeq++, role: "dm", text }] };
      });
      if (get().ttsEnabled) {
        void speak(text, get().ttsProvider, () => set({ speaking: false }));
        set({ speaking: true });
      }
    });
    source.addEventListener("log", (e) => {
      const { entry } = JSON.parse((e as MessageEvent).data) as { entry: LogEntry };
      set((s) => {
        const next: Partial<GameStore> = s.session
          ? { session: { ...s.session, log: [...s.session.log, entry] } }
          : {};
        // Surface dice rolls inline in the chat (animated), not just in the log.
        if (ROLL_KINDS.has(entry.kind)) {
          next.narration = [
            ...s.narration,
            { id: lineSeq++, role: "roll", text: entry.detail, kind: entry.kind },
          ];
        }
        return next;
      });
    });
    source.addEventListener("state", (e) => {
      const { state } = JSON.parse((e as MessageEvent).data) as { state: SessionState };
      // Clear the "AI is acting" banner once the pointer rests on a human.
      const active = state.combat?.order[state.combat.turn_index]?.actor;
      const activeIsHuman = active ? get().actors[active]?.controller === "human" : true;
      // The view-only party selection only applies during combat; out of combat
      // the rail follows the active (hotseat) player (#47).
      set({
        session: state,
        thinking: null,
        aiActing: activeIsHuman ? null : get().aiActing,
        viewedPlayer: state.combat ? get().viewedPlayer : null,
      });
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
      streamingLineId = null;
      set({ narration: [] });
      void get().hydrate();
      void get().listCampaigns();
      void get().listSnapshots();
    });
    source.addEventListener("error", () => set({ connected: false }));
  },

  sendAction: async (input: string) => {
    if (!input.trim() || get().busy) return;
    const { session, actors, partyVoice } = get();
    // The whole-party voice only applies out of combat; in combat the initiative
    // order picks the speaker (#47).
    const speakAsParty = partyVoice && !session?.combat;
    const activeId = session?.active_player ?? null;
    const actorName = speakAsParty ? "Družina" : activeId ? actors[activeId]?.name : undefined;
    set((s) => ({
      busy: true,
      error: null,
      narration: [...s.narration, { id: lineSeq++, role: "player", text: input, actor: actorName }],
    }));
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, as: speakAsParty ? "party" : undefined }),
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

  intro: async () => {
    if (introInFlight || get().narration.length > 0) return;
    introInFlight = true;
    try {
      const res = await fetch("/api/intro", { method: "POST" });
      if (!res.ok) return;
      const data = (await res.json()) as { started?: boolean; intro?: string };
      // Append directly (rather than via SSE) to avoid a race on first load.
      if (data.started && data.intro) {
        set((s) => ({ narration: [...s.narration, { id: lineSeq++, role: "dm", text: data.intro! }] }));
      }
    } catch {
      /* best-effort; the scene can still start silently */
    } finally {
      introInFlight = false;
    }
  },

  undoTurn: async () => {
    if (get().busy) return;
    set({ busy: true, error: null });
    try {
      const res = await fetch("/api/undo", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        set({ error: d.error ?? `Chyba ${res.status}` });
      }
      // The server emits `reload`, which re-hydrates the rewound state.
    } finally {
      set({ busy: false });
    }
  },

  regenerate: async (model) => {
    if (get().busy) return;
    // Optimistically drop the last turn's output (DM line + any roll cards),
    // keeping the player action that prompted it. The server rewinds to the same
    // point and re-runs that action, streaming a fresh narration in its place;
    // on failure we restore the trimmed lines. (#54)
    const prev = get().narration;
    let cut = prev.length;
    for (let i = prev.length - 1; i >= 0; i--) {
      if (prev[i]!.role === "player") break;
      cut = i;
    }
    set({ busy: true, error: null, narration: prev.slice(0, cut) });
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        set({ error: body.error ?? `Chyba ${res.status}`, narration: prev });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), narration: prev });
    } finally {
      set({ busy: false, thinking: null });
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

  toggleTts: () =>
    set((s) => {
      const ttsEnabled = !s.ttsEnabled;
      savePrefs({ ttsEnabled, ttsProvider: s.ttsProvider });
      // Turning narration off should silence anything already playing (#30).
      if (!ttsEnabled) stopAudio();
      return { ttsEnabled, speaking: ttsEnabled ? s.speaking : false };
    }),

  setTtsProvider: (provider) =>
    set((s) => {
      savePrefs({ ttsEnabled: s.ttsEnabled, ttsProvider: provider });
      return { ttsProvider: provider };
    }),

  stopSpeech: () => {
    stopAudio();
    set({ speaking: false });
  },

  speakLine: (text) => {
    if (!text.trim()) return;
    set({ speaking: true });
    void speak(text, get().ttsProvider, () => set({ speaking: false }));
  },

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

  deleteCampaign: async (folder) => {
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(folder)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error ?? `Chyba ${res.status}` };
      await get().listCampaigns();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  fetchCampaignFiles: async (folder) => {
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(folder)}/files`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.files) ? data.files : [];
    } catch {
      return [];
    }
  },

  generateCampaignMap: async () => {
    set({ busy: true, error: null });
    try {
      const res = await fetch("/api/campaigns/map", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        set({ error: data.error ?? `Chyba ${res.status}` });
        return { ok: false, error: data.error };
      }
      // Server emits `reload`; the new world_map re-hydrates onto the overworld.
      return { ok: true };
    } finally {
      set({ busy: false });
    }
  },

  forgeCampaign: async (input) => {
    set({ busy: true, error: null });
    try {
      const res = await fetch("/api/campaigns/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, select: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        set({ error: data.error ?? `Chyba ${res.status}` });
        return { ok: false, error: data.error };
      }
      // Server emits `reload`; the new campaign re-hydrates.
      return { ok: true, folder: data.folder, usedLlm: data.usedLlm };
    } finally {
      set({ busy: false });
    }
  },

  createFromTemplate: async (input) => {
    set({ busy: true, error: null });
    try {
      const res = await fetch("/api/campaigns/from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, select: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        set({ error: data.error ?? `Chyba ${res.status}` });
        return { ok: false, error: data.error };
      }
      // Server emits `reload`; the new campaign re-hydrates.
      return { ok: true, folder: data.folder };
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

// The single in-flight narration audio element, tracked so `stopSpeech` can
// cancel it mid-sentence (#30). A fresh `speak()` supersedes the previous one.
let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

function stopAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

/**
 * Strip Markdown formatting so the TTS voice doesn't read "asterisk asterisk"
 * aloud (#27). Removes emphasis/code markers, heading/list/quote prefixes,
 * horizontal rules, and link/image syntax while keeping the readable text.
 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/\r\n/g, "\n")
    .replace(/^[ \t]{0,3}(#{1,6})[ \t]+/gm, "") // headings
    .replace(/^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/gm, "") // horizontal rules
    .replace(/^[ \t]*>[ \t]?/gm, "") // blockquotes
    .replace(/^[ \t]*[-*+][ \t]+/gm, "") // unordered list markers
    .replace(/^[ \t]*\d+\.[ \t]+/gm, "") // ordered list markers
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → label
    .replace(/(\*\*|__)(.+?)\1/g, "$2") // bold
    .replace(/(\*|_)(.+?)\1/g, "$2") // italic
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function speak(
  text: string,
  provider: TtsProvider,
  onDone: () => void,
): Promise<void> {
  // A new line supersedes whatever is currently playing.
  stopAudio();
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: stripMarkdown(text), provider }),
    });
    if (!res.ok) return onDone();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    currentUrl = url;
    const cleanup = () => {
      if (currentAudio === audio) stopAudio();
      onDone();
    };
    audio.onended = cleanup;
    audio.onerror = cleanup;
    await audio.play().catch(() => undefined);
  } catch {
    /* TTS is best-effort */
    onDone();
  }
}
