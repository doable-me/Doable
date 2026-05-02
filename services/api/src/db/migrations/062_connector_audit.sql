-- 062_connector_audit.sql
-- PRD 10 (connector bridge): per-call audit log so workspace admins can see
-- what generated apps invoked through the proxy.

CREATE TABLE IF NOT EXISTS connector_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL,
  integration   text NOT NULL,
  action        text NOT NULL,
  user_id       uuid,
  status        text NOT NULL CHECK (status IN ('ok','denied','error')),
  duration_ms   int,
  ts            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connector_audit_project_ts_idx
  ON connector_audit (project_id, ts DESC);
