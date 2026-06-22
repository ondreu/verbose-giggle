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

- **#8 — Wizard's spells are not visible / castable.** The sheet shows spell
  *slots* but never the *known/prepared spell list*, so a caster can't pick a
  spell. Render `actor.spells_known` (with cast buttons) in
  `apps/web/src/panels/SheetPanel.tsx` (slots block is at ~line 102). Likely the
  root cause of **#12**.
- **#12 — Narration diverges from the mechanic that ran (determinism leak).**
  Repro: player typed *"vyšlu firebolt na Thorina"*; the engine actually ran
  `Unarmed Strike` (log: "Elara útočí na Thorin (Unarmed Strike) … minutí"),
  yet the prose narrated a **Fire Bolt** fizzling. Two bugs: (a) Fire Bolt
  wasn't an available/known spell so the tool selection fell back to unarmed
  (tied to #8); (b) the LLM narrated a spell that did **not** happen — narration
  must describe the engine's actual result, never invent the action. Also
  friendly-fire on a party member was attempted without confirmation. Fix the
  intent→tool mapping and constrain narration to the executed tool. See
  `apps/server/src/session/loop.ts`, `packages/engine/src/tools.ts`,
  `apps/server/src/llm/prompt.ts`.
- **#16 — Combat shows only your own HP.** The turn tracker lists initiative but
  no HP for other combatants; the sheet shows only the active actor. Add HP
  (number + bar, faction-coloured) per combatant in
  `apps/web/src/panels/TurnTracker.tsx`.
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
- **#4 — Remove leftover English UI text.** e.g. `perception` → *vnímání*.
  Sweep skill/ability/condition/action labels; route everything through the
  Czech label maps (`packages/schemas/src/labels.ts`) and check SRD-derived
  names surfaced to the player.
- **#2 — Start-up / home menu.** A first-run screen with: open Settings, import
  a campaign, import maps, and **create a new campaign** (no map required yet).
  New top-level view in the web app; campaign create/import endpoints on the
  server (write into the vault).
- **#14 — Character creation GUI.** Full guided creation for a campaign
  (race/class/abilities/skills/equipment/spells) that writes a valid actor note.
  Pairs with #2 and #8.
- **#13 — Level-up GUI.** Surface choices (ASIs/feats, stat increases, new
  spells, HP) instead of editing files. Wire to `packages/engine/src/leveling.ts`.
- **#15 — Image generation is undiscoverable.** Buttons exist ("vizualizovat" in
  chat, "portrét" on the sheet) but use the generic scroll icon and read as
  links. Give them a clear camera/image icon and put a visible button next to
  the recap/summary as requested. `ChatPanel.tsx`, `SheetPanel.tsx`,
  `components/Icon.tsx`.

## P2 — Polish & feel

- **#3 — Modernize the UI; tasteful subtle effects.** Light motion/elevation,
  better spacing/hierarchy — **without AI-slop** (no emoji, no generic gradients
  for their own sake; keep the dark-fantasy intent in `theme/tokens.css`).
- **#7 — Font legibility.** The display font is pretty but hard to read; bump
  weight/size a touch for body text and lean on Markdown (#1) for structure.
- **#11 — Resizable UI panels.** Make the three-column play surface
  (`apps/web/src/App.tsx`) resizable (draggable splitters / persisted sizes).
- **#6b — Hex grid for the tactical map.** Switch the square grid to hexagons
  (render + distance/range math). Engine work in `packages/engine/src/grid.ts`
  plus `TacticalGrid.tsx`. Schedule after #6 (maps must render first).
- **#5 — Bigger, better showcase vault.** More locations/NPCs/encounters/lore so
  the demo sells the experience. Build guide in `docs/SHOWCASE.md`; the showcase
  vault content can be authored and dropped into `data/vault.example` (or a new
  `data/vault.showcase`).

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
