#!/usr/bin/env bash
# rotate-secrets.sh
#
# Operator-run script to rotate JWT_SECRET, INTERNAL_SECRET, and/or
# ENCRYPTION_KEY in the Doable .env file.  Must be run ON the server as root.
#
# Usage:
#   ./rotate-secrets.sh jwt          # rotate JWT_SECRET (invalidates all sessions)
#   ./rotate-secrets.sh internal     # rotate INTERNAL_SECRET (restart required)
#   ./rotate-secrets.sh encryption   # emit SQL migration + update key in .env
#   ./rotate-secrets.sh all          # safe order: internal → jwt → encryption
#
# Dry-run mode (default): shows what would change without touching any file.
# Apply mode:             --apply flag actually mutates .env and writes backups.
#
# For ENCRYPTION_KEY rotation you MUST also supply:
#   OLD_KEY=<current key value>  NEW_KEY=<desired new key value>
# as environment variables.  The script emits a SQL migration file but does
# NOT execute it — inspect and run via: psql -f <path>
#
# Reference code paths (confirmed by grep):
#   JWT_SECRET      → services/api/src/lib/secrets.ts (exported JWT_SECRET)
#                     services/api/src/lib/jwt.ts      (signing + verify)
#   INTERNAL_SECRET → services/api/src/lib/secrets.ts (exported INTERNAL_SECRET)
#                     services/api/src/routes/internal.ts (X-Internal-Secret gate)
#                     services/api/src/ai/yjs-bridge.ts  (WS→API calls)
#   ENCRYPTION_KEY  → services/api/src/lib/secrets.ts (exported ENCRYPTION_KEY)
#                     services/api/src/integrations/credential-vault.ts
#                     services/api/src/routes/ai-settings-providers.ts
#                     + 15 other call sites using pgp_sym_encrypt/decrypt
set -euo pipefail

# -------------------------------------------------------------------
# Config
# -------------------------------------------------------------------
DOABLE_HOME="${DOABLE_HOME:-/root/doable}"
ENV_FILE="${DOABLE_HOME}/.env"
BACKUP_DIR="/var/backups/doable"
DB_NAME="${DB_NAME:-doable}"

APPLY=0
SUBCOMMAND=""

# -------------------------------------------------------------------
# Argument parsing
# -------------------------------------------------------------------
for arg in "$@"; do
  case "${arg}" in
    --apply) APPLY=1 ;;
    jwt|internal|encryption|all) SUBCOMMAND="${arg}" ;;
    *)
      printf '[ERR ] Unknown argument: %s\n' "${arg}" >&2
      printf 'Usage: %s {jwt|internal|encryption|all} [--apply]\n' "$0" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${SUBCOMMAND}" ]]; then
  printf '[ERR ] Subcommand required: jwt | internal | encryption | all\n' >&2
  printf 'Usage: %s {jwt|internal|encryption|all} [--apply]\n' "$0" >&2
  exit 1
fi

# -------------------------------------------------------------------
# Pretty output helpers
# -------------------------------------------------------------------
phase() { printf '\n=== %s ===\n' "$*"; }
ok()    { printf '[ ok ] %s\n' "$*"; }
warn()  { printf '[warn] %s\n' "$*" >&2; }
err()   { printf '[ERR ] %s\n' "$*" >&2; exit 1; }
dry()   { printf '[dry ] %s\n' "$*"; }

if [[ "${APPLY}" == "0" ]]; then
  warn "DRY-RUN mode — no files will be changed.  Pass --apply to mutate."
fi

# -------------------------------------------------------------------
# Pre-flight
# -------------------------------------------------------------------
phase "Pre-flight"

if [[ "$(id -u)" -ne 0 ]]; then
  err "This script must run as root (needs to read/write ${ENV_FILE} mode 0600)."
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  err "Env file not found: ${ENV_FILE}"
fi

if ! command -v openssl >/dev/null 2>&1; then
  err "openssl not in PATH."
fi

ok "Pre-flight checks passed."

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

# Generate a 64-char URL-safe secret.
gen_secret() {
  openssl rand -base64 48 | tr -d '\n' | head -c 64
}

# Read current value of a key from .env (strips surrounding quotes).
read_env_val() {
  local key="$1"
  local raw
  raw="$(grep -E "^${key}=" "${ENV_FILE}" | head -n1 | cut -d= -f2-)"
  raw="${raw%\"}" ; raw="${raw#\"}"
  raw="${raw%\'}" ; raw="${raw#\'}"
  printf '%s' "${raw}"
}

