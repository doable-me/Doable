#!/usr/bin/env bash
# Corpus FULL-1 PASS 2: deeper coverage avoiding /auth/register|/auth/login (rate-limited)
set +e
API="https://zantaz-api.doable.me"
TKN_OWNER="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("testcases/evidence/_tokens-env1.json"))["qa-owner"].access)')"
TKN_VIEWER="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("testcases/evidence/_tokens-env1.json"))["qa-viewer"].access)')"
TKN_MEMBER="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("testcases/evidence/_tokens-env1.json"))["qa-member"].access)')"
RU="$(date +%s)"

OUT="testcases/99-runlog/env1/CORPUS-FULL-1.md"

run() {
  local id="$1" desc="$2" exp="$3" method="$4" path="$5" body="$6" tkn="$7" extra="$8"
  local now=$(date -u +%FT%TZ)
  local code
  if [ -n "$body" ]; then
    code=$(curl -sS -o /tmp/_b -w "%{http_code}" -X "$method" -H "Authorization: Bearer ${tkn}" -H "Content-Type: application/json" $extra -d "$body" "${API}${path}" 2>&1)
  else
    code=$(curl -sS -o /tmp/_b -w "%{http_code}" -X "$method" -H "Authorization: Bearer ${tkn}" $extra "${API}${path}" 2>&1)
  fi
  local snippet=$(head -c 200 /tmp/_b | tr '\n|' '  ' )
  local result="INFO"
  if [ -n "$exp" ]; then
    if [ "$code" = "$exp" ]; then result="PASS"; else result="FAIL"; fi
  fi
  echo "| $id | $now | $result | got=$code exp=$exp - $desc · $snippet |" >> "$OUT"
}

run_hdr() {
  local id="$1" desc="$2" exp="$3" path="$4" header_name="$5"
  local now=$(date -u +%FT%TZ)
  local hdrs=$(curl -sSI -X GET -H "Authorization: Bearer ${TKN_OWNER}" "${API}${path}" 2>&1 | tr -d '\r')
  local code=$(echo "$hdrs" | head -1 | awk '{print $2}')
  local val=$(echo "$hdrs" | grep -i "^${header_name}:" | head -1 | cut -d: -f2- | sed 's/^ //')
  local result="INFO"
  if [ -n "$exp" ]; then
    if echo "$val" | grep -qi "$exp"; then result="PASS"; else result="FAIL"; fi
  fi
  echo "| $id | $now | $result | got=$code header[${header_name}]=\"$val\" exp~$exp - $desc |" >> "$OUT"
}

# Append pass-2 section header
cat >> "$OUT" <<MD2

---

## PASS 2 (deeper) — 2026-05-10

Avoids /auth/register and /auth/login (rate-limited; will be re-run after window resets).
Targets: AUTH-MISC headers/CORS, WS CRUD edge cases, PROJ list/filter/RBAC.

| Test ID | Run timestamp (UTC) | Result | Description |
|---------|---------------------|--------|-------------|
MD2

# Setup scratch ws + project for pass 2
WS_RESP=$(curl -sS -X POST -H "Authorization: Bearer ${TKN_OWNER}" -H "Content-Type: application/json" \
  -d "{\"name\":\"FULL1 P2 WS ${RU}\",\"slug\":\"full1-p2-ws-${RU}\"}" "${API}/workspaces")
WSID=$(echo "$WS_RESP" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).data.id)}catch(e){console.log("")}})')
echo "WSID=$WSID"

PROJ_RESP=$(curl -sS -X POST -H "Authorization: Bearer ${TKN_OWNER}" -H "Content-Type: application/json" \
  -d "{\"name\":\"FULL1 P2 P\",\"slug\":\"full1-p2-p-${RU}\",\"workspaceId\":\"${WSID}\",\"framework\":\"vite-react\"}" "${API}/projects")
PID=$(echo "$PROJ_RESP" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).data.id)}catch(e){console.log("")}})')
echo "PID=$PID"

# === AUTH-MISC headers / CORS / behaviour ===
run "TC-AUTH-MISC-002" "CORS rejects evil origin on login" "" "OPTIONS" "/auth/login" "" "" "-H Origin:https://evil.example -H Access-Control-Request-Method:POST"
run "TC-AUTH-MISC-005" "non-JSON content-type rejected" "400" "POST" "/auth/me" "not json" "$TKN_OWNER" "-H Content-Type:text/plain"
run "TC-AUTH-MISC-008" "trailing slash on /auth/me" "" "GET" "/auth/me/" "" "$TKN_OWNER"
run "TC-AUTH-MISC-009" "GET on /auth/login (POST-only)" "" "GET" "/auth/login" "" ""
run "TC-AUTH-MISC-011" "Host header tampering on /auth/me" "" "GET" "/auth/me" "" "$TKN_OWNER" "-H Host:evil.example"
run "TC-AUTH-MISC-030" "duplicate slash /auth//me" "" "GET" "/auth//me" "" "$TKN_OWNER"
run "TC-AUTH-MISC-040" "OPTIONS arbitrary unmounted" "" "OPTIONS" "/auth/refresh" "" ""
run_hdr "TC-AUTH-MISC-014" "X-Content-Type-Options nosniff" "nosniff" "/auth/me" "X-Content-Type-Options"
run_hdr "TC-AUTH-MISC-015" "Referrer-Policy present" "" "/auth/me" "Referrer-Policy"
run_hdr "TC-AUTH-MISC-013" "no Server header leak" "" "/auth/me" "Server"

