#!/usr/bin/env bash
# AI Dungeon Master — plug-and-play setup
# =============================================================================
# Interactive bootstrap for both editions. Run it from anywhere; it operates on
# the docker/ folder next to this script. It:
#   - picks the edition (self-hosted single-tenant, or commercial multi-tenant)
#   - asks only for the values that edition genuinely needs
#   - generates a strong AUTH_SECRET for you (commercial)
#   - writes docker/.env (backing up any existing one)
#   - writes your domain into docker/Caddyfile (commercial)
#   - validates the stack and offers to start it
#
# No value you type is stored anywhere except the local .env file.

set -euo pipefail

# ---------------------------------------------------------------------------
# Locate ourselves and move into docker/
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="$SCRIPT_DIR/.env"
CADDYFILE="$SCRIPT_DIR/Caddyfile"

# Where to fetch companion files (compose + Caddyfile) if they aren't already
# next to this script. Lets you run it on a NAS with NO git checkout — just
# download setup.sh and it pulls the rest. Override the branch with ADM_REF.
ADM_REF="${ADM_REF:-main}"
ADM_RAW_BASE="${ADM_RAW_BASE:-https://raw.githubusercontent.com/ondreu/verbose-giggle/$ADM_REF/docker}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }

# Prompt helper: ask "$1", default "$2" (optional). Echoes the answer.
ask() {
  local prompt="$1" def="${2:-}" reply
  if [ -n "$def" ]; then
    read -r -p "  $prompt [$def]: " reply
    printf '%s' "${reply:-$def}"
  else
    read -r -p "  $prompt: " reply
    printf '%s' "$reply"
  fi
}

# Required prompt: keeps asking until non-empty.
ask_required() {
  local prompt="$1" reply
  while :; do
    reply="$(ask "$prompt")"
    [ -n "$reply" ] && { printf '%s' "$reply"; return; }
    info "Tato hodnota je povinná."
  done
}

# Secret prompt (no echo).
ask_secret() {
  local prompt="$1" reply
  read -r -s -p "  $prompt: " reply
  echo >&2
  printf '%s' "$reply"
}

# Generate a random base64 secret (openssl, fall back to /dev/urandom).
gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n'
  else
    head -c 48 /dev/urandom | base64 | tr -d '\n'
  fi
}

# Ensure a companion file exists next to the script; download it if missing.
# Used so the script works on a NAS with no git checkout.
fetch_if_missing() {
  local name="$1"
  [ -f "$SCRIPT_DIR/$name" ] && return 0
  info "Stahuji $name z $ADM_REF…"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$ADM_RAW_BASE/$name" -o "$SCRIPT_DIR/$name"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$SCRIPT_DIR/$name" "$ADM_RAW_BASE/$name"
  else
    info "CHYBA: chybí curl i wget — stáhni ručně $ADM_RAW_BASE/$name vedle skriptu."
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
bold "AI Dungeon Master — setup"
echo

if ! command -v docker >/dev/null 2>&1; then
  info "VAROVÁNÍ: 'docker' nebyl nalezen v PATH. .env vytvořím, ale stack nespustím."
  echo
fi

if [ -f "$ENV_FILE" ]; then
  info "Existující .env nalezen."
  overwrite="$(ask "Přepsat? (necháš zálohu .env.bak) [y/N]" "N")"
  case "$overwrite" in
    y|Y|yes|ano) cp "$ENV_FILE" "$ENV_FILE.bak"; info "Záloha: .env.bak" ;;
    *) info "Ponechávám stávající .env beze změny. Konec."; exit 0 ;;
  esac
fi

# ---------------------------------------------------------------------------
# Edition
# ---------------------------------------------------------------------------
bold "1) Edice"
info "  [1] Self-hosted  — jeden vault, bez loginu, bez kreditů (domácí/NAS)"
info "  [2] Commercial   — multi-tenant, login povinný, kredity + SMTP (placená)"
edition="$(ask "Vyber edici" "1")"
echo

