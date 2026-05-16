#!/usr/bin/env bash
# Doable watchdog — periodic api healthcheck driven by doable-watchdog.timer
# (created by deployment/server-setup.sh Step 12). On three consecutive
# failures, restarts doable.service so the tmux session gets re-spawned
# with a fresh api pane.
set -uo pipefail

LOG=/var/log/doable/watchdog.log
STATE_DIR=/var/lib/doable
STATE_FILE="$STATE_DIR/watchdog-fails"
mkdir -p "$(dirname "$LOG")" "$STATE_DIR"
touch "$STATE_FILE"

API_URL="${DOABLE_HEALTH_URL:-http://127.0.0.1:4000/health}"
THRESHOLD="${DOABLE_WATCHDOG_THRESHOLD:-3}"

if curl -sf --max-time 5 "$API_URL" >/dev/null 2>&1; then
  echo "0" > "$STATE_FILE"
  exit 0
fi

prev="$(cat "$STATE_FILE" 2>/dev/null || echo 0)"
next=$((prev + 1))
echo "$next" > "$STATE_FILE"
echo "$(date -u +%FT%TZ) [watchdog] api unreachable ($next/$THRESHOLD)" >> "$LOG"

if [ "$next" -ge "$THRESHOLD" ]; then
  echo "$(date -u +%FT%TZ) [watchdog] threshold hit — restarting doable.service" >> "$LOG"
  echo "0" > "$STATE_FILE"
  systemctl restart doable.service || true
fi
