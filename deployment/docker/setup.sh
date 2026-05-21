#!/usr/bin/env bash
# ==============================================================================
# Doable — Self-hosting setup script
# ==============================================================================
# Sets up everything needed to run Doable with Docker Compose + nginx + SSL.
# nginx ALWAYS sits in front of services. Services NEVER bind to 0.0.0.0.
#
# Usage:
#   # Public domain (Let's Encrypt SSL):
#   DOMAIN=app.example.com ./deployment/docker/setup.sh
#
#   # Private network / LAN (self-signed SSL for an IP address):
#   HOST=192.168.1.50 ./deployment/docker/setup.sh
#
#   # Localhost only (self-signed SSL on 127.0.0.1):
#   ./deployment/docker/setup.sh
#
#   # Skip Let's Encrypt (e.g. behind Cloudflare proxy):
#   DOMAIN=app.example.com ./deployment/docker/setup.sh --skip-ssl
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$SCRIPT_DIR/.env"
# Pre-built (pulls from ghcr.io) vs source-build (5-10min). Default = source.
# Set DOABLE_PREBUILT=true (or pass --prebuilt) to use the published images
# instead — ~30s install. Overridable per-invocation.
if [ "${DOABLE_PREBUILT:-false}" = "true" ]; then
  COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
else
  COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
fi
SELF_SIGNED_DIR="/etc/ssl/doable"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

# ─── Parse args ───────────────────────────────────────────────────────────────
SKIP_SSL=false
INSTALL_TRUST=false
for arg in "$@"; do
  case "$arg" in
    --skip-ssl)       SKIP_SSL=true ;;
    --prebuilt)       COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml" ;;
    --install-trust)  INSTALL_TRUST=true ;;
    --help|-h)
      echo "Usage: [DOMAIN=app.example.com | HOST=192.168.1.50] $0 [--skip-ssl] [--prebuilt] [--install-trust]"
      echo ""
      echo "Options:"
      echo "  --skip-ssl       Set up nginx but skip Let's Encrypt (e.g. behind Cloudflare)"
      echo "  --prebuilt       Pull pre-built images from ghcr.io instead of building from"
      echo "                   source (~30s install vs ~5-10min build). Equivalent to"
      echo "                   setting DOABLE_PREBUILT=true."
      echo "  --install-trust  In HOST mode, force-install the self-signed cert into this"
      echo "                   machine's OS+browser trust stores. Default in HOST mode is to"
      echo "                   skip because the browser is usually on a DIFFERENT laptop."
      echo "                   Equivalent to DOABLE_INSTALL_TRUST=1. (localhost mode always"
      echo "                   installs trust; domain mode never does — LE cert is already"
      echo "                   publicly trusted.)"
      echo ""
      echo "Environment variables:"
      echo "  DOMAIN                  Your domain name — uses Let's Encrypt for SSL"
      echo "  HOST                    IP or hostname for private network — self-signed SSL"
      echo "  EMAIL                   Email for Let's Encrypt notifications (optional)"
      echo "  DOABLE_PREBUILT         Set to 'true' to pull from ghcr.io (same as --prebuilt)"
      echo "  DOABLE_IMAGE_TAG        Image tag to pull (default: latest; use v1.2.3 to pin)"
      echo "  DOABLE_INSTALL_TRUST    Set to '1' to force-install host-mode trust (same as"
      echo "                          --install-trust)"
      echo ""
      echo "If neither DOMAIN nor HOST is set, defaults to localhost with self-signed SSL."
      echo "Localhost mode ALWAYS auto-installs the cert into your OS+browser trust stores;"
      echo "the browser opens https://localhost without any \"connection not private\" warning."
      exit 0
      ;;
  esac
done

# ─── Check prerequisites ─────────────────────────────────────────────────────
info "Checking prerequisites..."

# Auto-install docker + compose-plugin on debian/ubuntu when missing.
# Keeps the new-user one-liner truly one-line on a fresh OS — no detour to
# docs.docker.com/install before being able to run setup.sh.
if ! command -v docker &>/dev/null || ! docker compose version &>/dev/null; then
  if [ "${DOABLE_SKIP_DOCKER_INSTALL:-0}" = "1" ]; then
    error "Docker (or compose plugin) is not installed and DOABLE_SKIP_DOCKER_INSTALL=1 — refusing auto-install."
    exit 1
  fi
  if [ "$(id -u)" -ne 0 ]; then
    error "Docker is not installed and this script is not running as root — re-run with sudo or install Docker first (https://docs.docker.com/engine/install/)."
    exit 1
  fi
  if ! command -v apt-get &>/dev/null; then
    error "Docker is not installed and this isn't a debian/ubuntu box (no apt-get). Install Docker manually: https://docs.docker.com/engine/install/"
    exit 1
  fi
  info "Docker missing — installing docker.io + compose v2 via apt (Ubuntu/Debian)..."
  warn "Ubuntu's docker.io package typically lags upstream Docker CE by several minor versions."
  warn "  For a production self-host, install Docker CE from https://get.docker.com first, then re-run this script."
  warn "  Continuing with apt docker.io in 5s — Ctrl-C to abort."
  sleep 5
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  # Ubuntu ships compose v2 as `docker-compose-v2`; Docker Inc.'s official
  # repo (which ubuntu may have layered in) calls the same plugin
  # `docker-compose-plugin`. Try both names — first match wins.
  apt-get install -y -qq docker.io
  if ! apt-get install -y -qq docker-compose-v2 2>/dev/null; then
    apt-get install -y -qq docker-compose-plugin 2>/dev/null || {
      error "Could not install docker compose v2 (tried docker-compose-v2 + docker-compose-plugin). Install manually: https://docs.docker.com/compose/install/"
      exit 1
    }
  fi
  systemctl enable --now docker
  ok "Docker $(docker --version 2>/dev/null || echo '?') + compose $(docker compose version 2>/dev/null | head -1 || echo '?') installed"
fi

ok "Docker and Docker Compose found"

