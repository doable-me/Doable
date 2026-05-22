/**
 * Sandbox rule queries.
 *
 * Lightweight wrapper around the `workspace_sandbox_settings` and
 * `workspace_sandbox_rules` tables (Migration 073). Lives in the API
 * service rather than `@doable/db` because it's tightly coupled to the
 * sandbox enforcement layer next door (rule-matcher.ts).
 */

import { sql } from "../db/index.js";
import type { SandboxRule, SandboxRuleAction, SandboxRuleType } from "./rule-matcher.js";

export interface SandboxSettingsRow {
  workspace_id: string;
  tool_default_action: SandboxRuleAction;
  network_default_action: SandboxRuleAction;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Fetch settings for a workspace; returns the row-with-defaults shape
 * even when no row has been inserted yet (saves the caller from
 * special-casing the empty state in every consumer).
 */
export async function getSandboxSettings(
  workspaceId: string,
): Promise<{ tool_default_action: SandboxRuleAction; network_default_action: SandboxRuleAction }> {
  const [row] = await sql<{
    tool_default_action: SandboxRuleAction;
    network_default_action: SandboxRuleAction;
  }[]>`
    SELECT tool_default_action, network_default_action
    FROM workspace_sandbox_settings
    WHERE workspace_id = ${workspaceId}
  `;
  return row ?? { tool_default_action: "allow", network_default_action: "allow" };
}

export async function upsertSandboxSettings(
  workspaceId: string,
  data: {
    tool_default_action?: SandboxRuleAction;
    network_default_action?: SandboxRuleAction;
    updatedBy: string;
  },
): Promise<SandboxSettingsRow> {
  const [row] = await sql<SandboxSettingsRow[]>`
    INSERT INTO workspace_sandbox_settings (
      workspace_id, tool_default_action, network_default_action, updated_by
    ) VALUES (
      ${workspaceId},
      COALESCE(${data.tool_default_action ?? null}, 'allow'),
      COALESCE(${data.network_default_action ?? null}, 'allow'),
      ${data.updatedBy}
    )
    ON CONFLICT (workspace_id) DO UPDATE SET
      tool_default_action    = COALESCE(${data.tool_default_action ?? null}, workspace_sandbox_settings.tool_default_action),
      network_default_action = COALESCE(${data.network_default_action ?? null}, workspace_sandbox_settings.network_default_action),
      updated_by             = ${data.updatedBy}
    RETURNING *
  `;
  return row!;
}

export async function listSandboxRules(workspaceId: string): Promise<SandboxRule[]> {
  return sql<SandboxRule[]>`
    SELECT id, workspace_id, rule_type, pattern, action, priority, description
    FROM workspace_sandbox_rules
    WHERE workspace_id = ${workspaceId}
    ORDER BY rule_type, priority ASC, created_at ASC
  `;
}

export async function addSandboxRule(data: {
  workspaceId: string;
  ruleType: SandboxRuleType;
  pattern: string;
  action: SandboxRuleAction;
  priority?: number;
  description?: string | null;
  createdBy: string;
}): Promise<SandboxRule> {
  const [row] = await sql<SandboxRule[]>`
    INSERT INTO workspace_sandbox_rules (
      workspace_id, rule_type, pattern, action, priority, description, created_by
    ) VALUES (
      ${data.workspaceId},
      ${data.ruleType}::sandbox_rule_type,
      ${data.pattern},
      ${data.action}::sandbox_rule_action,
      ${data.priority ?? 100},
      ${data.description ?? null},
      ${data.createdBy}
    )
    RETURNING id, workspace_id, rule_type, pattern, action, priority, description
  `;
  return row!;
}

export async function updateSandboxRule(
  ruleId: string,
  data: {
    pattern?: string;
    action?: SandboxRuleAction;
    priority?: number;
    description?: string | null;
  },
): Promise<SandboxRule | undefined> {
  const [row] = await sql<SandboxRule[]>`
    UPDATE workspace_sandbox_rules
    SET pattern     = COALESCE(${data.pattern ?? null}, pattern),
        action      = COALESCE(${data.action ?? null}::sandbox_rule_action, action),
        priority    = COALESCE(${data.priority ?? null}, priority),
        description = COALESCE(${data.description ?? null}, description)
    WHERE id = ${ruleId}
    RETURNING id, workspace_id, rule_type, pattern, action, priority, description
  `;
  return row;
}

export async function deleteSandboxRule(ruleId: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM workspace_sandbox_rules WHERE id = ${ruleId}
  `;
  return result.count > 0;
}

/**
 * Return just the workspace_id of a rule — used by routes to verify the
 * rule belongs to the workspace in the URL before any mutation.
 */
export async function getSandboxRuleWorkspaceId(
  ruleId: string,
): Promise<string | null> {
  const [row] = await sql<{ workspace_id: string }[]>`
    SELECT workspace_id FROM workspace_sandbox_rules WHERE id = ${ruleId}
  `;
  return row?.workspace_id ?? null;
}
