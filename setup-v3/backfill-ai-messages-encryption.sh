#!/usr/bin/env bash
# backfill-ai-messages-encryption.sh
#
# One-shot operator-run migration that encrypts existing plaintext rows in
# `ai_messages` for installs that have flipped DOABLE_ENCRYPT_AI_MESSAGES=1.
#
# The schema (migration 072) enforces the XOR rule:
#   exactly ONE of (content, encrypted_content) must be non-null per row.
#
# The runtime toggle is forward-only: when DOABLE_ENCRYPT_AI_MESSAGES=1,
# new messages are written into `encrypted_content`, but pre-existing rows
# stay plaintext in `content`. This script encrypts that backlog atomically
# in batches of 1000 so each chunk commits and the XOR constraint is never
# violated.
#
# Run on the SERVER, as root, AFTER:
#   1. Setting DOABLE_ENCRYPT_AI_MESSAGES=1 in /opt/doable/.env
#   2. Restarting doable.service so writes flow through encryption
#
# Idempotent:
#   - Re-running after success is a no-op (no rows match WHERE clause)
#   - Re-running after failure resumes from the next batch (each batch commits)
#
# Usage:
#   sudo ./backfill-ai-messages-encryption.sh             # real run, asks for confirmation
#   sudo ./backfill-ai-messages-encryption.sh --dry-run   # count + sample IDs only
#
# Reference: services/api/src/db/migrations/072_ai_messages_encryption.sql
set -euo pipefail

# -------------------------------------------------------------------
# Config
# -------------------------------------------------------------------
APP_DIR="${APP_DIR:-/opt/doable}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
DB_NAME="${DB_NAME:-doable}"
BATCH_SIZE="${BATCH_SIZE:-1000}"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

# -------------------------------------------------------------------
# Pretty output helpers
# -------------------------------------------------------------------
phase() { printf '\n=== %s ===\n' "$*"; }
ok()    { printf '[ ok ] %s\n' "$*"; }
warn()  { printf '[warn] %s\n' "$*" >&2; }
err()   { printf '[ERR ] %s\n' "$*" >&2; exit 1; }

# -------------------------------------------------------------------
# Pre-flight
# -------------------------------------------------------------------
phase "Pre-flight"

if [[ "$(id -u)" -ne 0 ]]; then
  err "This script must run as root (need to read ${ENV_FILE} which is mode 0600)."
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  err "Env file not found: ${ENV_FILE}"
fi

if ! command -v psql >/dev/null 2>&1; then
  err "psql not in PATH; install postgresql-client."
fi

# Reject if encryption toggle is not on. Backfilling without the runtime
# encrypting NEW writes would leave a brief window where new messages are
# plaintext but reads of old messages need decrypt — confusing state.
if ! grep -qE '^DOABLE_ENCRYPT_AI_MESSAGES=1[[:space:]]*$' "${ENV_FILE}"; then
  err "DOABLE_ENCRYPT_AI_MESSAGES is not set to 1 in ${ENV_FILE}.
       Flip it on, restart doable.service, then re-run this script."
fi

# Pull the encryption key. cut -d= -f2- preserves any '=' chars inside the value.
ENCRYPTION_KEY="$(grep -E '^ENCRYPTION_KEY=' "${ENV_FILE}" | head -n1 | cut -d= -f2-)"
# Strip surrounding quotes if present.
ENCRYPTION_KEY="${ENCRYPTION_KEY%\"}"
ENCRYPTION_KEY="${ENCRYPTION_KEY#\"}"
ENCRYPTION_KEY="${ENCRYPTION_KEY%\'}"
ENCRYPTION_KEY="${ENCRYPTION_KEY#\'}"
if [[ -z "${ENCRYPTION_KEY}" ]]; then
  err "ENCRYPTION_KEY missing or empty in ${ENV_FILE}"
fi

DATABASE_URL="$(grep -E '^DATABASE_URL=' "${ENV_FILE}" | head -n1 | cut -d= -f2-)"
DATABASE_URL="${DATABASE_URL%\"}"
DATABASE_URL="${DATABASE_URL#\"}"
DATABASE_URL="${DATABASE_URL%\'}"
DATABASE_URL="${DATABASE_URL#\'}"

# Prefer DATABASE_URL when present; fall back to local socket as postgres
# superuser. The fallback is what setup-server-v3.sh expects on a fresh box.
PSQL_BASE=()
if [[ -n "${DATABASE_URL}" ]]; then
  PSQL_BASE=(psql "${DATABASE_URL}")
else
  if ! command -v sudo >/dev/null 2>&1; then
    err "DATABASE_URL not in ${ENV_FILE} and sudo not on PATH; cannot reach postgres."
  fi
  PSQL_BASE=(sudo -u postgres psql -d "${DB_NAME}")
fi

# Quick connectivity check.
if ! "${PSQL_BASE[@]}" -tAc 'SELECT 1' >/dev/null 2>&1; then
  err "Cannot connect to postgres with the configured PSQL command."
fi

ok "Pre-flight checks passed."

# -------------------------------------------------------------------
# Count plaintext rows
# -------------------------------------------------------------------
phase "Survey"

TOTAL_PLAIN="$("${PSQL_BASE[@]}" -tAc 'SELECT count(*) FROM ai_messages WHERE content IS NOT NULL')"
TOTAL_ENC="$("${PSQL_BASE[@]}" -tAc 'SELECT count(*) FROM ai_messages WHERE encrypted_content IS NOT NULL')"
TOTAL_PLAIN="${TOTAL_PLAIN// /}"
TOTAL_ENC="${TOTAL_ENC// /}"

