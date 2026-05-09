#!/usr/bin/env bash
# upgrade-to-peer-auth.sh
#
# One-shot migration script that brings an existing v3 Doable install (which
# was provisioned BEFORE peer-auth-default-on, i.e. with a password-based
# DATABASE_URL) up to the new posture: Postgres peer auth via Unix socket,
# no DB password in the API runtime environment.
#
# New installs already get this via setup-v3/setup-server-v3.sh Phase 4.
# This script is for existing installs only.
#
# Run on the SERVER, as root, AFTER pulling the latest commit into
# /opt/doable (or wherever APP_DIR points).
#
# Idempotent: running this twice is a clean no-op. On any failure after
# the pg_hba.conf or .env edits, the original files are restored.
#
# Reference: servertodo/10 §3c, setup-v3/setup-server-v3.sh Phase 4
set -euo pipefail

# -------------------------------------------------------------------
# Config (override via env if your install lives elsewhere)
# -------------------------------------------------------------------
APP_DIR="${APP_DIR:-/opt/doable}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
SERVICE_NAME="${SERVICE_NAME:-doable.service}"
DB_USER="${DB_USER:-doable}"
DB_NAME="${DB_NAME:-doable}"
PG_SOCKET_DIR="${PG_SOCKET_DIR:-/var/run/postgresql}"
SENTINEL='# doable-peer-auth-managed'

# -------------------------------------------------------------------
# Pretty output (no color — operator may be in a dumb tty)
# -------------------------------------------------------------------
phase()  { printf '\n=== %s ===\n' "$*"; }
ok()     { printf '[ ok ] %s\n' "$*"; }
warn()   { printf '[warn] %s\n' "$*" >&2; }
err()    { printf '[ERR ] %s\n' "$*" >&2; exit 1; }

# -------------------------------------------------------------------
# Rollback bookkeeping. We snapshot pg_hba.conf and .env BEFORE any
# edits to /tmp, and an EXIT trap restores them on any non-zero exit
# (including set -e early termination). On success we clear the trap.
# -------------------------------------------------------------------
PG_HBA_BAK=""
ENV_BAK=""
SUCCESS=0

rollback() {
  local rc=$?
  if [[ "${SUCCESS}" -eq 1 ]]; then
    return 0
  fi
  warn "Failure detected (rc=${rc}); attempting rollback..."
  if [[ -n "${ENV_BAK}" && -f "${ENV_BAK}" ]]; then
    if cp -p "${ENV_BAK}" "${ENV_FILE}"; then
      warn "Restored ${ENV_FILE} from ${ENV_BAK}"
    else
      warn "FAILED to restore ${ENV_FILE} from ${ENV_BAK} — manual recovery required."
    fi
  fi
  if [[ -n "${PG_HBA_BAK}" && -f "${PG_HBA_BAK}" && -n "${PG_HBA:-}" ]]; then
    if cp -p "${PG_HBA_BAK}" "${PG_HBA}"; then
      warn "Restored ${PG_HBA} from ${PG_HBA_BAK}"
      systemctl reload postgresql@16-main 2>/dev/null \
        || systemctl reload postgresql 2>/dev/null \
        || warn "Could not reload Postgres after pg_hba.conf rollback — reload manually."
    else
      warn "FAILED to restore ${PG_HBA} from ${PG_HBA_BAK} — manual recovery required."
    fi
  fi
  warn "Rollback complete. Investigate the failure above before re-running."
}
trap rollback EXIT

# -------------------------------------------------------------------
# Pre-flight
# -------------------------------------------------------------------
phase "Pre-flight"

if [[ "$(id -u)" -ne 0 ]]; then
  err "This script must run as root (sudo)."
fi

for cmd in psql systemctl sed grep awk id; do
  command -v "${cmd}" >/dev/null 2>&1 || err "Required command not found on PATH: ${cmd}"
done

if ! id -u "${DB_USER}" >/dev/null 2>&1; then
  err "OS user '${DB_USER}' does not exist. Peer auth maps OS uid → DB role; create the user first (setup-server-v3.sh handles this)."
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  err "Env file not found: ${ENV_FILE} — is this a Doable install? (override with ENV_FILE=...)"
fi

# Locate pg_hba.conf
PG_HBA=""
if [[ -f /etc/postgresql/16/main/pg_hba.conf ]]; then
  PG_HBA="/etc/postgresql/16/main/pg_hba.conf"
else
  # Fallback: ask Postgres directly. Requires a working Postgres install.
  PG_HBA="$(sudo -u postgres psql -tAc 'SHOW hba_file' 2>/dev/null | tr -d '[:space:]' || true)"
fi
if [[ -z "${PG_HBA}" || ! -f "${PG_HBA}" ]]; then
  err "Could not locate pg_hba.conf (tried /etc/postgresql/16/main/pg_hba.conf and 'SHOW hba_file'). Is Postgres installed and running?"
fi
ok "Located pg_hba.conf: ${PG_HBA}"

