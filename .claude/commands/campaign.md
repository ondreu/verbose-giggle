---
description: Multi-phase D&D 5e campaign writer. Generates a full, narratively consistent campaign in the ADM vault schema (locations, NPC lore, bestiary, encounters, quest arc, session zero). Args: [--name "<name>"] [--setting "<tone/premise>"] [--sessions <2-8>] [--detail sparse|normal|rich] [--output <path>]
allowed-tools: Write, Read, Bash, Glob
---

# Campaign Writer

Generate a complete D&D 5e campaign in the ADM vault format. Work through the phases
below in order — each phase feeds into the next so the final output is internally
consistent (NPCs reference real locations, quests reference real NPCs, encounters use
defined monsters).

## Step 1 — Parse arguments

Extract from `$ARGUMENTS`:
- `--name "<name>"` — campaign name (required; ask if not given)
- `--setting "<text>"` — tone/premise, e.g. "gothic horror mystery" or "goblins stole the mayor's pig"
- `--sessions <N>` — number of sessions (2–8, default 5; maps to location count)
- `--detail sparse|normal|rich` — description depth (default normal)
- `--output <path>` — override output directory

If `--name` is missing, ask: "Jak se bude kampaň jmenovat?" and wait before continuing.

## Step 2 — Detect output target

Run this to check if we're inside an ADM project:

```bash
ls pnpm-workspace.yaml 2>/dev/null && echo "ADM" || echo "standalone"
```

**ADM project found:** Write to `data/vault.example/campaigns/<slug>/`
(or the first existing `data/vault*/campaigns/` directory you find).

**Standalone:** Write to `./<slug>/` in the current directory.

If `--output` was given, use that path.

Tell the user the output path before generating anything.

## Step 3 — Build the world bible (phases 1–6)

Maintain a single **world bible** object in memory. Each phase MUST reference
content produced by earlier phases — this is how narrative consistency is achieved.

Show a one-line progress update after each phase: e.g. "✓ Fáze 1: základ světa hotov"

### Phase 1 — World foundation

Decide on:
- **pitch**: 2-sentence Czech description of the world and its central conflict
- **tone**: 2–3 words, e.g. "temná gotická záhada", "epická heroická fantasy"
- **factions**: 2–3 named factions with a role (ally / neutral / antagonist)

Quality rule: pitch must establish stakes, not just setting. "A land of ancient ruins and forgotten gods, where three factions race to claim a power that should stay buried." is a pitch. "A fantasy world" is not.

### Phase 2 — Locations

Generate exactly `--sessions` locations (default 5).

Rules:
- Location 1 = hub (village or town), `discovered: true`
- Others: `discovered: false`
- Each location ties to one faction from Phase 1
- Dungeon or dangerous location exists for the climax
- Each description is 2–4 Czech atmospheric sentences — specific, not generic

Assign slugs: Czech name → lowercase, remove diacritics, replace spaces with `-`.
E.g. "Šeptající les" → `septajici-les`

Coordinates: hub at `{x: 0.5, y: 0.5}`. Place others in a ring at radius ~0.3.

Connections: hub connects to all locations; each location also connects to the next
in the chain. Use `{to: "<slug>", travel: {days: 1}}`.

### Phase 3 — NPCs and monsters

**NPCs** (1–2 per location, minimum 2 total):
- Each NPC's `location` field = exact name of a location from Phase 2
- Include a quest hook NPC at the hub location
- Each NPC has: role, personality (1 sentence), secrets (1 sentence)
- Assign slug: NPC name → slug, prefix `npc-`

**Monsters** (2–3 types):
- For standard D&D 5e monsters (goblin, skeleton, bandit, zombie, wolf, orc, troll, cultist),
  set `srd_ref` to the SRD id
- `ai_profile`: 1-sentence tactical behaviour in Czech
- Assign HP and AC appropriate to CR 1/4–1

Slug: monster name → slug, e.g. "Goblin" → `goblin`, "Temný kultista" → temny-kultista`

### Phase 4 — Quest arc

Generate:
- `hook_npc`: name of the NPC from Phase 3 who gives the quest (must be in hub)
- `objectives`: 3 objectives, each referencing a specific NPC and/or location from Phases 2–3
  E.g. "Najít Záhadného poutníka v Šeptajícím lese a vyslechnout ho"
- `foreshadowing`: 2 specific narrative seeds — concrete details, not abstractions
  E.g. "Staré runy vyřezané do kůry stromů — nikdo neví, kdo je tam nechal"
- `climax_location`: name of the dungeon/dangerous location from Phase 2

Consistency check: every objective must mention a real NPC or location name defined above.

### Phase 5 — Encounters

Generate 2–3 tactical encounters:
- Each at a location from Phase 2 (use exact name)
- Monster `ref` = exact name of a monster from Phase 3
- 1 encounter = climax at `climax_location`
- Simple positioning: monsters at x=9–13, party start at x=2–4, y=8–10

### Phase 6 — Opening scene (session zero)

Write the opening scene in Czech (3 paragraphs):
1. Set the scene at the hub location — atmosphere, sensory details, time of day
2. Introduce the hook NPC naturally with a specific urgent problem
3. Weave in 1–2 foreshadowing elements from Phase 4 naturally (don't announce them as clues)

End with a clear player choice or open question.

No emoji. No generic purple prose ("a mysterious stranger"). Specific, grounded.

## Step 4 — Write files

Create the directory structure first:

```bash
mkdir -p "<output>/{locations,bestiary,lore,encounters,characters,companions,items,maps}"
```

Then write every file below. Write them one by one — do not batch into a single Write call.

### `campaign.yaml`
```yaml
name: "<Campaign Name>"
ruleset: dnd5e-srd
starting_location: <hub-slug>
party: []
companions: []
language: cs
tts:
  enabled: true
