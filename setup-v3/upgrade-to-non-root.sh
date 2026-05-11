#!/usr/bin/env bash
# upgrade-to-non-root.sh
#
# One-shot migration script that hardens an existing v2 Doable install
# (live shape: /root/doable, doable.service tmux-wrapped, running as root)
# onto a dedicated non-root service user with a hardened systemd drop-in,
# WITHOUT relocating the app and WITHOUT breaking dev-preview sandbox spawn.
#
# Strategy: lighter-touch chown-in-place (Option A variant) rather than
# moving to /srv/doable — keeps blast radius small and is fully reversible
# by removing the drop-in file.
#
# Run on the SERVER, as root, AFTER pulling the latest commit.
# Idempotent: re-running the script converges without errors.
#
# Usage:
#   ./upgrade-to-non-root.sh           # dry-run — print what WOULD happen
#   ./upgrade-to-non-root.sh --apply   # actually mutate state
#   ./upgrade-to-non-root.sh --apply --yes   # skip final restart prompt
#
# Reference: servertodo/02-services-as-root.md
set -euo pipefail

# -------------------------------------------------------------------
# Config (override via env if your install lives elsewhere)
# -------------------------------------------------------------------
APP_DIR="${APP_DIR:-/root/doable}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
SERVICE_NAME="${SERVICE_NAME:-doable.service}"
SERVICE_UNIT="/etc/systemd/system/${SERVICE_NAME}"
DROPIN_DIR="/etc/systemd/system/${SERVICE_NAME}.d"
DROPIN_FILE="${DROPIN_DIR}/10-hardening.conf"
SVC_USER="doable"
SVC_UID="5000"
LOG_DIR="/var/log/doable"

# -------------------------------------------------------------------
# Arg parsing
# -------------------------------------------------------------------
APPLY=0
YES=0
for arg in "$@"; do
  case "${arg}" in
    --apply) APPLY=1 ;;
    --yes)   YES=1 ;;
    --help|-h)
      grep '^# ' "$0" | sed 's/^# //'
      exit 0
      ;;
    *)
      printf '[ERR ] Unknown argument: %s\n' "${arg}" >&2
      exit 1
      ;;
  esac
done

# -------------------------------------------------------------------
# Pretty output helpers (no color — operator may be in a dumb tty)
# -------------------------------------------------------------------
phase()  { printf '\n=== %s ===\n' "$*"; }
ok()     { printf '[ ok ] %s\n' "$*"; }
warn()   { printf '[warn] %s\n' "$*" >&2; }
err()    { printf '[ERR ] %s\n' "$*" >&2; exit 1; }
dry()    { printf '[dry ] WOULD: %s\n' "$*"; }

# -------------------------------------------------------------------
# Rollback bookkeeping.
# If we fail between writing the drop-in (step 6) and daemon-reload
# (step 7), we remove the drop-in and reload so the service falls back
# to the original (root) configuration without disrupting the running
# stack. On success we clear the trap.
# -------------------------------------------------------------------
DROPIN_WRITTEN=0
SUCCESS=0

rollback() {
  local rc=$?
  if [[ "${SUCCESS}" -eq 1 ]]; then
    return 0
  fi
  if [[ "${DROPIN_WRITTEN}" -eq 1 && -f "${DROPIN_FILE}" ]]; then
    warn "Failure detected (rc=${rc}); removing drop-in to restore root-running unit..."
    rm -f "${DROPIN_FILE}"
    rmdir --ignore-fail-on-non-empty "${DROPIN_DIR}" 2>/dev/null || true
    systemctl daemon-reload 2>/dev/null || true
    warn "Drop-in removed. doable.service reverts to its original (root) configuration."
    warn "Investigate the failure above before re-running with --apply."
  else
    warn "Script exited with rc=${rc} before any irreversible changes were made."
  fi
}
trap rollback EXIT

# -------------------------------------------------------------------
# Dry-run banner
# -------------------------------------------------------------------
if [[ "${APPLY}" -eq 0 ]]; then
  printf '\n*** DRY-RUN MODE — no changes will be made. Pass --apply to mutate. ***\n\n'
fi

# -------------------------------------------------------------------
# Pre-flight: root check and required commands
# -------------------------------------------------------------------
phase "Pre-flight"

if [[ "$(id -u)" -ne 0 ]]; then
  err "This script must run as root (sudo)."
fi

