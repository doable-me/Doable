#!/usr/bin/env bash
# Evolution pass: re-run TCs that depended on a project + corrected notif paths.
set -u
TOKENS_FILE="C:/Users/gj/Documents/workspace/doable/testcases/evidence/_tokens-env1.json"
EVIDENCE_DIR="C:/Users/gj/Documents/workspace/doable/testcases/evidence/env1"
RUNLOG="C:/Users/gj/Documents/workspace/doable/testcases/99-runlog/env1/CORPUS-16-26.md"
API="https://zantaz-api.doable.me"
TOK=$(TF="$TOKENS_FILE" U=qa-owner python -c "import json,os; d=json.load(open(os.environ['TF'])); print(d[os.environ['U']]['access'])")
WS_ID=e860bfcb-36ce-4cfe-823f-a1660e0e1514
# Use the existing pre-created project from earlier work
PROJ_ID=e3f23fd0-9eb6-4a99-93dc-86c0cdc9b73f

PASS=0; FAIL=0; INFO=0; TOTAL=0
run_tc() {
  local tc="$1"; shift
  local descr="$1"; shift
  local exp="$1"; shift
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

echo "" >> "$RUNLOG"
echo "## Evolution pass — fixed paths and PROJ_ID reuse" >> "$RUNLOG"
echo "" >> "$RUNLOG"
echo "| TC | When (UTC) | Result | Notes |" >> "$RUNLOG"
echo "|---|---|---|---|" >> "$RUNLOG"

# 18-versions — reuse existing project
run_tc TC-VERSIONS-LIST-002 "GET /projects/:id/versions (existing)" 200 \
  -H "Authorization: Bearer $TOK" "$API/projects/$PROJ_ID/versions"
run_tc TC-VERSIONS-CREATE-003 "POST /projects/:id/versions minimal" "" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -X POST "$API/projects/$PROJ_ID/versions" -d '{"label":"corpus-1626-evolve"}'

# 22-notifications — pass workspaceId
run_tc TC-NOTIF-LIST-002-evolve "GET /notifications?workspaceId" 200 \
  -H "Authorization: Bearer $TOK" "$API/notifications?workspaceId=$WS_ID"
run_tc TC-NOTIF-UNREAD-001 "GET /notifications/unread-count?workspaceId" 200 \
  -H "Authorization: Bearer $TOK" "$API/notifications/unread-count?workspaceId=$WS_ID"
run_tc TC-NOTIF-READALL-001 "POST /notifications/read-all?workspaceId (corrected path)" "" \
  -H "Authorization: Bearer $TOK" -X POST "$API/notifications/read-all?workspaceId=$WS_ID"

# 23-thumbnails — try OG style endpoints
run_tc TC-THUMB-PROJ-001 "GET /projects/:id (thumbnail in body)" 200 \
  -H "Authorization: Bearer $TOK" "$API/projects/$PROJ_ID"
run_tc TC-THUMB-REGEN-002 "POST /projects/:id/thumbnail (regenerate)" "" \
  -H "Authorization: Bearer $TOK" -X POST "$API/projects/$PROJ_ID/thumbnail"

# 24-deploy — try /publish path
run_tc TC-DEPLOY-PUBLISH-LIST "GET /projects/:id/publish (history)" "" \
  -H "Authorization: Bearer $TOK" "$API/projects/$PROJ_ID/publish"
run_tc TC-DEPLOY-PUBLISH-STATUS "GET /projects/:id/publish/status" "" \
  -H "Authorization: Bearer $TOK" "$API/projects/$PROJ_ID/publish/status"

# 20-design-comments — try alternative paths
run_tc TC-COMMENTS-LIST-002 "GET /comments?projectId" "" \
  -H "Authorization: Bearer $TOK" "$API/comments?projectId=$PROJ_ID"
run_tc TC-COMMENTS-LIST-003 "GET /projects/:id/comments" "" \
  -H "Authorization: Bearer $TOK" "$API/projects/$PROJ_ID/comments"

# 21-team-chat — try alternatives
run_tc TC-CHAT-LIST-002 "GET /chat/channels?workspaceId" "" \
  -H "Authorization: Bearer $TOK" "$API/chat/channels?workspaceId=$WS_ID"
run_tc TC-CHAT-LIST-003 "GET /workspaces/:id/messages" "" \
  -H "Authorization: Bearer $TOK" "$API/workspaces/$WS_ID/messages"

{
  echo ""
  echo "## Evolution Summary"
  echo "- run: $TOTAL · pass: $PASS · fail: $FAIL · info: $INFO"
} >> "$RUNLOG"

echo "DONE evolve: $TOTAL run, $PASS pass, $FAIL fail, $INFO info"
