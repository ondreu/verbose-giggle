# AI Dungeon Master — Design & Build Specification

**Status:** v1 build spec • **Ruleset:** D&D 5e (SRD 5.1) • **Audience:** the implementing agent

This document is the single source of truth for building a self-hosted, AI-driven Dungeon Master web app. It is written to be handed to a coding agent. Every section is actionable. Where a decision is left open, it is flagged in §18.

The guiding language of the project (player-facing narration, TTS) is **Czech**; the codebase, identifiers, and this spec are in English.

---

## 1. Product summary

A web application where an LLM acts as Dungeon Master for D&D 5e. It runs on a home NAS in Docker. A small group plays **hotseat** (one shared screen, players take turns) with optional **AI-controlled companions** and AI-controlled enemies. The world, characters, and lore live in a portable **Obsidian-style vault** (markdown + frontmatter + JSON). Narration is read aloud in Czech via local **Piper TTS**.

The defining constraint: **the LLM never invents game mechanics.** All numbers — dice, stats, damage, distances, spell slots — are produced by a deterministic rules **engine** and surfaced in a visible, auditable **dice log**. The LLM only (a) interprets player intent, (b) decides *which* mechanic applies, and (c) narrates the engine's truthful results.

---

## 2. Core principles (non-negotiable)

1. **Determinism over hallucination.** The engine owns every die roll and every piece of game state. The LLM requests mechanics through a tool/function-calling interface and narrates the returned facts. The LLM is structurally unable to emit a roll result, an HP value, a distance, or a slot count as free text that the game treats as authoritative.
2. **Visible dice log.** Every engine computation (e.g. `d20: 14 +5 = 19 vs AC 15 → hit; 1d8+3 = 7 slashing`) is logged and rendered in the UI. Trust is earned by being auditable.
3. **Dual-use vault notes.** Each entity is one note. Its **frontmatter is machine truth** (read by the engine); its **body is flavor** (read by the LLM for narration / AI control). Character sheets, NPCs, locations, encounters all follow this pattern.
4. **Portable, file-first data.** Authored content and durable state are plain files in the vault, syncable by the user's tool of choice (Obsidian Sync, Syncthing, etc.). The app mounts the vault as a volume and treats sync as out-of-scope.
5. **Server-authoritative state from day one.** Even in single-screen hotseat, live state lives on the server and is mutated only through commands. This makes future networked multiplayer an additive feature, not a rewrite.
6. **Provider-agnostic LLM.** Default to Mistral, but the LLM client speaks the OpenAI-compatible chat-completions-with-tools shape so it works equally through Mistral's API or OpenRouter (no vendor lock-in).
7. **Dark-fantasy, AI-slop-free UI.** The interface has a deliberate, atmospheric dark-fantasy aesthetic (candlelit gloom, aged metal, parchment, characterful type, real iconography) — never the default AI-generated look. Specific, non-default design choices are mandatory; see §12 and Appendix A.

---

## 3. System architecture

Single deployable app (TypeScript server that also serves the built frontend) plus two sidecar containers (Piper TTS, Caddy reverse proxy) and Watchtower for auto-update.

```
                         ┌─────────────────────────────────────────┐
   Browser / tablet      │                NAS · Docker              │
   (hotseat client)      │                                          │
        │                │   ┌──────────────┐   ┌───────────────┐   │
        │  HTTPS         │   │  App (TS)     │   │  Piper TTS    │   │
        ▼                │   │  Fastify      │──▶│  cs_CZ voice  │   │
   ┌──────────┐   443    │   │  ┌──────────┐ │   └───────────────┘   │
   │  Caddy   │─────────▶│   │  │  Engine  │ │                       │
   │ (HTTPS)  │          │   │  │ (det.)   │ │   ┌───────────────┐   │
   └──────────┘          │   │  └──────────┘ │   │  Mistral API  │   │
                         │   │  LLM client  ─┼──▶│  / OpenRouter │   │
                         │   │  Vault adapter│   └───────────────┘   │
                         │   └──────┬───────┘                        │
                         │          │ mounts                         │
                         │   ┌──────▼──────────────────────────┐     │
                         │   │ /data/vault  (sheets, locations, │     │
                         │   │              encounters, lore)   │     │
                         │   │ /data/maps   (map images)        │     │
                         │   │ /data/srd    (SRD JSON)          │     │
                         │   │ /data/state  (session.json)      │     │
                         │   └──────────────────────────────────┘     │
                         │   ┌──────────────┐                         │
                         │   │  Watchtower  │  auto-pull :latest      │
                         │   └──────────────┘                         │
                         └─────────────────────────────────────────┘
```

**Request/command flow (the function-calling loop):**

1. Player submits an action (free text) or a UI command (move token, cast spell button).
2. Server assembles LLM context: system prompt + scene state snapshot + recent history + available tools.
3. LLM responds with narration text and/or one or more **tool calls**.
4. Server executes each tool **deterministically** in the engine (real RNG, real SRD stats), mutates server state, appends to dice log.
5. Tool results are returned to the LLM, which narrates the true outcome.
6. Server pushes new state + narration to the client; narration text is sent to Piper, audio streamed back.

---

