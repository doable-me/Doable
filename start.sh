#!/bin/bash
# Doable — tmux session launcher
# All services run inside tmux. No PM2. No screen. Just tmux.
#
# Usage:  ./start.sh
# Attach: tmux attach -t doable
# Windows: api (4000), web (3000), ws (4001) — ALL on 127.0.0.1

set -euo pipefail
cd "$(dirname "$0")"

# Force the full system PATH including sbin dirs. Debian's /etc/profile
# rewrites PATH based on UID (root gets sbin dirs, non-root doesn't), which
# clobbered the systemd Environment=PATH for our doable runtime user — the
# dovault `mac-profile` composer then failed with `spawn apparmor_parser
# ENOENT` because apparmor_parser lives in /usr/sbin. Export it here so the
# tmux session and every descendant inherits a complete PATH.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Ensure all scripts are executable (git on Windows can strip +x)
chmod +x watchdog.sh start.sh setup-server.sh 2>/dev/null || true

# Run database migrations before starting services
echo "Running database migrations..."
pnpm db:migrate || echo "⚠️  Migration failed (non-fatal, continuing...)"

SESSION="doable"
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Detect Docker/container — bind 0.0.0.0 inside so docker -p forwarding works.
# Bare-metal stays on 127.0.0.1 with Cloudflare Tunnel as the public ingress.
if [ -f /.dockerenv ] || [ -f /run/.containerenv ] || grep -qa docker /proc/1/cgroup 2>/dev/null; then
  WEB_HOSTNAME="${WEB_HOSTNAME:-0.0.0.0}"
else
  WEB_HOSTNAME="${WEB_HOSTNAME:-127.0.0.1}"
fi

# API — Hono server with tsx watch (hot reload)
tmux new-session -d -s "$SESSION" -n "api" -c "$(pwd)"
tmux send-keys -t "$SESSION:api" "pnpm dev:api" Enter

# Web — Next.js production server (build then start with standalone output)
# The `postbuild` script in apps/web/package.json copies .next/static and public/
# into the standalone output automatically — no manual step required.
tmux new-window -t "$SESSION" -n "web" -c "$(pwd)/apps/web"
tmux send-keys -t "$SESSION:web" "cd $(pwd)/apps/web && rm -rf .next .turbo && pnpm --filter web build && PORT=3000 HOSTNAME=${WEB_HOSTNAME} node .next/standalone/apps/web/server.js" Enter

# WS — WebSocket server with tsx watch
tmux new-window -t "$SESSION" -n "ws" -c "$(pwd)"
tmux send-keys -t "$SESSION:ws" "pnpm dev:ws" Enter

tmux select-window -t "$SESSION:api"
echo "Doable tmux session started. Attach with: tmux attach -t doable"
echo "  Windows: api (127.0.0.1:4000) | web (127.0.0.1:3000) | ws (127.0.0.1:4001)"
