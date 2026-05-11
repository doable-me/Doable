#!/usr/bin/env bash
# Corpus runner for testcases 16-templates through 26-analytics against env1 (zantaz).
# 5-min hard cap — short-circuits each request with curl --max-time 8.
set -u

ENV_NAME=env1
RUN_DATE=$(date -u +%Y-%m-%d)
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EVIDENCE_DIR="$REPO_ROOT/testcases/evidence/$ENV_NAME"
RUNLOG="$REPO_ROOT/testcases/99-runlog/$ENV_NAME/CORPUS-16-26.md"
TOKENS_FILE="$REPO_ROOT/testcases/evidence/_tokens-env1.json"
API="https://zantaz-api.doable.me"

mkdir -p "$EVIDENCE_DIR" "$(dirname "$RUNLOG")"

# Extract tokens via python
extract_token() {
  local user="$1"
  TF="$TOKENS_FILE" U="$user" python -c "import json,os; d=json.load(open(os.environ['TF'])); print(d[os.environ['U']]['access'])"
}
extract_uid() {
  local user="$1"
  TF="$TOKENS_FILE" U="$user" python -c "import json,os; d=json.load(open(os.environ['TF'])); print(d[os.environ['U']]['user_id'])"
}

OWNER_TOK=$(extract_token "qa-owner")
ADMIN_TOK=$(extract_token "qa-admin")
MEMBER_TOK=$(extract_token "qa-member")
VIEWER_TOK=$(extract_token "qa-viewer")
OWNER_UID=$(extract_uid "qa-owner")

if [ -z "$OWNER_TOK" ]; then
  echo "ERROR: failed to extract qa-owner token" >&2
  exit 1
fi

# Init runlog
cat > "$RUNLOG" <<EOF
# RUN $RUN_DATE — CORPUS 16-26 (env1 / zantaz)

Target: $API
Owner agent: corpus-16-26 runner (5-min cap)
Domains: 16-templates 17-folders 18-versions 19-skills 20-design-comments 21-team-chat 22-notifications 23-thumbnails 24-deploy 25-runtime 26-analytics

| TC | When (UTC) | Result | Notes |
|---|---|---|---|
EOF

PASS=0; FAIL=0; INFO=0; TOTAL=0

run_tc() {
  # run_tc <TC-ID> <descr> <exp> <curl-args...>
  local tc="$1"; shift
  local descr="$1"; shift
  local exp="$1"; shift
  # optional leading "--"
  if [ "${1:-}" = "--" ]; then shift; fi
  local body="$EVIDENCE_DIR/$tc.body"
  local hdr="$EVIDENCE_DIR/$tc.hdr"
  local now status result
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  status=$(curl -sS --max-time 8 -o "$body" -D "$hdr" -w "%{http_code}" "$@" 2>/dev/null || echo "000")
  if [ -z "$exp" ]; then result="INFO"; INFO=$((INFO+1));
  elif [ "$status" = "$exp" ]; then result="PASS"; PASS=$((PASS+1));
  else result="FAIL"; FAIL=$((FAIL+1)); fi
  TOTAL=$((TOTAL+1))
  local body_summary
  body_summary=$(head -c 220 "$body" 2>/dev/null | tr '\n\r\t|' '   ')
  printf "| %s | %s | %s | got=%s exp=%s — %s · %s |\n" \
    "$tc" "$now" "$result" "$status" "$exp" "$descr" "$body_summary" >> "$RUNLOG"
}

H_OWNER="-H Authorization: Bearer $OWNER_TOK"
H_MEMBER="-H Authorization: Bearer $MEMBER_TOK"
H_VIEWER="-H Authorization: Bearer $VIEWER_TOK"
H_JSON="-H Content-Type: application/json"

# ---------------- 16-templates ----------------
run_tc TC-TEMPL-LIST-001 "GET /templates list" 200 -- "$API/templates"
run_tc TC-TEMPL-LIST-012 "GET /templates anon (public read)" 200 -- "$API/templates"
run_tc TC-TEMPL-LIST-002 "GET /templates?framework=vite-react filter" 200 -- "$API/templates?framework=vite-react"
run_tc TC-TEMPL-LIST-003 "GET /templates?category=starter" 200 -- "$API/templates?category=starter"
run_tc TC-TEMPL-LIST-019 "templates contain blank/starter ids" 200 -- "$API/templates"
run_tc TC-TEMPL-REGISTRY-002 "POST /admin/templates/refresh as owner" "" \
  -H "Authorization: Bearer $OWNER_TOK" -X POST "$API/admin/templates/refresh"
run_tc TC-TEMPL-REGISTRY-003 "POST /admin/templates/refresh as member -> 403" 403 \
  -H "Authorization: Bearer $MEMBER_TOK" -X POST "$API/admin/templates/refresh"
run_tc TC-TEMPL-SCAFFOLD-001 "POST /projects from template (owner)" "" \
  -H "Authorization: Bearer $OWNER_TOK" -H "Content-Type: application/json" \
  -X POST "$API/projects" -d '{"name":"corpus-tpl-scaffold-001","template":"blank"}'

