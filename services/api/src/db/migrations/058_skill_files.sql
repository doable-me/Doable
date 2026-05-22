-- 058_skill_files.sql
-- Multi-file support for skills (Anthropic Agent Skills folder layout).
--
-- A skill is now a folder. The canonical entrypoint stays in
-- `context_skills.skill_content` (materialized as SKILL.md). Optional
-- companion files (theme-palettes.md, examples/foo.md, …) live in this
-- sibling table, keyed by relative path within the folder.

CREATE TABLE IF NOT EXISTS context_skill_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid NOT NULL REFERENCES context_skills(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id, file_path),
  -- Path safety: forbid absolute paths, parent-traversal, and the reserved
  -- SKILL.md name (that's the parent row's skill_content).
  CHECK (
    file_path <> ''
    AND file_path NOT LIKE '/%'
    AND file_path NOT LIKE '%..%'
    AND file_path <> 'SKILL.md'
    AND length(file_path) <= 512
  )
);

CREATE INDEX IF NOT EXISTS idx_skill_files_skill ON context_skill_files (skill_id);

CREATE TRIGGER trg_context_skill_files_updated_at
    BEFORE UPDATE ON context_skill_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE context_skill_files IS 'Companion files for a multi-file skill folder (excludes SKILL.md, which is in context_skills.skill_content).';
COMMENT ON COLUMN context_skill_files.file_path IS 'Relative path within the skill folder, e.g. "theme-palettes.md" or "examples/foo.md".';
