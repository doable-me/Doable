-- ═══════════════════════════════════════════════════════════
-- 014: Real-time collaboration tables
-- ═══════════════════════════════════════════════════════════

-- WebSocket session tracking for reconnection recovery
CREATE TABLE IF NOT EXISTS ws_sessions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
    session_token   text NOT NULL UNIQUE,
    last_seen_at    timestamptz NOT NULL DEFAULT now(),
    state_snapshot  jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ws_sessions_user ON ws_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_ws_sessions_project ON ws_sessions (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ws_sessions_token ON ws_sessions (session_token);

-- Team chat messages (separate from AI chat)
CREATE TABLE IF NOT EXISTS team_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
    display_name    text,
    content         text NOT NULL,
    message_type    text NOT NULL DEFAULT 'user',
    mentions        uuid[] DEFAULT '{}',
    parent_id       uuid REFERENCES team_messages(id) ON DELETE SET NULL,
    edited_at       timestamptz,
    deleted_at       timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_messages_project ON team_messages (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_messages_parent ON team_messages (parent_id) WHERE parent_id IS NOT NULL;

-- Activity events (file saves, deploys, version creates, etc.)
CREATE TABLE IF NOT EXISTS activity_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name    text,
    event_type      text NOT NULL,
    summary         text NOT NULL,
    metadata        jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_events_project ON activity_events (project_id, created_at DESC);

-- Notifications for @mentions and activity
CREATE TABLE IF NOT EXISTS notifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
    type            text,
    title           text NOT NULL,
    body            text,
    source_id       uuid,
    read_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
-- Migrate existing notifications table if it has the old schema (workspace_id/is_read)
DO $$
BEGIN
    -- Add new columns if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='read_at') THEN
        ALTER TABLE notifications ADD COLUMN read_at timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='project_id') THEN
        ALTER TABLE notifications ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='type') THEN
        -- migrate 'kind' -> 'type' if kind exists, else add type
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='kind') THEN
            ALTER TABLE notifications RENAME COLUMN kind TO type;
        ELSE
            ALTER TABLE notifications ADD COLUMN type text;
        END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='source_id') THEN
        ALTER TABLE notifications ADD COLUMN source_id uuid;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read_at NULLS FIRST, created_at DESC);
