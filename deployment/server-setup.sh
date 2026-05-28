#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║  Doable — Production Server Auto-Installer                  ║
# ║  Sets up everything on a fresh Ubuntu 22.04/24.04 server    ║
# ╚══════════════════════════════════════════════════════════════╝
set -euo pipefail

# ─── Colors ─────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ─── Container mode (Wave 30-D) ────────────────────────────────
# When running inside an Ubuntu Docker container with systemd PID 1,
# host-only steps (UFW, swap, gh-auth, repo clone, Cloudflare Tunnel
# auth, service start) are skipped. All hardening, secret generation,
# DB setup, Caddy, and per-app systemd units still execute.
CONTAINER_MODE="${CONTAINER_MODE:-0}"
if [ "$CONTAINER_MODE" = "1" ]; then
  info "Running in CONTAINER_MODE — host-only steps will be skipped."
fi

# ─── No-tunnel mode (pure-IP installs) ─────────────────────────
# Set NO_TUNNEL=1 together with HOST=<ip-or-hostname> to skip Cloudflare
# Tunnel entirely and serve api/ws/web directly behind Caddy with a
# self-signed cert on :443. Used for fresh-user installs on a bare IP
# without any Cloudflare-managed domain.
NO_TUNNEL="${NO_TUNNEL:-0}"
# LETSENCRYPT=1 (NO_TUNNEL mode, public DOMAIN, ports 80/443 open to the
# internet) makes Caddy auto-provision a real, browser-trusted Let's Encrypt
# cert for HOST instead of a self-signed one — the baremetal equivalent of
# docker/setup.sh's DOMAIN mode. This is the user "topology (b)": a remote box
# with public 80/443 and no Cloudflare. Default 0 (self-signed) keeps zero
# external dependency for pure-IP / private installs. Only valid when HOST is a
# real domain (LE won't issue for a bare IP or localhost).
LETSENCRYPT="${LETSENCRYPT:-0}"
USE_LE=0
if [ "$NO_TUNNEL" = "1" ]; then
  if [ -z "${HOST:-}" ]; then
    err "NO_TUNNEL=1 requires HOST=<ip-or-hostname> (e.g. HOST=203.0.113.10 NO_TUNNEL=1 ./server-setup.sh)"
  fi
  if [ "$LETSENCRYPT" = "1" ]; then
    if echo "$HOST" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || [ "$HOST" = "localhost" ]; then
      err "LETSENCRYPT=1 requires HOST to be a public DNS domain (got '${HOST}'). Let's Encrypt cannot issue for a bare IP or localhost — drop LETSENCRYPT for a self-signed cert, or use a domain."
    fi
    USE_LE=1
    info "NO_TUNNEL=1 + LETSENCRYPT=1 — Caddy will fetch a Let's Encrypt cert for https://${HOST} (ports 80+443 must be reachable from the internet)"
  else
    info "NO_TUNNEL=1 — serving api/ws/web at https://${HOST} with a self-signed cert"
  fi
fi

# ─── Auto-tmux wrap (crash-safe forensics) ─────────────────────
# Re-exec inside a tmux session named `doable-setup` so the pane stays
# open after the script exits — successes AND failures retain full
# scrollback for forensics. Operators can attach with:
#   tmux a -t doable-setup
# Opt-out: set DOABLE_NO_TMUX=1. Skipped in CONTAINER_MODE (no tty)
# and when already inside tmux ($TMUX set).
if [ "$CONTAINER_MODE" != "1" ] \
  && [ -z "${TMUX:-}" ] \
  && [ "${DOABLE_NO_TMUX:-0}" != "1" ] \
  && command -v tmux >/dev/null 2>&1 \
  && [ -t 0 ] || [ -n "${DOABLE_FORCE_TMUX:-}" ]; then
  if command -v tmux >/dev/null 2>&1 && [ -z "${TMUX:-}" ]; then
    SCRIPT_PATH="$(readlink -f "$0")"
    LOG_PATH="${DOABLE_SETUP_LOG:-/root/doable-setup.log}"
    info "Re-executing inside tmux session 'doable-setup' (log: ${LOG_PATH})."
    info "  Attach:  tmux a -t doable-setup"
    info "  Opt out: DOABLE_NO_TMUX=1 $SCRIPT_PATH"
    tmux kill-session -t doable-setup 2>/dev/null || true
    exec tmux new-session -s doable-setup \
      "bash -c '${SCRIPT_PATH} 2>&1 | tee ${LOG_PATH}; echo; echo ===SETUP EXITED===; exec bash'"
  fi
fi

# ─── Pre-flight checks ─────────────────────────────────────────
[[ $EUID -ne 0 ]] && err "This script must be run as root"
[[ ! -f /etc/os-release ]] && err "Cannot detect OS"
source /etc/os-release
[[ "$ID" != "ubuntu" && "$ID" != "debian" ]] && err "This script supports Ubuntu and Debian only (detected: $ID)"

# Add PostgreSQL Global Development Group (PGDG) apt repo on Debian — the
# stock Debian repo ships PG15, but the doable stack pins to PG16 (pgvector
# is much easier to install on 16). On Ubuntu the default repos already
# ship PG16 since 24.04, so we only enable PGDG on Debian.
if [[ "$ID" == "debian" ]]; then
  if ! grep -q "apt.postgresql.org" /etc/apt/sources.list.d/pgdg.list 2>/dev/null; then
    install -d /usr/share/postgresql-common/pgdg
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release; echo "$VERSION_CODENAME")-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list
    apt-get update -qq
  fi
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║          Doable — Production Server Setup                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── SSH & Firewall Safety ────────────────────────────────────
# CRITICAL: Ensure SSH is never locked out.
# This runs BEFORE any other configuration to prevent lockout.
info "Checking SSH & firewall safety..."

# Ensure SSH is running and enabled
systemctl enable ssh 2>/dev/null || systemctl enable sshd 2>/dev/null || true
systemctl start ssh 2>/dev/null || systemctl start sshd 2>/dev/null || true

# If UFW is installed and active, ensure SSH is allowed FIRST
if command -v ufw &>/dev/null; then
  # Always allow SSH before anything else — even if UFW is inactive,
  # this ensures the rule is in place for when it gets enabled
  ufw allow 22/tcp comment "SSH - NEVER REMOVE" >/dev/null 2>&1 || true

  if ufw status | grep -q "Status: active"; then
    info "UFW is active — verifying SSH is allowed..."
    if ! ufw status | grep -qE "22/tcp.*ALLOW"; then
      err "CRITICAL: UFW is active but SSH (port 22) is not allowed! Adding rule now..."
      ufw allow 22/tcp comment "SSH - NEVER REMOVE"
    fi
    ok "UFW active, SSH allowed"
  else
    ok "UFW inactive (will configure later)"
  fi
else
  ok "UFW not yet installed (will configure later)"
fi

# ─── Gather configuration ──────────────────────────────────────
# If a pre-staged .env already exists at the install path, source it so
# values flow into the prompts as defaults (and the rest of the script).
# This lets operators run setup-server.sh non-interactively on fresh
# servers by copying a master .env into place first — no clicking
# through 14 prompts on each of 100 deploys.
INSTALL_DIR_PRE="${INSTALL_DIR:-/root/doable}"
if [ -z "${PRESEED_ENV_LOADED:-}" ] && [ -f "${INSTALL_DIR_PRE}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "${INSTALL_DIR_PRE}/.env" 2>/dev/null || true
  set +a
  PRESEED_ENV_LOADED=1
  # Derive DOMAIN + sub-domains from the pre-existing URLs in .env so the
  # prompt loop doesn't have to ask for them.
  if [ -z "${DOMAIN:-}" ] && [ -n "${NEXT_PUBLIC_APP_URL:-}" ]; then
    DOMAIN="${NEXT_PUBLIC_APP_URL#https://}"
    DOMAIN="${DOMAIN%/}"
  fi
  if [ -n "${NEXT_PUBLIC_API_URL:-}" ]; then
    api_host="${NEXT_PUBLIC_API_URL#https://}"
    api_host="${api_host%/}"
    : "${API_SUB:=${api_host%%.*}}"
    # Honor the full hostname from .env so multi-level DOMAINs
    # (dev.doable.me → dev-api.doable.me) survive intact and don't get
    # mis-computed as dev-api.dev.doable.me by `${API_SUB}.${DOMAIN}`.
    : "${API_DOMAIN:=${api_host}}"
  fi
  if [ -n "${NEXT_PUBLIC_WS_URL:-}" ]; then
    ws_host="${NEXT_PUBLIC_WS_URL#wss://}"
    ws_host="${ws_host%/}"
    : "${WS_SUB:=${ws_host%%.*}}"
    : "${WS_DOMAIN:=${ws_host}}"
  fi
  if [ -z "${DB_PASS:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
    # DATABASE_URL shape: postgres://doable:<pass>@localhost:5432/doable
    DB_PASS="${DATABASE_URL#postgres://doable:}"
    DB_PASS="${DB_PASS%@*}"
  fi
fi

# Non-interactive mode: triggered explicitly by NON_INTERACTIVE=1, by
# CONTAINER_MODE=1, or whenever stdin is not a TTY (so piped/cron/CI
# invocations don't block on read). Required for 100-server bulk
# deployments — accept whatever defaults the caller pre-staged.
NON_INTERACTIVE="${NON_INTERACTIVE:-0}"
if [ "$CONTAINER_MODE" = "1" ] || [ "$NON_INTERACTIVE" = "1" ] || ! [ -t 0 ]; then
  DOMAIN="${DOMAIN:-localhost}"
  API_SUB="${API_SUB:-api}"
  WS_SUB="${WS_SUB:-ws}"
  REPO="${REPO:-doable-me/doable}"
  DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
  GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
  GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
  GITHUB_CLIENT_ID="${GITHUB_CLIENT_ID:-}"
  GITHUB_CLIENT_SECRET="${GITHUB_CLIENT_SECRET:-}"
  ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
  OPENAI_API_KEY="${OPENAI_API_KEY:-}"
  MINIMAX_API_KEY="${MINIMAX_API_KEY:-}"
  PUBLISH_LAYOUT="${PUBLISH_LAYOUT:-prefix}"
  PUBLISH_PREFIX="${PUBLISH_PREFIX:-do-}"
  WILDCARD_HOSTNAME="${WILDCARD_HOSTNAME:-}"
  STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}"
  STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}"
  CONFIRM="y"
else
  read -rp "Domain for Doable (e.g., doable.me): " DOMAIN
  [[ -z "$DOMAIN" ]] && err "Domain is required"

  read -rp "API subdomain [api]: " API_SUB
  API_SUB="${API_SUB:-api}"

  read -rp "WebSocket subdomain [ws]: " WS_SUB
  WS_SUB="${WS_SUB:-ws}"

  # ── Publish layout: prefix (free Universal SSL) vs infix (requires ACM) ──
  echo ""
  echo "── Publish layout for AI-built sites ──"
  echo "  prefix : <prefix><slug>.<zone>           (works on free Cloudflare Universal SSL)"
  echo "           e.g. dev-portfolio-x7k2m.doable.me — uses the single-level zone wildcard"
  echo "  infix  : <slug>.<env>.<zone>             (requires Cloudflare Advanced Certificate Manager)"
  echo "           e.g. portfolio-x7k2m.dev.doable.me — multi-level wildcard, cleaner URLs"
  read -rp "Publish layout [prefix]: " PUBLISH_LAYOUT
  PUBLISH_LAYOUT="${PUBLISH_LAYOUT:-prefix}"
  case "$PUBLISH_LAYOUT" in
    prefix|infix) ;;
    *) err "PUBLISH_LAYOUT must be 'prefix' or 'infix' (got '${PUBLISH_LAYOUT}')" ;;
  esac

  if [[ "$PUBLISH_LAYOUT" == "infix" ]]; then
    DEFAULT_WILDCARD="*.${DOMAIN}"
    read -rp "Wildcard hostname for published sites (must be inside zone) [${DEFAULT_WILDCARD}]: " WILDCARD_HOSTNAME
    WILDCARD_HOSTNAME="${WILDCARD_HOSTNAME:-$DEFAULT_WILDCARD}"
    PUBLISH_PREFIX=""
  else
    read -rp "Publish subdomain prefix (e.g., do- for prod, dev- for dev) [do-]: " PUBLISH_PREFIX
    PUBLISH_PREFIX="${PUBLISH_PREFIX:-do-}"
    WILDCARD_HOSTNAME=""
  fi

  read -rp "GitHub repo (owner/repo) [doable-me/doable]: " REPO
  REPO="${REPO:-doable-me/doable}"

  read -rp "Database password [auto-generate strong]: " DB_PASS
  DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"

  echo ""
  echo "── Optional: OAuth credentials (press Enter to skip) ──"
  read -rp "Google Client ID: " GOOGLE_CLIENT_ID
  read -rp "Google Client Secret: " GOOGLE_CLIENT_SECRET
  read -rp "GitHub Client ID: " GITHUB_CLIENT_ID
  read -rp "GitHub Client Secret: " GITHUB_CLIENT_SECRET

  echo ""
  echo "── Optional: AI API keys (press Enter to skip) ──"
  read -rp "Anthropic API Key: " ANTHROPIC_API_KEY
  read -rp "OpenAI API Key: " OPENAI_API_KEY
  read -rp "MiniMax API Key (sk-cp-... for M2.7): " MINIMAX_API_KEY

  echo ""
  echo "── Optional: Stripe (press Enter to skip) ──"
  read -rp "Stripe Secret Key: " STRIPE_SECRET_KEY
  read -rp "Stripe Webhook Secret: " STRIPE_WEBHOOK_SECRET
fi

# ── Validate PUBLISH_LAYOUT + WILDCARD_HOSTNAME (both paths converge here) ──
# Runs for interactive, preseed, and non-interactive env-only callers so a
# malformed value can't reach the SQL UPSERT or cloudflared config below.
PUBLISH_LAYOUT="${PUBLISH_LAYOUT:-prefix}"
case "$PUBLISH_LAYOUT" in
  prefix|infix) ;;
  *) err "PUBLISH_LAYOUT must be 'prefix' or 'infix' (got '${PUBLISH_LAYOUT}')" ;;
esac
if [[ "$PUBLISH_LAYOUT" == "infix" ]]; then
  # Non-interactive callers that set PUBLISH_LAYOUT=infix without WILDCARD_HOSTNAME
  # get *.${DOMAIN} as a sensible default — matches what the interactive prompt offers.
  WILDCARD_HOSTNAME="${WILDCARD_HOSTNAME:-*.${DOMAIN}}"
  [[ "$WILDCARD_HOSTNAME" == \*.* ]] || err "WILDCARD_HOSTNAME must start with '*.' (got '${WILDCARD_HOSTNAME}')"
  # Whitelist: hostnames are lowercase a-z, 0-9, hyphens, dots, plus the
  # leading '*.'. Anything else (quotes, semicolons, $, backticks, slashes,
  # spaces) is rejected — defense-in-depth before the value reaches the SQL
  # UPSERT, cloudflared config, or shell interpolation downstream.
  if [[ ! "$WILDCARD_HOSTNAME" =~ ^\*\.[a-z0-9.-]+$ ]]; then
    err "WILDCARD_HOSTNAME must be '*.' + lowercase letters/digits/dots/hyphens only (got '${WILDCARD_HOSTNAME}')"
  fi
  WILDCARD_BARE="${WILDCARD_HOSTNAME#\*.}"
  # Suffix-match against either DOMAIN or its zone so '*.doable.me' is valid
  # for DOMAIN=dev.doable.me too (operator may want zone-wide wildcard).
  DOMAIN_LABEL_COUNT=$(echo "$DOMAIN" | tr '.' '\n' | wc -l)
  if [ "$DOMAIN_LABEL_COUNT" -gt 2 ]; then
    DOMAIN_ZONE_CHECK="${DOMAIN#*.}"
  else
    DOMAIN_ZONE_CHECK="${DOMAIN}"
  fi
  if [[ "$WILDCARD_BARE" != "$DOMAIN" && "$WILDCARD_BARE" != "$DOMAIN_ZONE_CHECK" && "$WILDCARD_BARE" != *".${DOMAIN_ZONE_CHECK}" ]]; then
    err "WILDCARD_HOSTNAME '${WILDCARD_HOSTNAME}' must be inside zone '${DOMAIN_ZONE_CHECK}'"
  fi
  PUBLISH_PREFIX=""
  info "infix layout — published sites at https://<slug>.${WILDCARD_BARE} (requires Cloudflare ACM on zone)"
fi

# ── Dashed-hostname rewrite for multi-level DOMAINs ──
# Cloudflare's free Universal SSL covers <zone> + *.<zone> ONE level only.
# Two-level hostnames like `api.dev.doable.me` fail with
# ERR_SSL_VERSION_OR_CIPHER_MISMATCH without paid Advanced Cert Manager.
# So when DOMAIN has >2 labels (e.g. dev.doable.me), collapse API/WS subdomains
# to a SINGLE label under the zone using dashed form:
#   dev.doable.me        → DOMAIN_ZONE=doable.me, ENV_PREFIX=dev
#   api  + dev.doable.me → dev-api.doable.me
#   ws   + dev.doable.me → dev-ws.doable.me
#   publish wildcard     → *.doable.me (the zone — shared across envs)
# Honor pre-staged API_DOMAIN/WS_DOMAIN from .env (PRESEED_ENV_LOADED branch)
# without rewriting them.
DOMAIN_LABEL_COUNT=$(echo "$DOMAIN" | tr '.' '\n' | wc -l)
if [ "$DOMAIN_LABEL_COUNT" -gt 2 ] && [ "$NO_TUNNEL" != "1" ]; then
  # Multi-level: split into <prefix>.<zone>
  ENV_PREFIX="${DOMAIN%%.*}"            # dev   from dev.doable.me
  DOMAIN_ZONE="${DOMAIN#*.}"             # doable.me from dev.doable.me
  API_DOMAIN="${API_DOMAIN:-${ENV_PREFIX}-${API_SUB}.${DOMAIN_ZONE}}"
  WS_DOMAIN="${WS_DOMAIN:-${ENV_PREFIX}-${WS_SUB}.${DOMAIN_ZONE}}"
  if [[ "${PUBLISH_LAYOUT:-prefix}" == "infix" ]]; then
    # infix: operator has ACM and picked a multi-level wildcard.
    # Derive PUBLISH_WILDCARD_DOMAIN from their chosen WILDCARD_HOSTNAME so
    # cloudflared ingress + CF CNAME target the same multi-level zone.
    PUBLISH_WILDCARD_DOMAIN="${WILDCARD_HOSTNAME#\*.}"
  else
    # prefix: free Universal SSL covers <zone> + *.<zone> only.
    PUBLISH_WILDCARD_DOMAIN="${DOMAIN_ZONE}"
  fi
  info "Multi-level DOMAIN detected — dashed hostnames: API=${API_DOMAIN}, WS=${WS_DOMAIN}, publish wildcard *.${PUBLISH_WILDCARD_DOMAIN}"
