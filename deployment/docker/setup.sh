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
      echo "  --skip-ssl       Behind Cloudflare Tunnel / reverse proxy: Caddy uses internal"
      echo "                   self-signed (no LE) AND binds 127.0.0.1 only so the tunnel is"
      echo "                   the only public ingress. Same effect as DOABLE_BEHIND_PROXY=1."
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
      echo "  DOABLE_BEHIND_PROXY     Set to '1' if you're putting Cloudflare Tunnel / ngrok /"
      echo "                          a reverse proxy in front of this install. Caddy binds"
      echo "                          127.0.0.1 (not 0.0.0.0) so the tunnel is the only ingress."
      echo "                          Same effect as --skip-ssl."
      echo ""
      echo "If neither DOMAIN nor HOST is set, defaults to localhost with self-signed SSL."
      echo "Localhost mode ALWAYS auto-installs the cert into your OS+browser trust stores;"
      echo "the browser opens https://localhost without any \"connection not private\" warning."
      exit 0
      ;;
  esac
done

# ─── OS detection ─────────────────────────────────────────────────────────────
# We support three deployment shapes:
#   - linux-debian / linux-rhel: full nginx-fronted https://${host} install
#     with apt/dnf + systemctl + ufw + mkcert-issued trusted cert. This is
#     the original path; production VPS installs are always Linux.
#   - macos / windows-bash (Git Bash, MSYS): Docker Desktop is the docker
#     daemon, and we DO NOT install host-side nginx (no apt/brew nginx
#     dance, no certbot, no systemctl, no ufw — none of which exist on
#     Mac or native Windows in a reliable cross-OS way). Instead the docker
#     stack binds 127.0.0.1:{3000,4000,4001} and the browser opens
#     http://localhost:3000 directly. HTTP on localhost is treated as a
#     secure context by every modern browser so service workers,
#     crypto.subtle, getUserMedia etc. all still work. Zero cert dance.
#   - WSL2 on Windows: treated as linux-debian. The browser is on the
#     Windows side though, so cert trust still routes through
#     powershell.exe interop (handled inside install_localhost_trust).
case "$(uname -s)" in
  Linux)
    if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null || [ -n "${WSL_DISTRO_NAME:-}" ]; then
      OS_FAMILY="linux-wsl"
    elif [ -f /etc/debian_version ]; then
      OS_FAMILY="linux-debian"
    elif [ -f /etc/redhat-release ] || [ -f /etc/fedora-release ] || [ -f /etc/SuSE-release ]; then
      OS_FAMILY="linux-rhel"
    else
      OS_FAMILY="linux-unknown"
    fi
    ;;
  Darwin)
    OS_FAMILY="macos"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    OS_FAMILY="windows-bash"
    ;;
  *)
    OS_FAMILY="unknown"
    ;;
esac
info "Detected OS family: ${OS_FAMILY}"

# nginx mode: only on Linux (where apt/dnf + systemctl + ufw exist). On
# Mac and native Windows we run a no-nginx flow with direct docker port
# binding + HTTP localhost (browser-secure context, no cert needed).
case "$OS_FAMILY" in
  linux-debian|linux-rhel|linux-wsl|linux-unknown) USE_NGINX=true ;;
  *)                                               USE_NGINX=false ;;
esac

# Package-manager + service-manager shims — kept thin and only invoked
# from the USE_NGINX=true paths, so the no-nginx branch never has to
# care which command exists.
pkg_install() {
  case "$OS_FAMILY" in
    linux-debian|linux-wsl) DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" ;;
    linux-rhel)             dnf install -y -q "$@" ;;
    linux-unknown)          error "pkg_install: unknown Linux distro, install '$*' manually"; return 1 ;;
    *)                      error "pkg_install: not supported on $OS_FAMILY"; return 1 ;;
  esac
}
pkg_update() {
  case "$OS_FAMILY" in
    linux-debian|linux-wsl) DEBIAN_FRONTEND=noninteractive apt-get update -qq ;;
    linux-rhel)             dnf check-update -y -q || true ;;
    *)                      : ;;
  esac
}
service_enable_start() {
  command -v systemctl &>/dev/null && systemctl enable --now "$1" 2>/dev/null
}
service_stop_disable() {
  if command -v systemctl &>/dev/null && systemctl is-active --quiet "$1"; then
    systemctl stop "$1" 2>/dev/null || true
    systemctl disable "$1" 2>/dev/null || true
  fi
}
service_reload_nginx() {
  command -v systemctl &>/dev/null && systemctl reload-or-restart nginx
}

