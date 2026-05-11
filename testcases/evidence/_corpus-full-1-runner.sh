#!/usr/bin/env bash
# Corpus FULL-1 runner: 01-auth + 02-workspace + 03-projects (uncovered cases)
set +e
API="https://zantaz-api.doable.me"
TKN_OWNER="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("testcases/evidence/_tokens-env1.json"))["qa-owner"].access)')"
TKN_VIEWER="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("testcases/evidence/_tokens-env1.json"))["qa-viewer"].access)')"
RU="$(date +%s)"

OUT="testcases/99-runlog/env1/CORPUS-FULL-1.md"

run() {
  local id="$1" desc="$2" exp="$3" method="$4" path="$5" body="$6" tkn="$7"
  local now=$(date -u +%FT%TZ)
  local code
  if [ -n "$body" ]; then
    code=$(curl -sS -o /tmp/_b -w "%{http_code}" -X "$method" -H "Authorization: Bearer ${tkn}" -H "Content-Type: application/json" -d "$body" "${API}${path}" 2>&1)
  else
    code=$(curl -sS -o /tmp/_b -w "%{http_code}" -X "$method" -H "Authorization: Bearer ${tkn}" "${API}${path}" 2>&1)
  fi
  local snippet=$(head -c 200 /tmp/_b | tr '\n|' '  ' )
  local result="INFO"
  if [ -n "$exp" ]; then
    if [ "$code" = "$exp" ]; then result="PASS"; else result="FAIL"; fi
  fi
  echo "| $id | $now | $result | got=$code exp=$exp - $desc · $snippet |" >> "$OUT"
}

cat > "$OUT" <<HDR
# RUN env1 - CORPUS FULL-1: 01-auth + 02-workspace + 03-projects (uncovered) - 2026-05-10

**Target:** ${API} - ENV_NAME=env1
**Tester:** corpus-runner-1 (Task #9 FULL-CORPUS-1) - 5-min hard cap
**Tokens:** testcases/evidence/_tokens-env1.json (qa-owner platform admin, rate-limit exempt)
**Author guide:** testcases/_AUTHOR-GUIDE.md

## Result legend
- **PASS** got==expected
- **FAIL** got!=expected; bug filed or TC evolved
- **INFO** observation only, no expected status

## Live runs

| Test ID | Run timestamp (UTC) | Result | Description |
|---------|---------------------|--------|-------------|
HDR

# Create scratch workspace
WS_RESP=$(curl -sS -X POST -H "Authorization: Bearer ${TKN_OWNER}" -H "Content-Type: application/json" \
  -d "{\"name\":\"FULL1 WS ${RU}\",\"slug\":\"full1-ws-${RU}\"}" "${API}/workspaces")
WSID=$(echo "$WS_RESP" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).data.id)}catch(e){console.log("")}})')
echo "WSID=$WSID"

# === 01-AUTH uncovered ===
run "TC-AUTH-REGISTER-001" "register happy path" "201" "POST" "/auth/register" "{\"email\":\"qa-full1-${RU}@doable.test\",\"password\":\"TestPass123!\",\"displayName\":\"QA Full1\"}" ""
run "TC-AUTH-REGISTER-003" "duplicate email rejected" "409" "POST" "/auth/register" "{\"email\":\"qa-owner@doable.test\",\"password\":\"TestPass123!\"}" ""
run "TC-AUTH-REGISTER-004" "missing email" "400" "POST" "/auth/register" "{\"password\":\"TestPass123!\"}" ""
run "TC-AUTH-REGISTER-005" "empty email" "400" "POST" "/auth/register" "{\"email\":\"\",\"password\":\"TestPass123!\"}" ""
run "TC-AUTH-REGISTER-006" "email no @" "400" "POST" "/auth/register" "{\"email\":\"plainstring\",\"password\":\"TestPass123!\"}" ""
run "TC-AUTH-REGISTER-008" "multiple @" "400" "POST" "/auth/register" "{\"email\":\"a@b@c.com\",\"password\":\"TestPass123!\"}" ""
run "TC-AUTH-REGISTER-016" "missing password" "400" "POST" "/auth/register" "{\"email\":\"qa-pw-${RU}@doable.test\"}" ""
run "TC-AUTH-REGISTER-017" "password too short" "400" "POST" "/auth/register" "{\"email\":\"qa-pw-s-${RU}@doable.test\",\"password\":\"Aa1bcde\"}" ""
run "TC-AUTH-REGISTER-021" "password no uppercase" "400" "POST" "/auth/register" "{\"email\":\"qa-pw-u-${RU}@doable.test\",\"password\":\"testpass123\"}" ""
run "TC-AUTH-REGISTER-022" "password no lowercase" "400" "POST" "/auth/register" "{\"email\":\"qa-pw-l-${RU}@doable.test\",\"password\":\"TESTPASS123\"}" ""
run "TC-AUTH-REGISTER-023" "password no digit" "400" "POST" "/auth/register" "{\"email\":\"qa-pw-d-${RU}@doable.test\",\"password\":\"TestPassword\"}" ""
run "TC-AUTH-REGISTER-030" "displayName XSS strip" "201" "POST" "/auth/register" "{\"email\":\"qa-xss-${RU}@doable.test\",\"password\":\"TestPass123!\",\"displayName\":\"<script>alert(1)</script>Bob\"}" ""
run "TC-AUTH-REGISTER-031" "displayName only tags" "400" "POST" "/auth/register" "{\"email\":\"qa-tag-${RU}@doable.test\",\"password\":\"TestPass123!\",\"displayName\":\"<b></b>\"}" ""
run "TC-AUTH-REGISTER-035" "displayName empty" "400" "POST" "/auth/register" "{\"email\":\"qa-en-${RU}@doable.test\",\"password\":\"TestPass123!\",\"displayName\":\"\"}" ""

