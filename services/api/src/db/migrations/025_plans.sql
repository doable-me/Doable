-- Plan Mode V2: Structured plans with steps
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  complexity TEXT NOT NULL DEFAULT 'moderate',
  status TEXT NOT NULL DEFAULT 'draft',
  original_prompt TEXT,
  clarification_answers JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS plan_steps (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  file_paths TEXT[],
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_plans_project ON plans(project_id);
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
CREATE INDEX IF NOT EXISTS idx_plan_steps_plan ON plan_steps(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_steps_order ON plan_steps(plan_id, "order");
