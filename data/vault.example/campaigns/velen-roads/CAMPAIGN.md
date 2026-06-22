# The Velen Roads — schema legend

This folder is a **complete, portable D&D 5e campaign**. It survives the app:
a human DM, another LLM, or a different app can pick it up. This file is the key
to reading it (§6.6 of the spec).

## How the data is split

Every entity is one markdown note. Its **YAML frontmatter is machine truth**
(read by the rules engine); its **body is flavor** (read by the LLM for
narration and AI control). The engine indexes by the `type:` field, so the
folder names are only for human convenience — a flat vault works identically.

## Folders

- `campaign.yaml` — config: party, companions, starting location, language,
  TTS voice, LLM model, variant rules (diagonals, flanking).
- `characters/` — human-controlled PCs (`controller: human`).
- `companions/` — AI-controlled allies (`controller: ai`, `faction: party`).
- `bestiary/` — campaign NPCs/monsters. Generic ones reference an SRD stat
  block via `srd_ref:` (e.g. `goblin`); the shared SRD dataset lives outside
  this folder.
- `locations/` — overworld nodes. `coords` are **0..1 ratios** on the parent
  map image (resolution-independent). `connections` are point-crawl edges.
- `encounters/` — tactical grid setups (grid size, terrain, spawns, party
  start cells).
- `items/` — homebrew/magic items only (SRD equipment comes from the dataset).
- `lore/` — factions, quests, free notes.
- `maps/` — this campaign's map images.
- `state/` — LIVE, server-authoritative state (see below).

## Reading `state/session.json`

This is the only mutable file. Key fields:

- `current_location`, `revealed_locations` — where the party is + fog of war.
- `time` — `{ day, hour }` world clock.
- `active_player` — the hotseat pointer; whose turn the UI is on.
- `actors` — runtime overlay of mutable per-actor state (`hp`, `position`,
  `conditions`, `concentration`). The authored notes hold the durable baseline;
  this overlay holds the current deltas, flushed back to notes at checkpoints.
- `combat` — when in a fight: `round`, `order` (initiative), `turn_index`,
  `grid`, and token positions. `null` out of combat.
- `log` — the auditable dice log; each entry has a human-readable `detail`
  like `"d20: 14 +5 = 19 vs AC 15 → hit; 1d8+3 = 7 slashing"`.
- `chat` — the message history fed to the LLM.

`state/session-log.md` is an append-only human diary + dice log for recaps and
handoff.

## Taking over by hand

Open the sheets and `session.json`, become the engine (roll your own dice),
and keep playing. The only thing lost without the app is the determinism
guarantee — a bare human/LLM reverts to judging numbers by feel.
