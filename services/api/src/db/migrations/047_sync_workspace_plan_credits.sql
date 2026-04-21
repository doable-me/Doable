-- Migration 047: Sync credit_balances to workspace plan (backfill + trigger)
-- Prevents misconfigurations where a workspace has plan='business' (or pro/
-- enterprise) but its members' credit_balances still show free-plan limits.
--
-- Two parts:
--   1. Backfill every credit_balances row so its plan_type & credit limits
--      match the owning workspace's plan according to PLAN_LIMITS.
--   2. Install a trigger on workspaces.plan UPDATE that auto-syncs
--      credit_balances whenever the plan changes.
--
-- PLAN_LIMITS (kept in sync with packages/shared/src/constants.ts):
--   free       -> daily=5    monthly=0
--   pro        -> daily=50   monthly=500
--   business   -> daily=200  monthly=3000
--   enterprise -> daily=INT_MAX monthly=INT_MAX   (Infinity capped at int32)

BEGIN;

-- ─── 1. Backfill ──────────────────────────────────────────────
UPDATE credit_balances cb
SET
  plan_type = w.plan,
  daily_credits = CASE w.plan::text
    WHEN 'free'       THEN 5
    WHEN 'pro'        THEN 50
    WHEN 'business'   THEN 200
    WHEN 'enterprise' THEN 2147483647
    ELSE cb.daily_credits
  END,
  monthly_credits = CASE w.plan::text
    WHEN 'free'       THEN 0
    WHEN 'pro'        THEN 500
    WHEN 'business'   THEN 3000
    WHEN 'enterprise' THEN 2147483647
    ELSE cb.monthly_credits
  END,
  updated_at = now()
FROM workspaces w
WHERE cb.workspace_id = w.id
  AND (
       cb.plan_type::text <> w.plan::text
    OR cb.daily_credits <> CASE w.plan::text
         WHEN 'free' THEN 5 WHEN 'pro' THEN 50
         WHEN 'business' THEN 200 WHEN 'enterprise' THEN 2147483647
         ELSE cb.daily_credits END
    OR cb.monthly_credits <> CASE w.plan::text
         WHEN 'free' THEN 0 WHEN 'pro' THEN 500
         WHEN 'business' THEN 3000 WHEN 'enterprise' THEN 2147483647
         ELSE cb.monthly_credits END
  );

-- ─── 2. Trigger to keep them in sync on future plan changes ──
CREATE OR REPLACE FUNCTION sync_credit_balances_to_plan() RETURNS trigger AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    UPDATE credit_balances
    SET
      plan_type = NEW.plan,
      daily_credits = CASE NEW.plan::text
        WHEN 'free'       THEN 5
        WHEN 'pro'        THEN 50
        WHEN 'business'   THEN 200
        WHEN 'enterprise' THEN 2147483647
        ELSE daily_credits
      END,
      monthly_credits = CASE NEW.plan::text
        WHEN 'free'       THEN 0
        WHEN 'pro'        THEN 500
        WHEN 'business'   THEN 3000
        WHEN 'enterprise' THEN 2147483647
        ELSE monthly_credits
      END,
      updated_at = now()
    WHERE workspace_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_credit_balances_to_plan ON workspaces;
CREATE TRIGGER trg_sync_credit_balances_to_plan
  AFTER UPDATE OF plan ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION sync_credit_balances_to_plan();

COMMIT;
