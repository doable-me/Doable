-- BUG-API-005: The archive handler casts UPDATE ... SET status='archived'
-- against the project_status enum (mig 001), which has values
-- {creating, draft, published, error}. The cast fails with
-- "invalid input value for enum project_status: 'archived'" → 500.
--
-- Add 'archived' as a valid enum member. ADD VALUE IF NOT EXISTS is
-- idempotent (Postgres 14+), so this migration is safe to re-run.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so the
-- migration runner must execute this statement standalone (already does).

ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'archived';
