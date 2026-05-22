-- 023: Platform Roles
-- Adds a platform_role column to users, reusing the existing workspace_role enum.
-- Backfills from the is_platform_admin boolean flag.
-- NOTE: is_platform_admin is kept for backward compatibility.

-- ─── Add platform_role column ──────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role workspace_role NOT NULL DEFAULT 'member';

-- ─── Backfill from is_platform_admin ───────────────────────────
UPDATE users SET platform_role = 'admin' WHERE is_platform_admin = true;
