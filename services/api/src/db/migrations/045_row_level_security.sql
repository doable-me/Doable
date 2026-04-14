-- 045_row_level_security.sql
-- Add Row-Level Security (RLS) to the most sensitive multi-tenant tables.
--
-- Strategy:
--   The application uses a single DB user `doable`. RLS policies gate access
--   via a session variable `doable.current_user_id` that the application
--   sets at the start of each request (SET LOCAL). When the variable is empty
--   or unset, all rows are visible (preserving backward compatibility for
--   migrations, background jobs, and the WS service).
--
-- Tables protected:
--   users, projects, ai_sessions, ai_messages, integration_connections,
--   github_connections, refresh_tokens
--
-- IMPORTANT: The application MUST call
--   SET LOCAL "doable.current_user_id" = '<uuid>';
-- inside a transaction before querying these tables for RLS to apply.
-- Without it, the permissive fallback allows all rows (safe for internal ops).

-- ─── Helper function ────────────────────────────────────────
CREATE OR REPLACE FUNCTION doable_current_user_id() RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('doable.current_user_id', true), '')::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ════════════════════════════════════════════════════════════
-- 1. users — users can only see/modify their own row
-- ════════════════════════════════════════════════════════════
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- When no user context is set (NULL), allow all — this covers migrations,
-- background jobs, internal API calls from WS, etc.
CREATE POLICY users_self ON users
  USING (
    doable_current_user_id() IS NULL
    OR id = doable_current_user_id()
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR id = doable_current_user_id()
  );

-- ════════════════════════════════════════════════════════════
-- 2. projects — visible to workspace members only
-- ════════════════════════════════════════════════════════════
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_collaborators') THEN
    EXECUTE '
      CREATE POLICY projects_workspace_member ON projects
        USING (
          doable_current_user_id() IS NULL
          OR visibility = ''public''
          OR EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = projects.workspace_id
              AND wm.user_id = doable_current_user_id()
          )
          OR EXISTS (
            SELECT 1 FROM project_collaborators pc
            WHERE pc.project_id = projects.id
              AND pc.user_id = doable_current_user_id()
          )
        )
        WITH CHECK (
          doable_current_user_id() IS NULL
          OR EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = projects.workspace_id
              AND wm.user_id = doable_current_user_id()
          )
        )';
  ELSE
    EXECUTE '
      CREATE POLICY projects_workspace_member ON projects
        USING (
          doable_current_user_id() IS NULL
          OR visibility = ''public''
          OR EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = projects.workspace_id
              AND wm.user_id = doable_current_user_id()
          )
        )
        WITH CHECK (
          doable_current_user_id() IS NULL
          OR EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = projects.workspace_id
              AND wm.user_id = doable_current_user_id()
          )
        )';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 3. ai_sessions — user can only see their own AI sessions
-- ════════════════════════════════════════════════════════════
ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_sessions_owner ON ai_sessions
  USING (
    doable_current_user_id() IS NULL
    OR user_id = doable_current_user_id()::text
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR user_id = doable_current_user_id()::text
  );

-- ════════════════════════════════════════════════════════════
-- 4. ai_messages — only visible to the session owner
-- ════════════════════════════════════════════════════════════
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages FORCE ROW LEVEL SECURITY;

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

-- ════════════════════════════════════════════════════════════
-- 5. integration_connections — only connection owner or workspace admin
-- ════════════════════════════════════════════════════════════
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY;

CREATE POLICY integration_connections_access ON integration_connections
  USING (
    doable_current_user_id() IS NULL
    OR user_id = doable_current_user_id()
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = integration_connections.workspace_id
        AND wm.user_id = doable_current_user_id()
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR user_id = doable_current_user_id()
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = integration_connections.workspace_id
        AND wm.user_id = doable_current_user_id()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- ════════════════════════════════════════════════════════════
-- 6. github_connections — only the owning user
-- ════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'github_connections') THEN
    ALTER TABLE github_connections ENABLE ROW LEVEL SECURITY;
    ALTER TABLE github_connections FORCE ROW LEVEL SECURITY;

    EXECUTE 'CREATE POLICY github_connections_owner ON github_connections
      USING (
        doable_current_user_id() IS NULL
        OR created_by = doable_current_user_id()
      )
      WITH CHECK (
        doable_current_user_id() IS NULL
        OR created_by = doable_current_user_id()
      )';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 7. refresh_tokens — only token owner
-- ════════════════════════════════════════════════════════════
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY refresh_tokens_owner ON refresh_tokens
  USING (
    doable_current_user_id() IS NULL
    OR user_id = doable_current_user_id()
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR user_id = doable_current_user_id()
  );

-- ════════════════════════════════════════════════════════════
-- Grant privileges to doable user (if not already granted)
-- ════════════════════════════════════════════════════════════
DO $$ BEGIN
  EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO doable';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Grant skipped (likely running as doable already): %', SQLERRM;
END $$;