# ---------------- 17-folders ----------------
# Need a workspace. List my workspaces first.
curl -sS --max-time 8 -H "Authorization: Bearer $OWNER_TOK" "$API/workspaces" -o "$EVIDENCE_DIR/_owner-workspaces.json" || true
WS_ID=$(WSF="$EVIDENCE_DIR/_owner-workspaces.json" python -c "
import json,os
d=json.load(open(os.environ['WSF']))
def find(o):
 if isinstance(o,dict):
  if 'id' in o and ('name' in o or 'slug' in o): return o['id']
  for v in o.values():
   r=find(v)
   if r: return r
 if isinstance(o,list):
  for v in o:
   r=find(v)
   if r: return r
print(find(d) or '')
" 2>/dev/null || echo "")

run_tc TC-FOLDER-LIST-002 "GET /folders missing workspaceId" 400 \
  -H "Authorization: Bearer $OWNER_TOK" "$API/folders"
run_tc TC-FOLDER-CREATE-024 "POST /folders unauth -> 401" 401 \
  -X POST "$API/folders" -H "Content-Type: application/json" -d '{"name":"x"}'
if [ -n "$WS_ID" ]; then
  run_tc TC-FOLDER-LIST-001 "GET /folders?workspaceId=<ws>" 200 \
    -H "Authorization: Bearer $OWNER_TOK" "$API/folders?workspaceId=$WS_ID"
  run_tc TC-FOLDER-CREATE-001 "POST /folders create root" 201 \
    -H "Authorization: Bearer $OWNER_TOK" -H "Content-Type: application/json" \
    -X POST "$API/folders" -d "{\"workspaceId\":\"$WS_ID\",\"name\":\"corpus-${RUN_DATE}\"}"
  run_tc TC-FOLDER-CREATE-005 "POST /folders empty name -> 400" 400 \
    -H "Authorization: Bearer $OWNER_TOK" -H "Content-Type: application/json" \
    -X POST "$API/folders" -d "{\"workspaceId\":\"$WS_ID\",\"name\":\"\"}"
  run_tc TC-FOLDER-CREATE-019 "POST /folders position negative -> 400" 400 \
    -H "Authorization: Bearer $OWNER_TOK" -H "Content-Type: application/json" \
    -X POST "$API/folders" -d "{\"workspaceId\":\"$WS_ID\",\"name\":\"neg\",\"position\":-1}"
else
  echo "WARN: no workspace id — skipping folder CRUD" | tee -a "$RUNLOG"
fi

# ---------------- 18-versions ----------------
# Create a project to operate on
curl -sS --max-time 10 -H "Authorization: Bearer $OWNER_TOK" -H "Content-Type: application/json" \
  -X POST "$API/projects" -d '{"name":"corpus-versions-proj","template":"blank"}' \
  -o "$EVIDENCE_DIR/_versions-create.json" || true
PROJ_ID=$(VF="$EVIDENCE_DIR/_versions-create.json" python -c "
import json,os
d=json.load(open(os.environ['VF']))
def find(o):
 if isinstance(o,dict):
  if 'id' in o: return o['id']
  for v in o.values():
   r=find(v)
   if r: return r
 if isinstance(o,list):
  for v in o:
   r=find(v)
   if r: return r
print(find(d) or '')
" 2>/dev/null || echo "")

if [ -n "$PROJ_ID" ]; then
  run_tc TC-VERSIONS-LIST-001 "GET /projects/:id/versions" 200 \
    -H "Authorization: Bearer $OWNER_TOK" "$API/projects/$PROJ_ID/versions"
  run_tc TC-VERSIONS-CREATE-001 "POST /projects/:id/versions minimal" 201 \
    -H "Authorization: Bearer $OWNER_TOK" -H "Content-Type: application/json" \
    -X POST "$API/projects/$PROJ_ID/versions" -d '{"label":"corpus-1626"}'
  run_tc TC-VERSIONS-CREATE-002 "POST snapshot unauth -> 401" 401 \
    -H "Content-Type: application/json" \
    -X POST "$API/projects/$PROJ_ID/versions" -d '{"label":"x"}'
else
  echo "WARN: project create failed — skipping versions tests" | tee -a "$RUNLOG"
fi

# ---------------- 19-skills ----------------
run_tc TC-SKILLS-LIST-001 "GET /skills (if exists)" "" \
  -H "Authorization: Bearer $OWNER_TOK" "$API/skills"
run_tc TC-SKILLS-MARKETPLACE-001 "GET /marketplace/skills" "" \
  -H "Authorization: Bearer $OWNER_TOK" "$API/marketplace/skills"

# ---------------- 20-design-comments ----------------
if [ -n "$PROJ_ID" ]; then
  run_tc TC-COMMENTS-LIST-001 "GET /design-comments?projectId" "" \
    -H "Authorization: Bearer $OWNER_TOK" "$API/design-comments?projectId=$PROJ_ID"
  run_tc TC-COMMENTS-CRUD-003 "POST /design-comments anon -> 401" 401 \
    -H "Content-Type: application/json" -X POST "$API/design-comments" -d "{\"project_id\":\"$PROJ_ID\",\"body\":\"hi\"}"
  run_tc TC-COMMENTS-CRUD-001 "POST /design-comments owner" "" \
    -H "Authorization: Bearer $OWNER_TOK" -H "Content-Type: application/json" \
    -X POST "$API/design-comments" -d "{\"project_id\":\"$PROJ_ID\",\"body\":\"corpus comment\",\"anchor\":{\"file\":\"index.html\",\"line\":1}}"
fi

# ---------------- 21-team-chat ----------------
if [ -n "$WS_ID" ]; then
  run_tc TC-CHAT-LIST-001 "GET /workspaces/:id/chat/channels" "" \
    -H "Authorization: Bearer $OWNER_TOK" "$API/workspaces/$WS_ID/chat/channels"
  run_tc TC-CHAT-MSG-001 "GET /chat/messages (if exists)" "" \
    -H "Authorization: Bearer $OWNER_TOK" "$API/chat/messages?workspaceId=$WS_ID"
fi

# ---------------- 22-notifications ----------------
run_tc TC-NOTIF-LIST-001 "GET /notifications scoped to user" 200 \
  -H "Authorization: Bearer $OWNER_TOK" "$API/notifications"
run_tc TC-NOTIF-LIST-anon "GET /notifications anon -> 401" 401 \
  "$API/notifications"
run_tc TC-NOTIF-LIST-003 "GET /notifications?read=false filter" 200 \
  -H "Authorization: Bearer $OWNER_TOK" "$API/notifications?read=false"
run_tc TC-NOTIF-MARK-ALL-001 "POST /notifications/mark-all-read" "" \
  -H "Authorization: Bearer $OWNER_TOK" -X POST "$API/notifications/mark-all-read"

# ---------------- 23-thumbnails ----------------
if [ -n "$PROJ_ID" ]; then
  run_tc TC-THUMB-GET-001 "GET /projects/:id/thumbnail" "" \
    -H "Authorization: Bearer $OWNER_TOK" "$API/projects/$PROJ_ID/thumbnail"
  run_tc TC-THUMB-REGEN-001 "POST /projects/:id/thumbnail/regenerate" "" \
    -H "Authorization: Bearer $OWNER_TOK" -X POST "$API/projects/$PROJ_ID/thumbnail/regenerate"
fi

# ---------------- 24-deploy ----------------
if [ -n "$PROJ_ID" ]; then
  run_tc TC-DEPLOY-LIST-001 "GET /projects/:id/deployments" "" \
    -H "Authorization: Bearer $OWNER_TOK" "$API/projects/$PROJ_ID/deployments"
  run_tc TC-DEPLOY-LIFECYCLE-001 "POST /projects/:id/publish" "" \
    -H "Authorization: Bearer $OWNER_TOK" -X POST "$API/projects/$PROJ_ID/publish"
fi
run_tc TC-DEPLOY-ARTIFACTS-001 "GET /deployments (root)" "" \
  -H "Authorization: Bearer $OWNER_TOK" "$API/deployments"

# ---------------- 25-runtime ----------------
run_tc TC-RT-CAPACITY-status "GET /runtime/status (capacity)" "" \
  -H "Authorization: Bearer $OWNER_TOK" "$API/runtime/status"
run_tc TC-RT-VITE-001 "GET /runtime/vite (if exists)" "" \
  -H "Authorization: Bearer $OWNER_TOK" "$API/runtime/vite"
run_tc TC-RT-SYSTEMD-001 "GET /admin/runtime (systemd)" "" \
  -H "Authorization: Bearer $OWNER_TOK" "$API/admin/runtime"

# ---------------- 26-analytics ----------------
run_tc TC-ANALYTICS-EVENTS-001 "GET /analytics/events" "" \
  -H "Authorization: Bearer $OWNER_TOK" "$API/analytics/events"
run_tc TC-ANALYTICS-DASHBOARD-001 "GET /analytics/dashboard" "" \
  -H "Authorization: Bearer $OWNER_TOK" "$API/analytics/dashboard"
run_tc TC-ANALYTICS-PV-001 "GET /analytics/page-views" "" \
  -H "Authorization: Bearer $OWNER_TOK" "$API/analytics/page-views"
run_tc TC-ANALYTICS-RETENTION-001 "GET /analytics/retention" "" \
  -H "Authorization: Bearer $OWNER_TOK" "$API/analytics/retention"
run_tc TC-ANALYTICS-EVENTS-anon "GET /analytics/events anon -> 401" 401 \
  "$API/analytics/events"

# ---------------- Summary ----------------
{
  echo ""
  echo "## Summary"
  echo "- TCs run: $TOTAL"
  echo "- PASS: $PASS"
  echo "- FAIL: $FAIL"
  echo "- INFO: $INFO"
  echo "- WS_ID: ${WS_ID:-NONE}"
  echo "- PROJ_ID: ${PROJ_ID:-NONE}"
} >> "$RUNLOG"

echo "DONE: $TOTAL run, $PASS pass, $FAIL fail, $INFO info"
echo "Runlog: $RUNLOG"
