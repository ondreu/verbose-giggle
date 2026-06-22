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
- **#6 — Maps render nothing.** Overworld: moving between locations showed no
  token/position change; tactical (combat) map was all black. Investigate the
  Leaflet overworld token/camera layer (`apps/web/src/map/OverworldMap.tsx`) and
  the tactical grid render/asset loading (`apps/web/src/map/TacticalGrid.tsx`,
  `MapPanel.tsx`). Confirm `current_location` → marker and combatant positions →
  grid tokens actually bind. (Hex-grid request is **#6b**, see P2.)
- **#17 — Voice (TTS) doesn't play.** Verify end-to-end: Azure key/region set in
  Settings → `/api/tts` returns audio → client plays it. Most likely a config
  gap (no Azure key, or stale image without the Settings panel) rather than code
  — confirm against the P0 deploy note first. `apps/web/src/store/store.ts`
  (`speak`), `apps/server/src/routes/game.ts` (`/api/tts`).
- **#22 — Settings do not persist (model resets on reload).** Selected model and
  other settings revert to defaults on page reload. Persist all settings (model,
  voice provider, Azure keys, etc.) to `localStorage` on every change and
  rehydrate on app boot. The store init in `apps/web/src/store/store.ts` should
  load from `localStorage` before applying defaults; the Settings panel write
  path should mirror every change there.
  - **[x] Partially done:** server-owned settings (model, Azure keys, campaign)
    already persist to `settings.json`; the client-only voice toggles
    (`ttsEnabled`, `ttsProvider`) now persist to `localStorage` and rehydrate on
    boot (`apps/web/src/store/store.ts`). Remaining: anything else found to reset.
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

- **#1 — Render Markdown from the LLM in chat.** Narration is printed as plain
  text (`{line.text}` in `apps/web/src/panels/ChatPanel.tsx:100`). Add a small,
  safe Markdown renderer (bold/italic/lists/headings/hr/inline-code at minimum).
  This also helps legibility (#7).
- **#9 — Show who is acting instead of "Hráč".** Chat hardcodes the label
  "Hráč ·" (`ChatPanel.tsx:96`). Show the acting character's name, or "Družina"
  for party-wide actions. Requires carrying the actor id/name on narration
  lines (`store.ts` narration mapping currently keeps only role dm/player).
- **#10 — Verify action economy.** Playtest felt like too many actions per turn.
  Audit action/bonus-action/move/reaction limits and how the loop gates them in
  `packages/engine/src/turns.ts` and the turn loop; add a test if a limit is
  missing.
- **[x] #4 — Remove leftover English UI text and abbreviations.** Done. The
  two-letter Czech shorthand (SIL/OBR/ODL/MDR) is gone: `ABILITY_CS` now holds
  full Czech names (Síla, Obratnost…) and a new `ABILITY_ABBR`/`csAbilityAbbr`
  gives the standard international STR/DEX/CON for compact grids and the dice
  log. All call sites route through `labels.ts` — SheetPanel/CharacterCreate
  ability grids (abbrev + full-name tooltip), LevelUpModal, and the engine
  dice-log checks/saves (which also now localise the condition list). The
  hardcoded "Unarmed Strike" fallback reads "úder beze zbraně". (SRD-sourced
  weapon/spell names stay English pending the localization pass in #21.)
- **#2 — Start-up / home menu.** A first-run screen with: open Settings, import
  a campaign, import maps, and **create a new campaign** (no map required yet).
  New top-level view in the web app; campaign create/import endpoints on the
  server (write into the vault).
- **#14 — Character creation GUI (BG3-style guided flow).** Full guided creation
  for a campaign: choose race/subrace → class/subclass → ability score point
  buy (pool of 27 pts, standard array option) → select starting skills, feats
  (if applicable), and cantrips/spells known. Output a valid actor note. Blur
  the background while the dialog is open (CSS `backdrop-filter: blur`). Wire to
  SRD data (#20 — races, classes, feats, spells). Pairs with #2 and #8.
- **#13 — Level-up GUI and engine-driven leveling.** Levels must be awarded by
  the engine (XP threshold or milestone) — never by the player asking. On
  level-up the engine emits a `level_up` event; the UI opens a guided modal
  (ASI or feat pick, HP roll/take-average, new spells/features from SRD class
  data). Wire to `packages/engine/src/leveling.ts`. Remove any player-declared
  level-up path.
- **#15 — Image generation is undiscoverable.** Buttons exist ("vizualizovat" in
  chat, "portrét" on the sheet) but use the generic scroll icon and read as
  links. Give them a clear camera/image icon and put a visible button next to
  the recap/summary as requested. `ChatPanel.tsx`, `SheetPanel.tsx`,
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
- **#28 — Visualization context menu renders under the map (z-index).** The
  "vizualizovat" right-click / dropdown menu is clipped behind the map canvas.
  Raise its `z-index` above the map layer (map is likely `z-index: 10` or
  similar; menu needs a higher stacking context). Check
  `apps/web/src/panels/ChatPanel.tsx` or the shared `ContextMenu` component.
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
  - **[ ] Click-to-target on the tactical map (stretch):** add a "targeting mode"
    to `apps/web/src/map/TacticalGrid.tsx` (tokens render ~L305) where a click
    selects that token as the pending action's target. Pairs with #6 and #39.

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
- **#6b — Hex grid for the tactical map.** Switch the square grid to hexagons
  (render + distance/range math). Engine work in `packages/engine/src/grid.ts`
  plus `TacticalGrid.tsx`. Schedule after #6 (maps must render first).
- **#39 — More granular / detailed tactical battle map.** The current grid is
  coarse: a fixed 44px cell, a default 12×10 board (`start_combat` default in
  `packages/engine/src/turns.ts`), and chunky one-cell terrain/tokens. Make the
  battlefield finer-grained and richer:
  - **Finer grid:** smaller cells / larger boards (e.g. configurable cell size
    or a higher cell count), so positioning and ranges feel tactical rather than
    blocky. Keep `cell_ft` honest for distance math (`packages/engine/src/grid.ts`).
  - **Zoom & pan:** the SVG already scrolls (`overflow-auto`); add zoom in/out and
    drag-pan so big maps stay readable (`apps/web/src/map/TacticalGrid.tsx`,
    `CELL`/viewBox).
  - **Richer rendering:** sub-cell token sizing, clearer terrain at higher
    resolution, optional multi-cell creatures (Large/Huge footprints), and
    snappier tokens. Coordinate with the authored `battle_map_image` backdrop so
    art and grid line up.
  - Pairs with #6 (maps render), #6b (hex option), and #38 (click-to-target wants
    legible tokens to click).
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
- **#35 — Campaign management screen.** Allow players/DM to list saved
  campaigns, delete one, browse its vault files (read-only tree view), and
  export the campaign folder as a `.zip`. New route/modal in the web app; server
  endpoints: `GET /api/campaigns`, `DELETE /api/campaigns/:id`,
  `GET /api/campaigns/:id/export`. Vault is on disk in the configured path.
- **[x] #36 — Favicon.** Done. Added a thematic gold-D20-on-dark
  `apps/web/public/favicon.svg` and referenced it from `index.html`, so the tab
  no longer shows the generic globe. (SVG favicon covers modern browsers; a
  legacy `.ico` can be added later if needed.)
- **#37 — AI-generated campaign map.** When a campaign is created or when the DM
  first describes the world, optionally generate a rough overworld map image via
  the image-generation endpoint and store it as the campaign's base map. This is
  a stretch goal — scope it so the campaign still works without the image if
  generation fails or the key is absent. Wire to the existing image-generation
  path; store result in the vault alongside other campaign assets.

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

- **#20 — Consume the rest of the SRD dataset.** Today the loader
  (`apps/server/src/srd/load.ts`) only reads `*monster*`, `*spell*`,
  `*equipment*`; everything else in 5e-bits/5e-database is ignored. Extend it to
  load and expose the data that future authoring/leveling features need
  (`src/2014/en`):
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