# ─── Check prerequisites ─────────────────────────────────────────────────────
info "Checking prerequisites..."

# Auto-install docker + compose-plugin on debian/ubuntu when missing.
# Keeps the new-user one-liner truly one-line on a fresh OS — no detour to
# docs.docker.com/install before being able to run setup.sh.
# On macos / windows-bash docker is provided by Docker Desktop and is
# expected to be already installed.
if ! command -v docker &>/dev/null || ! docker compose version &>/dev/null; then
  if [ "${DOABLE_SKIP_DOCKER_INSTALL:-0}" = "1" ]; then
    error "Docker (or compose plugin) is not installed and DOABLE_SKIP_DOCKER_INSTALL=1 — refusing auto-install."
    exit 1
  fi
  case "$OS_FAMILY" in
    macos)
      error "Docker is not installed. Install Docker Desktop for Mac: https://docs.docker.com/desktop/install/mac-install/"
      exit 1
      ;;
    windows-bash)
      error "Docker is not installed. Install Docker Desktop for Windows: https://docs.docker.com/desktop/install/windows-install/"
      exit 1
      ;;
  esac
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
  # Install the apparmor USERSPACE package alongside docker.io. Debian's docker.io
  # enables apparmor confinement whenever the kernel has apparmor (the default on
  # Debian/Ubuntu), but it does NOT depend on the `apparmor` package — so on a
  # fresh box `apparmor_parser` is missing, dockerd can't load the `docker-default`
  # profile, and EVERY container (build + runtime) dies at init with:
  #   "apparmor failed to apply profile: write /proc/self/attr/apparmor/exec:
  #    no such file or directory"
  # Pulling `apparmor` provides apparmor_parser so dockerd can load docker-default.
  apt-get install -y -qq docker.io apparmor
  # Compose v2: Ubuntu packages the plugin as `docker-compose-v2`; Docker
  # Inc.'s official apt repo calls it `docker-compose-plugin`. Debian's stock
  # repos (bookworm) ship NEITHER — only the deprecated v1 `docker-compose`
  # python script — so on a fresh Debian box BOTH apt names miss and the
  # one-liner used to hard-fail with "Could not install docker compose v2".
  # Try the apt plugin names first (fast, distro-managed), then fall back to
  # the official static plugin binary from github.com/docker/compose so
  # `docker compose` works identically on Debian, Ubuntu, and derivatives
  # without layering in Docker's apt repo.
  if ! docker compose version >/dev/null 2>&1 \
     && ! apt-get install -y -qq docker-compose-v2 2>/dev/null \
     && ! apt-get install -y -qq docker-compose-plugin 2>/dev/null; then
    warn "No compose v2 apt package on this distro — installing the official plugin binary."
    COMPOSE_PLUGIN_DIR="/usr/local/lib/docker/cli-plugins"
    mkdir -p "$COMPOSE_PLUGIN_DIR"
    case "$(uname -m)" in
      x86_64|amd64)  COMPOSE_ARCH=x86_64 ;;
      aarch64|arm64) COMPOSE_ARCH=aarch64 ;;
      armv7l)        COMPOSE_ARCH=armv7 ;;
      *)             COMPOSE_ARCH=x86_64 ;;
    esac
    COMPOSE_VERSION="${DOABLE_COMPOSE_VERSION:-v2.29.7}"
    COMPOSE_URL="https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${COMPOSE_ARCH}"
    command -v curl >/dev/null 2>&1 || apt-get install -y -qq curl 2>/dev/null || true
    if curl -fsSL "$COMPOSE_URL" -o "$COMPOSE_PLUGIN_DIR/docker-compose" 2>/dev/null \
       || wget -qO "$COMPOSE_PLUGIN_DIR/docker-compose" "$COMPOSE_URL" 2>/dev/null; then
      chmod +x "$COMPOSE_PLUGIN_DIR/docker-compose"
    fi
  fi
  systemctl enable --now docker
  # docker.io's postinst may have started dockerd BEFORE apparmor_parser was
  # configured in the same apt transaction (dpkg ordering is not guaranteed), so
  # the docker-default profile wouldn't have loaded. Restart now that apparmor is
  # present so the profile is loaded before we build/run any container.
  systemctl restart docker 2>/dev/null || true
  if ! docker compose version >/dev/null 2>&1; then
    error "Could not install docker compose v2 (apt plugin packages absent and the official plugin-binary download failed)."
    error "Install it manually: https://docs.docker.com/compose/install/linux/  then re-run this script."
    exit 1
  fi
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
  # POSIX df -P columns: Filesystem 1024-blocks Used Available Capacity Mounted-on.
  # Can't index by column number — Filesystem (NFS/SMB: `host:/path`, Git Bash:
  # `C:/Program Files/Git`) or Mounted-on (`/Volumes/My Drive`) may contain
  # spaces and shift the column count. Anchor on the Capacity column instead:
  # it's always `<digits>%`, and Available is the field immediately before it.
  df_avail_for() {
    { df -Pk "$1" 2>/dev/null || true; } | awk 'NR==2 {
      for (i=NF; i>=2; i--) if ($i ~ /^[0-9]+%$/) { print $(i-1); exit }
    }'
  }
  AVAIL_KB=$(df_avail_for "$DOCKER_DATA_ROOT")
  AVAIL_MOUNT="$DOCKER_DATA_ROOT"
  if [ -z "$AVAIL_KB" ]; then
    AVAIL_KB=$(df_avail_for /)
    AVAIL_MOUNT="/"
  fi
  # Unparseable df → warn and skip the guard. Refusing every exotic-df install
  # is worse than letting the build try and surface ENOSPC if it really happens.
  if [ -z "$AVAIL_KB" ] || ! [ "$AVAIL_KB" -eq "$AVAIL_KB" ] 2>/dev/null; then
    warn "Could not determine free disk space (df produced no usable output) — skipping disk-space precheck."
  else
    AVAIL_GB=$(( AVAIL_KB / 1024 / 1024 ))
    case "${COMPOSE_FILE##*/}" in
      docker-compose.prod.yml) MIN_GB=5  ;; # pulled images only
      *)                       MIN_GB=25 ;; # source build peak
    esac
    if [ "$AVAIL_GB" -lt "$MIN_GB" ]; then
      error "Only ${AVAIL_GB} GB free on ${AVAIL_MOUNT:-/} — Doable needs at least ${MIN_GB} GB."
      if [ "$MIN_GB" = "25" ]; then
        error "Source builds peak around 22 GB; either free disk (docker system prune -af) or re-run with DOABLE_PREBUILT=true once ghcr images are public."
      fi
      error "Override with DOABLE_SKIP_DISK_CHECK=1 if you know what you're doing."
      [ "${DOABLE_SKIP_DISK_CHECK:-0}" = "1" ] || exit 1
    else
      ok "Disk space: ${AVAIL_GB} GB free on ${AVAIL_MOUNT:-docker root} (need >=${MIN_GB} GB)"
    fi
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
elif [ ! -t 0 ] || [ "${DOABLE_AUTO_LOCALHOST:-0}" = "1" ]; then
  # Non-interactive stdin (curl|bash, piped install, CI) — never block on read.
  # Default to localhost mode so automated installs complete unattended.
  # Operators who want a domain/IP install in CI pass DOMAIN= or HOST= explicitly.
  MODE="localhost"
  LISTEN_HOST="localhost"
  info "Non-interactive stdin (or DOABLE_AUTO_LOCALHOST=1) — defaulting to localhost mode"
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
# Single URL shape on every OS — Caddy runs as a docker service and
# terminates TLS on 127.0.0.1:443. The Caddyfile path-routes /api/* to the
# api container, /ws to the ws container, /preview/* to the api preview
# proxy, and / to the web container. Browser always opens https://${HOST}.
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

