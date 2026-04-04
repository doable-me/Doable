import type postgres from "postgres";
import type { ContextSkillRow, ContextRuleRow } from "./skills.js";
import type { WorkspaceContextFileRow } from "./context.js";
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

/** Environment with resolved items from workspace tables */
export interface EnvironmentWithItems extends EnvironmentRow {
  skills: ContextSkillRow[];
  rules: ContextRuleRow[];
  instructions: EnvironmentInstructionRow[];
  knowledge: WorkspaceContextFileRow[];
  connectors: McpConnectorRow[];
  /** IDs of referenced items (for the picker UI) */
  skillRefs: string[];
  ruleRefs: string[];
  contextRefs: string[];
  connectorRefs: string[];
}

// ─── Queries ──────────────────────────────────────────────

export function environmentQueries(sql: postgres.Sql) {
  return {
    // ── List environments for a workspace (own + applied) ──
    async listForWorkspace(workspaceId: string): Promise<EnvironmentRow[]> {
      return sql<EnvironmentRow[]>`
        SELECT DISTINCT e.* FROM environments e
        LEFT JOIN workspace_environments we
          ON we.environment_id = e.id AND we.workspace_id = ${workspaceId}
        WHERE e.workspace_id = ${workspaceId}
           OR we.workspace_id IS NOT NULL
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
        sql<(WorkspaceContextFileRow & { ref_id: string })[]>`
          SELECT wcf.*, ecr.id AS ref_id
          FROM workspace_context_files wcf
          JOIN environment_context_refs ecr ON ecr.context_file_id = wcf.id
          WHERE ecr.environment_id = ${id}
          ORDER BY wcf.filename
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
        contextRefs: knowledge.map((k) => k.id),
        connectorRefs: connectors.map((c) => c.id),
      };
    },

    // ── Get "default" virtual environment = all workspace items ──
    async getDefaultItems(workspaceId: string): Promise<{
      skills: ContextSkillRow[];
      rules: ContextRuleRow[];
      knowledge: WorkspaceContextFileRow[];
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
        sql<WorkspaceContextFileRow[]>`
          SELECT * FROM workspace_context_files
          WHERE workspace_id = ${workspaceId}
          ORDER BY filename
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
    }): Promise<EnvironmentRow> {
      const [env] = await sql<EnvironmentRow[]>`
        INSERT INTO environments (workspace_id, created_by, name, description, icon, color, is_template)
        VALUES (
          ${data.workspaceId},
          ${data.createdBy},
          ${data.name},
          ${data.description ?? ""},
          ${data.icon ?? "🔧"},
          ${data.color ?? "blue"},
          ${data.isTemplate ?? false}
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

    // ── Workspace ↔ Environment linking ──

    async applyToWorkspace(workspaceId: string, environmentId: string, isDefault?: boolean): Promise<WorkspaceEnvironmentRow> {
      const [row] = await sql<WorkspaceEnvironmentRow[]>`
        INSERT INTO workspace_environments (workspace_id, environment_id, is_default)
        VALUES (${workspaceId}, ${environmentId}, ${isDefault ?? false})
        ON CONFLICT (workspace_id, environment_id) DO UPDATE SET applied_at = now()
        RETURNING *
      `;
      return row!;
    },

    async setDefault(workspaceId: string, environmentId: string): Promise<void> {
      await sql`UPDATE workspace_environments SET is_default = false WHERE workspace_id = ${workspaceId}`;
      await sql`
        UPDATE workspace_environments
        SET is_default = true
        WHERE workspace_id = ${workspaceId} AND environment_id = ${environmentId}
      `;
    },

    async getDefault(workspaceId: string): Promise<EnvironmentRow | null> {
      const [env] = await sql<EnvironmentRow[]>`
        SELECT e.* FROM environments e
        JOIN workspace_environments we ON we.environment_id = e.id
        WHERE we.workspace_id = ${workspaceId} AND we.is_default = true
      `;
      return env ?? null;
    },

    async removeFromWorkspace(workspaceId: string, environmentId: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM workspace_environments
        WHERE workspace_id = ${workspaceId} AND environment_id = ${environmentId}
      `;
      return result.count > 0;
    },

    async listAppliedToWorkspace(workspaceId: string): Promise<EnvironmentRow[]> {
      return sql<EnvironmentRow[]>`
        SELECT e.* FROM environments e
        JOIN workspace_environments we ON we.environment_id = e.id
        WHERE we.workspace_id = ${workspaceId}
        ORDER BY we.applied_at DESC
      `;
    },

    // ── Clone an environment (copies refs + instructions) ──
    async clone(sourceId: string, targetWorkspaceId: string, createdBy: string, newName?: string): Promise<EnvironmentRow> {
      const source = await this.getById(sourceId);
      if (!source) throw new Error("Source environment not found");

      const env = await this.create({
        workspaceId: targetWorkspaceId,
        createdBy,
        name: newName ?? `${source.name} (Copy)`,
        description: source.description,
        icon: source.icon,
        color: source.color,
      });

      // Clone refs + instructions
      await Promise.all([
        ...source.skills.map((s) => this.addSkillRef(env.id, s.id)),
        ...source.rules.map((r) => this.addRuleRef(env.id, r.id)),
        ...source.knowledge.map((k) => this.addContextRef(env.id, k.id)),
        ...source.connectors.map((c) => this.addConnectorRef(env.id, c.id)),
        ...source.instructions.map((i) => this.addInstruction(env.id, i.filename, i.content)),
      ]);

      return env;
    },
  };
}
