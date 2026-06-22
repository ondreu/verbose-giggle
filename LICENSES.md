# Licenses & third-party attribution

This file records the project's license, the rules content attribution required
by the D&D 5e SRD, and the licenses of key libraries used (spec §17).

## Project license

The project is licensed under the **GNU Affero General Public License v3.0 or
later (AGPL-3.0-or-later)**, as set out in the root `LICENSE` file. The root
`package.json` `license` field matches (`AGPL-3.0-or-later`).

## Rules content — D&D 5e SRD 5.1

This project uses mechanics and data from the **Dungeons & Dragons System
Reference Document 5.1 (SRD 5.1)**, made available by Wizards of the Coast LLC
under the **Creative Commons Attribution 4.0 International License (CC-BY-4.0)**.

> *This work includes material taken from the System Reference Document 5.1
> ("SRD 5.1") by Wizards of the Coast LLC and available at
> <https://dnd.wizards.com/resources/systems-reference-document>. The SRD 5.1
> is licensed under the Creative Commons Attribution 4.0 International License,
> available at <https://creativecommons.org/licenses/by/4.0/legalcode>.*

- License text: <https://creativecommons.org/licenses/by/4.0/>
- **Recommended SRD dataset:** [`5e-bits/5e-database`](https://github.com/5e-bits/5e-database)
  — a JSON dataset of monsters, spells, equipment, conditions, and rules
  derived from the SRD. (Alternative: the Open5e API/dataset.) Pin the chosen
  source and decide bundle-in-image vs mounted volume (spec §18.3).

## Maps & adventures

Self-generated or CC/OGL-licensed assets are preferred (e.g. Azgaar's Fantasy
Map Generator). Commercial published material (WotC/Paizo/etc.) is for private
play only and must **not** be redistributed with the project or its data.

## Key third-party libraries

Each is used under its own license; the canonical text ships with the package
in `node_modules`. Versions reflect the workspace manifests.

| Library | License | Used by |
|---|---|---|
| [Fastify](https://github.com/fastify/fastify) | MIT | server |
| [@fastify/static](https://github.com/fastify/fastify-static) | MIT | server |
| [openai](https://github.com/openai/openai-node) (OpenAI-compatible SDK) | Apache-2.0 | server (LLM client) |
| [gray-matter](https://github.com/jonschlinkert/gray-matter) | MIT | server (frontmatter) |
| [yaml](https://github.com/eemeli/yaml) | ISC | server |
| [zod](https://github.com/colinhacks/zod) | MIT | schemas, engine, server |
| [React](https://github.com/facebook/react) | MIT | web |
| [Vite](https://github.com/vitejs/vite) | MIT | web (build/dev) |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | web (state) |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | MIT | web (styling) |
| [Leaflet](https://github.com/Leaflet/Leaflet) | BSD-2-Clause | web (overworld map; planned) |
| [Vitest](https://github.com/vitest-dev/vitest) | MIT | tests (all packages) |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 | toolchain |

Other libraries referenced by the spec but not yet wired in (e.g.
`@dice-roller/rpg-dice-roller` — MIT, `seedrandom` — MIT) should be added to
this table when introduced.

## Fonts & icons

The dark-fantasy UI mandates non-default open assets (spec §12):

- **Fonts:** display serif (Cinzel / Marcellus / Cormorant) + body serif
  (EB Garamond / Crimson Pro) — all under the SIL Open Font License (OFL).
- **Icons:** [game-icons.net](https://game-icons.net) (CC-BY-3.0) or RPG-Awesome
  (Open Font License / MIT). Confirm and attribute the exact set when added.
