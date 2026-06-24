# Showcase vault, SRD assets & deployment

A practical guide for (1) deploying/updating the app on a NAS, (2) authoring a
showcase campaign vault you can hand over, and (3) getting the full D&D 5e SRD
asset database in. The vault is plain files — Markdown + YAML frontmatter +
images — so you can build it with any editor (Obsidian works nicely).

---

## 1. Deploying & updating (NAS / Docker GUI)

The image bakes the example vault into `/data/vault` and defaults
`VAULT_PATH=/data/vault`, so the container is runnable on its own. In the
Compose files we **bind-mount `./vault:/data/vault`** for persistence — and a
bind mount **hides** the baked-in vault. So:

- **If `./vault` is empty on first run** the app crashes with
  `ENOENT … /data/vault/campaigns`. The current image fixes this with an
  entrypoint that seeds the example into an empty vault automatically. Older
  images don't — so either update the image, or seed the folder yourself.
- **To run immediately on any image:** in the Compose stack, remove the
  `- ./vault:/data/vault` line (uses the baked-in example, no host persistence),
  **or** copy the contents of `data/vault.example/` into the host `vault/`
  folder via the NAS File Manager so it contains `vault/campaigns/…`.

**Updating to the latest image (NAS GUI):**

1. Make the GHCR packages public (github.com → your profile → **Packages** →
   `ai-dungeon-master` → *Package settings* → *Change visibility → Public*; do
   the same for `piper-http`). A private package can't be pulled by the NAS
   without `docker login`, which is awkward in a GUI.
2. In the Docker GUI: **Images** → pull `ghcr.io/ondreu/ai-dungeon-master:latest`
   fresh → then **Projects/Compose** → Stop → Recreate.
3. Confirm you're on new code: open the `app` container's console/log; the
   startup log should show
   `[entrypoint] /data/vault/campaigns missing — seeding bundled example vault`
   on a fresh vault. (Adding `pull_policy: always` to the Compose makes
   "recreate" always fetch the newest image.)

---

## 2. Showcase vault — what to author