for cmd in systemctl systemd-analyze useradd getent find chown chmod stat curl; do
  command -v "${cmd}" >/dev/null 2>&1 || err "Required command not found on PATH: ${cmd}"
done

# Detect v2 install shape: service unit must exist, app dir must be /root/doable.
if [[ ! -f "${SERVICE_UNIT}" ]]; then
  err "Service unit not found: ${SERVICE_UNIT} — is this a v2 Doable install?"
fi
if [[ ! -d "${APP_DIR}" ]]; then
  err "App dir not found: ${APP_DIR} — is this a v2 Doable install? (override with APP_DIR=...)"
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  err "Env file not found: ${ENV_FILE} — is this a Doable install? (override with ENV_FILE=...)"
fi

# Verify the service is currently running as root (or not yet hardened).
CURRENT_USER="$(systemctl show "${SERVICE_NAME}" -p User --value 2>/dev/null || true)"
if [[ "${CURRENT_USER}" == "${SVC_USER}" && -f "${DROPIN_FILE}" ]]; then
  warn "Service already runs as '${SVC_USER}' and drop-in exists at ${DROPIN_FILE}."
  warn "This script is idempotent — re-applying will converge without error."
fi

ok "Pre-flight checks passed (v2 install detected at ${APP_DIR})."

# -------------------------------------------------------------------
# Step 1 — Verify uid=5000 is outside the dev-uid pool (10001–65000)
#          dev-uid-allocator.ts:46-64 reserves that range for sandbox
#          spawns. Our service account MUST NOT fall inside it.
# -------------------------------------------------------------------
phase "Step 1/9  Verify UID ${SVC_UID} is outside dev-uid pool (10001–65000)"

if [[ "${SVC_UID}" -ge 10001 && "${SVC_UID}" -le 65000 ]]; then
  err "UID ${SVC_UID} falls inside the dev-uid sandbox pool (10001–65000). Aborting."
fi
ok "UID ${SVC_UID} is outside dev-uid pool — safe to use for '${SVC_USER}'."

# -------------------------------------------------------------------
# Step 2 — Create system user 'doable' if not already present.
#          uid=5000, no home, no login shell.
# -------------------------------------------------------------------
phase "Step 2/9  Ensure system user '${SVC_USER}' (uid=${SVC_UID}) exists"

if getent passwd "${SVC_USER}" >/dev/null 2>&1; then
  EXISTING_UID="$(id -u "${SVC_USER}")"
  if [[ "${EXISTING_UID}" != "${SVC_UID}" ]]; then
    err "User '${SVC_USER}' already exists with uid=${EXISTING_UID}, expected ${SVC_UID}. Resolve manually."
  fi
  # Earlier versions of this script created the user with /usr/sbin/nologin,
  # which breaks tmux send-keys (start.sh spawns shells inside the tmux
  # session). Repair the shell idempotently so re-run on an older box works.
  EXISTING_SHELL="$(getent passwd "${SVC_USER}" | cut -d: -f7)"
  if [[ "${EXISTING_SHELL}" != "/bin/bash" ]]; then
    if [[ "${APPLY}" -eq 1 ]]; then
      usermod --shell /bin/bash "${SVC_USER}"
      ok "Updated '${SVC_USER}' shell: ${EXISTING_SHELL} → /bin/bash."
    else
      dry "usermod --shell /bin/bash ${SVC_USER}  (current: ${EXISTING_SHELL})"
    fi
  else
    ok "User '${SVC_USER}' already exists with uid=${SVC_UID}, shell=/bin/bash — OK."
  fi
else
  if [[ "${APPLY}" -eq 1 ]]; then
    # When uid > SYS_UID_MAX (default 999), useradd's auto-group allocation
    # fails because it searches only the system GID range. Pre-create the
    # group with an explicit gid so useradd can attach without auto-alloc.
    if ! getent group "${SVC_USER}" >/dev/null 2>&1; then
      groupadd --system -g "${SVC_UID}" "${SVC_USER}"
    fi
    useradd --system --no-create-home --shell /bin/bash \
      -u "${SVC_UID}" -g "${SVC_USER}" "${SVC_USER}"
    ok "Created system user '${SVC_USER}' (uid=${SVC_UID}, shell=/bin/bash)."
  else
    dry "groupadd --system -g ${SVC_UID} ${SVC_USER}"
    dry "useradd --system --no-create-home --shell /bin/bash -u ${SVC_UID} -g ${SVC_USER} ${SVC_USER}"
  fi
fi

