-- In-app notifications: per-user, per-workspace.
-- Backs the /notifications REST API (PRD covered by BUG-WSI-004).
CREATE TABLE IF NOT EXISTS notifications (
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

CREATE INDEX IF NOT EXISTS idx_notifications_user_workspace
  ON notifications(user_id, workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_workspace_unread
  ON notifications(user_id, workspace_id)
  WHERE is_read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY notifications_self ON notifications
    FOR ALL TO PUBLIC
    USING (user_id = current_setting('app.current_user_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'GRANT ALL ON notifications TO doable';
EXCEPTION WHEN OTHERS THEN
  -- doable role may not exist in dev environments
  NULL;
END $$;
