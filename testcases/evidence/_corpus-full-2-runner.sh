#!/usr/bin/env bash
# CORPUS FULL-2: 04-editor + 05-ai-chat (API smoke + RBAC only). 5-min cap.
# Reuses env1 (zantaz) project + tokens.
set -u
API="${API:-https://zantaz-api.doable.me}"
TOKENS="testcases/evidence/_tokens-env1.json"
RUNLOG="testcases/99-runlog/env1/CORPUS-FULL-2.md"
EV="testcases/evidence/env1"
mkdir -p "$EV"

OWNER=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-owner']['access'])")
ADMIN=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-admin']['access'])")
MEMBER=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-member']['access'])")
VIEWER=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-viewer']['access'])")
BOB=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-bob']['access'])")
OWNER_UID=d58e6d7c-915a-414f-ac3b-f2161c0b508d

# Pick existing owner project from env1
PID=$(curl -sS --max-time 8 -H "Authorization: Bearer $OWNER" "$API/projects" | python3 -c "import sys,json; d=json.load(sys.stdin); ps=d.get('data') or d.get('projects') or d; print((ps[0] if ps else {}).get('id',''))" 2>/dev/null || echo "")
WID=$(curl -sS --max-time 8 -H "Authorization: Bearer $OWNER" "$API/workspaces" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('data') or d.get('workspaces') or d)[0]['id'])" 2>/dev/null || echo "")
echo "WID=$WID PID=$PID"