# -------------------------------------------------------------------
# Step 3 — Lock down secrets: chmod 600 + chown doable:doable on .env
# -------------------------------------------------------------------
phase "Step 3/9  Lock down ${ENV_FILE}"

if [[ "${APPLY}" -eq 1 ]]; then
  chmod 600 "${ENV_FILE}"
  chown "${SVC_USER}:${SVC_USER}" "${ENV_FILE}"
  ok "Set ${ENV_FILE} to mode 0600, owner ${SVC_USER}:${SVC_USER}."
else
  dry "chmod 600 ${ENV_FILE}"
  dry "chown ${SVC_USER}:${SVC_USER} ${ENV_FILE}"
fi

# -------------------------------------------------------------------
# Step 4 — Recursive chown of /root/doable to doable:doable.
#          Skip node_modules, .next, and .turbo — these get rebuilt on
#          next service restart and are large; chowning them is wasteful
#          and would add minutes on a real install.
# -------------------------------------------------------------------
phase "Step 4/9  Chown ${APP_DIR} → ${SVC_USER}:${SVC_USER} (skipping node_modules)"

if [[ "${APPLY}" -eq 1 ]]; then
  find "${APP_DIR}" \
    -path '*/node_modules' -prune \
    -o -exec chown "${SVC_USER}:${SVC_USER}" {} +
  ok "Chowned ${APP_DIR} to ${SVC_USER}:${SVC_USER} (node_modules skipped)."
else
  dry "find ${APP_DIR} -path '*/node_modules' -prune -o -exec chown ${SVC_USER}:${SVC_USER} {} +"
fi

# -------------------------------------------------------------------
# Step 5 — Ensure log directory exists and is owned by the service user.
# -------------------------------------------------------------------
phase "Step 5/9  Ensure log directory ${LOG_DIR}"

if [[ "${APPLY}" -eq 1 ]]; then
  mkdir -p "${LOG_DIR}"
  chown "${SVC_USER}:${SVC_USER}" "${LOG_DIR}"
  ok "Log directory ${LOG_DIR} created/confirmed, owner ${SVC_USER}:${SVC_USER}."
else
  dry "mkdir -p ${LOG_DIR} && chown ${SVC_USER}:${SVC_USER} ${LOG_DIR}"
fi

# -------------------------------------------------------------------
# Step 6 — Write systemd drop-in with hardening overrides.
#
# Why a drop-in rather than rewriting doable.service wholesale?
# A drop-in is the smallest-blast-radius approach: the base unit stays
# unchanged (so upstream git pulls don't conflict), and removing the
# single file reverts to root-running without any further edits.
#
# Why AmbientCapabilities=CAP_SETUID CAP_SETGID?
# The api process shells out to `setpriv --reuid=<devuid> --regid=<devuid>`
# to drop into per-project sandbox UIDs (pool 10001–65000). As uid=5000
# without capabilities that setpriv call would EPERM. We grant only the
# two caps that setpriv needs: CAP_SETUID and CAP_SETGID. The bounding
# set is clamped to these same two, so no other capabilities can be
# re-acquired via exec. The api can change to any UID, but it cannot
# read /etc/shadow, bind port 80, load kernel modules, or do anything
# else that root's full cap set would have allowed.
#
# Why is MemoryDenyWriteExecute absent (not set to true)?
# Node.js uses a JIT compiler that maps memory pages as both writable
# and executable (W+X). MemoryDenyWriteExecute=true would kill the
# Node process immediately at startup with SIGSYS. The trade-off is
# documented here: revisit once --jitless mode is benchmarked and
# confirmed acceptable for all three services (api, web, ws).
#
# ProtectHome=read-only (not =true) is used because the app lives in
# /root/doable. =true would deny access to /root entirely; read-only
# allows the service to read its own files but cannot write outside
# the explicit ReadWritePaths list.
# -------------------------------------------------------------------
phase "Step 6/9  Write systemd drop-in ${DROPIN_FILE}"

DROPIN_CONTENT="# Managed by upgrade-to-non-root.sh — do not edit by hand.
# To revert: rm ${DROPIN_FILE} && systemctl daemon-reload
[Service]
User=${SVC_USER}
Group=${SVC_USER}

# Give the service a HOME that exists and is writable. doable user was
# created with --no-create-home, so /home/doable does NOT exist on disk;
# pnpm/turbo/next would otherwise try to write caches there and fail.
# /root/doable is in ReadWritePaths and owned by doable, so caches land
# in /root/doable/.cache, /root/doable/.local, etc.
Environment=HOME=${APP_DIR}

