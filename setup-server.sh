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
  DB_PASS="${DB_PASS:-doable}"
  GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
  GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
  GITHUB_CLIENT_ID="${GITHUB_CLIENT_ID:-}"
  GITHUB_CLIENT_SECRET="${GITHUB_CLIENT_SECRET:-}"
  ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
  OPENAI_API_KEY="${OPENAI_API_KEY:-}"
  PUBLISH_PREFIX="${PUBLISH_PREFIX:-do-}"
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

  read -rp "Publish subdomain prefix (e.g., do- for prod, dev- for dev) [do-]: " PUBLISH_PREFIX
  PUBLISH_PREFIX="${PUBLISH_PREFIX:-do-}"

  read -rp "GitHub repo (owner/repo) [doable-me/doable]: " REPO
  REPO="${REPO:-doable-me/doable}"

  read -rp "Database password [doable]: " DB_PASS
  DB_PASS="${DB_PASS:-doable}"

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

  echo ""
  echo "── Optional: Stripe (press Enter to skip) ──"
  read -rp "Stripe Secret Key: " STRIPE_SECRET_KEY
  read -rp "Stripe Webhook Secret: " STRIPE_WEBHOOK_SECRET
fi

# Honor API_DOMAIN/WS_DOMAIN already derived from NEXT_PUBLIC_* — only fall
# back to the dot-prefix convention when nothing was pre-staged. Required so
# multi-level DOMAINs (e.g. dev.doable.me) keep dev-api.doable.me and don't
# get rewritten to dev-api.dev.doable.me.
API_DOMAIN="${API_DOMAIN:-${API_SUB}.${DOMAIN}}"
WS_DOMAIN="${WS_DOMAIN:-${WS_SUB}.${DOMAIN}}"
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
echo "  Prefix:     ${PUBLISH_PREFIX}"
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

# pgvector extension for PostgreSQL
if ! dpkg -l | grep -q "postgresql-.*-pgvector"; then
  apt-get install -y postgresql-16-pgvector 2>/dev/null || apt-get install -y postgresql-14-pgvector 2>/dev/null || true
fi

# fail2ban (SSH brute-force protection)
if ! command -v fail2ban-client &>/dev/null; then
  apt-get install -y fail2ban
fi

# tmux
if ! command -v tmux &>/dev/null; then
  apt-get install -y tmux
fi

# Puppeteer/Chrome dependencies (for thumbnail capture)
apt-get install -y \
  libatk1.0-0 libatk-bridge2.0-0 libcups2 libatspi2.0-0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libcairo2 libpango-1.0-0 \
  libasound2t64 libasound2 \
  libxshmfence1 libnspr4 libnss3 libdrm2 libxkbcommon0 \
  fonts-liberation 2>/dev/null || true

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
  info "Provisioning dev sandbox user pool (doable-dev-1..1000 named, UID range 10001..65000)"
  for i in $(seq 1 1000); do
    uid=$((10000 + i))
    user="doable-dev-$i"
    if ! id "$user" &>/dev/null; then
      useradd --system --no-create-home --shell /usr/sbin/nologin \
        --uid "$uid" --user-group "$user" 2>/dev/null || true
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

  # ── SAFETY: Allow SSH FIRST, before touching anything else ──
  ufw allow 22/tcp comment "SSH - NEVER REMOVE"

  # Set default policies: deny incoming, allow outgoing
  ufw default deny incoming >/dev/null 2>&1
  ufw default allow outgoing >/dev/null 2>&1

  # NOTE: No application ports are opened — all access goes through Cloudflare Tunnel.
  # Services bind to 127.0.0.1 only. Never expose 3000/4000/4001/8080 to the public.

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

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='doable'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER doable WITH PASSWORD '${DB_PASS}' CREATEDB;"

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

# ─── Next.js Web bind (used by start.sh) ────────────────────
WEB_HOSTNAME=${BIND_HOST}

# ─── Next.js Frontend ──────────────────────────────────────
NEXT_PUBLIC_API_URL=https://${API_DOMAIN}
NEXT_PUBLIC_WS_URL=wss://${WS_DOMAIN}
NEXT_PUBLIC_APP_URL=https://${DOMAIN}

