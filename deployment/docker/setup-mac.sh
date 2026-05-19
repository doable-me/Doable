#!/usr/bin/env bash
# ==============================================================================
# Doable — Self-hosting setup script (macOS)
# ==============================================================================
# Sets up everything needed to run Doable with Docker Compose + nginx + SSL.
# nginx ALWAYS sits in front of services. Services NEVER bind to 0.0.0.0.
#
# Requirements: macOS 12+ with Homebrew (https://brew.sh) and Docker Desktop.
#
# Usage:
#   # Public domain (Let's Encrypt SSL):
#   DOMAIN=app.example.com ./deployment/docker/setup-mac.sh
#
#   # Private network / LAN (self-signed SSL for an IP address):
#   HOST=192.168.1.50 ./deployment/docker/setup-mac.sh
#
#   # Localhost only (self-signed SSL on 127.0.0.1):
#   ./deployment/docker/setup-mac.sh
#
#   # Skip Let's Encrypt (e.g. behind Cloudflare proxy):
#   DOMAIN=app.example.com ./deployment/docker/setup-mac.sh --skip-ssl
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# SCRIPT_DIR = .../deployment/docker
# PROJECT_DIR = repo root (two levels up from deployment/docker)
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
ENV_FILE="$SCRIPT_DIR/.env"
# Pre-built (pulls from ghcr.io) vs source-build (5-10min). Default = source.
# Set DOABLE_PREBUILT=true (or pass --prebuilt) to use the published images
# instead — ~30s install. Overridable per-invocation.
if [ "${DOABLE_PREBUILT:-false}" = "true" ]; then
  COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
else
  COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
fi

# macOS: Homebrew nginx paths differ by chip architecture
# Apple Silicon (M1/M2/M3): /opt/homebrew
# Intel:                     /usr/local
if [ -d "/opt/homebrew" ]; then
  BREW_PREFIX="/opt/homebrew"
else
  BREW_PREFIX="/usr/local"
fi
NGINX_SITES_AVAILABLE="${BREW_PREFIX}/etc/nginx/sites-available"
NGINX_SITES_ENABLED="${BREW_PREFIX}/etc/nginx/sites-enabled"
NGINX_CONF_DIR="${BREW_PREFIX}/etc/nginx"
SELF_SIGNED_DIR="${HOME}/.doable/ssl"

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
    --prebuilt)  COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml" ;;
    --help|-h)
      echo "Usage: [DOMAIN=app.example.com | HOST=192.168.1.50] $0 [--skip-ssl] [--prebuilt]"
      echo ""
      echo "Options:"
      echo "  --skip-ssl   Set up nginx but skip Let's Encrypt (e.g. behind Cloudflare)"
      echo "  --prebuilt   Pull pre-built images from ghcr.io instead of building"
      echo "               from source (~30s install vs ~5-10min build)."
      echo "               Equivalent to setting DOABLE_PREBUILT=true."
      echo ""
      echo "Environment variables:"
      echo "  DOMAIN              Your domain name — uses Let's Encrypt for SSL"
      echo "  HOST                IP or hostname for private network — self-signed SSL"
      echo "  EMAIL               Email for Let's Encrypt notifications (optional)"
      echo "  DOABLE_PREBUILT     Set to 'true' to pull from ghcr.io (same as --prebuilt)"
      echo "  DOABLE_IMAGE_TAG    Image tag to pull (default: latest; use v1.2.3 to pin)"
      echo ""
      echo "If neither DOMAIN nor HOST is set, defaults to localhost with self-signed SSL."
      exit 0
      ;;
  esac
done

# ─── Check prerequisites ─────────────────────────────────────────────────────
info "Checking prerequisites..."

# macOS requires Homebrew for package management
if ! command -v brew &>/dev/null; then
  error "Homebrew is not installed. Install it first: https://brew.sh"
  error "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  exit 1
fi
ok "Homebrew found (${BREW_PREFIX})"

# Docker Desktop must be running on macOS (no docker engine install via brew for prod)
if ! command -v docker &>/dev/null; then
  error "Docker is not installed. Install Docker Desktop for Mac: https://docs.docker.com/desktop/install/mac-install/"
  exit 1
fi

# Ensure Docker daemon is actually running (Docker Desktop may be installed but not started)
if ! docker info &>/dev/null; then
  error "Docker daemon is not running. Please start Docker Desktop and try again."
  exit 1
fi

# Docker Compose v2 (plugin) check
if ! docker compose version &>/dev/null; then
  error "Docker Compose v2 plugin not found. Make sure Docker Desktop is up to date."
  exit 1
fi

ok "Docker $(docker --version 2>/dev/null || echo '?') found"
ok "Docker Compose $(docker compose version 2>/dev/null | head -1 || echo '?') found"

