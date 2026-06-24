# Bundled SRD dataset (#45a)

This folder holds a **distributable copy** of the SRD 5.1 (2014) JSON so the app
works out of the box without an externally mounted dataset. When `SRD_PATH` is
not set, the server loads the dataset from **this** directory by default
(`apps/server/src/config.ts`); the Docker image copies it to `/data/srd`. Users
with their own database can still override the location via `SRD_PATH` (env) or
the *Cesta k SRD* field in the in-app Settings.

> The actual JSON files are **committed separately** (they are large). This
> README + `.gitkeep` reserve the location and document exactly what to drop in.

## Where to get the files

Source repo: <https://github.com/5e-bits/5e-database>, files under
`src/2014/en/`. This project targets **SRD 5.1 / 2014** (not the 2024 ruleset).

Copy the following files into this directory, keeping their original names
(the loader matches `5e-SRD-<Category>.json`, case-insensitive, `5e-SRD-`
prefix optional — see `FILE_MATCH` in `apps/server/src/srd/load.ts`):

| File                          | Category                          |
| ----------------------------- | --------------------------------- |
| `5e-SRD-Monsters.json`        | monsters (bestiary)               |
| `5e-SRD-Spells.json`          | spells                            |
| `5e-SRD-Equipment.json`       | equipment / weapons / armor       |
| `5e-SRD-Magic-Items.json`     | magic items / loot                |
| `5e-SRD-Races.json`           | races                             |
| `5e-SRD-Subraces.json`        | subraces                          |
| `5e-SRD-Classes.json`         | classes                           |
| `5e-SRD-Subclasses.json`      | subclasses                        |
| `5e-SRD-Features.json`        | class/subclass features by level  |
| `5e-SRD-Traits.json`          | racial traits                     |
| `5e-SRD-Feats.json`           | feats                             |
| `5e-SRD-Proficiencies.json`   | proficiencies                     |
| `5e-SRD-Languages.json`       | languages                         |

The loader is **tolerant of missing files** — a partial (even 3-file:
Monsters/Spells/Equipment) drop still works; absent categories just stay empty.
Filename matching is intentionally specific to avoid lookalike traps
(`Spells` ≠ `Spellcasting`, `Equipment` ≠ `Equipment-Categories`,
`Feats` ≠ `Features`, `Races` ≠ `Subraces`).

## License

The 5e-bits/5e-database content is released under the OGL / Creative Commons
terms stated in that repository. Keep its attribution/license when redistributing
this copy; record it in the repo's `LICENSES.md`.
