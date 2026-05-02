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

# ─── Pre-flight checks ─────────────────────────────────────────
[[ $EUID -ne 0 ]] && err "This script must be run as root"
[[ ! -f /etc/os-release ]] && err "Cannot detect OS"
source /etc/os-release
[[ "$ID" != "ubuntu" ]] && err "This script is designed for Ubuntu (detected: $ID)"

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
read -rp "Domain for Doable (e.g., doable.me): " DOMAIN
[[ -z "$DOMAIN" ]] && err "Domain is required"

read -rp "API subdomain [api]: " API_SUB
API_SUB="${API_SUB:-api}"

read -rp "WebSocket subdomain [ws]: " WS_SUB
WS_SUB="${WS_SUB:-ws}"

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

API_DOMAIN="${API_SUB}.${DOMAIN}"
WS_DOMAIN="${WS_SUB}.${DOMAIN}"
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
INTERNAL_SECRET=$(openssl rand -hex 16)

echo ""
info "Configuration:"
echo "  Domain:     https://${DOMAIN}"
echo "  API:        https://${API_DOMAIN}"
echo "  WebSocket:  wss://${WS_DOMAIN}"
echo "  Repo:       ${REPO}"
echo ""
read -rp "Proceed? [Y/n]: " CONFIRM
[[ "${CONFIRM,,}" == "n" ]] && exit 0

# ─── Step 1: System packages ───────────────────────────────────
info "Step 1/13: Installing system packages..."

export DEBIAN_FRONTEND=noninteractive

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
  libgbm1 libcairo2 libpango-1.0-0 libasound2t64 \
  libxshmfence1 libnspr4 libnss3 libdrm2 libxkbcommon0 \
  fonts-liberation 2>/dev/null || true

# Python deps for FastAPI/Django framework deploys. The Wave 17 Python
# venv setup in services/api/src/deploy/adapters/doable-cloud.ts shells
# out to `python3 -m venv` per published Python project; on Ubuntu that
# fails without python3-venv installed (verified on a fresh 24.04 host).
apt-get install -y python3-venv python3-pip 2>/dev/null || true

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

systemctl enable postgresql fail2ban
systemctl start postgresql fail2ban

ok "Packages installed: node $(node -v), pnpm $(pnpm -v), psql $(psql --version | awk '{print $3}'), cloudflared $(cloudflared --version 2>&1 | awk '{print $3}')"

# ─── Step 2: Firewall (UFW) ──────────────────────────────────
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
# Verify SSH rule is actually in the ruleset before enabling
if ! ufw status | grep -qE "22/tcp.*ALLOW"; then
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
cat > /etc/fail2ban/jail.local << F2BEOF
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600
F2BEOF

systemctl restart fail2ban
ok "fail2ban configured: SSH brute-force protection active"

# ─── Step 4: Swap ──────────────────────────────────────────────
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

# ─── Step 5: PostgreSQL setup ──────────────────────────────────
info "Step 5/13: Setting up PostgreSQL..."

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='doable'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER doable WITH PASSWORD '${DB_PASS}' CREATEDB;"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='doable'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE doable OWNER doable;"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE doable TO doable;" &>/dev/null

ok "Database ready (user: doable, db: doable)"

# ─── Step 6: GitHub CLI auth ──────────────────────────────────
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
  read -rp "Authenticate now? [Y/n]: " GH_AUTH
  if [[ "${GH_AUTH,,}" != "n" ]]; then
    gh auth login
  else
    err "GitHub auth required to continue"
  fi
fi

ok "GitHub CLI authenticated"

# ─── Step 7: Clone repo ───────────────────────────────────────
info "Step 7/13: Cloning repository..."

INSTALL_DIR="${INSTALL_DIR:-$HOME/doable}"

if [[ -d "$INSTALL_DIR" ]]; then
  warn "Directory $INSTALL_DIR already exists."
  read -rp "Remove and re-clone? [y/N]: " RECLONE
  if [[ "${RECLONE,,}" == "y" ]]; then
    rm -rf "$INSTALL_DIR"
    gh repo clone "$REPO" "$INSTALL_DIR"
  fi