# ─── Disk-space precheck (BUG-R25-DOCKER-002) ────────────────────────────────
# Source builds peak around 22 GB of intermediate layers (pnpm install + nx
# build for web/api/ws). On a stock 30 GB Hetzner box this is enough to fill
# the disk mid-extract and surface as "no space left on device" while
# rebuilding the api image. --prebuilt path only needs the pulled images
# (~3 GB). Refuse to start when we know we'll exhaust the disk rather than
# leave the operator with a half-baked install.
if command -v df &>/dev/null; then
  DOCKER_DATA_ROOT=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo "/var/lib/docker")
  # Check the FS that holds the docker root; fall back to / if df can't
  # resolve the path (e.g. docker daemon not yet up).
  AVAIL_KB=$(df --output=avail "$DOCKER_DATA_ROOT" 2>/dev/null | tail -1 | tr -d ' ' || \
             df --output=avail / 2>/dev/null | tail -1 | tr -d ' ')
  AVAIL_GB=$(( AVAIL_KB / 1024 / 1024 ))
  case "${COMPOSE_FILE##*/}" in
    docker-compose.prod.yml) MIN_GB=5  ;; # pulled images only
    *)                       MIN_GB=25 ;; # source build peak
  esac
  if [ "$AVAIL_GB" -lt "$MIN_GB" ]; then
    error "Only ${AVAIL_GB} GB free on $(df --output=target "$DOCKER_DATA_ROOT" 2>/dev/null | tail -1 || echo /) — Doable needs at least ${MIN_GB} GB."
    if [ "$MIN_GB" = "25" ]; then
      error "Source builds peak around 22 GB; either free disk (docker system prune -af) or re-run with DOABLE_PREBUILT=true once ghcr images are public."
    fi
    error "Override with DOABLE_SKIP_DISK_CHECK=1 if you know what you're doing."
    [ "${DOABLE_SKIP_DISK_CHECK:-0}" = "1" ] || exit 1
  else
    ok "Disk space: ${AVAIL_GB} GB free on docker root (need >=${MIN_GB} GB)"
  fi
fi

# ─── Determine mode ───────────────────────────────────────────────────────────
# Three modes:
#   1. DOMAIN= set        → public domain, Let's Encrypt SSL
#   2. HOST= set           → private network IP/hostname, self-signed SSL
#   3. Neither             → localhost, self-signed SSL
#
# In ALL modes, nginx sits in front. Services ALWAYS bind to 127.0.0.1.

MODE=""
LISTEN_HOST=""  # What nginx's server_name will be
# HOST_EXPLICIT=1 when the operator explicitly chose a host (via DOMAIN/HOST env
# var or by typing one at the interactive prompt). Used below to gate the
# auto-rewrite of stale URL lines in a pre-existing .env.
HOST_EXPLICIT=0

if [ -n "${DOMAIN:-}" ]; then
  MODE="domain"
  LISTEN_HOST="$DOMAIN"
  HOST_EXPLICIT=1
  info "Domain mode — Let's Encrypt SSL for ${DOMAIN}"
elif [ -n "${HOST:-}" ]; then
  MODE="host"
  LISTEN_HOST="$HOST"
  HOST_EXPLICIT=1
  info "Private network mode — self-signed SSL for ${HOST}"
else
  echo ""
  echo "No DOMAIN or HOST specified."
  echo "  DOMAIN=app.example.com  → public domain with Let's Encrypt"
  echo "  HOST=192.168.1.50       → private network with self-signed SSL"
  echo ""
  read -rp "Enter domain, IP, or press Enter for localhost: " USER_INPUT
  if [ -z "$USER_INPUT" ]; then
    MODE="localhost"
    LISTEN_HOST="localhost"
    info "Localhost mode — self-signed SSL on localhost"
  elif echo "$USER_INPUT" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    MODE="host"
    LISTEN_HOST="$USER_INPUT"
    HOST_EXPLICIT=1
    info "Private network mode — self-signed SSL for ${LISTEN_HOST}"
  else
    MODE="domain"
    LISTEN_HOST="$USER_INPUT"
    DOMAIN="$USER_INPUT"
    HOST_EXPLICIT=1
    info "Domain mode — Let's Encrypt SSL for ${LISTEN_HOST}"
  fi
fi

# ─── URL variables (used for .env and final output) ─────────────────────────
API_URL="https://${LISTEN_HOST}/api"
WS_URL="wss://${LISTEN_HOST}/ws"
APP_URL="https://${LISTEN_HOST}"
CORS="https://${LISTEN_HOST}"

# ─── Generate .env ────────────────────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  warn ".env already exists at $ENV_FILE"
  # Non-TTY (piped SSH) or DOABLE_KEEP_ENV=1 → keep existing without prompting
  if [ ! -t 0 ] || [ "${DOABLE_KEEP_ENV:-0}" = "1" ]; then
    info "Keeping existing .env (non-interactive or DOABLE_KEEP_ENV=1)"
  else
    read -rp "Overwrite? [y/N] " overwrite
    if [[ ! "$overwrite" =~ ^[Yy] ]]; then
      info "Keeping existing .env"
    else
      rm "$ENV_FILE"
    fi
  fi
fi

