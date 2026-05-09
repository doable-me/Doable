#!/usr/bin/env bash
# Corpus 01+02+03 runner against env1 (zantaz). 5-min cap.
set -u
API="https://zantaz-api.doable.me"
TOKENS="testcases/evidence/_tokens-env1.json"
RUNLOG="testcases/99-runlog/env1/CORPUS-01-02-03.md"
EVID="testcases/evidence/env1"
mkdir -p "$EVID"

OWNER=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-owner']['access'])")
ADMIN=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-admin']['access'])")
MEMBER=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-member']['access'])")
VIEWER=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-viewer']['access'])")
ALICE=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-alice']['access'])")
BOB=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-bob']['access'])")
OWNER_UID=d58e6d7c-915a-414f-ac3b-f2161c0b508d

PASS=0; FAIL=0; INFO=0; BLOCKED=0; TOTAL=0
FAILED_IDS=()

run() {
  # run TC-ID exp_status description curl_args...
  local tc="$1"; shift; local exp="$1"; shift; local desc="$1"; shift
  local body="$EVID/$tc.body"; local hdr="$EVID/$tc.hdr"
  local now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local code
  code=$(curl -sS -o "$body" -D "$hdr" -w "%{http_code}" --max-time 8 "$@" 2>/dev/null || echo "000")
  local res
  if [ -z "$exp" ]; then res="INFO"; INFO=$((INFO+1));
  elif [ "$code" = "$exp" ]; then res="PASS"; PASS=$((PASS+1));
  else res="FAIL"; FAIL=$((FAIL+1)); FAILED_IDS+=("$tc:got=$code:exp=$exp"); fi
  TOTAL=$((TOTAL+1))
  local snip=$(head -c 200 "$body" 2>/dev/null | tr '\n\t|' '   ' | tr -d '\r')
  printf "| %s | %s | %s | got=%s exp=%s — %s · %s |\n" "$tc" "$now" "$res" "$code" "$exp" "$desc" "$snip" >> "$RUNLOG"
  echo "$res $code $tc"
}

##############################
# 01-auth
##############################
# /auth/me
run TC-AUTH-ME-001 200 "/auth/me valid owner JWT" "$API/auth/me" -H "Authorization: Bearer $OWNER"
run TC-AUTH-ME-002 401 "/auth/me no auth" "$API/auth/me"
run TC-AUTH-ME-003 401 "/auth/me garbage bearer" "$API/auth/me" -H "Authorization: Bearer not.a.real.token"
run TC-AUTH-ME-004 401 "/auth/me alg=none crafted" "$API/auth/me" -H "Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ4In0."
run TC-AUTH-ME-005 401 "/auth/me tampered sig" "$API/auth/me" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InFhLW93bmVyQGRvYWJsZS50ZXN0Iiwic3ViIjoiZDU4ZTZkN2MtOTE1YS00MTRmLWFjM2ItZjIxNjFjMGI1MDhkIiwiaXNzIjoiZG9hYmxlIiwiaWF0IjoxNzc4MzUyNjMzLCJleHAiOjE3Nzg0MzkwMzN9.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
run TC-AUTH-ME-006 401 "/auth/me bare basic auth" "$API/auth/me" -H "Authorization: Basic dGVzdDp0ZXN0"

# /auth/login (rate-limit might apply but is per-IP regardless)
run TC-AUTH-LOGIN-001 400 "/auth/login empty body" -X POST "$API/auth/login" -H "Content-Type: application/json" -d '{}'
run TC-AUTH-LOGIN-002 400 "/auth/login bad email format" -X POST "$API/auth/login" -H "Content-Type: application/json" -d '{"email":"not-an-email","password":"x"}'
run TC-AUTH-LOGIN-003 401 "/auth/login wrong password" -X POST "$API/auth/login" -H "Content-Type: application/json" -d '{"email":"qa-owner@doable.test","password":"WrongPass!"}'
run TC-AUTH-LOGIN-004 401 "/auth/login unknown email enum" -X POST "$API/auth/login" -H "Content-Type: application/json" -d '{"email":"nobody-1234@doable.test","password":"Anything!"}'

