-- 084_project_status_archived.sql
--
-- BUG-API-005: POST /projects/:id/archive returned 500 because the
-- archive handler casts 'archived'::project_status, but the enum has
-- only {creating, draft, published, error}. Adding the literal lets the
-- archive/unarchive route move projects to a distinct status separate
-- from 'draft' (so unarchive restores to 'draft' rather than ambiguously
-- reusing the soft-delete `deleted_at` column).
--
-- Idempotent: `ADD VALUE IF NOT EXISTS` is safe to re-run.

ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'archived';
