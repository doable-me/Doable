-- 001_initial_schema.sql
-- Doable: initial database schema

-- ─── Extensions ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Custom Types ───────────────────────────────────────────
CREATE TYPE workspace_plan AS ENUM ('free', 'pro', 'business', 'enterprise');
CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE project_status AS ENUM ('creating', 'draft', 'published', 'error');
CREATE TYPE project_visibility AS ENUM ('public', 'restricted');
CREATE TYPE ai_session_mode AS ENUM ('agent', 'plan', 'chat');
CREATE TYPE ai_message_role AS ENUM ('user', 'assistant', 'system', 'tool');
CREATE TYPE api_key_environment AS ENUM ('test', 'live');
CREATE TYPE connector_type AS ENUM ('shared', 'personal', 'custom');
CREATE TYPE connector_status AS ENUM ('active', 'inactive', 'error');

-- ─── Users ──────────────────────────────────────────────────
CREATE TABLE users (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email       text NOT NULL UNIQUE,
    password_hash text,
    display_name text,
    avatar_url  text,
    github_id   text UNIQUE,
    google_id   text UNIQUE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email_trgm ON users USING gin (email gin_trgm_ops);
CREATE INDEX idx_users_github_id ON users (github_id) WHERE github_id IS NOT NULL;
CREATE INDEX idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;

-- ─── Workspaces ─────────────────────────────────────────────
CREATE TABLE workspaces (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    slug        text NOT NULL UNIQUE,
    description text,
    avatar_url  text,
    owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan        workspace_plan NOT NULL DEFAULT 'free',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspaces_owner ON workspaces (owner_id);
CREATE INDEX idx_workspaces_slug ON workspaces (slug);

-- ─── Workspace Members ─────────────────────────────────────
CREATE TABLE workspace_members (
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         workspace_role NOT NULL DEFAULT 'member',
    joined_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user ON workspace_members (user_id);

-- ─── Folders ────────────────────────────────────────────────
CREATE TABLE folders (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name        text NOT NULL,
    parent_id   uuid REFERENCES folders(id) ON DELETE CASCADE,
    position    int NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_folders_workspace ON folders (workspace_id);
CREATE INDEX idx_folders_parent ON folders (parent_id) WHERE parent_id IS NOT NULL;

-- ─── Projects ───────────────────────────────────────────────
CREATE TABLE projects (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            text NOT NULL,
    slug            text NOT NULL,
    description     text,
    status          project_status NOT NULL DEFAULT 'draft',
    visibility      project_visibility NOT NULL DEFAULT 'restricted',
    github_repo_url text,
    published_url   text,
    thumbnail_url   text,
    template_id     uuid,
    folder_id       uuid REFERENCES folders(id) ON DELETE SET NULL,
    deleted_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, slug)
);

CREATE INDEX idx_projects_workspace ON projects (workspace_id);
CREATE INDEX idx_projects_status ON projects (status);
CREATE INDEX idx_projects_folder ON projects (folder_id) WHERE folder_id IS NOT NULL;
CREATE INDEX idx_projects_deleted ON projects (deleted_at) WHERE deleted_at IS NOT NULL;

-- ─── Project Versions ───────────────────────────────────────
CREATE TABLE project_versions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_number  int NOT NULL,
    description     text,
    snapshot_data   jsonb,
    bookmarked      boolean NOT NULL DEFAULT false,
    created_by      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, version_number)
);

CREATE INDEX idx_project_versions_project ON project_versions (project_id);

-- ─── AI Sessions ────────────────────────────────────────────
CREATE TABLE ai_sessions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode        ai_session_mode NOT NULL DEFAULT 'chat',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_sessions_project ON ai_sessions (project_id);
CREATE INDEX idx_ai_sessions_user ON ai_sessions (user_id);

-- ─── AI Messages ────────────────────────────────────────────
CREATE TABLE ai_messages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  uuid NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
    role        ai_message_role NOT NULL,
    content     text,
    tool_calls  jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_messages_session ON ai_messages (session_id);
CREATE INDEX idx_ai_messages_created ON ai_messages (session_id, created_at);

-- ─── Credits ────────────────────────────────────────────────
CREATE TABLE credits (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    daily_remaining     int NOT NULL DEFAULT 5,
    monthly_remaining   int NOT NULL DEFAULT 0,
    rollover_credits    int NOT NULL DEFAULT 0,
    last_daily_reset    timestamptz,
    last_monthly_reset  timestamptz
);

-- ─── API Keys ───────────────────────────────────────────────
CREATE TABLE api_keys (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            text NOT NULL,
    encrypted_value text NOT NULL,
    environment     api_key_environment NOT NULL DEFAULT 'test',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_project ON api_keys (project_id);

-- ─── Templates ──────────────────────────────────────────────
CREATE TABLE templates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    description     text,
    category        text,
    code_files      jsonb,
    doable_context  jsonb,
    preview_image_url text,
    is_official     boolean NOT NULL DEFAULT true,
    usage_count     int NOT NULL DEFAULT 0,
    created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_templates_category ON templates (category);
CREATE INDEX idx_templates_official ON templates (is_official) WHERE is_official = true;

-- ─── Connectors ─────────────────────────────────────────────
CREATE TABLE connectors (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type            connector_type NOT NULL,
    provider        varchar NOT NULL,
    config          jsonb,
    status          connector_status NOT NULL DEFAULT 'active',
    created_by      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_connectors_workspace ON connectors (workspace_id);

-- ─── Project Stars ──────────────────────────────────────────
CREATE TABLE project_stars (
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, project_id)
);

CREATE INDEX idx_project_stars_project ON project_stars (project_id);

-- ─── Updated-at Trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ai_sessions_updated_at
    BEFORE UPDATE ON ai_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