# Create or reuse a chat session for AI chat tests
SESSION_ID=$(curl -sS --max-time 8 -H "Authorization: Bearer $OWNER" "$API/chat/history?projectId=$PID" | python3 -c "import sys,json
try:
  d=json.load(sys.stdin); s=d.get('data') or []
  print(s[0]['session_id'] if s else '')
except Exception: print('')" 2>/dev/null || echo "")
if [ -z "$SESSION_ID" ]; then
  SESSION_ID="00000000-0000-0000-0000-000000000000"
fi
echo "SESSION_ID=$SESSION_ID"

# Cross-tenant project owned by qa-bob (look up first project)
BOB_PID=$(curl -sS --max-time 8 -H "Authorization: Bearer $BOB" "$API/projects" | python3 -c "import sys,json
try:
  d=json.load(sys.stdin); ps=d.get('data') or d.get('projects') or d
  print((ps[0] if ps else {}).get('id',''))
except Exception: print('')" 2>/dev/null || echo "")
echo "BOB_PID=$BOB_PID"

PASS=0; FAIL=0; INFO=0; BLOCKED=0; TOTAL=0
FAILED_IDS=()

cat > "$RUNLOG" <<EOF
# CORPUS FULL-2 — 04-editor + 05-ai-chat (env1 / zantaz)

Run: $(date -u +%Y-%m-%dT%H:%M:%SZ)  Owner: corpus-full-2  Cap: 5 min  Mode: API smoke + RBAC only
API: $API  Workspace: $WID  Project: $PID  ChatSession: $SESSION_ID  BobProject: $BOB_PID

## Run table

| TC | When (UTC) | Result | Notes |
|---|---|---|---|
EOF

run() {
  local tc="$1"; shift; local exp="$1"; shift; local desc="$1"; shift
  local body="$EV/$tc.body"; local hdr="$EV/$tc.hdr"
  local now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local code
  code=$(curl -sS -o "$body" -D "$hdr" -w "%{http_code}" --max-time 8 "$@" 2>/dev/null || echo "000")
  local res
  if [ -z "$exp" ]; then res="INFO"; INFO=$((INFO+1));
  elif [ "$exp" = "BLOCKED" ]; then res="BLOCKED"; BLOCKED=$((BLOCKED+1));
  elif [ "$code" = "$exp" ]; then res="PASS"; PASS=$((PASS+1));
  else res="FAIL"; FAIL=$((FAIL+1)); FAILED_IDS+=("$tc:got=$code:exp=$exp"); fi
  TOTAL=$((TOTAL+1))
  local snip=$(head -c 200 "$body" 2>/dev/null | tr '\n\t|' '   ' | tr -d '\r')
  printf "| %s | %s | %s | got=%s exp=%s — %s · %s |\n" "$tc" "$now" "$res" "$code" "$exp" "$desc" "$snip" >> "$RUNLOG"
  echo "$res $code $tc"
}

##############################################################
# 04-editor: TC-EDITOR-FILE-OPS (CRUD)
##############################################################
run TC-EDITOR-FILES-001-fop 200 "GET file tree on existing project (smoke)" "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER"
run TC-EDITOR-FILES-002-fop 200 "GET tree returns array" "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER"
run TC-EDITOR-FILES-005-fop 404 "GET nonexistent file 404" "$API/projects/$PID/files/nope-corpus2.txt" -H "Authorization: Bearer $OWNER"
run TC-EDITOR-FILES-026-fop 201 "POST create file" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"corpus2/full2.md","content":"hello"}'
run TC-EDITOR-FILES-027-fop 409 "POST dup file → 409" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"corpus2/full2.md","content":"hello again"}'
run TC-EDITOR-FILES-028-fop 400 "POST empty path → 400" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"","content":"x"}'
run TC-EDITOR-FILES-005r-fop 200 "GET created file content" "$API/projects/$PID/files/corpus2/full2.md" -H "Authorization: Bearer $OWNER"
run TC-EDITOR-FILES-013-fop 200 "PUT update file" -X PUT "$API/projects/$PID/files/corpus2/full2.md" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"content":"updated"}'
run TC-EDITOR-FILES-015-fop 400 "PUT non-string content → 400" -X PUT "$API/projects/$PID/files/corpus2/full2.md" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"content":123}'
run TC-EDITOR-FILES-021-fop 400 "PUT missing content → 400" -X PUT "$API/projects/$PID/files/corpus2/full2.md" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{}'
run TC-EDITOR-FILES-037-fop 200 "DELETE existing → 200" -X DELETE "$API/projects/$PID/files/corpus2/full2.md" -H "Authorization: Bearer $OWNER"
run TC-EDITOR-FILES-038-fop 404 "DELETE nonexistent → 404" -X DELETE "$API/projects/$PID/files/corpus2/never.md" -H "Authorization: Bearer $OWNER"
# RBAC / unauth
run TC-EDITOR-FILES-043-fop 401 "GET tree unauth → 401" "$API/projects/$PID/files"
run TC-EDITOR-FILES-RBAC-001 401 "POST file unauth → 401" -X POST "$API/projects/$PID/files" -H "Content-Type: application/json" -d '{"path":"x.txt","content":"x"}'
run TC-EDITOR-FILES-RBAC-002 401 "PUT file unauth → 401" -X PUT "$API/projects/$PID/files/y.txt" -H "Content-Type: application/json" -d '{"content":"x"}'
run TC-EDITOR-FILES-RBAC-003 401 "DELETE file unauth → 401" -X DELETE "$API/projects/$PID/files/y.txt"
run TC-EDITOR-FILES-RBAC-CT1 404 "Cross-tenant qa-bob GET tree → 404" "$API/projects/$PID/files" -H "Authorization: Bearer $BOB"
run TC-EDITOR-FILES-RBAC-CT2 404 "Cross-tenant qa-bob POST file → 404" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $BOB" -H "Content-Type: application/json" -d '{"path":"crosstenant.txt","content":"x"}'

