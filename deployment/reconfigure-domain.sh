#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║  Doable — Re-configure DOMAIN on an existing install         ║
# ║  Idempotent. Operator passes their zone via env or flag.    ║
# ╚══════════════════════════════════════════════════════════════╝
#
# When to use:
#   * setup-server.sh first run was NO_TUNNEL=1 HOST=<ip> (no domain
#     was known yet), and the .env now carries
#     CORS_ORIGINS=https://<ip>, NEXT_PUBLIC_*=https://<ip>, etc.
#   * Operator just registered a real domain and wants the install
#     to publish at https://<domain> instead.
#
#   This script rewrites every host-bearing env var in /root/doable/.env
#   (or $INSTALL_DIR/.env) to reflect the new DOMAIN, rebuilds the web
#   standalone bundle (NEXT_PUBLIC_* are baked at build time), and
#   restarts the doable systemd service so api/ws/web all pick it up.
#
# Usage:
#   DOMAIN=acme.example.com   ./deployment/reconfigure-domain.sh
#   DOMAIN=dev.doable.me      ./deployment/reconfigure-domain.sh
#   ./deployment/reconfigure-domain.sh --domain dev.doable.me
#
# Flags:
#   --domain <zone>     Override DOMAIN env. Required if env not set.
#   --install-dir <p>   Path to the doable install (default: /root/doable
#                       or $INSTALL_DIR).
#   --api-domain <h>    Override computed API_DOMAIN (single-level dashed
#                       form derived from DOMAIN by default).
#   --ws-domain <h>     Override computed WS_DOMAIN.
#   --layout <l>        Publish layout: 'prefix' (free Universal SSL) or
#                       'infix' (requires Cloudflare ACM). Default: keep
#                       whatever PUBLISH_LAYOUT is in the existing .env,
#                       or 'prefix' if unset.
#   --wildcard-hostname <h>
#                       For --layout infix: the wildcard CNAME hostname
#                       (e.g. '*.dev.doable.me'). Defaults to '*.<domain>'.
#   --publish-prefix <s>
#                       For --layout prefix: the published-site subdomain
#                       prefix (e.g. 'dev-'). Defaults to whatever the
#                       existing .env has, or '<env>-' derived from a
#                       multi-level DOMAIN, or empty for an apex DOMAIN.
#   --no-rebuild        Skip apps/web rebuild (only env rewrite + service
#                       restart). USE WITH CAUTION — the running web
#                       bundle still has the OLD NEXT_PUBLIC_* baked in.
#   --no-restart        Skip systemctl restart doable.service.
#   --dry-run           Print the diff but don't write anything.
#
# Honors the same Cloudflare-naming rule as setup-server.sh:
#   * Multi-level DOMAIN (e.g. dev.doable.me) →
#       API/WS subdomains use a DASH:
#         dev-api.doable.me, dev-ws.doable.me
#       (under free Cloudflare Universal SSL one-level wildcard)
#   * Apex DOMAIN (e.g. acme.example.com) →
#       API/WS subdomains use a DOT:
#         api.acme.example.com, ws.acme.example.com

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Args ────────────────────────────────────────────────────────
INSTALL_DIR="${INSTALL_DIR:-/root/doable}"
DOMAIN="${DOMAIN:-}"
API_DOMAIN="${API_DOMAIN:-}"
WS_DOMAIN="${WS_DOMAIN:-}"
PUBLISH_LAYOUT="${PUBLISH_LAYOUT:-}"
WILDCARD_HOSTNAME="${WILDCARD_HOSTNAME:-}"
PUBLISH_PREFIX_OVERRIDE="${PUBLISH_PREFIX:-}"
SKIP_REBUILD=0
SKIP_RESTART=0
DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --domain)             DOMAIN="$2"; shift 2 ;;
    --api-domain)         API_DOMAIN="$2"; shift 2 ;;
    --ws-domain)          WS_DOMAIN="$2"; shift 2 ;;
    --install-dir)        INSTALL_DIR="$2"; shift 2 ;;
    --layout)             PUBLISH_LAYOUT="$2"; shift 2 ;;
    --wildcard-hostname)  WILDCARD_HOSTNAME="$2"; shift 2 ;;
    --publish-prefix)     PUBLISH_PREFIX_OVERRIDE="$2"; shift 2 ;;
    --no-rebuild)         SKIP_REBUILD=1; shift ;;
    --no-restart)         SKIP_RESTART=1; shift ;;
    --dry-run)            DRY_RUN=1; shift ;;
    -h|--help)
      sed -n '2,58p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) err "Unknown arg: $1" ;;
  esac
done

