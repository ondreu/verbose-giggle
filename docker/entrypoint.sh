#!/bin/sh
# AI Dungeon Master — container entrypoint (spec §14.2).
#
# Seeds an empty vault from the bundled example before starting the server, so
# `docker compose up -d` works out of the box even when ./vault is an empty
# bind mount (a mount shadows the image's pre-seeded /data/vault, which is the
# usual cause of "ENOENT … /data/vault/campaigns" on first run). Idempotent:
# it never overwrites an existing campaigns/ folder.
set -e

VAULT="${VAULT_PATH:-/data/vault}"
EXAMPLE=/app/data/vault.example

if [ ! -d "$VAULT/campaigns" ] && [ -d "$EXAMPLE/campaigns" ]; then
  echo "[entrypoint] $VAULT/campaigns missing — seeding bundled example vault"
  mkdir -p "$VAULT"
  cp -r "$EXAMPLE/." "$VAULT/"
fi

exec node apps/server/dist/index.js