run "TC-AUTH-LOGIN-005" "login known good owner" "200" "POST" "/auth/login" "{\"email\":\"qa-owner@doable.test\",\"password\":\"TestPass123!\"}" ""
run "TC-AUTH-LOGIN-007" "login null body" "400" "POST" "/auth/login" "null" ""
run "TC-AUTH-ME-008" "auth/me malformed jwt" "401" "GET" "/auth/me" "" "not.a.jwt"

run "TC-AUTH-MISC-002" "OPTIONS register CORS" "" "OPTIONS" "/auth/register" "" ""
run "TC-AUTH-MISC-003" "OPTIONS me CORS" "" "OPTIONS" "/auth/me" "" ""

# === 02-WORKSPACE uncovered ===
run "TC-WS-CRUD-008" "POST /workspaces empty name" "400" "POST" "/workspaces" "{\"name\":\"\",\"slug\":\"x123abc\"}" "$TKN_OWNER"
run "TC-WS-CRUD-013" "POST /workspaces slug duplicate" "409" "POST" "/workspaces" "{\"name\":\"dup\",\"slug\":\"qa-shared\"}" "$TKN_OWNER"
run "TC-WS-CRUD-041" "PATCH /workspaces/:id empty name" "400" "PATCH" "/workspaces/${WSID}" "{\"name\":\"\"}" "$TKN_OWNER"
run "TC-WS-CRUD-050" "DELETE /workspaces/:id no auth" "401" "DELETE" "/workspaces/${WSID}" "" ""
run "TC-WS-CRUD-051" "GET /workspaces non-uuid id" "400" "GET" "/workspaces/not-a-uuid" "" "$TKN_OWNER"
run "TC-WS-MEMBERS-003" "GET members non-uuid id" "400" "GET" "/workspaces/not-a-uuid/members" "" "$TKN_OWNER"
run "TC-WS-MEMBERS-004" "GET members non-member viewer" "403" "GET" "/workspaces/${WSID}/members" "" "$TKN_VIEWER"
run "TC-WS-INVITES-002" "POST invite invalid email" "400" "POST" "/workspaces/${WSID}/invites" "{\"email\":\"not-an-email\",\"role\":\"member\"}" "$TKN_OWNER"
run "TC-WS-INVITES-003" "POST invite invalid role" "400" "POST" "/workspaces/${WSID}/invites" "{\"email\":\"x@y.com\",\"role\":\"king\"}" "$TKN_OWNER"
run "TC-WS-INVITES-004" "POST invite happy" "201" "POST" "/workspaces/${WSID}/invites" "{\"email\":\"new-${RU}@doable.test\",\"role\":\"member\"}" "$TKN_OWNER"
run "TC-WS-ROLES-002" "PATCH members nonexistent member" "404" "PATCH" "/workspaces/${WSID}/members/00000000-0000-0000-0000-000000000000" "{\"role\":\"admin\"}" "$TKN_OWNER"
run "TC-WS-PLAN-002" "GET /workspaces/:id/limits" "" "GET" "/workspaces/${WSID}/limits" "" "$TKN_OWNER"
run "TC-WS-AI-002" "GET /workspaces/:id/ai-providers" "" "GET" "/workspaces/${WSID}/ai-providers" "" "$TKN_OWNER"

# === 03-PROJECTS uncovered ===
PROJ_RESP=$(curl -sS -X POST -H "Authorization: Bearer ${TKN_OWNER}" -H "Content-Type: application/json" \
  -d "{\"name\":\"FULL1 P\",\"slug\":\"full1-p-${RU}\",\"workspaceId\":\"${WSID}\",\"framework\":\"vite-react\"}" "${API}/projects")
PID=$(echo "$PROJ_RESP" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).data.id)}catch(e){console.log("")}})')
echo "PID=$PID"