[ -z "$DOMAIN" ] && err "DOMAIN is required (set via --domain <zone> or DOMAIN=<zone> env)."
[ ! -f "${INSTALL_DIR}/.env" ] && err "${INSTALL_DIR}/.env not found. Run setup-server.sh first."

# Permission check: must own .env or be root.
if [ ! -w "${INSTALL_DIR}/.env" ]; then
  err "${INSTALL_DIR}/.env is not writable by current user. Re-run as root or chown to the install owner."
fi

# ── Derive subdomains per Cloudflare-naming rule ───────────────
DOMAIN_LABEL_COUNT=$(echo "$DOMAIN" | tr '.' '\n' | wc -l)
if [ "$DOMAIN_LABEL_COUNT" -gt 2 ]; then
  ENV_PREFIX="${DOMAIN%%.*}"
  DOMAIN_ZONE="${DOMAIN#*.}"
  API_DOMAIN="${API_DOMAIN:-${ENV_PREFIX}-api.${DOMAIN_ZONE}}"
  WS_DOMAIN="${WS_DOMAIN:-${ENV_PREFIX}-ws.${DOMAIN_ZONE}}"
  ZONE_APEX="${DOMAIN_ZONE}"
  info "Multi-level DOMAIN — dashed: API=${API_DOMAIN}, WS=${WS_DOMAIN}, zone=${ZONE_APEX}"
else
  API_DOMAIN="${API_DOMAIN:-api.${DOMAIN}}"
  WS_DOMAIN="${WS_DOMAIN:-ws.${DOMAIN}}"
  ZONE_APEX="${DOMAIN}"
  info "Apex DOMAIN — dotted: API=${API_DOMAIN}, WS=${WS_DOMAIN}"
fi

# ── Derive publish layout (default: keep existing, else prefix) ──
# PUBLISH_LAYOUT='infix' means the operator has Cloudflare ACM and wants
# multi-level wildcard URLs (slug.dev.doable.me). 'prefix' is the default
# (works with free Universal SSL): <prefix><slug>.<zone>.
if [ -z "$PUBLISH_LAYOUT" ]; then
  EXISTING_LAYOUT=$(grep -oP "(?<=^PUBLISH_LAYOUT=).+" "${INSTALL_DIR}/.env" 2>/dev/null | head -1 || true)
  PUBLISH_LAYOUT="${EXISTING_LAYOUT:-prefix}"
fi
case "$PUBLISH_LAYOUT" in
  prefix|infix) ;;
  *) err "--layout must be 'prefix' or 'infix' (got '${PUBLISH_LAYOUT}')" ;;
esac

if [[ "$PUBLISH_LAYOUT" == "infix" ]]; then
  WILDCARD_HOSTNAME="${WILDCARD_HOSTNAME:-*.${DOMAIN}}"
  [[ "$WILDCARD_HOSTNAME" == \*.* ]] || err "--wildcard-hostname must start with '*.' (got '${WILDCARD_HOSTNAME}')"
  # Whitelist hostname chars (defense-in-depth before SQL/cloudflared writes).
  if [[ ! "$WILDCARD_HOSTNAME" =~ ^\*\.[a-z0-9.-]+$ ]]; then
    err "--wildcard-hostname must be '*.' + lowercase letters/digits/dots/hyphens only (got '${WILDCARD_HOSTNAME}')"
  fi
  WILDCARD_BARE="${WILDCARD_HOSTNAME#\*.}"
  if [[ "$WILDCARD_BARE" != "$DOMAIN" && "$WILDCARD_BARE" != "$ZONE_APEX" && "$WILDCARD_BARE" != *".${ZONE_APEX}" ]]; then
    err "--wildcard-hostname '${WILDCARD_HOSTNAME}' must be inside zone '${ZONE_APEX}'"
  fi
  # DOABLE_DOMAIN is what publish URLs are built from. For infix it's the
  # wildcard's bare suffix (e.g. dev.doable.me), and PUBLISH_SUBDOMAIN_PREFIX
  # is empty so the URL comes out as <slug>.dev.doable.me.
  DOABLE_APEX="${WILDCARD_BARE}"
  NEW_PUBLISH_PREFIX=""
  info "Publish layout: infix → https://<slug>.${WILDCARD_BARE} (requires Cloudflare ACM)"
