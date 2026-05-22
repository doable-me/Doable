-- In-app notifications: per-user, per-workspace.
-- Backs the /notifications REST API (PRD covered by BUG-WSI-004).
--
-- Some installs have an empty pre-existing project-scoped `notifications`
-- table (id, user_id, project_id, type, title, body, source_id, read_at,
-- created_at). We migrate to the workspace-scoped shape. The DROP is safe
-- only when no rows exist; if you have data, cherry-pick this migration
-- and write a data-preserving ALTER instead.
DO $migration$
DECLARE
  has_table integer;
  row_count integer := 0;
BEGIN
  SELECT count(*) INTO has_table FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications';
  IF has_table > 0 THEN
    EXECUTE 'SELECT count(*) FROM notifications' INTO row_count;
    IF row_count = 0 THEN
      DROP TABLE notifications CASCADE;
    ELSE
      RAISE EXCEPTION 'notifications table has % rows; refusing to drop. Migrate manually.', row_count;
    END IF;
  END IF;
END
$migration$;

CREATE TABLE notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  kind         text        NOT NULL,
  title        text        NOT NULL,
  body         text,
  link         text,
  is_read      boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_workspace
  ON notifications(user_id, workspace_id, created_at DESC);

CREATE INDEX idx_notifications_user_workspace_unread
  ON notifications(user_id, workspace_id)
  WHERE is_read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Use the repo-wide helper `doable_current_user_id()` so the policy follows the
-- same NULL-pass-through convention as `projects`, `ai_messages`,
-- `integration_connections` etc. The middleware (services/api/src/middleware/rls.ts)
-- sets `doable.current_user_id` via SET LOCAL for each authenticated request.
DO $policy$ BEGIN
  CREATE POLICY notifications_self ON notifications
    FOR ALL TO PUBLIC
    USING (
      doable_current_user_id() IS NULL
      OR user_id = doable_current_user_id()::uuid
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$policy$;

DO $grant$ BEGIN
  EXECUTE 'GRANT ALL ON notifications TO doable';
EXCEPTION WHEN OTHERS THEN
  -- doable role may not exist in dev environments
  NULL;
END
$grant$;
