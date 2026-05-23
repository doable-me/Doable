-- 093_app_db.sql
-- PRD per-app-db (08 §3): per-project PGlite database.
-- 1) Annotate the audit-log action surface (no type change; action is free-text TEXT).
-- 2) Extend connector_audit with the data-plane attribution columns the worker
--    populates after parse (statement_type, sql/params hashes, rows, error code).
-- 3) Per-project opt-out flag so the admin TUI can disable app-db for one
--    project without flipping the global DOABLE_APP_DB_ENABLED env var.
--
-- All statements are idempotent (IF NOT EXISTS) so re-running is safe.

-- 1. Document the new audit action strings emitted by the data plane.
COMMENT ON COLUMN connector_audit.action IS
  'Free-text action name. connector-proxy emits {integration_action}; doable.data emits one of: data.query, data.exec, data.migrate, data.schema, data.inspect.';

-- 2. Data-plane attribution columns. Hashes only (never raw SQL/params) to keep
--    PII out of the audit corpus, matching the connector-proxy audit posture.
ALTER TABLE connector_audit
  ADD COLUMN IF NOT EXISTS statement_type text;   -- first SQL token uppercased: SELECT/INSERT/CREATE/...
ALTER TABLE connector_audit
  ADD COLUMN IF NOT EXISTS sql_hash       text;   -- sha256(normalised sql)
ALTER TABLE connector_audit
  ADD COLUMN IF NOT EXISTS params_hash    text;   -- sha256(JSON.stringify(params))
ALTER TABLE connector_audit
  ADD COLUMN IF NOT EXISTS rows_returned  int;    -- for data.query; NULL elsewhere
ALTER TABLE connector_audit
  ADD COLUMN IF NOT EXISTS error_code     text;   -- error.code when status<>'ok', else NULL

-- 3. Per-project app-db kill switch (default on). The pool/routes consult this
--    alongside the global env flag; the admin TUI flips it per project.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS app_db_enabled boolean NOT NULL DEFAULT true;
