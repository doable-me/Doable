#!/usr/bin/env bash
# Resilient service supervisor for the bare-metal tmux launcher (start.sh).
#
# Why this exists: `tmux send-keys "<cmd>"` runs a command ONCE — tmux is not a
# supervisor. And `tsx watch` (used by the api/ws dev runner) does NOT reliably
# restart its child when the child crashes — it stays alive waiting for a file
# change. So two distinct failure modes can leave the api down:
#   (A) the whole command/process dies (OOM, kill, fatal boot error)
#   (B) the command is still "alive" but the service stopped serving
#       (tsx-watch survived but its child crashed; an event-loop hang; etc.)
# A bare `while true; do <cmd>; done` loop only covers (A). This supervisor
# covers BOTH: it reruns the command on exit (A) AND, when a health URL is
# given, force-restarts the command after $HEALTH_FAILS consecutive health
# failures while the process is still alive (B). Incident 2026-05-27: the api
# went down and stayed down — this closes that gap so the api never stays down.
#
# Usage: run-service.sh <name> <health_url|-> <command string...>
#   <health_url|->  health endpoint to probe, or "-" for process-death-only
#   <command...>    the service command (run via `bash -c`, so `cd && node` etc. work)
set -uo pipefail

NAME="${1:?service name required}"; HEALTH_URL="${2:?health url or - required}"; shift 2
CMD="$*"
INTERVAL="${DOABLE_HEALTH_INTERVAL:-10}"   # seconds between health probes
MAX_FAILS="${DOABLE_HEALTH_FAILS:-3}"      # consecutive fails before force-restart
GRACE="${DOABLE_HEALTH_GRACE:-45}"         # seconds to let the service boot before probing

log() { echo "[run-service:$NAME] $(date -u +%FT%TZ) $*"; }

while true; do
  log "starting: $CMD"
  bash -c "$CMD" &
  PID=$!

  # Boot grace period so a slow cold start (tsx + heavy dep load) isn't killed.
  waited=0
  while kill -0 "$PID" 2>/dev/null && [ "$waited" -lt "$GRACE" ]; do
    sleep 2; waited=$((waited + 2))
  done

  fails=0
  while kill -0 "$PID" 2>/dev/null; do
    sleep "$INTERVAL"
    [ "$HEALTH_URL" = "-" ] && continue
    if curl -sf --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
      fails=0
    else
      fails=$((fails + 1))
      log "health fail $fails/$MAX_FAILS ($HEALTH_URL)"
      if [ "$fails" -ge "$MAX_FAILS" ]; then
        log "unhealthy — force-restarting (kill PID $PID + children)"
        pkill -TERM -P "$PID" 2>/dev/null || true; kill -TERM "$PID" 2>/dev/null || true
        sleep 3
        pkill -KILL -P "$PID" 2>/dev/null || true; kill -KILL "$PID" 2>/dev/null || true
        break
      fi
    fi
  done

  wait "$PID" 2>/dev/null
  log "exited — respawning in 3s"
  sleep 3
done
