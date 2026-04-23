#!/bin/bash
# Diagnostic script for dev server
echo "=== DEV SERVER DIAGNOSTIC ==="
echo "Date: $(date)"
echo ""

echo "=== TMUX Sessions ==="
tmux list-sessions 2>&1 || echo "tmux not available"
echo ""

echo "=== Running Processes ==="
ps aux | grep -E 'node|npm|pnpm|tsx' | grep -v grep
echo ""

echo "=== Port Listening ==="
netstat -tlnp 2>/dev/null | grep -E ':3000|:4000|:4001|:5432' || ss -tlnp 2>/dev/null | grep -E ':3000|:4000|:4001|:5432'
echo ""

echo "=== API Health Check ==="
curl -s http://localhost:4000/health 2>&1 | head -20 || echo "API not responding"
echo ""

echo "=== Recent API Logs ==="
if [ -d /root/doable ]; then
  cd /root/doable
  if [ -f services/api/.env ]; then
    echo "API .env exists"
  fi
  echo "Current directory: $(pwd)"
  echo "Files:"
  ls -la services/api/.env* 2>/dev/null || echo "No env files in services/api"
fi
echo ""

echo "=== Environment Variables ==="
printenv | grep -E 'DATABASE|JWT|NEXT_PUBLIC_API|API_PORT|API_HOST' || echo "No relevant env vars found"
