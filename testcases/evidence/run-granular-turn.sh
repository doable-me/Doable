#!/usr/bin/env bash
# Granular per-turn instrumentation: send prompt → record every SSE event with
# wallclock timestamp → grab dev-server source files BEFORE and AFTER → diff →
# probe preview HTTP until stable → record total time-to-stable.
#
# Usage:
#   ENV_NAME=env1 API_BASE_URL=https://zantaz-api.doable.me \
#   PROJECT_ID=<id> PROMPT="..." TURN=N TEST_NAME=foo bash run-granular-turn.sh
#
# Outputs into testcases/evidence/${ENV_NAME}/${TEST_NAME}/<project>.turn<N>.{sse,timing,diff,preview,probe}
set -u
: "${ENV_NAME:?Set ENV_NAME}"
: "${API_BASE_URL:?Set API_BASE_URL}"
: "${PROJECT_ID:?Set PROJECT_ID}"
: "${PROMPT:?Set PROMPT}"
: "${TURN:=1}"
: "${TEST_NAME:=granular}"
: "${SSH_HOST:=ubuntu@54.37.128.179}"
: "${SSH_KEY:=$HOME/Documents/itdept}"
: "${PROJECTS_ROOT:=/opt/doable/services/api/projects}"

to_win(){ case "$1" in /[a-zA-Z]/*) echo "$1" | sed -E 's|^/([a-zA-Z])/|\1:/|';; *) echo "$1";; esac; }
REPO_RAW="$(cd "$(dirname "$0")/../.." && pwd)"
REPO="$(to_win "$REPO_RAW")"
TOKENS="${REPO}/testcases/evidence/_tokens-${ENV_NAME}.json"
TOK="$(python3 -c "import json; print(json.load(open(r'${TOKENS}'))['qa-owner']['access'])")"
EVD="${REPO}/testcases/evidence/${ENV_NAME}/${TEST_NAME}"
mkdir -p "$EVD"

PFX="${EVD}/${PROJECT_ID}.turn${TURN}"
SSE_LOG="${PFX}.sse.jsonl"
TIM_LOG="${PFX}.timing.tsv"
SRC_BEFORE="${PFX}.src-before.txt"
SRC_AFTER="${PFX}.src-after.txt"
DIFF_LOG="${PFX}.diff.log"
PROBE_LOG="${PFX}.probe.tsv"
PROMPT_LOG="${PFX}.prompt.txt"

printf '%s' "$PROMPT" > "$PROMPT_LOG"

# 1) Snapshot project source-file SHAs BEFORE the turn
ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$SSH_HOST" "
sudo find ${PROJECTS_ROOT}/${PROJECT_ID}/src ${PROJECTS_ROOT}/${PROJECT_ID}/index.html ${PROJECTS_ROOT}/${PROJECT_ID}/package.json ${PROJECTS_ROOT}/${PROJECT_ID}/vite.config.ts -type f 2>/dev/null | sort | xargs -r sudo sha256sum 2>/dev/null
" > "$SRC_BEFORE" 2>/dev/null

T0_NS=$(date +%s%N)
T0_ISO=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)

# 2) Stream SSE; wallclock-stamp each event line
PAYLOAD=$(python3 -c 'import json,sys;print(json.dumps({"content":sys.argv[1]}))' "$PROMPT")
{
  printf "TIMESTAMP\tT_REL_MS\tEVENT\n" > "$TIM_LOG"
  curl -sS -N --max-time 180 -X POST "${API_BASE_URL}/projects/${PROJECT_ID}/chat" \
    -H "Authorization: Bearer ${TOK}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
  | while IFS= read -r line; do
      now_ns=$(date +%s%N)
      delta_ms=$(( (now_ns - T0_NS) / 1000000 ))
      printf '%s\n' "$line" >> "$SSE_LOG"
      [ -z "$line" ] && continue
      [[ "$line" == data:* ]] || continue
      body="${line#data: }"
      [ "$body" = "[DONE]" ] && { printf "%s\t%d\t[DONE]\n" "$(date -u +%H:%M:%S.%3NZ)" "$delta_ms" >> "$TIM_LOG"; break; }
      typ=$(printf '%s' "$body" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin); t=d.get("type",""); data=d.get("data",{})
  if isinstance(data,dict):
    p=data.get("phase",""); m=data.get("message","")
    print(f"{t} | phase={p} | msg={m[:70]}".strip())
  else:
    s=str(data)[:90]; print(f"{t} | {s}")
except: print("(unparsed)")' 2>/dev/null)
      printf "%s\t%d\t%s\n" "$(date -u +%H:%M:%S.%3NZ)" "$delta_ms" "$typ" >> "$TIM_LOG"
    done
} 2>/dev/null

T_DONE_NS=$(date +%s%N)
SSE_TOTAL_MS=$(( (T_DONE_NS - T0_NS) / 1000000 ))

# 3) Snapshot AFTER + diff
ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$SSH_HOST" "
sudo find ${PROJECTS_ROOT}/${PROJECT_ID}/src ${PROJECTS_ROOT}/${PROJECT_ID}/index.html ${PROJECTS_ROOT}/${PROJECT_ID}/package.json ${PROJECTS_ROOT}/${PROJECT_ID}/vite.config.ts -type f 2>/dev/null | sort | xargs -r sudo sha256sum 2>/dev/null
" > "$SRC_AFTER" 2>/dev/null

# Compute changed-file list
diff "$SRC_BEFORE" "$SRC_AFTER" 2>/dev/null > "$DIFF_LOG" || true
CHANGED_COUNT=$(grep -cE '^[<>] [a-f0-9]{64}' "$DIFF_LOG" 2>/dev/null || echo 0)
CHANGED_FILES=$(grep -E '^> [a-f0-9]{64}' "$DIFF_LOG" 2>/dev/null | awk '{print $3}' | sed "s|${PROJECTS_ROOT}/${PROJECT_ID}/||" | sort -u | tr '\n' ',' )

# 4) Pull the changed App.tsx (if any) so we can grep prompt-derived content
APP_TSX_CONTENT=""
if echo "$CHANGED_FILES" | grep -q "src/App.tsx"; then
  APP_TSX_CONTENT=$(ssh -i "$SSH_KEY" "$SSH_HOST" "sudo cat ${PROJECTS_ROOT}/${PROJECT_ID}/src/App.tsx" 2>/dev/null)
  printf '%s' "$APP_TSX_CONTENT" > "${PFX}.App.tsx"
fi

# 5) Probe the preview URL until 200 with non-empty body (max 60s)
PREVIEW="${API_BASE_URL}/preview/${PROJECT_ID}/"
printf "T_REL_MS\tHTTP\tSIZE\n" > "$PROBE_LOG"
T_PREVIEW_OK_MS=""
for i in $(seq 1 60); do
  PROBE_T=$(date +%s%N)
  REL=$(( (PROBE_T - T0_NS) / 1000000 ))
  RESP=$(curl -sS -o /dev/null -w "%{http_code}|%{size_download}" --max-time 10 -H "Authorization: Bearer ${TOK}" "$PREVIEW" 2>/dev/null || echo "ERR|0")
  HTTP=${RESP%|*}; SZ=${RESP#*|}
  printf "%d\t%s\t%s\n" "$REL" "$HTTP" "$SZ" >> "$PROBE_LOG"
  if [ "$HTTP" = "200" ] && [ "${SZ:-0}" -gt 200 ]; then
    T_PREVIEW_OK_MS=$REL; break
  fi
  sleep 1
done

# 6) Extract usage from SSE (final tokens, model, ttft)
USAGE=$(grep -E '"type":"usage"' "$SSE_LOG" 2>/dev/null | head -1)
get(){ printf '%s' "$USAGE" | python3 -c 'import json,sys,re
try: m=re.search(r"\"data\":(\{[^}]+\})",sys.stdin.read()); d=json.loads(m.group(1)); print(d.get(sys.argv[1],""))
except: print("")' "$1"; }

PT=$(get promptTokens)
CT=$(get completionTokens)
TTFT=$(get ttftMs)
DUR=$(get durationMs)
MODEL=$(get model)

# 7) Acceptance grep — ACCEPT_PHRASES env can be a |-separated list of regex
ACCEPT_HITS=""
if [ -n "${ACCEPT_PHRASES:-}" ] && [ -n "$APP_TSX_CONTENT" ]; then
  IFS='|' read -ra PHRASES <<< "$ACCEPT_PHRASES"
  for p in "${PHRASES[@]}"; do
    if echo "$APP_TSX_CONTENT" | grep -qE "$p"; then
      ACCEPT_HITS="${ACCEPT_HITS}+${p};"
    else
      ACCEPT_HITS="${ACCEPT_HITS}-${p};"
    fi
  done
fi

# 8) Print one-line per-turn summary (also append to test-level CSV)
SUMMARY_CSV="${EVD}/${TEST_NAME}.summary.csv"
[ -f "$SUMMARY_CSV" ] || printf "turn,project,sse_ms,preview_ms,prompt_tok,comp_tok,ttft_ms,model,changed_files,accept_hits,prompt_excerpt\n" > "$SUMMARY_CSV"
EXCERPT=$(echo "$PROMPT" | head -c 70 | tr -d ',\n')
printf "%d,%s,%d,%s,%s,%s,%s,%s,\"%s\",\"%s\",\"%s\"\n" \
  "$TURN" "$PROJECT_ID" "$SSE_TOTAL_MS" "${T_PREVIEW_OK_MS:-TIMEOUT}" \
  "$PT" "$CT" "$TTFT" "$MODEL" "$CHANGED_FILES" "$ACCEPT_HITS" "$EXCERPT" \
  >> "$SUMMARY_CSV"

echo "[turn ${TURN}] sse=${SSE_TOTAL_MS}ms preview=${T_PREVIEW_OK_MS:-TIMEOUT}ms tokens=${PT}/${CT} model=${MODEL} changed=[${CHANGED_FILES}] accept=[${ACCEPT_HITS}]"
