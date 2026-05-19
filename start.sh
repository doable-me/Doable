#!/usr/bin/env bash
# Doable bare-metal launcher — starts api / web / ws inside the `doable`
# tmux session. Wired into systemd via `deployment/server-setup.sh` Step 12
# as `ExecStart=${INSTALL_DIR}/start.sh`. Idempotent: re-running while the
# session already exists is a no-op (RemainAfterExit=yes keeps systemd happy).
#
# tmux is the supervisor for the three long-running services because:
#   * api/ws use `tsx watch` (HMR) and web uses `next dev --turbopack` —
#     three foreground processes that systemd would otherwise have to
#     supervise individually with Type=forking glue.
#   * `tmux a -t doable` gives the operator a live view of each pane on
#     the running server, including startup errors that systemd's
#     journal can swallow.
#
# All three services bind to 127.0.0.1 — see CLAUDE.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SESSION="${DOABLE_TMUX_SESSION:-doable}"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "[start.sh] tmux session '$SESSION' already running — nothing to do"
  exit 0
fi

# R14 BUG-NEXT-CHOWN: self-heal stale root-owned Next.js artifacts before
# launching the web pane. setup-server.sh's `pnpm build` step can land
# .next/ as root-owned, then `next dev --turbopack` in the web pane hits
# EACCES on `mkdir .next/dev` and crashes — dashboard surfaces a 502 from
# cloudflared. The sudoers entry at /etc/sudoers.d/doable-sandbox permits
# this exact chown form. Failures here are best-effort (|| true) so a
# fresh install with no prior .next/ doesn't break.
for d in "$SCRIPT_DIR/apps/web/.next" "$SCRIPT_DIR/apps/web/.turbo"; do
  if [ -d "$d" ]; then
    sudo -n /usr/bin/chown -R doable:doable "$d" 2>/dev/null \
      || sudo -n /bin/chown -R doable:doable "$d" 2>/dev/null \
      || echo "[start.sh] WARN: could not chown $d — web pane may EACCES"
  fi
done

tmux new-session -d -s "$SESSION" -n api -x 200 -y 50
tmux send-keys -t "${SESSION}:api" "pnpm --filter @doable/api dev" C-m

tmux new-window -t "$SESSION" -n web
tmux send-keys -t "${SESSION}:web" "pnpm --filter @doable/web dev" C-m

tmux new-window -t "$SESSION" -n ws
tmux send-keys -t "${SESSION}:ws" "pnpm --filter @doable/ws dev" C-m

echo "[start.sh] doable tmux session started with 3 windows (api, web, ws). Attach: tmux a -t doable"
