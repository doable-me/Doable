#!/bin/bash
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export HOME=/home/doable
cd /root/doable || exit 1
while true; do
  echo "[run-nlm] $(date) starting notebooklm on :3001"
  node mcp-servers/notebooklm/server/dist/server.js
  echo "[run-nlm] $(date) exited $? — restart in 3s"
  sleep 3
done
