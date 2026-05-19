-- 089_restore_ai_sessions_policies.sql
-- R14 BUG-RLS-AI-SESSIONS: on fresh-DB validation we saw migrations 045 ran
-- successfully (recorded in schema_migrations) but `pg_policies` showed zero
-- rows for ai_sessions/ai_messages — yet the tables had FORCE ROW LEVEL
-- SECURITY enabled. Result: every INSERT into ai_sessions hits
-- "new row violates row-level security policy" with NO policy to allow it,
-- and AI chat aborts at session creation. Mechanism for the policy loss is
-- not pinned down (suspected: a later migration re-apply path dropped 045's
-- policies). This migration is purely defensive: drop-if-exists then create,
-- so any state lands at the same policies regardless of history.
--
-- Without this, the very first AI chat on a fresh install fails — blocking
-- the "works out of the box" claim for new users.

BEGIN;

DROP POLICY IF EXISTS ai_sessions_owner ON ai_sessions;
CREATE POLICY ai_sessions_owner ON ai_sessions
  USING (
    doable_current_user_id() IS NULL
    OR user_id = doable_current_user_id()::text
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR user_id = doable_current_user_id()::text
  );

DROP POLICY IF EXISTS ai_messages_session_owner ON ai_messages;
CREATE POLICY ai_messages_session_owner ON ai_messages
  USING (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM ai_sessions s
      WHERE s.id = ai_messages.session_id
        AND s.user_id = doable_current_user_id()::text
    )
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM ai_sessions s
      WHERE s.id = ai_messages.session_id
        AND s.user_id = doable_current_user_id()::text
    )
  );

COMMIT;