else
  # Zone-apex (e.g. doable.me) or NO_TUNNEL — keep dot-prefix convention.
  API_DOMAIN="${API_DOMAIN:-${API_SUB}.${DOMAIN}}"
  WS_DOMAIN="${WS_DOMAIN:-${WS_SUB}.${DOMAIN}}"
  if [[ "${PUBLISH_LAYOUT:-prefix}" == "infix" ]]; then
    PUBLISH_WILDCARD_DOMAIN="${WILDCARD_HOSTNAME#\*.}"
  else
    PUBLISH_WILDCARD_DOMAIN="${DOMAIN}"
  fi
fi

# NO_TUNNEL=1 single-host override: api/ws/web all served behind one
# IP-facing Caddy on the same machine, distinguished by request path. Force
# DOMAIN/API_DOMAIN/WS_DOMAIN to the operator-supplied HOST so every
# downstream .env URL and Caddy block points at the IP.
if [ "$NO_TUNNEL" = "1" ]; then
  DOMAIN="${HOST}"
  API_DOMAIN="${HOST}"
  WS_DOMAIN="${HOST}"
  info "NO_TUNNEL=1 — DOMAIN/API_DOMAIN/WS_DOMAIN all set to ${HOST}"
fi

JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
INTERNAL_SECRET=$(openssl rand -hex 16)
# 32 raw bytes, base64-encoded → 44 chars. Master KEK for envelope-crypto;
# wraps per-workspace DEKs and encrypts user-scoped MFA secrets. Once set,
# do not rotate without re-encrypting every workspace_keys row.
DOABLE_KEK=$(openssl rand -base64 32)

echo ""
info "Configuration:"
echo "  Domain:     https://${DOMAIN}"
echo "  API:        https://${API_DOMAIN}"
echo "  WebSocket:  wss://${WS_DOMAIN}"
if [[ "${PUBLISH_LAYOUT:-prefix}" == "infix" ]]; then
  echo "  Publish:    infix → https://<slug>.${PUBLISH_WILDCARD_DOMAIN} (requires Cloudflare ACM)"
else
  echo "  Publish:    prefix '${PUBLISH_PREFIX}' → https://${PUBLISH_PREFIX}<slug>.${PUBLISH_WILDCARD_DOMAIN}"
fi
echo "  Repo:       ${REPO}"
echo ""
if [ "$CONTAINER_MODE" != "1" ] && [ "${NON_INTERACTIVE:-0}" != "1" ] && [ -t 0 ]; then
  read -rp "Proceed? [Y/n]: " CONFIRM
  [[ "${CONFIRM,,}" == "n" ]] && exit 0
fi

# ─── Step 1: System packages ───────────────────────────────────
info "Step 1/13: Installing system packages..."

export DEBIAN_FRONTEND=noninteractive

if [ "$CONTAINER_MODE" = "1" ]; then
  ok "[CONTAINER_MODE] System packages already baked into image — skipping apt-get install."
else

# Node.js 20 LTS
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# pnpm
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm@9.15.4
fi

# PostgreSQL
if ! command -v psql &>/dev/null; then
  apt-get install -y postgresql postgresql-contrib
fi

# pgvector extension for PostgreSQL.
# Must match the major version of the cluster that ACTUALLY serves :5432.
# Hardcoding a major (e.g. 16) silently breaks on hosts where PGDG has advanced
# to a newer default (e.g. 18, pulled in by the `postgresql` meta-package above):
# the wrong `postgresql-<major>-pgvector` installs, `CREATE EXTENSION vector`
# then fails, and embeddings / RAG / generated chatbots are silently disabled.
# Detect the live major dynamically and install the matching package.
if ! dpkg -l | grep -q "postgresql-.*-pgvector"; then
  PG_MAJOR="$(pg_lsclusters -h 2>/dev/null | awk '$4=="online"{print $1; exit}')"
  [ -z "${PG_MAJOR:-}" ] && PG_MAJOR="$(psql -V 2>/dev/null | grep -oE '[0-9]+' | head -1)"
  [ -z "${PG_MAJOR:-}" ] && PG_MAJOR="$(ls -d /usr/lib/postgresql/* 2>/dev/null | grep -oE '[0-9]+$' | sort -rn | head -1)"
  if [ -n "${PG_MAJOR:-}" ]; then
    info "Installing pgvector for PostgreSQL ${PG_MAJOR}"
    apt-get install -y "postgresql-${PG_MAJOR}-pgvector" 2>/dev/null \
      || apt-get install -y postgresql-16-pgvector 2>/dev/null \
      || warn "pgvector package not available for PG ${PG_MAJOR}; vector features may be disabled"
  else
    apt-get install -y postgresql-16-pgvector 2>/dev/null || true
  fi
fi

# fail2ban (SSH brute-force protection)
if ! command -v fail2ban-client &>/dev/null; then
  apt-get install -y fail2ban
fi

# tmux
if ! command -v tmux &>/dev/null; then
  apt-get install -y tmux
fi

# Puppeteer/Chrome dependencies (for thumbnail capture). Trailing
# `2>/dev/null || true` was swallowing transient apt failures and
# leaving boxes with a partially-installed Chrome dep set — Chrome then
# crashes at thumbnail time with `libnspr4.so: cannot open shared
# object file` (R20 bug). Install in two passes: first try the full
# list, then re-try any missing single package. libasound2t64 vs
# libasound2 is a noble-vs-jammy split — handle both individually so
# one missing package doesn't abort the rest.
PUPPETEER_DEPS=(
  # `unzip` is required by puppeteer's postinstall to extract chrome-headless-shell
  # (distributed as a .zip; tar can't open it). It is NOT preinstalled on fresh
  # Ubuntu 24.04 / Debian 12, and without it `pnpm install` aborts under
  # `set -euo pipefail`, breaking the whole bare-metal install. Keep it first.
  unzip
  libatk1.0-0 libatk-bridge2.0-0 libcups2 libatspi2.0-0
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2
  libgbm1 libcairo2 libpango-1.0-0
  libxshmfence1 libnspr4 libnss3 libdrm2 libxkbcommon0
  fonts-liberation
)
apt-get install -y "${PUPPETEER_DEPS[@]}" || warn "Bulk puppeteer apt install hit an error — falling back to per-package install (see warnings below)."
for pkg in "${PUPPETEER_DEPS[@]}"; do
  dpkg -s "$pkg" >/dev/null 2>&1 || apt-get install -y "$pkg" || warn "Failed to install $pkg — thumbnails may not work until you re-run: apt-get install -y $pkg"
done
# libasound2 is the noble->jammy compatibility name. Install whichever
# is available; missing both leaves Chrome unable to launch.
apt-get install -y libasound2t64 2>/dev/null || apt-get install -y libasound2 || warn "Could not install libasound2 (or libasound2t64) — thumbnail Chrome will fail to launch."

# Python deps for FastAPI/Django framework deploys. The Wave 17 Python
# venv setup in services/api/src/deploy/adapters/doable-cloud.ts shells
# out to `python3 -m venv` per published Python project; on Ubuntu that
# fails without python3-venv installed. On 24.04 the meta-package
# python3-venv does NOT pull in python3.12-venv automatically — both
# fastapi + django adapters then fail with "ensurepip is not available".
# Install both: the meta-package AND the version-specific one matching
# the active python3 minor version.
apt-get install -y python3-venv python3-pip 2>/dev/null || true
PYVER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "")
if [ -n "$PYVER" ]; then
  apt-get install -y "python${PYVER}-venv" 2>/dev/null || true
fi

# Caddy (static file server for published sites)
if ! command -v caddy &>/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y caddy
fi

# cloudflared
if ! command -v cloudflared &>/dev/null; then
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
    | tee /etc/apt/sources.list.d/cloudflared.list
  apt-get update -qq && apt-get install -y cloudflared
fi

# Bubblewrap — container-like sandbox for AI bash tool + Vite dev servers.
# Without bwrap the sandbox falls back to systemd-only (cgroup limits but
# NO PID namespace, NO filesystem jail, NO network isolation).
if ! command -v bwrap &>/dev/null; then
  apt-get install -y bubblewrap
fi

# Bring all installed packages to current security patches
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

systemctl enable postgresql fail2ban
systemctl start postgresql fail2ban

ok "Packages installed: node $(node -v), pnpm $(pnpm -v), psql $(psql --version | awk '{print $3}'), cloudflared $(cloudflared --version 2>&1 | awk '{print $3}')"

fi  # end CONTAINER_MODE != 1 (Step 1 apt block)

# ─── Wave 26: DynamicUser=yes replaces shared user ──────────
# Wave 25 created a shared `doable-app` system user. Wave 26 dropped
# that in favor of systemd's DynamicUser=yes which auto-allocates a
# fresh UID per project. No useradd needed. /data/projects is world-
# readable so every dynamic UID can read its own dist-server tree.
mkdir -p /data/projects /data/sites
chmod 0755 /data/projects /data/sites

# ─── Sandbox composer state dir (R14: doable-owned marker dir) ──────────
# Composers (nft-egress, cgroup-cap, etc-synth, proc-mask) used to drop
# marker files inside <projectDir>/.sandbox/, but dev-uid-allocator chowns
# <projectDir> to the per-project sandbox uid (10001+) so the API uid
# can't write there. Move the markers to a sibling dir owned by the doable
# user, keyed by projectId. Override location via DOABLE_SANDBOX_STATE_DIR.
mkdir -p /var/lib/doable/sandbox
if id -u doable >/dev/null 2>&1; then
  chown doable:doable /var/lib/doable/sandbox
fi
chmod 0700 /var/lib/doable/sandbox

# ─── Dev sandbox UID pool (chat preview iframes + builds) ───
# Production (doable-app@.service) uses DynamicUser=yes for runtime
# isolation. Dev preview servers AND build/publish jobs run as
# unprivileged UIDs from the range 10001..65000 (~55,000 slots).
#
# We pre-create 1000 named users (doable-dev-1..1000) for `ps` ergonomics
# and `id doable-dev-N` lookups, but the allocator is free to hand out
# higher numeric UIDs without prior useradd — kernel doesn't require a
# passwd entry for setpriv --reuid or chown. Auto-scaling without ops.
#
# Per-project setpriv wrap lives in:
#   - services/api/src/projects/vite-jail.ts  (dev preview spawn)
#   - services/api/src/deploy/builder.ts      (npm install + framework build)
#
# Egress is blocked by the nft rule below — Squid at 127.0.0.1:3128 handles
# npm/PyPI traffic. Idempotent.
#
# Runs in BOTH bare-metal AND container mode — Docker secure (Wave 30-D)
# requires --privileged anyway for systemd PID 1, which is exactly what
# nftables needs to install rules. The `nft` apt package is installed
# below (also added to Dockerfile.secure's apt list).
if true; then
  # ── subuid / subgid mapping for bwrap user-namespace remap ──
  # bwrap --uid-map / --gid-map can only remap to host UIDs/GIDs that the
  # invoking user owns in /etc/subuid + /etc/subgid. Without these entries
  # the vite preview servers (running as inside-NS uid 10001+) hit EACCES
  # on /work writes (baremetal-audit-r13 BLOCKER-5). The `newuidmap`/
  # `newgidmap` helpers from the `uidmap` apt package consult these files,
  # so install that too. Idempotent: each block re-checks for prior state.
  if ! dpkg -s uidmap >/dev/null 2>&1; then
    apt-get install -y uidmap >/dev/null 2>&1 || warn "Failed to install uidmap — bwrap uid-map will fail"
  fi
  if ! grep -q '^doable:' /etc/subuid 2>/dev/null; then
    echo 'doable:10001:55000' >> /etc/subuid
    ok "Appended doable:10001:55000 to /etc/subuid"
  fi
  if ! grep -q '^doable:' /etc/subgid 2>/dev/null; then
    echo 'doable:10001:55000' >> /etc/subgid
    ok "Appended doable:10001:55000 to /etc/subgid"
  fi

  info "Provisioning dev sandbox user pool (doable-dev-1..1000 named, UID range 10001..65000)"
  for i in $(seq 1 1000); do
    uid=$((10000 + i))
    user="doable-dev-$i"
    if ! id "$user" &>/dev/null; then
      # Pin the matching group's GID to the UID (10000+i, well above the
      # system range). Do NOT use `--system --user-group` here: that pins the
      # UID (10001+) but lets useradd auto-allocate the per-user group's GID
      # from the SYSTEM range (100-999, SYS_GID_MIN..MAX). That range holds
      # only ~900 entries, so a 1000-iteration pool both fails partway AND
      # EXHAUSTS the system GID range — after which every `groupadd --system`
      # on the host (docker's postinst `addgroup --system docker`, postgres,
      # any future service) fails with "No GID is available in the range
      # 100-999" and its package install aborts. Pinning gid=uid (>999) keeps
      # the entire system GID range free for real system services.
      groupadd -g "$uid" "$user" 2>/dev/null || true
      useradd --no-create-home --shell /usr/sbin/nologin \
        --uid "$uid" --gid "$uid" "$user" 2>/dev/null || true
    fi
  done

  info "Installing nft egress firewall for dev sandbox pool (skuid 10001-65000)"
  apt-get install -y nftables >/dev/null 2>&1 || true
  mkdir -p /etc/nftables.d

  # Drop-in: block all egress from UID range 10001-65000 except loopback.
  # Squid listens on 127.0.0.1:3128, so npm/PyPI traffic still works via
  # the proxy when packages are installed inside the dev sandbox.
  cat > /etc/nftables.d/doable-dev.nft << 'NFTEOF'
table inet doable_dev {
  chain output {
    type filter hook output priority 0; policy accept;
    oif "lo" accept
    meta skuid 10001-65000 drop
  }
}
NFTEOF

  # Wire the drop-in into /etc/nftables.conf so it loads at boot.
  if ! grep -q 'include "/etc/nftables.d/\*.nft"' /etc/nftables.conf 2>/dev/null; then
    echo 'include "/etc/nftables.d/*.nft"' >> /etc/nftables.conf
  fi

  systemctl enable --now nftables.service 2>/dev/null || true
  if ! nft -f /etc/nftables.conf 2>/dev/null; then
    warn "nftables reload failed — dev sandbox egress firewall not active. Check: nft -c -f /etc/nftables.conf"
  else
    ok "Dev sandbox UID pool (1000 named users, UID range 10001-65000) + nft egress firewall active"
  fi
fi

# ─── Step 2: Firewall (UFW) ──────────────────────────────────
if [ "$CONTAINER_MODE" != "1" ]; then
  info "Step 2/13: Configuring firewall (UFW)..."

  # Install UFW if not present
  if ! command -v ufw &>/dev/null; then
    apt-get install -y ufw
  fi

  # ── Step 2.a: Detect+stop pre-existing public web servers (BUG-R27-005) ──
  # If nginx/apache survived a previous install (e.g. a Docker-mode box
  # being switched to bare-metal), they keep binding :80/:443 on 0.0.0.0
  # — which contradicts the Cloudflare-Tunnel-only design. Stop them so
  # the only public listener after this script is sshd. Operators that
  # want nginx in front of Doable can re-enable it manually.
  for svc in nginx apache2; do
    if systemctl is-enabled "$svc" >/dev/null 2>&1 || systemctl is-active "$svc" >/dev/null 2>&1; then
      warn "Pre-existing ${svc} found and active; stopping and disabling to keep only sshd public."
      systemctl stop "$svc" 2>/dev/null || true
      systemctl disable "$svc" 2>/dev/null || true
    fi
  done

  # ── Step 2.b: Reset UFW to a known-good state (BUG-R27-005) ──
  # Pre-existing rules from a prior install (e.g. Docker's port-forward
  # ALLOWs for :80/:443) survive a partial wipe and leave 80/443 open on
  # a fresh Cloudflare-Tunnel install. Force a reset before re-adding
  # our minimal rule set. This is destructive ON PURPOSE — we own the
  # firewall config from here on.
  if ufw status | grep -q "^Status: active"; then
    warn "UFW already active with prior rules; resetting to a clean slate before re-adding the SSH rule."
    ufw --force reset >/dev/null 2>&1 || true
  fi

  # ── SAFETY: Allow SSH FIRST, before touching anything else ──
  ufw allow 22/tcp comment "SSH - NEVER REMOVE"

  # Set default policies: deny incoming, allow outgoing
  ufw default deny incoming >/dev/null 2>&1
  ufw default allow outgoing >/dev/null 2>&1

  # NOTE: No application ports are opened — all access goes through Cloudflare Tunnel.
  # Services bind to 127.0.0.1 only. Never expose 3000/4000/4001/8080 to the public.
  if [ "$NO_TUNNEL" = "1" ]; then
    # NO_TUNNEL mode: Caddy fronts api/ws/web on :443 directly with a
    # self-signed cert. Open :80 (redirect to :443) and :443. Backend services
    # still bind to 127.0.0.1 only — Caddy is the sole public listener.
    ufw allow 80/tcp comment "HTTP (NO_TUNNEL redirect to HTTPS)" >/dev/null 2>&1 || true
    ufw allow 443/tcp comment "HTTPS (NO_TUNNEL Caddy self-signed)" >/dev/null 2>&1 || true
    info "NO_TUNNEL=1 — opened :80 and :443 for Caddy public fronting"
  fi

  # ── Safety verification before enabling UFW ──
  # Verify SSH rule is actually in the ruleset before enabling.
  # IMPORTANT: when UFW is inactive, `ufw status` does NOT list pending
  # rules — only `ufw show added` does. Check both so the safety probe
  # works for fresh boxes (UFW inactive, rule freshly added a few
  # lines above) as well as re-runs (UFW already active).
  if ! ufw status | grep -qE "22/tcp.*ALLOW" \
    && ! ufw show added | grep -qE "22/tcp"; then
    err "SAFETY ABORT: SSH rule not found in UFW rules. Refusing to enable firewall."
  fi

  # Verify we can still reach SSH from the current connection
  # (If this script is running via SSH, the connection itself proves port 22 works)
  if [[ -n "${SSH_CONNECTION:-}" ]]; then
    info "Running via SSH — verifying SSH connectivity is maintained..."
    SSH_CLIENT_IP=$(echo "$SSH_CONNECTION" | awk '{print $1}')
    info "Connected from: ${SSH_CLIENT_IP}"
  fi

  # Enable UFW (--force skips the interactive prompt)
  ufw --force enable

  # ── Post-enable verification ──
  if ! ufw status | grep -qE "22/tcp.*ALLOW"; then
    # Emergency: disable UFW if SSH rule somehow vanished
    warn "EMERGENCY: SSH rule missing after UFW enable — disabling firewall!"
    ufw --force disable
    err "Firewall disabled for safety. SSH rule was lost. Please investigate."
  fi

  ok "Firewall configured and enabled"
  ufw status numbered | while IFS= read -r line; do echo "  $line"; done