# ─── OAuth ──────────────────────────────────────────────────
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
GOOGLE_REDIRECT_URI=https://${API_DOMAIN}/auth/google/callback
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
GITHUB_REDIRECT_URI=https://${API_DOMAIN}/auth/github/callback
GITHUB_COPILOT_REDIRECT_URI=https://${API_DOMAIN}/auth/github/copilot/callback
GITHUB_REPO_REDIRECT_URI=https://api.${DOMAIN}/auth/github/repo/callback

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
DOABLE_DOMAIN=${DOMAIN}
PUBLISH_SUBDOMAIN_PREFIX=${PUBLISH_PREFIX}

# ─── Cloudflare DNS (appended by Step 10 after tunnel creation) ────
# CLOUDFLARED_TUNNEL_ID, CF_API_TOKEN, CF_ZONE_ID are written below.

# ─── Environment ───────────────────────────────────────────
NODE_ENV=development

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
# `doable` user (HOME=/home/doable), so without this override puppeteer
# looks in /home/doable/.cache/puppeteer and reports "Could not find
# Chrome (ver ...)". Pin a shared, world-readable cache dir so a single
# `npx puppeteer browsers install chrome` run during setup-server.sh
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
  # Recompute API/WS domains from NEXT_PUBLIC_* if still unset
  : "${DOMAIN:=${NEXT_PUBLIC_APP_URL#https://}}"
  DOMAIN="${DOMAIN%/}"
  api_host="${NEXT_PUBLIC_API_URL#https://}"
  api_host="${api_host%/}"
  : "${API_DOMAIN:=${api_host}}"
  ws_host="${NEXT_PUBLIC_WS_URL#wss://}"
  ws_host="${ws_host%/}"
  : "${WS_DOMAIN:=${ws_host}}"
fi
cat > "${INSTALL_DIR}/apps/web/.env.local" << WEBENVEOF
NEXT_PUBLIC_API_URL=https://${API_DOMAIN}
NEXT_PUBLIC_WS_URL=wss://${WS_DOMAIN}
NEXT_PUBLIC_APP_URL=https://${DOMAIN}
WEBENVEOF
chown doable:doable "${INSTALL_DIR}/apps/web/.env.local" 2>/dev/null || true

# ─── Step 9: Install deps & migrate ──────────────────────────
info "Step 9/13: Installing dependencies..."

cd "$INSTALL_DIR"
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
info "Building Next.js..."
cd "$INSTALL_DIR/apps/web"
rm -rf .next .turbo
env -u NODE_ENV NODE_ENV=production pnpm build
cd "$INSTALL_DIR"
ok "Next.js built"

