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
- **[x] #51 — Deník kostek schovat jako vedlejší panel.** Done. Rušivý byl
  *samostatný* panel `Deník kostek` v pravém railu (dole v `aside` v
  `PlaySurface`), který scrolloval na každý nový záznam — ten byl odstraněn
  (`DiceLog.tsx` smazán z obou layoutů). Inline animované karty hodů přímo v
  chatu (#33, `RollLine` v `ChatPanel`) zůstávají zachované — ty fungují skvěle
  a jsou hlavním způsobem, jak hráč hody vidí v kontextu vyprávění.
- **#47 — UI layout adjustments per user sketches.** Visual and layout changes
  per wireframes supplied by the user. Awaiting delivery of sketches.
  - **#47a — Layout implementation.** Adjust panel layout, navigation and visual
    hierarchy per supplied wireframes. Preserve responsiveness and existing
    functionality.
  - **#47b — Design consistency.** Verify changes stay within the existing design
    system (Catppuccin colours, font stack, panel/parchment motifs).
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
- **[x] #32 — Streaming / lazy-loading of AI text.** Done. The DM's narration now
  appears progressively. Server: `LlmClient.chat` gained an optional `onDelta`
  callback driving an OpenAI `stream:true` path (content tokens stream out; the
  fragmented tool-call deltas are accumulated by index into whole calls), so the
  turn loop stays agnostic to which path ran. `executeToolLoop` streams each
  final-answer token over the existing SSE bus as `narration_delta`; because a
  round may turn out to be a tool call rather than the final answer, any streamed
  preamble is retracted with `narration_discard`, and the trailing `narration`
  event finalizes the line with the authoritative text (and triggers TTS once).
  `runIntro` opts out of streaming (it returns over HTTP to dodge a first-load
  SSE race). Client (`store.ts`): a `narration_delta` starts/extends a live DM
  line, `narration_discard` drops it, `narration` finalizes (or appends a fresh
  line for non-streamed paths like recap/mock); chat auto-scroll follows the
  growing text. Covered by a server test.
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

### #41 — Livelier travel & arrivals (cluster)

Travel currently feels mechanical and breaks immersion. Three gaps, from
playtest (2026-06):

- **[x] #41a — Time does not pass while travelling (regression of #24).** Done.
  The `/api/command` travel handler now looks up the edge duration from
  `campaign.locations[current].connections` and injects `days` into the engine
  call before dispatch, so `advanceTime` is always fed the authored travel time.
- **[x] #41b — Arrival is a bare log line; the DM says nothing.** Done.
  Added `ARRIVAL_BEAT` prompt constant and `runArrival()` in `loop.ts`
  (mirrors `runIntro`). The `/api/command` travel handler calls `runArrival`
  after a successful travel instead of `resolveAiTurns`, triggering 3–4 sentences
  of atmospheric arrival narration grounded in the scene snapshot.
- **[x] #41c — The "Střety zde" table is unimmersive.** Done. Restyled the
  encounter launcher in `MapPanel.tsx` as an atmospheric "Hrozby v okolí"
  notice with subtle blood/30 border and skull icons; bare debug table removed.

### #42 — Rich interactive SRD tooltips / hover cards (cluster)

The SRD dataset carries full descriptions and mechanics (see the sample
`acid-arrow` record: `desc`, `higher_level`, `range`, `components`,
`casting_time`, `duration`, `concentration`, `damage.damage_at_slot_level`,
`school`); surface them as interactive cards on hover/focus everywhere an id is
shown, so the player never has to know the rules by heart.

- **[x] #42a — Spell hover card.** Done. `SpellCard` in `InfoCard.tsx` lazily
  fetches `/api/srd/spell/:id`, caches per session, and shows a 300 ms-delayed
  floating card with level, school, casting time, range, components, duration,
  concentration/ritual flags, description, and `higher_level` upcast text.
  Wired to spell chips in SheetPanel and the level-up spell picker.
- **[x] #42b — Carry the missing fields.** Done. `mapSpell` and `SrdSpell`
  extended with `higher_level`, `casting_time`, `duration`, `components`,
  `concentration`, `ritual`, and `range_ft`; exposed via `/api/srd/spell/:id`.
- **[x] #42c — Same cards for feats, skills, features, conditions, items.** Done.
  `FeatCard` (lazy fetch `/api/srd/feat/:id`) on SheetPanel feat chips and
  LevelUpModal; `FeatureCard` (lazy fetch `/api/srd/feature/:id`, which falls
  back to the racial-trait table so one endpoint serves the mixed "Schopnosti"
  row) on SheetPanel class/racial features and CharacterCreate trait chips;
  `ItemCard` (batch-primed by InventoryPanel, lazy single fetch via
  `/api/srd/items`) on inventory rows; `ConditionCard` (static Czech
  `csConditionDesc`) on the sheet's condition chips; plus static `ABILITY_TIP`/
  `SKILL_TIP` tooltips on ability/skill rows across SheetPanel, CharacterCreate,
  LevelUpModal and the rules ReferenceModal. All routed through the shared
  portal-based `Tip`/`TipPortal` in `InfoCard.tsx`, so they're never clipped or
  hidden behind the map.
- **[N/A] #42d — Note:** spell/feature *names* stay English (per the localization
  decision); only the surrounding chrome/labels are Czech.

