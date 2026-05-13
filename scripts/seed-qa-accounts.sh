#!/bin/bash
# Seed test accounts for the testcases/ corpus on dev or staging.
# Idempotent — re-running is safe.
#
# Usage:    API_HOST=https://dev-api.doable.me bash scripts/seed-qa-accounts.sh
# Override: SEED_BACKOFF=5 API_HOST=... bash scripts/seed-qa-accounts.sh
#
# Why SEED_BACKOFF?
#   /auth/register is rate-limited (intentional, server-side security). Bulk
#   seeding from one IP without backoff trips 429 after ~2-3 calls. The default
#   12s backoff between accounts is the polite-client side of that contract.
#   Fixes BUG-AUTH-LOGIN-RATELIMIT-SEED-001.
set -euo pipefail

API="${API_HOST:-https://dev-api.doable.me}"
PW='TestPass123!'
BACKOFF="${SEED_BACKOFF:-12}"

declare -A ACCOUNTS=(
  [qa-owner@doable.test]='QA Owner'
  [qa-member@doable.test]='QA Member'
  [qa-viewer@doable.test]='QA Viewer'
  [qa-admin@doable.test]='QA Admin'
  [qa-alice@doable.test]='QA Alice'
  [qa-bob@doable.test]='QA Bob'
  [qa-charlie@doable.test]='QA Charlie'
  [qa-other@doable.test]='QA Other'
  [qa-x@doable.test]='QA X'
  [owner-free@doable.me]='Owner Free'
  [owner-pro@doable.me]='Owner Pro'
  [owner-biz@doable.me]='Owner Business'
  [ws-admin@doable.me]='WS Admin'
  [ws-member@doable.me]='WS Member'
  [ws-viewer@doable.me]='WS Viewer'
  [outsider@doable.me]='Outsider'
  [admin2@doable.me]='Admin Two'
  [testadmin@doable.me]='Test Admin'
  [testnorm@doable.me]='Norm Test'
  [testuser@doable.me]='Test User'
)

first=1
for email in "${!ACCOUNTS[@]}"; do
  if [ "$first" -eq 0 ]; then
    sleep "$BACKOFF"
  fi
  first=0
  name="${ACCOUNTS[$email]}"
  body=$(printf '{"email":"%s","password":"%s","displayName":"%s"}' "$email" "$PW" "$name")
  resp=$(curl -s -m 15 -X POST "$API/auth/register" -H "Content-Type: application/json" -d "$body")
  if echo "$resp" | grep -q '"user"'; then
    echo "+ created $email"
  elif echo "$resp" | grep -qi 'already.*registered\|exists\|in use'; then
    echo "= already exists $email"
  elif echo "$resp" | grep -qi 'too many\|rate.*limit\|429'; then
    echo "! rate-limited $email (consider larger SEED_BACKOFF; current=${BACKOFF}s)"
  else
    echo "! failed   $email — $(echo "$resp" | head -c 200)"
  fi
done
