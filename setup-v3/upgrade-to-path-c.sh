#!/usr/bin/env bash
# upgrade-to-path-c.sh
#
# One-shot migration script that brings an existing v2/v3 Doable install
# up to the Path C sandbox posture (per-project UID drop re-enabled via a
# privileged setuid-style wrapper + narrow sudoers rule).
#
# Run on the SERVER, as root, AFTER pulling the latest commit into
# /opt/doable (or wherever APP_DIR points).
#
# Idempotent: running this twice is a clean re-apply, not a failure.
# Reference: servertodo/13-sandbox-path-c.md
set -euo pipefail

# -------------------------------------------------------------------
# Config (override via env if your install lives elsewhere)
# -------------------------------------------------------------------
APP_DIR="${APP_DIR:-/opt/doable}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
SOURCE_DIR="${SOURCE_DIR:-${APP_DIR}/setup-v3}"
WRAPPER_SRC="${SOURCE_DIR}/sandbox-spawn"
SUDOERS_SRC="${SOURCE_DIR}/90-doable-sandbox.sudoers"
WRAPPER_DST="${APP_DIR}/bin/sandbox-spawn"
SUDOERS_DST="/etc/sudoers.d/90-doable-sandbox"
SERVICE_NAME="${SERVICE_NAME:-doable.service}"

# -------------------------------------------------------------------
# Pretty output helpers (no color in case operator is in a dumb tty)
# -------------------------------------------------------------------
phase()  { printf '\n=== %s ===\n' "$*"; }
ok()     { printf '[ ok ] %s\n' "$*"; }
warn()   { printf '[warn] %s\n' "$*" >&2; }
err()    { printf '[ERR ] %s\n' "$*" >&2; exit 1; }

# -------------------------------------------------------------------
# Pre-flight
# -------------------------------------------------------------------
phase "Pre-flight"

if [[ "$(id -u)" -ne 0 ]]; then
  err "This script must run as root (sudo)."
fi

if [[ ! -f "${WRAPPER_SRC}" ]]; then
  err "Wrapper source not found: ${WRAPPER_SRC} — pull the latest commit first."
fi
if [[ ! -f "${SUDOERS_SRC}" ]]; then
  err "Sudoers source not found: ${SUDOERS_SRC} — pull the latest commit first."
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  err "Env file not found: ${ENV_FILE} — is this a Doable install?"
fi
if ! command -v visudo >/dev/null 2>&1; then
  err "visudo not on PATH; refusing to install sudoers without validation."
fi
if ! command -v setpriv >/dev/null 2>&1; then
  warn "setpriv not on PATH; install util-linux. Continuing, but Path C will not function."
fi

ok "Pre-flight checks passed."

# -------------------------------------------------------------------
# Step 1: install wrapper (root:root 0755)
# -------------------------------------------------------------------
phase "Step 1/6  Install sandbox-spawn wrapper"

mkdir -p "$(dirname "${WRAPPER_DST}")"
install -m 0755 -o root -g root "${WRAPPER_SRC}" "${WRAPPER_DST}"
ok "Installed ${WRAPPER_DST} (mode 0755 root:root)"

# -------------------------------------------------------------------
# Step 2: install sudoers rule (root:root 0440) + validate
# -------------------------------------------------------------------
phase "Step 2/6  Install sudoers rule"

# Stage to a tmp file under /etc/sudoers.d to avoid partial writes.
TMP_SUDOERS="$(mktemp /etc/sudoers.d/.90-doable-sandbox.XXXXXX)"
trap 'rm -f "${TMP_SUDOERS}"' EXIT
install -m 0440 -o root -g root "${SUDOERS_SRC}" "${TMP_SUDOERS}"

if ! visudo -c -f "${TMP_SUDOERS}" >/dev/null; then
  rm -f "${TMP_SUDOERS}"
  err "sudoers validation failed for ${SUDOERS_SRC}; aborting (no changes applied)."
fi

mv -f "${TMP_SUDOERS}" "${SUDOERS_DST}"
trap - EXIT
ok "Installed ${SUDOERS_DST} (mode 0440 root:root, visudo OK)"

# -------------------------------------------------------------------
# Step 3: flip DOABLE_DEV_UID_DISABLED=0 in .env (idempotent)
# -------------------------------------------------------------------
phase "Step 3/6  Enable sandbox UID drop in .env"