run "TC-PROJ-CREATE-013" "empty workspaceId" "400" "POST" "/projects" "{\"name\":\"x\",\"slug\":\"empty-ws-${RU}\",\"workspaceId\":\"\",\"framework\":\"vite-react\"}" "$TKN_OWNER"
run "TC-PROJ-CREATE-014" "bogus workspaceId UUID" "404" "POST" "/projects" "{\"name\":\"x\",\"slug\":\"bogus-ws-${RU}\",\"workspaceId\":\"00000000-0000-0000-0000-000000000000\",\"framework\":\"vite-react\"}" "$TKN_OWNER"
run "TC-PROJ-CREATE-015" "slug bad chars" "400" "POST" "/projects" "{\"name\":\"x\",\"slug\":\"BAD SLUG!\",\"workspaceId\":\"${WSID}\",\"framework\":\"vite-react\"}" "$TKN_OWNER"
run "TC-PROJ-CREATE-016" "slug duplicate within ws" "409" "POST" "/projects" "{\"name\":\"dup\",\"slug\":\"full1-p-${RU}\",\"workspaceId\":\"${WSID}\",\"framework\":\"vite-react\"}" "$TKN_OWNER"
run "TC-PROJ-LIST-004" "list bogus workspaceId" "200" "GET" "/projects?workspaceId=00000000-0000-0000-0000-000000000000" "" "$TKN_OWNER"
run "TC-PROJ-LIST-005" "list non-uuid workspaceId" "400" "GET" "/projects?workspaceId=not-uuid" "" "$TKN_OWNER"
run "TC-PROJ-UPDATE-003" "PATCH bogus uuid" "404" "PATCH" "/projects/00000000-0000-0000-0000-000000000000" "{\"name\":\"X\"}" "$TKN_OWNER"
run "TC-PROJ-UPDATE-004" "PATCH non-uuid" "400" "PATCH" "/projects/not-uuid" "{\"name\":\"X\"}" "$TKN_OWNER"
run "TC-PROJ-UPDATE-005" "PATCH no auth" "401" "PATCH" "/projects/${PID}" "{\"name\":\"X\"}" ""
run "TC-PROJ-UUID-001" "GET /projects/non-uuid" "400" "GET" "/projects/not-uuid" "" "$TKN_OWNER"
run "TC-PROJ-UUID-002" "GET /projects/non-uuid/files" "400" "GET" "/projects/not-uuid/files" "" "$TKN_OWNER"
run "TC-PROJ-DELETE-003" "DELETE bogus uuid" "404" "DELETE" "/projects/00000000-0000-0000-0000-000000000000" "" "$TKN_OWNER"
run "TC-PROJ-DELETE-004" "DELETE non-uuid" "400" "DELETE" "/projects/not-uuid" "" "$TKN_OWNER"
run "TC-PROJ-COLLAB-002" "POST collaborators bogus user" "404" "POST" "/projects/${PID}/collaborators" "{\"userId\":\"00000000-0000-0000-0000-000000000000\",\"role\":\"editor\"}" "$TKN_OWNER"
run "TC-PROJ-COLLAB-003" "GET collaborators non-uuid" "400" "GET" "/projects/not-uuid/collaborators" "" "$TKN_OWNER"
run "TC-PROJ-MISC-002" "POST star non-uuid" "400" "POST" "/projects/not-uuid/star" "" "$TKN_OWNER"
run "TC-PROJ-MISC-003" "POST duplicate" "201" "POST" "/projects/${PID}/duplicate" "{\"name\":\"dupe\",\"slug\":\"dupe-${RU}\"}" "$TKN_OWNER"
run "TC-PROJ-MISC-004" "GET files" "200" "GET" "/projects/${PID}/files" "" "$TKN_OWNER"
run "TC-PROJ-MISC-005" "GET exports" "" "GET" "/projects/${PID}/exports" "" "$TKN_OWNER"

# Cleanup
curl -sS -X DELETE -H "Authorization: Bearer ${TKN_OWNER}" "${API}/projects/${PID}" >/dev/null
curl -sS -X DELETE -H "Authorization: Bearer ${TKN_OWNER}" "${API}/workspaces/${WSID}" >/dev/null

# Summary
TOT=$(grep -c '^| TC-' "$OUT")
PASS=$(grep -c '| PASS |' "$OUT")
FAIL=$(grep -c '| FAIL |' "$OUT")
INFO=$(grep -c '| INFO |' "$OUT")
{
  echo ""
  echo "## Summary"
  echo "- **Total TCs run:** $TOT"
  echo "- **PASS:** $PASS"
  echo "- **FAIL:** $FAIL"
  echo "- **INFO:** $INFO"
  echo "- **Run finished:** $(date -u +%FT%TZ)"
} >> "$OUT"
echo "DONE WSID=$WSID PID=$PID TOT=$TOT PASS=$PASS FAIL=$FAIL INFO=$INFO"
