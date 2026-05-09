#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  Doable — per-org environment, secure-by-default Ubuntu setup       ║
# ║                                                                      ║
# ║  Target:   <VPS_IP> (Ubuntu 24.04, login user `ubuntu`)             ║
# ║  Env name: ${ENV_NAME} (e.g. myorg, qa, prod)                       ║
# ║  Hosts:    <env>.doable.me / <env>-api.doable.me / <env>-ws.…       ║
# ║  App dir:  /opt/doable     (NOT /root/doable)                       ║
# ║  Run-as:   doable system user (NOT root)                            ║
# ║                                                                      ║
# ║  Idempotent — re-running is safe.                                    ║
# ╚══════════════════════════════════════════════════════════════════════╝
#
# Drop in via:
#   scp setup-server-v2.sh ubuntu@<VPS_IP>:/tmp/
#   ssh ubuntu@<VPS_IP> 'sudo bash /tmp/setup-server-v2.sh'
#
# After it finishes, follow the operator checklist printed at the end.

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────
# Operators: override with `DOABLE_ENV_NAME=<org> bash setup-server-v2.sh`
ENV_NAME="${DOABLE_ENV_NAME:-myorg}"
DOABLE_DOMAIN="doable.me"
WEB_HOSTNAME="${ENV_NAME}.${DOABLE_DOMAIN}"
API_HOSTNAME="${ENV_NAME}-api.${DOABLE_DOMAIN}"
WS_HOSTNAME="${ENV_NAME}-ws.${DOABLE_DOMAIN}"
PUBLISH_PREFIX="${ENV_NAME}-"

APP_DIR="/opt/doable"
APP_USER="doable"
APP_GROUP="doable"
APP_LOG_DIR="/var/log/doable"

# Operator/admin user (in addition to the default `ubuntu` account)
ADMIN_USER="douser"

# Node major version
NODE_MAJOR="22"

# pnpm version (matches setup-server.sh)
PNPM_VERSION="9.15.4"

# ─── Helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ts()   { date +'%Y-%m-%dT%H:%M:%S%z'; }
info() { echo -e "${CYAN}[$(ts)] [INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[$(ts)] [OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(ts)] [WARN]${NC} $*"; }
err()  { echo -e "${RED}[$(ts)] [ERROR]${NC} $*" 1>&2; exit 1; }
phase(){ echo ""; echo -e "${CYAN}════════ [$(ts)] $* ════════${NC}"; }

# ─── Pre-flight ──────────────────────────────────────────────────────────
phase "Pre-flight checks"

[[ $EUID -ne 0 ]] && err "Must run as root (use sudo)."
[[ ! -f /etc/os-release ]] && err "Cannot detect OS."
. /etc/os-release
[[ "${ID}" != "ubuntu" ]] && err "Ubuntu only (detected: ${ID})."
ok "Running on Ubuntu ${VERSION_ID:-?}"

export DEBIAN_FRONTEND=noninteractive

# ─── Phase 1: Apt update + system packages ───────────────────────────────
phase "Phase 1/15  apt update + base packages"

apt-get update -y

# Core deps that don't need third-party repos.
apt-get install -y \
  ca-certificates curl gnupg lsb-release apt-transport-https \
  build-essential git jq tmux fail2ban unattended-upgrades ufw \
  squid nftables \
  python3 python3-venv python3-pip \
  postgresql-16 postgresql-contrib postgresql-16-pgvector

# Node.js 22 via NodeSource — only install if missing or wrong major.
if ! command -v node >/dev/null 2>&1 \
   || [ "$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)" -lt "${NODE_MAJOR}" ]; then
  info "Installing Node.js ${NODE_MAJOR}.x via NodeSource..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
ok "Node.js: $(node -v)"

# pnpm via npm (kept aligned with setup-server.sh).
if ! command -v pnpm >/dev/null 2>&1 \
   || [ "$(pnpm -v 2>/dev/null)" != "${PNPM_VERSION}" ]; then
  info "Installing pnpm@${PNPM_VERSION}..."
  npm install -g "pnpm@${PNPM_VERSION}"
fi
ok "pnpm: $(pnpm -v)"

# Caddy (third-party repo).
if ! command -v caddy >/dev/null 2>&1; then
  info "Installing Caddy..."
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
ok "Caddy: $(caddy version | head -1)"

# cloudflared (third-party repo).
if ! command -v cloudflared >/dev/null 2>&1; then
  info "Installing cloudflared..."
  mkdir -p /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
    | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
    > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -y
  apt-get install -y cloudflared
fi
ok "cloudflared: $(cloudflared --version 2>&1 | head -1)"