# Verify postgres data dir is reachable (cheap sanity check)
if ! sudo -u postgres psql -tAc 'SELECT 1' >/dev/null 2>&1; then
  err "Cannot connect to Postgres as the 'postgres' superuser via socket. Is postgresql@16-main running?"
fi
ok "Postgres reachable as superuser via socket"

# Check current DATABASE_URL — if it's already in peer form, we have nothing to do
# at the .env level (but pg_hba.conf may still need fixing on a partial run).
CURRENT_DB_URL="$(grep -E '^DATABASE_URL=' "${ENV_FILE}" | head -1 | cut -d= -f2- || true)"
if [[ -z "${CURRENT_DB_URL}" ]]; then
  err "No DATABASE_URL line in ${ENV_FILE}; cannot determine current auth mode."
fi

ENV_ALREADY_PEER=0
if [[ "${CURRENT_DB_URL}" == "postgres:///${DB_NAME}?host=${PG_SOCKET_DIR}" ]]; then
  ok "DATABASE_URL is already in peer-auth form — .env edit will be skipped."
  ENV_ALREADY_PEER=1
elif [[ "${CURRENT_DB_URL}" =~ ^postgres://${DB_USER}:[^@]+@(localhost|127\.0\.0\.1):5432/${DB_NAME}$ ]]; then
  ok "DATABASE_URL is in password form — will be migrated to peer auth."
else
  err "DATABASE_URL has an unexpected shape: ${CURRENT_DB_URL}
Expected one of:
  postgres://${DB_USER}:<hex>@localhost:5432/${DB_NAME}   (password, will be migrated)
  postgres:///${DB_NAME}?host=${PG_SOCKET_DIR}            (already peer, no-op)
Aborting to avoid clobbering a custom DSN."
fi

ok "Pre-flight checks passed."

# -------------------------------------------------------------------
# Step 1: snapshot pg_hba.conf and .env to /tmp BEFORE any edits.
# -------------------------------------------------------------------
phase "Step 1/5  Snapshot pg_hba.conf and .env"

PG_HBA_BAK="$(mktemp /tmp/pg_hba.conf.bak.XXXXXX)"
cp -p "${PG_HBA}" "${PG_HBA_BAK}"
ok "Snapshotted ${PG_HBA} -> ${PG_HBA_BAK}"

ENV_BAK="$(mktemp /tmp/doable.env.bak.XXXXXX)"
cp -p "${ENV_FILE}" "${ENV_BAK}"
ok "Snapshotted ${ENV_FILE} -> ${ENV_BAK}"

# -------------------------------------------------------------------
# Step 2: add the peer-auth line to pg_hba.conf (idempotent via sentinel).
# -------------------------------------------------------------------
phase "Step 2/5  Patch pg_hba.conf for peer auth"

if grep -qF "${SENTINEL}" "${PG_HBA}"; then
  ok "Sentinel '${SENTINEL}' already present — skipping pg_hba.conf edit."
else
  # Insert before the first 'local all all ...' rule. If no such rule
  # exists (very unusual), we append at end of file.
  if grep -qE '^[[:space:]]*local[[:space:]]+all[[:space:]]+all' "${PG_HBA}"; then
    sed -i "/^[[:space:]]*local[[:space:]]\+all[[:space:]]\+all/i\\
${SENTINEL}\\
local   ${DB_NAME}          ${DB_USER}                                  peer
" "${PG_HBA}"
  else
    {
      printf '\n%s\n' "${SENTINEL}"
      printf 'local   %s          %s                                  peer\n' "${DB_NAME}" "${DB_USER}"
    } >> "${PG_HBA}"
  fi
  # Verify the sentinel and rule landed.
  if ! grep -qF "${SENTINEL}" "${PG_HBA}"; then
    err "pg_hba.conf edit did not take effect (sentinel missing). Aborting."
  fi
  if ! grep -qE "^local[[:space:]]+${DB_NAME}[[:space:]]+${DB_USER}[[:space:]]+peer" "${PG_HBA}"; then
    err "pg_hba.conf edit did not take effect (peer rule missing). Aborting."
  fi
  ok "Inserted peer-auth rule into ${PG_HBA}"
fi

# Reload Postgres (try @16-main first, then generic).
if systemctl reload postgresql@16-main 2>/dev/null; then
  ok "Reloaded postgresql@16-main"
elif systemctl reload postgresql 2>/dev/null; then
  ok "Reloaded postgresql"
elif sudo -u postgres pg_ctl reload 2>/dev/null; then
  ok "Reloaded Postgres via pg_ctl"
else
  err "Could not reload Postgres. Reload manually and re-run."
fi

# -------------------------------------------------------------------
# Step 3: test peer auth works — sudo -u doable psql -d doable -c "SELECT 1"
# -------------------------------------------------------------------
phase "Step 3/5  Verify peer auth"

if sudo -u "${DB_USER}" psql -d "${DB_NAME}" -tAc 'SELECT 1' >/dev/null 2>&1; then
  ok "Peer auth works: sudo -u ${DB_USER} psql -d ${DB_NAME} succeeded"
else
  err "Peer auth test failed: sudo -u ${DB_USER} psql -d ${DB_NAME} -c 'SELECT 1' did not succeed.
Check that:
  - The DB role '${DB_USER}' exists and can log in
  - The OS user '${DB_USER}' exists (id -u ${DB_USER})
  - pg_hba.conf shows the peer rule above the catch-all 'local all all'
Will roll back pg_hba.conf via EXIT trap."
fi

# -------------------------------------------------------------------
# Step 4: rewrite DATABASE_URL in .env (skip if already peer).
# -------------------------------------------------------------------
phase "Step 4/5  Rewrite DATABASE_URL in ${ENV_FILE}"

if [[ "${ENV_ALREADY_PEER}" -eq 1 ]]; then
  ok ".env already peer form — skipping rewrite."
else
  NEW_DSN="DATABASE_URL=postgres:///${DB_NAME}?host=${PG_SOCKET_DIR}"
  # sed -i.bak gives us a per-file backup file we can verify against;
  # we already have the /tmp snapshot for full rollback.
  sed -i.bak -E "s|^DATABASE_URL=postgres://${DB_USER}:[^@]+@(localhost\|127\.0\.0\.1):5432/${DB_NAME}\$|${NEW_DSN}|" "${ENV_FILE}"

  # Verify exactly one DATABASE_URL line, and it's the new peer form.
  NEW_LINE_COUNT="$(grep -cE "^DATABASE_URL=" "${ENV_FILE}" || true)"
  if [[ "${NEW_LINE_COUNT}" -ne 1 ]]; then
    err "Expected exactly 1 DATABASE_URL line in ${ENV_FILE} after edit, found ${NEW_LINE_COUNT}. Will roll back."
  fi
  if ! grep -qF "${NEW_DSN}" "${ENV_FILE}"; then
    err "DATABASE_URL rewrite did not take effect. Will roll back."
  fi
  # Both verifications passed — drop the per-file .bak (we still have /tmp snapshot).
  rm -f "${ENV_FILE}.bak"
  ok "Rewrote DATABASE_URL to peer form: ${NEW_DSN}"
fi

# Permissions: re-assert 0600 on .env (defense in depth — should already be 0600).
chmod 0600 "${ENV_FILE}"
ok ".env mode forced to 0600"

# -------------------------------------------------------------------
# Step 5: restart doable.service and confirm API came up on the new DSN.
# -------------------------------------------------------------------
phase "Step 5/5  Restart ${SERVICE_NAME} and confirm API startup"

if systemctl list-unit-files | grep -qE "^${SERVICE_NAME}\b"; then
  systemctl restart "${SERVICE_NAME}"
  ok "Restarted ${SERVICE_NAME}"
else
  warn "${SERVICE_NAME} not found; restart your API process manually after this script exits."
fi

# Tail journal for a startup confirmation. We accept any of several
# common phrases that the API/migrate step prints on a healthy boot.
LOG_OK=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if journalctl -u "${SERVICE_NAME}" --since "1 minute ago" --no-pager 2>/dev/null \
       | grep -qiE 'database connected|api ready|listening on|migrations? (complete|applied|up to date)'; then
    LOG_OK=1
    break
  fi
  sleep 1
done

if [[ "${LOG_OK}" -eq 1 ]]; then
  ok "API journal shows a healthy startup line — peer-auth DSN works."
else
  warn "Did not see a startup confirmation in the last minute of journal."
  warn "Check manually: journalctl -u ${SERVICE_NAME} --since '2 minutes ago' --no-pager"
  warn "If the API is failing to connect, you can roll back manually (see hints below)."
fi

# -------------------------------------------------------------------
# Success — clear the rollback trap and print operator hints.
# -------------------------------------------------------------------
SUCCESS=1
trap - EXIT

# Clean up snapshots only on success. Keep them on failure for forensics.
rm -f "${PG_HBA_BAK}" "${ENV_BAK}"

cat <<HINTS

================================================================
  Peer-auth migration complete.
================================================================

Peer auth is now active. The DB password is no longer in
${ENV_FILE}.

What changed:
  - ${PG_HBA}
      added rule (tagged '${SENTINEL}'):
        local   ${DB_NAME}   ${DB_USER}   peer
  - ${ENV_FILE}
      DATABASE_URL is now: postgres:///${DB_NAME}?host=${PG_SOCKET_DIR}

If you need to roll back:
  1. Edit ${ENV_FILE} and set DATABASE_URL back to:
       DATABASE_URL=postgres://${DB_USER}:<hex>@localhost:5432/${DB_NAME}
     The password is preserved in /etc/doable/.db_pass — read it with:
       sudo cat /etc/doable/.db_pass
  2. Remove the line tagged '${SENTINEL}' (and the
     'local ${DB_NAME} ${DB_USER} peer' rule directly below it) from:
       ${PG_HBA}
  3. Reload Postgres:
       systemctl reload postgresql@16-main
  4. Restart the API:
       systemctl restart ${SERVICE_NAME}

Reference: servertodo/10 §3c
================================================================

HINTS

ok "upgrade-to-peer-auth.sh complete."
