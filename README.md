# AI Dungeon Master

A self-hosted, AI-driven Dungeon Master for **D&D 5e (SRD 5.1)** that runs on a home NAS in Docker. A small group plays **hotseat** (one shared screen, players take turns) with optional AI-controlled companions and enemies. The world, characters, and lore live in a portable, Obsidian-style **vault** (markdown + frontmatter + JSON). The defining constraint: the LLM never invents game mechanics — every die roll, HP value, distance, and spell slot is produced by a deterministic rules **engine** and surfaced in a visible, auditable **dice log**. The LLM only interprets intent, picks which mechanic applies, and narrates the engine's truthful results — read aloud in **Czech** via local **Piper TTS**, in a deliberate dark-fantasy UI.

> Status: early build. The deterministic engine, schemas, SRD loader, and Fastify server are in place. The React web client and the overworld/tactical maps are **in progress** — see [Roadmap](#roadmap).

## Architecture

A single deployable TypeScript app (Fastify server that also serves the built frontend) plus sidecar containers for TTS and TLS:

- **Server** (`@adm/server`, Fastify) — REST + SSE API, the LLM function-calling loop, the vault adapter, and server-authoritative session state. Serves the built web client.
- **Engine** (`@adm/engine`) — a **pure**, deterministic rules core (no IO, no network, no LLM). The only component allowed to roll dice or mutate game state. This is what makes determinism testable and guarantees the LLM cannot bypass the rules.
- **Schemas** (`@adm/schemas`) — `zod` schemas + TS types for Characters, Locations, Encounters, Items, Campaigns, and SessionState.
- **SRD** (`@adm/srd`) — loader + typed accessors for the bundled D&D 5e SRD dataset.
- **Web** (`@adm/web`, React + Vite + Zustand + Tailwind) — the hotseat client: narration/chat, character sheet, inventory, dice log, turn tracker, and maps.
- **Sidecars** — **Piper** (Czech TTS), **Caddy** (auto-HTTPS reverse proxy), **Watchtower** (auto-update from GHCR `:latest`).

The LLM is provider-agnostic: it speaks the OpenAI-compatible chat-completions-with-tools shape, so it works through Mistral's API or OpenRouter with no vendor lock-in. The LLM is given tools but **no ability to write state directly** — all mutation flows through engine tools that validate args with `zod` and append to the dice log.

## Monorepo layout

```
ai-dungeon-master/
├─ apps/
│  ├─ server/                # Fastify app: API, LLM loop, vault adapter, serves web build
│  └─ web/                   # React + Vite frontend (in progress)
├─ packages/
│  ├─ engine/                # PURE deterministic rules engine (no IO, no LLM, no network)
│  ├─ schemas/               # zod schemas + TS types
│  └─ srd/                   # SRD data loader + typed accessors
├─ data/
│  └─ vault.example/         # sample campaign (Velen Roads)
├─ docker/                   # Dockerfile, docker-compose.yml, Caddyfile
├─ .github/workflows/        # CI + GHCR release
└─ ai-dungeon-master-spec.md # the authoritative build spec
```

A pnpm workspace (Node 20+, pnpm 10). `pnpm -r build` builds everything in dependency order.

## Local development

```bash
# 1. Install
pnpm install

# 2. Build all packages, the server, and the web client (in dep order)
pnpm -r build

# 3. Run the test suite (the engine tests are the trust surface)
pnpm -r test
```

### Run the server

No secrets needed to start: with no `LLM_API_KEY`, the server runs an **offline mock narrator** so the full turn loop and UI work end to end (the engine still produces every real number — only the prose is stubbed).

```bash
# Offline (mock narrator):
VAULT_PATH=./data/vault.example pnpm --filter @adm/server dev

# Full LLM narration (copy .env.example to .env first):
LLM_API_KEY=sk-... VAULT_PATH=./data/vault.example pnpm --filter @adm/server dev
```

Set `LLM_PROVIDER=mock` to force the mock even when a key is present. The server listens on `PORT` (default `3000`). If a web build exists at `apps/web/dist` (or `WEB_DIST`), it is served at the same origin; otherwise the server runs API-only.

### Run the web dev server

```bash
pnpm --filter @adm/web dev
```

This starts Vite with hot reload (talking to the running server's API).

## Environment variables

Read by `apps/server/src/config.ts`. See [`.env.example`](.env.example) for the full template.

| Variable | Default | Required | Description |
|---|---|---|---|
| `LLM_API_KEY` | _(empty)_ | No | API key for the LLM provider (Mistral, OpenRouter, …). Empty → offline mock narrator. |
| `LLM_PROVIDER` | _(auto)_ | No | Set to `mock` to force the offline narrator even with a key present. |
| `LLM_BASE_URL` | `https://api.mistral.ai/v1` | No | OpenAI-compatible chat-completions base URL. Set to OpenRouter's to route there. |
| `LLM_MODEL` | `mistral-medium-3.5` | No | Model id (overridable per campaign via `campaign.yaml`). |
| `VAULT_PATH` | `./data/vault` | No | Path to the vault root (contains `campaigns/`). |
| `CAMPAIGN` | _(first found)_ | No | Specific campaign folder under `<vault>/campaigns`. |
| `PIPER_URL` | _(unset → TTS off)_ | No | Piper HTTP endpoint (`POST /tts {text} -> audio/wav`). |
| `BASIC_AUTH` | _(none)_ | No | Optional shared HTTP Basic Auth gate, `user:pass`. |
| `WEB_DIST` | `../../web/dist` | No | Path to the built web client. The Docker image sets `/app/apps/web/dist`. |
| `PORT` | `3000` | No | HTTP port. |
| `HOST` | `0.0.0.0` | No | Bind host. |

## Docker / NAS deployment

CI builds and pushes a multi-stage image to `ghcr.io/ondreu/ai-dungeon-master:latest` on every push to `main`. On the NAS, use the provided Compose stack (app + Piper + Caddy + Watchtower):

```bash
cd docker
# Create a .env next to docker-compose.yml with at least LLM_API_KEY set.
docker compose up -d
```

- Mount your real content over `./vault`, `./maps`, `./srd`. Live session state is written inside each campaign's `state/` folder, so it persists with the vault.
- **TLS:** edit [`docker/Caddyfile`](docker/Caddyfile) — set your domain (auto-HTTPS), or skip Caddy and reach the app over **Tailscale**.
- **Auto-update:** Watchtower pulls `:latest` when CI pushes a new image (only containers labeled `watchtower.enable=true`).
- **Local image build:** in `docker-compose.yml`, comment the `image:` line and uncomment the `build:` block (context `..`, dockerfile `docker/Dockerfile`).

> Open item: the bundled Piper service uses `rhasspy/wyoming-piper`, which speaks the **Wyoming** protocol, not the plain HTTP `POST /tts` shape the server expects. A thin HTTP adapter or an HTTP-native Piper image is required before TTS works end-to-end — see spec §11 and §18.1.

## Core principles

These are non-negotiable (spec §2):

1. **Determinism over hallucination.** The engine owns every die roll and every piece of game state. The LLM requests mechanics through tools and narrates the returned facts — it cannot emit an authoritative number as free text.
2. **Visible dice log.** Every engine computation (e.g. `d20: 14 +5 = 19 vs AC 15 → hit; 1d8+3 = 7 slashing`) is logged and rendered. Trust is earned by being auditable.
3. **Dual-use vault notes.** Each entity is one note: its **frontmatter is machine truth** (read by the engine), its **body is flavor** (read by the LLM for narration / AI control).
4. **Portable, file-first data.** Authored content and durable state are plain files in the vault, syncable by any tool the user chooses. Sync is out of scope; the app just mounts the vault.
5. **Server-authoritative state from day one.** Even in hotseat, live state lives on the server and is mutated only through commands — making networked multiplayer additive, not a rewrite.
6. **Provider-agnostic LLM.** Defaults to Mistral but speaks the OpenAI-compatible chat-completions-with-tools shape, so Mistral or OpenRouter work interchangeably.

## Roadmap (abridged)

- **v1 — Playable core (hotseat):** vault adapter + schemas; sheet render/edit; engine (dice, checks, saves, attacks, HP, initiative); LLM loop + dice log; Czech narration; AI companions/enemies; basic tactical grid; Piper TTS; Docker deployment.
- **v2 — Depth:** full spells/conditions/resistances; full tactical grid (terrain, cover, AoE, LoS); overworld map (Leaflet) + point-crawl travel + fog of war.
- **v3 — Reach:** networked multiplayer; leveling automation; AI-assisted campaign import.

## Documentation & licensing

- **Authoritative spec:** [`ai-dungeon-master-spec.md`](ai-dungeon-master-spec.md).
- **Per-campaign schema legend:** each campaign folder ships a `CAMPAIGN.md` (e.g. [`data/vault.example/campaigns/velen-roads/CAMPAIGN.md`](data/vault.example/campaigns/velen-roads/CAMPAIGN.md)) so any human or LLM can pick the game up.
- **Licenses & attribution:** see [`LICENSES.md`](LICENSES.md) (project license, D&D 5e SRD 5.1 attribution, third-party libraries).
