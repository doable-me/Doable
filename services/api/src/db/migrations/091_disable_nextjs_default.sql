-- BUG-R27-007: Existing installs from before commit 45851c72 still have
-- `enabled_frameworks` = ["vite-react","nextjs-app"] because the seed in
-- 056_platform_config.sql uses ON CONFLICT DO NOTHING, so re-applying the
-- fixed seed leaves prior installs untouched. New installs already get
-- the vite-only default from the corrected seed.
--
-- This migration downgrades ONLY rows that match the legacy default
-- EXACTLY. Operators who explicitly toggled additional frameworks on
-- (e.g. ["vite-react","nextjs-app","astro"]) or removed vite are left
-- alone — their value won't match the equality check.
--
-- Idempotent: re-running is a no-op once the value is already
-- ["vite-react"].

UPDATE platform_config
SET    value      = '["vite-react"]'::jsonb,
       updated_at = now()
WHERE  key = 'enabled_frameworks'
  AND  value = '["vite-react", "nextjs-app"]'::jsonb;
