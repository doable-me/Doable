#!/usr/bin/env bash
# Doable zantaz test runner (mirror of evidence/runner.sh adapted for zantaz)
set -u
EVIDENCE_DIR=/c/Users/gj/Documents/workspace/doable/testcases/evidence/zantaz
RUNLOG=/c/Users/gj/Documents/workspace/doable/testcases/99-runlog/zantaz/RUN-2026-05-10.md
TOKENS_WIN='C:/Users/gj/Documents/workspace/doable/testcases/evidence/_tokens-zantaz.json'
API=https://zantaz-api.doable.me

mkdir -p "$EVIDENCE_DIR"

token_for() {
  TOKEN_USER="$1" python3 -c "import json,os; print(json.load(open(r'$TOKENS_WIN'))[os.environ['TOKEN_USER']]['access'])"
}
uid_for() {
  TOKEN_USER="$1" python3 -c "import json,os; print(json.load(open(r'$TOKENS_WIN'))[os.environ['TOKEN_USER']]['user_id'])"
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
export EVIDENCE_DIR RUNLOG TOKENS_WIN API
