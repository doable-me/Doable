#!/bin/bash

# Log watcher monitor script for Doable E2E test

LOG_FILE="C:\Users\gj\Documents\workspace\doable\progress\.api_log_capture.txt"
HEALTH_ENDPOINT="http://localhost:4000/health"

# Check API health
check_api() {
  curl -s "$HEALTH_ENDPOINT" 2>/dev/null | grep -q '"status":"healthy"'
  if [ $? -eq 0 ]; then
    echo "ALIVE"
  else
    echo "DOWN"
  fi
}

# Get last N lines from log
get_recent_logs() {
  local count=${1:-20}
  if [ -f "$LOG_FILE" ]; then
    tail -n $count "$LOG_FILE"
  else
    echo "No logs found"
  fi
}

# Check for errors in logs
check_errors() {
  if [ -f "$LOG_FILE" ]; then
    grep -i "error\|urgent\|fail\|exception\|500" "$LOG_FILE" | tail -10
  fi
}

echo "=== HEALTH CHECK ==="
check_api
echo ""
echo "=== RECENT LOGS ==="
get_recent_logs 10
echo ""
echo "=== ERRORS ==="
check_errors