# ---------------------------------------------------------------------------
# Shared (optional) — LLM key. Empty = offline mock narrator.
# ---------------------------------------------------------------------------
bold "2) LLM (AI vypravěč)"
info "Necháš-li klíč prázdný, běží OFFLINE MOCK vypravěč (engine počítá reálně)."
info "U komerční edice ho lze doplnit i pozdějí v /admin → Poskytovatelé."
llm_key="$(ask "LLM_API_KEY (Mistral/OpenRouter…)" "")"
llm_base="$(ask "LLM_BASE_URL" "https://api.mistral.ai/v1")"
llm_model="$(ask "LLM_MODEL" "mistral-medium-3.5")"
echo

if [ "$edition" = "2" ]; then
  # -------------------------------------------------------------------------
  # Commercial edition
  # -------------------------------------------------------------------------
  bold "3) Doména a admin"
  domain="$(ask_required "Veřejná doména (např. dnd.example.com)")"
  public_url="$(ask "PUBLIC_URL" "https://$domain")"
  admin_email="$(ask_required "Admin e-mail (získá roli admin po registraci)")"
  echo

  bold "3b) Ingress (HTTPS)"
  info "  cloudflare — Cloudflare Tunnel: NEotevírá porty 80/443 (doporučeno pro NAS,"
  info "               kde admin UI obvykle 443 už obsadilo)"
  info "  caddy      — vlastní HTTPS přes Caddy: vyžaduje volné porty 80 a 443"
  ingress="$(ask "Ingress" "cloudflare")"
  cf_token=""
  if [ "$ingress" = "cloudflare" ]; then
    info "Token získáš v Cloudflare Zero Trust → Networks → Tunnels (token-based),"
    info "a v Public Hostname nasměruj $domain → http://app:3000."
    cf_token="$(ask_required "CLOUDFLARE_TUNNEL_TOKEN")"
  fi
  echo

  bold "4) SMTP (ověřovací + reset e-maily — povinné)"
  smtp_host="$(ask_required "SMTP_HOST (např. smtp.resend.com)")"
  smtp_port="$(ask "SMTP_PORT" "587")"
  smtp_secure="$(ask "SMTP_SECURE (true pro port 465)" "false")"
  smtp_user="$(ask "SMTP_USER" "")"
  smtp_pass="$(ask_secret "SMTP_PASS (skryté)")"
  smtp_from="$(ask "SMTP_FROM" "no-reply@$domain")"
  echo

  bold "5) Turnstile CAPTCHA (volitelné, doporučeno pro veřejný provoz)"
  info "Zdarma na dash.cloudflare.com → Turnstile. Necháš-li prázdné, CAPTCHA je vypnutá."
  turnstile_site="$(ask "TURNSTILE_SITE_KEY" "")"
  turnstile_secret="$(ask "TURNSTILE_SECRET_KEY" "")"
  echo

  auth_secret="$(gen_secret)"
  info "AUTH_SECRET vygenerován automaticky."
  echo

  cat > "$ENV_FILE" <<EOF
# Generated by docker/setup.sh — COMMERCIAL edition. See ../.env.example for docs.

# --- LLM ---
LLM_API_KEY=$llm_key
LLM_BASE_URL=$llm_base
LLM_MODEL=$llm_model

# --- Accounts / multi-tenant ---
AUTH_ALLOW_ANONYMOUS=false
AUTH_REGISTRATION=true
AUTH_REQUIRE_VERIFIED=true
ADMIN_EMAIL=$admin_email
AUTH_SECRET=$auth_secret
PUBLIC_URL=$public_url
BACKUP_RETENTION=10

# --- Anti-abuse ---
TURNSTILE_SITE_KEY=$turnstile_site
TURNSTILE_SECRET_KEY=$turnstile_secret

# --- SMTP ---
SMTP_HOST=$smtp_host
SMTP_PORT=$smtp_port
SMTP_SECURE=$smtp_secure
SMTP_USER=$smtp_user
SMTP_PASS=$smtp_pass
SMTP_FROM=$smtp_from

# --- Credits / metering ---
CREDITS_ENABLED=true
CREDITS_PER_MESSAGE=10
CREDITS_PER_CAMPAIGN=200
CREDITS_PER_IMAGE=50

