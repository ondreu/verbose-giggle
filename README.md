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
- **TTS** — **Azure AI Speech** (primary; expressive Czech neural voices, called directly from the server — no sidecar/GPU needed) with **Piper** (local sidecar) as the flat-but-free fallback.
- **Sidecars** — **Piper** (fallback Czech TTS), **Caddy** (auto-HTTPS reverse proxy), **Watchtower** (auto-update from GHCR `:latest`).

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

> **In-app settings.** The LLM provider/key/model, image generation, **Azure TTS (key/region/voice/drama)**, the campaign selection, and the SRD path can all be configured from the web UI (gear icon, top-right) without editing `.env`. They are stored in `<vault>/settings.json` and **override** the environment defaults below — so `.env` only needs a minimal bootstrap (vault path, port/host, the fallback `PIPER_URL`, optional `BASIC_AUTH`, Cloudflare token). LLM and TTS changes apply live; campaign and SRD path apply on the next server start. Secrets are write-only over the API (the UI shows only whether a key is set, never its value), and `BASIC_AUTH` deliberately stays env-only as the gate that guards the settings UI itself.

| Variable | Default | Required | Description |
|---|---|---|---|
| `LLM_API_KEY` | _(empty)_ | No | API key for the LLM provider (Mistral, OpenRouter, …). Empty → offline mock narrator. |
| `LLM_PROVIDER` | _(auto)_ | No | Set to `mock` to force the offline narrator even with a key present. |
| `LLM_BASE_URL` | `https://api.mistral.ai/v1` | No | OpenAI-compatible chat-completions base URL. Set to OpenRouter's to route there. |
| `LLM_MODEL` | `mistral-medium-3.5` | No | Model id (overridable per campaign via `campaign.yaml`). |
| `VAULT_PATH` | `./data/vault` | No | Path to the vault root (contains `campaigns/`). |
| `SRD_PATH` | `/data/srd` | No | Full SRD dataset (5e-bits/5e-database JSON); the Docker mount `./srd:/data/srd`. Falls back to a bundled subset. |
| `CAMPAIGN` | _(first found)_ | No | Specific campaign folder under `<vault>/campaigns`. |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | _(unset → Azure off)_ | No | **Primary TTS** — Azure AI Speech (expressive Czech). Set both to enable; falls back to Piper on error. |
| `AZURE_TTS_VOICE` | `cs-CZ-AntoninNeural` | No | Azure voice (`cs-CZ-AntoninNeural` m, `cs-CZ-VlastaNeural` f). |
| `AZURE_TTS_RATE` / `AZURE_TTS_PITCH` | `-6%` / `-2%` | No | SSML prosody tuning for a dramatic narrator. |
| `PIPER_URL` | _(unset → off)_ | No | **Fallback TTS** — Piper HTTP endpoint (`POST /tts {text} -> audio/wav`). Used when Azure is unset or errors. |
| `BASIC_AUTH` | _(none)_ | No | Optional shared HTTP Basic Auth gate, `user:pass`. |
| `WEB_DIST` | `../../web/dist` | No | Path to the built web client. The Docker image sets `/app/apps/web/dist`. |
| `PORT` | `3000` | No | HTTP port. |
| `HOST` | `0.0.0.0` | No | Bind host. |
| `IMAGE_BASE_URL` | _(unset → disabled)_ | No | Image generation base URL. Set to `https://api.mistral.ai/v1` to use Mistral (Agents + image_generation tool), or any OpenAI-compatible endpoint (DALL-E, Together AI). |
| `IMAGE_MODEL` | `mistral-medium-2505` / `dall-e-3` | No | Model ID. Defaults to `mistral-medium-2505` when base URL contains `mistral.ai`, otherwise `dall-e-3`. |
| `IMAGE_API_KEY` | _(falls back to `LLM_API_KEY`)_ | No | API key for the image provider. |

## Docker / NAS deployment

CI builds and pushes a multi-stage image to `ghcr.io/ondreu/ai-dungeon-master:latest` on every push to `main`. There are **two deployment editions**, both driven by the same image — they differ only in env / Compose file:

