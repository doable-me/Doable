#!/usr/bin/env bash
# ==============================================================================
# Doable — postgres-init: runtime role separation
# ==============================================================================
# Runs once at first volume init (pgvector image's docker-entrypoint executes
# every */*.sh in /docker-entrypoint-initdb.d alphabetically; this fires after
# 01-init.sql — see docker-compose.yml mount order).
#
# Creates a non-superuser `doable_app` role that the api+ws containers use at
# runtime. The default `doable` role (POSTGRES_USER) is the database owner and
# has full DDL — convenient for migrations, but a compromise of either runtime
# container would otherwise give an attacker DROP TABLE / CREATE EXTENSION /
# ALTER ROLE. Constraining api+ws to a CRUD-only role bounds the blast radius.
#
# Role layout after this script runs:
#   doable      = superuser/owner, used by `migrate` service only (DDL allowed)
#   doable_app  = CRUD only on existing tables/sequences/functions in `public`
#                 (no CREATE/DROP, no EXTENSION, no ROLE grants, no superuser)
# ==============================================================================
set -euo pipefail

if [ -z "${DOABLE_APP_PASSWORD:-}" ]; then
  echo "[02-roles.sh] DOABLE_APP_PASSWORD not set — refusing to create doable_app with empty password." >&2
  echo "[02-roles.sh] setup.sh should generate this on fresh install; back-fill block runs on upgrade." >&2
  exit 1
fi

# POSTGRES_USER / POSTGRES_DB are exported by the postgres entrypoint. Defaults
# match docker-compose.yml so this is a safe fallback if the operator overrode
# either var.
: "${POSTGRES_USER:=doable}"
: "${POSTGRES_DB:=doable}"

echo "[02-roles.sh] Creating runtime-only role doable_app in database ${POSTGRES_DB}..."

# Password is passed as a psql client-side variable (--set) which substitutes
# :'app_pwd' OUTSIDE dollar-quoted blocks. psql does NOT touch substitutions
# inside DO $$ ... $$ bodies, so we land the password in a postgres GUC first
# (server-side SET on a dotted custom-GUC name) and read it back from within
# the DO block via current_setting.
psql \
  --username "$POSTGRES_USER" \
  --dbname   "$POSTGRES_DB" \
  --no-psqlrc \
  --set ON_ERROR_STOP=on \
  --set "app_pwd=$DOABLE_APP_PASSWORD" <<PSQL
-- Land the password in a server-side GUC. :'app_pwd' is escaped + quoted
-- by psql on the way out, so this is safe even with weird chars in pwd.
SET doable.app_pwd = :'app_pwd';

-- Create role if missing; rotate password if already present so the live DB
-- always matches whatever .env emitted. Wrapped in a DO block because
-- CREATE ROLE has no IF NOT EXISTS in postgres 16.
DO \$\$
DECLARE
  v_pwd text := current_setting('doable.app_pwd', true);
BEGIN
  IF v_pwd IS NULL OR length(v_pwd) = 0 THEN
    RAISE EXCEPTION 'doable.app_pwd GUC is empty — refusing to create doable_app';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'doable_app') THEN
    EXECUTE format('CREATE ROLE doable_app LOGIN PASSWORD %L', v_pwd);
  ELSE
    EXECUTE format('ALTER ROLE doable_app WITH PASSWORD %L', v_pwd);
  END IF;
END\$\$;

-- Wipe the GUC from the session so it doesn't linger in pg_settings.
RESET doable.app_pwd;

-- GRANTs are idempotent — re-running this on an existing role is safe.
GRANT CONNECT ON DATABASE doable TO doable_app;
GRANT USAGE ON SCHEMA public TO doable_app;

-- CRUD on every existing table + sequence + function. Note that this does NOT
-- grant the table-ownership privileges (TRUNCATE, REFERENCES, TRIGGER) — those
-- stay with the migrate role.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO doable_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO doable_app;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA public TO doable_app;

-- ALTER DEFAULT PRIVILEGES applies the same grants to tables/sequences/functions
-- CREATED IN THE FUTURE by the migrate role. Without this, every new migration
-- would silently lock doable_app out of the new table until somebody runs the
-- GRANT manually. Scoped FOR ROLE doable so it only fires when the owner role
-- creates the object (not when doable_app itself does, which can't anyway).
ALTER DEFAULT PRIVILEGES FOR ROLE doable IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO doable_app;
ALTER DEFAULT PRIVILEGES FOR ROLE doable IN SCHEMA public GRANT USAGE, SELECT                  ON SEQUENCES TO doable_app;
ALTER DEFAULT PRIVILEGES FOR ROLE doable IN SCHEMA public GRANT EXECUTE                        ON FUNCTIONS TO doable_app;
PSQL

echo "[02-roles.sh] doable_app role ready (CRUD on public; no DDL, no superuser)."
