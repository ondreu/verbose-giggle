# CLAUDE.md — orientation for AI Dungeon Master

Self-hosted, AI-driven Dungeon Master for **D&D 5e (SRD 5.1)**. pnpm monorepo,
TypeScript everywhere, Czech player-facing UI.

## Workspaces
- `packages/schemas` (`@adm/schemas`) — zod schemas + Czech label maps
  (`src/labels.ts`). The single source of truth for shapes and player-facing
  strings.
- `packages/srd` (`@adm/srd`) — minimal SRD types + a tiny built-in dataset
  (`src/data.ts`) used when no external SRD is mounted.
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

## Git
Develop on branch **`claude/upbeat-gauss-05q0pf`**. Commit per logical change;
keep the ROADMAP checkboxes in sync (`[x]` done, `[~]` partial, `[N/A]`).

---

## NEXT SESSION: consume the SRD dataset (#20 → #21 → #19)

Goal: load more of the 5e-bits/5e-database dataset so character creation (#14)
and leveling (#13) can draw on real races/classes/feats/spells, then mine
descriptive data for tooltips/localization, then build quest tracking.

### Where the SRD loader lives
- `apps/server/src/srd/load.ts` — `loadSrdDataset(dir)` recursively finds JSON
  by exact `5e-SRD-<Category>.json` name and maps records. **As of #20 it loads
  monsters, spells, equipment, races, subraces, classes, subclasses, features,
  traits, feats, magic-items, proficiencies and languages** (tolerant of missing
  files). Mappers mirror the 5e-bits/5e-database field names → our minimal types
  in `packages/srd/src/types.ts`.
- `packages/srd/src/index.ts` exposes `createSrdIndex(overrides)` with per-id
  accessors (`monster`/`spell`/`race`/`class`/`feat`/…) plus a `list.*()` for
  enumerating each category. New categories need new types + accessors here.
- The dataset source + which files to mount: `docs/SHOWCASE.md` §3 (repo
  <https://github.com/5e-bits/5e-database>, files under `src/2014/en/`, this
  project targets **SRD 5.1 / 2014**, not 2024).

### #20 — load the rest (the actual next task)
Add typed accessors in `@adm/srd` + mappers in the loader for: Races/Subraces,
Classes/Subclasses/Features/Traits, Feats, Magic-Items, Proficiencies/Languages.
Gotchas (from the roadmap):
- Be **tolerant of missing files** — the 3-file minimal setup must still work.
- Keep filename matching **specific** to avoid lookalikes: `*spell*` also matches
  `Spellcasting`, `*equipment*` also matches `Equipment-Categories`. Match exact
  names (e.g. `5e-SRD-Races.json`) rather than broad `/race/i` where ambiguous.
- Gate loading behind the features that use it so cost is only paid when needed.
- Then deepen #14 (creation) and #13 (leveling) to use it (subrace/subclass/
  feats/spell lists).

### #21 — mine descriptive/reference data
Damage types, conditions, weapon properties, magic schools, alignments, ability
scores, rules sections, skills/levels → feed Czech labels in
`packages/schemas/src/labels.ts` (prefer build-time extraction over runtime) and
tooltips/rules-reference UI. Supports #4 and the condition tooltips already in
the sheet (`CONDITION_DESC_CS`).

### #19 — automatic quest tracking (after SRD)
New `quest` entity (`quests/*.md` + schema in `@adm/schemas`), engine tools
`quest_start`/`quest_advance`/`quest_complete`/`quest_fail` (validated, logged),
DM prompt auto-detects triggers, and a quest-log UI panel. Live progress in
session state.

See `ROADMAP.md` for the full list and current checkbox state.