| Edition | Compose file | Auth | Data | Metering |
| --- | --- | --- | --- | --- |
| **Self-hosted** (single-tenant) | `docker-compose.yml` (or `docker-compose.nas.yml` for NAS GUIs) | Anonymous OK (`AUTH_ALLOW_ANONYMOUS=true`) | One shared vault | Off |
| **Commercial** (multi-tenant / hosted) | `docker-compose.commercial.yml` | Login required (`AUTH_ALLOW_ANONYMOUS=false`) | Per-user isolation under `<vault>/users/<id>/` | Credits on (#56) |

### Self-hosted

On the NAS, use the provided Compose stack (app + Piper + Watchtower, plus an optional ingress):

```bash
cd docker
# Create a .env next to docker-compose.yml (copy ../.env.example).
docker compose up -d                          # app only (LAN / Tailscale)
docker compose --profile caddy up -d          # + Caddy public HTTPS
docker compose --profile cloudflare up -d     # + Cloudflare Tunnel
```

### Commercial (multi-tenant / hosted)

The paid public edition turns on the full account + monetisation surface: required login, per-user data isolation (#55f-2), credit metering (#56), SMTP for email verification / password reset, and Turnstile CAPTCHA. Caddy public HTTPS is always on (a commercial deploy is public by definition).

```bash
cd docker
cp ../.env.example .env        # fill in every [COMMERCIAL] item, then set your domain in Caddyfile
docker compose -f docker-compose.commercial.yml up -d
```

Required in `.env` before first start: `LLM_API_KEY`, `ADMIN_EMAIL`, `AUTH_SECRET` (`openssl rand -base64 48`), `PUBLIC_URL`, the `SMTP_*` block, and `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`. After boot, register with `ADMIN_EMAIL` to claim the admin role, then set per-model pricing and grant credits from `/admin`. See the `[COMMERCIAL]`-marked vars in [`.env.example`](.env.example) and the hardening checklist in [ROADMAP.md](ROADMAP.md) §59.

- Mount your real content over `./vault`, `./maps`, `./srd`. Live session state is written inside each campaign's `state/` folder, so it persists with the vault.
- **TLS / public access:** see [Ingress options](#ingress-options) below — Caddy, Tailscale, or Cloudflare Tunnel.
- **Auto-update:** Watchtower pulls `:latest` when CI pushes a new image (only containers labeled `watchtower.enable=true`).
- **Local image build:** in `docker-compose.yml`, comment the `image:` line and uncomment the `build:` block (context `..`, dockerfile `docker/Dockerfile`).
- **TTS:** the `piper` sidecar (`services/piper-http`) implements the `POST /tts {text} -> audio/wav` contract the server expects; mount a `cs_CZ` voice at `./piper-voices` and set `PIPER_VOICE`. Without a voice it returns silence, so the app still runs.

### Ingress options

Pick one (or none — reach it over your LAN / Tailscale):

- **Caddy** (`--profile caddy`): public auto-HTTPS. Set your domain in [`docker/Caddyfile`](docker/Caddyfile).
- **Tailscale**: no profile — leave the app internal and reach it over your tailnet.
- **Cloudflare Tunnel** (`--profile cloudflare`): no open ports / no port-forwarding; `cloudflared` dials out to Cloudflare, which terminates TLS. SSE (`/api/events`) works through it (the server sends keep-alive pings every 25 s).

#### Cloudflare Tunnel — quick deploy

1. In **Cloudflare Zero Trust → Networks → Tunnels**, create a tunnel (connector type *Cloudflared*) and copy its **token**.
2. Put it in `docker/.env`: `CLOUDFLARE_TUNNEL_TOKEN=eyJ...`
3. In the tunnel's **Public Hostnames**, add your hostname (e.g. `dnd.example.org`) → Service **HTTP** `app:3000`.
4. Start it: `docker compose --profile cloudflare up -d`. Cloudflare creates the DNS record automatically; open your hostname.
5. **Protect it** (the app has no built-in login): either enable **Cloudflare Access** (Zero Trust → Access → Applications, e-mail/SSO) on that hostname, or set `BASIC_AUTH=user:pass` in `.env`.

> Quick test without a domain: `cloudflared tunnel --url http://localhost:3000` gives a temporary `*.trycloudflare.com` URL.

### Voice (TTS)

For a vivid, dramatic Czech narrator the recommended primary engine is **Azure AI Speech** — no GPU or extra container required, the server calls it directly:

1. In the [Azure portal](https://portal.azure.com) create a **Speech** resource (the free **F0** tier covers ≈500k characters/month). Copy a **KEY** and the **REGION** (e.g. `westeurope`).
2. Enter the key/region in the web UI (**gear → Hlas**) — or put `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` in `.env`. Pick a voice (`cs-CZ-AntoninNeural` or `cs-CZ-VlastaNeural`).
3. Tune the drama with the rate/pitch fields (a slightly slower, lower read carries more gravitas; env equivalents `AZURE_TTS_RATE` / `AZURE_TTS_PITCH`). The server wraps each line in SSML prosody automatically.

**Piper** remains the offline fallback (used automatically when Azure is unset or errors). It is flat by design — fine for dev/CI, but Azure is the recommended table voice. The bundled Piper sidecar is an HTTP adapter (`services/piper-http`) implementing the same `POST /tts {text} -> audio/wav` contract; mount a `cs_CZ` voice at `./piper-voices` and set `PIPER_VOICE` (without one it returns silence, so the pipeline stays wired).

## Core principles

These are non-negotiable (spec §2):

1. **Determinism over hallucination.** The engine owns every die roll and every piece of game state. The LLM requests mechanics through tools and narrates the returned facts — it cannot emit an authoritative number as free text.
2. **Visible dice log.** Every engine computation (e.g. `d20: 14 +5 = 19 vs AC 15 → hit; 1d8+3 = 7 slashing`) is logged and rendered. Trust is earned by being auditable.
3. **Dual-use vault notes.** Each entity is one note: its **frontmatter is machine truth** (read by the engine), its **body is flavor** (read by the LLM for narration / AI control).
4. **Portable, file-first data.** Authored content and durable state are plain files in the vault, syncable by any tool the user chooses. Sync is out of scope; the app just mounts the vault.
5. **Server-authoritative state from day one.** Even in hotseat, live state lives on the server and is mutated only through commands — making networked multiplayer additive, not a rewrite.
6. **Provider-agnostic LLM.** Defaults to Mistral but speaks the OpenAI-compatible chat-completions-with-tools shape, so Mistral or OpenRouter work interchangeably.

## Roadmap (abridged)

- **Priority fixes (from playtest):** see [`ROADMAP.md`](ROADMAP.md) — the live list of bugs and UX gaps to close next.
- **v1 — Playable core (hotseat):** vault adapter + schemas; sheet render/edit; engine (dice, checks, saves, attacks, HP, initiative); LLM loop + dice log; Czech narration; AI companions/enemies; basic tactical grid; Piper TTS; Docker deployment.
- **v2 — Depth:** full spells/conditions/resistances; full tactical grid (terrain, cover, AoE, LoS); overworld map (Leaflet) + point-crawl travel + fog of war.
- **v3 — Reach:** networked multiplayer; leveling automation; AI-assisted campaign import.

Authoring & deployment how-to (showcase vault, SRD asset database, NAS updating): [`docs/SHOWCASE.md`](docs/SHOWCASE.md).

## Documentation & licensing

- **Authoritative spec:** [`ai-dungeon-master-spec.md`](ai-dungeon-master-spec.md).
- **Per-campaign schema legend:** each campaign folder ships a `CAMPAIGN.md` (e.g. [`data/vault.example/campaigns/konvoj-do-vresoviste/CAMPAIGN.md`](data/vault.example/campaigns/konvoj-do-vresoviste/CAMPAIGN.md)) so any human or LLM can pick the game up.
- **Licenses & attribution:** see [`LICENSES.md`](LICENSES.md) (project license, D&D 5e SRD 5.1 attribution, third-party libraries).
