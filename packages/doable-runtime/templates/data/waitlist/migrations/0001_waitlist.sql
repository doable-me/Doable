CREATE TABLE IF NOT EXISTS waitlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  uuid NOT NULL DEFAULT (nullif(current_setting('app.user_id', true), ''))::uuid,
  email       text NOT NULL,
  status      text NOT NULL DEFAULT 'new',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS waitlist_owner ON waitlist;
CREATE POLICY waitlist_owner ON waitlist
  USING (created_by::text = current_setting('app.user_id', true))
  WITH CHECK (created_by::text = current_setting('app.user_id', true));