# ─── Auto-rewrite stale URL lines on DOMAIN change ───────────────────────────
# If we kept an existing .env above AND the operator explicitly passed a new
# DOMAIN/HOST that differs from what's baked in, rewrite the 4 URL lines in
# place so containers come up with correct hostnames. Secrets stay untouched.
# DOABLE_KEEP_ENV=1 is the operator's explicit "leave everything alone" override
# and wins over this auto-rewrite. Uses awk (not sed) to avoid replacement-
# metachar escaping pitfalls when URLs contain &, /, or other sed-special chars.
if [ -f "$ENV_FILE" ] \
   && [ "$HOST_EXPLICIT" = "1" ] \
   && [ "${DOABLE_KEEP_ENV:-0}" != "1" ]; then
  EXISTING_APP_URL=$(grep -E '^NEXT_PUBLIC_APP_URL=' "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true)
  if [ -n "$EXISTING_APP_URL" ] && [ "$EXISTING_APP_URL" != "$APP_URL" ]; then
    info "Detected DOMAIN change: ${EXISTING_APP_URL} → ${APP_URL}. Rewriting NEXT_PUBLIC_* + CORS_ORIGINS in place..."
    BAK_FILE="${ENV_FILE}.bak.$(date -u +%Y%m%d-%H%M%S)"
    cp -p "$ENV_FILE" "$BAK_FILE"
    TMP_ENV="${ENV_FILE}.rewrite.$$"
    awk -v api="$API_URL" -v ws="$WS_URL" -v app="$APP_URL" -v cors="$CORS" '
      /^NEXT_PUBLIC_API_URL=/  { print "NEXT_PUBLIC_API_URL=" api;  next }
      /^NEXT_PUBLIC_WS_URL=/   { print "NEXT_PUBLIC_WS_URL="  ws;   next }
      /^NEXT_PUBLIC_APP_URL=/  { print "NEXT_PUBLIC_APP_URL=" app;  next }
      /^CORS_ORIGINS=/         { print "CORS_ORIGINS="        cors; next }
      { print }
    ' "$ENV_FILE" > "$TMP_ENV"
    # Preserve mode 600 from the backup we just took.
    chmod --reference="$BAK_FILE" "$TMP_ENV" 2>/dev/null || chmod 600 "$TMP_ENV"
    mv "$TMP_ENV" "$ENV_FILE"
    ok "Rewrote NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL, NEXT_PUBLIC_APP_URL, CORS_ORIGINS in $ENV_FILE (backup: ${BAK_FILE})"
  fi
fi

if [ ! -f "$ENV_FILE" ]; then
  # Fresh .env means fresh secrets. If a postgres_data volume already exists
  # from a previous install, it has the OLD password — Postgres ignores
  # POSTGRES_PASSWORD on subsequent boots (only honored on first boot of an
  # empty data dir), so migrate fails with "password authentication failed
  # for user doable" and the api/ws/web containers never come up. The fresh
  # JWT_SECRET / ENCRYPTION_KEY / DOABLE_KEK would also invalidate every
  # encrypted column in the old DB. Bundle the volume-wipe with the secret
  # rotation so they always cohere.
  if docker volume ls -q 2>/dev/null | grep -qE '_postgres_data$'; then
    warn "Pre-existing postgres_data volume detected — its password won't match the fresh .env we're about to generate."
    warn "Wiping postgres + api + ws + thumbnails volumes to avoid an authentication mismatch."
    docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
    # Belt-and-suspenders: down -v only removes volumes attached to THIS
    # compose project. Sweep any leftover *_postgres_data volume from a
    # previous compose-project name (e.g. an earlier `docker/` reorg cycle).
    for v in $(docker volume ls -q | grep -E '_(postgres_data|api_projects|api_thumbnails|ws_projects)$' || true); do
      docker volume rm -f "$v" 2>/dev/null || true
    done
    ok "Cleared previous-install volumes"
  fi

  info "Generating deployment/docker/.env with random secrets..."

  JWT_SECRET=$(openssl rand -hex 32)
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  INTERNAL_SECRET=$(openssl rand -hex 32)
  PG_PASSWORD=$(openssl rand -hex 16)
  # Separate password for the runtime-only `doable_app` postgres role.
  # 02-roles.sh creates the role at first volume init using this value;
  # docker-compose.yml api+ws connect as doable_app (non-superuser, no DDL)
  # while migrate keeps the superuser `doable` role for schema changes.
  DOABLE_APP_PASSWORD=$(openssl rand -hex 16)
  INSTALL_BOOTSTRAP_TOKEN=$(openssl rand -hex 32)
  # DOABLE_KEK is the envelope-encryption key used by the API for wizard-saved
  # secrets (AI provider keys, OAuth client secrets, Stripe). docker-compose.yml
  # marks it required (${DOABLE_KEK:?...}) so the API container refuses to
  # start without it — generate it here, never roll it (rolling = data loss).
  DOABLE_KEK=$(openssl rand -base64 32)
  # Bootstrap token TTL: 24h from install. After this, the empty-users-table
  # gate still works for true greenfield installs, but the token itself stops
  # being accepted on signup.
  if date -u -d '+24 hours' +%Y-%m-%dT%H:%M:%SZ >/dev/null 2>&1; then
    INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT=$(date -u -d '+24 hours' +%Y-%m-%dT%H:%M:%SZ)
  else
    # macOS / BSD date fallback
    INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT=$(date -u -v+24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")
  fi

  cat > "$ENV_FILE" <<EOF
# Generated by setup.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Host: ${LISTEN_HOST}

# ─── Secrets ───────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
INTERNAL_SECRET=${INTERNAL_SECRET}
DOABLE_KEK=${DOABLE_KEK}

# ─── First-run bootstrap (single-use; auto-closes after first signup) ───
# When the users table is empty AND the first signup presents this token
# (or simply signs up — empty table is enough), they become platform owner
# automatically. After that signup completes, platform_config.bootstrap_completed_at
# is set and this path is permanently closed (server-side).
INSTALL_BOOTSTRAP_TOKEN=${INSTALL_BOOTSTRAP_TOKEN}
INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT=${INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT}

# ─── Database ──────────────────────────────────────
POSTGRES_USER=doable
POSTGRES_PASSWORD=${PG_PASSWORD}
POSTGRES_DB=doable
# Runtime-only role for api+ws. Cannot CREATE/DROP/ALTER (no DDL). On a
# compromise of the api container, the attacker is bounded to CRUD on
# rows the app already owns — no schema escalation, no extension install,
# no role grants. Migrate keeps using POSTGRES_USER above (owner).
DOABLE_APP_PASSWORD=${DOABLE_APP_PASSWORD}

# ─── URLs ──────────────────────────────────────────
NEXT_PUBLIC_API_URL=${API_URL}
NEXT_PUBLIC_WS_URL=${WS_URL}
NEXT_PUBLIC_APP_URL=${APP_URL}
CORS_ORIGINS=${CORS}
# WS_ALLOWED_ORIGINS guards the Yjs/HMR WebSocket upgrade. Must include every
# public-facing origin the browser will send. Was missing on docker installs
# and silently broke collab + ai-trace stream.
WS_ALLOWED_ORIGINS=${CORS}

# ─── Redis (optional) ─────────────────────────────
REDIS_URL=

# ─── AI providers (set ANY ONE for first-boot pre-config) ─────────
# Doable supports 50+ providers via the setup wizard at /setup (see
# packages/shared/src/ai/provider-catalog.ts for the full list, including
# Azure/Bedrock/Vertex/Ollama/LM Studio/etc.). The keys below are the ones
# whose env vars get seeded into the wizard automatically by
# services/api/src/lib/seedAiProviderFromEnv.ts. Honours pre-export from
# the host shell — if you exported any of these before running setup.sh,
# they're already filled in here.
#
# Precedence on first boot: SOURCES order in seedAiProviderFromEnv.ts —
# Anthropic > OpenAI > Gemini > OpenRouter > Together > Fireworks
# > OpenCode Zen > Groq > Cerebras > DeepSeek > Mistral > Cohere > xAI
# > Perplexity > DeepInfra > NVIDIA > MiniMax > Moonshot > Zhipu.
# First non-empty wins.
#
# These are ALL bring-your-own-key (BYOK). Doable does NOT bundle, ship,
# or proxy any third-party API keys — the operator obtains the key from
# the provider directly. Local providers (Ollama, LM Studio, vLLM,
# llama.cpp, Jan, LocalAI, etc.) need no API key and are configured via
# the wizard with their own base URL.
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
GEMINI_API_KEY=${GEMINI_API_KEY:-}
MINIMAX_API_KEY=${MINIMAX_API_KEY:-}
OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-}
TOGETHER_API_KEY=${TOGETHER_API_KEY:-}
FIREWORKS_API_KEY=${FIREWORKS_API_KEY:-}
OPENCODE_ZEN_API_KEY=${OPENCODE_ZEN_API_KEY:-}
GROQ_API_KEY=${GROQ_API_KEY:-}
CEREBRAS_API_KEY=${CEREBRAS_API_KEY:-}
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-}
MISTRAL_API_KEY=${MISTRAL_API_KEY:-}
COHERE_API_KEY=${COHERE_API_KEY:-}
XAI_API_KEY=${XAI_API_KEY:-}
PERPLEXITY_API_KEY=${PERPLEXITY_API_KEY:-}
DEEPINFRA_API_KEY=${DEEPINFRA_API_KEY:-}
NVIDIA_API_KEY=${NVIDIA_API_KEY:-}
MOONSHOT_API_KEY=${MOONSHOT_API_KEY:-}
ZHIPU_API_KEY=${ZHIPU_API_KEY:-}

