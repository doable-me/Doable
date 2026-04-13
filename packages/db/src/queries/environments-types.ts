import type postgres from "postgres";
import type { ContextSkillRow, ContextRuleRow } from "./skills.js";
import type { McpConnectorRow } from "./connectors.js";

// ─── Row Types ────────────────────────────────────────────

export interface EnvironmentRow {
  id: string;
  workspace_id: string | null;
  created_by: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  is_template: boolean;
  scope: "workspace" | "project" | "user";
  project_id: string | null;
  user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EnvironmentKnowledgeRow {
  id: string;
  environment_id: string;
  filename: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export interface EnvironmentInstructionRow {
  id: string;
  environment_id: string;
  filename: string;
  content: string;
  created_at: Date;
}

export interface RefRow {
  id: string;
  environment_id: string;
  created_at: Date;
}

export interface SkillRefRow extends RefRow { skill_id: string; }
export interface RuleRefRow extends RefRow { rule_id: string; }
export interface ContextRefRow extends RefRow { context_file_id: string; }
export interface ConnectorRefRow extends RefRow { connector_id: string; }

export interface WorkspaceEnvironmentRow {
  id: string;
  workspace_id: string;
  environment_id: string;
  is_default: boolean;
  applied_at: Date;
}

/** Environment with resolved items */
export interface EnvironmentWithItems extends EnvironmentRow {
  skills: ContextSkillRow[];
  rules: ContextRuleRow[];
  instructions: EnvironmentInstructionRow[];
  knowledge: EnvironmentKnowledgeRow[];
  connectors: McpConnectorRow[];
  /** IDs of referenced items (for the picker UI) */
  skillRefs: string[];
  ruleRefs: string[];
  connectorRefs: string[];
}

// ─── Queries ──────────────────────────────────────────────