# Puppeteer/Chrome shared libs (thumbnail/PDF rendering will run as `doable`,
# not root — this is just the runtime libs apt would pull anyway).
apt-get install -y \
  libatk1.0-0 libatk-bridge2.0-0 libcups2 libatspi2.0-0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libcairo2 libpango-1.0-0 libasound2t64 \
  libxshmfence1 libnspr4 libnss3 libdrm2 libxkbcommon0 \
  fonts-liberation || true

ok "Base packages installed"

# ─── Phase 2: Doable system user ─────────────────────────────────────────
phase "Phase 2/15  Create doable system user (NOT root)"

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  info "Creating system user ${APP_USER}..."
  useradd --system --shell /usr/sbin/nologin \
    --home-dir "${APP_DIR}" --create-home \
    --user-group "${APP_USER}"
  ok "Created ${APP_USER} (uid=$(id -u "${APP_USER}"))"
else
  ok "User ${APP_USER} already exists (uid=$(id -u "${APP_USER}"))"
fi

# Ensure app dir exists with correct ownership/perms.
install -d -o "${APP_USER}" -g "${APP_GROUP}" -m 0755 "${APP_DIR}"
install -d -o "${APP_USER}" -g "${APP_GROUP}" -m 0755 "${APP_DIR}/sites"
install -d -o "${APP_USER}" -g "${APP_GROUP}" -m 0755 "${APP_DIR}/services/api/projects"
install -d -o "${APP_USER}" -g "${APP_GROUP}" -m 0755 "${APP_DIR}/services/api/thumbnails"
install -d -o "${APP_USER}" -g "${APP_GROUP}" -m 0755 "${APP_LOG_DIR}"

# Marker so a follow-up rsync/scp of the repo can land cleanly.
if [ ! -e "${APP_DIR}/.placeholder" ]; then
  install -o "${APP_USER}" -g "${APP_GROUP}" -m 0644 /dev/null "${APP_DIR}/.placeholder"
fi
ok "App layout under ${APP_DIR} owned by ${APP_USER}:${APP_GROUP}"

# ─── Phase 3: Admin sudo user (douser) ───────────────────────────────────
phase "Phase 3/15  Provision sudo admin user '${ADMIN_USER}'"

if ! id -u "${ADMIN_USER}" >/dev/null 2>&1; then
  info "Creating sudo user ${ADMIN_USER}..."
  useradd -m -s /bin/bash "${ADMIN_USER}"
  usermod -aG sudo "${ADMIN_USER}"
  # Passwordless sudo for ops convenience; matches the existing `ubuntu` user.
  echo "${ADMIN_USER} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-${ADMIN_USER}"
  chmod 0440 "/etc/sudoers.d/90-${ADMIN_USER}"
  ok "Created ${ADMIN_USER} with passwordless sudo"
else
  ok "User ${ADMIN_USER} already exists"
fi

# Copy SSH authorized_keys from /home/ubuntu so login works immediately.
UBUNTU_AUTH="/home/ubuntu/.ssh/authorized_keys"
ADMIN_SSH_DIR="/home/${ADMIN_USER}/.ssh"
ADMIN_AUTH="${ADMIN_SSH_DIR}/authorized_keys"
if [ -f "${UBUNTU_AUTH}" ]; then
  install -d -o "${ADMIN_USER}" -g "${ADMIN_USER}" -m 0700 "${ADMIN_SSH_DIR}"
  install -o "${ADMIN_USER}" -g "${ADMIN_USER}" -m 0600 "${UBUNTU_AUTH}" "${ADMIN_AUTH}"
  ok "Seeded ${ADMIN_AUTH} from ${UBUNTU_AUTH}"
else
  warn "${UBUNTU_AUTH} not found — you must add an SSH key to ${ADMIN_AUTH} manually before disabling root login."
fi

# ─── Phase 4: PostgreSQL ─────────────────────────────────────────────────
phase "Phase 4/15  PostgreSQL: bind localhost, create db + user"

systemctl enable --now postgresql

# Ensure listen_addresses is localhost-only.
PG_CONF="$(find /etc/postgresql -name postgresql.conf 2>/dev/null | head -1 || true)"
if [ -n "${PG_CONF}" ]; then
  if grep -qE "^[[:space:]]*listen_addresses" "${PG_CONF}"; then
    sed -i "s|^[[:space:]]*listen_addresses.*|listen_addresses = 'localhost'|" "${PG_CONF}"
  elif grep -qE "^[[:space:]]*#listen_addresses" "${PG_CONF}"; then
    sed -i "s|^[[:space:]]*#listen_addresses.*|listen_addresses = 'localhost'|" "${PG_CONF}"
  else
    echo "listen_addresses = 'localhost'" >> "${PG_CONF}"
  fi
  systemctl restart postgresql
  ok "postgresql.conf: listen_addresses = 'localhost'"