# ─── OAuth (optional) ─────────────────────────────
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ─── Stripe (optional) ────────────────────────────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
EOF

  # deployment/docker/.env holds DB password, JWT secret, encryption key, KEK and any
  # operator-supplied AI / OAuth / Stripe keys — restrict to owner-only read.
  # env-perms-check.ts at services/api/src/lib/env-perms-check.ts warns on every
  # boot if this is group/world-readable; setting 600 here silences the warning
  # AND protects against unprivileged accounts reading secrets off disk.
  chmod 600 "$ENV_FILE"
  ok "Created deployment/docker/.env with generated secrets (mode 600)"
fi

# ─── Idempotent back-fill: existing .env from a pre-DOABLE_KEK install ────────
# If the operator chose to keep an existing .env above, it may pre-date the
# DOABLE_KEK requirement. Back-fill the line without clobbering anything else,
# so re-running setup.sh on an older install doesn't break docker compose up.
if [ -f "$ENV_FILE" ] && ! grep -qE '^DOABLE_KEK=.+' "$ENV_FILE"; then
  NEW_KEK=$(openssl rand -base64 32)
  if grep -qE '^DOABLE_KEK=' "$ENV_FILE"; then
    # Empty assignment present — replace in place
    sed -i.bak -E "s|^DOABLE_KEK=.*|DOABLE_KEK=${NEW_KEK}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    printf '\n# Added by setup.sh back-fill (%s)\nDOABLE_KEK=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$NEW_KEK" >> "$ENV_FILE"
  fi
  # Re-assert 0600 — the editing path above (sed/append) may have inherited
  # broader perms from an older install where chmod 600 was never set.
  chmod 600 "$ENV_FILE"
  ok "Back-filled DOABLE_KEK in existing $ENV_FILE (mode 600)"
fi

# ─── Idempotent back-fill: DOABLE_APP_PASSWORD on pre-R34-followup installs ───
# Existing installs from before this branch have a postgres data volume with
# only the `doable` role. Back-filling the password lets `setup.sh` write a
# value into .env, but the role itself doesn't exist yet — 02-roles.sh only
# runs on a FRESH volume init. So on an upgrade we ALSO need to create the
# role inside the running postgres container. The `docker exec` block below
# is a no-op if postgres isn't running yet (fresh install path took the
# branch above and 02-roles.sh will pick up the value).
if [ -f "$ENV_FILE" ] && ! grep -qE '^DOABLE_APP_PASSWORD=.+' "$ENV_FILE"; then
  NEW_APP_PWD=$(openssl rand -hex 16)
  if grep -qE '^DOABLE_APP_PASSWORD=' "$ENV_FILE"; then
    sed -i.bak -E "s|^DOABLE_APP_PASSWORD=.*|DOABLE_APP_PASSWORD=${NEW_APP_PWD}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    printf '\n# Added by setup.sh back-fill (%s) — runtime-only postgres role for api+ws\nDOABLE_APP_PASSWORD=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$NEW_APP_PWD" >> "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
  ok "Back-filled DOABLE_APP_PASSWORD in existing $ENV_FILE (mode 600)"

  # If postgres is already running with an old data volume, manually CREATE the
  # role using the just-back-filled password. 02-roles.sh won't fire again
  # because postgres init only runs on a virgin data dir.
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^doable-postgres$'; then
    info "Existing postgres container detected — applying doable_app role to live DB..."
    PG_USER=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo doable)
    PG_DB=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo doable)
    # Mirrors 02-roles.sh: psql doesn't substitute :'app_pwd' inside DO $$ ... $$
    # blocks, so we SET a server-side GUC first and read it back via
    # current_setting inside the DO body.
    if docker exec -i doable-postgres \
        psql -U "$PG_USER" -d "$PG_DB" \
          -v ON_ERROR_STOP=1 \
          --set "app_pwd=$NEW_APP_PWD" >/dev/null 2>&1 <<PSQL