else
  echo "[SKIP-CONTAINER] Step 2/13: UFW firewall (Docker host firewall handles ingress)"
fi

# ─── Step 3: Harden PostgreSQL & configure fail2ban ─────────────
info "Step 3/13: Hardening services..."

# ── PostgreSQL: ensure it only listens on localhost ──
PG_CONF=$(find /etc/postgresql -name postgresql.conf 2>/dev/null | head -1)
if [[ -n "$PG_CONF" ]]; then
  # Ensure listen_addresses is localhost only
  if grep -q "^listen_addresses" "$PG_CONF"; then
    sed -i "s/^listen_addresses.*/listen_addresses = 'localhost'/" "$PG_CONF"
  elif grep -q "^#listen_addresses" "$PG_CONF"; then
    sed -i "s/^#listen_addresses.*/listen_addresses = 'localhost'/" "$PG_CONF"
  fi
  systemctl restart postgresql
  ok "PostgreSQL confirmed: listening on localhost only"
else
  warn "PostgreSQL config not found — check manually"
fi

# ── fail2ban: configure SSH jail ──
# Debian 12 with systemd-journald no longer writes /var/log/auth.log by
# default — the file-based backend silently aborts the jail with
# "Have not found any log file for sshd jail". Use the systemd backend
# so fail2ban tails the journal directly.
if [ "$CONTAINER_MODE" != "1" ]; then
  cat > /etc/fail2ban/jail.local << F2BEOF
[sshd]
enabled = true
port = ssh
filter = sshd
backend = systemd
maxretry = 5
bantime = 3600
findtime = 600
F2BEOF

  systemctl restart fail2ban
  ok "fail2ban configured: SSH brute-force protection active"
else
  echo "[SKIP-CONTAINER] fail2ban: container has no sshd; Docker port binding to 127.0.0.1 prevents SSH ingress."
fi

# ─── Step 4: Swap ──────────────────────────────────────────────
if [ "$CONTAINER_MODE" != "1" ]; then
  info "Step 4/13: Configuring swap..."

  if ! swapon --show | grep -q '/swapfile'; then
    TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
    SWAP_SIZE=$(( TOTAL_RAM < 4096 ? 2 : 1 ))
    fallocate -l ${SWAP_SIZE}G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "Added ${SWAP_SIZE}GB swap"
  else
    ok "Swap already configured"
  fi
else
  echo "[SKIP-CONTAINER] Step 4/13: swap (host kernel handles memory; container can't fallocate /swapfile)"
fi

# ─── Step 5: PostgreSQL setup ──────────────────────────────────
info "Step 5/13: Setting up PostgreSQL..."

if sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='doable'" | grep -q 1; then
  # User exists from a prior install. The .env we just wrote has a fresh
  # DB_PASS (Step 8 always generates one unless pre-staged), so the live
  # postgres password is stale — every subsequent migration + service
  # boot fails with "password authentication failed for user doable".
  # Align the postgres-side password with the .env every run; this is a
  # no-op on the first install (same password just written).
  sudo -u postgres psql -c "ALTER USER doable WITH PASSWORD '${DB_PASS}';" >/dev/null
  ok "Aligned postgres 'doable' password with current .env"
else
  sudo -u postgres psql -c "CREATE USER doable WITH PASSWORD '${DB_PASS}' CREATEDB;"
  ok "Created postgres user 'doable'"
fi

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='doable'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE doable OWNER doable;"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE doable TO doable;" &>/dev/null

ok "Database ready (user: doable, db: doable)"

# ─── Step 6: GitHub CLI auth ──────────────────────────────────
# Only needed if we'll actually clone the repo in Step 7. When the repo
# was pre-staged (e.g. operators tar-extracted it during bulk
# provisioning), skip the gh install + auth entirely so non-interactive
# deploys don't fail on `gh auth status`.
PRESTAGED_REPO_DIR="${INSTALL_DIR:-/root/doable}"
if [ "$CONTAINER_MODE" != "1" ] && [ ! -f "${PRESTAGED_REPO_DIR}/package.json" ]; then
  info "Step 6/13: GitHub authentication..."

  if ! command -v gh &>/dev/null; then
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /usr/share/keyrings/githubcli-archive-keyring.gpg >/dev/null
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      | tee /etc/apt/sources.list.d/github-cli.list
    apt-get update -qq && apt-get install -y gh
  fi

  if ! gh auth status &>/dev/null; then
    warn "You need to authenticate with GitHub to clone the repo."
    echo "  Run: gh auth login"
    echo "  Then re-run this script."
    echo ""
    if [ "${NON_INTERACTIVE:-0}" = "1" ] || ! [ -t 0 ]; then
      err "GitHub auth required and non-interactive mode active. Pre-stage the repo at ${PRESTAGED_REPO_DIR} (e.g. tar-extract) or run 'gh auth login' as root before re-running setup-server.sh."
    fi
    read -rp "Authenticate now? [Y/n]: " GH_AUTH
    if [[ "${GH_AUTH,,}" != "n" ]]; then
      gh auth login
    else
      err "GitHub auth required to continue"
    fi
  fi

  ok "GitHub CLI authenticated"
elif [ "$CONTAINER_MODE" = "1" ]; then
  echo "[SKIP-CONTAINER] Step 6/13: GitHub CLI auth (container ships repo via Docker COPY)"
else
  info "Step 6/13: Repo already pre-staged at ${PRESTAGED_REPO_DIR} — skipping GitHub auth"
fi

# ─── Step 7: Clone repo ───────────────────────────────────────
INSTALL_DIR="${INSTALL_DIR:-$HOME/doable}"

if [ "$CONTAINER_MODE" != "1" ] && [ ! -f "$INSTALL_DIR/package.json" ]; then
  info "Step 7/13: Cloning repository..."

  if [[ -d "$INSTALL_DIR" ]]; then
    warn "Directory $INSTALL_DIR already exists."
    if [ "${NON_INTERACTIVE:-0}" = "1" ] || ! [ -t 0 ]; then
      # Non-interactive: preserve the existing tree (default = N).
      info "Non-interactive mode — preserving existing ${INSTALL_DIR}"
      RECLONE="n"
    else
      read -rp "Remove and re-clone? [y/N]: " RECLONE
    fi
    if [[ "${RECLONE,,}" == "y" ]]; then
      rm -rf "$INSTALL_DIR"
      gh repo clone "$REPO" "$INSTALL_DIR"
    fi
  else
    gh repo clone "$REPO" "$INSTALL_DIR"
  fi

  ok "Repo cloned to $INSTALL_DIR"
else
  if [ "$CONTAINER_MODE" = "1" ]; then
    echo "[SKIP-CONTAINER] Step 7/13: clone repo (Docker COPY already populated $INSTALL_DIR)"
  else
    info "Step 7/13: Repo already present at $INSTALL_DIR (package.json found) — skipping clone"
  fi
fi

# ─── Step 8: Environment files ────────────────────────────────
info "Step 8/13: Writing environment files..."

# Idempotency: preserve existing .env across container restarts on persistent
# volumes — re-generating would rotate JWT_SECRET/ENCRYPTION_KEY and invalidate
# every active session + every encrypted credential row. Same logic protects
# host re-runs.
if [ -f "${INSTALL_DIR}/.env" ]; then
  ok "Reusing existing .env at ${INSTALL_DIR}/.env (secrets preserved)"

  # Refuse to continue when a secret-class key has duplicate lines. Node
  # --env-file is last-wins, but operators routinely rotate by editing the
  # FIRST hit — producing a silent mismatch between the intended secret
  # and the one the running process actually uses.
  for _dupkey in JWT_SECRET DOABLE_KEK ENCRYPTION_KEY INTERNAL_SECRET INSTALL_BOOTSTRAP_TOKEN COOKIE_SECRET; do
    _dupcount=$(grep -cE "^${_dupkey}=" "${INSTALL_DIR}/.env" || true)
    if [ "${_dupcount:-0}" -gt 1 ]; then
      err "Found ${_dupcount} duplicate ${_dupkey}= lines in ${INSTALL_DIR}/.env. Keep ONE (Node --env-file is last-wins) and re-run setup-server.sh."
    fi
  done

  # Back-fill DOABLE_KEK on pre-R9 installs. The envelope-crypto master KEK
  # was introduced after the bulk of secret-gen here, so older .env files
  # exist that pre-date the line above. Without it the API throws 500 on
  # any MFA enroll, KEK-encrypted column decrypt, or workspace DEK fetch.
  # Rules:
  #   - DOABLE_KEK= present and non-empty → leave alone (rotating bricks data)
  #   - DOABLE_KEK= present but empty    → fill in + warn the operator
  #   - line missing entirely            → append generated key
  # Back-fill INSTALL_BOOTSTRAP_TOKEN on pre-onboarding-v1 installs.
  if grep -qE '^INSTALL_BOOTSTRAP_TOKEN=.+' "${INSTALL_DIR}/.env"; then
    INSTALL_BOOTSTRAP_TOKEN=$(grep -oP '(?<=^INSTALL_BOOTSTRAP_TOKEN=).+' "${INSTALL_DIR}/.env" | head -1)
    ok "INSTALL_BOOTSTRAP_TOKEN already set in existing .env (preserving)"
  else
    INSTALL_BOOTSTRAP_TOKEN=$(openssl rand -hex 32)
    INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT=$(date -u -d '+24 hours' +%Y-%m-%dT%H:%M:%SZ)
    {
      printf '\n# ─── First-run bootstrap (back-filled by setup-server.sh re-run) ──\n'
      printf 'INSTALL_BOOTSTRAP_TOKEN=%s\n' "${INSTALL_BOOTSTRAP_TOKEN}"
      printf 'INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT=%s\n' "${INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT}"
    } >> "${INSTALL_DIR}/.env"
    warn "INSTALL_BOOTSTRAP_TOKEN was missing from ${INSTALL_DIR}/.env — appended a freshly generated token. Restart the API service to pick it up."
  fi

  if grep -qE '^DOABLE_KEK=[^[:space:]].*$' "${INSTALL_DIR}/.env"; then
    ok "DOABLE_KEK already set in existing .env (preserving)"
  elif grep -qE '^DOABLE_KEK=[[:space:]]*$' "${INSTALL_DIR}/.env"; then
    NEW_KEK=$(openssl rand -base64 32)
    sed -i "s|^DOABLE_KEK=[[:space:]]*$|DOABLE_KEK=${NEW_KEK}|" "${INSTALL_DIR}/.env"
    warn "DOABLE_KEK was present but empty in ${INSTALL_DIR}/.env — filled with a freshly generated 32-byte base64 key. If any encrypted rows exist they may be unreadable."
  else
    NEW_KEK=$(openssl rand -base64 32)
    {
      printf '\n# Master Key-Encryption-Key for envelope crypto (per-workspace DEKs + MFA).\n'
      printf '# Back-filled by setup-server.sh idempotent re-run — DO NOT rotate after first encrypted write.\n'
      printf 'DOABLE_KEK=%s\n' "${NEW_KEK}"
    } >> "${INSTALL_DIR}/.env"
    warn "DOABLE_KEK was missing from ${INSTALL_DIR}/.env — appended a freshly generated 32-byte base64 key. Restart the API service to pick it up."
  fi

  # R14 BUG-R14-WS-ORIGIN-BLOCK: pre-onboarding-v1 .env files (or any .env
  # carried over from .env.example before this knob was added) are missing
  # WS_ALLOWED_ORIGINS. The WS server (services/ws/src/index.ts:259-275)
  # falls back to a localhost-only allowlist in non-prod, which 403s every
  # browser WS upgrade from the public hostname. Collab/cursors/chat-stream
  # all silently break. Same defensive back-fill for CORS_ORIGINS.
  PUBLIC_APP_ORIGIN=$(grep -oP '(?<=^NEXT_PUBLIC_APP_URL=).+' "${INSTALL_DIR}/.env" 2>/dev/null | head -1)
  PUBLIC_APP_ORIGIN="${PUBLIC_APP_ORIGIN:-https://${DOMAIN:-localhost}}"

  if grep -qE '^WS_ALLOWED_ORIGINS=[^[:space:]].*$' "${INSTALL_DIR}/.env"; then
    ok "WS_ALLOWED_ORIGINS already set in existing .env (preserving)"
  elif grep -qE '^WS_ALLOWED_ORIGINS=[[:space:]]*$' "${INSTALL_DIR}/.env"; then
    sed -i "s|^WS_ALLOWED_ORIGINS=[[:space:]]*$|WS_ALLOWED_ORIGINS=${PUBLIC_APP_ORIGIN}|" "${INSTALL_DIR}/.env"
    warn "WS_ALLOWED_ORIGINS was present but empty in ${INSTALL_DIR}/.env — filled with ${PUBLIC_APP_ORIGIN}. Restart the WS service to pick it up."
  else
    {
      printf '\n# Back-filled by setup-server.sh — required for browser WS upgrades to pass\n'
      printf '# the CSWSH (BUG-017) origin allowlist. Without this the WS server defaults\n'
      printf '# to localhost-only in non-prod and 403s every page-initiated y-websocket.\n'
      printf 'WS_ALLOWED_ORIGINS=%s\n' "${PUBLIC_APP_ORIGIN}"
    } >> "${INSTALL_DIR}/.env"
    warn "WS_ALLOWED_ORIGINS was missing from ${INSTALL_DIR}/.env — appended (${PUBLIC_APP_ORIGIN}). Restart the WS service to pick it up."
  fi

  if grep -qE '^CORS_ORIGINS=[^[:space:]].*$' "${INSTALL_DIR}/.env"; then
    ok "CORS_ORIGINS already set in existing .env (preserving)"
  elif grep -qE '^CORS_ORIGINS=[[:space:]]*$' "${INSTALL_DIR}/.env"; then
    sed -i "s|^CORS_ORIGINS=[[:space:]]*$|CORS_ORIGINS=${PUBLIC_APP_ORIGIN}|" "${INSTALL_DIR}/.env"
    warn "CORS_ORIGINS was present but empty in ${INSTALL_DIR}/.env — filled with ${PUBLIC_APP_ORIGIN}. Restart the API service to pick it up."
  else
    {
      printf '\n# Back-filled by setup-server.sh — required for browser fetch() against the API.\n'
      printf 'CORS_ORIGINS=%s\n' "${PUBLIC_APP_ORIGIN}"
    } >> "${INSTALL_DIR}/.env"
    warn "CORS_ORIGINS was missing from ${INSTALL_DIR}/.env — appended (${PUBLIC_APP_ORIGIN}). Restart the API service to pick it up."
  fi
else

# Bind addresses: bare-metal binds to 127.0.0.1 and Cloudflare Tunnel proxies
# in. Inside a container, services must bind to 0.0.0.0 so Docker's port
# forwarding can reach them — but `docker -p 127.0.0.1:HOST:CONTAINER`
# already restricts host-side exposure to loopback, so net surface is the same.
if [ "$CONTAINER_MODE" = "1" ]; then
  BIND_HOST=0.0.0.0
else
  BIND_HOST=127.0.0.1
fi

# Public-facing hostname for the GitHub repo-scope OAuth callback. Normally
# the operator's `api.${DOMAIN}` (prod), but for NO_TUNNEL=1 there's no
# wildcard DNS so we collapse the single-host install onto ${HOST}.
if [ "$NO_TUNNEL" = "1" ]; then
  GITHUB_REPO_CALLBACK_HOST="${HOST}"
  warn "NO_TUNNEL=1 — OAuth providers (Google/GitHub) reject raw IPs as redirect URIs. The GOOGLE_REDIRECT_URI/GITHUB_REDIRECT_URI values written below point at https://${HOST}; you'll need to overwrite them with a real registered HTTPS hostname before OAuth login will work."
else
  # Reuse the dashed API_DOMAIN computed above so multi-level DOMAINs
  # (dev.doable.me) emit dev-api.doable.me, NOT api.dev.doable.me which
  # would break under free Universal SSL.
  GITHUB_REPO_CALLBACK_HOST="${API_DOMAIN}"
fi

# NO_TUNNEL=1: api/ws are path-multiplexed on the same host behind Caddy.
# Caddy routes handle_path /api/* → :4000 (strips prefix) and /ws* → :4001.
# Tunnel/CF mode uses separate subdomains, so no path suffix is needed there.
if [ "$NO_TUNNEL" = "1" ]; then
  _API_URL="https://${HOST}/api"
  _WS_URL="wss://${HOST}/ws"
else
  _API_URL="https://${API_DOMAIN}"
  _WS_URL="wss://${WS_DOMAIN}"
fi

cat > "${INSTALL_DIR}/.env" << ENVEOF
# ─── Database ───────────────────────────────────────────────
DATABASE_URL=postgres://doable:${DB_PASS}@localhost:5432/doable
DATABASE_POOL_SIZE=20

# ─── Auth / JWT ─────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_ISSUER=doable
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

# ─── Encryption / Internal Auth ──────────────────────────────
ENCRYPTION_KEY=${ENCRYPTION_KEY}
INTERNAL_SECRET=${INTERNAL_SECRET}
# Master Key-Encryption-Key for envelope crypto (per-workspace DEKs + MFA).
# Rotating this orphans every workspace_keys row — treat as permanent.
DOABLE_KEK=${DOABLE_KEK}

# ─── API Server ─────────────────────────────────────────────
API_PORT=4000
API_HOST=${BIND_HOST}
CORS_ORIGINS=https://${DOMAIN}