else
  warn "Could not locate postgresql.conf — verify listen_addresses manually."
fi

# Random DB password, persisted to a 600 file readable only by root for the
# .env render step below. Re-runs reuse the same password to keep the DB usable.
DB_PASS_FILE="/etc/doable/.db_pass"
install -d -o root -g root -m 0700 "$(dirname "${DB_PASS_FILE}")"
if [ ! -s "${DB_PASS_FILE}" ]; then
  umask 077
  openssl rand -hex 32 > "${DB_PASS_FILE}"
  chmod 0600 "${DB_PASS_FILE}"
fi
DB_PASS="$(cat "${DB_PASS_FILE}")"

# Idempotent role + database creation.
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='doable'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER doable WITH PASSWORD '${DB_PASS}' CREATEDB;"
# Always sync the password to the random value (in case rerun and previous runs left a default).
sudo -u postgres psql -c "ALTER USER doable WITH PASSWORD '${DB_PASS}';" >/dev/null

sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='doable'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE doable OWNER doable;"

# Extensions (require superuser).
for ext in pgcrypto vector pg_trgm; do
  sudo -u postgres psql -d doable -c "CREATE EXTENSION IF NOT EXISTS ${ext};" >/dev/null 2>&1 || true
done

ok "Postgres: role=doable, db=doable, password persisted at ${DB_PASS_FILE} (mode 600)"

# ─── Phase 5: UFW firewall ───────────────────────────────────────────────
phase "Phase 5/15  UFW firewall (deny incoming, allow OpenSSH)"

# Always allow SSH FIRST to avoid lockout.
ufw allow OpenSSH >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null

# Verify SSH rule is staged before enabling. `ufw status` only lists rules
# when UFW is active — pre-enable, use `ufw show added` which lists
# pending rules regardless of active state.
if ! ufw show added | grep -qE "(allow OpenSSH|allow 22/tcp)"; then
  err "SAFETY ABORT: SSH/OpenSSH rule missing from UFW; refusing to enable."
fi

ufw --force enable
ok "UFW active; SSH allowed; everything else denied (services proxy via Cloudflare Tunnel)."
ufw status numbered | sed 's/^/    /'

# ─── Phase 6: Squid (registry-only egress proxy) ─────────────────────────
phase "Phase 6/15  Squid registry-only proxy on 127.0.0.1:3128"

# Reference: servertodo/04-egress-jail.md.
cat > /etc/squid/squid.conf <<'SQUIDCONF'
# Doable build-time/runtime allowlist proxy (servertodo/04).
# Listens loopback-only — sandbox UIDs reach it via HTTPS_PROXY env.
http_port 127.0.0.1:3128

acl allowed_dst dstdomain registry.npmjs.org
acl allowed_dst dstdomain registry.yarnpkg.com
acl allowed_dst dstdomain pypi.org
acl allowed_dst dstdomain files.pythonhosted.org
acl allowed_dst dstdomain github.com
acl allowed_dst dstdomain codeload.github.com
acl allowed_dst dstdomain raw.githubusercontent.com
acl allowed_dst dstdomain api.github.com
acl allowed_dst dstdomain objects.githubusercontent.com
acl allowed_dst dstdomain cdn.jsdelivr.net
acl allowed_dst dstdomain unpkg.com

acl SSL_ports port 443
acl Safe_ports port 80
acl Safe_ports port 443
acl CONNECT method CONNECT

http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
http_access allow allowed_dst
http_access deny all

access_log /var/log/squid/access.log squid
cache deny all
forwarded_for delete
via off
SQUIDCONF

systemctl enable --now squid
systemctl restart squid
sleep 1
if ss -tlnp 2>/dev/null | grep -qE '127\.0\.0\.1:3128'; then
  ok "Squid listening on 127.0.0.1:3128"
else
  warn "Squid did not bind 127.0.0.1:3128 — check 'systemctl status squid'."
fi

# ─── Phase 7: Caddy (publish wildcard, loopback only) ────────────────────
phase "Phase 7/15  Caddy *.doable.me wildcard server (loopback)"

# Sites root for published projects (static + framework dist output).
install -d -o "${APP_USER}" -g "${APP_GROUP}" -m 0755 "${APP_DIR}/sites"

# Caddyfile binds 127.0.0.1:8080; cloudflared sends *.doable.me here.
# {re.subdomain.1} captures the FULL subdomain (e.g. <env>-mysite) so per-env
# prefixes work — see CLAUDE.md publish-naming rule.
DOMAIN_ESC="${DOABLE_DOMAIN//./\\.}"
cat > /etc/caddy/Caddyfile <<CADDYCONF
{
    auto_https off
    admin 127.0.0.1:2019
}

