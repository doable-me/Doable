-- 101_project_api_keys_tools_origins_textarray.sql
-- Normalize project_api_keys.allowed_tools / allowed_origins to text[].
--
-- The canonical schema (066 + 075) defines these columns as text[], and the
-- application code (deploy/auto-api-key.ts, routes/projects/api-keys.ts,
-- routes/connector-proxy.ts) reads/writes them as Postgres text[] arrays.
-- Some drifted installs ended up with these columns as jsonb (where older code
-- wrote JSON.stringify(arr)::jsonb). On those installs the text[]-array code
-- fails with "column is of type jsonb but expression is of type text[]" — so
-- published apps never get a usable client key. This migration heals such
-- installs in place; it is a NO-OP where the columns are already text[].
--
-- It also repairs the legacy DOUBLE-ENCODED case: older code stored the value
-- as a jsonb STRING (e.g. '"[\"a\",\"b\"]"', jsonb_typeof = 'string') rather
-- than a jsonb array — those are unwrapped and parsed so no data is lost.

DO $$
DECLARE
  tools_type text;
BEGIN
  SELECT data_type INTO tools_type
  FROM information_schema.columns
  WHERE table_name = 'project_api_keys' AND column_name = 'allowed_tools';

  -- Only act when the column is jsonb (drifted). text[]/ARRAY → already correct.
  IF tools_type = 'jsonb' THEN
    ALTER TABLE project_api_keys
      ADD COLUMN allowed_tools_textarr   text[],
      ADD COLUMN allowed_origins_textarr text[];

    UPDATE project_api_keys SET
      allowed_tools_textarr = CASE
        WHEN allowed_tools IS NULL THEN NULL
        WHEN jsonb_typeof(allowed_tools) = 'array'
          THEN COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(allowed_tools) v), ARRAY[]::text[])
        WHEN jsonb_typeof(allowed_tools) = 'string'
             AND jsonb_typeof((allowed_tools #>> '{}')::jsonb) = 'array'
          THEN COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text((allowed_tools #>> '{}')::jsonb) v), ARRAY[]::text[])
        ELSE NULL
      END,
      allowed_origins_textarr = CASE
        WHEN allowed_origins IS NULL THEN NULL
        WHEN jsonb_typeof(allowed_origins) = 'array'
          THEN COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(allowed_origins) v), ARRAY[]::text[])
        WHEN jsonb_typeof(allowed_origins) = 'string'
             AND jsonb_typeof((allowed_origins #>> '{}')::jsonb) = 'array'
          THEN COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text((allowed_origins #>> '{}')::jsonb) v), ARRAY[]::text[])
        ELSE NULL
      END;

    ALTER TABLE project_api_keys DROP COLUMN allowed_tools, DROP COLUMN allowed_origins;
    ALTER TABLE project_api_keys RENAME COLUMN allowed_tools_textarr   TO allowed_tools;
    ALTER TABLE project_api_keys RENAME COLUMN allowed_origins_textarr TO allowed_origins;
  END IF;
END $$;
