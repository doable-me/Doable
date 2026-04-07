#!/bin/bash
# Doable — tmux session launcher
# All services run inside tmux. No PM2. No screen. Just tmux.
#
# Usage:  ./start.sh
# Attach: tmux attach -t doable
# Windows: api (4000), web (3000), ws (4001) — ALL on 127.0.0.1

set -euo pipefail
cd "$(dirname "$0")"

SESSION="doable"
tmux kill-session -t "$SESSION" 2>/dev/null || true

# API — Hono server with tsx watch (hot reload)
tmux new-session -d -s "$SESSION" -n "api" -c "$(pwd)"
tmux send-keys -t "$SESSION:api" "pnpm dev:api" Enter

# Web — Next.js production server (build then start)
tmux new-window -t "$SESSION" -n "web" -c "$(pwd)"
tmux send-keys -t "$SESSION:web" "pnpm --filter web build && pnpm --filter web start" Enter

# WS — WebSocket server with tsx watch
tmux new-window -t "$SESSION" -n "ws" -c "$(pwd)"
tmux send-keys -t "$SESSION:ws" "pnpm dev:ws" Enter

tmux select-window -t "$SESSION:api"
echo "Doable tmux session started. Attach with: tmux attach -t doable"
echo "  Windows: api (127.0.0.1:4000) | web (127.0.0.1:3000) | ws (127.0.0.1:4001)"
