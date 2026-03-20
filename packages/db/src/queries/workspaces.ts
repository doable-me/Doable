import type postgres from "postgres";
import type {
  WorkspaceRow,
  WorkspaceMemberRow,
  WorkspaceMemberWithUserRow,
  WorkspaceInviteRow,
  CreditsRow,
} from "../types.js";
import type { WorkspacePlan, WorkspaceRole } from "@doable/shared";
import { PLAN_LIMITS } from "@doable/shared";
import crypto from "node:crypto";

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

    async getWorkspaceMembers(
      workspaceId: string
    ): Promise<WorkspaceMemberWithUserRow[]> {
      return sql<WorkspaceMemberWithUserRow[]>`
        SELECT
          wm.*,
          u.email,
          u.display_name,
          u.avatar_url
        FROM workspace_members wm
        INNER JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = ${workspaceId}
        ORDER BY
          CASE wm.role
            WHEN 'owner' THEN 0
            WHEN 'admin' THEN 1
            WHEN 'member' THEN 2
            WHEN 'viewer' THEN 3
          END,
          wm.joined_at ASC
      `;
    },

    async addMember(
      workspaceId: string,
      userId: string,
      role: WorkspaceRole = "member",
      invitedBy?: string
    ): Promise<WorkspaceMemberRow> {
      const [member] = await sql<WorkspaceMemberRow[]>`
        INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
        VALUES (${workspaceId}, ${userId}, ${role}, ${invitedBy ?? null})
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

    async updateMemberRole(
      workspaceId: string,
      userId: string,
      role: WorkspaceRole
    ): Promise<WorkspaceMemberRow | undefined> {
      const [member] = await sql<WorkspaceMemberRow[]>`
        UPDATE workspace_members
        SET role = ${role}
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
        RETURNING *
      `;
      return member;
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

    async getUserWorkspaces(
      userId: string
    ): Promise<(WorkspaceRow & { role: WorkspaceRole })[]> {
      return sql<(WorkspaceRow & { role: WorkspaceRole })[]>`
        SELECT w.*, wm.role
        FROM workspaces w
        INNER JOIN workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = ${userId}
        ORDER BY w.updated_at DESC
      `;
    },

    // ─── Invites ──────────────────────────────────────────────
    async createInvite(
      workspaceId: string,
      email: string,
      role: string,
      invitedBy: string,
      expiresInDays: number = 7
    ): Promise<WorkspaceInviteRow> {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const [invite] = await sql<WorkspaceInviteRow[]>`
        INSERT INTO workspace_invites (workspace_id, email, role, token, invited_by, expires_at)
        VALUES (${workspaceId}, ${email.toLowerCase()}, ${role}, ${token}, ${invitedBy}, ${expiresAt})
        RETURNING *
      `;
      return invite!;
    },

    async getInviteByToken(
      token: string
    ): Promise<WorkspaceInviteRow | undefined> {
      const [invite] = await sql<WorkspaceInviteRow[]>`
        SELECT * FROM workspace_invites
        WHERE token = ${token}
      `;
      return invite;
    },

    async acceptInvite(
      token: string,
      userId: string
    ): Promise<{ invite: WorkspaceInviteRow; member: WorkspaceMemberRow } | null> {
      const invite = await this.getInviteByToken(token);
      if (!invite) return null;

      // Check if expired
      if (new Date(invite.expires_at) < new Date()) return null;

      // Check if already accepted
      if (invite.accepted_at) return null;

      // Mark invite as accepted
      const [updatedInvite] = await sql<WorkspaceInviteRow[]>`
        UPDATE workspace_invites
        SET accepted_at = now()
        WHERE id = ${invite.id}
        RETURNING *
      `;

      // Add user as workspace member
      const member = await this.addMember(
        invite.workspace_id,
        userId,
        invite.role as WorkspaceRole,
        invite.invited_by
      );

      return { invite: updatedInvite!, member };
    },

    async listInvites(workspaceId: string): Promise<WorkspaceInviteRow[]> {
      return sql<WorkspaceInviteRow[]>`
        SELECT * FROM workspace_invites
        WHERE workspace_id = ${workspaceId}
          AND accepted_at IS NULL
          AND expires_at > now()
        ORDER BY created_at DESC
      `;
    },

    async revokeInvite(
      workspaceId: string,
      inviteId: string
    ): Promise<boolean> {
      const result = await sql`
        DELETE FROM workspace_invites
        WHERE id = ${inviteId} AND workspace_id = ${workspaceId}
      `;
      return result.count > 0;
    },

    async createInviteLink(
      workspaceId: string,
      role: string,
      invitedBy: string,
      expiresInDays: number = 7
    ): Promise<WorkspaceInviteRow> {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const [invite] = await sql<WorkspaceInviteRow[]>`
        INSERT INTO workspace_invites (workspace_id, email, role, token, invited_by, expires_at)
        VALUES (${workspaceId}, ${"__invite_link__"}, ${role}, ${token}, ${invitedBy}, ${expiresAt})
        RETURNING *
      `;
      return invite!;
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
