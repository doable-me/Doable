-- 008_chat_suggestions.sql
-- Add suggestions and tool_actions columns to ai_messages
-- Also relax FK constraints on ai_sessions so we can persist chat for
-- projects created from the frontend (non-UUID IDs) and anonymous users.

ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS suggestions jsonb;
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS tool_actions jsonb;

-- Drop the FK constraints first (they reference projects/users tables
-- which only contain UUID-based rows, but chat needs to work for all IDs)
ALTER TABLE ai_sessions DROP CONSTRAINT IF EXISTS ai_sessions_project_id_fkey;
ALTER TABLE ai_sessions DROP CONSTRAINT IF EXISTS ai_sessions_user_id_fkey;

-- Safely handle RLS policies that may depend on user_id/project_id columns
-- Use a DO block so errors (policy doesn't exist, RLS not enabled) don't fail migration
DO $$ BEGIN
  -- Drop policies on ai_sessions if they exist (these depend on user_id column)
  DROP POLICY IF EXISTS ai_sessions_owner ON ai_sessions;
  DROP POLICY IF EXISTS ai_sessions_select ON ai_sessions;
  
  -- Drop policies on ai_messages if they exist (these depend on user_id via session)
  DROP POLICY IF EXISTS ai_messages_session_owner ON ai_messages;
  DROP POLICY IF EXISTS ai_messages_select ON ai_messages;
EXCEPTION WHEN OTHERS THEN
  -- If RLS isn't enabled yet or policies don't exist, that's fine
  NULL;
END $$;

-- Now change project_id and user_id to text so we can store chats for
-- any project/user including anonymous and frontend-generated IDs
ALTER TABLE ai_sessions ALTER COLUMN project_id TYPE text USING project_id::text;
ALTER TABLE ai_sessions ALTER COLUMN user_id TYPE text USING user_id::text;
