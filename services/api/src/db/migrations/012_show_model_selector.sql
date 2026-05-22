-- 012: Add show_model_selector to workspace_ai_settings
-- Controls whether non-admin users see the model selection dropdown in the editor.
-- Default is FALSE — users use whatever the admin has configured.

ALTER TABLE workspace_ai_settings
  ADD COLUMN IF NOT EXISTS show_model_selector BOOLEAN NOT NULL DEFAULT FALSE;
