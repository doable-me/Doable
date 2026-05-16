#!/usr/bin/env bash
# Doable Docker-on-Hetzner smoke tests.
# Runs from inside the box (after docker/setup.sh). Probes the live nginx,
# registers the first user (becomes platform owner), exercises a curated
# subset of the testcases catalogue end-to-end.
#
# Usage (inside the box):
#   HOST=95.216.8.180 ./scripts/smoke-tests-docker.sh
#
# Writes one line per TC to /tmp/doable-smoke-results.tsv (TC-ID, status, http_code, ms).
# Exit code = number of failures.

set -u
HOST="${HOST:-127.0.0.1}"
BASE="https://${HOST}"
API="${BASE}/api"
CURL=(curl -sk -o /dev/null -w '%{http_code}|%{time_total}')
RESULTS=/tmp/doable-smoke-results.tsv
: > "$RESULTS"
FAILS=0
PASSES=0

ts() { date -u +%H:%M:%S; }
log_tc() {
  local id=$1 expected=$2 got=$3 ms=$4 note=${5:-}
  if [[ "$expected" == "$got" ]]; then
    PASSES=$((PASSES+1)); local r=PASS
  else
    FAILS=$((FAILS+1)); local r=FAIL
  fi
  printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$(ts)" "$id" "$r" "$got" "$expected" "$note" | tee -a "$RESULTS"
}

probe() {
  # probe <TC-ID> <expected-status> <method> <path> [data] [extra-header]
  local id=$1 expected=$2 method=$3 path=$4 data=${5:-} header=${6:-}
  local args=("${CURL[@]}" -X "$method")
  [[ -n "$header" ]] && args+=(-H "$header")
  if [[ -n "$data" ]]; then
    args+=(-H 'Content-Type: application/json' --data "$data")
  fi
  local resp got ms
  resp=$("${args[@]}" "${API}${path}" 2>&1) || resp="000|0"
  got=${resp%%|*}; ms=${resp##*|}
  log_tc "$id" "$expected" "$got" "$ms"
}

# Capture body (not just status) when we need to extract tokens/IDs.
fetch() {
  local method=$1 path=$2 data=${3:-} header=${4:-}
  local args=(curl -sk -X "$method")
  [[ -n "$header" ]] && args+=(-H "$header")
  if [[ -n "$data" ]]; then
    args+=(-H 'Content-Type: application/json' --data "$data")
  fi
  "${args[@]}" "${API}${path}"
}

echo "═══ Doable smoke tests against $BASE ($(date -u +%FT%TZ)) ═══"

# ── 1. Liveness ─────────────────────────────────────────────────────────────
# probe() targets ${API} = ${BASE}/api, so "/" here would be /api/ (not the web root).
# Hitting /api/health is the canonical liveness signal; /healthz is the auth-walled
# proof that the auth middleware is wired up.
probe TC-SMOKE-001 200 GET /health
probe TC-SMOKE-003 401 GET /healthz   # walled — confirms auth wiring
# Web root probe (separate base URL — bypasses /api/ prefix)
web_code=$(curl -sk -o /dev/null -w '%{http_code}' "${BASE}/")
log_tc TC-SMOKE-WEB-001 200 "$web_code" 0 "web /"

# ── 2. Get the platform-admin session ──────────────────────────────────────
# First-ever signup becomes platform owner (services/api/src/auth/firstUserBootstrap.ts).
# Once the bootstrap fires, subsequent signups are regular members — they get
# 401 on /setup/status and 403 on /admin/* (correct security).
# Strategy: persist the first admin's creds in /tmp/doable-first-admin.json so
# repeat smoke runs against the SAME database log back in as the original admin
# instead of creating a non-admin second user (which would flunk the admin-path TCs).
ADMIN_CREDS=/tmp/doable-first-admin.json
if [[ -f "$ADMIN_CREDS" ]]; then
  EMAIL=$(python3 -c "import json; print(json.load(open('$ADMIN_CREDS'))['email'])")
  PASS=$(python3 -c "import json; print(json.load(open('$ADMIN_CREDS'))['password'])")
  echo "Re-using stored first admin: $EMAIL"
  LOGIN=$(fetch POST /auth/login "$(printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASS")")
  TOKEN=$(echo "$LOGIN" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("tokens") or {}).get("accessToken",""))' 2>/dev/null)
  if [[ -z "$TOKEN" ]]; then
    log_tc TC-AUTH-LOGIN-FIRST-001 200 000 0 "could not log in as stored admin"
  else
    log_tc TC-AUTH-LOGIN-FIRST-001 200 200 0 "logged in as stored admin"
  fi