# Atomically replace a key=value line in .env preserving mode 600 + owner.
write_env_val() {
  local key="$1"
  local new_val="$2"
  local tmp
  tmp="$(mktemp "${ENV_FILE}.XXXXXXXX")"

  # Preserve permissions on the temp file before writing sensitive data.
  chmod 600 "${tmp}"
  chown "$(stat -c '%u:%g' "${ENV_FILE}")" "${tmp}" 2>/dev/null || true

  # Replace or append the key.
  if grep -qE "^${key}=" "${ENV_FILE}"; then
    sed "s|^${key}=.*|${key}=${new_val}|" "${ENV_FILE}" > "${tmp}"
  else
    cp "${ENV_FILE}" "${tmp}"
    printf '%s=%s\n' "${key}" "${new_val}" >> "${tmp}"
  fi

  mv "${tmp}" "${ENV_FILE}"
}

# Timestamped backup of .env to BACKUP_DIR.
backup_env() {
  local ts
  ts="$(date +%Y%m%d%H%M%S)"
  local dest="${BACKUP_DIR}/env-${ts}"

  if [[ "${APPLY}" == "1" ]]; then
    mkdir -p "${BACKUP_DIR}"
    chmod 0700 "${BACKUP_DIR}"
    cp "${ENV_FILE}" "${dest}"
    chmod 0600 "${dest}"
    ok "Backed up .env → ${dest}"
  else
    dry "Would back up .env → ${BACKUP_DIR}/env-${ts}"
  fi
}

# Print first-6 preview of a secret (safe for audit logs).
preview() { printf '%.6s…' "$1"; }

# -------------------------------------------------------------------
# Rotation functions
# -------------------------------------------------------------------

rotate_jwt() {
  phase "JWT_SECRET rotation"
  warn "⚠  Rotating JWT_SECRET invalidates ALL active user sessions immediately."
  warn "   Users will be logged out and must re-authenticate."
  warn "   Restart: doable API (window 'api' in tmux doable session)."

  local old_val new_val
  old_val="$(read_env_val JWT_SECRET)"
  if [[ -z "${old_val}" ]]; then
    err "JWT_SECRET not found in ${ENV_FILE}"
  fi
  new_val="$(gen_secret)"

  printf '   OLD JWT_SECRET prefix: %s\n' "$(preview "${old_val}")"
  printf '   NEW JWT_SECRET prefix: %s\n' "$(preview "${new_val}")"

  if [[ "${APPLY}" == "1" ]]; then
    backup_env
    write_env_val "JWT_SECRET" "${new_val}"
    ok "JWT_SECRET updated in ${ENV_FILE}"
  else
    dry "Would write new JWT_SECRET to ${ENV_FILE}"
  fi

  cat <<'RESTART'

  Restart required (API only):
    systemctl restart doable.service
    # or, if running in tmux:
    tmux send-keys -t doable:api C-c '' Enter
    # (tsx watch auto-restarts on SIGINT in the doable tmux setup)

RESTART
}

rotate_internal() {
  phase "INTERNAL_SECRET rotation"
  warn "⚠  INTERNAL_SECRET is shared between the API and WS services."
  warn "   Both must be restarted in lockstep — brief split-brain window"
  warn "   between restarts will cause internal 403s.  Minimise gap."

  local old_val new_val
  old_val="$(read_env_val INTERNAL_SECRET)"
  if [[ -z "${old_val}" ]]; then
    err "INTERNAL_SECRET not found in ${ENV_FILE}"
  fi
  new_val="$(gen_secret)"

  printf '   OLD INTERNAL_SECRET prefix: %s\n' "$(preview "${old_val}")"
  printf '   NEW INTERNAL_SECRET prefix: %s\n' "$(preview "${new_val}")"

  if [[ "${APPLY}" == "1" ]]; then
    backup_env
    write_env_val "INTERNAL_SECRET" "${new_val}"
    ok "INTERNAL_SECRET updated in ${ENV_FILE}"
  else
    dry "Would write new INTERNAL_SECRET to ${ENV_FILE}"
  fi

  cat <<'RESTART'

  Restart required (API + WS, in quick succession):
    systemctl restart doable.service
    # WS is in the same systemd unit; verify both windows come back:
    tmux list-windows -t doable
    # Expected: api, web, ws all running

RESTART
}