## 4. Technology stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (Node 20+) end-to-end | One language, one repo, easy Docker |
| Monorepo | pnpm workspaces | Shared types between server/engine/web |
| Server | Fastify | Fast, typed, light |
| Rules engine | Pure TS module, no framework | Deterministic, unit-testable in isolation |
| RNG | Seedable PRNG (e.g. `seedrandom`) | Reproducible tests; optional seeded sessions |
| Dice | `@dice-roller/rpg-dice-roller` (or small custom parser) | Parse `2d6+3`, adv/disadv |
| Validation | `zod` | Runtime-validate vault frontmatter + tool args |
| Frontmatter | `gray-matter` + `yaml` | Parse/serialize note frontmatter |
| LLM client | OpenAI-compatible (`openai` SDK pointed at Mistral/OpenRouter base URL) with tool calling | Provider-agnostic |
| Frontend | React + Vite + TypeScript | Familiar, fast |
| State (client) | Zustand | Minimal |
| Styling | Tailwind + custom dark-fantasy theme tokens (CSS vars), **no default preset** | Dark-fantasy + AI-slop-free (§12, Appendix A) |
| Fonts | Display serif (e.g. Cinzel/Marcellus) + body serif (e.g. EB Garamond) — **never** Inter/Geist/Roboto | Typographic point of view (anti-slop) |
| Icons | game-icons.net (CC-BY) or RPG-Awesome — **never** emoji | Real iconography (anti-slop) |
| Overworld map | Leaflet (`CRS.Simple`) | Pan/zoom image + markers + layers, battle-tested |
| Tactical grid | Custom SVG/Canvas component | Precise grid geometry, AoE overlays |
| State channel | REST commands + Server-Sent Events (SSE) for push | SSE is enough for hotseat; WS is the later MP upgrade |
| TTS | Piper (cs_CZ) via small HTTP wrapper | Local, FOSS, Czech |
| Reverse proxy | Caddy 2 (auto-HTTPS) | Simple TLS; Tailscale as alt |
| Auto-update | Watchtower + GHCR `:latest` | Per user preference |

---

## 5. Repository layout

```
ai-dungeon-master/
├─ apps/
│  ├─ server/                 # Fastify app: API, LLM loop, vault adapter, serves web build
│  │  ├─ src/
│  │  │  ├─ index.ts
│  │  │  ├─ routes/           # REST + SSE endpoints
│  │  │  ├─ llm/              # provider-agnostic client, system prompts, tool dispatch
│  │  │  ├─ vault/            # read/write notes, watch for changes
│  │  │  └─ session/          # server-authoritative state, command handlers
│  │  └─ package.json
│  └─ web/                    # React + Vite frontend
│     ├─ src/
│     │  ├─ panels/           # ChatPanel, SheetPanel, InventoryPanel, DiceLog, TurnTracker
│     │  ├─ map/              # OverworldMap (Leaflet), TacticalGrid (SVG)
│     │  ├─ theme/            # dark-fantasy theme tokens (Appendix A)
│     │  └─ store/            # Zustand state, SSE subscription
│     └─ package.json
├─ packages/
│  ├─ engine/                 # PURE deterministic rules engine (no IO, no LLM, no network)
│  │  ├─ src/
│  │  │  ├─ dice.ts
│  │  │  ├─ checks.ts         # ability checks, saves
│  │  │  ├─ combat.ts         # attacks, damage, conditions, initiative
│  │  │  ├─ spells.ts         # slots, concentration, AoE resolution
│  │  │  ├─ grid.ts           # geometry, movement, distance (5-5-5), templates
│  │  │  ├─ rest.ts
│  │  │  └─ tools.ts          # the tool registry exposed to the LLM
│  │  └─ test/                # extensive unit tests (engine must be trustworthy)
│  ├─ schemas/                # zod schemas + TS types: Character, Location, Encounter, Item, Campaign, SessionState
│  └─ srd/                    # SRD data loader + typed accessors
├─ data/
│  ├─ vault.example/          # sample campaign, characters, locations, encounters
│  └─ srd/                    # bundled SRD JSON (or fetched at build)
├─ docker/
│  ├─ Dockerfile
│  ├─ docker-compose.yml
│  └─ Caddyfile
├─ .github/workflows/release.yml   # build + push image to GHCR
└─ docs/ai-dungeon-master-spec.md  # this file
```

**Hard rule for the agent:** `packages/engine` must have **zero dependencies on IO, the network, or the LLM.** It is a pure function of (state, command) → (new state, result, log entries). This is what makes determinism testable and guarantees the LLM cannot bypass it.

---

## 6. Data model (the vault)