# --- Ingress ---
CLOUDFLARE_TUNNEL_TOKEN=$cf_token
EOF

  # Caddy ingress writes the domain into the Caddyfile; the tunnel doesn't need it.
  if [ "$ingress" = "caddy" ]; then
    fetch_if_missing "Caddyfile"
    cp "$CADDYFILE" "$CADDYFILE.bak"
    sed -i.tmp "s/^dnd\.example\.org {/$domain {/" "$CADDYFILE" && rm -f "$CADDYFILE.tmp"
    info "Caddyfile: doména nastavena na $domain (záloha .bak)."
  fi

  COMPOSE_FILE="docker-compose.commercial.yml"
else
  # -------------------------------------------------------------------------
  # Self-hosted edition
  # -------------------------------------------------------------------------
  bold "3) Ingress (jak se k appce dostaneš zvenčí)"
  info "  none       — jen LAN / Tailscale (bez otevřených portů)"
  info "  caddy      — veřejné HTTPS přes Caddy (nastav doménu v Caddyfile)"
  info "  cloudflare — Cloudflare Tunnel (bez otevřených portů)"
  ingress="$(ask "Ingress" "none")"
  cf_token=""
  if [ "$ingress" = "cloudflare" ]; then
    cf_token="$(ask "CLOUDFLARE_TUNNEL_TOKEN" "")"
  elif [ "$ingress" = "caddy" ]; then
    domain="$(ask "Doména pro Caddy (např. dnd.example.com)" "")"
    if [ -n "$domain" ]; then
      fetch_if_missing "Caddyfile"
      cp "$CADDYFILE" "$CADDYFILE.bak"
      sed -i.tmp "s/^dnd\.example\.org {/$domain {/" "$CADDYFILE" && rm -f "$CADDYFILE.tmp"
      info "Caddyfile: doména nastavena na $domain (záloha .bak)."
    fi
  fi
  echo

  cat > "$ENV_FILE" <<EOF
# Generated by docker/setup.sh — SELF-HOSTED edition. See ../.env.example for docs.

# --- LLM (empty = offline mock; can also be set in the app's gear Settings) ---
LLM_API_KEY=$llm_key
LLM_BASE_URL=$llm_base
LLM_MODEL=$llm_model

# --- Single-tenant defaults ---
AUTH_ALLOW_ANONYMOUS=true
CREDITS_ENABLED=false

# --- Cloudflare Tunnel token (only used with --profile cloudflare) ---
CLOUDFLARE_TUNNEL_TOKEN=$cf_token
EOF

  COMPOSE_FILE="docker-compose.yml"
fi

info ".env zapsán: $ENV_FILE"

# Make sure the chosen compose file is present (download if no git checkout).
fetch_if_missing "$COMPOSE_FILE"
echo

# ---------------------------------------------------------------------------
# Validate + start
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  PROFILE_HINT=""
  if [ "${ingress:-none}" = "caddy" ] || [ "${ingress:-none}" = "cloudflare" ]; then
    PROFILE_HINT="--profile $ingress "
  fi
  bold "Hotovo (docker nenalezen)"
  info "Spusť ručně: docker compose -f $COMPOSE_FILE ${PROFILE_HINT}up -d"
  exit 0
fi

# Build the up command. A caddy/cloudflare ingress needs a --profile (in both
# editions; commercial always has one, self-host only when not "none").
UP_ARGS=(-f "$COMPOSE_FILE")
if [ "${ingress:-none}" = "caddy" ] || [ "${ingress:-none}" = "cloudflare" ]; then
  UP_ARGS+=(--profile "$ingress")
fi

bold "Validuji stack…"
docker compose "${UP_ARGS[@]}" config -q && info "OK"
echo

start="$(ask "Spustit teď? (docker compose ${UP_ARGS[*]} up -d) [Y/n]" "Y")"
case "$start" in
  n|N|no|ne) info "Přeskočeno. Spustíš příkazem výše." ;;
  *)
    docker compose "${UP_ARGS[@]}" up -d
    echo
    bold "Běží!"
    if [ "${edition:-1}" = "2" ]; then
      info "Otevři ${public_url:-https://your-domain} a zaregistruj se e-mailem $admin_email (získáš admin roli)."
      info "Pak v /admin nastav ceník per model a přiděl kredity."
    else
      info "Otevři aplikaci (LAN/Tailscale na :3000, nebo svou doménu) a začni hrát."
    fi
    ;;
esac