### #43 — Character sheet as the single action hub (cluster)

Today actions live in a separate "Akce — <jméno>" panel (`ActionsPanel.tsx`)
*and* spells are duplicated on the parchment sheet. Collapse everything onto the
sheet so the parchment is the one place you act from (BG3-style action surface).

- **[x] #43a — Remove the standalone "Akce" panel.** Done. `ActionsPanel.tsx`
  removed from `PlaySurface`'s rail; attack, standard action, spell, and skill
  check groups folded into the bottom of `SheetPanel.tsx` as "Akce".
- **[x] #43b — De-duplicate spells.** Done. Old "Známá kouzla" cast-button
  section removed from SheetPanel; spells shown once in the consolidated "Akce"
  area with SpellCard wrappers.
- **[x] #43c — Fix "Útoky" listing armor.** Done. Attack group now filters via
  `ARMOR_RE` regex and `isWeaponId` helper; only items with a damage property
  or a weapon SRD category appear in attacks.
- **[x] #43d — Don't offer passive abilities as castable.** Done. Spells with
  no action cost or passive duration are hidden from the castable list; only
  spells with a real `casting_time` get action buttons.
- **[N/A] #43e — Keep determinism.** Every action still sends NL intent through
  the DM loop → engine; this cluster was a UI reorganization only.

### #44 — Full SRD subraces & subclasses + BG3-style level-up (cluster)

