#!/usr/bin/env bash
# switch-mode.sh — flip a Doable install between three URL modes.
#
#   tunnel     — public via Cloudflare Tunnel (dashed <env>-api.doable.me)
#   no-tunnel  — direct on HOST:443 with self-signed cert
#   localhost  — pure-loopback dev (no public exposure)
#
# Usage:
#   sudo ./switch-mode.sh tunnel    DOMAIN=dev.doable.me
#   sudo ./switch-mode.sh no-tunnel HOST=203.0.113.10
#   sudo ./switch-mode.sh localhost
#
# Patches /root/doable/.env + /root/doable/apps/web/.env.local, restarts
# api/web/ws tmux panes inside doable.service, optionally starts/stops
# cloudflared. Idempotent. Backs up the prior .env to .env.bak-<ts>.

set -euo pipefail

MODE="${1:-}"
INSTALL_DIR="${INSTALL_DIR:-/root/doable}"
ENV_FILE="${INSTALL_DIR}/.env"
WEB_ENV_FILE="${INSTALL_DIR}/apps/web/.env.local"

case "$MODE" in
  tunnel|no-tunnel|localhost) : ;;
  *)
    cat >&2 <<USAGE
Usage: $0 {tunnel|no-tunnel|localhost}

  tunnel     Use Cloudflare Tunnel + dashed hostnames.
             Requires DOMAIN env (e.g. DOMAIN=dev.doable.me).
             For >2-label DOMAIN, hostnames become dev-api.doable.me,
             dev-ws.doable.me. For zone apex (DOMAIN=doable.me) →
             api.doable.me / ws.doable.me.

  no-tunnel  Serve api/ws/web on the same HOST:443 with self-signed
             Caddy cert. Requires HOST env (IP or hostname).

  localhost  Pure-loopback: NEXT_PUBLIC_* = http://localhost:PORT.
             Use when developing on the box itself; not reachable from
             outside.

Env overrides:
  INSTALL_DIR  default /root/doable
USAGE
    exit 1
    ;;
esac

[ -f "$ENV_FILE" ] || { echo "$ENV_FILE not found" >&2; exit 1; }
TS=$(date +%s)
cp "$ENV_FILE" "${ENV_FILE}.bak-${TS}"
[ -f "$WEB_ENV_FILE" ] && cp "$WEB_ENV_FILE" "${WEB_ENV_FILE}.bak-${TS}"

