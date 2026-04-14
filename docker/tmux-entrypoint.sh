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

# Wait for the session to end (process exits → pane closes → session closes)
while tmux has-session -t "$SESSION" 2>/dev/null; do
  sleep 1
done