# ─── WebSocket Server ──────────────────────────────────────
WS_PORT=4001
WS_HOST=${BIND_HOST}
WS_INTERNAL_URL=http://127.0.0.1:${WS_PORT:-4001}
API_URL=http://127.0.0.1:${API_PORT:-4000}
# CSWSH guard — the ws server rejects upgrades from origins not on this list.
# Without it, the browser-side Yjs collab fails with handshake 403 on every
# editor load. Source: services/ws/src/index.ts isOriginAllowed().
WS_ALLOWED_ORIGINS=https://${DOMAIN}

# ─── Next.js Web bind (used by start.sh) ────────────────────
WEB_HOSTNAME=${BIND_HOST}

# ─── Next.js Frontend ──────────────────────────────────────
NEXT_PUBLIC_API_URL=${_API_URL}
NEXT_PUBLIC_WS_URL=${_WS_URL}
NEXT_PUBLIC_APP_URL=https://${DOMAIN}

# ─── OAuth ──────────────────────────────────────────────────
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
GOOGLE_REDIRECT_URI=https://${API_DOMAIN}/auth/google/callback
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
GITHUB_REDIRECT_URI=https://${API_DOMAIN}/oauth/github/login/callback
GITHUB_COPILOT_REDIRECT_URI=https://${API_DOMAIN}/oauth/github/copilot/callback
GITHUB_REPO_REDIRECT_URI=https://${GITHUB_REPO_CALLBACK_HOST}/oauth/github/repo/callback

# Integration OAuth callbacks — must be HTTPS (Supabase, Google reject http://
# non-localhost). Reusing the public API hostname avoids edge-layer mismatches.
INTEGRATIONS_OAUTH_REDIRECT_URI=https://${API_DOMAIN}/integrations/oauth/callback
INTEGRATIONS_ENHANCED_AUTH_REDIRECT_URI=https://${API_DOMAIN}/integrations/enhanced-auth/callback

# Supabase management OAuth (BYO Supabase) — register at supabase.com/dashboard/account/apps
OAUTH_SUPABASE_MGMT_CLIENT_ID=${OAUTH_SUPABASE_MGMT_CLIENT_ID:-}
OAUTH_SUPABASE_MGMT_CLIENT_SECRET=${OAUTH_SUPABASE_MGMT_CLIENT_SECRET:-}

# ─── AI / Copilot SDK ─────────────────────────────────────
COPILOT_DEFAULT_MODEL=
COPILOT_CLI_PATH=
COPILOT_CLI_URL=
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
OPENAI_API_KEY=${OPENAI_API_KEY}
MINIMAX_API_KEY=${MINIMAX_API_KEY}

# ─── Storage (S3-compatible) ───────────────────────────────
S3_BUCKET=doable-uploads
S3_REGION=us-east-1
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_ENDPOINT=

# ─── Stripe ───────────────────────────────────────────────
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
STRIPE_PRO_MONTHLY_PRICE_ID=
STRIPE_PRO_YEARLY_PRICE_ID=
STRIPE_BUSINESS_MONTHLY_PRICE_ID=
STRIPE_BUSINESS_YEARLY_PRICE_ID=

# ─── Publish / Hosting ────────────────────────────────────
PROJECTS_ROOT=${INSTALL_DIR}/services/api/projects
DOABLE_PROJECTS_DIR=${INSTALL_DIR}/services/api/projects
SITES_DIR=${INSTALL_DIR}/sites
DOABLE_DOMAIN=${PUBLISH_WILDCARD_DOMAIN}
PUBLISH_SUBDOMAIN_PREFIX=${PUBLISH_PREFIX}
PUBLISH_LAYOUT=${PUBLISH_LAYOUT}
WILDCARD_HOSTNAME=${WILDCARD_HOSTNAME}

# ─── Cloudflare DNS (appended by Step 10 after tunnel creation) ────
# CLOUDFLARED_TUNNEL_ID, CF_API_TOKEN_ENC (KEK-encrypted), CF_ZONE_ID are written below.

# ─── Environment ───────────────────────────────────────────
NODE_ENV=development

# ─── Feature flags ──────────────────────────────────────────
# Per-app database (PRD per-app-db): isolated per-app PGlite DB exposed via
# /__doable/data/* + the doable.data builtin MCP server. ON by default on new
# installs; set to 0 to disable.
DOABLE_APP_DB_ENABLED=1
# Per-app AI runtime (/__doable/ai/*, @doable/ai SDK, project Doable AI tab).
# ON by default on new installs; set to 0 to disable.
DOABLE_APP_AI_ENABLED=1

# ─── Email ───
# Provider: smtp, resend, or google (auto-detects if not set)
EMAIL_PROVIDER=
EMAIL_FROM=Doable <noreply@${DOMAIN}>

# SMTP provider — Well-known service (easiest: gmail, sendgrid, mailgun, outlook365, yahoo, etc.)
EMAIL_SERVICE=
# Or manual SMTP (used when EMAIL_SERVICE is empty)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# Resend provider (https://resend.com)
RESEND_API_KEY=

# Google Mail API provider (OAuth2)
# GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set above in the OAuth section.
# Set these additional vars only if using Google Mail API for sending email:
GOOGLE_REFRESH_TOKEN=
GOOGLE_EMAIL_USER=

# ─── Per-published-app hardening (Wave 27-30) ───────────────
# Controls jailing across build (next build), dev-server (vite dev),
# and production systemd unit. Values: full | relaxed | off.
DOABLE_HARDENING=full

# ─── Sandbox orchestrator hardening level ────────────────────
# Controls the jailedSpawn orchestrator's fail-closed behavior.
# "prod" blocks non-isolating backends (direct, noop).
# Must match the environment — set to "prod" on production servers.
DOABLE_HARDENING_LEVEL=prod

# ─── Sandbox Vite feature flag ──────────────────────────────
# Route Vite dev server spawns through the full sandbox orchestrator
# (profile + backend + composers) instead of the legacy vault.spawn path.
DOABLE_SANDBOX_VITE=1

# ─── Puppeteer Chrome cache (for project thumbnails) ────────
# The thumbnails/capture.ts service uses puppeteer.launch() with no
# explicit executablePath, so it falls back to puppeteer's per-user
# cache lookup at $HOME/.cache/puppeteer. Our service runs as the
# 'doable' user (HOME=/home/doable), so without this override puppeteer
# looks in /home/doable/.cache/puppeteer and reports "Could not find
# Chrome (ver ...)". Pin a shared, world-readable cache dir so a single
# 'npx puppeteer browsers install chrome' run during setup-server.sh
# is found by the runtime user.
PUPPETEER_CACHE_DIR=/var/cache/doable/puppeteer

# ─── Build-time outbound proxy (Wave 29) ────────────────────
# Routes every build (npm install, pip install, etc.) through Squid
# with the allow-list at /etc/squid/conf.d/doable-allowlist.conf.
# Comment out to disable build-time proxying.
BUILD_HTTP_PROXY=http://127.0.0.1:3128

# ─── Chat rate limiting (per-user, in-memory or Redis) ──────
# Defaults are operator-friendly; raise for power users / load tests, set to
# 0 to fully disable that bucket. is_platform_admin users skip all limits
# unless CHAT_RATE_LIMIT_BYPASS_ADMIN=0.
CHAT_RATE_LIMIT_PER_MIN=30
CHAT_RATE_LIMIT_ANON_PER_MIN=5
SUGGEST_RATE_LIMIT_PER_MIN=10
CHAT_RATE_LIMIT_BYPASS_ADMIN=1

# ─── Chat thinking-loop watchdog (BUG-PWA-001) ──────────────
# If the AI emits no real progress (no text, no tool calls) for this many ms
# the SSE stream is aborted with phase:error error:thinking_loop retry:true
# so the client can recover instead of hanging on a "thinking" spinner.
# Set CHAT_THINKING_LOOP_ABORT_MS=0 to disable the watchdog entirely.
CHAT_THINKING_LOOP_ABORT_MS=180000
CHAT_THINKING_LOOP_GRACE_MS=15000
ENVEOF

  # ─── First-run bootstrap token ────────────────────────────
  # Generated once at install time; printed in the operator banner below.
  # Written to .env (mode 600). Never committed to the repo.
  INSTALL_BOOTSTRAP_TOKEN=$(openssl rand -hex 32)
  INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT=$(date -u -d '+24 hours' +%Y-%m-%dT%H:%M:%SZ)
  {
    printf '\n# ─── First-run bootstrap (auto-generated by setup-server.sh) ──\n'
    printf '# Single-use token for first-user admin promotion. Valid 24h.\n'
    printf 'INSTALL_BOOTSTRAP_TOKEN=%s\n' "${INSTALL_BOOTSTRAP_TOKEN}"
    printf 'INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT=%s\n' "${INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT}"
  } >> "${INSTALL_DIR}/.env"

  chmod 0600 "${INSTALL_DIR}/.env"
  chown doable:doable "${INSTALL_DIR}/.env" 2>/dev/null || true
  ok "Environment files created (.env)"
fi  # end .env idempotency guard
# Always enforce .env permissions (idempotent re-run safety)
chmod 0600 "${INSTALL_DIR}/.env" 2>/dev/null || true
chown doable:doable "${INSTALL_DIR}/.env" 2>/dev/null || true

# Always (re)write apps/web/.env.local — must NOT be gated on the .env
# idempotency check above, because a pre-staged .env that triggered the
# reuse branch would leave apps/web/.env.local missing, and `next build`
# then prerenders with empty NEXT_PUBLIC_* envs (crashes /_global-error
# with "Cannot read properties of null (reading 'useContext')").
# Derive DOMAIN/API_DOMAIN/WS_DOMAIN from the live .env to stay in sync.
if [ -z "${DOMAIN:-}" ] || [ -z "${API_DOMAIN:-}" ] || [ -z "${WS_DOMAIN:-}" ]; then
  set -a
  # shellcheck disable=SC1091
  . "${INSTALL_DIR}/.env" 2>/dev/null || true
  set +a
  # Recompute API/WS domains from NEXT_PUBLIC_* if still unset.
  # The .env block already wrote dashed hostnames for multi-level DOMAINs,
  # so NEXT_PUBLIC_API_URL=https://dev-api.doable.me — we just trim the
  # scheme; no further dashing needed here.
  : "${DOMAIN:=${NEXT_PUBLIC_APP_URL#https://}}"
  DOMAIN="${DOMAIN%/}"
  api_host="${NEXT_PUBLIC_API_URL#https://}"
  api_host="${api_host%/}"
  : "${API_DOMAIN:=${api_host}}"
  ws_host="${NEXT_PUBLIC_WS_URL#wss://}"
  ws_host="${ws_host%/}"
  : "${WS_DOMAIN:=${ws_host}}"
fi
# Stub apps/web/.env.local with dashed NEXT_PUBLIC_* URLs (already-dashed
# API_DOMAIN/WS_DOMAIN come from the rewrite block at line ~221 or from a
# pre-staged .env). Must NOT be gated on the .env idempotency check above —
# next build prerenders with empty NEXT_PUBLIC_* envs otherwise.
#
# R14 FIX: _API_URL/_WS_URL are set ONLY in the regen-.env branch
# (lines 785-790). In the preserve-existing-.env branch we land here with
# them unbound — `set -u` makes the heredoc fatal. Derive defaults from
# the already-loaded NEXT_PUBLIC_* or from the dashed *_DOMAIN locals.
: "${_API_URL:=${NEXT_PUBLIC_API_URL:-https://${API_DOMAIN}}}"
: "${_WS_URL:=${NEXT_PUBLIC_WS_URL:-wss://${WS_DOMAIN}}}"
cat > "${INSTALL_DIR}/apps/web/.env.local" << WEBENVEOF
NEXT_PUBLIC_API_URL=${_API_URL}
NEXT_PUBLIC_WS_URL=${_WS_URL}
NEXT_PUBLIC_APP_URL=https://${DOMAIN}
WEBENVEOF
chown doable:doable "${INSTALL_DIR}/apps/web/.env.local" 2>/dev/null || true

# ─── Step 9: Install deps & migrate ──────────────────────────
info "Step 9/13: Installing dependencies..."

cd "$INSTALL_DIR"
# Clear any stale/incomplete puppeteer browser cache from a prior failed run.
# A half-extracted chrome-headless-shell dir (folder present, executable
# missing) makes puppeteer's postinstall believe the browser is installed and
# refuse to re-download — which then aborts `pnpm install` under pipefail.
# Safe to wipe: the real runtime cache (PUPPETEER_CACHE_DIR) is populated later.
rm -rf "${HOME}/.cache/puppeteer" 2>/dev/null || true
pnpm install

info "Running database migrations..."

# Create PostgreSQL extensions as superuser (required before migrations)
info "Creating PostgreSQL extensions..."
sudo -u postgres psql -d doable -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" 2>/dev/null || true
sudo -u postgres psql -d doable -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true
sudo -u postgres psql -d doable -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" 2>/dev/null || true
ok "PostgreSQL extensions created (pgcrypto, vector, pg_trgm)"

