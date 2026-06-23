# Roadmap — priority fixes

Source: live playtest feedback (2026-06-22). The engine, dice log, and AI DM
were reported to work well; the items below are the gaps to close, ordered by
priority. File pointers are starting points, not the whole change.

> **What already works well (keep):** deterministic engine, visible dice log,
> the AI DM loop.

---

## ⚠️ P0 — Read first: deployment may be running a stale image

Several complaints below (no Settings panel, no voice config, image-generation
button "missing") describe features that **already exist in the latest image**
(added in PR #5 / #6). If the NAS is running an older `ghcr.io/ondreu/ai-dungeon-master`
image, none of them appear. **Before triaging UI items, confirm the running
image is current** (see `docs/SHOWCASE.md` → "Deploying & updating"). Verify in
the running container: `apps/server/dist/index.js` should contain the string
`Vault has no campaigns` (the post-fix error path). If it doesn't, the box is
on old code and items **#15, #17, #18** are likely already resolved by updating.

---

## P0 — Blocking playability

- **[x] #8 — Wizard's spells are not visible / castable.** Done. The character
  sheet now renders `actor.spells_known` as cast buttons right under the spell
  slots (`apps/web/src/panels/SheetPanel.tsx`); clicking sends a cast action
  through the DM loop (and the engine validates the spell against the sheet per
  #29). The universal Actions panel already listed them too.
- **[x] #12 — Narration diverges from the mechanic that ran (determinism leak).**
  Done. (a) The fall-back-to-unarmed root cause is closed by #29 (the engine now
  refuses a spell not on the sheet) and #8 (spells are visible/castable), so the
  intent→tool mapping no longer silently degrades to unarmed. (b) The DM system
  prompt gained hard rules: narrate exactly the tool that executed (never swap
  an unarmed strike for a spell), no silent substitution, a tool error/miss must
  read as failure in prose. Friendly-fire is now blocked deterministically — the
  engine `attack` refuses a strike on a party/ally member unless `allow_friendly`
  is set after explicit player confirmation (`packages/engine/src/combat.ts`,
  `tools.ts`, prompt in `apps/server/src/llm/prompt.ts`). Covered by engine tests.
- **[x] #16 — Combat shows only your own HP.** Done. The turn tracker
  (`apps/web/src/panels/TurnTracker.tsx`) now renders a faction-coloured HP bar
  + current/max number for every combatant in the initiative order (live HP from
  the session overlay), so the whole fight's state is visible at a glance.
- **[x] #6 — Maps render nothing.** Done (earlier work). The Leaflet overworld
  binds `current_location` → marker + camera and draws the `world_map` overlay
  (`apps/web/src/map/OverworldMap.tsx`); the tactical grid renders tokens,
  terrain, and the battle-map backdrop (`TacticalGrid.tsx`). (Hex-grid is #6b.)
- **[x] #17 — Voice (TTS) doesn't play.** Closed (not a code issue). The full
  path works (`/api/tts`, Azure→Piper fallback, client `speak`); playback simply
  needs an Azure key/region (or Piper) configured and a current image. Voice
  controls/markdown-stripping shipped in #27/#30.
- **[x] #22 — Settings do not persist (model resets on reload).** Done.
  Server-owned settings (model, Azure keys, campaign) persist to `settings.json`;
  the client-only voice toggles (`ttsEnabled`, `ttsProvider`) persist to
  `localStorage` and rehydrate on boot (`apps/web/src/store/store.ts`).
- **[x] #23 — Character cannot die; death saving throws have no consequence.**
  Done. A third failed death save marks the actor `dead`
  (`packages/engine/src/combat.ts` → `markDead`) and removes them from
  initiative (`removeFromCombat` in `turns.ts`). The campaign only **ends for a
  single-character campaign** when its lone hero dies — multi-character parties
  play on; `checkCampaignEnd(state, roster)` makes this decision from the
  config party roster (called in `SessionManager.applyTool`). On an ending the
  loop stops (`resolveAiTurns`), `/api/action` refuses input (409), the death
  flag persists via the session overlay, and the web app shows a game-over
  screen (`GameOverModal`) offering **create a new character**, load-last-save,
  or main menu. Creating a replacement retires the fallen hero from the roster
  (`removeFromParty`), clears `session.ending`, and resumes play with the
  newcomer.
- **[x] #29 — AI validates ability use against the character sheet; HP not
  updated.** Done. (a) `castSpell` now refuses a spell that isn't on a player
  character's `spells_known` list — no slot spent, refusal logged, monsters
  bypass (statblock casting) (`packages/engine/src/spells.ts`); the DM prompt
  gained a "SCHOPNOSTI PODLE LISTU POSTAVY" section instructing the model to
  decline abilities/spells/features the actor doesn't have and never substitute
  a fake tool (`apps/server/src/llm/prompt.ts`). (b) confirmed the `heal` tool
  writes HP into session state via the overlay, and the prompt now forbids
  narrating any HP change without first calling heal/cast_spell. Pairs with #8
  (spell list) and #12 (determinism), which remain open.

## P1 — Important correctness & UX

- **[x] #1 — Render Markdown from the LLM in chat.** Done (earlier work). DM
  narration renders through the safe `<Markdown>` component (bold/italic/lists/
  headings/hr/inline-code) in `apps/web/src/panels/ChatPanel.tsx`.
- **[x] #9 — Show who is acting instead of "Hráč".** Done (earlier work). Player
  narration lines carry the acting character's name (`store.ts` adds `actor`),
  and the chat shows it, falling back to "Hráč" only when unknown.
- **[x] #10 — Verify action economy.** Done (earlier work). Action/bonus/
  reaction/movement limits are enforced in `spendEconomy`/`dispatch`
  (`packages/engine/src/tools.ts`) with the turn budget reset per turn
  (`turns.ts`); covered by `packages/engine/test/economy.test.ts`.
- **[x] #4 — Remove leftover English UI text and abbreviations.** Done. The
  two-letter Czech shorthand (SIL/OBR/ODL/MDR) is gone: `ABILITY_CS` now holds
  full Czech names (Síla, Obratnost…) and a new `ABILITY_ABBR`/`csAbilityAbbr`
  gives the standard international STR/DEX/CON for compact grids and the dice
  log. All call sites route through `labels.ts` — SheetPanel/CharacterCreate
  ability grids (abbrev + full-name tooltip), LevelUpModal, and the engine
  dice-log checks/saves (which also now localise the condition list). The
  hardcoded "Unarmed Strike" fallback reads "úder beze zbraně". (SRD-sourced
  weapon/spell names stay English pending the localization pass in #21.)
- **[x] #2 — Start-up / home menu.** Done (earlier work). `StartMenu` is the
  first-run home view: open Settings, switch/create/forge a campaign, manage
  campaigns (#35), roll back (snapshots), and enter play. Campaign create/forge
  endpoints write into the vault (`apps/server/src/routes/game.ts`).
- **[x] #14 — Character creation GUI (BG3-style guided flow).** Done, then
  deepened with #20. `CharacterCreate` guides race (+subrace) → class → ability
  scores → skills → spells and writes a valid actor note + party enrolment
  (`apps/server/src/vault/creation.ts`, `creation.test.ts`). When an SRD dataset
  is mounted, `creationOptions(srd)` enriches with real **subraces** (ability
  bonuses + traits), per-class **spell lists** (cantrips + level-1 picker,
  capped), **subclasses** and **feats**; `createCharacter` applies subrace
  bonuses, records racial traits/level-1 features + languages, and validates
  spells against the class list. Sheets store SRD ids (race/class), localized in
  the UI via `csLineage`/`csClass`. Falls back to the hardcoded base without a
  dataset.
- **[x] #13 — Level-up GUI and engine-driven leveling.** Done, then deepened with
  #20. Leveling is engine-driven (`packages/engine/src/leveling.ts` +
  `leveling.test.ts`): `award_xp` auto-levels across thresholds; `level_up` now
  also grants the class/subclass **features** for the new level
  (`featuresAtLevel`), and new `choose_subclass` / `grant_feat` tools handle
  subclass selection (validated, backfills features) and feats. The `LevelUpModal`
  fetches `/api/level-up/options` (SRD spell list + subclasses + feats) and
  guides HP/ASI-or-feat/subclass/spells through `/api/level-up`. `spellMod` uses
  the SRD class's spellcasting ability when mounted.
- **[x] #15 — Image generation is undiscoverable.** Done (earlier work). The
  "vizualizovat" (chat) and "portrét" (sheet) actions use a clear `camera` icon
  and sit as visible toolbar buttons. `ChatPanel.tsx`, `SheetPanel.tsx`,
  `components/Icon.tsx`.
- **[x] #24 — Time does not pass during travel or conversation.** Done. New
  `packages/engine/src/time.ts` `advanceTime` rolls hours into days on a 24h
  clock and logs the passage. A `time_advance` engine tool lets the DM advance
  the clock for downtime/conversation; `travel` now takes a journey duration and
  advances it; short/long rest advance 1h/8h. The DM prompt instructs the model
  to advance time outside combat, and the scene snapshot now lists authored
  travel durations ("Cesty odsud") from the location's connections so the model
  uses real numbers. The in-world date/time was already shown in the app header.
- **[x] #25 — "Shrnutí" and "Vrátit tah" share the same icon.** Done. Added two
  distinct icons (`undo` curved back-arrow, `document` lined page) to
  `Icon.tsx`; the chat toolbar now uses `undo` for Vrátit tah and `document` for
  Shrnutí (the diary keeps the scroll), so the two are easy to tell apart.
- **[x] #26 — Deník (journal) does not render Markdown.** Done. `DiaryModal`
  now renders the diary through the shared safe `<Markdown>` component (the same
  one used in chat, #1) instead of a raw `<pre>`, so headings/bold/lists format
  properly. `apps/web/src/panels/DiaryModal.tsx`.
- **[x] #27 — TTS reads Markdown formatting aloud.** Done. `speak()` now runs
  narration through a `stripMarkdown` helper (emphasis/code/headings/lists/
  quotes/links) before hitting `/api/tts`, so the voice reads clean prose.
  `apps/web/src/store/store.ts` (+ unit tests).
- **[N/A] #28 — Visualization context menu renders under the map (z-index).**
  Not applicable in the current UI: there is no right-click/dropdown menu — the
  "vizualizovat" action is a plain toolbar button that opens a full-screen
  `ImageModal` (`z-[…]` overlay), so nothing is clipped behind the map. Revisit
  only if a `ContextMenu` is introduced.
- **[x] #30 — Extended voice controls.** Done. The in-flight narration audio is
  tracked so `stopSpeech` can cancel it mid-sentence (a "stop" button appears
  while speaking), and a one-click engine toggle (auto → Azure → Piper) in the
  chat toolbar is persisted to `localStorage` and honoured server-side via a
  `provider` field on `/api/tts`. `apps/web/src/store/store.ts`,
  `apps/web/src/panels/ChatPanel.tsx`, `apps/server/src/routes/game.ts`.

- **[x] #38 — Target picker for spells/actions that need a target.** Done (list +
  free-text); map click-to-target remains a stretch goal. Clicking a spell (sheet
  #8 or Actions panel) or an attack (Actions panel) now opens a `TargetPicker`
  (`apps/web/src/components/TargetPicker.tsx`):
  - **[x] Pick from a list:** a popover of living scene actors, grouped and
    faction-coloured (Nepřátelé vs Spojenci, self flagged "(ty)"), with HP. The
    chosen actor id is woven into the action text (`na <jméno> (<id>)`) so the DM
    loop resolves it through the engine (which enforces spell-sheet validation
    #29 and friendly-fire confirmation #12). Attacks force a target; spells allow
    "no specific target" (self / AoE).
  - **[x] Type a name/target:** a free-text field for off-board / improvised
    targets, passed through as named intent.
  - **[x] Click-to-target on the tactical map (stretch):** Done. The picker is
    now a non-modal floating card driven by the store (`requestTarget`/
    `resolveTarget`, `targetRequest`), so while it's open the player can click a
    token on the tactical map (square or hex) to set the target — tokens
    highlight and use a crosshair cursor in targeting mode (`TacticalGrid.tsx`).

## P2 — Polish & feel

- **#3 — Modernize the UI; tasteful subtle effects.** Light motion/elevation,
  better spacing/hierarchy — **without AI-slop** (no emoji, no generic gradients
  for their own sake; keep the dark-fantasy intent in `theme/tokens.css`).
- **#7 — Font legibility.** The display font is pretty but hard to read; bump
  weight/size a touch for body text and lean on Markdown (#1) for structure.
- **[x] #11 — Resizable UI panels.** Done. The three-column play surface is now
  a `PlaySurface` component (`apps/web/src/components/PlaySurface.tsx`) with
  draggable splitters between chat/map and map/rail; widths are stored as
  fractions in `localStorage` (so they survive window resizing) and clamped to
  sane minimums. Below `lg` the columns stack as before (no splitters).
- **[x] #6b — Hex grid for the tactical map.** Done (opt-in via `grid.shape`).
  Engine: odd-r hex coords with `hexDistanceFt`/`hexNeighbors`, a shape-aware
  `gridDistanceFt`, and `move`/`reachableCells` that walk 6 neighbours on hex
  grids; attack adjacency and the AoE sphere honour hex distance too
  (`packages/engine/src/grid.ts`). Schema gained `combat.grid.shape`
  (`square`|`hex`, default square) and `start_combat` accepts it. Render:
  `TacticalGrid` draws a pointy-top hex board (floor/terrain/reachable/AoE/
  tokens/click) when the grid is hex. Square remains the default; covered by
  engine tests. A **campaign-level default** is authorable via
  `campaign.yaml` → `variant_rules.grid_shape: hex`, threaded through
  `GameState.variant.gridShape` so `start_combat` inherits it unless overridden.
- **[x] #39 — More granular / detailed tactical battle map.** Done (core). The
  default board is roomier (16×12 in `start_combat`), and `TacticalGrid` gained
  **zoom** (50–250 %, via a crisp SVG `viewBox` so it stays sharp) and a **hand
  tool for drag-panning** the board, plus native scroll. `cell_ft` stays honest
  for distance math. **Multi-cell creatures** render with an n×n footprint from
  `actor.size` (Large 2×2, Huge 3×3, Gargantuan 4×4) on the square board.
- **#5 — Bigger, better showcase vault.** More locations/NPCs/encounters/lore so
  the demo sells the experience. Build guide in `docs/SHOWCASE.md`; the showcase
  vault content can be authored and dropped into `data/vault.example` (or a new
  `data/vault.showcase`).
- **[x] #31 — DM campaign intro and "how to begin" prompt.** Done. A new
  `CAMPAIGN_START` instruction (`apps/server/src/llm/prompt.ts`) has the DM set
  the scene (world/location/hook) in a few sentences and then explicitly ask the
  player how they want to begin. `runIntro` (`apps/server/src/session/loop.ts`)
  runs it through the tool loop and records the intro as an assistant message;
  the `/api/intro` endpoint fires it once (no-op if any chat history exists), and
  the web app calls it on entering play with empty narration. The offline mock
  narrator has a matching opening-scene branch. Covered by a server test.
- **#32 — Streaming / lazy-loading of AI text.** AI narration currently appears
  all at once after the full response arrives. Stream tokens to the client as
  they are generated (server-sent events or WebSocket stream) so text appears
  progressively. This also makes long responses feel faster. Server: switch the
  Claude call to streaming mode; client: append tokens to the chat line as they
  arrive. `apps/server/src/llm/`, `apps/web/src/store/store.ts`.
- **[x] #33 — Ability-check chips in chat: larger and with dice animation.**
  Done. The inline roll cards (`RollLine` in `apps/web/src/panels/ChatPanel.tsx`)
  are now bigger and bolder — a 2px faction-coloured border with a soft tint, a
  larger d20 in a tinted ring that spins in via the existing `dice-rolling`
  keyframes, plus a `log-enter` pop on arrival and an emphasized outcome word.
- **[x] #34 — Character condition/status indicator on the sheet.** Done. The
  sheet's condition chips are now tappable: clicking one expands its Czech rules
  description (and the text is also a hover tooltip). Descriptions live in
  `CONDITION_DESC_CS` / `csConditionDesc` in `packages/schemas/src/labels.ts`
  (can later be backfilled from the SRD Conditions dataset, #21).
  `apps/web/src/panels/SheetPanel.tsx`.
- **[x] #35 — Campaign management screen.** Done. A `CampaignManager` modal
  (opened via a per-campaign "spravovat" button in the start menu) lists the
  vault files (read-only), exports the folder as a `.zip`, and deletes a campaign
  (the active one is refused). Server endpoints `GET /api/campaigns/:folder/files`,
  `GET /api/campaigns/:folder/export`, `DELETE /api/campaigns/:folder` (all
  path-confined). ZIP is built by a dependency-free STORE-method writer
  (`apps/server/src/vault/zip.ts`); verified with `unzip -t` and a server test.
- **[x] #36 — Favicon.** Done. Added a thematic gold-D20-on-dark
  `apps/web/public/favicon.svg` and referenced it from `index.html`, so the tab
  no longer shows the generic globe. (SVG favicon covers modern browsers; a
  legacy `.ico` can be added later if needed.)
- **[x] #37 — AI-generated campaign map.** Done (manual trigger). A "Mapa (AI)"
  button on the active campaign in the start menu calls `POST /api/campaigns/map`,
  which builds an overworld-map prompt from the campaign name + authored
  locations (`buildMapPrompt`), generates via the existing `ImageClient`, stores
  the bytes in the vault (`maps/overworld-ai.<ext>`), and points
  `campaign.world_map` at it — so it shows as the overworld backdrop. Fully
  optional: missing image config or an upstream failure surfaces an error and
  leaves the campaign untouched.

---

## New features

- **#19 — Automatic quest tracking.** Track quest state without the player
  managing it by hand, and without the LLM inventing progress.
  - **Data:** add a `quest` entity — authored as `quests/*.md` notes
    (frontmatter = id, title, giver, status `active|completed|failed`,
    `objectives: [{ id, text, done }]`; body = flavour) and add a schema in
    `packages/schemas` (alongside Location/Encounter/etc.). Live progress lives
    in session state so it persists per playthrough.
  - **Mutation through the engine (determinism):** the LLM never edits quest
    state as free text. Add engine tools — e.g. `quest_start`, `quest_advance`
    (tick an objective), `quest_complete`/`quest_fail` — validated with `zod`
    and appended to the visible log like every other mutation
    (`packages/engine/src/tools.ts`, `apps/server/src/session/*`). The DM loop
    calls them when narration implies a state change, so the log shows e.g.
    *"Quest 'Goblins of the Mill' → objective 'Find the boss' complete."*
  - **Auto-detection:** prompt the DM to recognise quest triggers (accept,
    progress, resolve) from player actions and authored hooks (a location's
    `encounter_table`, lore notes) and call the tools — surfaced for audit in
    the dice/event log, never silently.
  - **UI:** a quest log panel/modal (active vs completed, objective checklist),
    plus a subtle "new/updated quest" cue in chat. New panel under
    `apps/web/src/panels/`, wired to session state via the store.
  - Pairs with the start-up menu (#2) and the showcase vault (#5 — author a few
    quests so it demos).

- **[x] #20 — Consume the rest of the SRD dataset.** Done. The loader
  (`apps/server/src/srd/load.ts`) now maps Races/Subraces, Classes/Subclasses/
  Features/Traits, Feats, Magic-Items, and Proficiencies/Languages on top of the
  original monster/spell/equipment categories, with matching tightened to the
  exact `5e-SRD-<Category>.json` names (case-insensitive, `5e-SRD-` prefix
  optional) so the lookalike traps no longer leak — `Spells`≠`Spellcasting`,
  `Equipment`≠`Equipment-Categories`, `Feats`≠`Features`, `Races`≠`Subraces`.
  New zod types + typed get/`list` accessors live in `@adm/srd`
  (`packages/srd/src/types.ts`, `index.ts`); `SrdOverrides`/`emptyOverrides()`
  carry the extra maps and the `SessionManager` threads them into
  `createSrdIndex`. Tolerant by design: missing files are fine, so the 3-file
  minimal setup still works (covered by `apps/server/test/srd.test.ts`). The
  data is now **consumed**, not just loaded: creation (#14) and leveling (#13)
  use races/subraces/classes/subclasses/spell-lists/feats; spells map full
  mechanics (damage scaling by slot/level, attack type, save effect, healing);
  class starting equipment is granted and AC is derived from armor; monster
  statblocks carry special/legendary/reaction + save-based actions; magic items
  resolve as loot; and the `lookup` tool exposes every category to the DM.
  Originally:
  - **Races / Subraces** (`5e-SRD-Races.json`, `5e-SRD-Subraces.json`) — ability
    bonuses, speed, traits; feeds character creation (#14).
  - **Classes / Subclasses / Features / Traits** (`5e-SRD-Classes.json`,
    `5e-SRD-Subclasses.json`, `5e-SRD-Features.json`, `5e-SRD-Traits.json`) —
    class progression, proficiencies, features by level; feeds character
    creation (#14) and the level-up GUI (#13).
  - **Feats** (`5e-SRD-Feats.json`) — selectable at creation/level-up (#13/#14).
  - **Magic items** (`5e-SRD-Magic-Items.json`) — new category + a `mapMagicItem`
    mapper and an `srd_ref`-style hook for item notes / loot.
  - **Proficiencies / Languages** (`5e-SRD-Proficiencies.json`,
    `5e-SRD-Languages.json`) — round out character creation.
  - **Work:** add typed accessors in `@adm/srd` + mappers in the loader
    (mirroring `mapMonster`/`mapSpell`/`mapEquipment`), tolerant of missing
    files so the 3-file minimal setup still works. Keep matching specific
    (avoid the `*spell*`/`*equipment*` lookalike traps, e.g. Spellcasting,
    Equipment-Categories). Gate behind the features that use them so loading
    cost is only paid when needed. Unlocks **#13** and **#14**.

- **#21 — Mine the descriptive/reference SRD data (tooltips, localization, rules
  lookup).** The remaining files hold no new mechanics — those stay hardcoded in
  the engine — but their *descriptions and names* are worth extracting for the
  UI, Czech localization, and grounding the DM:
  - **Damage types & resistance** (`5e-SRD-Damage-Types.json`) — the resistance
    mechanic lives in `packages/engine/src/combat.ts`; mine the list +
    descriptions to (a) verify the engine's `DamageType` enum is complete and
    (b) drive player-facing tooltips/Czech labels (e.g. *bludgeoning → drtivé*).
  - **Conditions** (`5e-SRD-Conditions.json`) — engine owns the effects; surface
    the official descriptions as hover tooltips on the condition chips (sheet),
    so players see what *Prone/Restrained/…* does.
  - **Weapon properties** (`5e-SRD-Weapon-Properties.json`) — descriptions for
    tooltips (finesse, versatile, reach…) on equipment.
  - **Magic schools, alignments, ability scores** (`5e-SRD-Magic-Schools.json`,
    `5e-SRD-Alignments.json`, `5e-SRD-Ability-Scores.json`) — label/description
    sources for tooltips and the Czech label maps (`packages/schemas/src/labels.ts`).
  - **Rules / rule sections** (`5e-SRD-Rules.json`, `5e-SRD-Rule-Sections.json`)
    — an in-app, searchable rules reference panel, and optional grounding text
    the DM can cite (read-only; never a source of authoritative numbers).
  - **Skills / levels** (`5e-SRD-Skills.json`, `5e-SRD-Levels.json`) — use to
    cross-check the hardcoded skill→ability map and XP/proficiency tables, and
    as a localization source; not as runtime mechanics.
  - **Work:** these feed labels/tooltips/reference, so prefer a build-time
    extraction into the Czech label maps + a small descriptions accessor over
    runtime loading. Supports #4 (kill English text) and #7/#1 (readable UI).
  - **Out of scope (2024 ruleset):** `5e-SRD-Poisons.json`,
    `5e-SRD-Weapon-Mastery-Properties.json`, `Species/Subspecies` — only if the
    app ever targets the 2024 SRD; today it's 5.1/2014.

---

## Deliverables the user can provide

- **Showcase vault** — see `docs/SHOWCASE.md` for exactly what to author, the
  folder/frontmatter structure, and where to get art/map assets.
- **D&D asset database (SRD)** — see `docs/SHOWCASE.md` → "SRD asset database"
  for the source repo, what to download, and where to mount it.
