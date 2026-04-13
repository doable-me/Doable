import type postgres from "postgres";
import type { EnvironmentRow, EnvironmentWithItems, EnvironmentKnowledgeRow, EnvironmentInstructionRow, SkillRefRow, RuleRefRow, ContextRefRow, ConnectorRefRow } from "./environments-types.js";
import type { ContextSkillRow, ContextRuleRow } from "./skills.js";
import type { McpConnectorRow } from "./connectors.js";

export function environmentCoreQueries(sql: postgres.Sql) {
  return {
    // ── List environments for a workspace (own + applied) ──
    async listForWorkspace(workspaceId: string, opts?: { scope?: 'workspace' | 'project' | 'user'; projectId?: string }): Promise<EnvironmentRow[]> {
      if (opts?.projectId) {
        // When filtering by project, return only the project's environment
        return sql<EnvironmentRow[]>`
          SELECT * FROM environments
          WHERE project_id = ${opts.projectId} AND scope = 'project'
          ORDER BY name
        `;
      }
      if (opts?.scope) {
        return sql<EnvironmentRow[]>`
          SELECT DISTINCT e.* FROM environments e
          LEFT JOIN workspace_environments we
            ON we.environment_id = e.id AND we.workspace_id = ${workspaceId}
          WHERE (e.workspace_id = ${workspaceId} OR we.workspace_id IS NOT NULL)
            AND e.scope = ${opts.scope}
          ORDER BY e.name
        `;
      }
      // Default: exclude project-scoped envs (those are accessed via their projects)
      return sql<EnvironmentRow[]>`
        SELECT DISTINCT e.* FROM environments e
        LEFT JOIN workspace_environments we
          ON we.environment_id = e.id AND we.workspace_id = ${workspaceId}
        WHERE (e.workspace_id = ${workspaceId} OR we.workspace_id IS NOT NULL)
          AND e.scope != 'project'
        ORDER BY e.name
      `;
    },

    // ── List public template environments ──
    async listTemplates(): Promise<EnvironmentRow[]> {
      return sql<EnvironmentRow[]>`
        SELECT * FROM environments
        WHERE is_template = true
        ORDER BY name
      `;
    },

    // ── Get environment with all resolved items ──
    async getById(id: string): Promise<EnvironmentWithItems | null> {
      const [env] = await sql<EnvironmentRow[]>`
        SELECT * FROM environments WHERE id = ${id}
      `;
      if (!env) return null;

      const [skills, rules, instructions, knowledge, connectors] = await Promise.all([
        sql<(ContextSkillRow & { ref_id: string })[]>`
          SELECT cs.*, esr.id AS ref_id
          FROM context_skills cs
          JOIN environment_skill_refs esr ON esr.skill_id = cs.id
          WHERE esr.environment_id = ${id}
          ORDER BY cs.skill_name
        `,
        sql<(ContextRuleRow & { ref_id: string })[]>`
          SELECT cr.*, err.id AS ref_id
          FROM context_rules cr
          JOIN environment_rule_refs err ON err.rule_id = cr.id
          WHERE err.environment_id = ${id}
          ORDER BY cr.rule_name
        `,
        sql<EnvironmentInstructionRow[]>`
          SELECT * FROM environment_instructions
          WHERE environment_id = ${id}
          ORDER BY filename
        `,
        sql<EnvironmentKnowledgeRow[]>`
          SELECT * FROM environment_knowledge
          WHERE environment_id = ${id}
          ORDER BY filename
        `,
        sql<(McpConnectorRow & { ref_id: string })[]>`
          SELECT mc.*, ecnr.id AS ref_id
          FROM mcp_connectors mc
          JOIN environment_connector_refs ecnr ON ecnr.connector_id = mc.id
          WHERE ecnr.environment_id = ${id}
          ORDER BY mc.name
        `,
      ]);

      return {
        ...env,
        skills,
        rules,
        instructions,
        knowledge,
        connectors,
        skillRefs: skills.map((s) => s.id),
        ruleRefs: rules.map((r) => r.id),
        connectorRefs: connectors.map((c) => c.id),
      };
    },

    // ── Get "default" virtual environment = all workspace items ──
    async getDefaultItems(workspaceId: string): Promise<{
      skills: ContextSkillRow[];
      rules: ContextRuleRow[];
      knowledge: EnvironmentKnowledgeRow[];
      connectors: McpConnectorRow[];
    }> {
      const [skills, rules, knowledge, connectors] = await Promise.all([
        sql<ContextSkillRow[]>`
          SELECT * FROM context_skills
          WHERE workspace_id = ${workspaceId} AND scope = 'workspace'
          ORDER BY skill_name
        `,
        sql<ContextRuleRow[]>`
          SELECT * FROM context_rules
          WHERE workspace_id = ${workspaceId} AND scope = 'workspace'
          ORDER BY rule_name
        `,
        sql<EnvironmentKnowledgeRow[]>`
          SELECT ek.* FROM environment_knowledge ek
          JOIN environments e ON e.id = ek.environment_id
          WHERE e.workspace_id = ${workspaceId} AND e.scope = 'workspace'
          ORDER BY ek.filename
        `,
        sql<McpConnectorRow[]>`
          SELECT * FROM mcp_connectors
          WHERE workspace_id = ${workspaceId} AND scope = 'workspace'
          ORDER BY name
        `,
      ]);
      return { skills, rules, knowledge, connectors };
    },

    // ── Create environment ──
    async create(data: {
      workspaceId: string;
      createdBy: string;
      name: string;
      description?: string;
      icon?: string;
      color?: string;
      isTemplate?: boolean;
      scope?: "workspace" | "project" | "user";
      projectId?: string;
      userId?: string;
    }): Promise<EnvironmentRow> {
      const [env] = await sql<EnvironmentRow[]>`
        INSERT INTO environments (workspace_id, created_by, name, description, icon, color, is_template, scope, project_id, user_id)
        VALUES (
          ${data.workspaceId},
          ${data.createdBy},
          ${data.name},
          ${data.description ?? ""},
          ${data.icon ?? "🔧"},
          ${data.color ?? "blue"},
          ${data.isTemplate ?? false},
          ${data.scope ?? "workspace"},
          ${data.projectId ?? null},
          ${data.userId ?? null}
        )
        RETURNING *
      `;
      return env!;
    },

    // ── Update environment metadata ──
    async update(
      id: string,
      data: { name?: string; description?: string; icon?: string; color?: string; isTemplate?: boolean },
    ): Promise<EnvironmentRow | null> {
      const [env] = await sql<EnvironmentRow[]>`
        UPDATE environments SET
          name = COALESCE(${data.name ?? null}, name),
          description = COALESCE(${data.description ?? null}, description),
          icon = COALESCE(${data.icon ?? null}, icon),
          color = COALESCE(${data.color ?? null}, color),
          is_template = COALESCE(${data.isTemplate ?? null}, is_template),
          updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return env ?? null;
    },

    // ── Delete environment ──
    async remove(id: string): Promise<boolean> {
      const result = await sql`DELETE FROM environments WHERE id = ${id}`;
      return result.count > 0;
    },

    // ── Ref-based item management (add/remove references) ──

    async addSkillRef(environmentId: string, skillId: string): Promise<SkillRefRow> {
      const [row] = await sql<SkillRefRow[]>`
        INSERT INTO environment_skill_refs (environment_id, skill_id)
        VALUES (${environmentId}, ${skillId})
        ON CONFLICT (environment_id, skill_id) DO UPDATE SET environment_id = excluded.environment_id
        RETURNING *
      `;
      return row!;
    },

    async removeSkillRef(environmentId: string, skillId: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM environment_skill_refs
        WHERE environment_id = ${environmentId} AND skill_id = ${skillId}
      `;
      return result.count > 0;
    },

    async addRuleRef(environmentId: string, ruleId: string): Promise<RuleRefRow> {
      const [row] = await sql<RuleRefRow[]>`
        INSERT INTO environment_rule_refs (environment_id, rule_id)
        VALUES (${environmentId}, ${ruleId})
        ON CONFLICT (environment_id, rule_id) DO UPDATE SET environment_id = excluded.environment_id
        RETURNING *
      `;
      return row!;
    },

    async removeRuleRef(environmentId: string, ruleId: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM environment_rule_refs
        WHERE environment_id = ${environmentId} AND rule_id = ${ruleId}
      `;
      return result.count > 0;
    },

    async addContextRef(environmentId: string, contextFileId: string): Promise<ContextRefRow> {
      const [row] = await sql<ContextRefRow[]>`
        INSERT INTO environment_context_refs (environment_id, context_file_id)
        VALUES (${environmentId}, ${contextFileId})
        ON CONFLICT (environment_id, context_file_id) DO UPDATE SET environment_id = excluded.environment_id
        RETURNING *
      `;
      return row!;
    },

    async removeContextRef(environmentId: string, contextFileId: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM environment_context_refs
        WHERE environment_id = ${environmentId} AND context_file_id = ${contextFileId}
      `;
      return result.count > 0;
    },

    async addConnectorRef(environmentId: string, connectorId: string): Promise<ConnectorRefRow> {
      const [row] = await sql<ConnectorRefRow[]>`
        INSERT INTO environment_connector_refs (environment_id, connector_id)
        VALUES (${environmentId}, ${connectorId})
        ON CONFLICT (environment_id, connector_id) DO UPDATE SET environment_id = excluded.environment_id
        RETURNING *
      `;
      return row!;
    },

    async removeConnectorRef(environmentId: string, connectorId: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM environment_connector_refs
        WHERE environment_id = ${environmentId} AND connector_id = ${connectorId}
      `;
      return result.count > 0;
    },

    // ── Instructions CRUD (no standalone equivalent, stays as snapshot) ──

    async addInstruction(environmentId: string, filename: string, content: string): Promise<EnvironmentInstructionRow> {
      const [row] = await sql<EnvironmentInstructionRow[]>`
        INSERT INTO environment_instructions (environment_id, filename, content)
        VALUES (${environmentId}, ${filename}, ${content})
        RETURNING *
      `;
      return row!;
    },

    async updateInstruction(id: string, data: { filename?: string; content?: string }): Promise<EnvironmentInstructionRow | null> {
      const [row] = await sql<EnvironmentInstructionRow[]>`
        UPDATE environment_instructions SET
          filename = COALESCE(${data.filename ?? null}, filename),
          content = COALESCE(${data.content ?? null}, content)
        WHERE id = ${id}
        RETURNING *
      `;
      return row ?? null;
    },

    async removeInstruction(id: string): Promise<boolean> {
      const result = await sql`DELETE FROM environment_instructions WHERE id = ${id}`;
      return result.count > 0;
    },

    // ── Knowledge CRUD (direct ownership via environment_knowledge) ──

    async listKnowledge(environmentId: string): Promise<EnvironmentKnowledgeRow[]> {
      return sql<EnvironmentKnowledgeRow[]>`
        SELECT * FROM environment_knowledge
        WHERE environment_id = ${environmentId}
        ORDER BY filename
      `;
    },

    async getKnowledgeFile(environmentId: string, filename: string): Promise<EnvironmentKnowledgeRow | null> {
      const [row] = await sql<EnvironmentKnowledgeRow[]>`
        SELECT * FROM environment_knowledge
        WHERE environment_id = ${environmentId} AND filename = ${filename}
      `;
      return row ?? null;
    },

    async upsertKnowledge(environmentId: string, filename: string, content: string): Promise<EnvironmentKnowledgeRow> {
      const [row] = await sql<EnvironmentKnowledgeRow[]>`
        INSERT INTO environment_knowledge (environment_id, filename, content)
        VALUES (${environmentId}, ${filename}, ${content})
        ON CONFLICT (environment_id, filename)
        DO UPDATE SET content = ${content}, updated_at = now()
        RETURNING *
      `;
      return row!;
    },

    async removeKnowledge(environmentId: string, filename: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM environment_knowledge
        WHERE environment_id = ${environmentId} AND filename = ${filename}
      `;
      return result.count > 0;
    },
  };
}