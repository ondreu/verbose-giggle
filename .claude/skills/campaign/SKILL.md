---
name: campaign
description: >
  Generate a complete, narratively consistent D&D 5e campaign in the ADM vault
  schema. Use when the user wants to create a new campaign with locations, NPCs,
  bestiary, encounters, quest arc, and session zero. Works inside an ADM project
  (writes to data/vault.example/campaigns/) or standalone (writes to ./). 
  Args: [--name "<name>"] [--setting "<tone/premise>"] [--sessions <2-8>]
  [--detail sparse|normal|rich] [--output <path>]
argument-hint: --name "<name>" [--setting "<premise>"] [--sessions 5] [--detail normal]
allowed-tools: Write, Read, Bash, Glob
context: fork
---

# Campaign Writer

Generate a complete D&D 5e campaign in the ADM vault format. See [vault schema](./schema.md) for exact file formats.

Work through the phases below **in order** — each phase feeds into the next so
the final output is internally consistent (NPCs reference real locations, quests
reference real NPCs, encounters use defined monsters).

## Step 1 — Parse arguments

Extract from `$ARGUMENTS`:
- `--name "<name>"` — campaign name (required; ask if not given)
- `--setting "<text>"` — tone/premise, e.g. "gothic horror mystery"
- `--sessions <N>` — 2–8, default 5; maps to location count
- `--detail sparse|normal|rich` — description depth (default normal)
- `--output <path>` — override output directory

If `--name` is missing, ask: "Jak se bude kampaň jmenovat?" and wait.

## Step 2 — Detect output target

```bash
ls pnpm-workspace.yaml 2>/dev/null && echo "ADM" || echo "standalone"
```

- **ADM:** write to `data/vault.example/campaigns/<slug>/`
- **Standalone:** write to `./<slug>/`
- `--output` overrides both

Tell the user the output path before generating.

## Step 3 — World bible (phases 1–6)

Keep a single **world bible** in memory. Show one-line progress after each phase.

### Phase 1 — World foundation
Decide:
- **pitch**: 2-sentence Czech description of world + central conflict (stakes, not just setting)
- **tone**: 2–3 words, e.g. "temná gotická záhada"
- **factions**: 2–3 named factions with role (ally / neutral / antagonist)

### Phase 2 — Locations
Generate exactly `--sessions` locations (default 5).
- Location 1 = hub (village/town), `discovered: true`
- Others: `discovered: false`; one must be a dungeon/dangerous place for the climax
- Each tied to a faction from Phase 1
- Descriptions: 2–4 Czech atmospheric sentences, specific not generic
- Slugs: Czech name → lowercase, strip diacritics, hyphens (e.g. `septajici-les`)
- Coords: hub at `{x:0.5, y:0.5}`; others orbit at radius ~0.3
- Connections: hub → all; each → next in chain

### Phase 3 — NPCs and monsters
**NPCs** (min 2, ~1 per location):
- `location` = exact name of a location from Phase 2
- Quest hook NPC must be in the hub
- Each has: role, personality (1 sentence), secrets (1 sentence)

**Monsters** (2–3 types):
- For standard creatures (goblin, skeleton, bandit, zombie, wolf, orc, troll, cultist): set `srd_ref`
- `ai_profile`: 1-sentence tactical behaviour in Czech

Consistency check: every NPC location must match a real location name from Phase 2.

### Phase 4 — Quest arc
- `hook_npc`: NPC from Phase 3 at the hub
- `objectives`: 3 items, each referencing a real NPC and/or location from Phases 2–3
- `foreshadowing`: 2 concrete narrative seeds (not abstract — give specific details)
- `climax_location`: name of the dungeon/dangerous location from Phase 2

### Phase 5 — Encounters
2–3 tactical encounters:
- Location = exact name from Phase 2
- Monster refs = exact name from Phase 3
- 1 encounter = climax at `climax_location`
- Positions: monsters x=9–13, party start x=2–4 y=8–10

### Phase 6 — Opening scene
3 Czech paragraphs:
1. Hub atmosphere — sensory details, time of day
2. Hook NPC with an urgent specific problem
3. Weave in 1–2 foreshadowing elements naturally

End with a clear player choice. No emoji, no generic prose.

## Step 4 — Write files

```bash
mkdir -p "<output>/{locations,bestiary,lore,encounters,characters,companions,items,maps}"
```

See [vault schema](./schema.md) for the exact frontmatter + body format of each file type.

Write files one by one. After all files are written:

```
Kampaň "<name>" je připravena.

Výstup: <output-path>/
  campaign.yaml
  locations/  (<N> souborů)
  bestiary/   (<N> souborů)
  lore/       (<N> souborů)
  encounters/ (<N> souborů)
```

## Quality rules

1. **Consistency** — every reference resolves: NPC location → real location, quest NPC → real NPC, encounter monster → real monster. Check before writing.
2. **Czech prose** — all narrative text in Czech. IDs, YAML keys, `srd_ref` values stay English/slugs.
3. **Slugs** — `^[a-z0-9][a-z0-9-]*$` — no diacritics, no spaces.
4. **No AI-slop** — named characters, specific places. "Rychtář Bořek" not "a local official".
5. **D&D 5e SRD 2014 only** — use `srd_ref` for standard monsters.
