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

# Build the command that runs inside the pane. Wrap the workload so we can
# capture its exit code and signal completion via tmux's wait-for channel.
# The exit code lands in a per-session file the entrypoint reads after wake-up.
EXIT_FILE="/tmp/tmux-exit-${SESSION}"
rm -f "$EXIT_FILE"
CMD_LINE="$*; echo \$? > $EXIT_FILE; tmux wait-for -S ${SESSION}-done"

# Start a detached tmux session running the wrapped workload.
tmux new-session -d -s "$SESSION" -x 200 -y 50 "/bin/sh -c '$CMD_LINE'"

# Forward pane output to the container's stdout so `docker logs` and `docker
# compose logs` see app output. Without this, a service that crashes on
# startup appears as a silent "Restarting (0)" loop with empty logs.
# Previously piped to /proc/1/fd/2 but in `docker compose up -d`
# PID-1's fd/2 is symlinked to /dev/null (we verified via
# `docker exec ... ls -la /proc/1/fd/2 -> /dev/null`). Docker captures fd/1
# (stdout) into the json-file log driver but not fd/2 in detached mode. Pipe
# to fd/1 so `docker logs <container>` actually surfaces node startup errors.
tmux pipe-pane -t "$SESSION" -o "cat > /proc/1/fd/1" 2>/dev/null || true

# Block until the workload signals completion. The wait-for is sent by the
# wrapper above when the command exits (success or failure), so we no longer
# depend on tmux hooks that fire on transient session events.
tmux wait-for "${SESSION}-done" 2>/dev/null || true

EXIT_CODE=0
if [ -s "$EXIT_FILE" ]; then
  EXIT_CODE=$(cat "$EXIT_FILE")
fi
rm -f "$EXIT_FILE"
exit "${EXIT_CODE:-0}"