# CAP_SETUID + CAP_SETGID: required so the api process can exec setpriv
# to drop into per-project sandbox UIDs (dev-uid pool 10001–65000).
# CapabilityBoundingSet clamps the inherited cap set to exactly these two —
# no other caps can be acquired even via a setuid binary.
AmbientCapabilities=CAP_SETUID CAP_SETGID
CapabilityBoundingSet=CAP_SETUID CAP_SETGID

NoNewPrivileges=true
# ProtectHome=read-only: the app lives in /root/doable; read-only lets the
# service read its own files while blocking writes outside ReadWritePaths.
ProtectHome=read-only
ProtectSystem=strict
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictNamespaces=true
LockPersonality=true
# MemoryDenyWriteExecute is intentionally NOT set to true:
# Node.js JIT maps W+X pages at startup; enabling this directive kills
# all three services immediately with SIGSYS. Revisit when --jitless is
# confirmed acceptable.

ReadWritePaths=${APP_DIR} ${LOG_DIR}
"

if [[ "${APPLY}" -eq 1 ]]; then
  mkdir -p "${DROPIN_DIR}"
  printf '%s' "${DROPIN_CONTENT}" > "${DROPIN_FILE}"
  chmod 644 "${DROPIN_FILE}"
  DROPIN_WRITTEN=1
  ok "Wrote ${DROPIN_FILE} (mode 0644)."
else
  dry "mkdir -p ${DROPIN_DIR}"
  dry "write ${DROPIN_FILE}"
  printf '\n--- drop-in content preview ---\n%s--- end ---\n\n' "${DROPIN_CONTENT}"
fi

# -------------------------------------------------------------------
# Step 7 — Reload systemd so the drop-in takes effect.
# -------------------------------------------------------------------
phase "Step 7/9  systemctl daemon-reload"

if [[ "${APPLY}" -eq 1 ]]; then
  systemctl daemon-reload
  ok "systemd configuration reloaded."
else
  dry "systemctl daemon-reload"
fi

# -------------------------------------------------------------------
# Step 8 — Verify with systemd-analyze: syntax + security score.
# -------------------------------------------------------------------
phase "Step 8/9  Verify unit with systemd-analyze"

if [[ "${APPLY}" -eq 1 ]]; then
  printf '\n-- systemd-analyze verify --\n'
  if systemd-analyze verify "${SERVICE_UNIT}" 2>&1; then
    ok "systemd-analyze verify: no errors."
  else
    warn "systemd-analyze verify reported warnings (see above). Review before restarting."
  fi

  printf '\n-- systemd-analyze security (excerpt) --\n'
  systemd-analyze security "${SERVICE_NAME}" 2>/dev/null || \
    warn "systemd-analyze security not available on this systemd version; skipping."
else
  dry "systemd-analyze verify ${SERVICE_UNIT}"
  dry "systemd-analyze security ${SERVICE_NAME}"
fi

# -------------------------------------------------------------------
# Step 9 — Prompt operator to restart and confirm health.
# -------------------------------------------------------------------
phase "Step 9/9  Restart ${SERVICE_NAME} and confirm health"

DO_RESTART=0
if [[ "${APPLY}" -eq 1 ]]; then
  if [[ "${YES}" -eq 1 ]]; then
    DO_RESTART=1
  else
    printf '\nRestart %s now? [y/N] ' "${SERVICE_NAME}"
    read -r REPLY
    if [[ "${REPLY}" =~ ^[Yy]$ ]]; then
      DO_RESTART=1
    else
      warn "Skipping restart. Run: systemctl restart ${SERVICE_NAME}"
      warn "The new hardening configuration will take effect on next restart."
    fi
  fi
else
  dry "systemctl restart ${SERVICE_NAME} && sleep 8 && curl http://127.0.0.1:\${API_PORT:-3001}/health"
fi

