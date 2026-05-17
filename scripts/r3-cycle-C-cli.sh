#!/usr/bin/env bash
# Round-3 cycle C — doable-cli driven install on Hetzner. Wraps the
# existing r2-cycle-C-cli.sh and writes evidence to the R3 session dir.
# Required env: MINIMAX_API_KEY, SSH_KEY, SERVER_IP.
set -euo pipefail
: "${MINIMAX_API_KEY:?required}"
: "${SSH_KEY:?required}"
: "${SERVER_IP:?required}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION_DIR="${REPO_ROOT}/.omc/state/sessions/ralph-2026-05-17-r3-1000-tcs-parallel"
mkdir -p "$SESSION_DIR"

bash "$REPO_ROOT/scripts/r2-cycle-C-cli.sh" 2>&1 | tee "${SESSION_DIR}/cycleC-deploy.log"
EXIT=${PIPESTATUS[0]}
echo "[r3-C] exit=$EXIT" | tee -a "${SESSION_DIR}/cycleC-deploy.log"
exit $EXIT