# ─── Step 10: Cloudflare Tunnel ───────────────────────────────
if [ "$CONTAINER_MODE" != "1" ]; then
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
      TUNNEL_OUTPUT=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1)
      TUNNEL_ID=$(echo "$TUNNEL_OUTPUT" | grep -oP '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
      ok "Created tunnel: $TUNNEL_NAME ($TUNNEL_ID)"
    fi
  fi

  # DNS routes for base domain, API, and WebSocket.
  # NOTE: No wildcard *.doable.me route — each deploy creates its own
  # per-hostname CNAME via the Cloudflare API so multiple servers
  # (prod, dev, staging) can coexist under the same domain.
  for HOSTNAME in "$DOMAIN" "$API_DOMAIN" "$WS_DOMAIN"; do
    cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" 2>&1 | grep -v "already exists" || true
  done

  ok "DNS routes configured for ${DOMAIN}, ${API_DOMAIN}, ${WS_DOMAIN}"

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
  - hostname: "*.${DOMAIN}"
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
  DNS_MODE="${DNS_MODE:-per_publish}"
  if [[ "$DNS_MODE" == "wildcard" ]]; then
    if [[ -z "$CF_API_TOKEN" || -z "$CF_ZONE_ID" || -z "$TUNNEL_ID" ]]; then
      warn "DNS_MODE=wildcard requested but CF_API_TOKEN / CF_ZONE_ID / TUNNEL_ID not all set — skipping wildcard auto-setup."
    else
      # Warn but don't abort on multi-level publish domain. Universal SSL
      # covers <zone> + *.<zone>; *.staging.doable.me needs ACM.
      DOMAIN_LABEL_COUNT=$(echo "$DOMAIN" | tr '.' '\n' | wc -l)
      if [[ "$DOMAIN_LABEL_COUNT" -gt 2 ]]; then
        warn "DOMAIN=${DOMAIN} is multi-level. *.${DOMAIN} is NOT covered by free Universal SSL — enable Cloudflare Advanced Certificate Manager on the zone, or browsers will fail with SSL_VERSION_OR_CIPHER_MISMATCH on published sites."
      fi

      WILDCARD_NAME="*.${DOMAIN}"
      WILDCARD_TARGET="${TUNNEL_ID}.cfargotunnel.com"
      CF_API="https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records"
      # Look up existing CNAME (idempotent re-run safety). asterisk URL-encoded.
      EXISTING_ID=$(curl -fsS -H "Authorization: Bearer ${CF_API_TOKEN}" \
        "${CF_API}?type=CNAME&name=%2A.${DOMAIN}" 2>/dev/null \
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

      # Persist dns_mode='wildcard' in platform_settings so the deploy
      # pipeline skips per-publish CF API calls. Migration 081 already
      # ran in Step 9. ON CONFLICT makes this idempotent.
      PGPASSWORD="${DB_PASS}" psql -h localhost -U doable -d doable -c \
        "INSERT INTO platform_settings (key, value) VALUES ('dns_mode', 'wildcard') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();" \
        >/dev/null 2>&1 \
        && ok "Persisted dns_mode='wildcard' in platform_settings" \
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
# Bound to 127.0.0.1 — only reachable via Cloudflare Tunnel
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

systemctl enable caddy
systemctl restart caddy

ok "Caddy configured on :8080 for *.${DOMAIN} → ${INSTALL_DIR}/sites/"

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

# Chown install dir to doable:doable (skip heavy dirs for speed)
find "${INSTALL_DIR}" \
  -not \( -name node_modules -prune \) \
  -not \( -name .next -prune \) \
  -not \( -name .turbo -prune \) \
  -maxdepth 6 \
  -print0 2>/dev/null | xargs -0 chown doable:doable 2>/dev/null || \
  chown -R doable:doable "${INSTALL_DIR}" 2>/dev/null || true
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
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
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
    if find /var/cache/doable/puppeteer/chrome -name chrome -type f -executable 2>/dev/null | grep -q .; then
      ok "Chrome installed at /var/cache/doable/puppeteer (thumbnails enabled)"
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
if [ "$CONTAINER_MODE" != "1" ]; then
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
if [ "$CONTAINER_MODE" = "1" ]; then
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
  if [ -f "${INSTALL_DIR}/deploy/apparmor/doable-ai-bash" ]; then
    install -m 0644 -o root -g root \
      "${INSTALL_DIR}/deploy/apparmor/doable-ai-bash" \
      /etc/apparmor.d/doable-ai-bash
    if apparmor_parser -r /etc/apparmor.d/doable-ai-bash 2>&1 | tee /tmp/aa.log; then
      ok "AppArmor profile 'doable-ai-bash' loaded"
    else
      warn "apparmor_parser failed: $(tail -1 /tmp/aa.log) — profile staged but inactive"
    fi
  else
    warn "deploy/apparmor/doable-ai-bash missing in repo — skipping MAC profile install"
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
  # The canonical source lives at setup-v3/sandbox-spawn — we copy it and
  # rewrite PROJECTS_PREFIX to match INSTALL_DIR so paths align with this
  # install (the upstream default is /opt/doable/services/api/projects).
  if [ -f "${INSTALL_DIR}/setup-v3/sandbox-spawn" ]; then
    sed "s|^PROJECTS_PREFIX=.*|PROJECTS_PREFIX=\"${INSTALL_DIR}/services/api/projects\"|" \
      "${INSTALL_DIR}/setup-v3/sandbox-spawn" > /opt/doable/bin/sandbox-spawn
    chmod 0755 /opt/doable/bin/sandbox-spawn
    chown root:root /opt/doable/bin/sandbox-spawn
    ok "sandbox-spawn helper installed (PROJECTS_PREFIX=${INSTALL_DIR}/services/api/projects)"
  else
    warn "setup-v3/sandbox-spawn missing in repo — preview/dev-server jails will run as the API user (no UID drop)"
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
# - chown -R <uid>:<uid> projects/*: per-project ownership flip for UID drop
# - chown -R doable:doable apps/web/.next, .turbo: self-heal stale root-owned
#   Next.js artifacts at start.sh boot (prevents "rm: Permission denied" silent
#   build failure that surfaces externally as 502 on /dashboard).
Cmnd_Alias DOABLE_SANDBOX = /opt/doable/bin/sandbox-mount, /opt/doable/bin/sandbox-spawn, /usr/bin/chown -R [0-9]*\:[0-9]* ${INSTALL_DIR}/services/api/projects/*, /usr/bin/chown -R [0-9]*\:[0-9]* /opt/doable/projects/*, /usr/bin/chown -R doable\:doable ${INSTALL_DIR}/apps/web/.next, /usr/bin/chown -R doable\:doable ${INSTALL_DIR}/apps/web/.turbo, /bin/chown -R doable\:doable ${INSTALL_DIR}/apps/web/.next, /bin/chown -R doable\:doable ${INSTALL_DIR}/apps/web/.turbo
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

# ─── Step 13: Start everything ────────────────────────────────
info "Step 13/13: Starting services..."

if [ "$CONTAINER_MODE" != "1" ]; then
  systemctl start cloudflared 2>/dev/null || systemctl restart cloudflared
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

  # Final health check
  WEB_STATUS=$(timeout 30 curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
  API_STATUS=$(timeout 10 curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/ 2>/dev/null || echo "000")
  CF_STATUS=$(timeout 15 curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/" 2>/dev/null || echo "000")
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
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                  Setup Complete!                         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Web (local):    http://localhost:3000  → HTTP ${WEB_STATUS}"
echo "  API (local):    http://localhost:4000  → HTTP ${API_STATUS}"
echo "  Public:         https://${DOMAIN}      → HTTP ${CF_STATUS}"
echo "  API Public:     https://${API_DOMAIN}"
echo "  WebSocket:      wss://${WS_DOMAIN}"
echo ""
echo "  Tunnel:         ${TUNNEL_NAME} (${TUNNEL_ID})"
echo ""
echo "  ── Useful commands ──"
echo "  tmux attach -t doable          # View live logs"
echo "  systemctl restart doable       # Restart the app"
echo "  systemctl restart cloudflared  # Restart the tunnel"
echo "  systemctl status doable cloudflared  # Check status"
echo "  systemctl list-timers doable-watchdog*  # Watchdog timer"
echo "  tail -f /var/log/doable/watchdog.log    # Watchdog log"
echo "  ufw status                          # Check firewall rules"
echo ""

if [[ "$WEB_STATUS" != "200" ]]; then
  warn "Web server not ready yet — it may still be compiling. Give it a minute."
fi

if [[ "$CF_STATUS" == "000" ]]; then
  warn "Public URL not reachable yet — DNS propagation may take a few minutes."
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
echo "  3. If using GitHub OAuth, update the callback URL to:"
echo "     https://${API_DOMAIN}/auth/github/callback"
echo "     and the repo-scope callback to:"
echo "     https://${API_DOMAIN}/auth/github/repo/callback"
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
check_creds "GitHub login + repo import"  "GITHUB_CLIENT_ID" "${GITHUB_CLIENT_ID:-}" "https://github.com/settings/applications/new (callback: https://${API_DOMAIN}/auth/github/callback)"
check_creds "Anthropic AI"                "ANTHROPIC_API_KEY" "${ANTHROPIC_API_KEY:-}" "https://console.anthropic.com/settings/keys"
check_creds "OpenAI AI"                   "OPENAI_API_KEY" "${OPENAI_API_KEY:-}" "https://platform.openai.com/api-keys"
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