##############################################################
# 04-editor: TC-EDITOR-PATH-TRAVERSAL (16 cases)
##############################################################
run TC-EDITOR-PATHTRAV-001 400 "POST traversal ../../escape.txt → 400" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"../../escape.txt","content":"pwn"}'
run TC-EDITOR-PATHTRAV-002 400 "POST .. → 400" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"..","content":"x"}'
run TC-EDITOR-PATHTRAV-003a 201 "POST literal %2e%2e → 201 (helper does not decode body)" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"%2e%2e/encoded-corpus2.txt","content":"x"}'
run TC-EDITOR-PATHTRAV-003b 400 "PUT %2e%2e in URL → decoded → 400" -X PUT "$API/projects/$PID/files/%2e%2e%2Fescape-corpus2.txt" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"content":"x"}'
run TC-EDITOR-PATHTRAV-004 400 "POST /etc/passwd → 400 absolute" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"/etc/passwd","content":"pwn"}'
run TC-EDITOR-PATHTRAV-005 400 "POST C:\\Windows\\... → 400 absolute" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"C:\\\\Windows\\\\system32\\\\drivers\\\\etc\\\\hosts","content":"x"}'
run TC-EDITOR-PATHTRAV-006 400 "POST UNC \\\\server\\share → 400 absolute" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"\\\\\\\\server\\\\share\\\\file","content":"x"}'
run TC-EDITOR-PATHTRAV-007 400 "POST backslash inside relative path → 400" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"src\\\\..\\\\escape.txt","content":"x"}'
run TC-EDITOR-PATHTRAV-008 400 "POST embedded NUL → 400" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"foo bar","content":"x"}'
run TC-EDITOR-PATHTRAV-009 400 "POST nested traversal src/../../etc/passwd → 400" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"src/../../etc/passwd","content":"x"}'
run TC-EDITOR-PATHTRAV-010 201 "POST tilde-home ~/sshconfig → 201 literal" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"~/sshconfig-corpus2","content":"x"}'
run TC-EDITOR-PATHTRAV-011 201 "POST normal nested src/components/Card2.tsx → 201" -X POST "$API/projects/$PID/files" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"path":"src/components/Card2.tsx","content":"export default ()=>null;"}'
run TC-EDITOR-PATHTRAV-012 400 "PUT URL traversal ..%2F..%2Fescape.txt → 400" -X PUT "$API/projects/$PID/files/..%2F..%2Fescape.txt" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"content":"x"}'
run TC-EDITOR-PATHTRAV-013 400 "DELETE URL traversal ..%2Fescape.txt → 400" -X DELETE "$API/projects/$PID/files/..%2Fescape.txt" -H "Authorization: Bearer $OWNER"
run TC-EDITOR-PATHTRAV-014 400 "GET URL traversal ..%2F..%2Fetc%2Fpasswd → 400" "$API/projects/$PID/files/..%2F..%2Fetc%2Fpasswd" -H "Authorization: Bearer $OWNER"
# 015 + 016 are AI tool calls (not curl); marked BLOCKED in this slice
run TC-EDITOR-PATHTRAV-015 BLOCKED "AI create_file traversal — needs multi-turn" "$API/health"
run TC-EDITOR-PATHTRAV-016 BLOCKED "AI read_file /etc/passwd — needs multi-turn" "$API/health"

##############################################################
# 04-editor: TC-EDITOR-MONACO / PRESENCE / YJS — UI/WS heavy
# Run only the API-reachable smoke + RBAC pieces (most are WS multi-client).
##############################################################
# MONACO is pure UI — only RBAC: project endpoint guard
run TC-EDITOR-MONACO-RBAC1 401 "Monaco loads files via GET /files; unauth → 401" "$API/projects/$PID/files/package.json"
run TC-EDITOR-MONACO-RBAC2 404 "Monaco cross-tenant GET file → 404" "$API/projects/$PID/files/package.json" -H "Authorization: Bearer $BOB"
# YJS internal write endpoint
run TC-EDITOR-YJS-INT-401 401 "POST /internal/yjs/write requires internal auth → 401" -X POST "$API/internal/yjs/write" -H "Content-Type: application/json" -d '{"projectId":"'"$PID"'","filePath":"x","content":"y"}'
run TC-EDITOR-YJS-INT-403 "" "POST /internal/yjs/write with user JWT → ?" -X POST "$API/internal/yjs/write" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"projectId":"'"$PID"'","filePath":"x","content":"y"}'
# PRESENCE / YJS multi-client are WS — out of scope for API smoke
run TC-EDITOR-YJS-WS-NOTE BLOCKED "WS-driven YJS sync/conflict tests need ws client" "$API/health"
run TC-EDITOR-PRES-WS-NOTE BLOCKED "WS-driven presence tests need ws client" "$API/health"

