#!/usr/bin/env bash
# Doable OOB Smoke Test Runner
# Usage: DOABLE_BASE=https://your-install.example.com bash testcases/run.sh
#
# Environment variables:
#   DOABLE_BASE          API+Web base URL (default: http://localhost:3001)
#   DOABLE_API_BASE      Override API base if different from DOABLE_BASE
#   DOABLE_WS_BASE       Override WS base (default: ws:// version of API_BASE)
#   DOABLE_WEB_BASE      Override web URL (default: DOABLE_BASE)
#   DOABLE_TEST_EMAIL    Email for the owner test account
#   DOABLE_TEST_PASSWORD Password for the owner test account
#   DOABLE_MINIMAX_KEY   Optional: MINIMAX_API_KEY for AI-seeding tests
#   DOABLE_MOCK_AI       Set to "true" to enable mock AI provider for chat tests

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Defaults ────────────────────────────────────────────────────────────────
export DOABLE_BASE="${DOABLE_BASE:-http://localhost:3001}"
export DOABLE_API_BASE="${DOABLE_API_BASE:-$DOABLE_BASE}"
export DOABLE_TEST_EMAIL="${DOABLE_TEST_EMAIL:-oob-smoke-$(date +%s)@example.local}"
export DOABLE_TEST_PASSWORD="${DOABLE_TEST_PASSWORD:-SmokeTest99!}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Doable OOB Smoke Tests"
echo " Target: $DOABLE_BASE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Find tsx / node runner ───────────────────────────────────────────────────
TSX_BIN=""
if command -v tsx &>/dev/null; then
  TSX_BIN="tsx"
elif [ -f "$SCRIPT_DIR/../node_modules/.bin/tsx" ]; then
  TSX_BIN="$SCRIPT_DIR/../node_modules/.bin/tsx"
elif command -v npx &>/dev/null; then
  TSX_BIN="npx tsx"
else
  echo "ERROR: tsx not found. Install it: npm i -g tsx  or  pnpm add -g tsx" >&2
  exit 1
fi

# ── Create evidence directory ────────────────────────────────────────────────
mkdir -p "$SCRIPT_DIR/evidence"

# ── Run ──────────────────────────────────────────────────────────────────────
if [ "${DOABLE_OOB_PARALLEL:-0}" = "1" ]; then
  echo " Mode: PARALLEL (concurrency=${DOABLE_OOB_CONCURRENCY:-6})"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  $TSX_BIN "$SCRIPT_DIR/oob/parallel.ts"
else
  $TSX_BIN "$SCRIPT_DIR/oob/index.ts"
fi