:8080 {
    bind 127.0.0.1

    @has_subdomain {
        header_regexp subdomain Host ^([a-z0-9][-a-z0-9]*)\.${DOMAIN_ESC}\$
    }

    handle @has_subdomain {
        root * ${APP_DIR}/sites/{re.subdomain.1}/live
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
CADDYCONF

# Caddy needs to read the sites tree. The `caddy` system user is created by
# the Caddy package; add it to the doable group so it can read site files.
if id caddy >/dev/null 2>&1; then
  usermod -a -G "${APP_GROUP}" caddy || true
fi

systemctl enable --now caddy
systemctl restart caddy
ok "Caddy serving ${APP_DIR}/sites/<subdomain>/live on 127.0.0.1:8080"

# ─── Phase 8: cloudflared placeholder config ─────────────────────────────
phase "Phase 8/15  cloudflared placeholder (operator wires tunnel later)"

install -d -o root -g root -m 0755 /etc/cloudflared
if [ ! -f /etc/cloudflared/config.yml ]; then
  cat > /etc/cloudflared/config.yml <<CFCONF
# Doable cloudflared ingress for the ${ENV_NAME} environment.
# Operator MUST replace TUNNEL_UUID once \`cloudflared tunnel create doable-${ENV_NAME}\` runs.
# TUNNEL_UUID=PENDING_FROM_OPERATOR

# tunnel: <uuid>
# credentials-file: /etc/cloudflared/<uuid>.json

ingress:
  - hostname: ${API_HOSTNAME}
    service: http://127.0.0.1:4000
    originRequest:
      noTLSVerify: true
  - hostname: ${WS_HOSTNAME}
    service: http://127.0.0.1:4001
    originRequest:
      noTLSVerify: true
  - hostname: ${WEB_HOSTNAME}
    service: http://127.0.0.1:3000
    originRequest:
      noTLSVerify: true
  - hostname: "*.${DOABLE_DOMAIN}"
    service: http://127.0.0.1:8080
    originRequest:
      noTLSVerify: true
  - service: http_status:404
CFCONF
  ok "Placeholder /etc/cloudflared/config.yml written (TUNNEL_UUID=PENDING_FROM_OPERATOR)"
else
  ok "Existing /etc/cloudflared/config.yml preserved (idempotent)."
fi

# Don't enable cloudflared yet — UUID and creds aren't wired.
ok "cloudflared installed; service NOT enabled (operator step)."

# ─── Phase 9: .env scaffolding (mode 600 doable:doable) ──────────────────
phase "Phase 9/15  /opt/doable/.env (mode 600 doable:doable)"

ENV_FILE="${APP_DIR}/.env"

# Generate fresh secrets only if .env doesn't already exist (idempotent
# rerun mustn't rotate JWT_SECRET et al — that would invalidate every
# existing session/token).
if [ ! -f "${ENV_FILE}" ]; then
  JWT_SECRET="$(openssl rand -hex 32)"
  ENCRYPTION_KEY="$(openssl rand -hex 32)"
  INTERNAL_SECRET="$(openssl rand -hex 32)"
  PROJECT_JWT_SECRET="$(openssl rand -hex 32)"

  # Write atomically with restrictive perms BEFORE content lands.
  TMP_ENV="$(mktemp)"
  chmod 0600 "${TMP_ENV}"
  cat > "${TMP_ENV}" <<ENVEOF
# ─── Doable .env — env=${ENV_NAME} — generated $(ts) ─────────────
# Mode 0600 doable:doable. Do not chmod 644; do not commit.

# Database
DATABASE_URL=postgres://doable:${DB_PASS}@localhost:5432/doable
DATABASE_POOL_SIZE=20

# Auth / JWT  (PROJECT_JWT_SECRET is split per servertodo + secureIntegrationsPRD/07 #2/#3)
JWT_SECRET=${JWT_SECRET}
PROJECT_JWT_SECRET=${PROJECT_JWT_SECRET}
JWT_ISSUER=doable
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

# Encryption / Internal Auth
ENCRYPTION_KEY=${ENCRYPTION_KEY}
INTERNAL_SECRET=${INTERNAL_SECRET}

# API Server (loopback only — Cloudflare Tunnel proxies in)
API_PORT=4000
API_HOST=127.0.0.1
CORS_ORIGINS=https://${WEB_HOSTNAME}

# WebSocket Server
WS_PORT=4001
WS_HOST=127.0.0.1
WS_INTERNAL_URL=http://127.0.0.1:4001
API_URL=http://127.0.0.1:4000

# Next.js bind (used by start.sh)
WEB_HOSTNAME=127.0.0.1

# Public URLs (Cloudflare-naming rule: <env>-api/<env>-ws single-level)
NEXT_PUBLIC_APP_URL=https://${WEB_HOSTNAME}
NEXT_PUBLIC_API_URL=https://${API_HOSTNAME}
NEXT_PUBLIC_WS_URL=wss://${WS_HOSTNAME}

# Domain / Publish wildcard
DOABLE_DOMAIN=${DOABLE_DOMAIN}
PUBLISH_SUBDOMAIN_PREFIX=${PUBLISH_PREFIX}

# OAuth — fill from the per-env GitHub OAuth app and Google OAuth client.
# Each env has its own GitHub OAuth app (see reference_oauth_apps.md).
GOOGLE_CLIENT_ID=PLACEHOLDER_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=PLACEHOLDER_GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://${API_HOSTNAME}/auth/google/callback
GITHUB_CLIENT_ID=PLACEHOLDER_GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET=PLACEHOLDER_GITHUB_CLIENT_SECRET
GITHUB_REDIRECT_URI=https://${API_HOSTNAME}/auth/github/callback
GITHUB_COPILOT_REDIRECT_URI=https://${API_HOSTNAME}/auth/github/copilot/callback
GITHUB_REPO_REDIRECT_URI=https://${API_HOSTNAME}/auth/github/repo/callback

# AI providers
ANTHROPIC_API_KEY=PLACEHOLDER_ANTHROPIC_API_KEY
OPENAI_API_KEY=PLACEHOLDER_OPENAI_API_KEY
COPILOT_DEFAULT_MODEL=
COPILOT_CLI_PATH=
COPILOT_CLI_URL=

# Storage
S3_BUCKET=doable-uploads
S3_REGION=us-east-1
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_ENDPOINT=

# Stripe (leave blank until real keys are wired; billing routes degrade gracefully)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_MONTHLY_PRICE_ID=
STRIPE_PRO_YEARLY_PRICE_ID=
STRIPE_BUSINESS_MONTHLY_PRICE_ID=
STRIPE_BUSINESS_YEARLY_PRICE_ID=

# Cloudflare Tunnel — operator fills CLOUDFLARED_TUNNEL_ID after \`tunnel create\`
CLOUDFLARED_TUNNEL_ID=PENDING_FROM_OPERATOR

# Publish / Hosting
PROJECTS_ROOT=${APP_DIR}/services/api/projects
DOABLE_PROJECTS_DIR=${APP_DIR}/services/api/projects
SITES_DIR=${APP_DIR}/sites

# Hardening (Wave 27-30)
DOABLE_HARDENING=full
DOVAULT_BACKEND=systemd
BUILD_HTTP_PROXY=http://127.0.0.1:3128
HTTP_PROXY=http://127.0.0.1:3128
HTTPS_PROXY=http://127.0.0.1:3128
NO_PROXY=127.0.0.1,localhost,::1

# Email (operator fills)
EMAIL_PROVIDER=
EMAIL_FROM=Doable <noreply@${DOABLE_DOMAIN}>
EMAIL_SERVICE=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
RESEND_API_KEY=
GOOGLE_REFRESH_TOKEN=
GOOGLE_EMAIL_USER=

NODE_ENV=production
ENVEOF

  install -o "${APP_USER}" -g "${APP_GROUP}" -m 0600 "${TMP_ENV}" "${ENV_FILE}"
  rm -f "${TMP_ENV}"
  ok "Wrote ${ENV_FILE} (mode 600 ${APP_USER}:${APP_GROUP}) with fresh JWT/ENCRYPTION/INTERNAL/PROJECT_JWT secrets"
else
  # Existing .env: only re-assert ownership and mode. Don't rotate secrets.
  chown "${APP_USER}:${APP_GROUP}" "${ENV_FILE}"
  chmod 0600 "${ENV_FILE}"
  ok "Reusing existing ${ENV_FILE} (perms re-asserted: 600 ${APP_USER}:${APP_GROUP})"
fi

# Verify that the .env is NOT readable by a sandbox-range UID.
# We pick UID 10001 (the lowest dovault dev UID).
if ! id -u 10001 >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin \
    --uid 10001 --user-group doable-dev-1 2>/dev/null || true
fi
if setpriv --reuid=10001 --regid=10001 --clear-groups -- cat "${ENV_FILE}" >/dev/null 2>&1; then
  err "SECURITY: ${ENV_FILE} is readable by uid=10001. Aborting."
fi
ok "Verified: uid=10001 cannot read ${ENV_FILE}"

# ─── Phase 10: Sandbox UID pool + nft skuid egress jail ──────────────────
phase "Phase 10/15  Dev sandbox UIDs (10001-10100) + nft skuid egress jail"

# Pre-create only the lower-end pool we actually use today (10001..10100).
# The setup-server.sh main script provisions 1000; that's overkill for a
# fresh per-org host but the kernel doesn't require named users for setpriv,
# so any UID in 10001..65000 works at runtime.
for i in $(seq 1 100); do
  uid=$((10000 + i))
  user="doable-dev-${i}"
  if ! id "${user}" >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin \
      --uid "${uid}" --user-group "${user}" 2>/dev/null || true
  fi
done
ok "Sandbox UIDs 10001..10100 provisioned (named users for ergonomics)"

# nft skuid egress jail: deny outbound from sandbox UIDs except to:
#   - loopback (127.0.0.0/8, ::1)         — Squid + local services
#   - DNS via systemd-resolved on 127.0.0.53
#   - tcp/3128 (Squid registry proxy)
# Explicit GitHub / Cloudflare / AI provider hostnames are reached by
# resolving via DNS and going through Squid; no IP allowlisting needed
# at the nft layer because Squid enforces dstdomain at L7.
install -d -m 0755 /etc/nftables.d
cat > /etc/nftables.d/doable-egress.nft <<'NFTEOF'
# servertodo/04 — Doable sandbox skuid egress jail.
# Sandbox UIDs (10001-65000) may only reach loopback (Squid + DNS stub).
# Anything else from those UIDs is dropped, killing direct .env exfil paths.
table inet doable_egress {
  chain output {
    type filter hook output priority 0; policy accept;

    # Always-allow loopback (Squid 127.0.0.1:3128, services, DNS stub).
    oif "lo" accept

    # DNS via systemd-resolved stub (in case loopback isn't `lo` named).
    meta skuid 10001-65000 ip  daddr 127.0.0.53 udp dport 53 accept
    meta skuid 10001-65000 ip  daddr 127.0.0.53 tcp dport 53 accept

    # Squid registry proxy (defense-in-depth; usually caught by `oif lo`).
    meta skuid 10001-65000 ip  daddr 127.0.0.1   tcp dport 3128 accept

    # Everything else from sandbox UIDs is denied.
    meta skuid 10001-65000 counter drop
  }
}
NFTEOF

# Ensure /etc/nftables.conf includes our drop-in.
if ! grep -q '/etc/nftables.d/' /etc/nftables.conf 2>/dev/null; then
  echo 'include "/etc/nftables.d/*.nft"' >> /etc/nftables.conf
fi

# Validate before loading (failed parse leaves prior ruleset alone).
if nft -c -f /etc/nftables.conf; then
  systemctl enable --now nftables
  nft -f /etc/nftables.conf
  ok "nft skuid egress jail loaded (UIDs 10001-65000 blocked except loopback)"
else
  warn "nft validation failed; egress jail NOT loaded. Inspect: nft -c -f /etc/nftables.conf"
fi

# ─── Phase 11: systemd unit (User=doable, hardened) ──────────────────────
phase "Phase 11/15  /etc/systemd/system/doable.service (User=doable, hardened)"

cat > /etc/systemd/system/doable.service <<'SVCEOF'
[Unit]
Description=Doable platform (api + web + ws via tmux)
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service

[Service]
Type=forking
User=doable
Group=doable
WorkingDirectory=/opt/doable
EnvironmentFile=/opt/doable/.env
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/opt/doable/start.sh
ExecStop=/usr/bin/tmux kill-session -t doable
Restart=on-failure
RestartSec=10
RemainAfterExit=yes

# ─── Hardening (servertodo/02) ──────────────────────────────────────────
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictNamespaces=true
LockPersonality=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
ReadWritePaths=/opt/doable /var/log/doable
# MemoryDenyWriteExecute=false  # node JIT requires W^X off

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable doable.service
ok "doable.service installed; NOT started (operator scp's repo + start.sh)."

# ─── Phase 12: SSH posture (STAGED, sshd NOT restarted) ──────────────────
phase "Phase 12/15  SSH hardening (staged — operator restarts sshd manually)"

SSHD_CFG="/etc/ssh/sshd_config"
SSHD_DROPIN="/etc/ssh/sshd_config.d/99-doable-hardening.conf"
install -d -m 0755 /etc/ssh/sshd_config.d

# Use a drop-in file rather than rewriting the main sshd_config — Ubuntu's
# /etc/ssh/sshd_config already includes /etc/ssh/sshd_config.d/*.conf, and
# drop-ins are easier to revert if a key fails.
cat > "${SSHD_DROPIN}" <<'SSHDCONF'
# Doable hardening (servertodo/02 + reference SSH posture).
# STAGED — sshd will adopt these on next restart. Verify douser/ubuntu login
# with key-only first, then `systemctl restart ssh`.
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
SSHDCONF
chmod 0644 "${SSHD_DROPIN}"

# Verify the drop-in parses but DO NOT restart sshd.
if sshd -t -f "${SSHD_CFG}"; then
  ok "Staged ${SSHD_DROPIN} (sshd config syntax OK). sshd NOT restarted."
else
  warn "sshd -t failed — review ${SSHD_DROPIN} before restarting sshd."
fi

# ─── Phase 13: Fail2ban + unattended-upgrades ────────────────────────────
phase "Phase 13/15  fail2ban + unattended-upgrades"

cat > /etc/fail2ban/jail.local <<'F2BEOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = %(sshd_log)s
backend = %(sshd_backend)s
maxretry = 5
bantime = 3600
findtime = 600
F2BEOF

systemctl enable --now fail2ban
systemctl restart fail2ban
ok "fail2ban active (sshd jail, 5 attempts / 10 min, 1h ban)"

# unattended-upgrades default config from the package handles security
# updates; just make sure the timer is enabled.
systemctl enable --now unattended-upgrades
ok "unattended-upgrades enabled"

# ─── Phase 14: Verifications ─────────────────────────────────────────────
phase "Phase 14/15  Self-verification"

VERIFY_FAIL=0

# .env perms
PERMS="$(stat -c '%a %U:%G' "${ENV_FILE}")"
echo "  ${ENV_FILE}: ${PERMS}"
if [ "${PERMS}" != "600 ${APP_USER}:${APP_GROUP}" ]; then
  warn "Expected '600 ${APP_USER}:${APP_GROUP}' but got '${PERMS}'"
  VERIFY_FAIL=1
fi

# Listening sockets — only sshd on :22 (or :::22) should be non-loopback.
echo "  Public listeners (should be sshd:22 only):"
NON_LOOPBACK="$(ss -tlnp 2>/dev/null | awk 'NR>1 {print $4}' | grep -vE '^127\.|^\[::1\]|^\[::ffff:127' || true)"
if [ -n "${NON_LOOPBACK}" ]; then
  echo "${NON_LOOPBACK}" | sed 's/^/    /'
  echo "${NON_LOOPBACK}" | grep -vE ':22$' >/dev/null && {
    warn "Non-loopback listeners other than ssh:22 detected (review above)."
    VERIFY_FAIL=1
  }
fi

# Squid up
if ss -tlnp 2>/dev/null | grep -q '127\.0\.0\.1:3128'; then
  ok "Squid: 127.0.0.1:3128 listening"
else
  warn "Squid not listening on 127.0.0.1:3128"
  VERIFY_FAIL=1
fi

# Caddy up
if ss -tlnp 2>/dev/null | grep -q '127\.0\.0\.1:8080'; then
  ok "Caddy: 127.0.0.1:8080 listening"
else
  warn "Caddy not listening on 127.0.0.1:8080"
  VERIFY_FAIL=1
fi

# nft rule loaded
if nft list ruleset 2>/dev/null | grep -q 'doable_egress'; then
  ok "nft: doable_egress table loaded"
else
  warn "nft doable_egress table not loaded"
  VERIFY_FAIL=1
fi

# Sandbox UID cannot read .env
if setpriv --reuid=10001 --regid=10001 --clear-groups -- cat "${ENV_FILE}" >/dev/null 2>&1; then
  warn ".env still readable by uid=10001"
  VERIFY_FAIL=1
else
  ok "Sandbox UID 10001 denied read on ${ENV_FILE}"
fi

if [ "${VERIFY_FAIL}" -ne 0 ]; then
  warn "One or more self-checks failed — review the warnings above."
else
  ok "All self-checks passed."
fi

# ─── Phase 15: Operator checklist ────────────────────────────────────────
phase "Phase 15/15  Operator manual steps"

cat <<MANUAL

╔══════════════════════════════════════════════════════════════════════════╗
║  setup-server-v2.sh: BASE SYSTEM READY. Manual steps remaining below.    ║
╚══════════════════════════════════════════════════════════════════════════╝

1. SSH lockdown (do this FIRST — script staged, didn't restart sshd):
     # From your laptop, in a NEW terminal:
     ssh ${ADMIN_USER}@54.37.128.179        # must succeed with key auth
     ssh ubuntu@54.37.128.179               # confirm fallback works
     # Then on the server:
     sudo systemctl restart ssh
     # Drop-in file: /etc/ssh/sshd_config.d/99-doable-hardening.conf
     # Reverts: rm that file and 'systemctl restart ssh' if locked out.

2. scp the Doable repo into ${APP_DIR} (don't use 'gh repo clone' as root):
     # From your laptop:
     rsync -aHAX --delete \\
       --exclude='.env' --exclude='.env.local' \\
       --exclude='node_modules' --exclude='.next' \\
       /path/to/local/doable/ \\
       ${ADMIN_USER}@54.37.128.179:/tmp/doable-stage/
     # On the server:
     sudo rsync -aHAX --delete /tmp/doable-stage/ ${APP_DIR}/
     sudo chown -R ${APP_USER}:${APP_GROUP} ${APP_DIR}
     # KEEP .env untouched — script wrote it with fresh secrets.

3. Install Node deps + build (as the doable user):
     sudo -u ${APP_USER} bash -c 'cd ${APP_DIR} && pnpm install'
     sudo -u ${APP_USER} bash -c 'cd ${APP_DIR}/apps/web && pnpm build'

4. Create per-environment GitHub OAuth app (separate from staging/prod):
     - GitHub org → Settings → Developer settings → OAuth Apps → New
     - Homepage URL:           https://${WEB_HOSTNAME}
     - Authorization callback: https://${API_HOSTNAME}/auth/github/callback
     - Copy Client ID + Secret into ${ENV_FILE}
       (replace GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET placeholders)

5. (Optional) Google OAuth client + Anthropic/OpenAI keys:
     - GCP console: add https://${WEB_HOSTNAME} as origin,
       https://${API_HOSTNAME}/auth/google/callback as redirect
     - Fill GOOGLE_CLIENT_ID/SECRET, ANTHROPIC_API_KEY, OPENAI_API_KEY

6. Cloudflare Tunnel (one tunnel per env):
     sudo cloudflared tunnel login                        # interactive
     sudo cloudflared tunnel create doable-${ENV_NAME}
     # Capture the printed UUID, then:
     sudo sed -i \\
       -e "s|^# tunnel: <uuid>|tunnel: <UUID>|" \\
       -e "s|^# credentials-file:.*|credentials-file: /etc/cloudflared/<UUID>.json|" \\
       -e "s|TUNNEL_UUID=PENDING_FROM_OPERATOR|TUNNEL_UUID=<UUID>|" \\
       /etc/cloudflared/config.yml
     sudo sed -i \\
       "s|^CLOUDFLARED_TUNNEL_ID=.*|CLOUDFLARED_TUNNEL_ID=<UUID>|" \\
       ${ENV_FILE}
     sudo cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate

     # DNS records (CNAME each to <UUID>.cfargotunnel.com):
     sudo cloudflared tunnel route dns doable-${ENV_NAME} ${WEB_HOSTNAME}
     sudo cloudflared tunnel route dns doable-${ENV_NAME} ${API_HOSTNAME}
     sudo cloudflared tunnel route dns doable-${ENV_NAME} ${WS_HOSTNAME}
     # Wildcard *.${DOABLE_DOMAIN} should already exist on the prod tunnel
     # — per-publish CNAMEs override it for this env's prefixed slugs.

     sudo cloudflared service install
     sudo systemctl enable --now cloudflared

7. Database migrations (after the repo is on disk):
     # Read the DB password from the secrets file the script persisted.
     DB_PASS=\$(sudo cat /etc/doable/.db_pass)
     sudo -u ${APP_USER} env PGPASSWORD="\$DB_PASS" bash -c '
       cd ${APP_DIR}
       for d in services/api/src/db/migrations packages/db/migrations; do
         [ -d "\$d" ] || continue
         for f in \$(ls "\$d"/*.sql 2>/dev/null | sort); do
           echo "Applying \$f"
           psql -h localhost -U doable -d doable -f "\$f" || echo "WARN: \$f had errors"
         done
       done'

8. Start the platform:
     sudo systemctl start doable.service
     sudo systemctl status doable.service
     sudo -u ${APP_USER} tmux attach -t doable     # to watch logs

9. Smoke test:
     curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/   # web
     curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/   # api
     curl -s -o /dev/null -w '%{http_code}\n' https://${WEB_HOSTNAME}/login
     curl -s -o /dev/null -w '%{http_code}\n' https://${API_HOSTNAME}/health
     ps -eo user,pid,cmd | grep -E "next-server|tsx|node.*ws" | grep -v grep
     # ↑ Every row should show user=${APP_USER}, NEVER root.

10. Verify .env is sandbox-safe:
      sudo setpriv --reuid=10001 --regid=10001 --clear-groups -- \\
        cat ${ENV_FILE}
      # Expected: cat: ${ENV_FILE}: Permission denied

╚══════════════════════════════════════════════════════════════════════════╝
Endpoints:
  Web        https://${WEB_HOSTNAME}
  API        https://${API_HOSTNAME}
  WebSocket  wss://${WS_HOSTNAME}
  Publish    https://${PUBLISH_PREFIX}<slug>.${DOABLE_DOMAIN}
══════════════════════════════════════════════════════════════════════════
MANUAL

ok "setup-server-v2.sh complete."