##############################################################
# 05-ai-chat — API smoke + RBAC only across 16 TC files
##############################################################

# TC-AI-CHAT-SEND
run TC-AI-CHAT-SEND-004 400 "Empty content → 400" -X POST "$API/chat/$SESSION_ID/messages" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"content":"","mode":"agent"}'
run TC-AI-CHAT-SEND-005 400 "Whitespace-only content → 400" -X POST "$API/chat/$SESSION_ID/messages" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"content":"   \n\t  ","mode":"agent"}'
run TC-AI-CHAT-SEND-008 400 "Invalid mode → 400" -X POST "$API/chat/$SESSION_ID/messages" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"content":"x","mode":"foobar"}'
run TC-AI-CHAT-SEND-010 404 "Nonexistent sessionId → 404" -X POST "$API/chat/00000000-0000-0000-0000-000000000000/messages" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"content":"x","mode":"agent"}'
run TC-AI-CHAT-SEND-011 "" "Cross-tenant qa-bob session → 403/404" -X POST "$API/chat/$SESSION_ID/messages" -H "Authorization: Bearer $BOB" -H "Content-Type: application/json" -d '{"content":"x","mode":"agent"}'
run TC-AI-CHAT-SEND-012 401 "Unauth POST → 401" -X POST "$API/chat/$SESSION_ID/messages" -H "Content-Type: application/json" -d '{"content":"x","mode":"agent"}'

# TC-AI-CHAT-MODES
run TC-AI-CHAT-MODES-401 401 "Unauth chat history → 401" "$API/chat/history?projectId=$PID"
run TC-AI-CHAT-MODES-CT 200 "Cross-tenant qa-bob history?projectId=mine → 200 empty" "$API/chat/history?projectId=$PID" -H "Authorization: Bearer $BOB"

# TC-AI-CHAT-CREDITS — read-only credit endpoints
run TC-AI-CHAT-CREDITS-001 200 "GET credit balance for own ws → 200" "$API/workspaces/$WID/usage/me/credits" -H "Authorization: Bearer $OWNER"
run TC-AI-CHAT-CREDITS-401 401 "GET credits unauth → 401" "$API/workspaces/$WID/usage/me/credits"
run TC-AI-CHAT-CREDITS-CT 403 "Cross-tenant qa-bob credits → 403" "$API/workspaces/$WID/usage/me/credits" -H "Authorization: Bearer $BOB"

# TC-AI-CHAT-TOOLS
run TC-AI-CHAT-TOOLS-001 "" "GET /ai/tools registry (info)" "$API/ai/tools" -H "Authorization: Bearer $OWNER"
run TC-AI-CHAT-TOOLS-401 401 "Unauth /ai/tools → 401" "$API/ai/tools"

# TC-AI-CHAT-CONTEXT
run TC-AI-CHAT-CONTEXT-001 200 "GET workspace context → 200" "$API/workspaces/$WID/context" -H "Authorization: Bearer $OWNER"
run TC-AI-CHAT-CONTEXT-401 401 "GET context unauth → 401" "$API/workspaces/$WID/context"
run TC-AI-CHAT-CONTEXT-CT 403 "Cross-tenant qa-bob context → 403" "$API/workspaces/$WID/context" -H "Authorization: Bearer $BOB"

# TC-AI-CHAT-ATTACH
run TC-AI-CHAT-ATTACH-401 401 "Unauth POST /chat/attach → 401" -X POST "$API/chat/$SESSION_ID/attach" -H "Content-Type: application/json" -d '{}'
run TC-AI-CHAT-ATTACH-MISSING "" "POST attach missing body (info)" -X POST "$API/chat/$SESSION_ID/attach" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{}'