else
  EMAIL="admin-$(date +%s)@doable.test"
  PASS='TestPass123!'
  REG_BODY=$(printf '{"email":"%s","password":"%s","displayName":"Smoke Admin"}' "$EMAIL" "$PASS")
  REG=$(fetch POST /auth/register "$REG_BODY")
  echo "Register body (first 200): $(echo "$REG" | head -c 200)"
  TOKEN=$(echo "$REG" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("tokens") or {}).get("accessToken",""))' 2>/dev/null)
  if [[ -z "$TOKEN" ]]; then
    log_tc TC-AUTH-REG-001 200 000 0 "missing accessToken in register response"
  else
    log_tc TC-AUTH-REG-001 200 200 0 "token-len=${#TOKEN}"
    printf '{"email":"%s","password":"%s"}\n' "$EMAIL" "$PASS" > "$ADMIN_CREDS"
    chmod 600 "$ADMIN_CREDS"
  fi
fi
AUTH="Authorization: Bearer ${TOKEN}"

# ── 3. /auth/me with the JWT ────────────────────────────────────────────────
probe TC-AUTH-ME-001 200 GET /auth/me '' "$AUTH"

# ── 4. Setup status — first user should be platform admin ──────────────────
STATUS=$(fetch GET /setup/status '' "$AUTH")
echo "Setup status: $(echo "$STATUS" | head -c 200)"
echo "$STATUS" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("isPlatformAdmin") is True else 1)' \
  && log_tc TC-SETUP-001 200 200 0 "isPlatformAdmin=true" \
  || log_tc TC-SETUP-001 200 401 0 "first user is NOT platform admin — BUG"

# ── 5. Setup status — AI provider should be pre-seeded from MINIMAX_API_KEY ─
# services/api/src/routes/setup.ts:366 returns { fields_configured: {ai_provider, ai_provider_key, google_oauth, github_oauth, ...} }
# seedAiProviderFromEnv() at services/api/src/lib/seedAiProviderFromEnv.ts:33 sets provider=custom + base=https://api.minimax.io/v1 for MINIMAX_API_KEY.
echo "$STATUS" | python3 -c '
import json,sys
d=json.load(sys.stdin)
fc=d.get("fields_configured") or {}
ok = (fc.get("ai_provider") is True
      and fc.get("ai_provider_key") is True
      and (d.get("ai_provider") in ("custom","anthropic","openai"))
      and d.get("ai_provider_base_url"))
sys.exit(0 if ok else 1)' \
  && log_tc TC-SETUP-AI-001 200 200 0 "AI pre-seeded (see ai_provider + ai_provider_base_url in /setup/status)" \
  || log_tc TC-SETUP-AI-001 200 404 0 "AI provider NOT pre-seeded — MINIMAX_API_KEY env passthrough broken or seed did not run"

# ── 6. Workspace + projects ────────────────────────────────────────────────
probe TC-WS-001 200 GET /workspaces '' "$AUTH"
probe TC-PROJ-001 200 GET /projects '' "$AUTH"

# ── 7. Login as the user we just registered ────────────────────────────────
LOGIN_BODY=$(printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASS")
probe TC-AUTH-LOGIN-001 200 POST /auth/login "$LOGIN_BODY"
probe TC-AUTH-LOGIN-002 401 POST /auth/login "$(printf '{"email":"%s","password":"wrong"}' "$EMAIL")"
probe TC-AUTH-LOGIN-003 401 POST /auth/login '{"email":"nobody-12345@doable.test","password":"any"}'
probe TC-AUTH-LOGIN-005 400 POST /auth/login '{"email":"a@b.com","password":""}'
probe TC-AUTH-LOGIN-007 400 POST /auth/login '{"email":"","password":"x"}'

# ── 8. Public catalogues (truly auth-optional) ─────────────────────────────
probe TC-PUBLIC-001 200 GET /marketplace/listings

# ── 9. Authenticated admin catalogues ─────────────────────────────────────
# admin-frameworks + admin-features moved behind authMiddleware (security
# tightening — see services/api/src/routes/admin-features.ts:27). 401 without
# token is now the correct contract.
probe TC-ADMIN-FRAMEWORKS-001 200 GET /admin/frameworks '' "$AUTH"
probe TC-ADMIN-FEATURES-001 200 GET /admin/features '' "$AUTH"
probe TC-ADMIN-USERS-001 200 GET /admin/users '' "$AUTH"
# Note: there is no /admin/chat endpoint in services/api/src/routes/* — admin
# chat moderation lives under /admin/audit/conv (TC-ADMIN-AUDIT-CONV-* in
# the testcases catalogue). Skipping here to keep the smoke focused.

# ── 10. Forbidden / 401 / 403 sanity ──────────────────────────────────────
probe TC-AUTH-401-001 401 GET /auth/me            # no token
probe TC-AUTH-401-002 401 GET /workspaces         # no token
probe TC-AUTH-401-003 401 GET /admin/users        # no token

echo ""
echo "═══ RESULT: $PASSES PASS, $FAILS FAIL ═══"
echo "Full TSV: $RESULTS"
exit $FAILS
