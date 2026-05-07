-- Platform-wide configuration key-value store.
-- Used for admin-controlled settings like enabled frameworks, default project type, etc.
CREATE TABLE IF NOT EXISTS platform_config (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Grant access to the doable application user
DO $$ BEGIN
  EXECUTE 'GRANT ALL ON platform_config TO doable';
EXCEPTION WHEN OTHERS THEN
  -- doable role may not exist in dev environments
  NULL;
END $$;

-- Seed default: both frameworks enabled, vite-react is default
INSERT INTO platform_config (key, value) VALUES
  ('enabled_frameworks', '["vite-react", "nextjs-app"]'::jsonb),
  ('default_framework', '"vite-react"'::jsonb)
ON CONFLICT (key) DO NOTHING;
