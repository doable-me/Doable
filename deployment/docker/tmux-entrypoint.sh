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

# Wait for the session to end (process exits → pane closes → session closes)
while tmux has-session -t "$SESSION" 2>/dev/null; do
  sleep 1
done