rotate_encryption() {
  phase "ENCRYPTION_KEY rotation"
  warn "⚠  ENCRYPTION_KEY rotation is a multi-step, high-risk operation."
  warn "   This script updates the key in .env and emits a SQL migration."
  warn "   You MUST run the SQL migration before restarting the API."
  warn "   Until the migration completes, encrypted rows cannot be read."

  # Require explicit OLD/NEW from environment to prevent accidents.
  local old_key="${OLD_KEY:-}"
  local new_key="${NEW_KEY:-}"

  if [[ -z "${old_key}" || -z "${new_key}" ]]; then
    err "ENCRYPTION_KEY rotation requires:
       OLD_KEY=<current key>  NEW_KEY=<new key>  $0 encryption [--apply]

  To generate a new key:
       openssl rand -base64 48 | tr -d '\\n' | head -c 64"
  fi

  local current_env_key
  current_env_key="$(read_env_val ENCRYPTION_KEY)"
  if [[ "${current_env_key}" != "${old_key}" ]]; then
    err "OLD_KEY does not match the ENCRYPTION_KEY currently in ${ENV_FILE}.
  Aborting to prevent double-rotation accidents."
  fi

  printf '   OLD ENCRYPTION_KEY prefix: %s\n' "$(preview "${old_key}")"
  printf '   NEW ENCRYPTION_KEY prefix: %s\n' "$(preview "${new_key}")"

  # -------------------------------------------------------------------
  # Emit SQL migration (always, even in dry-run — safe to inspect)
  # -------------------------------------------------------------------
  local ts
  ts="$(date +%Y%m%d%H%M%S)"
  local sql_path="${BACKUP_DIR}/encryption-rotation-${ts}.sql"

  if [[ "${APPLY}" == "1" ]]; then
    mkdir -p "${BACKUP_DIR}"
    chmod 0700 "${BACKUP_DIR}"
  fi

  local sql_dest
  if [[ "${APPLY}" == "1" ]]; then
    sql_dest="${sql_path}"
  else
    sql_dest="/tmp/encryption-rotation-DRY-${ts}.sql"
  fi

  cat > "${sql_dest}" <<SQL
-- ENCRYPTION_KEY rotation migration
-- Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
-- OLD_KEY prefix : $(preview "${old_key}")
-- NEW_KEY prefix : $(preview "${new_key}")
--
-- Instructions:
--   1. Inspect this file carefully before running.
--   2. Run BEFORE restarting the API with the new ENCRYPTION_KEY.
--      psql -d doable -v ON_ERROR_STOP=1 -f ${sql_dest}
--   3. After psql succeeds, restart doable.service.
--   4. Verify with the queries at the end of docs/SECRET_ROTATION.md.
--
-- Tables covered:
--   ai_messages   (column: content_encrypted, when DOABLE_ENCRYPT_AI_MESSAGES=1)
--   ai_providers  (column: encrypted_api_key)
--   integration_credentials (column: credentials_encrypted)
--   oauth_apps    (column: client_secret_encrypted)

BEGIN;

-- ── ai_messages ──────────────────────────────────────────────────────────────
-- Only applies when DOABLE_ENCRYPT_AI_MESSAGES=1 (column exists and is in use).
-- Safe no-op if the column is NULL everywhere.
DO \$\$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_messages' AND column_name = 'encrypted_content'
  ) THEN

    ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS encrypted_content_new bytea;

    UPDATE ai_messages
    SET encrypted_content_new = pgp_sym_encrypt(
          pgp_sym_decrypt(encrypted_content::bytea, '${old_key}'),
          '${new_key}'
        )
    WHERE encrypted_content IS NOT NULL;

    ALTER TABLE ai_messages DROP COLUMN IF EXISTS encrypted_content;
    ALTER TABLE ai_messages RENAME COLUMN encrypted_content_new TO encrypted_content;

    RAISE NOTICE 'ai_messages.encrypted_content re-encrypted OK';
  ELSE
    RAISE NOTICE 'ai_messages.encrypted_content column not present — skipping';
  END IF;
END;
\$\$;

-- ── ai_providers ─────────────────────────────────────────────────────────────
ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS encrypted_api_key_new bytea;

UPDATE ai_providers
SET encrypted_api_key_new = pgp_sym_encrypt(
      pgp_sym_decrypt(encrypted_api_key::bytea, '${old_key}'),
      '${new_key}'
    )