# TC-AI-CHAT-HISTORY
run TC-AI-CHAT-HISTORY-001 200 "GET /chat/history?projectId → 200" "$API/chat/history?projectId=$PID" -H "Authorization: Bearer $OWNER"
run TC-AI-CHAT-HISTORY-002 401 "Unauth /chat/history → 401" "$API/chat/history"
run TC-AI-CHAT-HISTORY-NO-PROJ "" "GET /chat/history (no projectId) → ?" "$API/chat/history" -H "Authorization: Bearer $OWNER"
run TC-AI-CHAT-HISTORY-CT "" "qa-bob /chat/history?projectId=mine → empty/403" "$API/chat/history?projectId=$PID" -H "Authorization: Bearer $BOB"

# TC-AI-CHAT-MODELS
run TC-AI-CHAT-MODELS-001 "" "GET /ai/models (info)" "$API/ai/models" -H "Authorization: Bearer $OWNER"
run TC-AI-CHAT-MODELS-401 401 "Unauth /ai/models → 401" "$API/ai/models"
run TC-AI-CHAT-MODELS-AUTH "" "GET /ai/auth-status (info)" "$API/ai/auth-status" -H "Authorization: Bearer $OWNER"

# TC-AI-CHAT-MULTIPAGE / PRESENTATION / PWA / SPREADSHEET / PDF
# These are heavy multi-turn build flows — out of scope (BLOCKED for this slice)
run TC-AI-CHAT-MULTIPAGE-S BLOCKED "Multi-turn React Router build — out of scope" "$API/health"
run TC-AI-CHAT-PRESENTATION-S BLOCKED "Multi-turn presentation build — out of scope" "$API/health"
run TC-AI-CHAT-PWA-S BLOCKED "Multi-turn PWA build — out of scope" "$API/health"
run TC-AI-CHAT-SPREADSHEET-S BLOCKED "Multi-turn spreadsheet build — out of scope" "$API/health"
run TC-AI-CHAT-PDF-S BLOCKED "Multi-turn PDF build — out of scope" "$API/health"

# TC-AI-CHAT-PREVIEW-E2E / PREVIEW-WAKE
run TC-AI-CHAT-PREVIEW-401 401 "Unauth GET /preview/:pid (info, expects 401)" "$API/preview/$PID"
run TC-AI-CHAT-PREVIEW-WAKE "" "POST /preview/$PID/wake (info)" -X POST "$API/preview/$PID/wake" -H "Authorization: Bearer $OWNER"

# TC-AI-CHAT-AUTOCONTINUE-TRACE
run TC-AI-CHAT-AUTOCONT-401 401 "Unauth GET /chat/$SESSION_ID/autocontinue-trace → 401" "$API/chat/$SESSION_ID/autocontinue-trace"
run TC-AI-CHAT-AUTOCONT-OWN "" "Owner GET autocontinue-trace (info)" "$API/chat/$SESSION_ID/autocontinue-trace" -H "Authorization: Bearer $OWNER"

# TC-AI-CHAT-POST-PROCESSING-LATENCY (info: just hit GET trace endpoint if exists)
run TC-AI-CHAT-PPL-401 401 "Unauth /admin/traces/search → 401" "$API/admin/traces/search?q=post-processing"
run TC-AI-CHAT-PPL-NONADMIN 403 "Non-admin /admin/traces/search → 403" "$API/admin/traces/search?q=post-processing" -H "Authorization: Bearer $MEMBER"

# TC-AI-CHAT-ENDURANCE-EVOLVED — heavy build; smoke + RBAC only
run TC-AI-CHAT-ENDURANCE-S BLOCKED "Endurance build — out of scope" "$API/health"

# Done
cat >> "$RUNLOG" <<EOF

## Summary
- TCs run: $TOTAL
- PASS: $PASS
- FAIL: $FAIL
- INFO: $INFO
- BLOCKED: $BLOCKED
- Failed IDs: ${FAILED_IDS[@]:-(none)}
EOF

echo
echo "=== SUMMARY ==="
echo "Total=$TOTAL Pass=$PASS Fail=$FAIL Info=$INFO Blocked=$BLOCKED"
echo "Failed: ${FAILED_IDS[@]:-(none)}"