else
  # Prefix mode: DOABLE_DOMAIN is the zone, so <prefix><slug>.<zone> resolves
  # under the single-level Universal SSL wildcard.
  DOABLE_APEX="${ZONE_APEX}"
  # Precedence: --publish-prefix > PUBLISH_PREFIX env > existing .env value
  # > derived default. Derived default is '<env>-' for multi-level DOMAINs
  # (so dev.doable.me → dev-) and empty for apex DOMAINs.
  if [ -n "$PUBLISH_PREFIX_OVERRIDE" ]; then
    NEW_PUBLISH_PREFIX="$PUBLISH_PREFIX_OVERRIDE"
  else
    EXISTING_PREFIX=$(grep -oP "(?<=^PUBLISH_SUBDOMAIN_PREFIX=).+" "${INSTALL_DIR}/.env" 2>/dev/null | head -1 || true)
    if [ -n "$EXISTING_PREFIX" ]; then
      NEW_PUBLISH_PREFIX="$EXISTING_PREFIX"
    elif [ "$DOMAIN_LABEL_COUNT" -gt 2 ]; then
      NEW_PUBLISH_PREFIX="${ENV_PREFIX}-"
      info "No PUBLISH_SUBDOMAIN_PREFIX in .env — defaulting to '${NEW_PUBLISH_PREFIX}' from multi-level DOMAIN. Override with --publish-prefix if you want a different value."
    else
      NEW_PUBLISH_PREFIX=""
    fi
  fi
  info "Publish layout: prefix '${NEW_PUBLISH_PREFIX}' → https://${NEW_PUBLISH_PREFIX}<slug>.${ZONE_APEX}"
fi

# ── Build the rewrite map ───────────────────────────────────────
declare -A NEW_VALS=(
  [NEXT_PUBLIC_APP_URL]="https://${DOMAIN}"
  [NEXT_PUBLIC_API_URL]="https://${API_DOMAIN}"
  [NEXT_PUBLIC_WS_URL]="wss://${WS_DOMAIN}"
  [CORS_ORIGINS]="https://${DOMAIN}"
  [WS_ALLOWED_ORIGINS]="https://${DOMAIN}"
  [DOABLE_DOMAIN]="${DOABLE_APEX}"
  [PUBLISH_LAYOUT]="${PUBLISH_LAYOUT}"
  [PUBLISH_SUBDOMAIN_PREFIX]="${NEW_PUBLISH_PREFIX}"
  [WILDCARD_HOSTNAME]="${WILDCARD_HOSTNAME}"
  [GOOGLE_REDIRECT_URI]="https://${API_DOMAIN}/auth/google/callback"
  [GITHUB_REDIRECT_URI]="https://${API_DOMAIN}/oauth/github/login/callback"
  [GITHUB_COPILOT_REDIRECT_URI]="https://${API_DOMAIN}/oauth/github/copilot/callback"
  [GITHUB_REPO_REDIRECT_URI]="https://${API_DOMAIN}/oauth/github/repo/callback"
  [INTEGRATIONS_OAUTH_REDIRECT_URI]="https://${API_DOMAIN}/integrations/oauth/callback"
  [INTEGRATIONS_ENHANCED_AUTH_REDIRECT_URI]="https://${API_DOMAIN}/integrations/enhanced-auth/callback"
)

# ── Show planned changes ────────────────────────────────────────
echo ""
info "Planned changes to ${INSTALL_DIR}/.env:"
for KEY in "${!NEW_VALS[@]}"; do
  OLD=$(grep -oP "(?<=^${KEY}=).+" "${INSTALL_DIR}/.env" 2>/dev/null | head -1 || true)
  NEW="${NEW_VALS[$KEY]}"
  if [ -z "$OLD" ]; then
    echo "  + ${KEY}=${NEW}  (was missing)"
  elif [ "$OLD" = "$NEW" ]; then
    echo "    ${KEY}=${NEW}  (unchanged)"
  else
    echo "  ~ ${KEY}: ${OLD}  →  ${NEW}"
  fi
done

if [ "$DRY_RUN" = "1" ]; then
  ok "Dry run complete. No file written."
  exit 0
fi

# ── Backup .env ─────────────────────────────────────────────────
BACKUP="${INSTALL_DIR}/.env.pre-domain-$(date +%Y%m%d-%H%M%S)"
cp -p "${INSTALL_DIR}/.env" "$BACKUP"
ok "Backed up existing .env → $BACKUP"

# ── Apply rewrites ─────────────────────────────────────────────
for KEY in "${!NEW_VALS[@]}"; do
  NEW="${NEW_VALS[$KEY]}"
  # Escape special chars in the value for sed (|, &, \).
  ESCAPED=$(printf '%s' "$NEW" | sed -e 's/[\/&|]/\\&/g')
  if grep -qE "^${KEY}=" "${INSTALL_DIR}/.env"; then
    sed -i -E "s|^${KEY}=.*$|${KEY}=${ESCAPED}|" "${INSTALL_DIR}/.env"
  else
    echo "${KEY}=${NEW}" >> "${INSTALL_DIR}/.env"
  fi
done
ok "Rewrote ${#NEW_VALS[@]} host-bearing env vars."