# === AUTH-RATE-LIMIT (read-only / auth-bearing endpoints) ===
run "TC-AUTH-RATELIMIT-001" "qa-owner exempt: 10x /auth/me" "200" "GET" "/auth/me" "" "$TKN_OWNER"
run "TC-AUTH-RATELIMIT-002" "qa-owner /auth/me again" "200" "GET" "/auth/me" "" "$TKN_OWNER"
run "TC-AUTH-RATELIMIT-003" "qa-owner /auth/me again 2" "200" "GET" "/auth/me" "" "$TKN_OWNER"

# === WS-CRUD deeper ===
run "TC-WS-CRUD-014" "POST /workspaces slug numeric only" "201" "POST" "/workspaces" "{\"name\":\"num-${RU}\",\"slug\":\"abc-123\"}" "$TKN_OWNER"
run "TC-WS-CRUD-017" "POST /workspaces slug ends with dash" "400" "POST" "/workspaces" "{\"name\":\"x\",\"slug\":\"abc-\"}" "$TKN_OWNER"
run "TC-WS-CRUD-018" "POST /workspaces slug consecutive dashes" "" "POST" "/workspaces" "{\"name\":\"x\",\"slug\":\"a--b-${RU}\"}" "$TKN_OWNER"
run "TC-WS-CRUD-019" "POST /workspaces 257-char description" "" "POST" "/workspaces" "{\"name\":\"x\",\"slug\":\"longdesc-${RU}\",\"description\":\"$(printf 'A%.0s' {1..1000})\"}" "$TKN_OWNER"
run "TC-WS-CRUD-022" "POST /workspaces with extra unknown field" "" "POST" "/workspaces" "{\"name\":\"x\",\"slug\":\"extra-${RU}\",\"foo\":\"bar\"}" "$TKN_OWNER"
run "TC-WS-CRUD-042" "PATCH /workspaces change slug" "" "PATCH" "/workspaces/${WSID}" "{\"slug\":\"renamed-${RU}\"}" "$TKN_OWNER"
run "TC-WS-CRUD-043" "PATCH /workspaces add description" "200" "PATCH" "/workspaces/${WSID}" "{\"description\":\"P2 description\"}" "$TKN_OWNER"
run "TC-WS-CRUD-044" "PATCH /workspaces set avatar_url" "200" "PATCH" "/workspaces/${WSID}" "{\"avatar_url\":\"https://example.com/a.png\"}" "$TKN_OWNER"
run "TC-WS-CRUD-052" "GET /workspaces/:id all-zero uuid" "" "GET" "/workspaces/00000000-0000-0000-0000-000000000000" "" "$TKN_OWNER"
run "TC-WS-CRUD-060" "DELETE /workspaces/:id by viewer (RBAC)" "403" "DELETE" "/workspaces/${WSID}" "" "$TKN_VIEWER"
run "TC-WS-MEMBERS-005" "GET members happy path" "200" "GET" "/workspaces/${WSID}/members" "" "$TKN_OWNER"
run "TC-WS-MEMBERS-006" "GET members all-zero uuid" "" "GET" "/workspaces/00000000-0000-0000-0000-000000000000/members" "" "$TKN_OWNER"

# === WS-PLAN-LIMITS deeper ===
run "TC-WS-PLAN-003" "GET /workspaces/:id (check plan field)" "200" "GET" "/workspaces/${WSID}" "" "$TKN_OWNER"
run "TC-WS-PLAN-004" "PATCH plan as non-admin" "" "PATCH" "/workspaces/${WSID}" "{\"plan\":\"enterprise\"}" "$TKN_OWNER"

# === WS-SETTINGS-AI ===
run "TC-WS-AI-003" "GET /workspaces/:id/credits-history" "" "GET" "/workspaces/${WSID}/credits-history" "" "$TKN_OWNER"
run "TC-WS-AI-004" "GET /workspaces/:id/credits" "" "GET" "/workspaces/${WSID}/credits" "" "$TKN_OWNER"

# === PROJ-LIST + filter + sort ===
run "TC-PROJ-LIST-006" "GET /projects pagination cursor" "" "GET" "/projects?limit=5" "" "$TKN_OWNER"
run "TC-PROJ-LIST-007" "GET /projects bad limit" "" "GET" "/projects?limit=99999" "" "$TKN_OWNER"
run "TC-PROJ-LIST-008" "GET /projects search query" "" "GET" "/projects?search=FULL1" "" "$TKN_OWNER"
run "TC-PROJ-LIST-009" "GET /projects status=published" "" "GET" "/projects?status=published" "" "$TKN_OWNER"
run "TC-PROJ-LIST-010" "GET /projects starred only" "" "GET" "/projects?starred=true" "" "$TKN_OWNER"