All authored entities are markdown notes with YAML frontmatter, validated by `zod` schemas in `packages/schemas`. Unknown/extra fields are preserved on write (don't clobber user notes).

**Vault & campaign layout (runtime).** One campaign = one self-contained, portable folder (zip it, `git` it, sync it — it's complete). The SRD dataset is shared across campaigns.

```
vault/
├─ srd/                       # shared 5e dataset (monsters, spells, equipment)
└─ campaigns/
   └─ velen-roads/            # a complete campaign: everything below travels together
      ├─ campaign.yaml        # config: party, companions, start, llm, tts, variant rules
      ├─ characters/          # human PCs            (frontmatter = stats, body = backstory)
      ├─ companions/          # controller: ai allies
      ├─ bestiary/            # campaign-specific NPCs/monsters (generic ones come from srd/)
      ├─ locations/           # overworld nodes (hierarchy + point-crawl)
      ├─ encounters/          # tactical grid setups
      ├─ items/               # homebrew/magic items only
      ├─ lore/                # factions, quests, free notes
      ├─ maps/                # this campaign's map images
      ├─ state/               # LIVE state (server-authoritative)
      │  ├─ session.json      # current HP, positions, initiative, time, fog of war, active player
      │  └─ session-log.md    # append-only human-readable diary + dice log (for /recap and handoff)
      └─ CAMPAIGN.md          # schema legend (see §6.6) — lets a human or any LLM pick the game up
```

Folders are for human convenience only: the engine indexes entities by their `type:` frontmatter, so a **flat vault** (Bases/Dataview style) works identically if preferred.

### 6.1 Character / companion / monster (`characters/*.md`, `bestiary/*.md`)

Same schema for all "actors". `controller` and `faction` differentiate them.

```yaml
---
type: character            # character | monster
id: thorin                 # unique, slug
name: Thorin
controller: human          # human | ai
faction: party             # party | ally | hostile | neutral
race: mountain-dwarf
class: fighter
subclass: champion
level: 3
xp: 900
abilities: { str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 }
proficiency_bonus: 2
proficiencies:
  saves: [str, con]
  skills: [athletics, intimidation]
  weapons: [martial, simple]
  armor: [heavy, medium, light, shields]
hp: { max: 28, current: 28, temp: 0 }
ac: 18
speed: 30                  # feet
hit_dice: { type: d10, total: 3, remaining: 3 }
spell_slots: {}            # casters only: { "1": { max: 2, used: 0 }, "2": { max: 0, used: 0 } }
spells_known: []           # SRD spell ids
conditions: []             # active condition objects {name, source, duration}
concentration: null        # {spell, dc_to_maintain} or null
inventory:
  - { id: longsword, qty: 1, equipped: true }
  - { id: chain-mail, qty: 1, equipped: true }
  - { id: shield, qty: 1, equipped: true }
  - { id: potion-of-healing, qty: 2 }
attunement: []             # max 3 magic items
death_saves: { success: 0, fail: 0 }
position: null             # {x, y} in grid squares during combat
# monsters may instead reference a stat block:
srd_ref: null              # e.g. "goblin" → pull stat block from SRD when instantiated
ai_profile: null           # for controller: ai → tactics + personality hints
---
# Thorin
Backstory, personality, voice. Read by the LLM for narration and (if controller: ai) for decisions.
```

### 6.2 Location (`locations/*.md`) — overworld point-crawl + hierarchy

```yaml
---
type: location
id: rozcesti
name: Rozcestí
kind: landmark             # continent | region | city | town | village | landmark | dungeon
parent: velen              # hierarchical zoom (null for top-level continent)
coords: { x: 0.42, y: 0.55 }   # 0..1 position on the PARENT's map image
map_image: maps/velen.webp     # optional: this node's own zoom-in map
connections:               # point-crawl edges
  - to: novigrad
    travel: { distance_km: 30, days: 1, terrain: road, danger: low }
  - to: stary-mlyn
    travel: { days: 2, terrain: wilderness, danger: high }
encounter_table: velen-roads   # optional id for random travel encounters
discovered: false          # fog of war; revealed at runtime in session state, this is the default
---
# Rozcestí
Description, NPCs present, plot hooks.
```

### 6.3 Encounter (`encounters/*.md`) — tactical grid setup

```yaml
---
type: encounter
id: mill-ambush
name: Ambush at the Old Mill
location: stary-mlyn
grid: { w: 12, h: 10, cell_ft: 5 }
battle_map_image: maps/mill-interior.webp   # optional image under the grid
terrain:
  - { x: 5, y: 2, kind: wall }              # wall | difficult | hazard | cover-half | cover-three-quarter
  - { x: 6, y: 4, kind: difficult }
spawns:
  - { ref: goblin, faction: hostile, at: { x: 7, y: 2 } }
  - { ref: goblin, faction: hostile, at: { x: 8, y: 2 } }
  - { ref: goblin-boss, faction: hostile, at: { x: 7, y: 3 } }
party_start:               # cells where PCs are placed
  - { x: 2, y: 7 }
  - { x: 1, y: 8 }
---
# Ambush
DM notes, enemy tactics, treasure, trigger conditions.
```

### 6.4 Item (`items/*.md`) — only for custom items

SRD equipment comes from the bundled SRD data. This note type is only for homebrew/magic items. Schema: `id, name, category, weight, properties, damage?, ac?, effects?, attunement?`, body = description.

### 6.5 Campaign (`campaign.yaml`)

```yaml
type: campaign
name: The Velen Roads
ruleset: dnd5e-srd
world_map: maps/continent.webp
starting_location: rozcesti
party: [thorin, elara]         # human-controlled character ids
companions: [shadowpaw]        # ai-controlled ally ids
language: cs
tts: { enabled: true, voice: cs_CZ-jirka-medium }
llm: { model: mistral-medium-3.5 }   # overrides env default
variant_rules: { flanking: false, diagonals: "5-5-5" }
```

### 6.6 Portability & graceful degradation

The app is a *player* of the data, not its owner. Because a campaign is plain markdown + JSON + images in one self-contained folder, it survives the app and can be picked up three ways:

- **By a human DM** — open the folder, read the sheets + `session.json` + `session-log.md`, and run the table by hand. Zero tech. The DM becomes the engine (rolls their own dice).
- **By another LLM, same app** — change `LLM_MODEL` / base URL. Engine and tools are unchanged; only the narrator changes. Full fidelity, no migration.
- **By a different app or a bare LLM** — universal formats transfer trivially; a bare LLM can be handed the world + current state and continue the story. The only thing lost without the engine is the **determinism guarantee** (a bare LLM reverts to "vibing" numbers).

To make this real and not just theoretical, **every campaign folder MUST contain a `CAMPAIGN.md`** — a short schema legend explaining the frontmatter keys and how to read `session.json` — so any human or LLM has the key to take over. The agent generates and maintains this file.

Mid-combat handoff is the only rough edge (session holds token positions and the initiative index); out of combat it is seamless. For a planned handoff, finish the scene and hand over between encounters. Because state is plain text, committing the campaign folder to git also gives full undo/rollback of the entire world.

---

## 7. Game state (server-authoritative)

Live, mutable state separate from authored content. Persisted **inside the campaign folder** at `campaigns/<name>/state/session.json` (file-first, inspectable) so each campaign is fully self-contained, with a human-readable `session-log.md` alongside it (append-only diary + dice log). Mutated **only** by command handlers, never directly by the LLM.

```jsonc
{
  "campaign": "the-velen-roads",
  "current_location": "rozcesti",
  "revealed_locations": ["rozcesti", "novigrad"],   // fog of war
  "time": { "day": 3, "hour": 14 },
  "active_player": "thorin",                         // hotseat pointer (also drives turn UI)
  "actors": {                                        // runtime overlay of mutable actor state
    "thorin": { "hp": { "current": 22 }, "position": { "x": 2, "y": 7 }, "conditions": [] }
    // durable changes get flushed back to the character note via update_sheet
  },
  "combat": null,                                    // or the object below
  "log": [ /* dice + event log entries, see §8.4 */ ],
  "chat": [ /* role/content message history fed to the LLM */ ]
}
```

```jsonc
// combat object when in an encounter
"combat": {
  "encounter": "mill-ambush",
  "round": 1,
  "order": [ { "actor": "elara", "initiative": 18 }, { "actor": "goblin-1", "initiative": 12 } ],
  "turn_index": 0,
  "grid": { "w": 12, "h": 10, "cell_ft": 5 },
  "tokens": { "thorin": { "x": 2, "y": 7 }, "goblin-1": { "x": 7, "y": 2 } }
}
```

**Persistence policy:** combat-transient values (initiative, mid-fight HP, positions) live in session state. When combat ends or on checkpoints, durable changes (final HP, XP, consumed items, spell slots, discovered locations) are flushed to the relevant notes via the engine's `update_sheet` tool. Use atomic writes (temp file + rename) to avoid corrupting notes mid-sync.

---

## 8. Rules engine — the deterministic core

The engine implements D&D 5e SRD mechanics and exposes them as **tools** the LLM may call. It is the only component allowed to roll dice or change state.

### 8.1 Engine responsibilities (must implement)

- **Dice:** parse and roll expressions; advantage/disadvantage; crit detection.
- **Ability checks & saving throws:** assemble modifier from sheet (ability mod + proficiency + situational), roll, compare to DC.
- **Attacks:** to-hit (incl. proficiency, ability, magic bonuses) vs AC; critical hits; damage rolls; damage **types**; resistances/immunities/vulnerabilities.
- **HP & state:** apply damage/healing, temp HP, unconsciousness, death saves.
- **Conditions:** the SRD condition set (prone, grappled, restrained, poisoned, frightened, etc.) and their mechanical effects on rolls/movement.
- **Spells:** slot tracking and consumption, concentration (and the CON save to maintain on damage), spell attacks/saves, AoE target resolution.
- **Initiative & turns:** roll initiative, maintain order, advance turns/rounds, track action economy (action/bonus/reaction/movement) at least minimally.
- **Grid geometry:** distance using **5-5-5** diagonals (Chebyshev; configurable per `variant_rules`), reachable-cell computation (movement budget vs difficult terrain via BFS), line-of-sight/cover (at least half/three-quarters), AoE templates (sphere/cube/cone/line) → list of covered cells/tokens.
- **Rest:** short rest (spend hit dice) and long rest (restore HP, slots, hit dice).
- **Leveling:** XP thresholds → level up (HP, proficiency bonus, slots). May be assisted/manual in v1.

### 8.2 Tool / function-calling API (LLM-facing)

These are the functions registered with the LLM. Each returns a structured result that is logged and fed back for narration. The LLM **must** use these for anything mechanical; it may never assert a mechanical outcome without a corresponding tool result.

| Tool | Args (shape) | Returns |
|---|---|---|
| `roll` | `{ expr, advantage? }` | `{ rolls, total }` |
| `ability_check` | `{ actor, ability, skill?, dc, advantage? }` | `{ roll, modifier, total, dc, success }` |
| `saving_throw` | `{ actor, ability, dc, advantage? }` | `{ roll, total, dc, success }` |
| `attack` | `{ attacker, target, weapon?, spell?, advantage? }` | `{ to_hit, hit, crit, damage?, type? }` |
| `apply_damage` | `{ target, amount, type? }` | `{ hp_before, hp_after, resisted, dropped }` |
| `heal` | `{ target, amount }` | `{ hp_before, hp_after }` |
| `cast_spell` | `{ caster, spell, slot_level, targets?, origin? }` | `{ slot_consumed, attacks?, saves?, affected, concentration? }` |
| `apply_condition` / `remove_condition` | `{ target, condition, duration? }` | `{ conditions }` |
| `start_combat` | `{ encounter?, participants? }` | `{ order, round }` |
| `end_turn` / `next_turn` | `{}` | `{ active_actor, round }` |
| `move` | `{ actor, to: {x,y} }` | `{ ok, path, cost, remaining } \| { error }` |
| `aoe` | `{ shape, origin, size, direction? }` | `{ cells, tokens }` |
| `lookup` | `{ kind, id }` | SRD/vault entity data (read-only grounding for descriptions) |
| `get_state` | `{ scope? }` | current scene/combat snapshot (read-only) |
| `update_sheet` | `{ actor, patch }` | `{ ok }` — writes durable changes to the note |
| `give_item` / `remove_item` / `equip_item` | `{ actor, item, qty? }` | `{ inventory }` |
| `short_rest` / `long_rest` | `{ actors }` | `{ results }` |
| `travel` | `{ to }` | `{ days, encounter? }` — resolves a point-crawl edge |
| `show_location` | `{ id }` | `{ focus }` — overworld camera + reveal (fog of war) |
| `set_active_player` | `{ actor }` | `{ active_player }` — hotseat pointer |

**DC guidance:** the LLM passes a `dc`, but the system prompt constrains it to the standard SRD bands (very easy 5 → nearly impossible 30). Optionally provide a `suggest_dc` helper that maps a difficulty label to a number so the LLM picks a label, not an arbitrary integer.

### 8.3 AI-controlled actors

On an AI actor's turn (companion or monster), the engine yields control to the LLM with that actor's stat block + `ai_profile` + battlefield state, and asks it to choose an action. The LLM's choice is executed through the **same tools** as a human's. Therefore AI actors are bound by the same determinism — an AI companion's healing still rolls real dice. Enemies are simply `controller: ai, faction: hostile`; companions are `controller: ai, faction: party|ally`. One unified "actor" abstraction.

### 8.4 Log entry shape

```jsonc
{ "t": "2026-06-21T14:03:00Z", "kind": "attack", "actor": "thorin", "target": "goblin-1",
  "detail": "d20: 14 +5 = 19 vs AC 15 → hit; 1d8+3 = 7 slashing", "tool": "attack", "result": { /* … */ } }
```

The frontend renders these in the dice log verbatim-ish (human-readable `detail`). This is the trust surface.

---

## 9. LLM integration

### 9.1 Client

Provider-agnostic. Use the OpenAI-compatible chat-completions endpoint with tool calling, configured by env:

- `LLM_BASE_URL` (default `https://api.mistral.ai/v1`; set to OpenRouter's base URL to route there)
- `LLM_API_KEY`
- `LLM_MODEL` (default `mistral-medium-3.5`, overridable per campaign)

The agent must confirm the exact tool-calling request/response shape for the chosen provider and pin SDK versions.

### 9.2 The loop

```
loop:
  context = systemPrompt + sceneSnapshot + recentHistory
  resp = llm.chat(context, tools)
  if resp has tool_calls:
      for call in resp.tool_calls:
          result = engine.dispatch(call.name, call.args)   // deterministic, logged
          append tool result to context
      continue loop                                         // let LLM narrate results
  else:
      narration = resp.text
      persist + push to client
      if tts.enabled: piper(narration) → audio → client
      break
```

Guardrails:
- The LLM is given tools but **no ability to write state directly.** All state mutation flows through engine tools, which enforce rules and validate args with `zod`.
- The system prompt forbids stating any number that did not come from a tool result. If the model narrates "you hit for 8 damage" it must have called `attack`/`apply_damage` first.
- Keep a turn budget (max tool calls per turn) to avoid loops.

### 9.3 System prompt (outline — implement in `apps/server/src/llm/prompts`)

- **Role:** "You are the Dungeon Master for a D&D 5e game. Narrate vividly in Czech."
- **Hard rules:** never invent mechanical outcomes; always use tools for rolls, checks, attacks, movement, distances, slots; pick the appropriate check and a DC from the standard bands; respect the current turn order; you control all `controller: ai` actors on their turns.
- **Grounding:** use `lookup`/`get_state` to fetch facts (monster stats, location lore) instead of inventing them; the world map and location notes are canonical — do not contradict them.
- **Style:** narration in Czech, concise, second person to the active player; keep mechanical chatter in the dice log, prose for story.
- **Output contract:** prose for narration; tool calls for mechanics. Never both assert a number in prose and skip the tool.

---

## 10. Maps

Two map systems sharing one hierarchy: **overworld** (authored, image-based) zooms down to **tactical grid** (per-encounter). A location node is the bridge — its battle map is just the deepest zoom.

### 10.1 Overworld (Leaflet, `CRS.Simple`)

- Render the parent location's `map_image` as a Leaflet image overlay with `CRS.Simple`.
- Place a marker per child/connected location using its `coords` (0..1 ratios → pixel coords at current zoom). **Store coords as ratios, never pixels**, so they're resolution-independent.
- The **current location** marker is highlighted (arcane ring + "jste zde"). Connected nodes show travel info (days, danger) from the point-crawl edges.
- **Fog of war:** only `revealed_locations` (from session state) are shown; undiscovered nodes are hidden or rendered as faded "?".
- `show_location(id)` pans/zooms the camera and reveals the node. Clicking a connected node offers `travel`.
- **Author mode** (nice-to-have): click on the map writes `coords` back into a location note, so the user registers nodes by clicking instead of typing pixel values.

### 10.2 Tactical grid (custom SVG/Canvas)

- Draw the encounter `grid` (w×h cells of `cell_ft`), optional `battle_map_image` underneath.
- Render terrain cells (wall/difficult/hazard/cover), actor tokens (colored by faction), the active actor (arcane selection ring).
- **Movement:** dragging a token issues `move`; the engine validates against speed and difficult terrain (BFS) and returns the path + cost, or an error. The frontend highlights reachable cells (engine-computed) before the move.
- **AoE templates:** selecting a spell shows a sphere/cone/line template; on placement, `aoe` returns affected tokens; engine computes who's caught — never the LLM.
- Distance/range checks are engine geometry (5-5-5 default). The model asks; the grid answers.

### 10.3 Sourcing maps

- **Recommended:** [Azgaar's Fantasy Map Generator](https://azgaar.github.io/Fantasy-Map-Generator/) — FOSS, browser, self-hostable; exports a map image **and** a list of settlements with coordinates → import script can auto-create location notes (convert pixel coords to 0..1 ratios) so nodes register automatically.
- Alternatives: Wonderdraft (paid desktop, Linux), Inkarnate (browser, subscription), or any static image with manual node placement (use author mode).
- **Copyright:** prefer self-generated or CC/OGL assets. Published commercial maps (WotC/Paizo/etc.) are fine for private play but must not be redistributed if the project or its data is ever shared.

---

## 11. Text-to-speech (Czech)

- Run **Piper** as a sidecar exposing an HTTP endpoint: `POST /tts { text } → audio/wav` (cs_CZ voice). If using a Wyoming-protocol image, add a thin HTTP adapter; the agent finalizes the exact image/wrapper (see §18).
- Backend forwards LLM narration text to Piper, streams the WAV to the client, which plays it. UI toggle to enable/disable; per-campaign default from `tts` config.
- Voice model configurable (`tts.voice`); ship a sensible cs_CZ default and document how to swap voice models (mounted in the Piper volume).

---

## 12. Frontend

A single-screen hotseat layout. Panels (responsive; collapsible on tablet):

- **Narration / chat** — DM prose + player input box (the active player types here). Audio playback control.
- **Character sheet** — rendered from the active actor's note: abilities, modifiers (derived), HP/AC/speed, proficiencies, conditions, spell slots. Editable; edits write back to the note.
- **Inventory** — items, equip toggles, consumables (use → engine), weight/encumbrance, attunement (max 3).
- **Dice log** — the auditable stream of engine results (§8.4). Always visible; the trust surface.
- **Turn tracker** — initiative order; the active actor highlighted (arcane accent), others dimmed; AI actors auto-resolve and show what they did.
- **Map** — toggles between **overworld** (Leaflet) and **tactical grid** (SVG) depending on context; `show_location`/combat switches automatically.

**Visual direction: modern dark fantasy, deliberately AI-slop-free.** Atmospheric and characterful — candlelit gloom, aged metal, parchment, stone and leather — not a generic dark dashboard. Governing rule: *never let the styling default; make specific, non-default choices anchored to a real reference.* A "tell" is just a default nobody overrode. Mandatory choices (this list distills the patterns people most often flag as "AI-generated"):

- **Palette:** a bespoke dark-fantasy palette — deep, slightly warm charcoal/stone neutrals with **aged gold** as the primary accent (Appendix A). **Do NOT use purple/violet/mauve as the primary brand color** — it is the single most-named "AI slop" tell. Mauve is retained *only* as the arcane/magic + active-actor accent.
- **No gradient heading text; no purple→blue gradients; at most one restrained gradient anywhere.**
- **Typography:** a display face with a point of view for headings (Cinzel / Marcellus / Cormorant) paired with a readable body serif (EB Garamond / Crimson Pro). **Never Inter, Geist, Roboto, or system-default sans.**
- **Icons:** a real set — game-icons.net (CC-BY, huge fantasy/RPG library) or RPG-Awesome. **Never emoji as icons or bullets.**
- **Character sheets** read as **parchment** (warm paper surface, ink text), not flat slate cards — a deliberate texture that also breaks card monotony.
- **Radius:** a real scale (mostly tight/squared for a fantasy-document feel), not one max-rounded pill value on everything.
- **No unprompted neon glow.** Any luminance reads as warm candlelight, and only with a reason.
- **Motion only when it communicates:** dice tumbling, turn handoff, damage flash. Respect `prefers-reduced-motion`. No fade-in-on-scroll, parallax, or scrolljacking.
- **Layout:** a play surface, not a landing page — let narration and the map be the atmospheric focal point; avoid uniform flat-card dashboards.

**Hotseat UX:** the UI follows `active_player`. When it's a human's turn, their sheet + input are active. When it's an AI actor (companion/enemy), the turn auto-resolves with a short "Shadowpaw drinks a potion…" beat. A human passing the device just continues on the next human turn — the **active-player pointer**, not hardcoded identity, drives everything.

**Anchor, don't freestyle.** Pin the aesthetic to real references (Darkest Dungeon's UI, Baldur's Gate 3 character sheets, Disco Elysium, illuminated manuscripts / grimoires) so the model doesn't reach for the median look. Before shipping the web build, audit it against the checklist above — grep for the default-stack signatures (Tailwind default indigo/violet, Inter/Geist, gradient text, emoji-as-icons, max-rounded-everything) and override each one. A site that "looks AI" is just a pile of un-overridden defaults.

---

## 13. Hotseat & multiplayer-readiness

v1 ships **hotseat only** — no auth, no networked sync, single client. But the design is multiplayer-ready at near-zero extra cost:

- **State is server-authoritative** and mutated only via commands (REST endpoints → engine → state diff).
- The client subscribes to state via **SSE**; swapping SSE for **WebSockets** + per-client identity later is additive.
- The **active-player pointer** is a switchable value, not a hardcoded "player 1". Networked MP becomes "send the pointer and state diffs over the wire", not a rewrite.

Do **not** build WS/auth/presence in v1. Do build the command/state-diff seam cleanly so they slot in.

---

## 14. Deployment

### 14.1 Image & registry

- Multi-stage `Dockerfile`: build web (Vite) → build server (tsc) → runtime image serving the static web build + API on one port.
- CI builds and pushes `ghcr.io/<USER>/ai-dungeon-master:latest` on push to `main`.

### 14.2 docker-compose.yml (NAS)

```yaml
services:
  app:
    image: ghcr.io/<USER>/ai-dungeon-master:latest
    restart: unless-stopped
    environment:
      - LLM_API_KEY=${LLM_API_KEY}
      - LLM_BASE_URL=${LLM_BASE_URL:-https://api.mistral.ai/v1}
      - LLM_MODEL=${LLM_MODEL:-mistral-medium-3.5}
      - VAULT_PATH=/data/vault
      - PIPER_URL=http://piper:5000
      - BASIC_AUTH=${BASIC_AUTH:-}        # optional "user:pass" gate
    volumes:
      - ./vault:/data/vault
      - ./maps:/data/maps
      - ./state:/data/state
      - ./srd:/data/srd                    # or bundle in the image
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
    depends_on: [piper]

  piper:
    image: <piper-http-image>              # finalize per §18
    restart: unless-stopped
    volumes:
      - ./piper-voices:/voices
    # expose internal :5000 only; not published to host

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config

  watchtower:
    image: containrrr/watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 3600 --label-enable   # only update labeled containers

volumes:
  caddy_data:
  caddy_config:
```

### 14.3 Caddyfile

```
dnd.example.org {
    reverse_proxy app:3000
}
```

Auto-HTTPS via Caddy (use the user's domain + DNS, e.g. deSEC). **Tailscale** is a valid alternative: skip Caddy/public exposure and reach the app over the tailnet.

### 14.4 Watchtower

Watches only `watchtower.enable=true` containers (the app). On a new `:latest` push from CI, Watchtower pulls and recreates the app container. Pin a digest tag if you ever want manual control; default flow is auto.

### 14.5 .github/workflows/release.yml (sketch)

Build the image, log in to GHCR with `GITHUB_TOKEN`, push `:latest` (and a `:sha` tag) on push to `main`. Watchtower handles deployment on the NAS.

---

## 15. Roadmap / phasing

**v1 — Playable core (hotseat)**
- Vault adapter + schemas; character sheet render/edit; inventory.
- Engine: dice, ability checks, saves, attacks, damage/HP, initiative/turns.
- LLM loop with tools; visible dice log; Czech narration.
- AI companions + AI enemies (unified actor model).
- Basic tactical grid (tokens, movement validation, distance); theater-of-mind fallback.
- Piper TTS (Czech).
- Docker + Watchtower + Caddy deployment.

**v2 — Depth**
- Spells: slots, concentration, spell attacks/saves; conditions; resistances/immunities.
- Full tactical grid: terrain, cover, AoE templates, line-of-sight.
- Overworld map (Leaflet), point-crawl travel, fog of war, `show_location`.
- Short/long rest; encounter notes drive combat setup.

**v3 — Reach**
- Networked multiplayer (WS + identity + presence) on top of the existing command/state seam.
- Leveling automation.
- Campaign import: AI-assisted parsing of adventure PDFs → location notes + encounter JSON (private use).
- Optional generated map art (requires an image model + GPU; out of scope for NAS-only).

---

## 16. Testing & quality

- **Engine unit tests are mandatory and extensive.** The whole trust model rests on the engine. Use seeded RNG to assert exact outcomes (e.g. given seed X, `attack` yields a specific to-hit and damage). Cover edge cases: crits, resistances, advantage stacking, difficult-terrain movement, AoE coverage, concentration breaks, death saves.
- **Schema tests:** every example vault note round-trips through `zod` without losing unknown fields.
- **LLM-loop integration tests:** mock the LLM to emit known tool calls; assert the engine + state respond correctly and the log is accurate.
- **No mechanic may be implemented only in a prompt.** If a rule matters, it lives in the engine with a test.

---

## 17. Licensing & content notes

- Rules content: **D&D 5e SRD 5.1** is available under CC-BY-4.0 / OGL. Use an SRD JSON dataset (see Appendix B) for monsters, spells, equipment, conditions. Attribute per the license.
- Maps/adventures: self-generated or CC/OGL preferred; commercial published material is for private play only and must not be redistributed with the project.
- Keep a `THIRD-PARTY` / `LICENSES` file listing SRD source and library licenses.

---

## 18. Open questions for the implementer

1. **Piper image:** choose the concrete Piper deployment (a plain-HTTP Piper server vs Wyoming + HTTP adapter) and pin the cs_CZ voice model. Wire `PIPER_URL` accordingly.
2. **LLM provider specifics:** confirm Mistral's exact tool-calling request/response schema (and OpenRouter's, if used) and pin SDK versions. Verify the current Mistral model id (default given is `mistral-medium-3.5`).
3. **SRD dataset:** pick and pin the SRD JSON source (Appendix B), decide bundle-in-image vs mounted volume.
4. **Auth:** confirm whether even a single shared `BASIC_AUTH` gate is wanted, or rely solely on Tailscale/network isolation.
5. **State store:** session state is JSON files by default (portable). If combat performance demands it, an embedded SQLite is an acceptable internal upgrade — but the vault stays file-first.
6. **Dice library vs custom:** evaluate `@dice-roller/rpg-dice-roller` against a small custom parser for full control over advantage/crit semantics.

---

## Appendix A — Theme: dark-fantasy palette (CSS custom properties)

A bespoke dark-fantasy theme: deep, slightly warm charcoal/stone **neutrals** (candlelit-dungeon feel, not cool blue-grey) with a **gold / ember / blood / parchment** accent system on top. Primary accent is **aged gold**, never purple — mauve is kept only for arcane/active semantics.

```css
:root {
  /* Structural neutrals — warm charcoal & stone (backgrounds, surfaces, text) */
  --bg-base:   #1a1714;  /* warm near-black */
  --bg-mantle: #13100e;
  --bg-crust:  #0c0a09;
  --surface0:  #2a2521;  /* raised stone */
  --surface1:  #3a342e;
  --surface2:  #4a423a;
  --text:      #e8e0d3;  /* warm bone-tinted off-white */
  --subtext1:  #c4b9a8;
  --subtext0:  #9b8f7e;

  /* Dark-fantasy accent system */
  --gold:      #c9a227;  /* PRIMARY: headings, key actions, framing (NOT purple — avoids the AI-purple tell) */
  --ember:     #d97a34;  /* warm highlights, hover, fire/AoE */
  --blood:     #9b2226;  /* damage, danger, hostile tokens */
  --steel:     #5a7a99;  /* party/ally tokens */
  --verdigris: #4a8f7b;  /* secondary party / nature accent, healing */
  --parchment: #e7dcc2;  /* character-sheet surface */
  --ink:       #2a2118;  /* text on parchment */
  --arcane:    #b58cf0;  /* MAGIC ONLY: spell slots, magic items, active-actor ring */
  --bone:      #d8cdb4;  /* subtle light detail, dividers */
}
```

Semantic mapping: primary UI framing + key actions = **gold**; party/ally tokens = **steel/verdigris**; hostile tokens + damage = **blood**; healing = **verdigris**; AoE/fire overlays = **ember** (translucent); active-actor ring + spell slots + magic items = **arcane**. Character sheets render on a **parchment** surface with **ink** text.

## Appendix B — SRD data & key libraries

- **SRD data:** `5e-bits/5e-database` (JSON: monsters, spells, equipment, conditions, rules; SRD-licensed) — recommended. Alternative: the Open5e API/dataset.
- **Libraries:** Fastify, React, Vite, Zustand, Tailwind, Leaflet, zod, gray-matter, yaml, seedrandom, `@dice-roller/rpg-dice-roller`, OpenAI-compatible LLM SDK (pointed at Mistral/OpenRouter), a display + body serif pairing (Appendix A / §12), and an icon set (game-icons.net or RPG-Awesome).

---

*End of specification. The implementing agent should treat §2 (core principles), §6–§8 (data model + engine), and §14 (deployment) as load-bearing. When in doubt, favor determinism, file portability, and the visible dice log.*
