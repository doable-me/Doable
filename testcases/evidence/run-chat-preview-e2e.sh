#!/usr/bin/env bash
# TC-AI-CHAT-PREVIEW-E2E runner — sends a counter-app prompt, captures SSE timing,
# verifies live preview's actual rendered HTML contains the requested elements.
#
# Required env:
#   ENV_NAME      — directory + config tag (e.g. env1)
#   API_BASE_URL  — actual API origin for THIS test run (e.g. https://zantaz-api.doable.me)
# Optional:
#   PROMPT        — prompt to send
#   OWNER_WS_ID   — workspace id (default: 4bbd6afe-c396-4da6-add5-d71f73f51801)
set -u
: "${ENV_NAME:?Set ENV_NAME (e.g. env1)}"
: "${API_BASE_URL:?Set API_BASE_URL (e.g. https://zantaz-api.doable.me)}"
: "${OWNER_WS_ID:=4bbd6afe-c396-4da6-add5-d71f73f51801}"

# Convert any /c/Users/... path to C:/Users/... for Windows-native Python
to_win() {
  case "$1" in
    /[a-zA-Z]/*) printf '%s' "$(echo "$1" | sed -E 's|^/([a-zA-Z])/|\1:/|')" ;;
    *) printf '%s' "$1" ;;
  esac
}

REPO_ROOT_RAW="$(cd "$(dirname "$0")/../.." && pwd)"
REPO_ROOT="$(to_win "$REPO_ROOT_RAW")"
TOKENS_FILE="${REPO_ROOT}/testcases/evidence/_tokens-${ENV_NAME}.json"
EVIDENCE_DIR="${REPO_ROOT}/testcases/evidence/${ENV_NAME}/chat-preview"
mkdir -p "$EVIDENCE_DIR"

OWNER_TOK=$(python3 -c "import json,sys; print(json.load(open(r'$TOKENS_FILE'))['qa-owner']['access'])")
[ -z "$OWNER_TOK" ] && { echo "FAIL: no qa-owner token"; exit 1; }

TS=$(date +%s)
PROJECT_NAME="counter-e2e-${TS}"
echo "[$(date -u +%H:%M:%S)] Creating fresh project '${PROJECT_NAME}'..."
PROJECT_RESP=$(curl -sS -X POST "${API_BASE_URL}/projects" \
  -H "Authorization: Bearer ${OWNER_TOK}" \
  -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"${OWNER_WS_ID}\",\"name\":\"${PROJECT_NAME}\",\"frameworkId\":\"vite-react\"}")
PROJECT_ID=$(printf '%s' "$PROJECT_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))")
[ -z "$PROJECT_ID" ] && { echo "FAIL: no project id; resp=$PROJECT_RESP"; exit 1; }
echo "  → project id = $PROJECT_ID"

PROMPT="${PROMPT:-Build a single-page counter app. Show a large number starting at 0 in the center using Tailwind class text-6xl. Below it render three buttons in a row using Tailwind: \"+1\" increments by 1, \"-1\" decrements by 1, \"Reset\" sets to 0. State must persist via React useState in App.tsx. Update App.tsx only.}"

SSE_LOG="${EVIDENCE_DIR}/${PROJECT_ID}.sse.log"
TIMING_LOG="${EVIDENCE_DIR}/${PROJECT_ID}.timing.log"
PARSED_LOG="${EVIDENCE_DIR}/${PROJECT_ID}.parsed.log"

T0_NS=$(date +%s%N)
echo "T0=$T0_NS UTC=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" | tee "$TIMING_LOG"

PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'content': sys.argv[1]}))" "$PROMPT")
echo "[$(date -u +%H:%M:%S)] Streaming SSE (max 120s)..."
curl -sS -N --max-time 120 -X POST "${API_BASE_URL}/projects/${PROJECT_ID}/chat" \
  -H "Authorization: Bearer ${OWNER_TOK}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" > "$SSE_LOG" 2>&1
T_DONE_NS=$(date +%s%N)
echo "T_sse_done=$T_DONE_NS delta_ms=$(( (T_DONE_NS - T0_NS) / 1000000 ))" >> "$TIMING_LOG"

# Parse the SSE log into a phase-timing summary
T0_NS_VAR="$T0_NS" python3 - "$SSE_LOG" "$PARSED_LOG" <<'PYEOF'
import sys, json, os, re, time
sse_path, parsed_path = sys.argv[1], sys.argv[2]
t0 = int(os.environ['T0_NS_VAR'])
phases = {}
events = []
# We can't get real timestamps from a flat file (curl already finished), so we infer from line offset.
# This still gives us order + count + text per stage.
with open(sse_path) as f:
    for ln, line in enumerate(f, 1):
        line = line.rstrip()
        if not line.startswith('data:'):
            continue
        body = line[5:].strip()
        if body == '[DONE]':
            phases.setdefault('DONE', ln)
            continue
        try:
            d = json.loads(body)
        except Exception:
            continue
        typ = d.get('type')
        data = d.get('data')
        events.append((ln, typ, data if isinstance(data, str) else None))
        if typ == 'thinking':
            phases.setdefault('first_thinking', ln)
        if typ == 'status' and isinstance(data, dict):
            ph = data.get('phase')
            if ph: phases.setdefault('phase_'+ph, ln)
            if isinstance(data.get('message',''), str) and 'Compiling' in data['message']:
                phases.setdefault('first_compile', ln)
        if typ == 'thinking_to_text':
            phases.setdefault('first_thinking_to_text', ln)
        if typ == 'usage':
            phases['usage'] = d.get('data', {})
        if typ == 'done':
            phases.setdefault('event_done', ln)
out = {
    'phase_line_offsets': {k:v for k,v in phases.items() if not isinstance(v, dict)},
    'usage': phases.get('usage'),
    'total_events': len(events),
    'first_5_events': events[:5],
}
with open(parsed_path, 'w') as fo:
    json.dump(out, fo, indent=2, default=str)
print(json.dumps(out, indent=2, default=str))
PYEOF

# Look up the dev-server URL via /admin/dev-servers
echo ""
echo "[$(date -u +%H:%M:%S)] Looking up dev-server for $PROJECT_ID..."
DEV_JSON=$(curl -sS -H "Authorization: Bearer $OWNER_TOK" "${API_BASE_URL}/admin/dev-servers")
echo "$DEV_JSON" > "${EVIDENCE_DIR}/${PROJECT_ID}.dev-servers.json"
PROJECT_ID_VAR="$PROJECT_ID" python3 - <<'PYEOF' >> "${EVIDENCE_DIR}/${PROJECT_ID}.dev-server-info.txt"
import os, json, sys
fn = os.path.dirname(os.environ['PROJECT_ID_VAR']) if False else None
PROJECT_ID = os.environ['PROJECT_ID_VAR']
import json
d = json.load(open(sys.stdin.fileno())) if False else None
# Re-read the saved file
import os
ED = os.environ.get('EVIDENCE_DIR_OVERRIDE','')
PYEOF
# simpler grep
PORT=$(printf '%s' "$DEV_JSON" | python3 -c "
import json,sys,os
d=json.load(sys.stdin)
pid = '$PROJECT_ID'
for s in d.get('data',{}).get('servers',[]):
    if s.get('projectId')==pid:
        print(s.get('port') or s.get('listenPort') or '')
        break
")
echo "  dev-server port (host): ${PORT:-(none)}"

PREVIEW_PROXY="${API_BASE_URL}/preview/${PROJECT_ID}/"
echo "  preview proxy URL: ${PREVIEW_PROXY}"

# 4. Poll until preview returns 200 with a sizable body (max 90s)
echo ""
echo "[$(date -u +%H:%M:%S)] Polling preview until ready (max 90s)..."
PREVIEW_HTML="${EVIDENCE_DIR}/${PROJECT_ID}.preview.html"
T_WAIT_START=$(date +%s)
PREVIEW_OK=""
for i in $(seq 1 90); do
  HTTP=$(curl -sS -o "$PREVIEW_HTML" -w "%{http_code}" -H "Authorization: Bearer $OWNER_TOK" "$PREVIEW_PROXY" 2>/dev/null || echo "ERR")
  SIZE=$(wc -c < "$PREVIEW_HTML" 2>/dev/null | tr -d ' ')
  if [ "${HTTP}" = "200" ] && [ "${SIZE:-0}" -gt 200 ]; then
    PREVIEW_OK=1
    NOW_S=$(date +%s)
    WAITED=$(( NOW_S - T_WAIT_START ))
    echo "  [+${WAITED}s] preview HTTP=200 size=${SIZE} bytes"
    echo "T_preview_http=$(date +%s%N) wait_s=$WAITED size=$SIZE" >> "$TIMING_LOG"
    break
  fi
  sleep 1
done
[ -z "$PREVIEW_OK" ] && echo "  [WARN] preview not ready after 90s; HTTP=${HTTP}, size=${SIZE:-0}"

# 5. DOM acceptance
echo ""
echo "[$(date -u +%H:%M:%S)] DOM acceptance assertions for counter app:"
PREVIEW_HTML_VAR="$PREVIEW_HTML" python3 - <<'PYEOF'
import re, html, os, sys
fn = os.environ['PREVIEW_HTML_VAR']
try:
    h = open(fn).read()
except Exception as e:
    print('FAIL: no preview html captured:', e); sys.exit(1)
text = re.sub(r'<[^>]+>', ' ', h)
text = html.unescape(text)
# Acceptance — counter app must contain these visible labels and be Tailwind-ish
def has_btn_labelled(label_re):
    return bool(re.search(label_re, h)) or bool(re.search(label_re, text))
checks = {
    "+1 button":       has_btn_labelled(r'\+\s?1\b'),
    "-1 button":       has_btn_labelled(r'(?:^|\s|>)[-−]\s?1\b'),
    "Reset button":    has_btn_labelled(r'\bReset\b'),
    "shows '0'":       bool(re.search(r'>\s*0\s*<', h) or re.search(r'\b0\b', text)),
    "uses text-6xl":   'text-6xl' in h,
    "uses flex":       (' flex ' in h) or ('flex-row' in h) or ('flex ' in h),
    "html size > 1KB": len(h) > 1024,
}
print(f"  preview html size: {len(h)} bytes")
for k,v in checks.items():
    print(f"  [{'PASS' if v else 'FAIL'}] {k}")
result_pass = all(checks.values())
print()
print(f"  RESULT: {'PASS' if result_pass else 'FAIL'}")
sys.exit(0 if result_pass else 2)
PYEOF
RC=$?

echo ""
echo "=== run summary ==="
echo "  project:    $PROJECT_ID"
echo "  evidence:   $EVIDENCE_DIR/$PROJECT_ID.*"
echo "  RC:         $RC (0=PASS, 2=FAIL)"
exit $RC