# Run migrations from BOTH migration directories
for dir in services/api/src/db/migrations packages/db/migrations; do
  if [[ -d "$dir" ]]; then
    for f in $(ls "$dir"/*.sql 2>/dev/null | sort); do
      info "  Applying: $f"
      if ! PGPASSWORD="${DB_PASS}" psql -h localhost -U doable -d doable -f "$f" 2>&1; then
        warn "Migration may have had errors: $(basename "$f") — check output above"
      fi
    done
  fi
done

ok "Dependencies installed & database migrated"

# Build Next.js production bundle.
# Force a clean .next + .turbo before each build — Next 16's Turbopack
# caches compiled SSR chunks under .next/server/chunks/. A failed first
# build (e.g. from a stale global-error.tsx) leaves broken chunks the
# next build will happily re-use, producing the misleading
# "Cannot read properties of null (reading 'useContext')" prerender
# error on a re-run even after the source was fixed.
#
# Pin NODE_ENV=production for the build subprocess only. The script's
# own environment may have NODE_ENV=development from a sourced .env
# (the runtime is intentionally development so dev-server tooling
# applies), and Next.js prerender behaves erratically when invoked with
# a non-standard NODE_ENV — emits "non-standard NODE_ENV" warnings and
# can crash /_global-error static generation. The runtime keeps using
# the .env value once start.sh boots services.
# Build workspace packages first — services/api imports `docore` (and other
# packages import `dovault`) via `package.json#main` → `dist/index.js`.
# Without these built artifacts, `tsx watch` in services/api dies at startup
# with `ERR_MODULE_NOT_FOUND: …/services/api/node_modules/docore/dist/index.js`
# (workspace symlink resolves to packages/docore/dist/ which doesn't exist
# until build runs). Mirrors the Dockerfile's explicit docore + dovault build
# steps. `|| true` tolerates a missing build script the same way the docker
# path does — `tsc` failures are surfaced via the API's start-up error if
# the dist/ stays empty.
info "Building workspace packages (docore, dovault)..."
cd "$INSTALL_DIR"
pnpm --filter=docore run build || warn "docore build emitted errors — API may fail to start"
pnpm --filter=dovault run build || warn "dovault build emitted errors — sandbox features may degrade"
ok "Workspace packages built"

info "Building Next.js..."
cd "$INSTALL_DIR/apps/web"
rm -rf .next .turbo
env -u NODE_ENV NODE_ENV=production pnpm build
cd "$INSTALL_DIR"
ok "Next.js built"

# ─── Step 10: Cloudflare Tunnel ───────────────────────────────
if [ "$NO_TUNNEL" = "1" ]; then
  echo "[SKIP-NO-TUNNEL] Step 10/13: Cloudflare Tunnel (NO_TUNNEL=1 — using direct nginx-style fronting with self-signed cert)"
  TUNNEL_NAME="no-tunnel"
  TUNNEL_ID="n/a"
elif [ "$CONTAINER_MODE" != "1" ]; then
  info "Step 10/13: Setting up Cloudflare Tunnel..."

  if [[ ! -f /root/.cloudflared/cert.pem ]]; then
    warn "You need to authenticate with Cloudflare."
    echo "  A browser URL will be shown — open it and authorize."
    echo ""
    cloudflared tunnel login
  fi

  ok "Cloudflare authenticated"

  # Extract Cloudflare API token and Zone ID from cert.pem (written by `tunnel login`)
  CF_CERT_JSON=$(grep -v '^-' /root/.cloudflared/cert.pem | base64 -d 2>/dev/null || true)
  CF_API_TOKEN=$(echo "$CF_CERT_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('apiToken',''))" 2>/dev/null || true)
  CF_ZONE_ID=$(echo "$CF_CERT_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('zoneID',''))" 2>/dev/null || true)
  if [[ -n "$CF_API_TOKEN" && -n "$CF_ZONE_ID" ]]; then
    ok "Extracted Cloudflare API token and Zone ID from cert.pem"
  else
    warn "Could not extract CF credentials from cert.pem — per-deploy DNS records will not be created automatically."
    warn "Set CF_API_TOKEN and CF_ZONE_ID in .env manually if needed."
  fi

  # Reuse a pre-staged tunnel when .env declares CLOUDFLARED_TUNNEL_ID AND the
  # matching credentials JSON is already on disk (rescue/restore scenarios where
  # the tunnel exists in the CF account under a name that doesn't match the
  # DOMAIN-derived default — e.g. tunnel `doable-dev` for DOMAIN=dev.doable.me).
  TUNNEL_NAME=""
  TUNNEL_ID=""
  if [[ -n "${CLOUDFLARED_TUNNEL_ID:-}" ]] && [[ -f "/root/.cloudflared/${CLOUDFLARED_TUNNEL_ID}.json" ]]; then
    TUNNEL_ID="${CLOUDFLARED_TUNNEL_ID}"
    TUNNEL_NAME=$(cloudflared tunnel list -o json 2>/dev/null | python3 -c "
import sys, json
for t in json.load(sys.stdin):
    if t.get('id') == '${TUNNEL_ID}':
        print(t['name']); break
" 2>/dev/null || true)
    TUNNEL_NAME="${TUNNEL_NAME:-doable-$(echo "$DOMAIN" | tr '.' '-')}"
    ok "Reusing pre-staged tunnel: $TUNNEL_NAME ($TUNNEL_ID)"
  fi

  if [[ -z "$TUNNEL_ID" ]]; then
    TUNNEL_NAME="doable-$(echo "$DOMAIN" | tr '.' '-')"
    EXISTING_TUNNEL=$(cloudflared tunnel list -o json 2>/dev/null | python3 -c "
import sys, json
tunnels = json.load(sys.stdin)
for t in tunnels:
    if t['name'] == '${TUNNEL_NAME}':
        print(t['id'])
        break
" 2>/dev/null || true)

    if [[ -n "$EXISTING_TUNNEL" ]]; then
      TUNNEL_ID="$EXISTING_TUNNEL"
      ok "Using existing tunnel: $TUNNEL_NAME ($TUNNEL_ID)"
    else
      cloudflared tunnel create --output json "$TUNNEL_NAME" > /tmp/tunnel_create.json 2>&1 || \
        cloudflared tunnel create "$TUNNEL_NAME" > /tmp/tunnel_create.json 2>&1
      TUNNEL_ID=$(python3 -c "
import sys, json, re
raw = open('/tmp/tunnel_create.json').read()
# Try JSON output first (--output json flag)
try:
    data = json.loads(raw)
    print(data.get('id', ''))
    sys.exit(0)
except Exception:
    pass
# Fall back: scan for the first UUID on any line (handles plain-text output)
m = re.search(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', raw)
print(m.group(0) if m else '')
" 2>/dev/null || true)
      ok "Created tunnel: $TUNNEL_NAME ($TUNNEL_ID)"
    fi
  fi

  # DNS routes for base domain, API, and WebSocket.
  # NOTE: No wildcard *.doable.me route — each deploy creates its own
  # per-hostname CNAME via the Cloudflare API so multiple servers
  # (prod, dev, staging) can coexist under the same domain.
  #
  # On re-installs (or any deploy to a zone that already has CNAME records),
  # `cloudflared tunnel route dns` exits with code 1003 ("An A, AAAA, or CNAME
  # record with that host already exists") and does NOT update the record.
  # The old record then points at the dead/prior tunnel, causing Cloudflare
  # error 530 for every request even though the new tunnel is healthy.
  # Fix: detect the "already exists" case and PATCH the record via the
  # Cloudflare API so it points at the NEW tunnel. (CF_API_TOKEN / CF_ZONE_ID
  # were extracted from cert.pem above and are available as shell vars.)
  _cf_upsert_dns_route() {
    local HOSTNAME="$1"
    local ROUTE_OUT
    local ROUTE_RC=0
    ROUTE_OUT=$(cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" 2>&1) || ROUTE_RC=$?

    if [[ $ROUTE_RC -eq 0 ]]; then
      ok "DNS route set: $HOSTNAME -> $TUNNEL_ID"
      return 0
    fi

    # Check whether failure is the "record already exists" conflict
    if echo "$ROUTE_OUT" | grep -qi "already exists"; then
      # Record already exists and cloudflared won't overwrite it.
      # If we have CF credentials, update it via API so it points at the new tunnel.
      if [[ -n "${CF_API_TOKEN:-}" && -n "${CF_ZONE_ID:-}" ]]; then
        info "DNS record for $HOSTNAME already exists — updating via Cloudflare API..."
        # Query existing record (CNAME first; fall back to any type)
        local API_RESULT
        API_RESULT=$(curl -sf -X GET \
          "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=${HOSTNAME}" \
          -H "Authorization: Bearer ${CF_API_TOKEN}" \
          -H "Content-Type: application/json" || true)

        local RECORD_ID
        RECORD_ID=$(echo "$API_RESULT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    records = data.get('result', [])
    # Prefer CNAME; fall back to first record of any type
    for r in records:
        if r.get('type') == 'CNAME':
            print(r['id']); sys.exit(0)
    if records:
        print(records[0]['id']); sys.exit(0)
except Exception:
    pass
" 2>/dev/null || true)

        if [[ -z "$RECORD_ID" ]]; then
          warn "Could not find existing DNS record for $HOSTNAME via API — record may still point at old tunnel"
          return 1
        fi

        local PUT_RESULT
        PUT_RESULT=$(curl -sf -X PUT \
          "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${RECORD_ID}" \
          -H "Authorization: Bearer ${CF_API_TOKEN}" \
          -H "Content-Type: application/json" \
          --data "{\"type\":\"CNAME\",\"name\":\"${HOSTNAME}\",\"content\":\"${TUNNEL_ID}.cfargotunnel.com\",\"proxied\":true}" \
          || true)

        local PUT_SUCCESS
        PUT_SUCCESS=$(echo "$PUT_RESULT" | python3 -c "
import sys, json
try:
    print('yes' if json.load(sys.stdin).get('success') else 'no')
except Exception:
    print('no')
" 2>/dev/null || true)

        if [[ "$PUT_SUCCESS" == "yes" ]]; then
          ok "DNS record updated via API: $HOSTNAME -> ${TUNNEL_ID}.cfargotunnel.com"
          return 0
        else
          warn "Cloudflare API update FAILED for $HOSTNAME — record may still point at old tunnel (530 risk)"
          warn "  API response: $(echo "$PUT_RESULT" | head -c 300)"
          return 1
        fi
      else
        warn "DNS record for $HOSTNAME already exists but CF_API_TOKEN/CF_ZONE_ID are not set — cannot update via API"
        warn "  The record may point at the old tunnel, causing Cloudflare error 530. Update it manually."
        return 1
      fi
    else
      # Unrelated cloudflared error — surface it clearly
      warn "cloudflared tunnel route dns failed for $HOSTNAME (rc=$ROUTE_RC):"
      warn "  $ROUTE_OUT"
      return 1
    fi
  }

  DNS_ALL_OK=1
  for HOSTNAME in "$DOMAIN" "$API_DOMAIN" "$WS_DOMAIN"; do
    _cf_upsert_dns_route "$HOSTNAME" || DNS_ALL_OK=0
  done

  if [[ "$DNS_ALL_OK" -eq 1 ]]; then
    ok "DNS routes configured for ${DOMAIN}, ${API_DOMAIN}, ${WS_DOMAIN}"
  else
    warn "One or more DNS routes could not be confirmed — check warnings above before going live"
  fi

  # Upsert Cloudflare DNS credentials into .env (token extracted from
  # cert.pem OAuth flow, tunnel ID from tunnel create — neither existed
  # at Step 8). Re-runs of setup-server.sh used to `cat >>` this block
  # unconditionally, leaving duplicate CLOUDFLARED_TUNNEL_ID / CF_API_TOKEN
  # / CF_ZONE_ID lines (and duplicated comment headers). Strip any prior
  # block first so each key appears exactly once.
  ENV_FILE="${INSTALL_DIR}/.env"
  sed -i \
    -e '/^# .*Cloudflare DNS.*auto-populated/d' \
    -e '/^# Used by the deploy pipeline to create per-site CNAME/d' \
    -e '/^# API token comes from .cloudflared tunnel login./d' \
    -e '/^CLOUDFLARED_TUNNEL_ID=/d' \
    -e '/^CF_API_TOKEN=/d' \
    -e '/^CF_ZONE_ID=/d' \
    "$ENV_FILE"
  cat >> "$ENV_FILE" << CFEOF

# ─── Cloudflare DNS (auto-populated by setup-server.sh) ─────
# Used by the deploy pipeline to create per-site CNAME records.
# API token comes from \`cloudflared tunnel login\` OAuth flow.
CLOUDFLARED_TUNNEL_ID=${TUNNEL_ID}
CF_API_TOKEN=${CF_API_TOKEN:-}
CF_ZONE_ID=${CF_ZONE_ID:-}
CFEOF
  ok "Cloudflare credentials upserted in .env (single block, idempotent)"

  # Tunnel config
  CREDS_FILE=$(find /root/.cloudflared -name "${TUNNEL_ID}.json" 2>/dev/null | head -1)
  [[ -z "$CREDS_FILE" ]] && err "Tunnel credentials file not found"

  # Defensive: re-derive PUBLISH_WILDCARD_DOMAIN if the .env-reuse branch
  # bypassed the dashed-rewrite block at the top. Free Universal SSL covers
  # the zone + one wildcard level only, so multi-level DOMAINs (dev.doable.me)
  # MUST emit *.doable.me, not *.dev.doable.me, for published-site TLS to work.
  if [ -z "${PUBLISH_WILDCARD_DOMAIN:-}" ]; then
    DOMAIN_LABEL_COUNT=$(echo "$DOMAIN" | tr '.' '\n' | wc -l)
    if [ "$DOMAIN_LABEL_COUNT" -gt 2 ]; then
      PUBLISH_WILDCARD_DOMAIN="${DOMAIN#*.}"
    else
      PUBLISH_WILDCARD_DOMAIN="${DOMAIN}"
    fi
  fi

  # Ingress hostnames: API/WS already dashed (dev-api.doable.me) for
  # multi-level DOMAINs via the dashed-rewrite block above. Publish wildcard
  # binds to PUBLISH_WILDCARD_DOMAIN (the zone for multi-level, the DOMAIN
  # for zone-apex). The catchall on :8080 routes published-site traffic
  # to the Caddy host-matching block.
  cat > /root/.cloudflared/config.yml << CFGEOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CREDS_FILE}

ingress:
  - hostname: ${API_DOMAIN}
    service: http://127.0.0.1:4000
    originRequest:
      noTLSVerify: true
  - hostname: ${WS_DOMAIN}
    service: http://127.0.0.1:4001
    originRequest:
      noTLSVerify: true
  - hostname: ${DOMAIN}
    service: http://127.0.0.1:3000
    originRequest:
      noTLSVerify: true
  - hostname: "*.${PUBLISH_WILDCARD_DOMAIN}"
    service: http://127.0.0.1:8080
    originRequest:
      noTLSVerify: true
  - service: http_status:404
CFGEOF

  ok "Tunnel config written"

  # ─── Auto-wildcard DNS setup (DNS_MODE=wildcard) ─────────────
  # Default per_publish keeps current behaviour (deploy pipeline creates
  # one CNAME per publish). DNS_MODE=wildcard creates *.${DOMAIN} CNAME
  # once, persists dns_mode='wildcard' in platform_settings so the
  # pipeline skips per-publish CF API calls, and warns when the chosen
  # publish domain is multi-level (Universal SSL only covers one level
  # deep — multi-level needs Advanced Certificate Manager).
  # PUBLISH_LAYOUT=infix implies the operator opted into ACM and wants a
  # wildcard CNAME created up-front. Default DNS_MODE to wildcard so the
  # block below runs — but only when DNS_MODE wasn't explicitly set by the
  # operator (an infix+per_publish combo is legitimate: ACM-covered
  # hostnames + one CNAME per publish for fine-grained rotation).
  if [[ "${PUBLISH_LAYOUT:-prefix}" == "infix" && -z "${DNS_MODE:-}" ]]; then
    DNS_MODE="wildcard"
  fi
  DNS_MODE="${DNS_MODE:-per_publish}"
  if [[ "$DNS_MODE" == "wildcard" ]]; then
    if [[ -z "$CF_API_TOKEN" || -z "$CF_ZONE_ID" || -z "$TUNNEL_ID" ]]; then
      warn "DNS_MODE=wildcard requested but CF_API_TOKEN / CF_ZONE_ID / TUNNEL_ID not all set — skipping wildcard auto-setup."
      warn "Sign in at https://${DOMAIN}/admin after install → DNS settings → Auto-configure wildcard to finish the setup."
    else
      # Pick the wildcard name: infix layout uses the operator-chosen one,
      # otherwise default to *.${DOMAIN} (legacy DNS_MODE=wildcard behavior).
      if [[ "${PUBLISH_LAYOUT:-prefix}" == "infix" && -n "${WILDCARD_HOSTNAME:-}" ]]; then
        WILDCARD_NAME="${WILDCARD_HOSTNAME}"
      else
        WILDCARD_NAME="*.${DOMAIN}"
        # prefix-mode warning: free Universal SSL only covers <zone> + *.<zone>.
        # infix-mode skips the warning — the operator opted into ACM explicitly.
        DOMAIN_LABEL_COUNT=$(echo "$DOMAIN" | tr '.' '\n' | wc -l)
        if [[ "$DOMAIN_LABEL_COUNT" -gt 2 ]]; then
          warn "DOMAIN=${DOMAIN} is multi-level. *.${DOMAIN} is NOT covered by free Universal SSL — enable Cloudflare Advanced Certificate Manager on the zone, or browsers will fail with SSL_VERSION_OR_CIPHER_MISMATCH on published sites."
        fi
      fi
      WILDCARD_TARGET="${TUNNEL_ID}.cfargotunnel.com"
      CF_API="https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records"
      # URL-encode the asterisk for the CF API query. Dots are not reserved
      # in query values, so bash substitution suffices (no python3 dep needed
      # in CONTAINER_MODE where Step 1 is skipped).
      WILDCARD_NAME_ENC="${WILDCARD_NAME//\*/%2A}"
      # Look up existing CNAME (idempotent re-run safety).
      EXISTING_ID=$(curl -fsS -H "Authorization: Bearer ${CF_API_TOKEN}" \
        "${CF_API}?type=CNAME&name=${WILDCARD_NAME_ENC}" 2>/dev/null \
        | python3 -c "import sys,json; r=json.load(sys.stdin).get('result',[]); print(r[0]['id'] if r else '')" 2>/dev/null || true)
      if [[ -n "$EXISTING_ID" ]]; then
        EXISTING_TARGET=$(curl -fsS -H "Authorization: Bearer ${CF_API_TOKEN}" \
          "${CF_API}/${EXISTING_ID}" 2>/dev/null \
          | python3 -c "import sys,json; print(json.load(sys.stdin).get('result',{}).get('content',''))" 2>/dev/null || true)
        if [[ "$EXISTING_TARGET" == "$WILDCARD_TARGET" ]]; then
          ok "Wildcard CNAME ${WILDCARD_NAME} already points to ${WILDCARD_TARGET}"
        else
          curl -fsS -X PATCH -H "Authorization: Bearer ${CF_API_TOKEN}" \
            -H "Content-Type: application/json" \
            "${CF_API}/${EXISTING_ID}" \
            -d "{\"content\":\"${WILDCARD_TARGET}\",\"proxied\":true}" >/dev/null \
            && ok "Updated wildcard CNAME ${WILDCARD_NAME} → ${WILDCARD_TARGET}" \
            || warn "Failed to update wildcard CNAME via CF API"
        fi
      else
        curl -fsS -X POST -H "Authorization: Bearer ${CF_API_TOKEN}" \
          -H "Content-Type: application/json" \
          "${CF_API}" \
          -d "{\"type\":\"CNAME\",\"name\":\"${WILDCARD_NAME}\",\"content\":\"${WILDCARD_TARGET}\",\"proxied\":true,\"ttl\":1}" >/dev/null \
          && ok "Created wildcard CNAME ${WILDCARD_NAME} → ${WILDCARD_TARGET}" \
          || warn "Failed to create wildcard CNAME via CF API"
      fi

      # Persist dns_mode + dns_wildcard_hostname in platform_settings so the
      # deploy pipeline skips per-publish CF API calls AND the /admin DNS
      # panel reflects the operator's actual hostname choice (not the
      # convention-based default). Migration 081 ran in Step 9; ON CONFLICT
      # makes both upserts idempotent for re-runs.
      PGPASSWORD="${DB_PASS}" psql -h localhost -U doable -d doable -c \
        "INSERT INTO platform_settings (key, value) VALUES ('dns_mode', 'wildcard'), ('dns_wildcard_hostname', '${WILDCARD_NAME}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();" \
        >/dev/null 2>&1 \
        && ok "Persisted dns_mode='wildcard' and dns_wildcard_hostname='${WILDCARD_NAME}' in platform_settings" \
        || warn "Failed to persist dns_mode='wildcard' — admin UI can still toggle it later"
    fi
  fi
else
  echo "[SKIP-CONTAINER] Step 10/13: Cloudflare Tunnel (host operator runs cloudflared on Docker host or via reverse proxy in front of container)"
  TUNNEL_NAME="container-mode"
  TUNNEL_ID="n/a"
fi

# ─── Step 11: Publish infrastructure (Caddy + sites) ─────────
info "Step 11/13: Setting up publish infrastructure..."

# Create sites directory for published projects
mkdir -p "${INSTALL_DIR}/sites"
mkdir -p "${INSTALL_DIR}/services/api/projects"
mkdir -p "${INSTALL_DIR}/services/api/thumbnails"
# 711: allow sandboxed dev-server UIDs (10001-10100) to traverse /root
# without being able to list its contents. Required because project dirs
# live under /root/doable/services/api/projects/ and setpriv'd processes
# need path traversal to reach their own chown'd project tree.
chmod 711 /root
chmod -R 755 "${INSTALL_DIR}/sites"