SET doable.app_pwd = :'app_pwd';
DO \$\$
DECLARE
  v_pwd text := current_setting('doable.app_pwd', true);
BEGIN
  IF v_pwd IS NULL OR length(v_pwd) = 0 THEN
    RAISE EXCEPTION 'doable.app_pwd GUC is empty';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'doable_app') THEN
    EXECUTE format('CREATE ROLE doable_app LOGIN PASSWORD %L', v_pwd);
  ELSE
    EXECUTE format('ALTER ROLE doable_app WITH PASSWORD %L', v_pwd);
  END IF;
END\$\$;
RESET doable.app_pwd;
GRANT CONNECT ON DATABASE doable TO doable_app;
GRANT USAGE ON SCHEMA public TO doable_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO doable_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO doable_app;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA public TO doable_app;
ALTER DEFAULT PRIVILEGES FOR ROLE doable IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO doable_app;
ALTER DEFAULT PRIVILEGES FOR ROLE doable IN SCHEMA public GRANT USAGE, SELECT                  ON SEQUENCES TO doable_app;
ALTER DEFAULT PRIVILEGES FOR ROLE doable IN SCHEMA public GRANT EXECUTE                        ON FUNCTIONS TO doable_app;
PSQL
    then
      ok "Created/updated doable_app role on live postgres (api+ws will use it on next restart)"
    else
      warn "Could not auto-apply doable_app role to live postgres — run 02-roles.sh by hand or"
      warn "  docker compose down -v && setup.sh (will wipe DB and recreate from scratch)."
    fi
  fi
fi

# ─── Set up nginx + SSL ──────────────────────────────────────────────────────
# nginx is ALWAYS set up. Services never face the network directly.

info "Setting up nginx reverse proxy for ${LISTEN_HOST}..."

# Free :80 and :443 before installing nginx. If the box was previously running
# the bare-metal NO_TUNNEL path, caddy is already bound to both ports and nginx
# will fail to start with EADDRINUSE. Stop+disable any other web server we know
# about — purely a no-op on a fresh box.
for svc in caddy apache2 lighttpd; do
  if systemctl is-active --quiet "$svc"; then
    info "Stopping conflicting web server: $svc (was bound to :80/:443)"
    systemctl stop "$svc" 2>/dev/null || true
    systemctl disable "$svc" 2>/dev/null || true
  fi
done

# Same for doable.service — its tmux session may hold node processes that
# bind 127.0.0.1:3000/4000/4001 (web/api/ws). Docker compose will rebind the
# same ports inside the container, so we stop the bare-metal copy first.
if systemctl is-active --quiet doable; then
  info "Stopping bare-metal doable.service (was using ports 3000/4000/4001)"
  systemctl stop doable 2>/dev/null || true
  systemctl disable doable 2>/dev/null || true
fi

# Native postgres holds 127.0.0.1:5432 on any box that ran the bare-metal
# server-setup.sh path. Docker compose maps 127.0.0.1:5432 -> postgres:5432
# inside the container, so the host bind fails with EADDRINUSE if native
# postgres is up. The docker postgres container will be the new source of
# truth; the native one is no longer needed.
if systemctl is-active --quiet postgresql; then
  info "Stopping native postgresql (was holding 127.0.0.1:5432 — docker postgres takes over)"
  systemctl stop postgresql 2>/dev/null || true
  systemctl disable postgresql 2>/dev/null || true
fi

# Install nginx if not present
if ! command -v nginx &>/dev/null; then
  info "Installing nginx..."
  apt-get update -qq
  apt-get install -y -qq nginx
  ok "Installed nginx"
fi

# ─── SSL certificates ────────────────────────────────────────────────────────
SSL_CERT=""
SSL_KEY=""

if [ "$MODE" = "domain" ] && [ "$SKIP_SSL" = false ]; then
  # Let's Encrypt for public domains
  if ! command -v certbot &>/dev/null; then
    info "Installing certbot..."
    apt-get install -y -qq certbot python3-certbot-nginx
    ok "Installed certbot"
  fi

  # Temporary HTTP-only config for cert issuance
  NGINX_CONF="/etc/nginx/sites-available/${LISTEN_HOST}"
  cat > "$NGINX_CONF" <<HTTPEOF
