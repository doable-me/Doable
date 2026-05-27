#!/usr/bin/env bash
# Doable bare-metal launcher — starts api / web / ws inside the `doable`
# tmux session. Wired into systemd via `deployment/server-setup.sh` Step 12
# as `ExecStart=${INSTALL_DIR}/start.sh`. Idempotent: re-running while the
# session already exists is a no-op (RemainAfterExit=yes keeps systemd happy).
#
# tmux is NOT a supervisor — if a pane's process exits the pane just dies and
# nothing restarts it. To prevent the api (or web/ws) from staying down after
# a crash, every send-keys command is wrapped in an infinite restart loop that
# respawns the process within ~3 s. The systemd Restart=on-failure guard only
# fires when the tmux SERVER exits (its Main PID), which does NOT happen when
# a single pane dies — so per-pane looping is the only defence.
# Incident 2026-05-27: api pane died (tsx-watch / transient .env read failure),
# tmux server stayed alive, systemd never restarted, api was down ~6 min.
# This loop closes that gap: a crashed service respawns within seconds so the
# api never stays down.
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
# .env ownership self-heal: a root-side operation (e.g. setup-server.sh re-run)
# can leave .env owned by root, making it unreadable to the `doable` user so
# api/ws die on startup. Best-effort chown here keeps that from causing a pane
# crash on every subsequent systemd start.
if [ -f "$SCRIPT_DIR/.env" ]; then
  sudo -n /usr/bin/chown doable:doable "$SCRIPT_DIR/.env" 2>/dev/null \
    || sudo -n /bin/chown doable:doable "$SCRIPT_DIR/.env" 2>/dev/null \
    || echo "[start.sh] WARN: could not chown .env — api/ws may fail to read it"
fi

tmux new-session -d -s "$SESSION" -n api -x 200 -y 50
tmux send-keys -t "${SESSION}:api" 'while true; do pnpm --filter @doable/api dev; rc=$?; echo "[start.sh] api pane exited (rc=$rc) — respawning in 3s"; sleep 3; done' C-m

tmux new-window -t "$SESSION" -n web
# Use the Next.js standalone production server, not `next dev --turbopack`.
# setup-server.sh:1134 builds the standalone via `env -u NODE_ENV
# NODE_ENV=production pnpm build`; that artifact is what gets served. dev
# mode doesn't hydrate React 19 reliably on a tunnelled install — every
# authed page sits at the SSR AuthGuard "Loading…" fallback because the
# AuthProvider mount effect never fires, signup submits natively, etc.
# Validated end-to-end via Playwright: standalone → fiberCount=267, signup →
# /dashboard with full sidebar + platform-owner workspace.
[ -f "$SCRIPT_DIR/apps/web/.next/standalone/apps/web/server.js" ] || {
  echo "[start.sh] ERROR: apps/web/.next/standalone/apps/web/server.js missing — run setup-server.sh first (or 'env -u NODE_ENV NODE_ENV=production pnpm build' in $SCRIPT_DIR)" >&2
  exit 1
}
tmux send-keys -t "${SESSION}:web" 'while true; do cd apps/web/.next/standalone && HOSTNAME=127.0.0.1 PORT=3000 NODE_ENV=production node apps/web/server.js; rc=$?; echo "[start.sh] web pane exited (rc=$rc) — respawning in 3s"; sleep 3; done' C-m

tmux new-window -t "$SESSION" -n ws
tmux send-keys -t "${SESSION}:ws" 'while true; do pnpm --filter @doable/ws dev; rc=$?; echo "[start.sh] ws pane exited (rc=$rc) — respawning in 3s"; sleep 3; done' C-m

echo "[start.sh] doable tmux session started with 3 windows (api, web, ws). Attach: tmux a -t doable"