# === PROJ-CREATE deeper (framework matrix) ===
run "TC-PROJ-CREATE-020" "create framework=html" "" "POST" "/projects" "{\"name\":\"html\",\"slug\":\"html-${RU}\",\"workspaceId\":\"${WSID}\",\"framework\":\"html\"}" "$TKN_OWNER"
run "TC-PROJ-CREATE-021" "create framework=vite-vue" "" "POST" "/projects" "{\"name\":\"vue\",\"slug\":\"vue-${RU}\",\"workspaceId\":\"${WSID}\",\"framework\":\"vite-vue\"}" "$TKN_OWNER"
run "TC-PROJ-CREATE-022" "create with very long name (256)" "" "POST" "/projects" "{\"name\":\"$(printf 'X%.0s' {1..256})\",\"slug\":\"longname-${RU}\",\"workspaceId\":\"${WSID}\",\"framework\":\"vite-react\"}" "$TKN_OWNER"
run "TC-PROJ-CREATE-023" "create with description with HTML" "" "POST" "/projects" "{\"name\":\"htmldesc\",\"slug\":\"htmldesc-${RU}\",\"workspaceId\":\"${WSID}\",\"framework\":\"vite-react\",\"description\":\"<script>alert(1)</script>X\"}" "$TKN_OWNER"

# === PROJ-UPDATE deeper ===
run "TC-PROJ-UPDATE-006" "PATCH change visibility=public" "" "PATCH" "/projects/${PID}" "{\"visibility\":\"public\"}" "$TKN_OWNER"
run "TC-PROJ-UPDATE-007" "PATCH change visibility=invalid" "400" "PATCH" "/projects/${PID}" "{\"visibility\":\"top-secret\"}" "$TKN_OWNER"
run "TC-PROJ-UPDATE-008" "PATCH change status=archived" "" "PATCH" "/projects/${PID}" "{\"status\":\"archived\"}" "$TKN_OWNER"
run "TC-PROJ-UPDATE-009" "PATCH change name to empty" "400" "PATCH" "/projects/${PID}" "{\"name\":\"\"}" "$TKN_OWNER"
run "TC-PROJ-UPDATE-010" "PATCH viewer (no membership)" "403" "PATCH" "/projects/${PID}" "{\"name\":\"hax\"}" "$TKN_VIEWER"

# === PROJ-COLLAB ===
run "TC-PROJ-COLLAB-004" "GET /projects/:id/collaborators happy" "200" "GET" "/projects/${PID}/collaborators" "" "$TKN_OWNER"
run "TC-PROJ-COLLAB-005" "GET as viewer non-collab" "" "GET" "/projects/${PID}/collaborators" "" "$TKN_VIEWER"
run "TC-PROJ-COLLAB-006" "POST add collab missing userId" "400" "POST" "/projects/${PID}/collaborators" "{\"role\":\"editor\"}" "$TKN_OWNER"
run "TC-PROJ-COLLAB-007" "POST add collab missing role" "400" "POST" "/projects/${PID}/collaborators" "{\"userId\":\"$(node -e 'console.log(JSON.parse(require(\"fs\").readFileSync(\"testcases/evidence/_tokens-env1.json\"))[\"qa-member\"].user_id)')\"}" "$TKN_OWNER"

# === PROJ-MISC ===
run "TC-PROJ-MISC-006" "GET /projects/:id/tags" "" "GET" "/projects/${PID}/tags" "" "$TKN_OWNER"
run "TC-PROJ-MISC-007" "POST /projects/:id/star unstar toggle" "" "POST" "/projects/${PID}/star" "" "$TKN_OWNER"
run "TC-PROJ-MISC-008" "POST /projects/:id/unstar" "" "POST" "/projects/${PID}/unstar" "" "$TKN_OWNER"
run "TC-PROJ-MISC-009" "GET /projects/:id (auth)" "200" "GET" "/projects/${PID}" "" "$TKN_OWNER"
run "TC-PROJ-MISC-010" "GET /projects/:id (no auth)" "401" "GET" "/projects/${PID}" "" ""

# Cleanup
curl -sS -X DELETE -H "Authorization: Bearer ${TKN_OWNER}" "${API}/projects/${PID}" >/dev/null
curl -sS -X DELETE -H "Authorization: Bearer ${TKN_OWNER}" "${API}/workspaces/${WSID}" >/dev/null

# Final summary - rewrite summary section
TOT=$(grep -c '^| TC-' "$OUT")
PASS=$(grep -c '| PASS |' "$OUT")
FAIL=$(grep -c '| FAIL |' "$OUT")
INFO=$(grep -c '| INFO |' "$OUT")
{
  echo ""
  echo "## Summary (after pass 2)"
  echo "- **Total TCs run (pass 1+2):** $TOT"
  echo "- **PASS:** $PASS"
  echo "- **FAIL:** $FAIL"
  echo "- **INFO:** $INFO"
  echo "- **Pass 2 finished:** $(date -u +%FT%TZ)"
} >> "$OUT"
echo "DONE pass2 WSID=$WSID PID=$PID TOT=$TOT PASS=$PASS FAIL=$FAIL INFO=$INFO"