# ─── Feature flags ─────────────────────────────────
# Per-app database (PRD per-app-db): every generated app gets an isolated,
# sandboxed PGlite database, exposed via /__doable/data/* + the doable.data
# builtin MCP server. ON by default on new installs; set to 0 to disable.
DOABLE_APP_DB_ENABLED=1
# Per-app AI runtime (/__doable/ai/*, @doable/ai SDK). ON by default.
DOABLE_APP_AI_ENABLED=1

# ─── URLs ──────────────────────────────────────────
NEXT_PUBLIC_API_URL=${API_URL}
NEXT_PUBLIC_WS_URL=${WS_URL}
NEXT_PUBLIC_APP_URL=${APP_URL}
CORS_ORIGINS=${CORS}
# WS_ALLOWED_ORIGINS guards the Yjs/HMR WebSocket upgrade. Must include every
# public-facing origin the browser will send. Was missing on docker installs
# and silently broke collab + ai-trace stream.
WS_ALLOWED_ORIGINS=${CORS}

# ─── OAuth redirect URIs (browser-visible, Caddy-fronted) ───────────────
# These MUST be the exact URLs your browser will be redirected to after
# GitHub OAuth. lib/oauth.ts uses these when building the auth URL it
# sends to GitHub; GitHub then validates the redirect_uri against the
# Authorization callback URL registered in your OAuth App. Registering
# the PARENT path ${API_URL}/oauth/github/ in GitHub covers all three
# sub-paths below via GitHub's subdirectory-match rule, so you only
# create ONE OAuth App.
GITHUB_REDIRECT_URI=${API_URL}/oauth/github/login/callback
GITHUB_COPILOT_REDIRECT_URI=${API_URL}/oauth/github/copilot/callback
GITHUB_REPO_REDIRECT_URI=${API_URL}/oauth/github/repo/callback
GOOGLE_REDIRECT_URI=${API_URL}/auth/google/callback
# MCP OAuth callback — the browser is redirected here after authenticating with
# a user-added MCP server's OAuth provider, so it must be the PUBLIC api URL
# (NOT the internal http://api:4000). Uses dynamic client registration, so no
# OAuth App to pre-create. The api also derives this from NEXT_PUBLIC_API_URL
# when unset; we write it explicitly for visibility/override parity with above.
MCP_OAUTH_REDIRECT_URI=${API_URL}/connectors/mcp-oauth/callback

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

