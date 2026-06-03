import type postgres from "postgres";
import type {
  WorkspaceRow,
  WorkspaceMemberRow,
  WorkspaceMemberWithUserRow,
  WorkspaceInviteRow,
  CreditsRow,
} from "../types.js";
import type { WorkspacePlan, WorkspaceRole } from "@doable/shared";
import { PLAN_LIMITS, WORKSPACE_PLANS } from "@doable/shared";
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

    /**
     * Highest plan among the workspaces this user OWNS, ranked by the
     * WORKSPACE_PLANS order (free < pro < business < enterprise). Used so a
     * newly created workspace inherits the creator's plan instead of being born
     * on 'free' (which imposes the 3-project + low-credit caps). Returns 'free'
     * when the user owns no workspaces yet. On self-hosted, the owner's primary
     * workspace is 'enterprise' (firstUserBootstrap), so this returns
     * 'enterprise' and new workspaces inherit it.
     */
    async highestOwnedPlan(userId: string): Promise<WorkspacePlan> {
      const rows = await sql<{ plan: WorkspacePlan }[]>`
        SELECT plan FROM workspaces WHERE owner_id = ${userId}
      `;
      let best: WorkspacePlan = "free";
      for (const { plan } of rows) {
        if (WORKSPACE_PLANS.indexOf(plan) > WORKSPACE_PLANS.indexOf(best)) {
          best = plan;
        }
      }
      return best;
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
      const plan = data.plan ?? "free";
      const limits = PLAN_LIMITS[plan];

      // Postgres integer columns cap at int32; the 'enterprise' plan's
      // dailyCredits/monthlyCredits are Infinity. Insert MAX_INT instead, exactly
      // as creditQueries does (queries/credits.ts) — otherwise the credit_balances
      // INSERT below throws 22P02 (invalid integer input) and the whole workspace
      // create 500s. This path was previously only exercised with plan='free'
      // (existing enterprise workspaces were created free then promoted), so the
      // Infinity case was latent until workspaces inherit 'enterprise' on create.
      const MAX_INT = 2147483647;
      const dailyCredits = Number.isFinite(limits.dailyCredits) ? limits.dailyCredits : MAX_INT;
      const monthlyCredits = Number.isFinite(limits.monthlyCredits) ? limits.monthlyCredits : MAX_INT;

      // The four inserts below MUST be atomic. If the workspace_members
      // insert fails (as happened when the 071 RLS WITH CHECK was recursive
      // — see migration 074), the caller would otherwise be left with an
      // orphan workspace row and a user who can't see it. Wrap in a
      // transaction whenever we don't already have one.
      const run = async (q: postgres.Sql): Promise<WorkspaceRow> => {
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
          INSERT INTO credit_balances (user_id, workspace_id, daily_credits, monthly_credits, rollover_credits, plan_type, daily_reset_at, monthly_reset_at)
          VALUES (
            ${data.ownerId}, ${workspace!.id},
            ${dailyCredits}, ${monthlyCredits}, 0, ${plan},
            now() + interval '1 day', now() + interval '1 month'
          )
          ON CONFLICT (user_id, workspace_id) DO NOTHING
        `;

        await q`
          INSERT INTO workspace_ai_settings (workspace_id, show_model_selector)
          VALUES (${workspace!.id}, false)
          ON CONFLICT (workspace_id) DO NOTHING
        `;

        return workspace!;
      };

      if (tx) return run(tx);
      return sql.begin((newTx) => run(newTx as unknown as postgres.Sql)) as Promise<WorkspaceRow>;
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

      // Shareable invite-links (email === '__invite_link__') are reusable by
      // multiple users and never get marked accepted. Per-email invites are
      // single-use and rejected once already accepted.
      const isLinkInvite = invite.email === "__invite_link__";
      if (!isLinkInvite && invite.accepted_at) return null;

      // Mark per-email invite as accepted (skip for shareable links so they
      // remain valid for additional invitees).
      let updatedInvite = invite;
      if (!isLinkInvite) {
        const [row] = await sql<WorkspaceInviteRow[]>`
          UPDATE workspace_invites
          SET accepted_at = now()
          WHERE id = ${invite.id}
          RETURNING *
        `;
        updatedInvite = row!;
      }

      // addMember is an upsert (ON CONFLICT DO UPDATE), so this safely handles
      // a user accepting an invite for a workspace they are already in.
      const member = await this.addMember(
        invite.workspace_id,
        userId,
        invite.role as WorkspaceRole,
        invite.invited_by
      );

      return { invite: updatedInvite, member };
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

    // ─── Credits (reads from credit_balances — the single source of truth) ──
    async getCredits(workspaceId: string): Promise<CreditsRow | undefined> {
      // Aggregate credit balances across all workspace members.
      // SUM is computed in bigint to avoid int4 overflow when multiple members
      // hold "unlimited" balances (INT_MAX). Result is clamped back to INT_MAX
      // before casting to int so the API contract is preserved.
      // CASE expressions handle expired daily/monthly resets: if the reset time
      // has passed, treat credits_used as 0 (since the next getCreditBalance
      // call will reset them). This prevents stale used counts from yesterday
      // inflating consumption in the sidebar display.
      const [row] = await sql<CreditsRow[]>`
        SELECT
          gen_random_uuid() as id,
          ${workspaceId}::uuid as workspace_id,
          LEAST(COALESCE(SUM(
            CASE WHEN daily_reset_at <= now()
              THEN daily_credits::bigint
              ELSE (daily_credits - daily_credits_used)::bigint
            END
          ), 0), 2147483647)::int as daily_remaining,
          LEAST(COALESCE(SUM(daily_credits::bigint), 0), 2147483647)::int as daily_total,
          LEAST(COALESCE(SUM(
            CASE WHEN monthly_reset_at <= now()
              THEN monthly_credits::bigint
              ELSE (monthly_credits - monthly_credits_used)::bigint
            END
          ), 0), 2147483647)::int as monthly_remaining,
          LEAST(COALESCE(SUM(rollover_credits::bigint), 0), 2147483647)::int as rollover_credits,
          MIN(daily_reset_at) as last_daily_reset,
          MIN(monthly_reset_at) as last_monthly_reset
        FROM credit_balances
        WHERE workspace_id = ${workspaceId}
      `;
      // If no rows, return undefined (workspace has no members with balances yet)
      if (row && row.daily_remaining === 0 && row.monthly_remaining === 0 && row.rollover_credits === 0) {
        // Check if there are actually any rows
        const [count] = await sql<[{ n: string }]>`
          SELECT count(*)::text as n FROM credit_balances WHERE workspace_id = ${workspaceId}
        `;
        if (count?.n === "0") return undefined;
      }
      return row;
    },
  };
}