# Caddyfile: serves *.domain from /sites/{subdomain}/
# Bound to 127.0.0.1 — only reachable via Cloudflare Tunnel.
# NO_TUNNEL=1 swaps in a self-signed-TLS, public-facing Caddyfile that
# fronts api/ws/web on :443 directly (no tunnel, no wildcard publishes).
if [ "$NO_TUNNEL" = "1" ]; then
  # Generate self-signed cert keyed on HOST (IP or hostname). SAN extension
  # picks IP: for raw IPv4, DNS: otherwise — same logic as docker/setup.sh.
  mkdir -p /etc/caddy

  # ─── Try mkcert first (browser-trusted certs via local CA) ──────────────
  # Mirrors the docker/setup.sh path: download mkcert if missing, install
  # local CA into every OS+browser store, issue a trusted leaf cert.
  # Only attempts when HOST == localhost OR operator opted in via
  # DOABLE_INSTALL_TRUST=1, because for remote SSH'd HOST mode the CA
  # ends up on the server (no help to the laptop's browser).
  MKCERT_OK=false
  if [ "${HOST}" = "localhost" ] || [ "${DOABLE_INSTALL_TRUST:-0}" = "1" ]; then
    if [ ! -f /etc/caddy/selfsigned.crt ]; then
      ensure_mkcert_baremetal() {
        command -v mkcert &>/dev/null && return 0
        local os arch
        os="$(uname -s | tr '[:upper:]' '[:lower:]')"
        case "$(uname -m)" in
          x86_64|amd64)  arch=amd64 ;;
          aarch64|arm64) arch=arm64 ;;
          *)             return 1 ;;
        esac
        local url="https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-${os}-${arch}"
        info "Downloading mkcert (one-time, ${url##*/})..."
        if curl -fsSL -o /usr/local/bin/mkcert "$url" 2>/dev/null && chmod +x /usr/local/bin/mkcert; then
          command -v mkcert &>/dev/null
        else
          rm -f /usr/local/bin/mkcert; return 1
        fi
      }
      if ensure_mkcert_baremetal; then
        info "Installing mkcert local CA (one-time, all browsers + OS stores)..."
        if mkcert -install >/dev/null 2>&1; then
          info "Issuing browser-trusted cert via mkcert for ${HOST}..."
          if mkcert -cert-file /etc/caddy/selfsigned.crt -key-file /etc/caddy/selfsigned.key \
              "$HOST" localhost 127.0.0.1 ::1 >/dev/null 2>&1; then
            chown caddy:caddy /etc/caddy/selfsigned.crt /etc/caddy/selfsigned.key
            chmod 640 /etc/caddy/selfsigned.key
            chmod 644 /etc/caddy/selfsigned.crt
            MKCERT_OK=true
            ok "mkcert cert installed (https://${HOST} trusted by all browsers on this machine)"
          fi
        fi
      fi
    fi
  fi

  if [ "$USE_LE" = "1" ]; then
    info "LETSENCRYPT=1 — skipping local cert; Caddy will obtain a Let's Encrypt cert for ${HOST}"
  elif [ "$MKCERT_OK" = "true" ]; then
    : # mkcert handled it
  elif [ ! -f /etc/caddy/selfsigned.crt ] || [ ! -f /etc/caddy/selfsigned.key ]; then
    if echo "$HOST" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
      SAN_EXT="subjectAltName=IP:${HOST}"
    else
      SAN_EXT="subjectAltName=DNS:${HOST}"
    fi
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /etc/caddy/selfsigned.key \
      -out /etc/caddy/selfsigned.crt \
      -subj "/CN=${HOST}" \
      -addext "$SAN_EXT"
    # Caddy runs as the `caddy` user (apt package default), so the key
    # must be readable by it — chmod 600 owned by root would cause
    # "permission denied" at service start. Ownership transfer + group-
    # read keeps the secret off the world but available to the daemon.
    chown caddy:caddy /etc/caddy/selfsigned.crt /etc/caddy/selfsigned.key
    chmod 640 /etc/caddy/selfsigned.key
    chmod 644 /etc/caddy/selfsigned.crt
    ok "Self-signed cert created at /etc/caddy/selfsigned.{crt,key} (CN=${HOST}, owner=caddy)"
  else
    info "Self-signed cert already present at /etc/caddy/selfsigned.{crt,key} — reusing"
  fi

  # ─── Auto-trust the cert on the host OS (NO_TUNNEL single-host modes) ────
  # Same cross-platform auto-trust as deployment/docker/setup.sh's
  # install_localhost_trust(). Zero manual cert install: after this block
  # https://${HOST} loads in the browser on the same machine without the
  # "your connection is not private" warning.
  # Drop a manual-install fallback doc next to the cert (mirror of the one
  # docker/setup.sh writes). Operator who hits the rare auto-install
  # failure path has a copy-paste ready guide.
  cat > "${INSTALL_DIR}/cert-install-instructions.md" <<'CERTDOC'
# Manual cert install (fallback)

server-setup.sh tries to auto-install the self-signed cert at
/etc/caddy/selfsigned.crt into your OS + browser trust stores when
HOST is set on the SAME machine you browse from. If that was skipped
(server ≠ browser by default), copy the cert to your browser machine
and run one of these:

## Windows (PowerShell, no admin)
```powershell
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2('C:\path\to\selfsigned.crt')
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser')
$store.Open('ReadWrite'); $store.Add($cert); $store.Close()
New-Item -Path 'HKCU:\Software\Policies\Google\Chrome' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Policies\Google\Chrome' -Name 'ChromeRootStoreEnabled' -Value 0 -Type DWord
# Restart Chrome
```

