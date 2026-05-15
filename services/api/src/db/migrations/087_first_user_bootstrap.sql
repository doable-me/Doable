-- Seed platform_config rows for first-user bootstrap state tracking.
-- Uses INSERT ... ON CONFLICT DO NOTHING so re-running this migration is safe.

INSERT INTO platform_config (key, value) VALUES
  ('bootstrap_completed_at', 'null'::jsonb),
  ('bootstrap_token_expires_at', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;