if [[ "${DO_RESTART}" -eq 1 ]]; then
  # Pre-flight: kill any orphan 'doable' tmux session, regardless of owner.
  #
  # Why: switching User= changes the PrivateTmp namespace of the spawned
  # tmux, so a tmux session created under the OLD user is invisible to
  # ExecStop running under the NEW user. Result: orphan tmux survives
  # `systemctl restart`, holds api/ws sockets, and the new tmux can't
  # bind (or the new start.sh's `tmux kill-session -t doable` finds
  # nothing in its own namespace and proceeds to create a duplicate).
  for owner in root "${SVC_USER}"; do
    pkill -9 -u "${owner}" -f 'tmux.*new-session.*-s doable' 2>/dev/null || true
  done
  sleep 1

  systemctl restart "${SERVICE_NAME}"

  # api/ws come up in ~10s (tsx watch, no build). web rebuilds via
  # `pnpm --filter web build` on every start.sh invocation and takes
  # 30-90s. Probe both ports with a polling loop instead of a single
  # sleep, so we trigger the EXIT-trap rollback only if the service
  # *fails*, not when it's merely slow.
  API_PORT="${API_PORT:-$(grep -E '^(API_)?PORT=' "${ENV_FILE}" 2>/dev/null | head -1 | cut -d= -f2- || echo 4000)}"
  WEB_PORT="${WEB_PORT:-3000}"
  DEADLINE=$(( $(date +%s) + 120 ))
  API_OK=0; WEB_OK=0

  ok "Restarted ${SERVICE_NAME}. Polling ${API_PORT}+${WEB_PORT} for up to 120 s..."
  while [[ $(date +%s) -lt ${DEADLINE} ]]; do
    if [[ "${API_OK}" -eq 0 ]] && curl -fsS --max-time 3 "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
      API_OK=1
      ok "api  :${API_PORT}/health → 200"
    fi
    if [[ "${WEB_OK}" -eq 0 ]] && curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:${WEB_PORT}/" 2>/dev/null; then
      WEB_OK=1
      ok "web  :${WEB_PORT}/ → 200"
    fi
    if [[ "${API_OK}" -eq 1 && "${WEB_OK}" -eq 1 ]]; then
      ok "Both services healthy."
      break
    fi
    sleep 3
  done

  if [[ "${API_OK}" -ne 1 || "${WEB_OK}" -ne 1 ]]; then
    warn "Health check timed out after 120 s: api_ok=${API_OK} web_ok=${WEB_OK}."
    warn "Check: journalctl -u ${SERVICE_NAME} -n 80 --no-pager"
    exit 1   # triggers EXIT-trap rollback
  fi
fi

# -------------------------------------------------------------------
# Success — clear rollback trap.
# -------------------------------------------------------------------
SUCCESS=1
trap - EXIT

# -------------------------------------------------------------------
# VERIFY block — exact commands from servertodo/02-services-as-root.md
# -------------------------------------------------------------------
cat <<VERIFY

================================================================
  Non-root migration $([ "${APPLY}" -eq 1 ] && echo "applied" || echo "dry-run — run with --apply to apply").
  Verify on the server:
================================================================

  1. Unit declares the non-root identity and hardening:
     systemctl show doable.service -p User,Group,AmbientCapabilities,CapabilityBoundingSet,NoNewPrivileges,ProtectSystem,ProtectHome,PrivateTmp
     # Expect: User=doable Group=doable NoNewPrivileges=yes ProtectSystem=strict ...

  2. All three long-lived processes run as '${SVC_USER}':
     ps -eo pid,user,cmd | grep -E 'tsx watch|next-server|node .*ws/dist' | grep -v grep
     # Expect: USER column = ${SVC_USER} on every row

  3. OS account exists and is locked-down:
     getent passwd ${SVC_USER}
     # Expect: ${SVC_USER}:x:${SVC_UID}:${SVC_UID}::/nonexistent:/bin/bash

  4. Per-project sandbox UID drop still works (open a project preview in UI, then):
     ps -ef | grep -E 'vite.*projects/' | grep -v grep
     # Expect: UID column in 10001..65000 (NOT 5000, NOT 0)

  5. Secrets locked down (not world-readable):
     stat -c '%a %U:%G %n' ${ENV_FILE}
     # Expect: 600 ${SVC_USER}:${SVC_USER} ${ENV_FILE}

  6. Drop-in is present and owns its content:
     cat ${DROPIN_FILE}

  7. Nothing on /root is opened outside ${APP_DIR} by the api process:
     lsof -p "\$(pgrep -f 'tsx watch.*services/api')" | grep -E '/root/' | grep -v '${APP_DIR}' || echo "clean"
     # Expect: clean

  Rollback (if needed):
     rm ${DROPIN_FILE}
     systemctl daemon-reload
     systemctl restart ${SERVICE_NAME}

  Reference: servertodo/02-services-as-root.md
================================================================

VERIFY

ok "upgrade-to-non-root.sh complete."