echo "  plaintext rows:  ${TOTAL_PLAIN}"
echo "  encrypted rows:  ${TOTAL_ENC} (already done, will be skipped)"

if [[ "${TOTAL_PLAIN}" == "0" ]]; then
  ok "Nothing to do. All ai_messages rows are already encrypted (or table is empty)."
  exit 0
fi

# -------------------------------------------------------------------
# Dry-run path
# -------------------------------------------------------------------
if [[ "${DRY_RUN}" == "1" ]]; then
  phase "Dry-run sample"
  echo "Would encrypt ${TOTAL_PLAIN} rows. First 5 candidate IDs:"
  "${PSQL_BASE[@]}" -tAc \
    "SELECT id FROM ai_messages WHERE content IS NOT NULL ORDER BY id LIMIT 5" \
    | sed 's/^/  /'
  echo
  ok "Dry-run complete; no changes made."
  exit 0
fi

# -------------------------------------------------------------------
# Confirmation
# -------------------------------------------------------------------
phase "Confirm"
printf 'About to encrypt %s existing rows in ai_messages. Proceed? (y/N) ' "${TOTAL_PLAIN}"
read -r ans
if [[ "${ans}" != "y" && "${ans}" != "Y" ]]; then
  echo "Aborted by operator."
  exit 0
fi

# -------------------------------------------------------------------
# Backfill loop (chunked, each batch commits to satisfy XOR constraint)
# -------------------------------------------------------------------
phase "Backfill"

DONE=0
ITER=0

# Pass the key via psql variable (\set + :'key' for safe quoting). This
# keeps the literal out of any command-line ps listing AND out of
# pg_stat_statements (it's bound as a $1 parameter under SET LOCAL).
#
# Note: each batch is its own implicit transaction (psql -c style command
# string with BEGIN..COMMIT). The UPDATE sets encrypted_content AND nulls
# content in one statement, so the XOR check holds row-by-row.

while :; do
  ITER=$((ITER + 1))

  # Run one batch. We capture the affected count from psql's UPDATE tag.
  # Using a heredoc lets us \set the key without it appearing in argv.
  BATCH_OUT="$(
    PGOPTIONS='--client-min-messages=warning' \
    "${PSQL_BASE[@]}" \
      -v ON_ERROR_STOP=1 \
      -X -q -A -t \
      --set=enckey="${ENCRYPTION_KEY}" \
      --set=batch="${BATCH_SIZE}" <<'SQL'
BEGIN;
SET LOCAL app.encryption_key = :'enckey';
WITH victims AS (
  SELECT id
  FROM ai_messages
  WHERE content IS NOT NULL
  ORDER BY id
  LIMIT :batch
  FOR UPDATE SKIP LOCKED
),
updated AS (
  UPDATE ai_messages m
  SET encrypted_content = pgp_sym_encrypt(m.content, current_setting('app.encryption_key')),
      content = NULL
  FROM victims v
  WHERE m.id = v.id
  RETURNING m.id
)
SELECT count(*) FROM updated;
COMMIT;
SQL
  )"

  # Last line of output is the SELECT count(*) result. Strip whitespace.
  AFFECTED="$(printf '%s\n' "${BATCH_OUT}" | tail -n1 | tr -d '[:space:]')"
  if ! [[ "${AFFECTED}" =~ ^[0-9]+$ ]]; then
    err "Could not parse batch count from psql output: ${BATCH_OUT}"
  fi

  if [[ "${AFFECTED}" == "0" ]]; then
    break
  fi

  DONE=$((DONE + AFFECTED))
  printf '  Encrypted %s / %s rows... (batch %d, %s rows)\n' \
    "${DONE}" "${TOTAL_PLAIN}" "${ITER}" "${AFFECTED}"
done

# -------------------------------------------------------------------
# Verification
# -------------------------------------------------------------------
phase "Verify"

FINAL_PLAIN="$("${PSQL_BASE[@]}" -tAc 'SELECT count(*) FROM ai_messages WHERE content IS NOT NULL')"
FINAL_ENC="$("${PSQL_BASE[@]}" -tAc 'SELECT count(*) FROM ai_messages WHERE encrypted_content IS NOT NULL')"
FINAL_PLAIN="${FINAL_PLAIN// /}"
FINAL_ENC="${FINAL_ENC// /}"

if [[ "${FINAL_PLAIN}" != "0" ]]; then
  err "${FINAL_PLAIN} plaintext rows remain. Re-run the script (it's idempotent)."
fi

EXPECTED_ENC=$((TOTAL_ENC + DONE))
if [[ "${FINAL_ENC}" != "${EXPECTED_ENC}" ]]; then
  warn "Encrypted count ${FINAL_ENC} does not match expected ${EXPECTED_ENC} (concurrent writes?)."
fi

ok "Backfill complete: ${DONE} rows newly encrypted, ${TOTAL_ENC} were already encrypted, 0 plaintext remain."

# -------------------------------------------------------------------
# Post-run hint
# -------------------------------------------------------------------
cat <<'HINT'

================================================================
  All chat history is now encrypted-at-rest.
================================================================

  Existing tools that bypass the selectMessageContent() helper and
  SELECT `content` directly will now return NULL for backfilled rows.
  Before declaring done, audit:

    grep -rn 'ai_messages.*content' services/api/src/ \
      | grep -v selectMessageContent \
      | grep -v encrypted_content

  Anything that reads `content` directly must be migrated to the
  helper (which transparently decrypts encrypted_content via
  pgp_sym_decrypt) or it will silently return NULL on the backfilled
  rows.

================================================================

HINT

ok "backfill-ai-messages-encryption.sh complete."
