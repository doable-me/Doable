CREATE TABLE IF NOT EXISTS tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    uuid NOT NULL DEFAULT (nullif(current_setting('app.user_id', true), ''))::uuid,
  workspace_id  uuid,
  title         text NOT NULL,
  done          boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_owner ON tasks;
CREATE POLICY tasks_owner ON tasks
  USING (created_by::text = current_setting('app.user_id', true))
  WITH CHECK (created_by::text = current_setting('app.user_id', true));
