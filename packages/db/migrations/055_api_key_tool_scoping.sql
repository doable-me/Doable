-- Add tool-scoping and origin-binding to API keys for published apps.
-- NULL = unrestricted. Array = only listed values allowed.
ALTER TABLE project_api_keys
  ADD COLUMN IF NOT EXISTS allowed_tools jsonb DEFAULT NULL;

ALTER TABLE project_api_keys
  ADD COLUMN IF NOT EXISTS allowed_origins jsonb DEFAULT NULL;

COMMENT ON COLUMN project_api_keys.allowed_tools IS
  'JSON array of tool name patterns this key may call. NULL = all tools allowed.';

COMMENT ON COLUMN project_api_keys.allowed_origins IS
  'JSON array of allowed origin domains (e.g. ["myapp.doable.me","*.example.com"]). NULL = any origin. Client keys with origins set will reject requests without a matching Origin/Referer header.';