A campaign is one folder under `<vault>/campaigns/<slug>/`. Use the bundled
**`data/vault.example/campaigns/konvoj-do-vresoviste/`** as the working template
(a short ~30 min demo), and its `CAMPAIGN.md` as the schema legend. A campaign can
also opt into a shared world via `world:` in `campaign.yaml` — see
`data/vault.example/worlds/marka-havrani/` and its `WORLD.md` (#49). Each entity is one Markdown note:
**frontmatter = machine truth (the engine reads it), body = flavour (the LLM
reads it for narration).**

### Folder layout

```
campaigns/<your-slug>/
  campaign.yaml            # name, world_map, starting_location, party, companions, language, tts, llm
  CAMPAIGN.md              # human/LLM-readable legend (copy & adapt the example)
  characters/*.md          # player characters
  companions/*.md          # AI-run allies
  bestiary/*.md            # enemies (reference SRD via srd_ref)
  locations/*.md           # places: coords {x,y} 0..1, connections, encounter_table
  encounters/*.md          # set-piece fights
  items/*.md               # notable items
  lore/*.md                # factions, quests, history (narration grounding)
  maps/*.svg|*.png|*.webp  # overworld backdrop(s)
  # state/ is created at runtime (live session) — don't author it
```

### `campaign.yaml` (copy & edit)

```yaml
name: Konvoj do Vřesoviště
ruleset: dnd5e-srd
world: marka-havrani                   # optional: build inside a shared world (#49)
world_map: maps/marka-overview.svg        # path within the campaign folder
starting_location: cerny-brod         # a location id
party: [thorin, elara]                # character ids
companions: [shadowpaw]               # companion ids
language: cs
tts: { enabled: true, voice: cs-CZ-AntoninNeural }
llm: { model: mistral-medium-3.5 }
variant_rules: { flanking: false, diagonals: "5-5-5" }
```

### A location note (drives the overworld map)

```markdown
---
type: location
id: cerny-brod
name: Černý Brod
kind: town
coords: { x: 0.48, y: 0.55 }          # 0..1 over the map image — REQUIRED to plot it
connections:
  - to: novigrad
    travel: { distance_km: 35, days: 1, terrain: road, danger: low }
encounter_table: velen-divocina
discovered: true
---
# Černý Brod
Atmospheric prose the DM reads / narrates from.
```

> The overworld plots each location at its `coords` (0..1) over the
> `world_map` image. **Every location you want on the map needs `coords`.**

### A bestiary note (reference the SRD)

```markdown
---
type: monster
id: goblin-1
name: Goblin
controller: ai
faction: hostile
srd_ref: goblin            # pulls stats from the SRD dataset (see §3)
hp: { max: 7, current: 7, temp: 0 }
ac: 15
ai_profile: 'Cowardly; attacks the weakest target, flees below 25% HP.'
---
# Goblin
A small green cutthroat with a rusty scimitar.
```

### What makes a *good* showcase (for #5)

Aim for a 30–45 min demo arc:

- **6–10 locations** with `coords` so the overworld feels populated; 2–3
  `discovered: false` to show exploration.
- **A 3–4 PC party** covering martial + caster + skill roles, each with a
  distinct voice in the body text. Give the caster a real, castable spell list
  (`spells_known`) so #8 demos well.
- **3–5 encounters** of rising difficulty, at least one social and one
  tactical, each tied to a location's `encounter_table`.
- **A handful of companions + named NPCs** with strong `ai_profile`s.
- **5–8 lore notes** (one faction, one mystery, a couple of rumours) so the DM
  has material to improvise from.
- **One overworld map** image (see assets below) with locations placed.

### Where to get map & art assets

- **Bundled example:** the world ships with a hand-authored, dependency-free
  parchment overworld at `worlds/marka-havrani/maps/marka-overview.svg`. Its terrain,
  rivers, roads and place icons are drawn in the SAME 0..1 → 1000px space the engine
  uses for `coords` (y-down), so the interactive location pins land exactly on the
  drawn settlements. Copy it into a campaign's `maps/` and point `world_map` at it.
- **Overworld maps (free generators):** [Azgaar's Fantasy Map Generator](https://azgaar.github.io/Fantasy-Map-Generator/)
  (export PNG), [watabou's procgen](https://watabou.itch.io/) (regions, cities,
  villages), or [Inkarnate](https://inkarnate.com) (free tier, export PNG). Drop
  the image in `maps/` and reference it from `campaign.yaml`. Then read each
  location's pixel position off the image and convert to `{x: px/width, y: py/height}`.
- **In-app generation:** with image generation configured (Settings → providers,
  Mistral by default), portraits/locations/scene art can be generated on demand
  — no need to pre-author art.
- **Licensing:** if you hand over the showcase vault, keep any third-party map
  art under a license that allows redistribution, or use generator output you're
  free to share.

**Handover:** zip your `campaigns/<slug>/` folder (and its `maps/`). Drop it
into `data/vault.example/campaigns/` (or a new `data/vault.showcase/`) and we'll
wire it as the default demo.

---

## 3. SRD asset database (full D&D 5e content)

Out of the box only a tiny bundled subset (a couple of monsters/spells/items)
is available — enough for the example, not for real play. For the full set:

1. **Source:** the open dataset at **<https://github.com/5e-bits/5e-database>**
   (SRD 5.1, CC-BY-4.0). Download the repo (Code → Download ZIP). The data lives
   under `src/`, **versioned and multilingual** — `src/2014/en/`, `src/2024/en/`,
   plus translations (`fr-FR`, `pt-BR`, `ru`). This project targets **SRD 5.1 =
   the 2014 edition, English**.
2. **Copy these files, from `src/2014/en/`, flat into the host `srd/` folder.**
   The three core files are enough for monsters/spells/items:
   ```
   srd/5e-SRD-Monsters.json
   srd/5e-SRD-Spells.json
   srd/5e-SRD-Equipment.json
   ```
   For full character creation & leveling (#20), also add:
   ```
   srd/5e-SRD-Races.json
   srd/5e-SRD-Subraces.json
   srd/5e-SRD-Classes.json
   srd/5e-SRD-Subclasses.json
   srd/5e-SRD-Features.json
   srd/5e-SRD-Traits.json
   srd/5e-SRD-Feats.json
   srd/5e-SRD-Magic-Items.json
   srd/5e-SRD-Proficiencies.json
   srd/5e-SRD-Languages.json
   ```
   - Do **not** dump the whole `src/` tree: the loader matches by filename
     recursively, so every language and both editions would load and overwrite
     each other by `index` → mixed-language, mixed-edition garbage.
   - Do **not** use `src/2024/en/` (different structure — Species vs Races, etc.;
     the loader is written for the 2014 format).
   - `5e-SRD-Equipment-Categories.json` and `5e-SRD-Spellcasting.json` are now
     **ignored** (the loader matches exact category filenames), so they no
     longer leak junk if present — but you still don't need them.
   - `srd/` is mounted to `/data/srd` by the Compose stacks; on a NAS, upload the
     JSON files there via the File Manager.
3. The loader (`apps/server/src/srd/load.ts`) finds files by their exact
   `5e-SRD-<Category>.json` name (recursively, case-insensitive). Restart the
   app; bestiary `srd_ref:` notes resolve to full stats, casters' `spells_known`
   resolve to real spell data, and character creation/leveling draw on the real
   races, subraces, classes, subclasses, features, feats and spell lists.

> Why not fetch from GitHub at runtime? By design this is offline/self-hosted
> (NAS, possibly restricted egress) and deterministic — pin a snapshot, mount
> it once, and the rules don't change under you mid-session.