# ─── Set up TLS via Caddy (in docker, cross-platform) ───────────────────────
# Caddy runs as a docker service (see docker-compose.yml's `caddy` service),
# terminates TLS, and reverse-proxies to api/ws/web on the docker network.
# No host-side nginx, certbot, brew, systemctl, ufw — works identically on
# Linux (incl. WSL2), macOS, and Windows (Docker Desktop or WSL2).
#
# Cert sourcing + port binding depend on MODE + proxy state:
#   - domain (direct)        : Caddy auto-fetches Let's Encrypt cert (port 80
#                              must be open to the internet for the HTTP-01
#                              challenge). DOABLE_BIND_ADDR=0.0.0.0 so docker
#                              exposes :80 publicly.
#   - domain (behind tunnel) : --skip-ssl OR DOABLE_BEHIND_PROXY=1. Caddy
#                              binds 127.0.0.1 only — the tunnel (Cloudflare
#                              Tunnel, ngrok, etc.) is the sole public ingress.
#                              Caddy uses tls=internal (self-signed) for the
#                              origin↔tunnel hop; tunnel doesn't verify origin
#                              cert. 0.0.0.0 binding would defeat the tunnel.
#   - host / localhost       : setup.sh runs mkcert on the host to generate a
#                              cert signed by a local CA that's installed into
#                              the host's OS+browser trust stores (Mac keychain,
#                              Linux ca-certs, Windows root via WSL interop).
#                              Cert lands at deployment/docker/certs/ and is
#                              mounted into the Caddy container read-only.
#                              Bind: 127.0.0.1 only (loopback).
# ────────────────────────────────────────────────────────────────────────────

info "Setting up TLS for ${LISTEN_HOST} (Caddy in docker)..."

