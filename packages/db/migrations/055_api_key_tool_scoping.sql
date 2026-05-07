-- Add tool-scoping to API keys so published apps can only call specific tools.
-- NULL = unrestricted (all workspace tools). Array = only listed tools allowed.
ALTER TABLE project_api_keys
  ADD COLUMN IF NOT EXISTS allowed_tools jsonb DEFAULT NULL;

COMMENT ON COLUMN project_api_keys.allowed_tools IS
  'JSON array of tool name patterns this key may call. NULL = all tools allowed.';
