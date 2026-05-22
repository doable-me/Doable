-- Seed platform_config rows for the in-app setup wizard state tracking.
-- Uses INSERT ... ON CONFLICT DO NOTHING so re-running this migration is safe.

INSERT INTO platform_config (key, value) VALUES
  ('setup_completed_at', 'null'::jsonb),
  ('setup_started_at', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;