variant_rules:
  flanking: false
  diagonals: "5-5-5"
  grid_shape: square
```

### `locations/<slug>.md`
```markdown
---
type: location
id: <slug>
name: <Czech name>
kind: city|town|village|landmark|dungeon|region
parent: null
coords:
  x: 0.50
  y: 0.50
connections:
  - to: <other-slug>
    travel:
      days: 1
discovered: true
---

# <Name>

<2–4 sentences of Czech atmosphere.>

*<One foreshadowing hint embedded naturally — omit if none applies.>*
```

### `bestiary/<slug>.md`
```markdown
---
type: monster
id: <slug>
name: <name>
controller: ai
faction: hostile
level: 1
xp: 0
abilities:
  str: 10
  dex: 12
  con: 10
  int: 8
  wis: 8
  cha: 8
proficiency_bonus: 2
hp:
  max: <N>
  current: <N>
  temp: 0
ac: <N>
speed: 30
hit_dice:
  type: d8
  total: 1
  remaining: 1
spell_slots: {}
spells_known: []
conditions: []
concentration: null
inventory: []
attunement: []
death_saves:
  success: 0
  fail: 0
dead: false
position: null
srd_ref: <srd-id or null>
ai_profile: "<Czech tactical description>"
---

# <Name>

<1–2 sentences Czech characterization.>
```

### `lore/npc-<slug>.md`
```markdown
---
id: npc-<slug>
name: <name>
type: npc
location: <location-name>
faction: <faction-name>
---

# <Name>

<Role — Location.>

<Personality sentence.>

**Tajemství:** <Hidden motivation or secret.>
```

### `lore/hlavni-ukol.md`
```markdown
---
id: hlavni-ukol
name: <Quest Title>
type: quest
giver: <hook-npc-name>
---

# <Quest Title>

<Summary paragraph.>

## Cíle

- [ ] <Objective 1 — references a specific NPC and/or location>
- [ ] <Objective 2>
- [ ] <Objective 3>

## Foreshadowing

- <Seed 1 — specific and concrete>
- <Seed 2>
```

### `lore/uvod.md`
```markdown
---
id: uvod
name: Úvodní scéna
type: intro
---

# Úvodní scéna

<Opening scene — 3 Czech paragraphs as written in Phase 6.>
```

### `encounters/<slug>.md`
```markdown
---
type: encounter
id: <slug>
name: <name>
location: <location-slug>
grid:
  w: 16
  h: 12
  cell_ft: 5
terrain: []
spawns:
  - ref: <monster-slug>
    faction: hostile
    at:
      x: 10
      y: 4
  - ref: <monster-slug>
    faction: hostile
    at:
      x: 11
      y: 5
party_start:
  - x: 3
    y: 9
  - x: 2
    y: 8
  - x: 4
    y: 8
---

# <Encounter Name>

<Setup and tactics in Czech.>
```

## Step 5 — Summary

After all files are written, print:

```
Kampaň "<name>" je připravena.

Výstup: <output-path>/
  campaign.yaml
  locations/  (<N> souborů)
  bestiary/   (<N> souborů)
  lore/       (<N> souborů)
  encounters/ (<N> souborů)
```

**If inside an ADM project vault:**
"Restartujte server (`pnpm dev:server`) nebo kampaň načtěte přes Nastavení → Cesta ke kampani."

**If standalone:**
"Zkopírujte složku do `<vault>/campaigns/` vašeho ADM serveru, nebo spusťte server s `VAULT_PATH=./` prostředím."

## Quality rules (enforce throughout)

1. **Consistency**: every reference must resolve — NPC location → real location, quest NPC → real NPC, encounter monster → real monster. Check this before writing files.
2. **Czech prose**: all narrative text in Czech. IDs, YAML keys, and `srd_ref` values stay English/slugs.
3. **Slug format**: `^[a-z0-9][a-z0-9-]*$` — no diacritics, no spaces.
4. **No AI-slop**: named characters, specific places, concrete details. No "a mysterious figure" — give them a name and a reason to be there.
5. **D&D 5e SRD only**: stick to 5e 2014 mechanics. Use `srd_ref` for standard monsters.
6. **Minimum viable**: if detail is `sparse`, aim for 2 sentences per description; `rich` means 4–5 sentences with sensory details.