## macOS
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain selfsigned.crt
```

## Linux (Debian/Ubuntu)
```bash
sudo cp selfsigned.crt /usr/local/share/ca-certificates/doable-localhost.crt
sudo update-ca-certificates
# For Chrome (uses NSS):
sudo apt install libnss3-tools
certutil -A -d sql:$HOME/.pki/nssdb -t "C,," -n "doable-localhost" -i selfsigned.crt
```

## Linux (Fedora/RHEL)
```bash
sudo cp selfsigned.crt /etc/pki/ca-trust/source/anchors/doable-localhost.crt
sudo update-ca-trust
```
CERTDOC
  chown doable:doable "${INSTALL_DIR}/cert-install-instructions.md" 2>/dev/null || true

  install_localhost_trust_baremetal() {
    local cert="/etc/caddy/selfsigned.crt"
    [ -f "$cert" ] || return 0
    # Bare-metal NO_TUNNEL is HOST mode by definition — typically a LAN IP /
    # private server the operator SSH'd into, where the browser is on a
    # DIFFERENT laptop. Installing trust into the server's stores doesn't
    # help that browser. Skip by default; opt in via DOABLE_INSTALL_TRUST=1
    # for the rare case where the same machine serves AND browses.
    if [ "${HOST}" != "localhost" ] && [ "${DOABLE_INSTALL_TRUST:-0}" != "1" ]; then
      info "NO_TUNNEL host mode: skipping auto-trust install (server ≠ browser by default)."
      info "  → Copy ${cert} to your browser machine and follow"
      info "    ${INSTALL_DIR}/cert-install-instructions.md, OR re-run with"
      info "    DOABLE_INSTALL_TRUST=1 if the browser IS on this same box."
      return 0
    fi
    local is_wsl=0
    if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null \
       || [ -n "${WSL_DISTRO_NAME:-}" ] \
       || [ -f /proc/sys/fs/binfmt_misc/WSLInterop ]; then
      is_wsl=1
    fi

    if [ "$is_wsl" = "1" ] && command -v powershell.exe &>/dev/null; then
      info "WSL detected — installing trust into Windows CurrentUser\\Root + Chrome policy..."
      local win_cert
      win_cert="$(wslpath -w "$cert" 2>/dev/null || echo "$cert")"
      powershell.exe -NoProfile -Command "
        \$b64 = (Get-Content -Raw -LiteralPath '$win_cert') -replace '-----[A-Z ]+-----','' -replace '\\s','';
        \$bytes = [Convert]::FromBase64String(\$b64);
        \$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(,\$bytes);
        \$store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser');
        \$store.Open('ReadWrite'); \$store.Add(\$cert); \$store.Close();
        \$path = 'HKCU:\\Software\\Policies\\Google\\Chrome';
        if (-not (Test-Path \$path)) { New-Item -Path \$path -Force | Out-Null };
        Set-ItemProperty -Path \$path -Name 'ChromeRootStoreEnabled' -Value 0 -Type DWord -Force;
        Write-Output 'WIN_TRUST_OK'
      " 2>&1 | grep -q WIN_TRUST_OK \
        && ok "Windows trust + Chrome policy installed (restart Chrome to pick up policy)" \
        || warn "Windows trust install failed — see ${INSTALL_DIR}/cert-install-instructions.md for manual steps"
    fi

    if [ "$(uname -s)" = "Darwin" ]; then
      info "macOS detected — installing trust into System keychain (sudo prompt expected)..."
      sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$cert" 2>/dev/null \
        && ok "macOS trust installed" \
        || warn "macOS trust install failed — see ${INSTALL_DIR}/cert-install-instructions.md"
    fi

    if [ "$(uname -s)" = "Linux" ] && [ "$is_wsl" = "0" ]; then
      info "Linux detected — installing trust into OS CA store..."
      if [ -d /etc/pki/ca-trust/source/anchors ]; then
        cp "$cert" /etc/pki/ca-trust/source/anchors/doable-localhost.crt
        update-ca-trust 2>/dev/null && ok "Linux RHEL/Fedora CA trust installed"
      elif [ -d /usr/local/share/ca-certificates ]; then
        cp "$cert" /usr/local/share/ca-certificates/doable-localhost.crt
        update-ca-certificates 2>/dev/null >/dev/null && ok "Linux Debian/Ubuntu CA trust installed"
      fi
      if command -v certutil &>/dev/null; then
        local nssdb
        for nssdb in "${HOME}/.pki/nssdb" "${SUDO_USER:+/home/${SUDO_USER}/.pki/nssdb}"; do
          [ -d "$nssdb" ] || continue
          certutil -A -d "sql:${nssdb}" -t "C,," -n "doable-localhost" -i "$cert" 2>/dev/null \
            && ok "NSS trust installed at ${nssdb} (Chrome/Chromium)"
        done
      fi
    fi
  }
  if [ "$MKCERT_OK" = "true" ]; then
    info "mkcert already installed local CA — skipping per-cert trust install"
  else
    install_localhost_trust_baremetal
  fi

  # LE mode → named-site block: Caddy auto-provisions a public Let's Encrypt
  # cert and auto-redirects :80→:443 (no `auto_https off`, no `tls` line, no
  # explicit :80 block). Self-signed mode → fixed :443 with the local cert.
  if [ "$USE_LE" = "1" ]; then
    if [ -n "${EMAIL:-}" ]; then
      CADDY_PREAMBLE="{
    admin 127.0.0.1:2019
    email ${EMAIL}
}

${HOST} {"
    else
      CADDY_PREAMBLE="{
    admin 127.0.0.1:2019
}

${HOST} {"
    fi
  else
    CADDY_PREAMBLE="{
    auto_https off
    admin 127.0.0.1:2019
}

:80 {
    redir https://{host}{uri} permanent
}

:443 {
    tls /etc/caddy/selfsigned.crt /etc/caddy/selfsigned.key"
  fi
  cat > /etc/caddy/Caddyfile << CADDYEOF
${CADDY_PREAMBLE}

    # /api/otlp/* → Next.js OTLP proxy on web (127.0.0.1:3000). MUST come
    # before the generic /api/* block so Caddy's first-match-wins rule
    # picks this. Without it, /api/otlp/v1/traces would strip to /otlp/v1/traces
    # and hit the api server (no such route) → 500/404 in browser console.
    # Path is preserved (handle, not handle_path) so Next.js sees the full
    # /api/otlp/v1/traces and matches apps/web/src/app/api/otlp/[...path]/route.ts.
    handle /api/otlp/* {
        reverse_proxy 127.0.0.1:3000
    }

    # /api/* → API on 127.0.0.1:4000
    handle_path /api/* {
        reverse_proxy 127.0.0.1:4000
    }

    # /preview/* → API on 127.0.0.1:4000 (vite sub-resources use relative paths
    # that resolve without the /api prefix; must be a separate block without path stripping)
    handle /preview/* {
        reverse_proxy 127.0.0.1:4000
    }

    # /__doable/* → API on 127.0.0.1:4000. AI-generated preview apps call
    # origin-relative /__doable/data/* (@doable/data SDK), /__doable/ai/*
    # (@doable/ai SDK), and /__doable/connector-proxy/*; without this route
    # those POSTs fall through to the Next.js handler below and get a 404,
    # which surfaces in the preview as a stuck "Saving…" / silent failure.
    # Mirrors deployment/docker/Caddyfile.
    handle /__doable/* {
        reverse_proxy 127.0.0.1:4000
    }

    # /socket* and /ws* → WebSocket on 127.0.0.1:4001
    @ws path /socket* /ws*
    handle @ws {
        reverse_proxy 127.0.0.1:4001
    }

    # Published static sites (path publish topology) — mirrors deployment/docker/Caddyfile.
    # Auto-selected when no Cloudflare tunnel / wildcard DNS exists (the OOB case for
    # NO_TUNNEL installs). The doable-path deploy adapter writes built SPAs flat to
    # SITES_DIR (= ${INSTALL_DIR}/sites)/<slug>/; served at https://${HOST}/sites/<slug>/
    # with a per-site index.html fallback so client-side routes resolve.
    @published_noslash path_regexp ^/sites/[^/]+\$
    redir @published_noslash {http.request.uri.path}/ 308

    @published path_regexp pub ^/sites/(?P<slug>[^/]+)/
    handle @published {
        root * ${INSTALL_DIR}/sites
        uri strip_prefix /sites
        try_files {path} /{re.pub.slug}/index.html
        file_server
    }

    # Everything else → Next.js web on 127.0.0.1:3000
    handle {
        reverse_proxy 127.0.0.1:3000
    }

    header {
        X-Frame-Options SAMEORIGIN
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }
}
CADDYEOF

  if [ "$USE_LE" = "1" ]; then
    ok "Caddy configured for NO_TUNNEL=1 + LETSENCRYPT=1 — public Let's Encrypt TLS fronting api/ws/web at https://${HOST}"
  else
    ok "Caddy configured for NO_TUNNEL=1 — :443 self-signed TLS fronting api/ws/web at https://${HOST}"
  fi
else
  cat > /etc/caddy/Caddyfile << CADDYEOF
{
    auto_https off
    admin 127.0.0.1:2019
}

:8080 {
    bind 127.0.0.1

    @has_subdomain {
        header_regexp subdomain Host ^([a-z0-9][-a-z0-9]*)\.${DOMAIN//./\\.}\$
    }

    handle @has_subdomain {
        root * ${INSTALL_DIR}/sites/{re.subdomain.1}/live
        try_files {path} /index.html
        file_server
        header {
            X-Frame-Options SAMEORIGIN
            X-Content-Type-Options nosniff
            Referrer-Policy strict-origin-when-cross-origin
        }
        encode gzip
    }

    handle {
        respond "Not Found" 404
    }
}
CADDYEOF
  ok "Caddy configured on :8080 for *.${DOMAIN} → ${INSTALL_DIR}/sites/"
fi

systemctl enable caddy
systemctl restart caddy

# ─── Step 11.5: Create non-root service user ─────────────────
info "Step 11.5/13: Creating 'doable' system user (uid 5000)..."
if ! getent passwd doable >/dev/null; then
  # When uid > SYS_UID_MAX (default 999), useradd's auto-group allocation
  # fails. Pre-create the group with an explicit gid so useradd can attach.
  getent group doable >/dev/null || groupadd --system -g 5000 doable
  useradd --system --no-create-home --shell /bin/bash -u 5000 -g doable doable
fi
# useradd --no-create-home means /home/doable does NOT exist. systemd's
# doable.service references both /home/doable and /var/log/doable in its
# ReadWritePaths= directive. If either is missing at unit-start time the
# namespace setup fails with exit 226/NAMESPACE before start.sh ever
# runs ("Failed at step NAMESPACE spawning /root/doable/start.sh").
# Create them now with the right ownership so the unit boots cleanly.
mkdir -p /home/doable /var/log/doable
chown doable:doable /home/doable /var/log/doable
chmod 0755 /home/doable /var/log/doable
ok "System user 'doable' (uid 5000) present"

# Chown install dir to doable:doable (skip node_modules for speed — they're
# read-only at runtime). .next + .turbo MUST be chown'd because the web
# service runs `next dev --turbopack` as the doable user, and next-dev
# needs to write its build cache under .next/dev — leaving it root-owned
# kills the web pane with EACCES on mkdir '.next/dev'.
find "${INSTALL_DIR}" \
  -not \( -name node_modules -prune \) \
  -maxdepth 6 \
  -print0 2>/dev/null | xargs -0 chown doable:doable 2>/dev/null || \
  chown -R doable:doable "${INSTALL_DIR}" 2>/dev/null || true
# Belt-and-suspenders: ensure .next/.turbo are doable-writable even if the
# find/xargs path above raced or hit a transient EACCES. These dirs are
# whole-tree small (typically 50–200 MB) so a recursive chown is cheap.
[ -d "${INSTALL_DIR}/apps/web/.next" ] && chown -R doable:doable "${INSTALL_DIR}/apps/web/.next" 2>/dev/null || true
[ -d "${INSTALL_DIR}/apps/web/.turbo" ] && chown -R doable:doable "${INSTALL_DIR}/apps/web/.turbo" 2>/dev/null || true
ok "Chowned ${INSTALL_DIR} to doable:doable"

# ─── Step 12: Systemd services ────────────────────────────────
info "Step 12/13: Creating systemd services..."

# Ensure scripts from repo are executable
chmod +x "${INSTALL_DIR}/start.sh"
chmod +x "${INSTALL_DIR}/watchdog.sh"

# Doable systemd service
cat > /etc/systemd/system/doable.service << SVCEOF
[Unit]
Description=Doable App (tmux session)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=forking
User=doable
Group=doable
WorkingDirectory=${INSTALL_DIR}
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=${INSTALL_DIR}/start.sh
ExecStop=/usr/bin/tmux kill-session -t doable
RemainAfterExit=yes
Restart=on-failure
RestartSec=10
# AmbientCapabilities=CAP_SETUID CAP_SETGID was previously set so the API
# could drop privileges via setpriv. We removed it because bwrap's own
# "unexpected capabilities but not setuid" guard refuses to run as a child
# of a process that holds permitted caps without bwrap itself being setuid
# — that killed every DOABLE_SANDBOX_VITE=1 spawn with empty stderr.
# Sudo's own setuid bit still handles elevation for sandbox-spawn invocation.
# NoNewPrivileges MUST be false. The API uses sudo -n to invoke the
# sandbox-spawn setuid helper for per-project UID drop. NoNewPrivileges=true
# would neuter sudo's setuid bit, so dev-uid-allocator's sudo probe fails,
# the API falls back to running vite as the API user, and the layered
# isolation degrades. Compensation: the sudoers rule is locked down to the
# specific helper paths in /etc/sudoers.d/doable-sandbox.
NoNewPrivileges=false
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
# ProtectKernelTunables / ProtectKernelModules / ProtectControlGroups are
# OFF for the doable.service. They were the root cause of
# BUG-R12-BWRAP-PROC-MOUNT-EPERM: with them enabled, systemd put the unit
# into a private mount namespace whose propagation made nested bwrap
# mount(2) calls fail with EPERM when bwrap tried '--proc /proc', killing
# every preview / dev-server / AI chat-tool spawn with empty stderr. The
# trade-off is acceptable because the API runs as the unprivileged
# 'doable' user with empty cap bounding (CapPrm=0) — the kernel itself
# already denies cgroup modification, module loading, and writes to
# /proc/sys for non-root processes without CAP_SYS_ADMIN. The true
# isolation boundary for user-supplied code is the inner bwrap+nft+
# apparmor jail, which we just unbroke. MountFlags=shared belt-and-
# braces the propagation type so nested mount namespaces inherit
# MS_SHARED instead of MS_SLAVE (the latter blocks /proc remounts).
#
# Residual self-DoS surface (operator awareness): with ProtectControlGroups
# off, the doable user retains writable access to its own cgroup v2
# delegated knobs (memory.max, pids.max, cgroup.kill) via the unit's
# scope. That is a self-DoS at worst — the user cannot escape its own
# cgroup or affect other slices. If a future incident shows OOM-kills or
# pid exhaustion under load, check the unit's cgroup knobs first.
ProtectKernelTunables=no
ProtectKernelModules=no
ProtectControlGroups=no
MountFlags=shared
RestrictSUIDSGID=true
# RestrictNamespaces MUST be false. The sandbox layer uses bubblewrap which
# calls clone(CLONE_NEWUSER|CLONE_NEWNS|CLONE_NEWPID|CLONE_NEWNET); blocking
# those clone() flags here would kill every preview/build sandbox spawn.
RestrictNamespaces=false
LockPersonality=true
# /home/doable is required for pnpm/Next.js cache when the runtime user is
# 'doable' (default home is /home/doable; useradd --no-create-home leaves
# the directory missing, but setup-server.sh creates it below). Without
# /home/doable in ReadWritePaths, ProtectHome=read-only blocks HOME writes.
ReadWritePaths=/root/doable /var/log/doable /home/doable /data/projects /data/sites

[Install]
WantedBy=multi-user.target
SVCEOF

# Doable watchdog timer — checks service health every 2 minutes
chmod +x "${INSTALL_DIR}/watchdog.sh"

cat > /etc/systemd/system/doable-watchdog.service << WDEOF
[Unit]
Description=Doable Watchdog — health check and auto-recovery
After=doable.service
# doable.service runs with PrivateTmp=true, so its tmux socket lives in a
# private /tmp mount namespace. Without JoinsNamespaceOf, the watchdog gets
# its OWN PrivateTmp (systemd default for User= units) and can never see
# the tmux socket — every \`tmux has-session\` returns false and the WS
# auto-restart path is dead. This caused dev-ws.doable.me 502 on 2026-05-13
# after the inner pnpm dev:ws was OOM-killed and never restarted.
JoinsNamespaceOf=doable.service

[Service]
Type=oneshot
User=doable
Group=doable
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/watchdog.sh
# Same PrivateTmp scope as doable.service — required for the JoinsNamespaceOf
# above to actually share /tmp. systemd silently no-ops JoinsNamespaceOf when
# the joining unit doesn't itself opt into the namespace.
PrivateTmp=true
WDEOF

cat > /etc/systemd/system/doable-watchdog.timer << WTEOF
[Unit]
Description=Run Doable watchdog every 2 minutes

[Timer]
OnBootSec=60
OnUnitActiveSec=120
AccuracySec=30

[Install]
WantedBy=timers.target
WTEOF

# ─── Per-app runtime template (PRD 06 / Phase 5) ──────────────
# Socket-activated systemd template so 100s of published process-kind apps
# (Next.js standalone, Nuxt, etc.) can sleep idle and wake on first request.
# The supervisor (services/api/src/runtime/) writes per-app drop-ins under
# /etc/systemd/system/doable-app@{slug}.service.d/override.conf at publish.

mkdir -p /etc/doable/apps

# Shared npm cache directory bind-mounted into every preview jail. The
# vite-preview sandbox profile ro-binds /var/cache/doable/npm into the
# bwrap'd /.npm-cache. Without this directory bwrap refuses to spawn
# ("Can't find source path /var/cache/doable/npm") and every preview-url
# request times out at the orchestrator's 90s readiness deadline.
mkdir -p /var/cache/doable/npm
mkdir -p /var/cache/doable/puppeteer
chown -R doable:doable /var/cache/doable

# Install Chrome for puppeteer (thumbnails). Runs as the doable user
# with PUPPETEER_CACHE_DIR set so the binary lands in the shared cache
# and the runtime API process finds it via the .env override emitted
# above. Uses the workspace's already-installed puppeteer (via pnpm
# exec) instead of npx-fetching a pinned version — this avoids 150MB
# of redundant download and keeps the chrome version in lockstep with
# services/api/package.json. stderr tees to /var/log so a failed
# install is debuggable instead of silent. A post-install smoke check
# fails loudly if the chrome binary isn't where we expect it.
if [ -d "${INSTALL_DIR}/services/api/node_modules/puppeteer" ]; then
  info "Installing Chrome for puppeteer thumbnails..."
  PUPP_LOG=/var/log/doable-setup-puppeteer.log
  if sudo -u doable HOME=/home/doable PUPPETEER_CACHE_DIR=/var/cache/doable/puppeteer \
      sh -c "cd ${INSTALL_DIR}/services/api && pnpm exec puppeteer browsers install chrome" \
      >"$PUPP_LOG" 2>&1; then
    # Verify the binary actually landed before declaring success.
    CHROME_BIN="$(find /var/cache/doable/puppeteer/chrome -name chrome -type f -executable 2>/dev/null | head -n1)"
    if [ -n "$CHROME_BIN" ]; then
      # Smoke-test the binary so we catch missing shared libs at install
      # time, not at first thumbnail capture (R20: libnspr4 was missing
      # despite line 299's apt install reporting success, and the
      # operator only noticed weeks later when dashboard thumbnails
      # stayed blank). --no-sandbox keeps the test runnable inside
      # CONTAINER_MODE; the real runtime uses the AppArmor profile.
      if "$CHROME_BIN" --headless=new --no-sandbox --disable-gpu --version >>"$PUPP_LOG" 2>&1; then
        ok "Chrome installed at /var/cache/doable/puppeteer (smoke-tested, thumbnails enabled)"
      else
        warn "Chrome binary at $CHROME_BIN fails to launch (likely missing shared lib). Re-running puppeteer apt deps..."
        apt-get install -y "${PUPPETEER_DEPS[@]}" libasound2t64 libasound2 2>&1 | tail -5
        if "$CHROME_BIN" --headless=new --no-sandbox --disable-gpu --version >>"$PUPP_LOG" 2>&1; then
          ok "Chrome smoke test passed after dep retry — thumbnails enabled"
        else
          warn "Chrome STILL fails to launch — thumbnails will be unavailable. Inspect: $CHROME_BIN --headless=new --version (see $PUPP_LOG)"
        fi
      fi
      # ── Setuid chrome-sandbox helper (defense-in-depth) ──────
      # Puppeteer ships a `chrome-sandbox` helper next to the chrome binary.
      # When the kernel disables unprivileged user-namespaces (CIS-hardened
      # boxes, some Linode/DO security profiles, custom seccomp on the host)
      # Chrome falls back to this setuid helper — but only if it's owned by
      # root with mode 4755. `pnpm exec puppeteer browsers install chrome`
      # runs as the doable user, so the helper lands with the wrong owner
      # and Chrome silently disables the sandbox at runtime. Fix it here.
      # This is purely defense-in-depth: when unprivileged userns IS enabled
      # (the default on Ubuntu 22.04+ / Debian 12+) Chrome ignores the
      # setuid path entirely and the userns sandbox kicks in.
      CHROME_SANDBOX_BIN="$(find /var/cache/doable/puppeteer/chrome -name chrome-sandbox -type f 2>/dev/null | head -n1)"
      if [ -n "$CHROME_SANDBOX_BIN" ]; then
        chown root:root "$CHROME_SANDBOX_BIN" && chmod 4755 "$CHROME_SANDBOX_BIN" \
          && ok "chrome-sandbox helper setuid root (fallback for kernels with userns disabled)" \
          || warn "Failed to set setuid bit on $CHROME_SANDBOX_BIN — Chrome sandbox falls back to userns only"
      else
        warn "chrome-sandbox helper not found under /var/cache/doable/puppeteer/chrome — Chrome sandbox falls back to userns only"
      fi
    else
      warn "puppeteer reported success but chrome binary not found under /var/cache/doable/puppeteer/chrome — see $PUPP_LOG"
    fi
  else
    warn "puppeteer chrome install failed — see $PUPP_LOG. Re-run manually: sudo -u doable PUPPETEER_CACHE_DIR=/var/cache/doable/puppeteer pnpm --filter @doable/api exec puppeteer browsers install chrome"
  fi
else
  warn "Skipping Chrome install — ${INSTALL_DIR}/services/api/node_modules/puppeteer not present (did pnpm install fail above?). Thumbnails will be unavailable."
fi

cat > /etc/systemd/system/doable-app@.service << APPSVCEOF
[Unit]
Description=Doable user app %i
After=network-online.target
PartOf=doable-apps.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
DynamicUser=yes
EnvironmentFile=-/etc/doable/apps/%i.env
ExecStart=/usr/bin/node /data/projects/%i/dist-server/server.js
Restart=on-failure
RestartSec=5s
TimeoutStartSec=30
TimeoutStopSec=15

# Sandboxing — additive to dovault's per-spawn flags. Per PRD 06 §4.1.
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=/data/projects /data/sites
PrivateTmp=yes
PrivateUsers=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
RestrictNamespaces=~user
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
RestrictRealtime=yes
LockPersonality=yes
RestrictSUIDSGID=yes
RemoveIPC=yes
SystemCallFilter=~@clock @cpu-emulation @debug @module @mount @obsolete @raw-io @reboot @swap @privileged
SystemCallArchitectures=native
PrivateDevices=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid

[Install]
WantedBy=doable-apps.target
APPSVCEOF

cat > /etc/systemd/system/doable-apps.target << APPTGTEOF
[Unit]
Description=All Doable per-app units
StopWhenUnneeded=no

[Install]
WantedBy=multi-user.target
APPTGTEOF

# Cloudflared service
if [ "$NO_TUNNEL" = "1" ]; then
  echo "[SKIP-NO-TUNNEL] cloudflared service install (NO_TUNNEL=1 — Caddy fronts directly with self-signed cert)"
elif [ "$CONTAINER_MODE" != "1" ]; then
  # `cloudflared service install` refuses with "Possible conflicting
  # configuration" when BOTH /root/.cloudflared/config.yml and
  # /etc/cloudflared/config.yml exist. The script always writes its own
  # at /root/.cloudflared/config.yml at Step 10, so any pre-staged or
  # restored /etc/cloudflared/config.yml is redundant — remove it so the
  # service install picks up the right path.
  if [ -f /root/.cloudflared/config.yml ] && [ -f /etc/cloudflared/config.yml ]; then
    rm -f /etc/cloudflared/config.yml
  fi
  # Log stderr instead of /dev/null so the next time cloudflared service
  # install regresses we have a forensic trail. The fallback chain still
  # ends in `|| true` so a missing systemd target later in this step
  # (cloudflared.service) is what surfaces the failure to the operator.
  CF_INSTALL_LOG=/var/log/doable-setup-cloudflared.log
  cloudflared service install 2>>"$CF_INSTALL_LOG" || \
    cloudflared --config /root/.cloudflared/config.yml service install 2>>"$CF_INSTALL_LOG" || \
    true
fi

systemctl daemon-reload
if [ "$NO_TUNNEL" = "1" ]; then
  # NO_TUNNEL mode: cloudflared is installed but not configured/used.
  # Enable only the doable units; Caddy was already enabled in Step 11.
  systemctl enable doable.service doable-watchdog.timer doable-apps.target 2>/dev/null || true
elif [ "$CONTAINER_MODE" = "1" ]; then
  # Container mode: cloudflared is masked; doable-watchdog.timer requires
  # cloudflared transitively in some setups — enable only what we have.
  systemctl enable doable.service doable-watchdog.timer doable-apps.target 2>/dev/null || true
else
  systemctl enable doable.service doable-watchdog.timer cloudflared doable-apps.target 2>/dev/null || \
    systemctl enable doable.service doable-watchdog.timer doable-apps.target 2>/dev/null || \
    true
fi

ok "Systemd services created and enabled (app + watchdog timer + tunnel + per-app template)"

# ─── Step 12.5: Build-time outbound proxy (Wave 29-30) ───────
info "Step 12.5/13: Installing Squid build-time HTTP proxy..."
if [ -x "${INSTALL_DIR}/scripts/setup-build-proxy.sh" ] || [ -f "${INSTALL_DIR}/scripts/setup-build-proxy.sh" ]; then
  bash "${INSTALL_DIR}/scripts/setup-build-proxy.sh" || warn "setup-build-proxy.sh failed — BUILD_HTTP_PROXY won't work until you fix Squid manually"
else
  warn "scripts/setup-build-proxy.sh not found in repo — skipping Squid install"
fi

# ─── Step 12.6: Sandbox MAC profile + privileged helpers ─────
# Per SandboxAgnosticSandboxingPRD ch 08, the sandbox composer layer (see
# packages/dovault/src/composers/) layers AppArmor + bind-mount helpers on
# top of the chosen backend (psroot / bubblewrap / systemd / sandbox-exec).
# We install the MAC profile and the privileged-helper stubs here so a
# fresh box gets the same isolation matrix without manual ops work.
if [ "$CONTAINER_MODE" != "1" ]; then
  info "Step 12.6/13: Installing AppArmor profile + sandbox helpers..."

  # — AppArmor —
  if ! command -v apparmor_parser &>/dev/null; then
    apt-get install -y apparmor apparmor-utils 2>&1 | tail -2
  fi

  # /var/cache/apparmor pre-warm + group writability
  # WHY: the api-bash + doable-bwrap profiles are reloaded at runtime by the
  # `doable` user (sandbox composer + dev-server jail). apparmor_parser
  # writes a cached binary to /var/cache/apparmor — owned root:root 0755 by
  # default — and reload EACCES out as the unprivileged `doable` user.
  # Pre-warm here (root has write at install time) and chgrp/chmod so the
  # runtime user can refresh the cache without escalation.
  mkdir -p /var/cache/apparmor
  if id doable &>/dev/null; then
    chgrp doable /var/cache/apparmor 2>/dev/null || true
    chmod g+w /var/cache/apparmor 2>/dev/null || true
  fi

  if [ -f "${INSTALL_DIR}/deployment/apparmor/doable-ai-bash" ]; then
    install -m 0644 -o root -g root \
      "${INSTALL_DIR}/deployment/apparmor/doable-ai-bash" \
      /etc/apparmor.d/doable-ai-bash
    if apparmor_parser -r /etc/apparmor.d/doable-ai-bash 2>&1 | tee /tmp/aa.log; then
      ok "AppArmor profile 'doable-ai-bash' loaded"
    else
      warn "apparmor_parser failed: $(tail -1 /tmp/aa.log) — profile staged but inactive"
    fi
  else
    warn "deployment/apparmor/doable-ai-bash missing in repo — skipping MAC profile install"
  fi

  # bwrap userns profile: same Ubuntu 24.04+ restriction as Chrome below —
  # apparmor_restrict_unprivileged_userns=1 blocks bwrap from creating the
  # user namespace it needs for the --uid/--gid remap, killing every
  # preview / build / chat-tool spawn with `bwrap: setting up uid map:
  # Permission denied`. The profile is scoped to /usr/bin/bwrap only.
  if [ -f "${INSTALL_DIR}/deployment/apparmor/doable-bwrap" ]; then
    install -m 0644 -o root -g root \
      "${INSTALL_DIR}/deployment/apparmor/doable-bwrap" \
      /etc/apparmor.d/doable-bwrap
    if apparmor_parser -r /etc/apparmor.d/doable-bwrap 2>&1 | tee /tmp/aa-bwrap.log; then
      ok "AppArmor profile 'doable-bwrap' loaded (dev-server / preview / chat-tool jails ok)"
    else
      warn "apparmor_parser failed for doable-bwrap: $(tail -1 /tmp/aa-bwrap.log) — Vite preview + AI code-gen may fail on Ubuntu 24.04+ until resolved"
    fi
  else
    warn "deployment/apparmor/doable-bwrap missing in repo — AI code-gen may fail on Ubuntu 24.04+ (bwrap uid-map denied)"
  fi

  # Puppeteer Chrome userns profile: Ubuntu 24.04+ blocks unprivileged user
  # namespaces (kernel.apparmor_restrict_unprivileged_userns=1), so Chrome's
  # sandbox can't start when puppeteer launches it as the doable user. This
  # profile grants `userns` to ONLY the puppeteer-managed Chrome binary, so
  # the global restriction still protects every other workload (including
  # user-supplied AI code in bubblewrap jails).
  if [ -f "${INSTALL_DIR}/deployment/apparmor/doable-puppeteer-chrome" ]; then
    install -m 0644 -o root -g root \
      "${INSTALL_DIR}/deployment/apparmor/doable-puppeteer-chrome" \
      /etc/apparmor.d/doable-puppeteer-chrome
    if apparmor_parser -r /etc/apparmor.d/doable-puppeteer-chrome 2>&1 | tee /tmp/aa-chrome.log; then
      ok "AppArmor profile 'doable-puppeteer-chrome' loaded (thumbnails sandbox ok)"
    else
      warn "apparmor_parser failed: $(tail -1 /tmp/aa-chrome.log) — thumbnail captures will fail under Ubuntu 24.04+ until resolved"
    fi
  else
    warn "deployment/apparmor/doable-puppeteer-chrome missing in repo — thumbnail captures may fail on Ubuntu 24.04+"
  fi

  # — Bind-mount helper for proc-mask + etc-synth composers —
  # The composers stage synthetic /proc and /etc files in
  # `<projectPath>/.sandbox/...` and ask this helper to bind-mount them
  # into the running jail's mount-ns. Wrapper restricts the allowed
  # operations to bind-mount + umount inside the project tree so it can
  # be granted NOPASSWD sudo to the API user without becoming a footgun.
  mkdir -p /opt/doable/bin
  cat > /opt/doable/bin/sandbox-mount <<'WRAPPER'