server {
    listen 80;
    server_name ${LISTEN_HOST};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
HTTPEOF
  ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/${LISTEN_HOST}"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl enable --now nginx && systemctl reload-or-restart nginx

  EMAIL_FLAG=""
  if [ -n "${EMAIL:-}" ]; then
    EMAIL_FLAG="-m $EMAIL"
  elif [ -t 0 ]; then
    # Interactive — give the operator one chance to supply an address so the
    # account gets expiry-warning emails. Let's Encrypt is also moving away
    # from supporting email-less accounts entirely, so encourage entry.
    echo ""
    echo "Let's Encrypt strongly recommends registering with an email address —"
    echo "you'll get warning emails ~20 days before the cert expires, and LE may"
    echo "stop accepting email-less registrations in future."
    read -rp "Email for Let's Encrypt notices (blank to skip): " USER_EMAIL
    if [ -n "$USER_EMAIL" ]; then
      EMAIL_FLAG="-m $USER_EMAIL"
    else
      EMAIL_FLAG="--register-unsafely-without-email"
      warn "No email — you will not receive expiry notices for ${LISTEN_HOST}."
    fi
  else
    EMAIL_FLAG="--register-unsafely-without-email"
    warn "EMAIL env not set and stdin is non-interactive — registering Let's Encrypt account WITHOUT recovery address."
    warn "  Re-run with EMAIL=you@example.com ./deployment/docker/setup.sh to register properly."
  fi

  info "Requesting Let's Encrypt certificate for ${LISTEN_HOST}..."
  certbot certonly --webroot -w /var/www/html -d "$LISTEN_HOST" $EMAIL_FLAG --agree-tos --non-interactive

  SSL_CERT="/etc/letsencrypt/live/${LISTEN_HOST}/fullchain.pem"
  SSL_KEY="/etc/letsencrypt/live/${LISTEN_HOST}/privkey.pem"
  ok "SSL certificate obtained via Let's Encrypt"

else
  # Self-signed for private network / localhost / --skip-ssl
  if [ "$MODE" = "domain" ] && [ "$SKIP_SSL" = true ]; then
    info "Skipping Let's Encrypt (--skip-ssl). Generating self-signed certificate..."
  else
    info "Generating self-signed SSL certificate for ${LISTEN_HOST}..."
  fi

  mkdir -p "$SELF_SIGNED_DIR"
  SSL_CERT="${SELF_SIGNED_DIR}/cert.pem"
  SSL_KEY="${SELF_SIGNED_DIR}/key.pem"

  # ─── Try mkcert first (browser-trusted certs via local CA) ──────────────
  # mkcert generates a single local CA and installs it into every OS+browser
  # trust store on the box. The CA is permanent — every future Doable
  # install on this machine (re-running setup.sh, fresh DBs, etc.) gets
  # browser-trusted certs without re-running the trust install.
  # Trade-off vs raw openssl: one ~5MB binary download from upstream GH,
  # but mkcert handles WSL→Windows interop + Firefox NSS more robustly
  # than our ad-hoc install_localhost_trust below. We try mkcert first
  # and fall back to openssl + install_localhost_trust on failure.
  MKCERT_OK=false
  # Skip mkcert in HOST mode unless operator opted in (same gate as
  # install_localhost_trust below — server ≠ browser by default)
  WANT_TRUST=false
  case "$MODE" in
    localhost) WANT_TRUST=true ;;
    host)
      [ "${DOABLE_INSTALL_TRUST:-0}" = "1" ] && WANT_TRUST=true
      [ "$INSTALL_TRUST" = "true" ] && WANT_TRUST=true
      ;;
  esac

  if [ "$WANT_TRUST" = "true" ] && [ ! -f "$SSL_CERT" ]; then
    ensure_mkcert() {
      command -v mkcert &>/dev/null && return 0
      local os arch
      os="$(uname -s | tr '[:upper:]' '[:lower:]')"
      case "$(uname -m)" in
        x86_64|amd64)   arch=amd64 ;;
        aarch64|arm64)  arch=arm64 ;;
        *)              return 1 ;;
      esac
      local url="https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-${os}-${arch}"
      info "Downloading mkcert (one-time, ${url##*/})..."
      if curl -fsSL -o /usr/local/bin/mkcert "$url" 2>/dev/null && chmod +x /usr/local/bin/mkcert; then
        command -v mkcert &>/dev/null
      else
        rm -f /usr/local/bin/mkcert
        return 1
      fi
    }

    if ensure_mkcert; then
      info "Installing mkcert local CA (one-time, all browsers + OS stores)..."
      if mkcert -install >/dev/null 2>&1; then
        info "Issuing browser-trusted cert via mkcert for ${LISTEN_HOST}..."
        if mkcert -cert-file "$SSL_CERT" -key-file "$SSL_KEY" "$LISTEN_HOST" localhost 127.0.0.1 ::1 >/dev/null 2>&1; then
          chmod 644 "$SSL_CERT"; chmod 600 "$SSL_KEY"
          MKCERT_OK=true
          ok "mkcert cert installed (https://${LISTEN_HOST} will be trusted by all browsers on this machine)"
        else
          warn "mkcert leaf-cert issuance failed — falling back to openssl + install_localhost_trust"
        fi
      else
        warn "mkcert -install failed (CA install) — falling back to openssl"
      fi
    else
      info "mkcert not available — using openssl + install_localhost_trust fallback"
    fi
  fi

  if [ "$MKCERT_OK" = "true" ]; then
    : # cert + key already in place via mkcert; trust already wired
  elif [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
    warn "Self-signed certificate already exists at ${SELF_SIGNED_DIR}. Keeping it."
  else
    # Build SAN extension based on whether it's an IP or hostname
    SAN_EXT=""
    if echo "$LISTEN_HOST" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
      SAN_EXT="subjectAltName=IP:${LISTEN_HOST}"
    else
      SAN_EXT="subjectAltName=DNS:${LISTEN_HOST}"
    fi

    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout "$SSL_KEY" -out "$SSL_CERT" \
      -days 365 -subj "/CN=${LISTEN_HOST}" \
      -addext "$SAN_EXT"

    chmod 600 "$SSL_KEY"
    chmod 644 "$SSL_CERT"
    ok "Self-signed certificate created at ${SELF_SIGNED_DIR}/"
  fi

  # ─── Auto-trust the cert on the host OS (localhost mode only) ────────────
  # Goal: zero manual cert install. After this block the browser opens
  # https://${LISTEN_HOST} without a warning.
  # Strategy:
  #   - Linux (Debian/Ubuntu): copy to /usr/local/share/ca-certificates/ +
  #     update-ca-certificates; NSS-import for Chrome/Firefox if present.
  #   - Linux (Fedora/RHEL): copy to /etc/pki/ca-trust/source/anchors/ +
  #     update-ca-trust; NSS-import too.
  #   - macOS: security add-trusted-cert into System keychain.
  #   - WSL (setup.sh inside WSL but browser is Windows): use powershell.exe
  #     interop to import into Windows CurrentUser\Root AND set the Chrome
  #     policy that makes Chrome 105+ consult Windows root store.
  # Idempotent — re-running setup.sh after the cert is already trusted is
  # a no-op except for a single "already trusted" log line.
  install_localhost_trust() {
    local cert="$1"
    if [ ! -f "$cert" ]; then return 0; fi
    # localhost mode: server == browser by definition, always auto-trust.
    # host mode (LAN IP / remote server): operator usually browses from a
    # different laptop, so installing into the SERVER's trust store doesn't
    # help. Skip by default; opt in via DOABLE_INSTALL_TRUST=1 or --install-trust
    # for the rare same-machine HOST case.
    case "$MODE" in
      localhost) : ;;  # always run
      host)
        if [ "${DOABLE_INSTALL_TRUST:-0}" != "1" ] && [ "${INSTALL_TRUST:-false}" != "true" ]; then
          info "HOST mode: skipping auto-trust install (server ≠ browser by default)."
          info "  → Copy ${cert} to your browser machine and follow"
          info "    ${SELF_SIGNED_DIR}/cert-install-instructions.md, OR re-run with"
          info "    DOABLE_INSTALL_TRUST=1 if the browser IS on this same box."
          return 0
        fi
        ;;
      *) return 0 ;;  # domain mode never needs auto-trust (LE cert)
    esac

    # WSL detection — when setup.sh runs inside WSL2 (Windows users' docker
    # path) the browser is on the Windows side and needs the cert in
    # Windows trust store, not the WSL Linux store.
    local is_wsl=0
    if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null \
       || [ -n "${WSL_DISTRO_NAME:-}" ] \
       || [ -f /proc/sys/fs/binfmt_misc/WSLInterop ]; then
      is_wsl=1
    fi

    if [ "$is_wsl" = "1" ] && command -v powershell.exe &>/dev/null; then
      info "WSL detected — installing trust into Windows CurrentUser\\Root + setting Chrome policy..."
      local win_cert
      win_cert="$(wslpath -w "$cert" 2>/dev/null || echo "$cert")"
      # Same .NET pattern that bypasses Windows' UI prompt for CurrentUser
      # store, plus the ChromeRootStoreEnabled=0 policy so Chrome 105+
      # consults the Windows root store.
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
        || warn "Windows trust install failed — see deployment/docker/.cert-install-instructions.md for manual steps"
    fi

    # macOS: System keychain via /usr/bin/security
    if [ "$(uname -s)" = "Darwin" ]; then
      info "macOS detected — installing trust into System keychain (sudo prompt expected)..."
      if sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$cert" 2>/dev/null; then
        ok "macOS trust installed (Safari, Chrome via OS keychain)"
      else
        warn "macOS trust install failed — see deployment/docker/.cert-install-instructions.md for manual steps"
      fi
    fi

    # Linux: OS-wide CA store + NSS for Chrome/Firefox
    if [ "$(uname -s)" = "Linux" ] && [ "$is_wsl" = "0" ]; then
      info "Linux detected — installing trust into OS CA store..."
      if [ -d /etc/pki/ca-trust/source/anchors ]; then
        cp "$cert" /etc/pki/ca-trust/source/anchors/doable-localhost.crt
        update-ca-trust 2>/dev/null && ok "Linux RHEL/Fedora CA trust installed"
      elif [ -d /usr/local/share/ca-certificates ]; then
        cp "$cert" /usr/local/share/ca-certificates/doable-localhost.crt
        update-ca-certificates 2>/dev/null >/dev/null && ok "Linux Debian/Ubuntu CA trust installed"
      else
        warn "Unknown Linux CA layout — see deployment/docker/.cert-install-instructions.md"
      fi
      # NSS (Chrome/Firefox each maintain own cert DBs)
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

  # Drop a fallback instructions file next to the cert so an operator who
  # hits the rare auto-install failure path has a copy-paste ready guide.
  cat > "${SELF_SIGNED_DIR}/cert-install-instructions.md" <<'CERTDOC'
