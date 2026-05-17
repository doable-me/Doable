#!/usr/bin/env bash
# Round-3 bare-metal cycle reset — restores a known-clean state on the
# Hetzner box without a full OS reinstall. Use between successive cycle-B
# runs to:
#   1. Stop doable.service so the API isn't holding connections
#   2. TRUNCATE users + platform_config CASCADE (wipes the test owner +
#      every wizard/platform setting written by previous suite runs)
#   3. Start doable.service — boot-time seedAiProviderFromEnv() fires
#      against an empty platform_config and re-seeds setup.ai_provider_*
#      from whichever provider env var is set (MINIMAX_API_KEY, etc.)
#   4. Poll /api/health until status:healthy
#
# Required env: SSH_KEY, SERVER_IP.
set -euo pipefail
: "${SSH_KEY:?required}"
: "${SERVER_IP:?required}"

SSHCMD="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@${SERVER_IP}"

echo "[r3-reset] stop doable + truncate users/platform_config + start doable"
$SSHCMD 'systemctl stop doable && sudo -u postgres psql -d doable -c "TRUNCATE platform_config, users CASCADE;" 2>&1 | tail -3 && systemctl start doable'

echo "[r3-reset] wait for api healthcheck (max 120s)"
for i in $(seq 1 24); do
  if curl -sk -m 3 "https://${SERVER_IP}/api/health" 2>/dev/null | grep -q '"status":"healthy"'; then
    echo "[r3-reset] healthy after ${i}*5s"
    exit 0
  fi
  sleep 5
done
echo "[r3-reset] FAILED to reach healthy within 120s" >&2
exit 1
