-- ─── Framework ID on projects + templates ─────────────────────────
-- Phase 0.1 of the framework-agnostic init plan. Tags every project and
-- template with the framework adapter that should drive scaffolding,
-- preview, and AI prompt rewriting (vite-react, next, astro, …).
--
-- See devframeworkPRD/07-implementation-plan.md §0.1 and
-- devframeworkPRD/02-framework-abstraction.md §6.1.
--
-- Default 'vite-react' so every existing row backfills to today's
-- behavior — no app code change required for rows written before the
-- adapter registry lands.

ALTER TABLE projects  ADD COLUMN IF NOT EXISTS framework_id TEXT NOT NULL DEFAULT 'vite-react';
ALTER TABLE templates ADD COLUMN IF NOT EXISTS framework_id TEXT NOT NULL DEFAULT 'vite-react';

CREATE INDEX IF NOT EXISTS idx_projects_framework  ON projects  (framework_id);
CREATE INDEX IF NOT EXISTS idx_templates_framework ON templates (framework_id);
