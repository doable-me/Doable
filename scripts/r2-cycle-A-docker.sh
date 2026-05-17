#!/usr/bin/env bash
# Round-2 cycle A: docker quickstart re-deploy on Hetzner #2987905.
# Run from doable repo root. Requires env: MINIMAX_API_KEY, SSH_KEY, SERVER_IP.
#
# Exit 0 = full healthcheck pass after deploy. Exit non-zero = failure point.
set -euo pipefail
: "${MINIMAX_API_KEY:?required}"
: "${SSH_KEY:?required}"
: "${SERVER_IP:?required}"

SSHCMD="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 root@${SERVER_IP}"

echo "[r2-A] 1. wipe /root/doable and ship git archive HEAD"
$SSHCMD 'mkdir -p /root/doable && find /root/doable -mindepth 1 -delete'
git archive --format=tar HEAD | $SSHCMD 'cd /root/doable && tar xf -'

echo "[r2-A] 2. confirm Docker present"
$SSHCMD 'docker --version && docker compose version'

echo "[r2-A] 3. run setup.sh with HOST=ip, MINIMAX prefilled"
# Write the full setup.sh log to /tmp/doable-setup-r2.log on the box, then
# print the first 80 lines (pre-build diagnostic, including volume-wipe
# branch + .env generation) and the last 80 lines (compose output). The
# middle (docker build, hundreds of lines) is preserved in the box log but
# not piped back — too noisy and obscures the pre-build diagnostic.
$SSHCMD "cd /root/doable && \
  export MINIMAX_API_KEY='${MINIMAX_API_KEY}' && \
  export HOST='${SERVER_IP}' && \
  bash ./deployment/docker/setup.sh > /tmp/doable-setup-r2.log 2>&1; \
  EXIT=\$?; \
  echo '----- setup.sh head -----'; head -80 /tmp/doable-setup-r2.log; \
  echo '----- setup.sh tail -----'; tail -80 /tmp/doable-setup-r2.log; \
  echo \"setup-exit=\$EXIT\""

echo "[r2-A] 4. wait for api healthcheck (max 90s)"
for i in $(seq 1 18); do
  if curl -sk "https://${SERVER_IP}/api/health" | grep -q '"status":"healthy"'; then
    echo "[r2-A] healthy after ${i}*5s"
    break
  fi
  sleep 5
done

echo "[r2-A] 5. capture state for evidence"
$SSHCMD 'cd /root/doable && docker compose ps --format json' > .omc/state/sessions/ralph-2026-05-17-r2-multi-install/cycleA-compose-ps.json || true
curl -sk "https://${SERVER_IP}/api/health" > .omc/state/sessions/ralph-2026-05-17-r2-multi-install/cycleA-health.json
echo "[r2-A] done"
