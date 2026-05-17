#!/usr/bin/env bash
# Round-3 OOB suite runner — runs the expanded testcase suite (≥200 TCs)
# against the deployed Hetzner box and writes evidence + summary to the
# R3 session dir.
#
# By default uses the PARALLEL runner (testcases/oob/parallel.ts) — set
# DOABLE_OOB_PARALLEL=0 to fall back to the sequential runner.
#
# Required env: SERVER_IP, MINIMAX_API_KEY.
# Optional env: DOABLE_OOB_PARALLEL (default: 1), DOABLE_OOB_CONCURRENCY (default: 6).
set -euo pipefail
: "${SERVER_IP:?required}"
: "${MINIMAX_API_KEY:?required}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="${1:-cycleB-r3}"

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
export DOABLE_OOB_PARALLEL="${DOABLE_OOB_PARALLEL:-1}"
export DOABLE_OOB_CONCURRENCY="${DOABLE_OOB_CONCURRENCY:-6}"
export NODE_TLS_REJECT_UNAUTHORIZED=0  # self-signed cert on the box

SESSION_DIR=".omc/state/sessions/ralph-2026-05-17-r3-1000-tcs-parallel"
mkdir -p "$SESSION_DIR"
SUMMARY="${SESSION_DIR}/${LABEL}-suite.log"

START=$(date +%s)
bash testcases/run.sh 2>&1 | tee "$SUMMARY"
EXIT=${PIPESTATUS[0]}
END=$(date +%s)
echo "[suite] exit=$EXIT  wall=$((END-START))s  parallel=${DOABLE_OOB_PARALLEL}  concurrency=${DOABLE_OOB_CONCURRENCY}" | tee -a "$SUMMARY"
exit $EXIT