# ── Free ports 80/443 for the in-stack Caddy — "Doable FIRST" ────────────────
# Policy (user requirement): if :80 or :443 are occupied by ANYTHING that is
# not part of this Doable stack, take them over automatically — irrespective of
# OS or what's holding them. Three escalating passes, each idempotent + loud.
#
# 1) Stop legacy host-side proxies (systemd) from older installs.
for svc in nginx caddy apache2 lighttpd haproxy traefik; do
  if command -v systemctl &>/dev/null && systemctl is-active --quiet "$svc"; then
    info "Stopping host-side ${svc} (Caddy in docker takes over ports 80/443)"
    systemctl stop "$svc" 2>/dev/null || true
    systemctl disable "$svc" 2>/dev/null || true
  fi
done

# 2) Stop any *other* docker container publishing :80 or :443 (our own
#    doable-* containers are left alone — compose recreates them later).
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  for _port in 80 443; do
    for _cid in $(docker ps --filter "publish=${_port}" -q 2>/dev/null); do
      _cname=$(docker inspect -f '{{.Name}}' "$_cid" 2>/dev/null | sed 's#^/##')
      case "$_cname" in
        doable-*) continue ;;
      esac
      warn "Port ${_port} held by docker container '${_cname:-$_cid}' — stopping it (Doable takes priority)"
      docker stop "$_cid" >/dev/null 2>&1 || true
    done
  done
fi

# 3) Kill any remaining *host* process bound to :80/:443, whatever it is.
#    Portable across OSes: prefer fuser, then lsof, then ss. Never touch
#    dockerd/containerd/docker-proxy (container ports handled in pass 2).
for _port in 80 443; do
  _pids=""
  if command -v fuser &>/dev/null; then
    _pids=$(fuser -n tcp "${_port}" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true)
  elif command -v lsof &>/dev/null; then
    _pids=$(lsof -nP -iTCP:"${_port}" -sTCP:LISTEN -t 2>/dev/null || true)
  elif command -v ss &>/dev/null; then
    _pids=$(ss -tlnpH "( sport = :${_port} )" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true)
  fi
  for _pid in $_pids; do
    [ -n "$_pid" ] || continue
    _pname=$(ps -p "$_pid" -o comm= 2>/dev/null | tr -d ' ' || true)
    case "$_pname" in
      docker-proxy|dockerd|containerd|containerd-shim*) continue ;;
    esac
    warn "Port ${_port} still held by PID ${_pid} (${_pname:-unknown}) — killing it (Doable takes priority)"
    kill "$_pid" 2>/dev/null || true
    sleep 1
    kill -9 "$_pid" 2>/dev/null || true
  done
done
# ─────────────────────────────────────────────────────────────────────────────

mkdir -p "$SCRIPT_DIR/certs"