# /auth/refresh
run TC-AUTH-REFRESH-001 400 "/auth/refresh empty body" -X POST "$API/auth/refresh" -H "Content-Type: application/json" -d '{}'
run TC-AUTH-REFRESH-002 401 "/auth/refresh garbage" -X POST "$API/auth/refresh" -H "Content-Type: application/json" -d '{"refreshToken":"garbage-token"}'
run TC-AUTH-REFRESH-003 401 "/auth/refresh access-token used as refresh" -X POST "$API/auth/refresh" -H "Content-Type: application/json" -d "{\"refreshToken\":\"$OWNER\"}"

# /auth/logout
run TC-AUTH-LOGOUT-001 "" "/auth/logout (idempotent observation)" -X POST "$API/auth/logout" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{}'

# /auth/forgot-password
run TC-AUTH-FORGOT-001 400 "/auth/forgot-password empty body" -X POST "$API/auth/forgot-password" -H "Content-Type: application/json" -d '{}'

# /auth/reset-password
run TC-AUTH-RESET-001 "" "/auth/reset-password garbage token (info)" -X POST "$API/auth/reset-password" -H "Content-Type: application/json" -d '{"token":"garbage","password":"NewPass123!"}'

# Misc / headers / OPTIONS
run TC-AUTH-MISC-001 "" "OPTIONS /auth/login (CORS pre-flight observation)" -X OPTIONS "$API/auth/login" -H "Origin: https://zantaz.doable.me" -H "Access-Control-Request-Method: POST"

##############################
# 02-workspace
##############################
# List workspaces
run TC-WS-CRUD-001 200 "GET /workspaces as owner" "$API/workspaces" -H "Authorization: Bearer $OWNER"
run TC-WS-CRUD-003 401 "GET /workspaces no auth" "$API/workspaces"

# Capture an actual workspace id for later usage
WS_LIST_FILE="$EVID/_ws-list.json"
curl -sS -o "$WS_LIST_FILE" --max-time 8 "$API/workspaces" -H "Authorization: Bearer $OWNER" >/dev/null 2>&1 || true
WS_ID=$(python3 -c "import json,sys
try:
  d=json.load(open('$WS_LIST_FILE'))
  arr=d.get('data') or d
  if isinstance(arr,list) and arr:
    print(arr[0].get('id',''))
  else: print('')
except Exception as e: print('')
" 2>/dev/null)
echo "WS_ID=$WS_ID" >&2

# Create
SLUG=$(date +%s)
run TC-WS-CRUD-004 201 "POST /workspaces happy path" -X POST "$API/workspaces" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d "{\"name\":\"E2E WS $SLUG\",\"slug\":\"e2e-ws-$SLUG\"}"
NEW_WS_ID=$(python3 -c "import json
try:
  d=json.load(open('$EVID/TC-WS-CRUD-004.body'))
  print((d.get('data') or {}).get('id',''))
except: print('')
")
echo "NEW_WS_ID=$NEW_WS_ID" >&2

# Validation
run TC-WS-CRUD-006 400 "POST /workspaces missing name" -X POST "$API/workspaces" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"slug":"valid-slug-001"}'
run TC-WS-CRUD-007 400 "POST /workspaces missing slug" -X POST "$API/workspaces" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"name":"NoSlug"}'
run TC-WS-CRUD-011 400 "POST /workspaces slug too short (<3)" -X POST "$API/workspaces" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"name":"X","slug":"ab"}'
run TC-WS-CRUD-015 400 "POST /workspaces slug uppercase rejected" -X POST "$API/workspaces" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"name":"X","slug":"MixedCase"}'
run TC-WS-CRUD-016 400 "POST /workspaces slug starts with dash" -X POST "$API/workspaces" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"name":"X","slug":"-leading"}'
run TC-WS-CRUD-021 401 "POST /workspaces no auth" -X POST "$API/workspaces" -H "Content-Type: application/json" -d '{"name":"X","slug":"valid-slug-002"}'

