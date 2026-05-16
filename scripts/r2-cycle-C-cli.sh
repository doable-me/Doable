#!/usr/bin/env bash
# Round-2 cycle C: doable-cli driven install on Hetzner #2987905.
# Requires the doable-cli binary built (cargo build --release -p doable-cli).
# Drives the install from the operator's laptop — the CLI ssh-uploads
# deployment/server-setup.sh, executes it, and renders the 13-step sidebar.
#
# Required env: MINIMAX_API_KEY, SSH_KEY, SERVER_IP.
set -euo pipefail
: "${MINIMAX_API_KEY:?required}"
: "${SSH_KEY:?required}"
: "${SERVER_IP:?required}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[r2-C] 1. Sanity: doable-cli binary present?"
CLI_BIN="$REPO_ROOT/doable-cli/target/release/doable"
[ -x "$CLI_BIN" ] || CLI_BIN="$REPO_ROOT/doable-cli/target/release/doable.exe"
if [ ! -x "$CLI_BIN" ]; then
  echo "[r2-C] doable binary not found, building (cargo build --release)..."
  (cd "$REPO_ROOT/doable-cli" && cargo build --release 2>&1 | tail -5)
  [ -x "$CLI_BIN" ] || CLI_BIN="$REPO_ROOT/doable-cli/target/release/doable.exe"
fi
echo "[r2-C] CLI: $CLI_BIN"

SSHCMD="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 root@${SERVER_IP}"

echo "[r2-C] 2. Tear down any prior install (docker + bare-metal)"
$SSHCMD 'cd /root/doable 2>/dev/null && \
  docker compose -f deployment/docker/docker-compose.yml down -v 2>/dev/null || true; \
  systemctl stop doable 2>/dev/null || true; \
  systemctl stop nginx 2>/dev/null || true; \
  systemctl stop caddy 2>/dev/null || true; \
  rm -rf /root/doable; \
  echo "[done] cleanup"'

echo "[r2-C] 3. Drive install via doable-cli (NO_TUNNEL + MINIMAX preconfigured)"
# Run the CLI non-interactively. Output streams to console; the 13 phases
# advance based on `Step N/13` markers in server-setup.sh's stdout.
# --remote-env KEY=VAL forwards env vars into the remote bash -s -- prefix.
"$CLI_BIN" \
  --host "${SERVER_IP}" \
  --user root \
  --env-name doable-test \
  --ssh-key "${SSH_KEY}" \
  --non-interactive \
  --skip-admin-user \
  --remote-env "NO_TUNNEL=1" \
  --remote-env "NON_INTERACTIVE=1" \
  --remote-env "DOABLE_NO_TMUX=1" \
  --remote-env "HOST=${SERVER_IP}" \
  --remote-env "DOMAIN=${SERVER_IP}" \
  --remote-env "REPO=doable-me/doable" \
  --remote-env "MINIMAX_API_KEY=${MINIMAX_API_KEY}" 2>&1 | tee "$REPO_ROOT/.omc/state/sessions/ralph-2026-05-17-r2-multi-install/cycleC-cli.log"

echo "[r2-C] 4. Wait for api healthcheck (max 120s)"
for i in $(seq 1 24); do
  if curl -sk "https://${SERVER_IP}/api/health" 2>/dev/null | grep -q '"status":"healthy"'; then
    echo "[r2-C] healthy after ${i}*5s"
    break
  fi
  sleep 5
done

echo "[r2-C] 5. Capture state"
curl -sk "https://${SERVER_IP}/api/health" > "$REPO_ROOT/.omc/state/sessions/ralph-2026-05-17-r2-multi-install/cycleC-health.json" || true
echo "[r2-C] done"
