-- Signup approval (invite-only gate).
-- When enabled in platform_config, new signups land in 'pending' and cannot
-- log in until a platform admin/owner approves them. Admin can also deny
-- (rejected, can't log in) or block (rejected + email added to blocklist
-- so it can never sign up again, even after admin deletes the user row).

-- ─── users.approval_status ─────────────────────────────────
-- Default 'approved' so all existing users keep working when feature is
-- flipped on later. New signups get explicit status from the route.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('approved', 'pending', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_users_approval_status
  ON users(approval_status)
  WHERE approval_status <> 'approved';

-- ─── blocked_signup_emails ─────────────────────────────────
-- Email-level blocklist. Survives deletion of the user row, so "Block" is
-- a true permanent reject (vs. "Deny" which only marks the user row).
CREATE TABLE IF NOT EXISTS blocked_signup_emails (
  email      TEXT PRIMARY KEY,
  reason     TEXT,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_by UUID REFERENCES users(id) ON DELETE SET NULL
);

DO $$ BEGIN
  EXECUTE 'GRANT ALL ON blocked_signup_emails TO doable';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ─── Seed default signup_approval config ───────────────────
INSERT INTO platform_config (key, value) VALUES
  ('signup_approval', '{"enabled": false, "pending_message": "Doable is invite-only right now. You have successfully signed up to be on the list and you will receive your surprise to enjoy it very soon."}'::jsonb)
ON CONFLICT (key) DO NOTHING;
