#!/usr/bin/env bash
# Round-2 expanded OOB suite runner — points testcases/run.sh at the
# deployed Hetzner box and writes a summary alongside the evidence files.
#
# Required env: SERVER_IP, MINIMAX_API_KEY.
set -euo pipefail
: "${SERVER_IP:?required}"
: "${MINIMAX_API_KEY:?required}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="${1:-cycleA}"

cd "$REPO_ROOT"
# IMPORTANT: testcases/oob/*.test.ts files always call apiFetch("/api/…") so
# the path includes the /api prefix. API_BASE therefore MUST be the host
# origin only — NOT include /api or /ws — or you get /api/api/health which
# nginx still 200s but the API itself bounces with "Missing or invalid
# Authorization header" (the /api/api/* path falls into an auth-gated
# wildcard route, not /api/health). Same for WS.
export DOABLE_BASE="https://${SERVER_IP}"
export DOABLE_API_BASE="https://${SERVER_IP}"
export DOABLE_WS_BASE="wss://${SERVER_IP}"
export DOABLE_WEB_BASE="https://${SERVER_IP}"
export DOABLE_MINIMAX_KEY="${MINIMAX_API_KEY}"
export DOABLE_MOCK_AI=false
export NODE_TLS_REJECT_UNAUTHORIZED=0  # self-signed cert on the box

mkdir -p ".omc/state/sessions/ralph-2026-05-17-r2-multi-install"
SUMMARY=".omc/state/sessions/ralph-2026-05-17-r2-multi-install/${LABEL}-suite.log"

bash testcases/run.sh 2>&1 | tee "$SUMMARY"
EXIT=${PIPESTATUS[0]}
echo "[suite] exit=$EXIT" | tee -a "$SUMMARY"
exit $EXIT