# Manual cert install (fallback)

setup.sh tries to auto-install this cert into your OS + browser trust
stores. If that failed, run one of these depending on your OS:

## Windows (PowerShell, no admin)
```powershell
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2('C:\path\to\cert.pem')
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser')
$store.Open('ReadWrite'); $store.Add($cert); $store.Close()
New-Item -Path 'HKCU:\Software\Policies\Google\Chrome' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Policies\Google\Chrome' -Name 'ChromeRootStoreEnabled' -Value 0 -Type DWord
# Restart Chrome
```

## macOS
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain cert.pem
```

## Linux (Debian/Ubuntu)
```bash
sudo cp cert.pem /usr/local/share/ca-certificates/doable-localhost.crt
sudo update-ca-certificates
# For Chrome: NSS db
sudo apt install libnss3-tools
certutil -A -d sql:$HOME/.pki/nssdb -t "C,," -n "doable-localhost" -i cert.pem
```

## Linux (Fedora/RHEL)
```bash
sudo cp cert.pem /etc/pki/ca-trust/source/anchors/doable-localhost.crt
sudo update-ca-trust
```
CERTDOC

  if [ "$MKCERT_OK" = "true" ]; then
    info "mkcert already installed local CA — skipping per-cert trust install"
  else
    install_localhost_trust "$SSL_CERT"
  fi
fi

# ─── Generate nginx config ───────────────────────────────────────────────────
NGINX_CONF="/etc/nginx/sites-available/${LISTEN_HOST}"
sed -e "s|__HOST__|${LISTEN_HOST}|g" \
    -e "s|__SSL_CERT__|${SSL_CERT}|g" \
    -e "s|__SSL_KEY__|${SSL_KEY}|g" \
    "$SCRIPT_DIR/nginx.conf.template" > "$NGINX_CONF"

ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/${LISTEN_HOST}"
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl enable --now nginx && systemctl reload-or-restart nginx
ok "nginx configured and running for ${LISTEN_HOST}"

# ─── Firewall ────────────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  ok "Firewall: ports 22, 80, 443 open"
fi

# ─── Build (or pull) and start ────────────────────────────────────────────────
echo ""
cd "$PROJECT_DIR"
if [[ "$COMPOSE_FILE" == *docker-compose.prod.yml ]]; then
  info "Pulling pre-built images from ghcr.io (tag: ${DOABLE_IMAGE_TAG:-latest})..."
  if ! docker compose -f "$COMPOSE_FILE" pull 2>&1 | tee /tmp/doable-pull.log; then
    PULL_LOG=$(cat /tmp/doable-pull.log 2>/dev/null || true)
    if echo "$PULL_LOG" | grep -qiE 'denied|unauthorized|not found|private'; then
      warn "ghcr.io images are not publicly accessible yet (registry denied)."
      warn "Falling back to source build (~5-10 minutes)..."
      COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
      info "Building Docker images from source..."
      docker compose -f "$COMPOSE_FILE" build
    else
      error "docker compose pull failed. See output above."
      exit 1
    fi
  fi
  info "Starting containers..."
else
  info "Building Docker images from source (this takes ~5-10 minutes)..."
  docker compose -f "$COMPOSE_FILE" build
  info "Starting containers..."
fi
docker compose -f "$COMPOSE_FILE" up -d

# ─── Detect stale-volume migrate failure ─────────────────────────────────────
# The migrate container is a one-shot (`depends_on: postgres healthy`, then runs
# pnpm migrate, then exits). If a prior install left a postgres_data volume with
# a different password than the .env we just generated, postgres skips
# initialization on its next boot (volume isn't empty), and migrate fails with
# `password authentication failed for user "doable"`. `docker compose up -d`
# exits 0 anyway because the one-shot completion is independent of the long-
# running services. Without this guard the operator sees an apparently
# successful install but every subsequent request to api/ws hangs forever
# (their `depends_on: migrate condition: service_completed_successfully` is
# unmet so they never start).
#
# Wait up to 60s for the migrate container to terminate, then check its exit
# code. On failure, surface a clear recovery command rather than letting the
# operator hit silent 502s in the browser.
info "Waiting for migrate container to complete..."
MIGRATE_EXIT="?"
for i in $(seq 1 30); do
  MSTATE=$(docker inspect doable-migrate --format '{{.State.Status}}' 2>/dev/null || echo "missing")
  if [ "$MSTATE" = "exited" ]; then
    MIGRATE_EXIT=$(docker inspect doable-migrate --format '{{.State.ExitCode}}' 2>/dev/null || echo "?")
    break
  fi
  sleep 2
done

if [ "$MIGRATE_EXIT" != "0" ] && [ "$MIGRATE_EXIT" != "?" ]; then
  echo ""
  error "Migration container exited with code $MIGRATE_EXIT — install is broken."
  error "The most common cause is a stale postgres_data volume from a prior install"
  error "with a different .env (POSTGRES_PASSWORD mismatch). Postgres skipped"
  error "re-initialization because the data directory wasn't empty."
  error ""
  error "Recover with:"
  error "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE down -v"
  error "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d"
  error ""
  error "Migrate logs (last 15 lines):"
  docker logs doable-migrate 2>&1 | tail -15 | sed 's/^/  /'
  exit 1
fi
ok "Migrations applied"

# Re-read the bootstrap token from .env in case .env already existed (operator
# chose "keep" earlier) — we want to show the token that's actually active.
ACTIVE_BOOTSTRAP_TOKEN=$(grep -E '^INSTALL_BOOTSTRAP_TOKEN=' "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Doable is running at ${APP_URL}${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  What to do next:"
echo ""
echo "    1. Open ${APP_URL}/signup in your browser."
echo "       The FIRST account to sign up becomes the platform owner"
echo "       automatically — no SSH, no SQL, no .env editing required."
echo ""
echo "    2. You'll be guided through a 4-step setup wizard at /setup:"
echo "       Welcome → AI provider → Google / GitHub sign-in → Plans & Billing."
echo "       End-users build apps from the dashboard after this — the wizard"
echo "       is for the platform admin only."
echo ""
echo "       AI provider step covers 50+ providers including OpenAI, Anthropic,"
echo "       Gemini, OpenRouter, Together, Fireworks, Groq, Cerebras, DeepSeek,"
echo "       Mistral, Cohere, xAI, Perplexity, MiniMax, Moonshot, Zhipu, plus"
echo "       Azure/Bedrock/Vertex enterprise endpoints AND local OpenAI-compatible"
echo "       servers (Ollama, LM Studio, vLLM, llama.cpp, Jan, LocalAI, …)."
echo ""
echo "       Tip: pre-export ANY of these before running setup.sh and the"
echo "       wizard's AI step starts pre-configured (first non-empty wins):"
echo "         ANTHROPIC_API_KEY  OPENAI_API_KEY    GEMINI_API_KEY"
echo "         MINIMAX_API_KEY    OPENROUTER_API_KEY  TOGETHER_API_KEY"
echo "         FIREWORKS_API_KEY  OPENCODE_ZEN_API_KEY  GROQ_API_KEY"
echo "         CEREBRAS_API_KEY   DEEPSEEK_API_KEY  MISTRAL_API_KEY"
echo "         COHERE_API_KEY     XAI_API_KEY       PERPLEXITY_API_KEY"
echo "         DEEPINFRA_API_KEY  NVIDIA_API_KEY    MOONSHOT_API_KEY"
echo "         ZHIPU_API_KEY"
echo ""
if [ "$MODE" != "domain" ]; then
  echo -e "  ${YELLOW}Note: Self-signed SSL — browsers will show a certificate warning.${NC}"
  echo "        Accept it once, or import ${SSL_CERT} into your trust store."
  echo ""
fi
if [ -n "${ACTIVE_BOOTSTRAP_TOKEN}" ]; then
  echo "  Bootstrap token (only needed if signup is delayed past 24h or you need"
  echo "  to force-promote — kept private, single-use, server-side enforced):"
  echo ""
  echo "      ${ACTIVE_BOOTSTRAP_TOKEN}"
  echo ""
fi
echo "  OAuth callback URLs to register in each provider's dashboard (when"
echo "  you reach Step 3 of the setup wizard):"
echo ""
echo "    Google login:  ${API_URL}/auth/google/callback"
echo "    GitHub login:  ${API_URL}/auth/github/callback"
echo "    GitHub repo:   ${API_URL}/auth/github/repo/callback"
echo ""
echo "  Useful commands:"
echo "    View logs:   docker compose -f ${COMPOSE_FILE} logs -f"
echo "    Stop:        docker compose -f ${COMPOSE_FILE} down"
echo "    Restart:     docker compose -f ${COMPOSE_FILE} restart"
echo "    Edit config: deployment/docker/.env  (mode 600 recommended: chmod 600 deployment/docker/.env)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
