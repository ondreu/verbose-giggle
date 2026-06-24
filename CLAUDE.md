# CLAUDE.md — orientation for AI Dungeon Master

Self-hosted, AI-driven Dungeon Master for **D&D 5e (SRD 5.1)**. pnpm monorepo,
TypeScript everywhere, Czech player-facing UI.

## Workspaces
- `packages/schemas` (`@adm/schemas`) — zod schemas + Czech label maps
  (`src/labels.ts`). The single source of truth for shapes and player-facing
  strings.
- `packages/srd` (`@adm/srd`) — minimal SRD types + pure typed accessors
  (`createSrdIndex`). Ships **no** bundled data: the dataset is loaded from the
  in-repo JSON under `packages/srd/data` (the server's `loadSrdDataset`, #45a) or
  an external mount; the engine's own tests pass an inline fixture subset
  (`packages/engine/test/srd-fixtures.ts`).
- `packages/engine` (`@adm/engine`) — the deterministic rules engine. **Pure**:
  no IO/network/LLM. `(GameState, tool, args) → mutated state + log entries`.
  All randomness goes through `rng`. Tools are defined in `src/tools.ts`
  (`dispatch` is the only path to mutate state).
- `apps/server` (`@adm/server`) — Fastify API + session/vault management + LLM
  loop. Owns the vault on disk.
- `apps/web` (`@adm/web`) — React + zustand + Tailwind + Leaflet UI.

## Commands
- `pnpm install`
- `pnpm -r build` — build all (cross-package types need this before typecheck)
- `pnpm -r test` — vitest across packages
- `pnpm -r typecheck`
- Dev: `pnpm dev:server`, `pnpm dev:web`

## Core conventions (do not break)
- **Determinism / trust surface:** the LLM never writes state or invents
  numbers. It only calls engine tools; every roll/HP/condition change is logged
  to the visible dice log. Narration must describe the tool that actually ran
  (#12). See `apps/server/src/llm/prompt.ts` for the hard rules.
- **Turn flow:** `apps/server/src/session/loop.ts` → `executeToolLoop` → the
  model emits tool calls → `SessionManager.applyTool` → `engine dispatch` →
  results fed back → final narration. `manager.applyTool` also runs
  `checkCampaignEnd` (solo-death game over, #23).
- **State persistence:** mutable actor state lives in the session overlay
  (`session.json`); durable sheet changes flush to actor notes only out of
  combat. `buildGameState` resolves base note + overlay.
- **Language:** ids stay English (SRD ids, slugs); everything shown to the
  player is Czech and routed through `@adm/schemas` labels
  (`csAbility`/`csAbilityAbbr`, `csSkill`, `csCondition`/`csConditionDesc`,
  `csDamage`, `csAoe`). No two-letter Czech shorthand in the UI (#4).
- **Engine purity:** keep `packages/engine` free of IO; pass campaign-derived
  config in via `GameState.variant` (e.g. `gridShape`).
- Add a vitest test for any engine rule or pure helper you add.

## Vault layout (per campaign)
`<vault>/campaigns/<folder>/` with `campaign.yaml`, `characters/`, `bestiary/`,
`companions/`, `locations/`, `encounters/`, `items/`, `quests/`, `lore/`,
`maps/`, and `state/` (session.json, snapshots, session-log.md). Bestiary notes
reference SRD via `srd_ref:`. Quest notes (`quests/*.md`, #19) are authored
templates; live progress lives in `session.quests`.

## Shared world layer (`<vault>/worlds/<name>/`, #49)
A **world** exists independently of campaigns; a campaign opts in via
`campaign.yaml` → `world: <name>`. `loadWorld` (`apps/server/src/vault/world.ts`)
loads `locations/`, `factions/`, `npcs/`, `lore/` (+ `lore/events/`), and
`loadCampaign` merges it **under** the campaign (campaign wins on id collision;
no `world:` = unchanged). Entities: `FactionSchema`/`WorldEventSchema`/`NpcSchema`
in `@adm/schemas`. Live faction progress/relationships, triggered world events,
and location danger live in the session overlay (`session.factions` /
`world_events` / `location_danger`), seeded from the authored notes and mutated
ONLY through engine tools `faction_advance` / `faction_relation` /
`world_event_trigger` / `location_danger` (same determinism contract as #12/#19).
The example world is `data/vault.example/worlds/marka-havrani/`.

Per-campaign toggle `world_shared` (default false): when **false** each campaign
keeps its OWN isolated world-state copy in its session; when **true** the campaign
reads/writes the SHARED `worlds/<name>/state/world.json` so faction progress and
events carry across campaigns in the same world (`apps/server/src/vault/world-state.ts`,
hydrated/flushed by `SessionManager`). The forge picker lists worlds via
`GET /api/worlds` and passes `world` + `world_shared` to `forgeCampaign`.

## Git
Develop on the branch assigned for the session (set per task). Commit per logical
change; keep the ROADMAP checkboxes in sync (`[x]` done, `[~]` partial, `[N/A]`).

---

## Current focus

The SRD/content/world milestones are **done** (#13/#14/#19/#20/#21/#49 and the
rest of the changelog). The open direction is the accounts/credits/multi-tenant
push (#55–58), i18n (#48), and the #45 bundling/translation partials. See
`ROADMAP.md` → "Open work" for the prioritized list and current checkbox state.

### SRD loader (reference)
- `apps/server/src/srd/load.ts` — `loadSrdDataset(dir)` recursively finds JSON by
  exact `5e-SRD-<Category>.json` name and maps records. Loads monsters, spells,
  equipment, races, subraces, classes, subclasses, features, traits, feats,
  magic-items, proficiencies and languages (tolerant of missing files). Mappers
  mirror 5e-bits/5e-database field names → our minimal types in
  `packages/srd/src/types.ts`.
- `packages/srd/src/index.ts` exposes `createSrdIndex(overrides)` with per-id
  accessors (`monster`/`spell`/`race`/`class`/`feat`/…) plus a `list.*()` per
  category. New categories need new types + accessors here.
- Dataset source + which files to mount: `docs/SHOWCASE.md` §3 (repo
  <https://github.com/5e-bits/5e-database>, files under `src/2014/en/`; this
  project targets **SRD 5.1 / 2014**, not 2024). Keep filename matching specific
  to avoid lookalikes (`Spells`≠`Spellcasting`, `Equipment`≠`Equipment-Categories`).
