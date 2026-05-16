#!/usr/bin/env bash
# ==============================================================================
# Doable — Self-hosting setup script
# ==============================================================================
# Sets up everything needed to run Doable with Docker Compose + nginx + SSL.
# nginx ALWAYS sits in front of services. Services NEVER bind to 0.0.0.0.
#
# Usage:
#   # Public domain (Let's Encrypt SSL):
#   DOMAIN=app.example.com ./docker/setup.sh
#
#   # Private network / LAN (self-signed SSL for an IP address):
#   HOST=192.168.1.50 ./docker/setup.sh
#
#   # Localhost only (self-signed SSL on 127.0.0.1):
#   ./docker/setup.sh
#
#   # Skip Let's Encrypt (e.g. behind Cloudflare proxy):
#   DOMAIN=app.example.com ./docker/setup.sh --skip-ssl
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$SCRIPT_DIR/.env"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
SELF_SIGNED_DIR="/etc/ssl/doable"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

# ─── Parse args ───────────────────────────────────────────────────────────────
SKIP_SSL=false
for arg in "$@"; do
  case "$arg" in
    --skip-ssl)  SKIP_SSL=true ;;
    --help|-h)
      echo "Usage: [DOMAIN=app.example.com | HOST=192.168.1.50] $0 [--skip-ssl]"
      echo ""
      echo "Options:"
      echo "  --skip-ssl   Set up nginx but skip Let's Encrypt (e.g. behind Cloudflare)"
      echo ""
      echo "Environment variables:"
      echo "  DOMAIN       Your domain name — uses Let's Encrypt for SSL"
      echo "  HOST         IP or hostname for private network — uses self-signed SSL"
      echo "  EMAIL        Email for Let's Encrypt notifications (optional)"
      echo ""
      echo "If neither DOMAIN nor HOST is set, defaults to localhost with self-signed SSL."
      exit 0
      ;;
  esac
done

# ─── Check prerequisites ─────────────────────────────────────────────────────
info "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  error "Docker is not installed. Install it from https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  error "Docker Compose v2 is required. Install it from https://docs.docker.com/compose/install/"
  exit 1
fi

ok "Docker and Docker Compose found"

# ─── Determine mode ───────────────────────────────────────────────────────────
# Three modes:
#   1. DOMAIN= set        → public domain, Let's Encrypt SSL
#   2. HOST= set           → private network IP/hostname, self-signed SSL
#   3. Neither             → localhost, self-signed SSL
#
# In ALL modes, nginx sits in front. Services ALWAYS bind to 127.0.0.1.

MODE=""
LISTEN_HOST=""  # What nginx's server_name will be

if [ -n "${DOMAIN:-}" ]; then
  MODE="domain"
  LISTEN_HOST="$DOMAIN"
  info "Domain mode — Let's Encrypt SSL for ${DOMAIN}"
elif [ -n "${HOST:-}" ]; then
  MODE="host"
  LISTEN_HOST="$HOST"
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
    info "Private network mode — self-signed SSL for ${LISTEN_HOST}"
  else
    MODE="domain"
    LISTEN_HOST="$USER_INPUT"
    DOMAIN="$USER_INPUT"
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
  read -rp "Overwrite? [y/N] " overwrite
  if [[ ! "$overwrite" =~ ^[Yy] ]]; then
    info "Keeping existing .env"
  else
    rm "$ENV_FILE"
  fi
fi

if [ ! -f "$ENV_FILE" ]; then
  info "Generating docker/.env with random secrets..."

  JWT_SECRET=$(openssl rand -hex 32)
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  INTERNAL_SECRET=$(openssl rand -hex 32)
  PG_PASSWORD=$(openssl rand -hex 16)
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

# ─── URLs ──────────────────────────────────────────
NEXT_PUBLIC_API_URL=${API_URL}
NEXT_PUBLIC_WS_URL=${WS_URL}
NEXT_PUBLIC_APP_URL=${APP_URL}
CORS_ORIGINS=${CORS}

# ─── Redis (optional) ─────────────────────────────
REDIS_URL=

# ─── AI (set at least one for AI features) ────────
# Honour pre-export: if the operator exported any of these before running
# setup.sh, they get seeded into the .env (and the API container's
# seedAiProviderFromEnv() then pre-fills the wizard's Step 2). Empty
# otherwise — wizard can still configure at runtime.
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
MINIMAX_API_KEY=${MINIMAX_API_KEY:-}

# ─── OAuth (optional) ─────────────────────────────
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ─── Stripe (optional) ────────────────────────────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
EOF

  # docker/.env holds DB password, JWT secret, encryption key, KEK and any
  # operator-supplied AI / OAuth / Stripe keys — restrict to owner-only read.
  # env-perms-check.ts at services/api/src/lib/env-perms-check.ts warns on every
  # boot if this is group/world-readable; setting 600 here silences the warning
  # AND protects against unprivileged accounts reading secrets off disk.
  chmod 600 "$ENV_FILE"
  ok "Created docker/.env with generated secrets (mode 600)"
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
  ok "Back-filled DOABLE_KEK in existing $ENV_FILE"
fi

# ─── Set up nginx + SSL ──────────────────────────────────────────────────────
# nginx is ALWAYS set up. Services never face the network directly.

info "Setting up nginx reverse proxy for ${LISTEN_HOST}..."

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
  nginx -t && systemctl reload nginx

  EMAIL_FLAG=""
  if [ -n "${EMAIL:-}" ]; then
    EMAIL_FLAG="-m $EMAIL"
  else
    EMAIL_FLAG="--register-unsafely-without-email"
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

  if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
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
fi

# ─── Generate nginx config ───────────────────────────────────────────────────
NGINX_CONF="/etc/nginx/sites-available/${LISTEN_HOST}"
sed -e "s|__HOST__|${LISTEN_HOST}|g" \
    -e "s|__SSL_CERT__|${SSL_CERT}|g" \
    -e "s|__SSL_KEY__|${SSL_KEY}|g" \
    "$SCRIPT_DIR/nginx.conf.template" > "$NGINX_CONF"

ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/${LISTEN_HOST}"
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
ok "nginx configured and running for ${LISTEN_HOST}"

# ─── Firewall ────────────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  ok "Firewall: ports 22, 80, 443 open"
fi

# ─── Build and start ─────────────────────────────────────────────────────────
echo ""
info "Building and starting Docker containers..."
cd "$PROJECT_DIR"
docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d

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
echo "       Welcome → AI provider (60+ providers including MiniMax, OpenAI,"
echo "       Anthropic, OpenRouter, Groq, Ollama …) → Google / GitHub sign-in →"
echo "       Plans & Billing. End-users build apps from the dashboard later."
echo ""
echo "       Tip: export MINIMAX_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY)"
echo "       before re-running this script and Step 2 will already be configured."
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
echo "    View logs:   docker compose -f docker/docker-compose.yml logs -f"
echo "    Stop:        docker compose -f docker/docker-compose.yml down"
echo "    Restart:     docker compose -f docker/docker-compose.yml restart"
echo "    Edit config: docker/.env  (mode 600 recommended: chmod 600 docker/.env)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
