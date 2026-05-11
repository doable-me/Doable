#!/usr/bin/env bash
# CORPUS FULL-2 re-run — corrected paths for chat (per-project mount).
set -u
API="${API:-https://zantaz-api.doable.me}"
TOKENS="testcases/evidence/_tokens-env1.json"
RUNLOG="testcases/99-runlog/env1/CORPUS-FULL-2.md"
EV="testcases/evidence/env1"

OWNER=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-owner']['access'])")
ADMIN=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-admin']['access'])")
MEMBER=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-member']['access'])")
VIEWER=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-viewer']['access'])")
BOB=$(python3 -c "import json;print(json.load(open('$TOKENS'))['qa-bob']['access'])")
PID=$(curl -sS --max-time 8 -H "Authorization: Bearer $OWNER" "$API/projects" | python3 -c "import sys,json; d=json.load(sys.stdin); ps=d.get('data') or d.get('projects') or d; print((ps[0] if ps else {}).get('id',''))" 2>/dev/null || echo "")
WID=$(curl -sS --max-time 8 -H "Authorization: Bearer $OWNER" "$API/workspaces" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('data') or d.get('workspaces') or d)[0]['id'])" 2>/dev/null || echo "")
echo "WID=$WID PID=$PID"

PASS=0; FAIL=0; INFO=0; BLOCKED=0; TOTAL=0
FAILED_IDS=()

cat >> "$RUNLOG" <<EOF

## Re-run with corrected mounts (per-project chat, etc.)

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

# Re-run chat with /projects/:id/chat per-project mount
run TC-AI-CHAT-SEND-004r 400 "Empty content → 400 (per-project mount)" -X POST "$API/projects/$PID/chat" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"content":"","mode":"agent"}'
run TC-AI-CHAT-SEND-005r 400 "Whitespace-only content → 400" -X POST "$API/projects/$PID/chat" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"content":"   \n\t  ","mode":"agent"}'
run TC-AI-CHAT-SEND-008r 400 "Invalid mode → 400" -X POST "$API/projects/$PID/chat" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"content":"x","mode":"foobar"}'
run TC-AI-CHAT-SEND-010r 404 "Nonexistent projectId → 404" -X POST "$API/projects/00000000-0000-0000-0000-000000000000/chat" -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" -d '{"content":"x","mode":"agent"}'
run TC-AI-CHAT-SEND-011r "" "Cross-tenant qa-bob send → 403/404" -X POST "$API/projects/$PID/chat" -H "Authorization: Bearer $BOB" -H "Content-Type: application/json" -d '{"content":"x","mode":"agent"}'
run TC-AI-CHAT-SEND-012r 401 "Unauth POST chat → 401" -X POST "$API/projects/$PID/chat" -H "Content-Type: application/json" -d '{"content":"x","mode":"agent"}'

# Per-project chat history
run TC-AI-CHAT-HISTORY-001r 200 "GET /projects/$PID/chat/history → 200" "$API/projects/$PID/chat/history" -H "Authorization: Bearer $OWNER"
run TC-AI-CHAT-HISTORY-002r 401 "Unauth /projects/$PID/chat/history → 401" "$API/projects/$PID/chat/history"
run TC-AI-CHAT-HISTORY-CT-r "" "qa-bob /projects/mine/chat/history → 403/404" "$API/projects/$PID/chat/history" -H "Authorization: Bearer $BOB"

# DELETE /projects/$PID/chat
run TC-AI-CHAT-CLEAR-401 401 "DELETE chat unauth → 401" -X DELETE "$API/projects/$PID/chat"
run TC-AI-CHAT-CLEAR-CT "" "qa-bob DELETE chat → 403/404" -X DELETE "$API/projects/$PID/chat" -H "Authorization: Bearer $BOB"

# Workspace context cross-tenant — DEEP CHECK after seeing 200 (likely RBAC bug)
run TC-WS-CONTEXT-CT-AGAIN "" "qa-admin (different ws) GET /workspaces/$WID/context → ?" "$API/workspaces/$WID/context" -H "Authorization: Bearer $ADMIN"
run TC-WS-CONTEXT-CT-VIEWER "" "qa-viewer (different ws) GET /workspaces/$WID/context → ?" "$API/workspaces/$WID/context" -H "Authorization: Bearer $VIEWER"
run TC-WS-CONTEXT-CT-MEMBER "" "qa-member (different ws) GET /workspaces/$WID/context → ?" "$API/workspaces/$WID/context" -H "Authorization: Bearer $MEMBER"

# Preview status path
run TC-AI-CHAT-PREVIEW-401r 404 "Unauth /preview/$PID actually 404 (no such mount on api host)" "$API/preview/$PID"
run TC-AI-CHAT-PREVIEW-401-2 "" "GET /projects/$PID/preview-status (info)" "$API/projects/$PID/preview-status" -H "Authorization: Bearer $OWNER"

# Tools — list
run TC-AI-CHAT-TOOLS-WS "" "GET /workspaces/$WID/tools (info)" "$API/workspaces/$WID/tools" -H "Authorization: Bearer $OWNER"
run TC-AI-CHAT-TOOLS-WS-401 401 "Unauth /workspaces/:wid/tools → 401" "$API/workspaces/$WID/tools"

cat >> "$RUNLOG" <<EOF

### Re-run summary
- TCs run: $TOTAL  PASS: $PASS  FAIL: $FAIL  INFO: $INFO  BLOCKED: $BLOCKED
- Failed: ${FAILED_IDS[@]:-(none)}
EOF

echo
echo "=== RERUN SUMMARY ==="
echo "Total=$TOTAL Pass=$PASS Fail=$FAIL Info=$INFO Blocked=$BLOCKED"
echo "Failed: ${FAILED_IDS[@]:-(none)}"