case "$MODE" in
  domain)
    DOABLE_SITE="$LISTEN_HOST"
    # Bind-address policy:
    #   - Direct public ingress (need :80 reachable for Let's Encrypt HTTP-01)
    #     → 0.0.0.0
    #   - Behind Cloudflare Tunnel / reverse proxy / CDN (--skip-ssl or
    #     DOABLE_BEHIND_PROXY=1) → 127.0.0.1. The tunnel is the only ingress;
    #     binding 0.0.0.0 here would bypass the tunnel and expose origin ports
    #     directly to the internet (defeats the tunnel's whole point).
    if [ "$SKIP_SSL" = true ] || [ "${DOABLE_BEHIND_PROXY:-0}" = "1" ]; then
      info "DOMAIN mode + behind-proxy: Caddy binds 127.0.0.1 (tunnel/CDN owns public ingress)"
      DOABLE_BIND_ADDR="127.0.0.1"
      DOABLE_TLS="internal"
    else
      info "DOMAIN mode: Caddy binds 0.0.0.0 + auto-fetches Let's Encrypt cert for ${LISTEN_HOST}"
      DOABLE_BIND_ADDR="0.0.0.0"
      # When EMAIL is unset, fall back to a placeholder ACME contact ("acme@<domain>")
      # so Caddy STILL goes to Let's Encrypt — NOT to its internal CA. The OOB promise
      # is "DOMAIN mode = publicly trusted cert with no browser warning", which is
      # broken if we fall back to internal (issuer=Caddy Local Authority). Anonymous
      # ACME registration is supported by LE; the placeholder email just goes in the
      # account record (no email is ever sent to it).
      DOABLE_TLS="${EMAIL:-acme@${LISTEN_HOST}}"
      if [ -z "${EMAIL:-}" ]; then
        warn "EMAIL not set — using placeholder ACME contact 'acme@${LISTEN_HOST}'."
        warn "  Re-run with EMAIL=you@example.com to receive cert renewal notices."
      fi
    fi
    ;;
  host|localhost)
    DOABLE_SITE="$LISTEN_HOST"
    DOABLE_BIND_ADDR="127.0.0.1"
    DOABLE_TLS="/certs/cert.pem /certs/key.pem"

    # localhost mode always installs trust (server == browser by definition).
    # host mode only installs if the operator opts in via --install-trust /
    # DOABLE_INSTALL_TRUST=1 — server is usually a different machine than
    # the browser, so installing on the server doesn't help.
    WANT_TRUST=false
    case "$MODE" in
      localhost) WANT_TRUST=true ;;
      host)
        [ "${DOABLE_INSTALL_TRUST:-0}" = "1" ] && WANT_TRUST=true
        [ "$INSTALL_TRUST" = "true" ] && WANT_TRUST=true
        ;;
    esac

    ensure_mkcert() {
      # command -v finds non-executable files in PATH on macOS bash (3.2 and 5.x
      # alike), so trust requires both "found" AND "-x" AND "-version exits 0".
      # The last check catches macOS 14+ Gatekeeper kills: a curl-downloaded
      # arm64 binary gets the SIP-protected com.apple.provenance xattr stamped
      # on it, and Gatekeeper SIGKILL's any attempt to exec it. The file looks
      # fine (`ls -l` shows mode 755) but exits 137 silently — every downstream
      # `mkcert -install` and `mkcert -cert-file` then "fails" with no error
      # message, and the script falls back to Caddy internal self-signed.
      mkcert_works() {
        local bin="$1"
        [ -n "$bin" ] && [ -x "$bin" ] && "$bin" -version >/dev/null 2>&1
      }
      local existing
      existing="$(command -v mkcert 2>/dev/null || true)"
      mkcert_works "$existing" && return 0
      # Found but not executable → try to repair before pulling fresh.
      [ -n "$existing" ] && chmod +x "$existing" 2>/dev/null && mkcert_works "$existing" && return 0
      # On macOS, prefer Homebrew's notarized bottle over raw GitHub download —
      # the bottle isn't quarantined and won't trip Gatekeeper. Same idea on
      # Linux Homebrew installs (uncommon but supported).
      if [ "$OS_FAMILY" = "macos" ] && command -v brew &>/dev/null; then
        info "Installing mkcert via Homebrew (notarized; bypasses macOS Gatekeeper)..."
        if brew list mkcert &>/dev/null || brew install mkcert >/dev/null 2>&1; then
          # Brew's bin dir might not yet be in PATH for this shell — add it.
          local brew_bin
          brew_bin="$(brew --prefix 2>/dev/null)/bin"
          [ -d "$brew_bin" ] && export PATH="$brew_bin:$PATH"
          mkcert_works "$(command -v mkcert 2>/dev/null)" && return 0
        fi
        warn "brew install mkcert failed — falling back to raw GitHub download"
      fi
      local os arch
      os="$(uname -s | tr '[:upper:]' '[:lower:]')"
      case "$(uname -m)" in
        x86_64|amd64)   arch=amd64 ;;
        aarch64|arm64)  arch=arm64 ;;
        *)              return 1 ;;
      esac
      local url="https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-${os}-${arch}"
      info "Downloading mkcert (one-time, ${url##*/})..."
      local dest=/usr/local/bin/mkcert
      [ -w /usr/local/bin ] || dest="$HOME/.local/bin/mkcert"
      mkdir -p "$(dirname "$dest")"
      if curl -fsSL -o "$dest" "$url" && chmod +x "$dest"; then
        # Best-effort: strip quarantine if present (provenance is SIP-protected
        # on macOS 14+ and can't be removed by user processes — `xattr -c` will
        # appear to succeed but the xattr stays. The -version smoke test below
        # is what actually catches the Gatekeeper-kill case.
        command -v xattr &>/dev/null && xattr -c "$dest" 2>/dev/null || true
        export PATH="$(dirname "$dest"):$PATH"
        if mkcert_works "$dest"; then
          return 0
        fi
        if [ "$OS_FAMILY" = "macos" ]; then
          warn "Downloaded mkcert was killed by macOS Gatekeeper (com.apple.provenance xattr is SIP-protected)."
          warn "  Install the notarized bottle instead: brew install mkcert"
        fi
        rm -f "$dest"
        return 1
      else
        rm -f "$dest"; return 1
      fi
    }

    if [ "$WANT_TRUST" = "true" ] && ensure_mkcert; then
      info "Installing mkcert local CA into host trust stores..."
      mkcert -install 2>&1 | grep -E 'installed|CA' || true
      info "Issuing browser-trusted cert for ${LISTEN_HOST}..."
      if mkcert -cert-file "$SCRIPT_DIR/certs/cert.pem" -key-file "$SCRIPT_DIR/certs/key.pem" \
          "$LISTEN_HOST" localhost 127.0.0.1 ::1 >/dev/null 2>&1; then
        chmod 644 "$SCRIPT_DIR/certs/cert.pem"
        chmod 600 "$SCRIPT_DIR/certs/key.pem"
        ok "Browser-trusted cert ready at deployment/docker/certs/cert.pem"
      else
        warn "mkcert leaf-cert generation failed — Caddy will use internal self-signed"
        DOABLE_TLS="internal"
      fi
    elif [ "$WANT_TRUST" = "true" ]; then
      info "mkcert unavailable — using openssl self-signed (browser warning expected once)"
      openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout "$SCRIPT_DIR/certs/key.pem" -out "$SCRIPT_DIR/certs/cert.pem" \
        -days 365 -subj "/CN=${LISTEN_HOST}" \
        -addext "subjectAltName=DNS:${LISTEN_HOST},DNS:localhost,IP:127.0.0.1" 2>/dev/null || true
      [ -f "$SCRIPT_DIR/certs/cert.pem" ] && {
        chmod 644 "$SCRIPT_DIR/certs/cert.pem"
        chmod 600 "$SCRIPT_DIR/certs/key.pem"
      }
    else
      info "HOST mode without --install-trust: Caddy will use internal self-signed."
      info "  Browser will show a one-time warning. Re-run with --install-trust to issue a"
      info "  trusted cert when the server is also the browser machine."
      DOABLE_TLS="internal"
    fi
    ;;
