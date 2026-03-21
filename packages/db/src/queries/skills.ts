import type postgres from "postgres";

// ─── Row Types ────────────────────────────────────────────

export interface ContextSkillRow {
  id: string;
  scope: "workspace" | "project" | "user";
  workspace_id: string;
  project_id: string | null;
  user_id: string | null;
  skill_name: string;
  skill_content: string;
  created_at: Date;
  updated_at: Date;
}

export interface ContextRuleRow {
  id: string;
  scope: "workspace" | "project" | "user";
  workspace_id: string;
  project_id: string | null;
  user_id: string | null;
  rule_name: string;
  file_patterns: string[];
  content: string;
  created_at: Date;
  updated_at: Date;
}

// ─── Queries ──────────────────────────────────────────────

export function skillsQueries(sql: postgres.Sql) {
  return {
    // ── Skills ──
    async listSkills(workspaceId: string, projectId?: string) {
      if (projectId) {
        return sql<ContextSkillRow[]>`
          SELECT * FROM context_skills
          WHERE workspace_id = ${workspaceId}
            AND (project_id IS NULL OR project_id = ${projectId})
          ORDER BY scope, skill_name
        `;
      }
      return sql<ContextSkillRow[]>`
        SELECT * FROM context_skills
        WHERE workspace_id = ${workspaceId}
        ORDER BY scope, skill_name
      `;
    },

    async getSkill(workspaceId: string, skillName: string, scope: string, projectId?: string) {
      if (scope === "project" && projectId) {
        const [row] = await sql<ContextSkillRow[]>`
          SELECT * FROM context_skills
          WHERE workspace_id = ${workspaceId} AND skill_name = ${skillName}
            AND scope = ${scope} AND project_id = ${projectId}
        `;
        return row ?? null;
      }
      const [row] = await sql<ContextSkillRow[]>`
        SELECT * FROM context_skills
        WHERE workspace_id = ${workspaceId} AND skill_name = ${skillName} AND scope = ${scope}
      `;
      return row ?? null;
    },

    async createSkill(params: {
      workspaceId: string;
      scope: string;
      skillName: string;
      skillContent: string;
      projectId?: string;
      userId?: string;
    }) {
      const [row] = await sql<ContextSkillRow[]>`
        INSERT INTO context_skills (workspace_id, scope, skill_name, skill_content, project_id, user_id)
        VALUES (${params.workspaceId}, ${params.scope}, ${params.skillName}, ${params.skillContent}, ${params.projectId ?? null}, ${params.userId ?? null})
        RETURNING *
      `;
      return row!;
    },

    async updateSkill(id: string, skillContent: string) {
      const [row] = await sql<ContextSkillRow[]>`
        UPDATE context_skills SET skill_content = ${skillContent}, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return row ?? null;
    },

    async deleteSkill(id: string) {
      const result = await sql`DELETE FROM context_skills WHERE id = ${id}`;
      return result.count > 0;
    },

    // ── Rules ──
    async listRules(workspaceId: string, projectId?: string) {
      if (projectId) {
        return sql<ContextRuleRow[]>`
          SELECT * FROM context_rules
          WHERE workspace_id = ${workspaceId}
            AND (project_id IS NULL OR project_id = ${projectId})
          ORDER BY scope, rule_name
        `;
      }
      return sql<ContextRuleRow[]>`
        SELECT * FROM context_rules
        WHERE workspace_id = ${workspaceId}
        ORDER BY scope, rule_name
      `;
    },

    async getMatchingRules(workspaceId: string, projectId: string | null, filePath: string) {
      // Returns rules where any file_pattern matches the given filePath
      // Uses SQL pattern matching with LIKE
      return sql<ContextRuleRow[]>`
        SELECT * FROM context_rules
        WHERE workspace_id = ${workspaceId}
          AND (project_id IS NULL OR project_id = ${projectId})
          AND EXISTS (
            SELECT 1 FROM unnest(file_patterns) AS p
            WHERE ${filePath} LIKE replace(replace(p, '*', '%'), '?', '_')
          )
        ORDER BY scope, rule_name
      `;
    },

    async createRule(params: {
      workspaceId: string;
      scope: string;
      ruleName: string;
      content: string;
      filePatterns: string[];
      projectId?: string;
      userId?: string;
    }) {
      const [row] = await sql<ContextRuleRow[]>`
        INSERT INTO context_rules (workspace_id, scope, rule_name, content, file_patterns, project_id, user_id)
        VALUES (${params.workspaceId}, ${params.scope}, ${params.ruleName}, ${params.content}, ${params.filePatterns}, ${params.projectId ?? null}, ${params.userId ?? null})
        RETURNING *
      `;
      return row!;
    },

    async updateRule(id: string, content: string, filePatterns?: string[]) {
      if (filePatterns) {
        const [row] = await sql<ContextRuleRow[]>`
          UPDATE context_rules SET content = ${content}, file_patterns = ${filePatterns}, updated_at = now()
          WHERE id = ${id}
          RETURNING *
        `;
        return row ?? null;
      }
      const [row] = await sql<ContextRuleRow[]>`
        UPDATE context_rules SET content = ${content}, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return row ?? null;
    },

    async deleteRule(id: string) {
      const result = await sql`DELETE FROM context_rules WHERE id = ${id}`;
      return result.count > 0;
    },
  };
}
