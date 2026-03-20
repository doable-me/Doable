-- 018_deployments.sql
-- Enhanced deployment tracking with build/deploy timing and artifact tracking

-- Add build_time_ms and deploy_time_ms columns to deployments
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS build_time_ms int;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS deploy_time_ms int;

-- ─── Deployment Artifacts ─────────────────────────────────
-- Tracks individual files deployed in each deployment
CREATE TABLE IF NOT EXISTS deployment_artifacts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id   uuid NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    file_path       text NOT NULL,
    file_size       int NOT NULL DEFAULT 0,
    content_hash    text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deployment_artifacts_deployment
    ON deployment_artifacts (deployment_id);

-- Index for fast lookups by deployment + path
CREATE UNIQUE INDEX IF NOT EXISTS idx_deployment_artifacts_unique_path
    ON deployment_artifacts (deployment_id, file_path);
