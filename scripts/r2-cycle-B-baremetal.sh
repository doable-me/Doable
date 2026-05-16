#!/usr/bin/env bash
# Round-2 cycle B: bare-metal NO_TUNNEL install on Hetzner #2987905.
# Assumes the box has been freshly reinstalled (rescue + installimage) and
# Docker is NOT running on it (since this is the bare-metal path, not docker).
# If the previous cycle left Docker containers running, this script tears
# them down first.
#
# Required env: MINIMAX_API_KEY, SSH_KEY, SERVER_IP.
set -euo pipefail
: "${MINIMAX_API_KEY:?required}"
: "${SSH_KEY:?required}"
: "${SERVER_IP:?required}"

SSHCMD="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 root@${SERVER_IP}"

echo "[r2-B] 1. Tear down any prior docker containers (idempotent)"
$SSHCMD 'cd /root/doable 2>/dev/null && \
  docker compose -f deployment/docker/docker-compose.yml down -v 2>/dev/null || true; \
  systemctl stop nginx 2>/dev/null || true; \
  systemctl disable nginx 2>/dev/null || true; \
  apt-get remove -y nginx nginx-common 2>/dev/null || true; \
  echo "[done] cleanup"'

echo "[r2-B] 2. Wipe /root/doable and re-ship HEAD"
$SSHCMD 'mkdir -p /root/doable && find /root/doable -mindepth 1 -delete'
git archive --format=tar HEAD | $SSHCMD 'cd /root/doable && tar xf -'

echo "[r2-B] 3. Run server-setup.sh in NO_TUNNEL mode"
$SSHCMD "cd /root/doable && \
  export NO_TUNNEL=1 NON_INTERACTIVE=1 DOABLE_NO_TMUX=1 && \
  export HOST='${SERVER_IP}' && \
  export DOMAIN='${SERVER_IP}' && \
  export MINIMAX_API_KEY='${MINIMAX_API_KEY}' && \
  export REPO='doable-me/doable' && \
  bash ./deployment/server-setup.sh 2>&1 | tail -400"

echo "[r2-B] 4. Wait for api healthcheck (max 120s)"
for i in $(seq 1 24); do
  if curl -sk "https://${SERVER_IP}/api/health" 2>/dev/null | grep -q '"status":"healthy"'; then
    echo "[r2-B] healthy after ${i}*5s"
    break
  fi
  sleep 5
done

echo "[r2-B] 5. Capture state for evidence"
curl -sk "https://${SERVER_IP}/api/health" > .omc/state/sessions/ralph-2026-05-17-r2-multi-install/cycleB-health.json || true
$SSHCMD 'systemctl list-units doable\* --no-pager 2>&1 | head -30' \
  > .omc/state/sessions/ralph-2026-05-17-r2-multi-install/cycleB-systemd.txt || true
echo "[r2-B] done"