else
  gh repo clone "$REPO" "$INSTALL_DIR"
fi

ok "Repo cloned to $INSTALL_DIR"

# ─── Step 8: Environment files ────────────────────────────────
info "Step 8/13: Writing environment files..."

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

# ─── API Server ─────────────────────────────────────────────
API_PORT=4000
API_HOST=127.0.0.1
CORS_ORIGINS=https://${DOMAIN}

# ─── WebSocket Server ──────────────────────────────────────
WS_PORT=4001
WS_HOST=127.0.0.1
WS_INTERNAL_URL=http://127.0.0.1:${WS_PORT:-4001}
API_URL=http://127.0.0.1:${API_PORT:-4000}

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
ENVEOF

# Next.js needs NEXT_PUBLIC_* in its own directory
cat > "${INSTALL_DIR}/apps/web/.env.local" << WEBENVEOF
NEXT_PUBLIC_API_URL=https://${API_DOMAIN}
NEXT_PUBLIC_WS_URL=wss://${WS_DOMAIN}
NEXT_PUBLIC_APP_URL=https://${DOMAIN}
WEBENVEOF

ok "Environment files created (.env + apps/web/.env.local)"

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

# Build Next.js production bundle
info "Building Next.js..."
cd "$INSTALL_DIR/apps/web"
pnpm build
cd "$INSTALL_DIR"
ok "Next.js built"

# ─── Step 10: Cloudflare Tunnel ───────────────────────────────
info "Step 10/13: Setting up Cloudflare Tunnel..."

if [[ ! -f /root/.cloudflared/cert.pem ]]; then
  warn "You need to authenticate with Cloudflare."
  echo "  A browser URL will be shown — open it and authorize."
  echo ""
  cloudflared tunnel login
fi

ok "Cloudflare authenticated"

# Create tunnel
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

# DNS routes (including wildcard for published sites)
for HOSTNAME in "$DOMAIN" "$API_DOMAIN" "$WS_DOMAIN" "*.${DOMAIN}"; do
  cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" 2>&1 | grep -v "already exists" || true
done

ok "DNS routes configured for ${DOMAIN}, ${API_DOMAIN}, ${WS_DOMAIN}, *.${DOMAIN}"

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

# ─── Step 11: Publish infrastructure (Caddy + sites) ─────────
info "Step 11/13: Setting up publish infrastructure..."

# Create sites directory for published projects
mkdir -p "${INSTALL_DIR}/sites"
mkdir -p "${INSTALL_DIR}/services/api/projects"
mkdir -p "${INSTALL_DIR}/services/api/thumbnails"
chmod 755 /root
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
User=root
WorkingDirectory=${INSTALL_DIR}
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=${INSTALL_DIR}/start.sh
ExecStop=/usr/bin/tmux kill-session -t doable
RemainAfterExit=yes
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
SVCEOF

# Doable watchdog timer — checks service health every 2 minutes
chmod +x "${INSTALL_DIR}/watchdog.sh"

cat > /etc/systemd/system/doable-watchdog.service << WDEOF
[Unit]
Description=Doable Watchdog — health check and auto-recovery
After=doable.service

[Service]
Type=oneshot
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/watchdog.sh
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

cat > /etc/systemd/system/doable-app@.service << APPSVCEOF
[Unit]
Description=Doable user app %i
After=network-online.target
PartOf=doable-apps.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
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
PrivateDevices=yes

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
cloudflared service install 2>/dev/null || true

systemctl daemon-reload
systemctl enable doable.service doable-watchdog.timer cloudflared doable-apps.target 2>/dev/null

ok "Systemd services created and enabled (app + watchdog timer + tunnel + per-app template)"

# ─── Step 13: Start everything ────────────────────────────────
info "Step 13/13: Starting services..."

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
echo "  tail -f /var/log/doable-watchdog.log    # Watchdog log"
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
echo ""