#!/bin/bash
# Privileged helper invoked by packages/dovault/src/composers/mount-helper.ts.
# Restricted to bind-mount + umount under /data/projects/* and /tmp/doable-*.
# Called as: sandbox-mount bind <src> <dst> [ro|rw]
#            sandbox-mount umount <dst>
set -euo pipefail
op="${1:-}"; shift || true
case "$op" in
  bind)
    src="${1:?missing src}"; dst="${2:?missing dst}"; mode="${3:-ro}"
    case "$src" in /data/projects/*|/tmp/doable-*|/var/lib/doable/*) ;;
      *) echo "[sandbox-mount] src $src not in allowed roots" >&2; exit 2 ;;
    esac
    mount --bind "$src" "$dst"
    [ "$mode" = "ro" ] && mount -o remount,ro,bind "$dst" || true
    ;;
  umount)
    dst="${1:?missing dst}"
    umount "$dst"
    ;;
  *)
    echo "Usage: sandbox-mount bind <src> <dst> [ro|rw] | umount <dst>" >&2
    exit 2
    ;;
esac
WRAPPER
  chmod 0755 /opt/doable/bin/sandbox-mount
  chown root:root /opt/doable/bin/sandbox-mount

  # — Privileged setpriv wrapper for per-project UID drop —
  # Validates uid range (10001-65000), project_id (canonical UUID), and the
  # command (must be /usr/bin/node OR under <project_path>/node_modules/.bin)
  # then setpriv --reuid/--regid/--clear-groups and exec. Sole privileged op.
  # Canonical source: deployment/bin/sandbox-spawn (shipped in repo). The
  # legacy setup-v3/sandbox-spawn path remains as a fallback for forks that
  # haven't picked up the rename. PROJECTS_PREFIX is sed-rewritten to match
  # this install's INSTALL_DIR (upstream default is /opt/doable/services/api).
  SBSPAWN_SRC=""
  if [ -f "${INSTALL_DIR}/deployment/bin/sandbox-spawn" ]; then
    SBSPAWN_SRC="${INSTALL_DIR}/deployment/bin/sandbox-spawn"
  elif [ -f "${INSTALL_DIR}/setup-v3/sandbox-spawn" ]; then
    SBSPAWN_SRC="${INSTALL_DIR}/setup-v3/sandbox-spawn"
  fi
  if [ -n "$SBSPAWN_SRC" ]; then
    sed "s|^PROJECTS_PREFIX=.*|PROJECTS_PREFIX=\"${INSTALL_DIR}/services/api/projects\"|" \
      "$SBSPAWN_SRC" > /opt/doable/bin/sandbox-spawn
    chmod 0755 /opt/doable/bin/sandbox-spawn
    chown root:root /opt/doable/bin/sandbox-spawn
    ok "sandbox-spawn helper installed from ${SBSPAWN_SRC#${INSTALL_DIR}/} (PROJECTS_PREFIX=${INSTALL_DIR}/services/api/projects)"
  else
    warn "sandbox-spawn missing in repo (looked under deployment/bin/ and setup-v3/) — preview/dev-server jails will run as the API user (no UID drop)"
  fi

  # — Polkit rule: let `doable` invoke systemd-run --scope —
  # dev-server-start.ts and vite-jail.ts wrap each preview spawn in a
  # transient systemd scope for cgroup + seccomp isolation. Without an
  # explicit polkit grant the call fails with "Failed to start transient
  # scope unit: Interactive authentication required" and every preview
  # request returns 503, blocking previews and thumbnails. The grant is
  # scoped to the doable user only, on a non-interactive bus, so it doesn't
  # expand the attack surface beyond what dovault already needs.
  mkdir -p /etc/polkit-1/rules.d
  cat > /etc/polkit-1/rules.d/50-doable-systemd.rules <<'POLKIT'
polkit.addRule(function(action, subject) {
    if ((action.id == "org.freedesktop.systemd1.manage-units" ||
         action.id == "org.freedesktop.systemd1.manage-unit-files") &&
        subject.user == "doable") {
        return polkit.Result.YES;
    }
});
POLKIT
  chmod 0644 /etc/polkit-1/rules.d/50-doable-systemd.rules
  systemctl reload polkit 2>/dev/null || systemctl restart polkit 2>/dev/null || true
  ok "Polkit rule installed (doable user can systemd-run transient scopes)"

  # — sudoers grant for the sandbox helpers —
  # NOPASSWD sudo for sandbox-mount and sandbox-spawn (installed by
  # dev-uid-allocator's setup-v3 flow). API process can drop privileges
  # but still bind-mount + setpriv via these wrappers.
  cat > /etc/sudoers.d/doable-sandbox <<SUDO
# Doable sandbox helpers — NOPASSWD for the composer + dev-uid-allocator.
# Owned by root, mode 0440 (enforced by visudo).
# - sandbox-mount, sandbox-spawn: setuid helpers for the dovault composer
# - chown -R <uid>:<gid> projects/*: per-project ownership flip for UID drop
# - chmod -R g+rwX + find -type d -exec chmod g+s: grants the API doable
#   group write access on chowned project trees so AI tools (create_file,
#   bash, install_package, link-sdk) keep working after the sandbox uid
#   flip. R14 BUG-OWNERSHIP-SPLIT — without these the post-chown tree was
#   owned 10001:10001 (no doable-group access) and every AI tool hit EACCES.
# - chown -R doable:doable apps/web/.next, .turbo: self-heal stale root-owned
#   Next.js artifacts at start.sh boot (prevents "rm: Permission denied" silent
#   build failure that surfaces externally as 502 on /dashboard).
Cmnd_Alias DOABLE_SANDBOX = /opt/doable/bin/sandbox-mount, /opt/doable/bin/sandbox-spawn, /usr/bin/chown -R [0-9]*\:[0-9]* ${INSTALL_DIR}/services/api/projects/*, /usr/bin/chown -R [0-9]*\:[0-9]* /opt/doable/projects/*, /usr/bin/chmod -R g+rwX ${INSTALL_DIR}/services/api/projects/*, /usr/bin/chmod -R g+rwX /opt/doable/projects/*, /usr/bin/find ${INSTALL_DIR}/services/api/projects/* -type d -exec chmod g+s {} +, /usr/bin/find /opt/doable/projects/* -type d -exec chmod g+s {} +, /usr/bin/chown -R doable\:doable ${INSTALL_DIR}/apps/web/.next, /usr/bin/chown -R doable\:doable ${INSTALL_DIR}/apps/web/.turbo, /bin/chown -R doable\:doable ${INSTALL_DIR}/apps/web/.next, /bin/chown -R doable\:doable ${INSTALL_DIR}/apps/web/.turbo
doable ALL=(root) NOPASSWD: DOABLE_SANDBOX
SUDO
  chmod 0440 /etc/sudoers.d/doable-sandbox
  if visudo -c -f /etc/sudoers.d/doable-sandbox >/dev/null 2>&1; then
    ok "sandbox helpers installed at /opt/doable/bin/ + NOPASSWD sudoers"
  else
    err "Invalid sudoers file /etc/sudoers.d/doable-sandbox — removing for safety"
    rm -f /etc/sudoers.d/doable-sandbox
  fi
else
  echo "[SKIP-CONTAINER] Step 12.6/13: AppArmor + sandbox helpers (kernel-level, runs on host)"
fi

# ─── Step 12.9: Defensive source-tree restore (BUG-12 mitigation) ──
# On fresh dodev installs, files under services/api/src/projects/ and
# services/api/src/routes/projects/ have been observed deleted from the
# working tree while still tracked in the git index (baremetal-audit-r13
# "BUG-12"). Root cause is not yet identified — pattern matches paths
# containing "projects", suggesting an overly-broad glob somewhere
# (sandbox spawn helper, runtime cleanup, or a build step). Until the
# source is found and fixed, restore any tracked source-tree files that
# went missing during install, BEFORE services start. This is idempotent
# and a no-op on a healthy tree, and never overwrites a live local edit
# (git restore only touches the " D " status lines = deleted-from-tree).
if [ "$CONTAINER_MODE" != "1" ] && [ -d "${INSTALL_DIR}/.git" ]; then
  info "Step 12.9/13: Verifying tracked source files (BUG-12 guard)..."
  (
    cd "${INSTALL_DIR}" || exit 0
    # `git status --porcelain` lines starting with " D " mean tracked-but-
    # deleted-from-worktree (index unchanged). Restore just those.
    MISSING_FILES=$(git status --porcelain 2>/dev/null | awk '$1 == "D" { print $2 }' || true)
    if [ -n "$MISSING_FILES" ]; then
      MISSING_COUNT=$(printf '%s\n' "$MISSING_FILES" | wc -l)
      warn "Detected ${MISSING_COUNT} tracked file(s) missing from working tree — restoring:"
      printf '%s\n' "$MISSING_FILES" | sed 's/^/    /'
      printf '%s\n' "$MISSING_FILES" | xargs -r git restore --
      ok "Restored ${MISSING_COUNT} file(s) from git index"
    else
      ok "Source tree intact — no missing tracked files"
    fi
  )
fi

# ─── Step 13: Start everything ────────────────────────────────
info "Step 13/13: Starting services..."

if [ "$CONTAINER_MODE" != "1" ]; then
  if [ "$NO_TUNNEL" = "1" ]; then
    info "NO_TUNNEL=1 — skipping cloudflared start (Caddy on :443 handles public traffic)"
  else
    systemctl start cloudflared 2>/dev/null || systemctl restart cloudflared
  fi
  systemctl start doable.service
  systemctl start doable-watchdog.timer

  # Wait for services to come up
  echo -n "  Waiting for services"
  for i in $(seq 1 20); do
    echo -n "."
    sleep 1
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200"; then
      break
    fi
  done
  echo ""

  # Final health check. NO_TUNNEL=1: public URL is https://${HOST} with a
  # self-signed cert, so curl needs -k to skip TLS verification.
  WEB_STATUS=$(timeout 30 curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
  API_STATUS=$(timeout 10 curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/ 2>/dev/null || echo "000")
  if [ "$NO_TUNNEL" = "1" ]; then
    CF_STATUS=$(timeout 15 curl -sk -o /dev/null -w "%{http_code}" "https://${HOST}/" 2>/dev/null || echo "000")
  else
    CF_STATUS=$(timeout 15 curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/" 2>/dev/null || echo "000")
  fi
else
  # CONTAINER_MODE: systemd PID 1 is up and the unit files were just written
  # in Step 12. Daemon-reload + start them now from inside doable-init.
  systemctl daemon-reload
  systemctl start squid 2>/dev/null || true
  systemctl start doable.service 2>/dev/null || true
  systemctl start doable-watchdog.timer 2>/dev/null || true

  echo -n "  Waiting for services"
  for i in $(seq 1 30); do
    echo -n "."
    sleep 1
    if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/health 2>/dev/null | grep -q "200"; then
      break
    fi
  done
  echo ""

  WEB_STATUS=$(timeout 5 curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null || echo "000")
  API_STATUS=$(timeout 5 curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/health 2>/dev/null || echo "000")
  CF_STATUS="container"
fi

echo ""
cat << BANNER
╔═══════════════════════════════════════════════════════════════════╗
║                        Setup Complete!                            ║
╚═══════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════
  Doable is running at: https://${DOMAIN}
═══════════════════════════════════════════════════════════════════

  Step 1: Sign up at https://${DOMAIN}/signup
          The FIRST account becomes platform owner automatically.

  Step 2: Walk through the 4-step setup wizard at /setup
          (Welcome → AI provider → Sign-in → Plans & billing.
           No "create first app" step — that's for end-users in the dashboard.)

  Bootstrap token (only needed if first signup is delayed >24h or you
  need to re-bootstrap — keep this private, valid 24h):

      ${INSTALL_BOOTSTRAP_TOKEN}

  OAuth callback URLs to register in each provider's dashboard:
      Google:           https://${API_DOMAIN}/auth/google/callback
      GitHub (one app): https://${API_DOMAIN}/oauth/github/  ← register parent only
        (sign-in:  /oauth/github/login/callback,
         Copilot:  /oauth/github/copilot/callback,
         repo:     /oauth/github/repo/callback — covered by parent match)

  All secrets are in:  ${INSTALL_DIR}/.env  (mode 600)
═══════════════════════════════════════════════════════════════════

  Web (local):    http://localhost:3000  → HTTP ${WEB_STATUS}
  API (local):    http://localhost:4000  → HTTP ${API_STATUS}
  Public:         https://${DOMAIN}      → HTTP ${CF_STATUS}
  API Public:     https://${API_DOMAIN}
  WebSocket:      wss://${WS_DOMAIN}

  Tunnel:         ${TUNNEL_NAME} (${TUNNEL_ID})

  ── Useful commands ──
  tmux attach -t doable          # View live logs
  systemctl restart doable       # Restart the app
  systemctl restart cloudflared  # Restart the tunnel
  systemctl status doable cloudflared  # Check status
  systemctl list-timers doable-watchdog*  # Watchdog timer
  tail -f /var/log/doable/watchdog.log    # Watchdog log
  ufw status                          # Check firewall rules

BANNER

if [[ "$WEB_STATUS" != "200" ]]; then
  warn "Web server not ready yet — it may still be compiling. Give it a minute."
fi

if [[ "$CF_STATUS" == "000" ]]; then
  warn "Public URL not reachable yet — DNS propagation may take a few minutes."
fi

if [ "$NO_TUNNEL" = "1" ]; then
  echo ""
  echo "  ── NO_TUNNEL smoke test ──"
  echo "  Test with: curl -k https://${HOST}/api/health"
  echo "  The cert is self-signed — browsers will warn. Real-domain installs use"
  echo "  cloudflared + automatic Let's Encrypt."
  echo ""
fi

echo ""
echo "  ── Security ──"
echo "  UFW firewall:   ACTIVE (SSH, 3000, 4000, 4001, 8080)"
echo "  PostgreSQL:     bound to localhost only"
echo "  fail2ban:       SSH brute-force protection active"
echo "  API/WS:         bound to 127.0.0.1 (accessed via Cloudflare Tunnel)"
echo ""
echo "  ── Don't forget ──"
echo "  1. Update Google OAuth redirect URI in GCP Console to:"
echo "     https://${API_DOMAIN}/auth/google/callback"
echo "  2. Add https://${DOMAIN} as an authorized JavaScript origin"
echo "  3. If using GitHub OAuth, register a single OAuth App with parent"
echo "     callback URL (GitHub subdir-match covers all flows):"
echo "     https://${API_DOMAIN}/oauth/github/"
echo ""

# ─── OAuth credential validation ──────────────────────────────
# Loud warnings when integration creds are missing — silent absence has
# burned us before (BUG-PWA-002, BUG-WSI-002 history). For each missing key,
# print exactly what the user needs to do.
echo "  ── Integration credentials check ──"
MISSING=0
check_creds() {
  local feature="$1" key1="$2" val1="$3" url="$4"
  if [[ -z "$val1" ]]; then
    warn "  ❌ ${feature}: ${key1} is empty — feature will NOT work until you set it."
    echo "       Register an OAuth app at ${url}"
    echo "       Then add to /opt/doable/.env and 'systemctl restart doable.service'"
    MISSING=$((MISSING+1))
  else
    ok "  ✓ ${feature}: configured"
  fi
}
check_creds "Google login + integrations" "GOOGLE_CLIENT_ID" "${GOOGLE_CLIENT_ID:-}" "https://console.cloud.google.com/apis/credentials"
check_creds "GitHub login + repo import + Copilot"  "GITHUB_CLIENT_ID" "${GITHUB_CLIENT_ID:-}" "https://github.com/settings/applications/new (callback: https://${API_DOMAIN}/oauth/github/)"
check_creds "Anthropic AI"                "ANTHROPIC_API_KEY" "${ANTHROPIC_API_KEY:-}" "https://console.anthropic.com/settings/keys"
check_creds "OpenAI AI"                   "OPENAI_API_KEY" "${OPENAI_API_KEY:-}" "https://platform.openai.com/api-keys"
check_creds "MiniMax AI"                  "MINIMAX_API_KEY" "${MINIMAX_API_KEY:-}" "https://platform.minimax.io/user-center/payment/token-plan"
check_creds "Stripe billing"              "STRIPE_SECRET_KEY" "${STRIPE_SECRET_KEY:-}" "https://dashboard.stripe.com/apikeys (skip if you want bypass-mode)"
if [ "$MISSING" -gt 0 ]; then
  echo ""
  warn "  ${MISSING} integration(s) are not configured. Doable will run, but those features will return 401/404 to users."
  echo "  Edit /opt/doable/.env to add the missing keys, then restart doable.service."
fi
echo ""

# ─── SECURITY POSTURE VERIFY ──────────────────────────────────
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                 Security Posture Check                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  ── systemd-analyze security (doable.service) ──"
systemd-analyze security doable.service 2>/dev/null | tail -2 || \
  echo "  (systemd-analyze not available or service not loaded yet)"
echo ""
echo "  ── .env permissions ──"
stat -c '%a %U:%G %n' "${INSTALL_DIR}/.env" 2>/dev/null || \
  echo "  (${INSTALL_DIR}/.env not found)"
echo ""
echo "  ── Runtime process users ──"
ps -eo user,cmd 2>/dev/null | grep -E '(tsx|next-server|node).*(services/(api|web|ws))' | \
  grep -v grep | head -5 || echo "  (services not started yet)"
echo ""
echo "  ── Summary ──"
ENV_MODE=$(stat -c '%a' "${INSTALL_DIR}/.env" 2>/dev/null || echo "???")
ENV_OWNER=$(stat -c '%U' "${INSTALL_DIR}/.env" 2>/dev/null || echo "???")
SVC_USER=$(systemctl show doable.service -p User --value 2>/dev/null || echo "???")
if [ "$SVC_USER" = "doable" ] && [ "$ENV_OWNER" = "doable" ] && [ "$ENV_MODE" = "600" ]; then
  ok "NON-ROOT ✓  doable.service runs as 'doable' | .env mode 600 owned by doable"
else
  warn "SECURITY POSTURE: svc_user=${SVC_USER} env_owner=${ENV_OWNER} env_mode=${ENV_MODE} — check above"
fi
echo ""

echo "╔══════════════════════════════════════════════════════════╗"
echo "║              Recommended /admin smoke                    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  After signing up the first user and granting platform_admin,"
echo "  run this against YOUR domain to catch BUG-ADMIN-012-class"
echo "  regressions on every release. Fully domain-agnostic — works"
echo "  for any fork on any domain:"
echo ""
echo "    API_BASE=https://${API_SUB:-api}.${DOMAIN} \\"
echo "    ADMIN_EMAIL=<your-admin-email> \\"
echo "    ADMIN_PASSWORD='<password>' \\"
echo "    pnpm smoke:admin"
echo ""
echo "  Exit 0 = /admin is healthy. Exit 1 = /admin would crash."
echo "  Safe to wire into any post-deploy pipeline."
echo ""
