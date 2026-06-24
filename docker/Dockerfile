# syntax=docker/dockerfile:1

# AI Dungeon Master — multi-stage image (spec §14.1)
#
# Stage 1 (builder): install the whole pnpm workspace and run `pnpm -r build`,
#   which builds the shared packages (@adm/engine, @adm/schemas, @adm/srd),
#   the Fastify server (tsc -> apps/server/dist), and the Vite web client
#   (-> apps/web/dist) in dependency order.
# Stage 2 (runtime): a lean node image that serves the API + the static web
#   build on a single port.
#
# NOTE ON IMAGE SIZE: the runtime stage copies the entire built workspace
# (including node_modules and every package's dist). This is deliberate — it
# guarantees the server can resolve its workspace deps (@adm/engine, etc.)
# and their transitive deps without trying to prune a pnpm symlink farm. A
# future optimization is `pnpm deploy --filter @adm/server --prod` (or
# `pnpm --filter @adm/server deploy`) to produce a pruned, production-only
# bundle. Favor correctness over size for now.

# ---------------------------------------------------------------------------
# Stage 1 — builder
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

# pnpm via corepack (matches packageManager pin in package.json)
RUN corepack enable

WORKDIR /app

# Copy the full workspace. (Build context is the repo root; see compose
# `build.context: ..`. A .dockerignore keeps node_modules/dist/state out.)
COPY . .

# Install all workspace deps (dev deps included — needed for tsc/vite builds).
# Use the committed lockfile for reproducible builds.
RUN pnpm install --frozen-lockfile

# Build packages -> server -> web, in dependency order.
RUN pnpm -r build

# ---------------------------------------------------------------------------
# Stage 2 — runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

RUN corepack enable

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Copy the entire built workspace (server dist, packages dist, web dist, and
# node_modules). See the note above re: pruning as a future optimization.
COPY --from=builder /app /app

# The server resolves its web build from WEB_DIST (falls back to ../../web/dist
# relative to apps/server/dist/index.js). Point it at the built web client.
ENV WEB_DIST=/app/apps/web/dist

# Bundle the example vault + SRD under /data so the container is runnable
# out of the box. In production these are normally overridden by mounted
# volumes (see docker-compose.yml). VAULT_PATH defaults here to the bundled
# example; mount your own vault over /data/vault to use real content.
RUN mkdir -p /data/vault /data/maps /data/srd /data/state \
  && cp -r /app/data/vault.example/. /data/vault/ 2>/dev/null || true \
  && cp -r /app/packages/srd/data/. /data/srd/ 2>/dev/null || true
ENV VAULT_PATH=/data/vault
# SRD dataset: the in-repo bundled copy (#45a) is staged here at build time, so
# the container runs with a full dataset out of the box. A Compose bind mount
# (./srd:/data/srd) still overrides it for users with their own database.
ENV SRD_PATH=/data/srd

EXPOSE 3000

# Entrypoint re-seeds the example into an empty mounted vault before starting
# (a bind mount over /data/vault hides the copy above). Idempotent.
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