# Use sed -i.bak so we have a recovery file; remove it on success.
if grep -qE '^DOABLE_DEV_UID_DISABLED=' "${ENV_FILE}"; then
  sed -i.bak -E 's/^DOABLE_DEV_UID_DISABLED=.*/DOABLE_DEV_UID_DISABLED=0/' "${ENV_FILE}"
else
  # Append the flag if missing (preserves the rest of .env).
  cp -p "${ENV_FILE}" "${ENV_FILE}.bak"
  printf '\nDOABLE_DEV_UID_DISABLED=0\n' >> "${ENV_FILE}"
fi

# Verify the line is present and correct.
if ! grep -qE '^DOABLE_DEV_UID_DISABLED=0$' "${ENV_FILE}"; then
  # Rollback from .bak
  if [[ -f "${ENV_FILE}.bak" ]]; then
    mv -f "${ENV_FILE}.bak" "${ENV_FILE}"
  fi
  err "Failed to set DOABLE_DEV_UID_DISABLED=0 in ${ENV_FILE}; rolled back."
fi
rm -f "${ENV_FILE}.bak"
ok "DOABLE_DEV_UID_DISABLED=0 set in ${ENV_FILE}"

# -------------------------------------------------------------------
# Step 4: re-assert .env perms (defense-in-depth — Path C only works
# if .env is unreadable to sandbox UIDs)
# -------------------------------------------------------------------
phase "Step 4/6  Re-assert .env permissions"

ENV_OWNER="$(stat -c '%U:%G' "${ENV_FILE}")"
chmod 0600 "${ENV_FILE}"
ok ".env mode forced to 0600 (owner ${ENV_OWNER})"

# -------------------------------------------------------------------
# Step 5: restart doable.service
# -------------------------------------------------------------------
phase "Step 5/6  Restart ${SERVICE_NAME}"

if systemctl list-unit-files | grep -qE "^${SERVICE_NAME}\b"; then
  systemctl restart "${SERVICE_NAME}"
  ok "Restarted ${SERVICE_NAME}"
else
  warn "${SERVICE_NAME} not found; skipping restart. Restart your API process manually."
fi

# -------------------------------------------------------------------
# Step 6: tail API log for the startup confirmation
# -------------------------------------------------------------------
phase "Step 6/6  Confirm sandbox UID drop is enabled"

# Give the API a moment to print its startup banner.
LOG_OK=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if journalctl -u "${SERVICE_NAME}" --since "1 minute ago" --no-pager 2>/dev/null \
       | grep -qE 'sandbox UID drop:\s*enabled via sudo wrapper'; then
    LOG_OK=1
    break
  fi
  sleep 1
done

if [[ "${LOG_OK}" -eq 1 ]]; then
  ok "API log confirms: sandbox UID drop enabled via sudo wrapper."
else
  warn "Did not see 'sandbox UID drop: enabled' in the last minute of journal."
  warn "Check manually: journalctl -u ${SERVICE_NAME} --since '2 minutes ago' | grep dovault"
fi

# -------------------------------------------------------------------
# Verification checklist (printed for the operator)
# -------------------------------------------------------------------
cat <<'CHECKLIST'

================================================================
  Path C migration complete. Verify:
================================================================

  1. Wrapper:
     ls -l /opt/doable/bin/sandbox-spawn
     # expect: -rwxr-xr-x 1 root root ... sandbox-spawn

  2. Sudoers:
     sudo visudo -c -f /etc/sudoers.d/90-doable-sandbox
     # expect: parsed OK

  3. Wrapper rejects out-of-range UIDs:
     sudo -u doable sudo -n /opt/doable/bin/sandbox-spawn 99 abc /tmp/x
     # expect: refusal

  4. Live preview runs as a sandbox UID (open a project, click Run):
     ps -eo user,pid,cmd | grep -E '(vite|node).*projects/' | grep -v grep
     # expect: USER is a numeric UID in 10001-65000

  5. Sandbox UID cannot read .env:
     sudo -u '#10001' cat /opt/doable/.env
     # expect: Permission denied

  6. API startup log:
     journalctl -u doable.service --since "5 minutes ago" | grep 'sandbox UID drop'
     # expect: enabled via sudo wrapper

Reference: servertodo/13-sandbox-path-c.md
================================================================

CHECKLIST

ok "upgrade-to-path-c.sh complete."
