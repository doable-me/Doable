-- Mode tool configuration: admin-configurable allowed tools per AI mode
CREATE TABLE IF NOT EXISTS mode_tool_config (
  mode TEXT PRIMARY KEY,
  allowed_tools TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL PRIVILEGES ON mode_tool_config TO doable;

-- Seed defaults matching current hardcoded tool sets
INSERT INTO mode_tool_config (mode, allowed_tools, description) VALUES
  ('plan', ARRAY[
    'read_file', 'list_files', 'search_files',
    'ask_clarification', 'create_plan', 'mark_step_complete',
    'view', 'grep', 'glob', 'ask_user', 'report_intent'
  ], 'Strategize mode — read-only planning and analysis tools'),
  ('build', ARRAY[
    'create_file', 'edit_file', 'read_file', 'list_files',
    'install_package', 'deploy_preview', 'provision_supabase',
    'request_integration', 'mark_step_complete',
    'view', 'grep', 'glob', 'ask_user', 'report_intent',
    'bash', 'edit'
  ], 'Build mode — full creation and editing tools')
ON CONFLICT (mode) DO NOTHING;
