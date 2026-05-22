#!/bin/bash
# Helper to run cleanup-admin-ai-members.mjs on a server.
# Usage: cd <doable-dir> && bash scripts/run-cleanup-admin-ai-members.sh [APPLY]
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | sed -E 's/^DATABASE_URL=//; s/^"(.*)"$/\1/')"
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL not found in $ROOT/.env" >&2
  exit 1
fi
export DATABASE_URL
# Run from services/api so node can resolve the 'postgres' package.
cd "$ROOT/services/api"
APPLY="${1:-}"
if [ "$APPLY" = "APPLY" ] || [ "$APPLY" = "1" ]; then
  APPLY=1 node "$ROOT/scripts/cleanup-admin-ai-members.mjs"
else
  node "$ROOT/scripts/cleanup-admin-ai-members.mjs"
fi
