-- ═══════════════════════════════════════════════════════════
-- 015: Drop legacy workspace-level credits table
--
-- The credit system has been consolidated to use ONLY the
-- per-user `credit_balances` table. The old `credits` table
-- was workspace-level and has been fully replaced.
--
-- credit_balances: per-user per-workspace, auto-init, auto-reset
-- credit_usage_log: detailed per-request usage tracking
-- ═══════════════════════════════════════════════════════════

-- Drop the old workspace-level credits table
DROP TABLE IF EXISTS credit_usage CASCADE;
DROP TABLE IF EXISTS credits CASCADE;