# GET single
if [ -n "$NEW_WS_ID" ]; then
  run TC-WS-CRUD-030 200 "GET /workspaces/:id (newly created)" "$API/workspaces/$NEW_WS_ID" -H "Authorization: Bearer $OWNER"
  run TC-WS-CRUD-031 "" "GET /workspaces/:id as non-member viewer" "$API/workspaces/$NEW_WS_ID" -H "Authorization: Bearer $VIEWER"
fi
run TC-WS-CRUD-032 "" "GET /workspaces/:id with bogus UUID" "$API/workspaces/00000000-0000-0000-0000-000000000000" -H "Authorization: Bearer $OWNER"
run TC-WS-CRUD-033 "" "GET /workspaces/:id with non-uuid" "$API/workspaces/not-a-uuid" -H "Authorization: Bearer $OWNER"

# PATCH workspace name
if [ -n "$NEW_WS_ID" ]; then
  run TC-WS-CRUD-040 200 "PATCH /workspaces/:id name change" -X PATCH "$API/workspaces/$NEW_WS_ID" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"name":"E2E Renamed"}'
fi

# Members
if [ -n "$NEW_WS_ID" ]; then
  run TC-WS-MEMBERS-001 200 "GET /workspaces/:id/members" "$API/workspaces/$NEW_WS_ID/members" -H "Authorization: Bearer $OWNER"
  run TC-WS-MEMBERS-002 "" "GET /workspaces/:id/members as non-member viewer" "$API/workspaces/$NEW_WS_ID/members" -H "Authorization: Bearer $VIEWER"
fi

# Invites
if [ -n "$NEW_WS_ID" ]; then
  run TC-WS-INVITES-001 "" "GET /workspaces/:id/invites listing" "$API/workspaces/$NEW_WS_ID/invites" -H "Authorization: Bearer $OWNER"
fi

# Roles - non-owner perms (alice not in workspace)
if [ -n "$NEW_WS_ID" ]; then
  run TC-WS-ROLES-001 "" "PATCH /workspaces/:id as non-member alice (RBAC)" -X PATCH "$API/workspaces/$NEW_WS_ID" -H "Authorization: Bearer $ALICE" -H "Content-Type: application/json" -d '{"name":"hacked"}'
fi

# Plan limits / settings
if [ -n "$NEW_WS_ID" ]; then
  run TC-WS-PLAN-001 "" "GET /workspaces/:id/plan info" "$API/workspaces/$NEW_WS_ID/plan" -H "Authorization: Bearer $OWNER"
  run TC-WS-AI-001 "" "GET /workspaces/:id/ai-settings" "$API/workspaces/$NEW_WS_ID/ai-settings" -H "Authorization: Bearer $OWNER"
fi

