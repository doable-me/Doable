#!/bin/sh
# Entrypoint that runs the given command inside a tmux session.
# Allows `docker exec -it <container> tmux attach` for live debugging.
#
# Usage: tmux-entrypoint.sh <session-name> <command> [args...]
#   e.g. tmux-entrypoint.sh api npx tsx services/api/src/index.ts

SESSION="$1"
shift

# Forward SIGTERM/SIGINT to the tmux session for graceful shutdown
cleanup() {
  tmux send-keys -t "$SESSION" C-c 2>/dev/null
  sleep 2
  tmux kill-session -t "$SESSION" 2>/dev/null
}
trap cleanup TERM INT

# Start a detached tmux session running the service
tmux new-session -d -s "$SESSION" -x 200 -y 50 "$@"

# Forward pane output to the container's stderr so `docker logs` and `docker
# compose logs` actually see app output. Without this, a service that crashes
# on startup (missing env, ESM resolution error, port-in-use, etc.) appears as
# a silent "Restarting (0)" loop with empty logs — impossible to debug. The
# pipe-pane runs for the lifetime of the session and adds negligible overhead.
tmux pipe-pane -t "$SESSION" -o 'cat >&2' 2>/dev/null || true

# Wait for the session to end (process exits → pane closes → session closes).
# Capture the pane exit code via tmux wait-for so a crashed workload propagates
# non-zero to Docker's restart policy instead of silently exiting 0.
# Signal the wait-for channel from the tmux hook set below, then block until
# it fires.
# Record the pane exit code to a temp file when the pane dies, then signal
# the wait-for channel so the blocking wait-for call below unblocks.
EXIT_FILE=$(mktemp /tmp/tmux-exit-XXXXXX)
tmux set-hook -t "$SESSION" pane-died \
  "run-shell \"tmux display-message -p '#{pane_dead_status}' > ${EXIT_FILE}; tmux wait-for -S ${SESSION}-done\"" \
  2>/dev/null || true
# Also fire the signal on session-closed (covers clean exits where pane-died
# may not fire before the session is destroyed).
tmux set-hook -t "$SESSION" session-closed \
  "run-shell \"tmux wait-for -S ${SESSION}-done\"" \
  2>/dev/null || true
tmux wait-for "${SESSION}-done"
EXIT_CODE=0
if [ -s "$EXIT_FILE" ]; then
  EXIT_CODE=$(cat "$EXIT_FILE")
fi
rm -f "$EXIT_FILE"
exit "${EXIT_CODE:-0}"
