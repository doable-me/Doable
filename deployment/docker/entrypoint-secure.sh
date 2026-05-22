#!/usr/bin/env bash
# ==============================================================================
# Doable — Secure-image entrypoint
# ==============================================================================
# PID 0 wrapper for docker/Dockerfile.secure. Just exec's /sbin/init so systemd
# takes over as PID 1 immediately. The actual first-boot setup (running
# setup-server.sh in CONTAINER_MODE=1) happens later in a systemd one-shot
# unit (doable-init.service) AFTER postgresql.service is up — that way every
# `systemctl ...` call inside setup-server.sh executes against a live bus.
#
# State path: /var/lib/doable (mounted as a docker volume — survives restarts).
# ==============================================================================
set -euo pipefail

STATE_DIR=/var/lib/doable
LOG_DIR="${STATE_DIR}/logs"

mkdir -p "${STATE_DIR}" "${LOG_DIR}"
chmod 0755 "${STATE_DIR}"

printf '[doable-entrypoint] handing off to systemd as PID 1\n' >&2
exec "$@"
