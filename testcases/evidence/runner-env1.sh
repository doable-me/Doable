#!/usr/bin/env bash
# Doable E2E test runner — works for any operator environment.
# Usage: ENV_NAME=myenv ./runner-env1.sh
#   ENV_NAME  — the subdomain prefix (e.g. "staging", "prod", "client1")
#               API will be https://${ENV_NAME}-api.doable.me
#               Web will be https://${ENV_NAME}.doable.me
set -u

: "${ENV_NAME:?'Set ENV_NAME to the environment subdomain prefix (e.g. staging)'}"
: "${RUN_DATE:=$(date -u +%Y-%m-%d)}"

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EVIDENCE_DIR="$REPO_ROOT/testcases/evidence/${ENV_NAME}"
RUNLOG="$REPO_ROOT/testcases/99-runlog/${ENV_NAME}/RUN-${RUN_DATE}.md"
TOKENS_FILE="$REPO_ROOT/testcases/evidence/_tokens-${ENV_NAME}.json"
API="https://${ENV_NAME}-api.doable.me"

mkdir -p "$EVIDENCE_DIR" "$(dirname "$RUNLOG")"

token_for() {
  TOKEN_USER="$1" python3 -c "import json,os; print(json.load(open(r'$TOKENS_FILE'))[os.environ['TOKEN_USER']]['access'])"
}
uid_for() {
  TOKEN_USER="$1" python3 -c "import json,os; print(json.load(open(r'$TOKENS_FILE'))[os.environ['TOKEN_USER']]['user_id'])"
}

run_tc() {
  # Usage: run_tc <TC-ID> <description> <expected-status> <curl-args...>
  local tc_id="$1"; shift
  local descr="$1"; shift
  local exp_status="$1"; shift
  local body_file="$EVIDENCE_DIR/$tc_id.body"
  local hdr_file="$EVIDENCE_DIR/$tc_id.hdr"
  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local status
  status=$(curl -sS -o "$body_file" -D "$hdr_file" -w "%{http_code}" "$@")
  local result="PASS"
  if [ -z "$exp_status" ]; then
    result="INFO"
  elif [ "$status" != "$exp_status" ]; then
    result="FAIL"
  fi
  local body_summary
  body_summary=$(head -c 220 "$body_file" 2>/dev/null | tr '\n\t|' '   ')
  printf "| %s | %s | %s | got=%s exp=%s — %s · %s |\n" \
    "$tc_id" "$now" "$result" "$status" "$exp_status" "$descr" "$body_summary" \
    >> "$RUNLOG"
  echo "$result $status $tc_id"
}

export -f run_tc token_for uid_for
export EVIDENCE_DIR RUNLOG TOKENS_FILE API ENV_NAME