# ─── Determine mode ───────────────────────────────────────────────────────────
# Three modes:
#   1. DOMAIN= set        → public domain, Let's Encrypt SSL
#   2. HOST= set          → private network IP/hostname, self-signed SSL
#   3. Neither            → localhost, self-signed SSL
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

# ─── URL variables (used for .env and final output) ──────────────────────────
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
  # Fresh .env means fresh secrets. If a postgres_data volume already exists
  # from a previous install, it has the OLD password — wipe volumes to avoid
  # password mismatch on next boot.
  if docker volume ls -q 2>/dev/null | grep -qE '_postgres_data$'; then
    warn "Pre-existing postgres_data volume detected — its password won't match the fresh .env we're about to generate."
    warn "Wiping postgres + api + ws + thumbnails volumes to avoid an authentication mismatch."
    docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
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
  INSTALL_BOOTSTRAP_TOKEN=$(openssl rand -hex 32)
  DOABLE_KEK=$(openssl rand -base64 32)

  # macOS uses BSD date — -v+24H for relative date
  INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT=$(date -u -v+24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")

  cat > "$ENV_FILE" <<EOF
# Generated by setup-mac.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Host: ${LISTEN_HOST}

# ─── Secrets ───────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
INTERNAL_SECRET=${INTERNAL_SECRET}
DOABLE_KEK=${DOABLE_KEK}

# ─── First-run bootstrap (single-use; auto-closes after first signup) ───
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

# ─── AI providers (set ANY ONE for first-boot pre-config) ─────────
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

  chmod 600 "$ENV_FILE"
  ok "Created deployment/docker/.env with generated secrets (mode 600)"
fi

# ─── Idempotent back-fill: existing .env from a pre-DOABLE_KEK install ────────
if [ -f "$ENV_FILE" ] && ! grep -qE '^DOABLE_KEK=.+' "$ENV_FILE"; then
  NEW_KEK=$(openssl rand -base64 32)
  if grep -qE '^DOABLE_KEK=' "$ENV_FILE"; then
    # macOS sed requires the backup extension with -i
    sed -i.bak -E "s|^DOABLE_KEK=.*|DOABLE_KEK=${NEW_KEK}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    printf '\n# Added by setup-mac.sh back-fill (%s)\nDOABLE_KEK=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$NEW_KEK" >> "$ENV_FILE"
  fi
  ok "Back-filled DOABLE_KEK in existing $ENV_FILE"
fi

# ─── Install nginx via Homebrew ───────────────────────────────────────────────
info "Setting up nginx reverse proxy for ${LISTEN_HOST}..."

if ! command -v nginx &>/dev/null; then
  info "Installing nginx via Homebrew..."
  brew install nginx
  ok "Installed nginx"
fi

# Create sites-available and sites-enabled directories (Homebrew nginx doesn't
# create them by default — we mirror the Linux layout for consistency)
mkdir -p "$NGINX_SITES_AVAILABLE" "$NGINX_SITES_ENABLED"

# Ensure the main nginx.conf includes sites-enabled (Homebrew nginx.conf does
# not include this by default — append an include directive if missing)
NGINX_MAIN_CONF="${NGINX_CONF_DIR}/nginx.conf"
if ! grep -q "sites-enabled" "$NGINX_MAIN_CONF" 2>/dev/null; then
  # Append the include line just before the closing brace of the http block.
  # We use a Python one-liner (always present on macOS) so we can reliably
  # target only the LAST closing brace in the file — which belongs to the
  # http block in the default Homebrew nginx.conf layout — without
  # accidentally matching inner block braces via sed.
  python3 - "$NGINX_MAIN_CONF" "$NGINX_SITES_ENABLED" <<'PYEOF'
import sys, pathlib
path = pathlib.Path(sys.argv[1])
sites = sys.argv[2]
content = path.read_text()
include_line = f'    include {sites}/*.conf;\n'
if include_line.strip() not in content:
    idx = content.rfind('}')
    content = content[:idx] + include_line + content[idx:]
    path.write_text(content)
PYEOF
  ok "Patched nginx.conf to include sites-enabled"
fi

# ─── SSL certificates ─────────────────────────────────────────────────────────
SSL_CERT=""
SSL_KEY=""

if [ "$MODE" = "domain" ] && [ "$SKIP_SSL" = false ]; then
  # Let's Encrypt for public domains via certbot
  if ! command -v certbot &>/dev/null; then
    info "Installing certbot via Homebrew..."
    brew install certbot
    ok "Installed certbot"
  fi

  # Temporary HTTP-only nginx config for ACME challenge
  NGINX_CONF="${NGINX_SITES_AVAILABLE}/${LISTEN_HOST}"
  cat > "$NGINX_CONF" <<HTTPEOF
server {
    listen 80;
    server_name ${LISTEN_HOST};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
HTTPEOF
  ln -sf "$NGINX_CONF" "${NGINX_SITES_ENABLED}/${LISTEN_HOST}.conf"
  # Use the full path so nginx is found even if PATH hasn't been refreshed
  # after a fresh brew install in this same shell session.
  "${BREW_PREFIX}/bin/nginx" -t && brew services restart nginx

  EMAIL_FLAG=""
  if [ -n "${EMAIL:-}" ]; then
    EMAIL_FLAG="-m $EMAIL"
  else
    EMAIL_FLAG="--register-unsafely-without-email"
  fi

  mkdir -p /var/www/html
  info "Requesting Let's Encrypt certificate for ${LISTEN_HOST}..."
  # certbot writes to /etc/letsencrypt which requires root on macOS.
  # If this script is already running as root (sudo ./setup-mac.sh) the
  # sudo is a no-op; if not, it will prompt once for a password.
  sudo certbot certonly --webroot -w /var/www/html -d "$LISTEN_HOST" $EMAIL_FLAG --agree-tos --non-interactive

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

# ─── Generate nginx config ────────────────────────────────────────────────────
NGINX_CONF="${NGINX_SITES_AVAILABLE}/${LISTEN_HOST}"
sed -e "s|__HOST__|${LISTEN_HOST}|g" \
    -e "s|__SSL_CERT__|${SSL_CERT}|g" \
    -e "s|__SSL_KEY__|${SSL_KEY}|g" \
    "$SCRIPT_DIR/nginx.conf.template" > "$NGINX_CONF"

ln -sf "$NGINX_CONF" "${NGINX_SITES_ENABLED}/${LISTEN_HOST}.conf"

"${BREW_PREFIX}/bin/nginx" -t && brew services restart nginx
ok "nginx configured and running for ${LISTEN_HOST}"

# ─── macOS firewall note ──────────────────────────────────────────────────────
# macOS Application Firewall (socketfilterfw) does not have a simple CLI
# equivalent to ufw. If the firewall is on, macOS will prompt to allow nginx
# automatically on first connection. No manual rule needed.
info "macOS firewall: if prompted, allow nginx through the Application Firewall."

# ─── Build (or pull) and start ────────────────────────────────────────────────
echo ""
cd "$PROJECT_DIR"
if [[ "$COMPOSE_FILE" == *docker-compose.prod.yml ]]; then
  info "Pulling pre-built images from ghcr.io (tag: ${DOABLE_IMAGE_TAG:-latest})..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
  info "Starting containers..."
else
  info "Building Docker images from source (this takes ~5-10 minutes)..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
  info "Starting containers..."
fi
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# Re-read the bootstrap token from .env in case .env already existed
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
echo ""
echo "       AI provider step covers 50+ providers including OpenAI, Anthropic,"
echo "       Gemini, OpenRouter, Together, Fireworks, Groq, Cerebras, DeepSeek,"
echo "       Mistral, Cohere, xAI, Perplexity, MiniMax, Moonshot, Zhipu, plus"
echo "       Azure/Bedrock/Vertex enterprise endpoints AND local OpenAI-compatible"
echo "       servers (Ollama, LM Studio, vLLM, llama.cpp, Jan, LocalAI, …)."
echo ""
if [ "$MODE" != "domain" ]; then
  echo -e "  ${YELLOW}Note: Self-signed SSL — browsers will show a certificate warning.${NC}"
  echo "        Accept it once, or add ${SSL_CERT} to your macOS Keychain:"
  echo "        sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${SSL_CERT}"
  echo ""
fi
if [ -n "${ACTIVE_BOOTSTRAP_TOKEN}" ]; then
  echo "  Bootstrap token (only needed if signup is delayed past 24h):"
  echo ""
  echo "      ${ACTIVE_BOOTSTRAP_TOKEN}"
  echo ""
fi
echo "  OAuth callback URLs to register in each provider's dashboard:"
echo ""
echo "    Google login:  ${API_URL}/auth/google/callback"
echo "    GitHub login:  ${API_URL}/auth/github/callback"
echo "    GitHub repo:   ${API_URL}/auth/github/repo/callback"
echo ""
echo "  Useful commands:"
echo "    View logs:   docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} logs -f"
echo "    Stop:        docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} down"
echo "    Restart:     docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} restart"
echo "    nginx logs:  tail -f ${BREW_PREFIX}/var/log/nginx/error.log"
echo "    Edit config: ${ENV_FILE}  (mode 600 — chmod 600 ${ENV_FILE})"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
