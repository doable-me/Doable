-- 005_deployments.sql
-- Deployment tracking for published projects

-- ─── Deployment Status ─────────────────────────────────────
CREATE TYPE deployment_status AS ENUM (
  'queued', 'building', 'deploying', 'live', 'failed', 'rolled_back'
);

CREATE TYPE deployment_environment AS ENUM ('preview', 'production');

-- ─── Deployments ───────────────────────────────────────────
CREATE TABLE deployments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    environment     deployment_environment NOT NULL DEFAULT 'production',
    status          deployment_status NOT NULL DEFAULT 'queued',
    url             text,
    build_log       text,
    error_message   text,
    version_number  int,
    adapter         text NOT NULL DEFAULT 'doable-cloud',
    deployed_by     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at      timestamptz,
    completed_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deployments_project ON deployments (project_id);
CREATE INDEX idx_deployments_status ON deployments (status);
CREATE INDEX idx_deployments_project_env ON deployments (project_id, environment);
CREATE INDEX idx_deployments_created ON deployments (project_id, created_at DESC);

-- ─── Updated-at Trigger ────────────────────────────────────
CREATE TRIGGER trg_deployments_updated_at
    BEFORE UPDATE ON deployments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