- **[x] #44a — Subraces from the SRD in creation.** Done. `creationOptions`
  groups each subrace under its parent race only and now carries its traits +
  description; the creation UI surfaces the subrace's racial traits as
  hover-card chips (#42c). `createCharacter` applies subrace ability bonuses +
  traits and refuses a subrace from a different race. Audited by tests
  (`creation.test.ts`): invalid-subrace rejection and the `srdStats` subrace
  count.
- **[x] #44b — Subclasses.** Done. `levelUpOptions` returns subclasses from
  the SRD for the right level, and `LevelUpModal` shows the subclass picker when
  `needsSubclass` is true. Creation now also offers a subclass for the SRD 5.1
  classes that choose one at level 1 — **cleric, sorcerer, warlock** (flagged
  `subclassAtCreation`); the other classes still pick it at level 3+ via the
  level-up flow. `CharacterCreate` shows the picker (with flavour text) and
  requires it when the SRD offers subclasses; `createCharacter` validates the
  subclass belongs to the class, stores it, and grants its level-1 subclass
  features alongside the base class features. Covered by `creation.test.ts`.
- **[x] #44c — BG3-style level-up menu.** Done. `LevelUpModal.tsx` fully
  rewritten: HP section (blood), new class features (gold, expandable), subclass
  selection with inline description (arcane), ASI-or-feat with FeatCard link
  (gold), spell picker (arcane). Server-side `levelUpOptions` now returns
  `newFeatures` (class features gained at the next level).

> **#1 (paladin/ranger free-text spell box) — fixed**, pending deploy: half
> casters now show "získává kouzla od 2. úrovně" instead of the comma-separated
> id input (`CharacterCreate.tsx`). The unmounted-SRD case now shows a clear
> "mount the dataset" message rather than a free-text box.

---

## New features

- **[x] #19 — Automatic quest tracking.** Done. Quest state is tracked without
  the player managing it by hand, and the LLM never invents progress.
  - **Data:** new `quest` entity (`QuestSchema`/`QuestRuntime` in
    `packages/schemas/src/quest.ts`) — authored as `quests/*.md` notes
    (frontmatter = id, title, giver, status, `objectives: [{ id, text, done }]`;
    body = flavour), loaded by `loadCampaign`. Live progress lives in
    `SessionState.quests` so it persists per playthrough.
  - **Mutation through the engine (determinism):** new pure helpers in
    `packages/engine/src/quests.ts` + tools `quest_start` / `quest_advance` /
    `quest_complete` / `quest_fail` (zod-validated), each appended to the
    visible dice log (`kind: "quest"`). The DM loop calls them when narration
    implies a state change; `SessionManager.applyTool` enriches `quest_start`
    from the authored note so the model need only pass the quest id.
  - **Auto-detection:** the DM system prompt gained a "ÚKOLY" section
    instructing the model to recognise accept/progress/resolve triggers and call
    the tools; the scene snapshot lists active quests (with open objectives) and
    authored quests available to start, so the model uses real ids.
  - **UI:** a `QuestLogModal` (active vs completed/failed with an objective
    checklist), opened from a "úkoly" toolbar button (with an active-count
    badge) and wired to `session.quests` via the store; quest changes also get
    a gold cue in the dice log.
  - Example quest authored in the showcase vault (`velen-roads/quests/
    goblini-z-mlyna.md`). Covered by engine + server tests.

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

- **[x] #21 — Mine the descriptive/reference SRD data (tooltips, localization,
  rules lookup).** Done. The descriptive data is baked into static Czech label
  maps in `packages/schemas/src/labels.ts` (build-time/static, so tooltips and
  the reference work with no dataset mounted) and surfaced in the UI:
  - **Damage types & resistance** — the engine `DamageType` enum is verified
    complete and each type now has a Czech label (`DAMAGE_CS`, already) **and a
    description** (`DAMAGE_DESC_CS` / `csDamageDesc`), e.g. *bludgeoning →
    drtivé*. Completeness guarded by `packages/schemas/test/labels.test.ts`.
  - **Conditions** — already localized with descriptions (`CONDITION_DESC_CS`,
    #34); now also listed in the rules reference and covered by the completeness
    test.
  - **Weapon properties** — new `WEAPON_PROPERTY_CS` + `WEAPON_PROPERTY_DESC_CS`
    (`csWeaponProperty`/`csWeaponPropertyDesc`); the inventory now shows weapon
    property chips with Czech rules tooltips (the `/api/srd/items` endpoint
    carries `properties`).
  - **Magic schools, alignments, ability scores** — magic schools already
    localized; added `ALIGNMENT_CS`/`csAlignment` and `ABILITY_DESC_CS`/
    `csAbilityDesc` as the shared label/description source.
  - **Rules reference** — new in-app, searchable `ReferenceModal`
    (`apps/web/src/panels/`, opened from a "pravidla" toolbar button) listing
    conditions, damage types, weapon properties, abilities, skills and magic
    schools from the static maps. Read-only; never a source of numbers.
  - **Skills / levels** — the engine `SKILL_ABILITY` map is cross-checked
    against the localized `SKILL_CS` ids by `packages/engine/test/skills.test.ts`
    (they must match exactly); XP/proficiency tables stay hardcoded.
  - **Out of scope (2024 ruleset):** `5e-SRD-Poisons.json`,
    `5e-SRD-Weapon-Mastery-Properties.json`, `Species/Subspecies` — only if the
    app ever targets the 2024 SRD; today it's 5.1/2014.

---

### #45 — Kopie SRD databází + český překlad

Aktuálně aplikace závisí na externě namountovaném datasetu (5e-bits/5e-database)
a všechna herní terminologie v UI je anglická. Cíl: zabudovat distribuovatelnou
kopii dat a přeložit ji do češtiny.

- **#45a — Bundled SRD kopie.** Stáhnout a přibalit subset SRD JSON souborů
  přímo do repozitáře (pod `packages/srd/data/` nebo `apps/server/data/srd/`),
  aby aplikace fungovala bez nutnosti externího mountování. Zachovat možnost
  override přes nastavení Cesta k SRD pro uživatele s vlastní databází.
- **#45b — Český překlad názvů.** Přeložit jména kouzel, schopností (feats),
  dovedností (skills), ras, povolání, itemů a dalších SRD entit do češtiny.
  Překlad ukládat jako vrstvu nad SRD daty (`packages/srd/src/cs/`) — SRD IDs
  zůstanou anglické (determinismus), přeloženy jsou pouze player-facing labely.
  Napojit na stávající label mapy v `packages/schemas/src/labels.ts`.
- **#45c — Build-time extrakce popisů.** Vytěžit popisy podmínek, vlastností
  zbraní, magických škol a dovedností do statických Czech label map (rozšíření
  #21), aby tooltips (#42) měly česky text bez runtime dotazů.

---

### #46 — AI skill pro tvorbu kampaní

- **[x] #46a — Skill definice a prompt.** `.claude/commands/campaign.md` definuje
  `/campaign` slash-command s řízeným 6fázovým průchodem: základ světa → lokace →
  NPC + bestiary → quest arc → střetnutí → session zero. Výstup odpovídá vault
  schématu (YAML frontmatter + Markdown tělo). Konfigurovatelný přes argumenty
  (`--name`, `--setting`, `--sessions`, `--detail`, `--output`).
- **[x] #46b — Integrace do aplikace.** Nový endpoint `POST /api/campaigns/forge/stream`
  streamuje průběh generování jako SSE (Server-Sent Events). Komponenta
  `ForgeCampaign` v `StartMenu.tsx` přijímá events přes Fetch ReadableStream a
  zobrazuje live progress log (fáze + zpráva), vstupní pole jsou blokována po
  dobu generování.
- **[x] #46c — Standalone použití.** Skill detekuje kontext: v ADM projektu zapisuje
  do `data/vault.example/campaigns/`, jinak do `./` v aktuálním adresáři. Funguje
  identicky mimo aplikaci jako Claude Code slash-command.
- **[x] #46d — Narativní konzistence.** Server-side `WorldBible` objekt se buduje
  fázi po fázi: každá LLM výzva obdrží obsah všech předchozích fází, takže NPC
  odkazují na skutečné lokace, cíle questu odkazují na skutečné NPC, nepřátelé
  ve střetnutích jsou definováni v bestiary. Per-fázové fallbacky zachovávají
  konzistenci i bez LLM.

---

### #48 — Vícejazyčná podpora (i18n)

Přidat podporu angličtiny vedle stávající češtiny a vybudovat infrastrukturu
pro snadné přidání dalších jazyků. Řízeno třemi nezávislými přepínači:

- **#48a — Infrastruktura i18n.** Navrhnout systém lokalizace v
  `packages/schemas/src/i18n/` — oddělené soubory pro každý jazyk a kategorii,
  runtime přepínání bez reloadu. Stávající Czech string mapy v `labels.ts`
  se stanou prvním jazykovým souborem (`cs`); přidat `en` jako druhý.
- **#48b — Přepínač #1 — Obecné UI (DM, menu, tooltip text).** Ovládá veškerý
  chrome aplikace: DM naraci (systémový prompt), UI labely (tlačítka, nadpisy,
  panely), tooltip popisy vlastností/dovedností/akcí. TTS předčítání se řídí
  tímto přepínačem (DM mluví v jazyce zvoleném pro naraci).
- **#48c — Přepínač #2 — Herní terminologie (spelly, feats, skills).** Oddělené
  řízení názvů kouzel, schopností (feats), dovedností (skills), podmínek
  a ostatních SRD entit — hráč může mít UI česky ale kouzla anglicky nebo
  naopak.
- **#48d — Přepínač #3 — Staty (vlastnosti, zkratky).** Oddělené řízení názvů
  vlastností (Síla / Strength / STR / SIL), jejich zkratek a zobrazení na
  character sheetu.
- **#48e — Nastavení.** Tři přepínače viditelné v Settings modalu; volby
  uloženy do localStorage a do session stavu, aby se neztratily při reloadu.
  DM systémový prompt se přizpůsobí jazyku přepínače #1.

---

### #49 — Živý svět jako základ kampaní

**[x] Hotovo (infrastruktura #49a–c + autorský svět).** Přístup "kampaň obsahuje
svět jako kulisu" je nahrazen přístupem "svět existuje samostatně a kampaně jsou
příběhy které se v něm odehrávají". Svět má vlastní logiku, frakce sledují vlastní
cíle, NPC obývají sdílené lokace — nezávisle na tom, zda a jaká kampaň právě běží.

**Dodaný svět:** `data/vault.example/worlds/marka-havrani/` — Havraní marka:
pohraničí s 12 lokacemi (velká i malá města, vsi, divočina, ruiny, gobliní doupě,
důl), 9 frakcemi (kupecký a havířský cech, cech zlodějů, řád, kult, rod, hraničáři,
gobliní tlupa, žoldnéřská rota), 20 NPC s tajemstvími a vztahy, dějinami, bohy,
legendou, časovou osou a 4 světovými událostmi se strukturovanými důsledky.
Ukázková kampaň `velen-roads` je na svět napojena (`world: marka-havrani`).

#### Proč to dává smysl

Profesionální D&D settingy (Forgotten Realms, Eberron, Ravenloft) fungují takto:
svět je primární, dobrodružství jsou epizody v něm. Kampaně pak mohou sdílet
svět, navazovat na sebe a mít reálné důsledky — hráči ovlivnění frakci v kampani A
to pocítí v kampani B.

#### [x] #49a — Vault layout: `worlds/` jako sdílená vrstva

Hotovo. `loadWorld` (`apps/server/src/vault/world.ts`) načte `<vault>/worlds/<name>/`
a `loadCampaign` ho sloučí POD kampaň (kampaň přebíjí svět při shodě `id`; kampaň
bez `world:` funguje beze změny — zpětná kompatibilita; chybějící svět degraduje
tiše). Rozšíření adresářové struktury vaultu o top-level `worlds/<name>/` nezávislý
na kampaních. Kampaně odkazují na svět přes `world:` pole v `campaign.yaml`:

```
vault/
  worlds/
    forgotten-reaches/
      factions/          ← frakce s cíli a vztahy
      locations/         ← sdílené lokace, přežívají kampaně
      lore/              ← sdílená lore, historie, legendy
      timeline.md        ← chronologie světa + budoucí hooky
  campaigns/
    stiny-nad-krajem/    ← world: forgotten-reaches
    navrat-do-tmy/       ← stejný svět, jiní hráči, navazující důsledky
```

Server při načítání kampaně sloučí lokace/lore ze světa s campaign-specific
obsahem. Kampaně bez `world:` fungují beze změny (zpětná kompatibilita).

#### [x] #49b — Schéma: `Faction` a `WorldEvent`

Hotovo (`packages/schemas/src/faction.ts`): `FactionSchema`, `WorldEventSchema`
a lehký `NpcSchema` (gazetteer NPC bez bojových statů, s `srd_ref` pro případný
boj) + runtime `FactionRuntime`. Session stav rozšířen o `factions`,
`world_events`, `location_danger`. Nové typy entit v `@adm/schemas`:

**Faction** (`factions/<id>.md`):
```yaml
type: faction
id: temni-kultiste
name: Temní kultisté
goal: "Přivolat starobožstvo Marakathe"
resources: low          # low | medium | high
territory: [zricenina-vraniho-hradu, mlzne-blato]
relationships:
  rada-starsich: hostile
  kupecky-cech: neutral
progress: 0.3           # 0.0–1.0, jak blízko jsou svému cíli
```

**WorldEvent** (`lore/events/<id>.md`):
```yaml
type: world_event
id: obchodni-cesty-zkolabovaly
trigger: "faction.kupecky-cech.progress < 0.2"
name: "Zkolabovaly obchodní cesty"
consequences:
  - location.ricni-brod.danger: high
  - faction.kupecky-cech.resources: low
```

#### [x] #49c — Engine nástroje pro živý svět

Hotovo (`packages/engine/src/world.ts` + tools v `tools.ts`, kryto
`test/world.test.ts`). Deterministické engine tools, aby LLM nikdy nepsalo stav
světa přímo:
- **[x] `faction_advance(id, delta)`** — posune `progress` frakce (clamp 0–1),
  loguje do dice logu (`kind: "world"`)
- **[x] `faction_relation(a, b, stance)`** — změní symetrický vztah dvou frakcí
- **[x] `world_event_trigger(id)`** — aktivuje WorldEvent (idempotentně) a aplikuje
  strukturované consequences (`faction.x.progress/resources/relation`,
  `location.x.danger`); `SessionManager` doplní název a consequences z autorské
  poznámky podle id (jako `quest_start`, #19)
- **[x] `location_danger(id, level)`** — aktualizuje danger level lokace

DM prompt dostal sekci „ŽIVÝ SVĚT" s instrukcí rozpoznávat situace kdy by se
frakce přiblížila/vzdálila cíli a volat příslušný nástroj — stejný deterministický
princip jako u HP/spelů (#12). Scene snapshot vypisuje frakce (postup, zdroje,
cíl), nebezpečí lokace a hrozící události.

#### [x] #49d — Modifikovaný `/campaign` skill pro svět-aware generování

**Hotovo.** Server-side `forgeCampaign` (`apps/server/src/vault/forge.ts`) přijímá
`world?` v `ForgeInput`: když je zadán, `seedFromWorld` naseje World Bible z
existujícího světa (frakce, lokace, NPC), fáze 2/3 už negenerují vlastní lokace/NPC,
quest hook roste z reálných frakcí a klimax míří na reálnou světovou lokaci.
Zapisovač přeskočí světové lokace/NPC (nepřepisuje kánon) a do `campaign.yaml`
zapíše `world:`. Kryto `forge.test.ts` („builds inside an existing world"). Skill
`.claude/commands/campaign.md` má `--world <name>` s per-fázovými „(svět)"
pravidly (reference, nerecyklovat) a krokem „Po kampani: svět se poučí z důsledků"
(navrhne posuny `faction.progress`/world-events, neaplikuje je ručně). Rozšíření
`/campaign` skillu o volitelný parametr `--world <name>`:
- Načte existující `worlds/<name>/` jako kontext
- Kampaňové lokace/NPC/frakce navazují na světové
- Quest hooky vyrůstají z faction tensions ze světa
- Po kampani: skill nabídne aktualizovat `faction.progress` a `world_events`
  dle toho co se v kampani stalo — svět se poučí z důsledků

#### Závislosti a pořadí

```
#49a (vault layout) ✓ → #49b (schémata) ✓ → #49c (engine tools) ✓ → #49d (world-aware /campaign) ✓
```

#49a–b jsou čisté přidání (neruší stávající kampaně). #49c rozšiřuje engine
bez změny existujících nástrojů. Svět si DM authorizuje ručně — žádná AI
generace světa, jen infrastruktura pro jeho načtení a využití. **Hotovo celé #49**:
infrastruktura #49a–d + kompletní autorský svět „Havraní marka" + dvě ukázkové
kampaně v něm:

- **`konvoj-do-vresoviste`** — krátká (~30 min) kampaň: rozhovor, smlouvání,
  obchod, cesta a boj cestou z Černého Brodu do Vřesoviště. (Nahradila starou
  `velen-roads`, která byla odstraněna; testy přepojeny.)
- **`stiny-vraniho-hradu`** — delší (3–5 sezení) kampaň o kultu Marakáthé;
  vyšetřování → cesta → klimax u pečeti, s rozuzlením měnícím stav světa.

---

## P1 — Deployment: vault data lost on redeploy

- **[x] #50 — Kampaně se mažou při novém deploy.**  Příčina: `./vault` bind mount
  závisí na pracovní složce hostitele — NAS Docker GUI (Ugreen, Synology) nebo
  Watchtower může kontejner obnovit s jiným base path, bind mount selže tiše a
  entrypoint zaseje prázdný vault. Oprava: `docker-compose.nas.yml` i
  `docker-compose.yml` nyní používají **pojmenovaný Docker volume** `vault_data`
  místo bind mountu. Pojmenovaný volume spravuje Docker Engine a přežije
  `docker compose down`, aktualizaci image i restart NAS. Bind mount zůstává
  jako komentovaná alternativa pro uživatele kteří chtějí přímý přístup k
  souborům. `entrypoint.sh` má novou migrační logiku: nastaví-li se
  `VAULT_LEGACY_PATH` na starý bind mount, data se při prvním startu
  automaticky překopírují do named volume.

---

## Deliverables the user can provide

- **Showcase vault** — see `docs/SHOWCASE.md` for exactly what to author, the
  folder/frontmatter structure, and where to get art/map assets.
- **D&D asset database (SRD)** — see `docs/SHOWCASE.md` → "SRD asset database"
  for the source repo, what to download, and where to mount it.