##############################
# 03-projects
##############################
if [ -n "$NEW_WS_ID" ]; then
  run TC-PROJ-CREATE-001 201 "POST /projects vite-react default" -X POST "$API/projects" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d "{\"name\":\"Smoke Vite E2E\",\"workspaceId\":\"$NEW_WS_ID\"}"
  PROJ_ID=$(python3 -c "import json
try:
  d=json.load(open('$EVID/TC-PROJ-CREATE-001.body'))
  print((d.get('data') or {}).get('id',''))
except: print('')
")
  echo "PROJ_ID=$PROJ_ID" >&2

  run TC-PROJ-CREATE-002 201 "POST /projects nextjs-app explicit" -X POST "$API/projects" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d "{\"name\":\"Next E2E\",\"workspaceId\":\"$NEW_WS_ID\",\"frameworkId\":\"nextjs-app\"}"
  run TC-PROJ-CREATE-004 403 "POST /projects disabled framework django" -X POST "$API/projects" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d "{\"name\":\"D\",\"workspaceId\":\"$NEW_WS_ID\",\"frameworkId\":\"django\"}"
  run TC-PROJ-CREATE-005 403 "POST /projects nonsense framework id" -X POST "$API/projects" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d "{\"name\":\"X\",\"workspaceId\":\"$NEW_WS_ID\",\"frameworkId\":\"made-up-fw\"}"
  run TC-PROJ-CREATE-009 400 "POST /projects empty name" -X POST "$API/projects" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d "{\"name\":\"\",\"workspaceId\":\"$NEW_WS_ID\"}"
  run TC-PROJ-CREATE-010 400 "POST /projects missing workspaceId" -X POST "$API/projects" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d "{\"name\":\"X\"}"
  run TC-PROJ-CREATE-011 401 "POST /projects no auth" -X POST "$API/projects" -H "Content-Type: application/json" -d "{\"name\":\"X\",\"workspaceId\":\"$NEW_WS_ID\"}"
  run TC-PROJ-CREATE-012 "" "POST /projects RBAC: viewer creating in unrelated ws" -X POST "$API/projects" -H "Authorization: Bearer $VIEWER" -H "Content-Type: application/json" -d "{\"name\":\"X\",\"workspaceId\":\"$NEW_WS_ID\"}"
fi

# Listing
run TC-PROJ-LIST-001 200 "GET /projects (auth)" "$API/projects" -H "Authorization: Bearer $OWNER"
run TC-PROJ-LIST-002 401 "GET /projects no auth" "$API/projects"
if [ -n "$NEW_WS_ID" ]; then
  run TC-PROJ-LIST-003 "" "GET /projects?workspaceId=newly created" "$API/projects?workspaceId=$NEW_WS_ID" -H "Authorization: Bearer $OWNER"
fi

# Update / fetch single / delete on the freshly created project
PROJ_ID=$(python3 -c "import json
try:
  d=json.load(open('$EVID/TC-PROJ-CREATE-001.body'))
  print((d.get('data') or {}).get('id',''))
except: print('')
" 2>/dev/null)
if [ -n "$PROJ_ID" ]; then
  run TC-PROJ-UPDATE-001 200 "PATCH /projects/:id name change" -X PATCH "$API/projects/$PROJ_ID" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"name":"E2E Renamed"}'
  run TC-PROJ-UPDATE-002 "" "PATCH /projects/:id by viewer (RBAC)" -X PATCH "$API/projects/$PROJ_ID" -H "Authorization: Bearer $VIEWER" -H "Content-Type: application/json" -d '{"name":"hacked"}'
  run TC-PROJ-MISC-001 "" "POST /projects/:id/star" -X POST "$API/projects/$PROJ_ID/star" -H "Authorization: Bearer $OWNER"
  run TC-PROJ-COLLAB-001 "" "GET /projects/:id/collaborators" "$API/projects/$PROJ_ID/collaborators" -H "Authorization: Bearer $OWNER"
  run TC-PROJ-DELETE-001 "" "DELETE /projects/:id (cleanup)" -X DELETE "$API/projects/$PROJ_ID" -H "Authorization: Bearer $OWNER"
fi
run TC-PROJ-FETCH-001 "" "GET /projects/:id with bogus UUID" "$API/projects/00000000-0000-0000-0000-000000000000" -H "Authorization: Bearer $OWNER"
run TC-PROJ-FETCH-002 "" "GET /projects/:id non-uuid" "$API/projects/not-a-uuid" -H "Authorization: Bearer $OWNER"
run TC-PROJ-DELETE-002 "" "DELETE /projects/:id no auth" -X DELETE "$API/projects/00000000-0000-0000-0000-000000000000"

# Cleanup: delete the created workspace
if [ -n "$NEW_WS_ID" ]; then
  run TC-WS-CRUD-099 "" "DELETE /workspaces/:id (cleanup)" -X DELETE "$API/workspaces/$NEW_WS_ID" -H "Authorization: Bearer $OWNER"
fi

echo "----"
echo "TOTAL=$TOTAL PASS=$PASS FAIL=$FAIL INFO=$INFO BLOCKED=$BLOCKED"
echo "FAILED:"
printf '  %s\n' "${FAILED_IDS[@]}"
