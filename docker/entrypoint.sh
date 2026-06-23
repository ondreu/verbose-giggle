#!/bin/sh
# AI Dungeon Master — container entrypoint (spec §14.2).
#
# Seeds an empty vault from the bundled example before starting the server, so
# `docker compose up -d` works out of the box even when the vault volume is
# empty on first use. Idempotent: it never overwrites an existing campaigns/.
#
# Migration helper: set VAULT_LEGACY_PATH to the container path of an old
# ./vault bind mount to copy it into the named volume on first start, e.g.:
#   volumes:
#     - vault_data:/data/vault
#     - ./vault:/data/vault-legacy   # temporary migration mount
#   environment:
#     - VAULT_LEGACY_PATH=/data/vault-legacy
# Remove the legacy mount + env var once migrated.
set -e

VAULT="${VAULT_PATH:-/data/vault}"
EXAMPLE=/app/data/vault.example
LEGACY="${VAULT_LEGACY_PATH:-}"

if [ ! -d "$VAULT/campaigns" ]; then
  # One-time migration: copy campaigns from an old bind-mount path into the
  # (now empty) named volume, preserving all user data.
  if [ -n "$LEGACY" ] && [ -d "$LEGACY/campaigns" ]; then
    echo "[entrypoint] Migrating vault from legacy path $LEGACY → $VAULT"
    mkdir -p "$VAULT"
    cp -r "$LEGACY/." "$VAULT/"
  elif [ -d "$EXAMPLE/campaigns" ]; then
    echo "[entrypoint] $VAULT/campaigns missing — seeding bundled example vault"
    mkdir -p "$VAULT"
    cp -r "$EXAMPLE/." "$VAULT/"
  fi
fi

echo "[entrypoint] vault: $VAULT (campaigns: $(ls "$VAULT/campaigns" 2>/dev/null | wc -l | tr -d ' '))"
exec node apps/server/dist/index.js