set_env() {
  local file="$1" key="$2" val="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i -E "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

declare API_URL WS_URL APP_URL G_REDIR GH_REDIR GH_COP_REDIR GH_REPO_REDIR

if [ "$MODE" = "tunnel" ]; then
  DOMAIN="${DOMAIN:-}"
  [ -n "$DOMAIN" ] || { echo "tunnel mode requires DOMAIN env" >&2; exit 1; }
  LABEL_COUNT=$(echo "$DOMAIN" | tr '.' '\n' | wc -l)
  if [ "$LABEL_COUNT" -gt 2 ]; then
    PREFIX="${DOMAIN%%.*}"
    ZONE="${DOMAIN#*.}"
    API_HOST="${PREFIX}-api.${ZONE}"
    WS_HOST_PUB="${PREFIX}-ws.${ZONE}"
    WEB_HOST="$DOMAIN"
  else
    API_HOST="api.${DOMAIN}"
    WS_HOST_PUB="ws.${DOMAIN}"
    WEB_HOST="$DOMAIN"
  fi
  API_URL="https://${API_HOST}"
  WS_URL="wss://${WS_HOST_PUB}"
  APP_URL="https://${WEB_HOST}"
  G_REDIR="https://${API_HOST}/auth/google/callback"
  GH_REDIR="https://${API_HOST}/oauth/github/login/callback"
  GH_COP_REDIR="https://${API_HOST}/oauth/github/copilot/callback"
  GH_REPO_REDIR="https://${API_HOST}/oauth/github/repo/callback"
elif [ "$MODE" = "no-tunnel" ]; then
  HOST="${HOST:-}"
  [ -n "$HOST" ] || { echo "no-tunnel mode requires HOST env" >&2; exit 1; }
  API_URL="https://${HOST}"
  WS_URL="wss://${HOST}"
  APP_URL="https://${HOST}"
  G_REDIR="https://${HOST}/auth/google/callback"
  GH_REDIR="https://${HOST}/oauth/github/login/callback"
  GH_COP_REDIR="https://${HOST}/oauth/github/copilot/callback"
  GH_REPO_REDIR="https://${HOST}/oauth/github/repo/callback"
else  # localhost
  API_PORT="${API_PORT:-4000}"
  WS_PORT="${WS_PORT:-4001}"
  WEB_PORT="${WEB_PORT:-3000}"
  API_URL="http://localhost:${API_PORT}"
  WS_URL="ws://localhost:${WS_PORT}"
  APP_URL="http://localhost:${WEB_PORT}"
  G_REDIR="${API_URL}/auth/google/callback"
  GH_REDIR="${API_URL}/oauth/github/login/callback"
  GH_COP_REDIR="${API_URL}/oauth/github/copilot/callback"
  GH_REPO_REDIR="${API_URL}/oauth/github/repo/callback"
fi

# Patch root .env
set_env "$ENV_FILE" NEXT_PUBLIC_API_URL "$API_URL"
set_env "$ENV_FILE" NEXT_PUBLIC_WS_URL  "$WS_URL"
set_env "$ENV_FILE" NEXT_PUBLIC_APP_URL "$APP_URL"
# BUG-OOB-SWITCHMODE-CORS: the API gates browser requests by CORS_ORIGINS.
# Switching the web's public URL without updating CORS_ORIGINS leaves it
# pointing at the OLD domain, so every signup/login/API call from the new
# origin is CORS-rejected ("Something went wrong"). Keep it in lock-step
# with APP_URL (the only browser-facing origin) on every mode switch.
set_env "$ENV_FILE" CORS_ORIGINS "$APP_URL"
set_env "$ENV_FILE" GOOGLE_REDIRECT_URI       "$G_REDIR"
set_env "$ENV_FILE" GITHUB_REDIRECT_URI       "$GH_REDIR"
set_env "$ENV_FILE" GITHUB_COPILOT_REDIRECT_URI  "$GH_COP_REDIR"
set_env "$ENV_FILE" GITHUB_REPO_REDIRECT_URI     "$GH_REPO_REDIR"
set_env "$ENV_FILE" INTEGRATIONS_OAUTH_REDIRECT_URI         "${API_URL}/integrations/oauth/callback"
set_env "$ENV_FILE" INTEGRATIONS_ENHANCED_AUTH_REDIRECT_URI "${API_URL}/integrations/enhanced-auth/callback"

# Patch apps/web/.env.local (Next.js precedence)
mkdir -p "$(dirname "$WEB_ENV_FILE")"
cat > "$WEB_ENV_FILE" <<EOF
NEXT_PUBLIC_API_URL=${API_URL}
NEXT_PUBLIC_WS_URL=${WS_URL}
NEXT_PUBLIC_APP_URL=${APP_URL}
EOF

# Optional: cloudflared lifecycle
if [ "$MODE" = "tunnel" ]; then
  systemctl is-enabled cloudflared >/dev/null 2>&1 && systemctl restart cloudflared || true
else
  systemctl is-active cloudflared >/dev/null 2>&1 && systemctl stop cloudflared || true
fi

# Restart api+web inside doable.service tmux session (api uses tsx watch
# but baked NEXT_PUBLIC_* values require a web rebuild; api re-reads on
# fresh process)
TMUX_PID=$(systemctl show doable.service -p MainPID --value 2>/dev/null || true)
if [ -n "$TMUX_PID" ] && [ "$TMUX_PID" != "0" ]; then
  UID_D=$(id -u doable 2>/dev/null || echo 5000)
  TMUX_SOCK="/tmp/tmux-${UID_D}/default"
  for w in api web; do
    nsenter -t "$TMUX_PID" -m -- sudo -u doable tmux -S "$TMUX_SOCK" send-keys -t "doable:$w" C-c 2>/dev/null || true
  done
  sleep 2
  nsenter -t "$TMUX_PID" -m -- sudo -u doable tmux -S "$TMUX_SOCK" send-keys -t doable:api "pnpm --filter @doable/api dev" Enter 2>/dev/null || true
  nsenter -t "$TMUX_PID" -m -- sudo -u doable tmux -S "$TMUX_SOCK" send-keys -t doable:web "cd ${INSTALL_DIR} && rm -rf apps/web/.next && pnpm --filter @doable/web dev" Enter 2>/dev/null || true
fi

cat <<DONE
Switched to ${MODE} mode.
  API : ${API_URL}
  WS  : ${WS_URL}
  WEB : ${APP_URL}

Backup of prior .env at ${ENV_FILE}.bak-${TS}
Backup of prior web .env.local at ${WEB_ENV_FILE}.bak-${TS} (if existed)

Wait ~10-30s for web to recompile, then verify:
  curl -sS -o /dev/null -w "%{http_code}\n" ${APP_URL}/login
DONE
