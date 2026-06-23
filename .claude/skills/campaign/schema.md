# ADM Vault Schema — Campaign Writer Reference

All files: YAML frontmatter between `---` markers + Markdown body.

## campaign.yaml

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

## locations/\<slug\>.md

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

*<Foreshadowing hint if applicable — omit otherwise.>*
```

## bestiary/\<slug\>.md

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

## lore/npc-\<slug\>.md

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

## lore/hlavni-ukol.md

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

- [ ] <Objective 1 — specific NPC and/or location>
- [ ] <Objective 2>
- [ ] <Objective 3>

## Foreshadowing

- <Concrete seed 1>
- <Concrete seed 2>
```

## lore/uvod.md

```markdown
---
id: uvod
name: Úvodní scéna
type: intro
---

# Úvodní scéna

<Opening scene — 3 Czech paragraphs.>
```

## encounters/\<slug\>.md

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
