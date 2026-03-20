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
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type            text NOT NULL,
    title           text NOT NULL,
    body            text,
    source_id       uuid,
    read_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read_at NULLS FIRST, created_at DESC);
