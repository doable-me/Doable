-- 012: Platform Admin & Feature Flags
-- Adds system-level administration: platform admin flag on users,
-- feature flags for controlling feature access globally/per-role/per-user.

-- ─── Platform admin flag ─────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

-- ─── Feature flags table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
    feature_key   text        PRIMARY KEY,
    label         text        NOT NULL,
    description   text,
    enabled       boolean     NOT NULL DEFAULT true,
    min_plan      text,       -- minimum plan required (null = all plans): 'free','pro','business','enterprise'
    min_role      text,       -- minimum workspace role required (null = no role restriction): 'viewer','member','admin','owner'
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── Per-user feature overrides ──────────────────────────────
CREATE TABLE IF NOT EXISTS user_feature_overrides (
    user_id       uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature_key   text    NOT NULL REFERENCES feature_flags(feature_key) ON DELETE CASCADE,
    enabled       boolean NOT NULL,
    PRIMARY KEY (user_id, feature_key)
);

-- ─── Seed initial feature flags ──────────────────────────────
INSERT INTO feature_flags (feature_key, label, description, enabled, min_plan, min_role) VALUES
  ('ai_chat',           'AI Chat',              'AI chat and code generation',                        true,  null,         null),
  ('ai_settings',       'AI Settings',          'Configure AI models, providers, and enforcement',    true,  null,         'admin'),
  ('visual_editor',     'Visual Editor',        'Click-to-edit visual editing in preview',            true,  null,         null),
  ('code_editor',       'Code Editor',          'Monaco code editor (Dev Mode)',                      true,  'pro',        null),
  ('github_sync',       'GitHub Sync',          'Connect and sync projects with GitHub',              true,  null,         null),
  ('publish',           'Publish / Deploy',     'Publish projects to doable.me or custom domains',   true,  null,         null),
  ('custom_domains',    'Custom Domains',       'Use your own domain for published apps',             true,  'pro',        null),
  ('templates',         'Templates',            'Create projects from templates',                     true,  null,         null),
  ('analytics',         'Analytics',            'Built-in analytics for published apps',              true,  null,         null),
  ('billing',           'Billing & Credits',    'Manage subscriptions and credits',                   true,  null,         'owner'),
  ('version_history',   'Version History',      'View and restore previous versions',                 true,  null,         null),
  ('workspaces',        'Workspaces',           'Create and manage workspaces',                       true,  null,         null),
  ('workspace_members', 'Workspace Members',    'Invite and manage workspace members',                true,  null,         'admin'),
  ('connectors',        'Connectors',           'Configure integrations and MCP servers',             true,  'pro',        null),
  ('security_center',   'Security Center',      'Security scanning and vulnerability management',     true,  'business',   'admin')
ON CONFLICT (feature_key) DO NOTHING;