# ── Sync apps/web/.env.local (Next.js .env precedence trap) ────
# Next.js reads apps/web/.env.local in preference to the workspace-root
# .env when building, so a stale .env.local from a prior NO_TUNNEL=1
# install will silently outvote the rewrites above and bake the old IP
# into the client bundle. setup-server.sh emits apps/web/.env.local at
# lines 1065-1070; we must keep it in sync here on every reconfig.
WEB_ENV_LOCAL="${INSTALL_DIR}/apps/web/.env.local"
if [ -f "$WEB_ENV_LOCAL" ] || [ -d "$(dirname "$WEB_ENV_LOCAL")" ]; then
  WEB_OWNER=$(stat -c '%U' "${INSTALL_DIR}/.env")
  cat > "$WEB_ENV_LOCAL" <<EOF
NEXT_PUBLIC_API_URL=${NEW_VALS[NEXT_PUBLIC_API_URL]}
NEXT_PUBLIC_WS_URL=${NEW_VALS[NEXT_PUBLIC_WS_URL]}
NEXT_PUBLIC_APP_URL=${NEW_VALS[NEXT_PUBLIC_APP_URL]}
EOF
  chown "$WEB_OWNER":"$WEB_OWNER" "$WEB_ENV_LOCAL" 2>/dev/null || true
  ok "Synced apps/web/.env.local with new NEXT_PUBLIC_* (Next.js .env precedence)."
fi

# ── Rebuild apps/web (NEXT_PUBLIC_* are baked at build time) ───
if [ "$SKIP_REBUILD" = "1" ]; then
  warn "--no-rebuild: web standalone NOT rebuilt — running bundle still has OLD NEXT_PUBLIC_* values baked in."
else
  RUN_USER=$(stat -c '%U' "${INSTALL_DIR}/.env")
  info "Rebuilding apps/web standalone as user '${RUN_USER}' (this can take 3-6 min)..."
  if [ "$(id -un)" = "$RUN_USER" ]; then
    (cd "${INSTALL_DIR}" && env -u NODE_ENV NODE_ENV=production pnpm --filter @doable/web build)
  else
    sudo -u "$RUN_USER" bash -c "cd '${INSTALL_DIR}' && env -u NODE_ENV NODE_ENV=production pnpm --filter @doable/web build"
  fi
  ok "Web standalone rebuilt."
fi

# ── Restart service ─────────────────────────────────────────────
if [ "$SKIP_RESTART" = "1" ]; then
  warn "--no-restart: services still running with OLD .env. Restart manually with: systemctl restart doable.service"
elif systemctl list-unit-files doable.service >/dev/null 2>&1; then
  info "Restarting doable.service..."
  systemctl restart doable.service
  ok "doable.service restarted."
else
  warn "doable.service not found — restart services manually (api/ws need new CORS env; web needs new build)."
fi

# ── Smoke ───────────────────────────────────────────────────────
echo ""
info "Smoke test:"
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:4000/health" -m 3 2>/dev/null || echo 000)
  if [ "$CODE" = "200" ]; then break; fi
  sleep 1
done
echo "  api (127.0.0.1:4000/health): $(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/health -m 5 2>/dev/null || echo 000)"
echo "  web (127.0.0.1:3000/):       $(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ -m 5 2>/dev/null || echo 000)"
echo "  ws  (127.0.0.1:4001/health): $(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:4001/health -m 5 2>/dev/null || echo 000)"
echo ""
echo "  Public hostnames (DNS + TLS must be live for these to pass):"
echo "    https://${DOMAIN}/         → $(curl -sS -o /dev/null -w '%{http_code}' "https://${DOMAIN}/" -m 10 2>/dev/null || echo 000)"
echo "    https://${API_DOMAIN}/health → $(curl -sS -o /dev/null -w '%{http_code}' "https://${API_DOMAIN}/health" -m 10 2>/dev/null || echo 000)"
echo "    https://${WS_DOMAIN}/health  → $(curl -sS -o /dev/null -w '%{http_code}' "https://${WS_DOMAIN}/health" -m 10 2>/dev/null || echo 000)"
echo ""

ok "Re-configure complete."
echo ""
echo "Next steps:"
echo "  * If public URLs return 530, the Cloudflare tunnel routes are not set."
echo "    Run: cloudflared tunnel route dns --overwrite-dns <tunnel-uuid> ${DOMAIN}"
echo "         cloudflared tunnel route dns --overwrite-dns <tunnel-uuid> ${API_DOMAIN}"
echo "         cloudflared tunnel route dns --overwrite-dns <tunnel-uuid> ${WS_DOMAIN}"
echo "  * Diff: diff -u ${BACKUP} ${INSTALL_DIR}/.env"
