import type postgres from "postgres";
import type { WorkspaceRow, WorkspaceMemberRow, CreditsRow } from "../types.js";
import type { WorkspacePlan, WorkspaceRole } from "@doable/shared";
import { PLAN_LIMITS } from "@doable/shared";

export function workspaceQueries(sql: postgres.Sql) {
  return {
    async findById(id: string): Promise<WorkspaceRow | undefined> {
      const [workspace] = await sql<WorkspaceRow[]>`
        SELECT * FROM workspaces WHERE id = ${id}
      `;
      return workspace;
    },

    async findBySlug(slug: string): Promise<WorkspaceRow | undefined> {
      const [workspace] = await sql<WorkspaceRow[]>`
        SELECT * FROM workspaces WHERE slug = ${slug}
      `;
      return workspace;
    },

    async listByUser(userId: string): Promise<WorkspaceRow[]> {
      return sql<WorkspaceRow[]>`
        SELECT w.* FROM workspaces w
        INNER JOIN workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = ${userId}
        ORDER BY w.updated_at DESC
      `;
    },

    async create(
      data: {
        name: string;
        slug: string;
        description?: string;
        ownerId: string;
        plan?: WorkspacePlan;
      },
      tx?: postgres.Sql
    ): Promise<WorkspaceRow> {
      const q = tx ?? sql;
      const plan = data.plan ?? "free";
      const limits = PLAN_LIMITS[plan];

      // Create workspace, owner membership, and initial credits in a transaction
      const [workspace] = await q<WorkspaceRow[]>`
        INSERT INTO workspaces (name, slug, description, owner_id, plan)
        VALUES (${data.name}, ${data.slug}, ${data.description ?? null}, ${data.ownerId}, ${plan})
        RETURNING *
      `;

      await q`
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES (${workspace!.id}, ${data.ownerId}, 'owner')
      `;

      await q`
        INSERT INTO credits (workspace_id, daily_remaining, monthly_remaining)
        VALUES (${workspace!.id}, ${limits.dailyCredits}, ${limits.monthlyCredits})
      `;

      return workspace!;
    },

    async update(
      id: string,
      data: Partial<{
        name: string;
        description: string;
        avatarUrl: string;
        plan: WorkspacePlan;
      }>
    ): Promise<WorkspaceRow | undefined> {
      const values: Record<string, unknown> = {};

      if (data.name !== undefined) values.name = data.name;
      if (data.description !== undefined) values.description = data.description;
      if (data.avatarUrl !== undefined) values.avatar_url = data.avatarUrl;
      if (data.plan !== undefined) values.plan = data.plan;

      if (Object.keys(values).length === 0) return this.findById(id);

      const [workspace] = await sql<WorkspaceRow[]>`
        UPDATE workspaces
        SET ${sql(values as Record<string, postgres.SerializableParameter>)}
        WHERE id = ${id}
        RETURNING *
      `;
      return workspace;
    },

    async delete(id: string): Promise<boolean> {
      const result = await sql`DELETE FROM workspaces WHERE id = ${id}`;
      return result.count > 0;
    },

    // ─── Members ──────────────────────────────────────────────
    async listMembers(workspaceId: string): Promise<WorkspaceMemberRow[]> {
      return sql<WorkspaceMemberRow[]>`
        SELECT * FROM workspace_members
        WHERE workspace_id = ${workspaceId}
        ORDER BY joined_at ASC
      `;
    },

    async addMember(
      workspaceId: string,
      userId: string,
      role: WorkspaceRole = "member"
    ): Promise<WorkspaceMemberRow> {
      const [member] = await sql<WorkspaceMemberRow[]>`
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES (${workspaceId}, ${userId}, ${role})
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = ${role}
        RETURNING *
      `;
      return member!;
    },

    async removeMember(workspaceId: string, userId: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM workspace_members
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      `;
      return result.count > 0;
    },

    async getMemberRole(
      workspaceId: string,
      userId: string
    ): Promise<WorkspaceRole | null> {
      const [member] = await sql<WorkspaceMemberRow[]>`
        SELECT * FROM workspace_members
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      `;
      return member?.role ?? null;
    },

    // ─── Credits ──────────────────────────────────────────────
    async getCredits(workspaceId: string): Promise<CreditsRow | undefined> {
      const [credits] = await sql<CreditsRow[]>`
        SELECT * FROM credits WHERE workspace_id = ${workspaceId}
      `;
      return credits;
    },

    async decrementCredits(workspaceId: string): Promise<boolean> {
      const result = await sql`
        UPDATE credits
        SET daily_remaining = daily_remaining - 1
        WHERE workspace_id = ${workspaceId}
          AND daily_remaining > 0
      `;
      return result.count > 0;
    },
  };
}
