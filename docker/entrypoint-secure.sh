#!/usr/bin/env bash
# ==============================================================================
# Doable — Secure-image entrypoint
# ==============================================================================
# PID 0 wrapper for docker/Dockerfile.secure. Runs setup-server.sh once on
# first boot (CONTAINER_MODE=1), then exec's /sbin/init so systemd takes over
# as PID 1 and brings up postgres, caddy, cloudflared, tmux/doable, etc.
#
# State machine:
#   - /var/lib/doable/.initialized exists  → skip setup, exec /sbin/init
#   - else                                  → run setup, mark initialized,
#                                              exec /sbin/init
#
# Failure mode: if setup-server.sh exits non-zero, we print the error and exit
# 1 so `docker logs` shows what broke. We do NOT touch the .initialized marker
# on failure, so the next `docker start` retries from scratch.
# ==============================================================================
set -euo pipefail

STATE_DIR=/var/lib/doable
MARKER="${STATE_DIR}/.initialized"
INSTALL_DIR=/opt/doable
LOG_DIR="${STATE_DIR}/logs"
SETUP_LOG="${LOG_DIR}/setup-server.log"

log() {
    printf '[doable-entrypoint] %s\n' "$*" >&2
}

# Ensure the persistent state directory exists. /var/lib/doable is a docker
# VOLUME, so this is a no-op when the user mounts a named volume / bind.
mkdir -p "${STATE_DIR}" "${LOG_DIR}"
chmod 0755 "${STATE_DIR}"

if [[ -f "${MARKER}" ]]; then
    log "First-boot setup already completed (marker: ${MARKER}). Skipping."
else
    log "First boot detected. Running setup-server.sh in CONTAINER_MODE=1..."
    log "Setup output is tee'd to ${SETUP_LOG}"

    if ! (
        cd "${INSTALL_DIR}" \
        && CONTAINER_MODE=1 \
           INSTALL_DIR="${INSTALL_DIR}" \
           DOABLE_STATE_DIR="${STATE_DIR}" \
           bash setup-server.sh 2>&1 | tee "${SETUP_LOG}"
    ); then
        log "ERROR: setup-server.sh failed. See ${SETUP_LOG} for details."
        log "The container will exit. Fix the underlying issue and re-run."
        log "Last 40 lines of setup log:"
        tail -n 40 "${SETUP_LOG}" >&2 || true
        exit 1
    fi

    # Only mark as initialized after a fully successful run.
    : > "${MARKER}"
    log "First-boot setup completed successfully. Marker created."
fi

log "Handing off to systemd (exec /sbin/init)..."
exec "$@"
