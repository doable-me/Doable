#!/usr/bin/env bash
# TC-AI-CHAT-LONG-CONVO — issue many follow-up prompts on the SAME project,
# verify each turn (a) succeeds (200 SSE with usage event), (b) edits a file,
# (c) preview still serves a non-empty body that contains the latest acceptance phrase.
set -u
: "${ENV_NAME:?Set ENV_NAME}"
: "${API_BASE_URL:?Set API_BASE_URL}"
: "${TURNS:=10}"
: "${OWNER_WS_ID:=4bbd6afe-c396-4da6-add5-d71f73f51801}"

to_win() { case "$1" in /[a-zA-Z]/*) echo "$1" | sed -E 's|^/([a-zA-Z])/|\1:/|';; *) echo "$1";; esac; }
REPO="$(to_win "$(cd "$(dirname "$0")/../.." && pwd)")"
TOK="$(python3 -c "import json; print(json.load(open(r'${REPO}/testcases/evidence/_tokens-${ENV_NAME}.json'))['qa-owner']['access'])")"
EVIDENCE="${REPO}/testcases/evidence/${ENV_NAME}/long-convo"
mkdir -p "$EVIDENCE"

# Seed prompt — initial scaffold
SEED='Build a single-page todo app with React + Tailwind. Show a heading "My Todos" and a list. Use useState in App.tsx.'
# Follow-up prompts evolve the app. Each prompt has a unique acceptance phrase to grep for in preview.
declare -a PROMPTS=(
  'Add an input box and an "Add" button so I can type a new todo and add it to the list. Use useState in App.tsx.|Add'
  'Add a checkbox next to each todo so I can mark it done. Strike-through the text when done.|done'
  'Add a "Clear completed" button at the bottom that removes done todos.|Clear completed'
  'Show a counter at the top: "N todos remaining" using the count of unchecked items.|todos remaining'
  'Add filter tabs: All / Active / Completed. Default selection: All.|Active'
  'Persist the todos to localStorage so they survive a page reload.|localStorage'
  'Add a delete button (X) on the right of each todo. Clicking it removes the todo.|delete'
  'Add a date stamp showing "Created: YYYY-MM-DD" under each todo.|Created:'
  'Add a "drag to reorder" affordance — show a grip icon (≡) on each todo. Don'\''t implement drag yet, just the UI hint.|grip'
  'Add a dark/light mode toggle button at the top right that swaps between bg-white and bg-zinc-900.|toggle'
)

# Build first project
echo "[$(date -u +%H:%M:%S)] Creating fresh project for long-convo stress..."
PROJ_RESP=$(curl -sS -X POST "${API_BASE_URL}/projects" \
  -H "Authorization: Bearer ${TOK}" -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"${OWNER_WS_ID}\",\"name\":\"long-convo-$(date +%s)\",\"frameworkId\":\"vite-react\"}")
PROJECT_ID=$(printf '%s' "$PROJ_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")
echo "  → project: $PROJECT_ID"

# Send seed
echo "[$(date -u +%H:%M:%S)] Turn 0 (seed): scaffold todo app"
SEED_RESP=$(curl -sS -N --max-time 90 -X POST "${API_BASE_URL}/projects/${PROJECT_ID}/chat" \
  -H "Authorization: Bearer ${TOK}" -H "Content-Type: application/json" \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"content":sys.argv[1]}))' "$SEED")")
USAGE_LINE=$(printf '%s' "$SEED_RESP" | grep -E '"type":"usage"' | head -1)
echo "  usage: $USAGE_LINE" | head -c 240; echo

# Wait for first preview to be ready
sleep 3
PREVIEW="${API_BASE_URL}/preview/${PROJECT_ID}/"
T_TURN0_START=$(date +%s)

# Issue follow-up prompts
RESULTS_LOG="${EVIDENCE}/${PROJECT_ID}.results.tsv"
: > "$RESULTS_LOG"
printf "turn\tprompt_excerpt\tsse_total_ms\tprompt_tokens\tcompletion_tokens\tttft_ms\tdur_ms\tpreview_http\tpreview_size\tedit_file_count\tphrase_in_preview\n" >> "$RESULTS_LOG"

LIMIT=${TURNS}
[ "$LIMIT" -gt "${#PROMPTS[@]}" ] && LIMIT=${#PROMPTS[@]}

for i in $(seq 1 $LIMIT); do
  IDX=$((i - 1))
  IFS='|' read -r PROMPT PHRASE <<< "${PROMPTS[$IDX]}"
  EXCERPT=$(echo "$PROMPT" | head -c 60)
  echo "[$(date -u +%H:%M:%S)] Turn $i: $EXCERPT…"
  T_S=$(date +%s%N)
  SSE_FILE="${EVIDENCE}/${PROJECT_ID}.turn${i}.sse.log"
  curl -sS -N --max-time 90 -X POST "${API_BASE_URL}/projects/${PROJECT_ID}/chat" \
    -H "Authorization: Bearer ${TOK}" -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys;print(json.dumps({"content":sys.argv[1]}))' "$PROMPT")" \
    > "$SSE_FILE" 2>&1
  T_E=$(date +%s%N)
  TOTAL_MS=$(( (T_E - T_S) / 1000000 ))

  # Parse usage event
  USAGE=$(grep -E '"type":"usage"' "$SSE_FILE" | head -1)
  PT=$(echo "$USAGE" | python3 -c 'import sys,json,re;m=re.search(r"\"data\":(\{[^}]+\})",sys.stdin.read());print(json.loads(m.group(1)).get("promptTokens","-") if m else "-")' 2>/dev/null)
  CT=$(echo "$USAGE" | python3 -c 'import sys,json,re;m=re.search(r"\"data\":(\{[^}]+\})",sys.stdin.read());print(json.loads(m.group(1)).get("completionTokens","-") if m else "-")' 2>/dev/null)
  TTFT=$(echo "$USAGE" | python3 -c 'import sys,json,re;m=re.search(r"\"data\":(\{[^}]+\})",sys.stdin.read());print(json.loads(m.group(1)).get("ttftMs","-") if m else "-")' 2>/dev/null)
  DUR=$(echo "$USAGE" | python3 -c 'import sys,json,re;m=re.search(r"\"data\":(\{[^}]+\})",sys.stdin.read());print(json.loads(m.group(1)).get("durationMs","-") if m else "-")' 2>/dev/null)
  EDITS=$(grep -c '"name":"edit_file","success":true' "$SSE_FILE")

  # Wait briefly, then poll preview
  sleep 4
  PREV_HTML="${EVIDENCE}/${PROJECT_ID}.turn${i}.preview.html"
  HTTP=$(curl -sS -o "$PREV_HTML" -w '%{http_code}' -H "Authorization: Bearer ${TOK}" "$PREVIEW")
  SIZE=$(wc -c < "$PREV_HTML" 2>/dev/null | tr -d ' ')
  # Phrase grep — Vite serves source-annotated HTML so the JSX literal IS searchable
  PHRASE_FOUND=$(grep -F -c -- "$PHRASE" "$PREV_HTML" 2>/dev/null || echo 0)

  printf "%d\t%s\t%d\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
    "$i" "$EXCERPT" "$TOTAL_MS" "$PT" "$CT" "$TTFT" "$DUR" "$HTTP" "$SIZE" "$EDITS" "$PHRASE_FOUND" \
    >> "$RESULTS_LOG"
  echo "  → ${TOTAL_MS}ms total, ${EDITS} edit_file calls, preview HTTP=${HTTP} size=${SIZE}, phrase '$PHRASE' found ${PHRASE_FOUND}x"
done

echo ""
echo "===== Long-convo stress summary (project ${PROJECT_ID}) ====="
column -t -s $'\t' "$RESULTS_LOG"
echo ""
echo "evidence: $EVIDENCE"
