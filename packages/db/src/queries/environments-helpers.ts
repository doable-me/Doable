import type postgres from "postgres";
import type { EnvironmentRow, EnvironmentWithItems, WorkspaceEnvironmentRow } from "./environments-types.js";
import type { environmentCoreQueries } from "./environments-core.js";

export function environmentHelperQueries(sql: postgres.Sql, core: ReturnType<typeof environmentCoreQueries>) {
  // Inner functions so getOrCreate* can reference them directly
  async function getForProject(projectId: string): Promise<EnvironmentRow | null> {
    const [env] = await sql<EnvironmentRow[]>`
      SELECT * FROM environments
      WHERE project_id = ${projectId} AND scope = 'project'
      LIMIT 1
    `;
    return env ?? null;
  }

  async function getForWorkspace(workspaceId: string): Promise<EnvironmentRow | null> {
    const [env] = await sql<EnvironmentRow[]>`
      SELECT * FROM environments
      WHERE workspace_id = ${workspaceId} AND scope = 'workspace' AND project_id IS NULL AND user_id IS NULL
      LIMIT 1
    `;
    return env ?? null;
  }

  async function getForUser(userId: string, workspaceId: string): Promise<EnvironmentRow | null> {
    const [env] = await sql<EnvironmentRow[]>`
      SELECT * FROM environments
      WHERE user_id = ${userId} AND workspace_id = ${workspaceId} AND scope = 'user'
      LIMIT 1
    `;
    return env ?? null;
  }

  return {
    // ── Scoped environment helpers ──
    getForProject,
    getForWorkspace,
    getForUser,

    async getOrCreateForProject(projectId: string, workspaceId: string, createdBy: string, projectName?: string): Promise<EnvironmentRow> {
      const existing = await getForProject(projectId);
      if (existing) return existing;
      return core.create({
        workspaceId,
        createdBy,
        name: projectName || "Project Knowledge",
        description: "Project context and knowledge files",
        icon: "📁",
        color: "green",
        scope: "project",
        projectId,
      });
    },

    async getOrCreateForWorkspace(workspaceId: string, createdBy: string): Promise<EnvironmentRow> {
      const existing = await getForWorkspace(workspaceId);
      if (existing) return existing;
      return core.create({
        workspaceId,
        createdBy,
        name: "Workspace Knowledge",
        description: "Workspace-level knowledge files",
        icon: "🌐",
        color: "blue",
        scope: "workspace",
      });
    },

    async getOrCreateForUser(userId: string, workspaceId: string): Promise<EnvironmentRow> {
      const existing = await getForUser(userId, workspaceId);
      if (existing) return existing;
      return core.create({
        workspaceId,
        createdBy: userId,
        name: "My Knowledge",
        description: "Personal knowledge files",
        icon: "👤",
        color: "purple",
        scope: "user",
        userId,
      });
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

    // ── Clone an environment (copies knowledge, refs & instructions) ──
    async clone(sourceId: string, targetWorkspaceId: string, createdBy: string, newName?: string): Promise<EnvironmentRow> {
      const source = await core.getById(sourceId);
      if (!source) throw new Error("Source environment not found");

      const env = await core.create({
        workspaceId: targetWorkspaceId,
        createdBy,
        name: newName ?? `${source.name} (Copy)`,
        description: source.description,
        icon: source.icon,
        color: source.color,
      });

      // Clone refs, knowledge & instructions
      await Promise.all([
        ...source.skills.map((s) => core.addSkillRef(env.id, s.id)),
        ...source.rules.map((r) => core.addRuleRef(env.id, r.id)),
        ...source.knowledge.map((k) => core.upsertKnowledge(env.id, k.filename, k.content)),
        ...source.connectors.map((c) => core.addConnectorRef(env.id, c.id)),
        ...source.instructions.map((i) => core.addInstruction(env.id, i.filename, i.content)),
      ]);

      return env;
    },
  };
}