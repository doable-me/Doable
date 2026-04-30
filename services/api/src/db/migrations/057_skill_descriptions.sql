-- Add description and invocation control to skills for progressive loading
ALTER TABLE context_skills
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS auto_invoke boolean NOT NULL DEFAULT true;

-- Description: short summary of what the skill does and when to use it (for AI matching)
-- auto_invoke: if true, AI can auto-load this skill based on prompt relevance.
--              if false, skill is only loaded via explicit /skill-name invocation.
COMMENT ON COLUMN context_skills.description IS 'Short description for progressive loading and AI matching (~1-2 sentences)';
COMMENT ON COLUMN context_skills.auto_invoke IS 'When true, skill is auto-matched against prompts. When false, only explicit /name invocation.';
