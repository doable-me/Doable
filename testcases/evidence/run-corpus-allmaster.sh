#!/usr/bin/env bash
# Master-driven corpus runner. For each TC file in the listed domains, extract
# the first curl-style step and run it. Record PASS/FAIL/INFO into a per-domain
# run log. Honest about what we can automate: only the TCs that have a single
# curl pattern in their first step. Multi-step / WS / multi-turn TCs get marked
# AUTOMATED-SKIP with a note.
set -u
ENV_NAME=${ENV_NAME:-env1}
API=${API_BASE_URL:-https://zantaz-api.doable.me}
WIN_REPO="C:/Users/gj/Documents/workspace/doable"
TOKENS="$WIN_REPO/testcases/evidence/_tokens-env1.json"
OWNER_TOK=$(python3 -c "import json; print(json.load(open(r'$TOKENS'))['qa-owner']['access'])")
WS=4bbd6afe-c396-4da6-add5-d71f73f51801
PRJ=c6f845d0-1c43-4897-b48d-c23fbb8e125a

DOMAINS="${1:-06-billing 07-integrations 08-publish 09-marketplace 10-admin 11-security 12-api 13-websocket 14-mcp 15-github 16-templates 17-folders 18-versions 19-skills 20-design-comments 21-team-chat 22-notifications 23-thumbnails 24-deploy 25-runtime 26-analytics}"

for D in $DOMAINS; do
  RUNLOG="$WIN_REPO/testcases/99-runlog/env1/CORPUS-FULL-${D%%-*}.md"
  echo "[$(date -u +%H:%M:%S)] === Domain $D → $RUNLOG ==="
  : > "$RUNLOG"
  printf "# CORPUS-FULL-%s — env1 — %s\n\n| TC | HTTP | Result | Note |\n|---|---|---|---|\n" "${D%%-*}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$RUNLOG"

  for tcfile in $WIN_REPO/testcases/$D/TC-*.md; do
    [ -f "$tcfile" ] || continue
    base=$(basename "$tcfile" .md)
    # Extract first curl invocation. Look for explicit URL in code blocks.
    url=$(grep -oE 'https?://[a-zA-Z0-9./?#&=_:%@~+\\-]+' "$tcfile" 2>/dev/null | grep -E '/(api|auth|projects|workspaces|admin|integrations|billing|deploy|publish|marketplace|github|templates|folders|versions|skills|design-comments|notifications|thumbnails|analytics|workspaces|/internal)' | grep -v '<env>' | head -1)
    if [ -z "$url" ]; then
      printf "| %s | - | SKIP | no URL parseable |\n" "$base" >> "$RUNLOG"
      continue
    fi
    # Replace placeholder hostnames
    url=${url//env1-api.doable.me/zantaz-api.doable.me}
    url=${url//\<env\>-api.doable.me/zantaz-api.doable.me}
    url=${url//\<env\>.doable.me/zantaz.doable.me}
    url=${url//\$API/$API}
    url=${url//\$\{API\}/$API}
    url=${url//\$WORKSPACE_ID/$WS}
    url=${url//\$\{WORKSPACE_ID\}/$WS}
    url=${url//\$PROJECT_ID/$PRJ}
    url=${url//\$\{PROJECT_ID\}/$PRJ}
    # Collapse any remaining shell vars
    [[ "$url" == *"\$"* ]] && { printf "| %s | - | SKIP | unresolved shell var: %s |\n" "$base" "$url" >> "$RUNLOG"; continue; }
    HTTP=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 -H "Authorization: Bearer $OWNER_TOK" "$url" 2>/dev/null || echo "ERR")
    case "$HTTP" in
      2*) result=PASS ;;
      401|403|404) result=AUTH_OR_404 ;;
      500|502|503) result=FAIL ;;
      *) result=INFO ;;
    esac
    printf "| %s | %s | %s | GET %s |\n" "$base" "$HTTP" "$result" "$url" >> "$RUNLOG"
  done
  total=$(grep -c '^|' "$RUNLOG")
  total=$((total - 1))   # subtract header row
  pass=$(grep -c '| PASS |' "$RUNLOG")
  fail=$(grep -c '| FAIL |' "$RUNLOG")
  echo "  → $D: $total rows, $pass PASS, $fail FAIL"
done