WHERE encrypted_api_key IS NOT NULL;

ALTER TABLE ai_providers DROP COLUMN encrypted_api_key;
ALTER TABLE ai_providers RENAME COLUMN encrypted_api_key_new TO encrypted_api_key;

-- ── integration_credentials ───────────────────────────────────────────────────
ALTER TABLE integration_credentials ADD COLUMN IF NOT EXISTS credentials_encrypted_new bytea;

UPDATE integration_credentials
SET credentials_encrypted_new = pgp_sym_encrypt(
      pgp_sym_decrypt(credentials_encrypted::bytea, '${old_key}'),
      '${new_key}'
    )
WHERE credentials_encrypted IS NOT NULL;

ALTER TABLE integration_credentials DROP COLUMN credentials_encrypted;
ALTER TABLE integration_credentials RENAME COLUMN credentials_encrypted_new TO credentials_encrypted;

-- ── oauth_apps ───────────────────────────────────────────────────────────────
ALTER TABLE oauth_apps ADD COLUMN IF NOT EXISTS client_secret_encrypted_new bytea;

UPDATE oauth_apps
SET client_secret_encrypted_new = pgp_sym_encrypt(
      pgp_sym_decrypt(client_secret_encrypted::bytea, '${old_key}'),
      '${new_key}'
    )
WHERE client_secret_encrypted IS NOT NULL;

ALTER TABLE oauth_apps DROP COLUMN client_secret_encrypted;
ALTER TABLE oauth_apps RENAME COLUMN client_secret_encrypted_new TO client_secret_encrypted;

COMMIT;

-- Post-migration verification:
SELECT
  COUNT(*) FILTER (WHERE encrypted_api_key IS NOT NULL) AS provider_keys_encrypted,
  COUNT(*) AS provider_total
FROM ai_providers;
SQL

  chmod 0600 "${sql_dest}"

  ok "SQL migration written to: ${sql_dest}"
  printf '\n'
  warn "STOP — do NOT restart the API yet."
  warn "Inspect the SQL file, then run:"
  printf '   psql -d doable -v ON_ERROR_STOP=1 -f %s\n\n' "${sql_dest}"
  warn "Only after psql reports success, update .env and restart."
  printf '\n'

  # -------------------------------------------------------------------
  # Update .env (apply mode only)
  # -------------------------------------------------------------------
  if [[ "${APPLY}" == "1" ]]; then
    backup_env
    write_env_val "ENCRYPTION_KEY" "${new_key}"
    ok "ENCRYPTION_KEY updated in ${ENV_FILE}"
    warn "The .env now contains the NEW key.  Run the SQL migration NOW"
    warn "before any process reads the DB, or decrypt will fail."
  else
    dry "Would write new ENCRYPTION_KEY to ${ENV_FILE}"
    dry "SQL preview written to: ${sql_dest} (not written to ${BACKUP_DIR} in dry-run)"
  fi

  cat <<'RESTART'

  Restart required (after SQL migration succeeds):
    systemctl restart doable.service

RESTART
}

# -------------------------------------------------------------------
# Dispatch
# -------------------------------------------------------------------
case "${SUBCOMMAND}" in
  jwt)
    rotate_jwt
    ;;
  internal)
    rotate_internal
    ;;
  encryption)
    rotate_encryption
    ;;
  all)
    # Safe order:
    #   1. internal  — service-to-service; brief window, low user impact
    #   2. jwt       — logs everyone out, but no data migration
    #   3. encryption — highest risk, must be last (SQL migration required)
    phase "Rotating ALL secrets (order: internal → jwt → encryption)"
    if [[ "${SUBCOMMAND}" == "all" && -z "${OLD_KEY:-}" ]]; then
      warn "Skipping encryption rotation in 'all' mode — OLD_KEY/NEW_KEY not set."
      warn "Run: OLD_KEY=<val> NEW_KEY=<val> $0 encryption [--apply]"
    fi
    rotate_internal
    rotate_jwt
    if [[ -n "${OLD_KEY:-}" && -n "${NEW_KEY:-}" ]]; then
      rotate_encryption
    fi
    ;;
esac

phase "Done"
if [[ "${APPLY}" == "0" ]]; then
  warn "Dry-run complete — no files were changed.  Re-run with --apply to apply."
else
  ok "Rotation applied.  Check restart instructions above."
fi
