#!/bin/bash
# Doable — Service Watchdog
# Checks health of all services and auto-recovers failures.
# Designed to run every 2 minutes via systemd timer or cron.
#
# What it handles:
#   - Next.js returning 500 (corrupted .next cache) → clears cache, restarts
#   - Any service not responding → restarts that tmux window
#   - tmux session missing entirely → runs start.sh to recreate it
#
# Usage: ./watchdog.sh
# Logs:  /var/log/doable-watchdog.log

set -uo pipefail

DOABLE_DIR="/root/doable"
SESSION="doable"
LOG="/var/log/doable-watchdog.log"
TIMEOUT=10

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"
}

restart_window() {
  local window="$1"
  local cmd="$2"
  log "RESTART: Restarting tmux window '$window'"
  tmux send-keys -t "$SESSION:$window" C-c 2>/dev/null || true
  sleep 2
  tmux send-keys -t "$SESSION:$window" "$cmd" Enter
}

# ── Ensure tmux session exists ────────────────────────────────
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  log "CRITICAL: tmux session '$SESSION' not found — recreating via start.sh"
  bash "$DOABLE_DIR/start.sh"
  sleep 15
  log "INFO: start.sh completed, waiting for services to initialize"
  exit 0
fi

RECOVERED=0

# ── Check API (port 4000) ────────────────────────────────────
API_CODE=$(timeout "$TIMEOUT" curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/health 2>/dev/null || echo "000")
if [[ "$API_CODE" == "000" ]]; then
  log "ALERT: API not responding (port 4000) — restarting"
  restart_window "api" "cd $DOABLE_DIR && pnpm dev:api"
  RECOVERED=1
fi

# ── Check Web (port 3000) ────────────────────────────────────
WEB_CODE=$(timeout "$TIMEOUT" curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null || echo "000")
if [[ "$WEB_CODE" == "000" ]]; then
  log "ALERT: Web not responding (port 3000) — clearing .next cache and restarting"
  tmux send-keys -t "$SESSION:web" C-c 2>/dev/null || true
  sleep 2
  rm -rf "$DOABLE_DIR/apps/web/.next"
  tmux send-keys -t "$SESSION:web" "cd $DOABLE_DIR && pnpm --filter web dev" Enter
  RECOVERED=1
elif [[ "$WEB_CODE" == "500" ]]; then
  log "ALERT: Web returning 500 (corrupted .next cache) — clearing and restarting"
  tmux send-keys -t "$SESSION:web" C-c 2>/dev/null || true
  sleep 2
  rm -rf "$DOABLE_DIR/apps/web/.next"
  tmux send-keys -t "$SESSION:web" "cd $DOABLE_DIR && pnpm --filter web dev" Enter
  RECOVERED=1
fi

# ── Check WebSocket (port 4001) ──────────────────────────────
# WS server won't return 200 on plain HTTP — just check if the port is listening
WS_LISTENING=$(ss -tlnp 2>/dev/null | grep ':4001 ' || true)
if [[ -z "$WS_LISTENING" ]]; then
  log "ALERT: WS not listening (port 4001) — restarting"
  restart_window "ws" "cd $DOABLE_DIR && pnpm dev:ws"
  RECOVERED=1
fi

# ── Check cloudflared tunnel ─────────────────────────────────
if ! systemctl is-active --quiet cloudflared; then
  log "ALERT: cloudflared is down — restarting"
  systemctl start cloudflared
  RECOVERED=1
fi

# ── Log rotation: keep last 1000 lines ───────────────────────
if [[ -f "$LOG" ]] && [[ $(wc -l < "$LOG") -gt 2000 ]]; then
  tail -1000 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi

if [[ "$RECOVERED" -eq 1 ]]; then
  log "INFO: Recovery actions taken — will verify on next run"
else
  # Only log a heartbeat every 30 minutes (every 15th run at 2-min intervals)
  MINUTE=$(date '+%M')
  if [[ "$MINUTE" == "00" || "$MINUTE" == "30" ]]; then
    log "OK: All services healthy (api=$API_CODE web=$WEB_CODE ws=listening)"
  fi
fi