esac

# Persist Caddy env vars into .env (idempotent — update in place if present).
persist_env() {
  local var="$1" value="$2"
  if grep -qE "^${var}=" "$ENV_FILE"; then
    awk -v v="$var" -v val="$value" 'BEGIN{p=0} $0 ~ "^"v"="{print v"="val; p=1; next} {print} END{if(!p) print v"="val}' "$ENV_FILE" > "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$var" "$value" >> "$ENV_FILE"
  fi
}
persist_env DOABLE_SITE       "$DOABLE_SITE"
persist_env DOABLE_TLS        "$DOABLE_TLS"
persist_env DOABLE_BIND_ADDR  "$DOABLE_BIND_ADDR"
chmod 600 "$ENV_FILE"

ok "Caddy TLS config persisted to .env (DOABLE_SITE=${DOABLE_SITE}, BIND=${DOABLE_BIND_ADDR})"

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
  echo "        Accept it once, or import ${SCRIPT_DIR}/certs/cert.pem into your trust store."
  echo ""
fi
if [ -n "${ACTIVE_BOOTSTRAP_TOKEN:-}" ]; then
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
echo "    GitHub (one OAuth App covers sign-in + Copilot + repo):"
echo "      Register callback URL: ${API_URL}/oauth/github/"
echo "      (GitHub's subdirectory-match rule then accepts:"
echo "        ${API_URL}/oauth/github/login/callback"
echo "        ${API_URL}/oauth/github/copilot/callback"
echo "        ${API_URL}/oauth/github/repo/callback)"
echo ""
echo "  Useful commands:"
echo "    View logs:   docker compose -f ${COMPOSE_FILE} logs -f"
echo "    Stop:        docker compose -f ${COMPOSE_FILE} down"
echo "    Restart:     docker compose -f ${COMPOSE_FILE} restart"
echo "    Edit config: deployment/docker/.env  (mode 600 recommended: chmod 600 deployment/docker/.env)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
