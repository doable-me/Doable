CREATE TABLE IF NOT EXISTS leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  uuid NOT NULL DEFAULT (nullif(current_setting('app.user_id', true), ''))::uuid,
  email       text NOT NULL,
  source      text NOT NULL DEFAULT 'web',
  status      text NOT NULL DEFAULT 'new',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leads_owner ON leads;
CREATE POLICY leads_owner ON leads
  USING (created_by::text = current_setting('app.user_id', true))
  WITH CHECK (created_by::text = current_setting('app.user_id', true));
