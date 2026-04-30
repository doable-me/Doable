import type postgres from "postgres";

// ─── Row Types ────────────────────────────────────────────

export interface ContextSkillRow {
  id: string;
  scope: "workspace" | "project" | "user";
  workspace_id: string;
  project_id: string | null;
  user_id: string | null;
  skill_name: string;
  description: string;
  skill_content: string;
  auto_invoke: boolean;
  created_at: Date;
  updated_at: Date;
}

/** Lightweight manifest for progressive loading (no full content) */
export interface SkillManifestRow {
  id: string;
  skill_name: string;
  description: string;
  scope: "workspace" | "project" | "user";
  auto_invoke: boolean;
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
      description: string;
      skillContent: string;
      autoInvoke?: boolean;
      projectId?: string;
      userId?: string;
    }) {
      const [row] = await sql<ContextSkillRow[]>`
        INSERT INTO context_skills (workspace_id, scope, skill_name, description, skill_content, auto_invoke, project_id, user_id)
        VALUES (${params.workspaceId}, ${params.scope}, ${params.skillName}, ${params.description}, ${params.skillContent}, ${params.autoInvoke ?? true}, ${params.projectId ?? null}, ${params.userId ?? null})
        RETURNING *
      `;
      return row!;
    },

    async updateSkill(id: string, updates: { skillContent?: string; description?: string; autoInvoke?: boolean }) {
      const [row] = await sql<ContextSkillRow[]>`
        UPDATE context_skills SET
          skill_content = COALESCE(${updates.skillContent ?? null}, skill_content),
          description = COALESCE(${updates.description ?? null}, description),
          auto_invoke = COALESCE(${updates.autoInvoke ?? null}, auto_invoke),
          updated_at = now()
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

    // ── Project-scoped queries (for context injection) ──
    async listProjectScopedSkills(workspaceId: string, projectId: string) {
      return sql<ContextSkillRow[]>`
        SELECT * FROM context_skills
        WHERE workspace_id = ${workspaceId}
          AND scope = 'project' AND project_id = ${projectId}
        ORDER BY skill_name
      `;
    },

    async listProjectScopedRules(workspaceId: string, projectId: string) {
      return sql<ContextRuleRow[]>`
        SELECT * FROM context_rules
        WHERE workspace_id = ${workspaceId}
          AND scope = 'project' AND project_id = ${projectId}
        ORDER BY rule_name
      `;
    },

    // ── Skill manifest (progressive loading — names + descriptions only) ──
    async listSkillManifest(workspaceId: string, projectId?: string): Promise<SkillManifestRow[]> {
      if (projectId) {
        return sql<SkillManifestRow[]>`
          SELECT id, skill_name, description, scope, auto_invoke
          FROM context_skills
          WHERE workspace_id = ${workspaceId}
            AND (project_id IS NULL OR project_id = ${projectId})
          ORDER BY scope, skill_name
        `;
      }
      return sql<SkillManifestRow[]>`
        SELECT id, skill_name, description, scope, auto_invoke
        FROM context_skills
        WHERE workspace_id = ${workspaceId}
        ORDER BY scope, skill_name
      `;
    },

    // ── Load full skill content by name (for /skill-name invocation) ──
    async getSkillByName(workspaceId: string, skillName: string, projectId?: string): Promise<ContextSkillRow | null> {
      if (projectId) {
        const [row] = await sql<ContextSkillRow[]>`
          SELECT * FROM context_skills
          WHERE workspace_id = ${workspaceId}
            AND skill_name = ${skillName}
            AND (project_id IS NULL OR project_id = ${projectId})
          ORDER BY CASE scope WHEN 'project' THEN 0 WHEN 'workspace' THEN 1 ELSE 2 END
          LIMIT 1
        `;
        return row ?? null;
      }
      const [row] = await sql<ContextSkillRow[]>`
        SELECT * FROM context_skills
        WHERE workspace_id = ${workspaceId}
          AND skill_name = ${skillName}
        ORDER BY CASE scope WHEN 'project' THEN 0 WHEN 'workspace' THEN 1 ELSE 2 END
        LIMIT 1
      `;
      return row ?? null;
    },

    // ── Load multiple skills by IDs (for auto-invoked skills) ──
    async getSkillsByIds(ids: string[]): Promise<ContextSkillRow[]> {
      if (ids.length === 0) return [];
      return sql<ContextSkillRow[]>`
        SELECT * FROM context_skills
        WHERE id = ANY(${ids})
      `;
    },
  };
}
