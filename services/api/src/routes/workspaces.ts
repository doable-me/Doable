import { Hono, type Context } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { workspaceQueries, userQueries, environmentQueries } from "@doable/db";
import { type AuthEnv } from "../middleware/auth.js";
import { authMiddlewareWithRls } from "../middleware/rls.js";
import { requireRole } from "../middleware/workspace-role.js";
import { SLUG_REGEX, SLUG_MIN_LENGTH, SLUG_MAX_LENGTH, type WorkspacePlan } from "@doable/shared";
import { getEffectivePlanLimits } from "./admin-plan-limits.js";
import { sendTemplatedEmail } from "../lib/email.js";
import { ensureBuiltinConnectorsForWorkspace } from "../mcp/builtin-connectors.js";

const workspaces = workspaceQueries(sql);
const users = userQueries(sql);
const envs = environmentQueries(sql);

export const workspaceRoutes = new Hono<AuthEnv>({ strict: false });

// Auth + per-request RLS context. Sets `doable.current_user_id` for the
// duration of each request so migrations 045/071/076 enforce row-level
// visibility on workspace_members, projects, users, etc.
workspaceRoutes.use("*", authMiddlewareWithRls);

// ─── List User's Workspaces (with member count + credits) ───
workspaceRoutes.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    if (!userId) {
      console.error("[workspaces] No userId in context");
      return c.json({ error: "Authentication required" }, 401);
    }

    let rows;
    try {
      rows = await workspaces.listByUser(userId);
    } catch (dbErr: any) {
      console.error("[workspaces] Database error listing workspaces:", dbErr);
      return c.json({ error: `Database error: ${dbErr?.message || "Unknown error"}` }, 500);
    }

    // Enrich each workspace with member count, credits, and user's role
    let data;
    try {
      data = await Promise.all(
        rows.map(async (ws) => {
          const [members, credits, userRole] = await Promise.all([
            workspaces.listMembers(ws.id),
            workspaces.getCredits(ws.id),
            workspaces.getMemberRole(ws.id, userId),
          ]);
          return {
            ...ws,
            userRole: userRole ?? "member",
            memberCount: members.length,
            credits: credits
              ? {
                  dailyRemaining: credits.daily_remaining,
                  dailyTotal: credits.daily_total,
                  monthlyRemaining: credits.monthly_remaining,
                  rolloverCredits: credits.rollover_credits,
                }
              : null,
          };
        })
      );
    } catch (enrichErr: any) {
      console.error("[workspaces] Error enriching data:", enrichErr);
      return c.json({ error: `Enrichment error: ${enrichErr?.message || "Unknown error"}` }, 500);
    }

    return c.json({ data });
  } catch (err: any) {
    console.error("[workspaces] Unexpected error:", err);
    return c.json({ error: `Server error: ${err?.message || "Unknown error"}` }, 500);
  }
});

// ─── Create Workspace ───────────────────────────────────────
/** Strip HTML/script tags from user-supplied names to prevent stored XSS */
const safeName = (s: string) => s.replace(/<[^>]*>/g, "").trim();

const createSchema = z.object({
  name: z.string().min(1).max(100).transform(safeName).pipe(z.string().min(1, "Name cannot be empty after sanitization")),
  slug: z.string().min(SLUG_MIN_LENGTH).max(SLUG_MAX_LENGTH).regex(SLUG_REGEX),
  description: z.string().max(500).optional(),
  environmentId: z.string().uuid().optional(),
});

workspaceRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const existing = await workspaces.findBySlug(parsed.data.slug);
  if (existing) {
    return c.json({ error: "A workspace with this slug already exists" }, 409);
  }

  // Inherit the creator's plan so an Enterprise/Pro owner's new workspaces are
  // not born on 'free' — which would impose the 3-project + low-credit caps and
  // surface as the reported "new workspace is Free / 4 of 3 projects, none
  // visible" bug. We use the highest plan among the user's existing OWNED
  // workspaces (falling back to 'free' if they own none). On self-hosted, the
  // owner's primary workspace is 'enterprise' (firstUserBootstrap promotes it),
  // so new workspaces correctly inherit 'enterprise'. firstUserBootstrap only
  // promoted the user's *then-existing* workspaces, never ones created later —
  // this closes that gap at the source for every install method.
  const inheritedPlan = await workspaces.highestOwnedPlan(userId);

  let workspace;
  try {
    workspace = await workspaces.create({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description,
      ownerId: userId,
      plan: inheritedPlan,
    });
  } catch (err) {
    // BUG-R13-WORKSPACE-SLUG-500: the line-100 pre-check races with
    // concurrent inserts (qa-admin + qa-member POSTing the same slug at
    // once, or any two requests landing between the SELECT and INSERT).
    // Postgres surfaces the unique-violation on `workspaces_slug_key` as
    // code 23505; map it to the same friendly 409 the pre-check returns
    // instead of bubbling the raw constraint name to the client (which
    // would otherwise leak `workspaces_slug_key` via the global onError
    // handler in dev mode and trip schema-enumeration scanners).
    if ((err as { code?: string } | null)?.code === "23505") {
      return c.json({ error: "A workspace with this slug already exists" }, 409);
    }
    throw err;
  }

  // Provision built-in MCP Apps (e.g., Presentation Builder).
  await ensureBuiltinConnectorsForWorkspace(workspace.id, userId);

  // If an environment was selected, clone it into the new workspace and apply
  if (parsed.data.environmentId) {
    try {
      const cloned = await envs.clone(parsed.data.environmentId, workspace.id, userId);
      await envs.applyToWorkspace(workspace.id, cloned.id);
    } catch {
      // Non-fatal: workspace created but environment clone failed
      console.warn(`Failed to clone environment ${parsed.data.environmentId} into workspace ${workspace.id}`);
    }
  }

  return c.json({ data: workspace }, 201);
});

// ─── Accept Invite (must be before /:id routes) ────────────
const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

workspaceRoutes.post("/invite/accept", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = acceptInviteSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  // BUG-WS-001: Verify the authenticated user's email matches the invited
  // email before accepting. Without this check, any authenticated user who
  // obtains an invite token can accept it and join the workspace with the
  // invited role (potentially demoting themselves in their own workspace).
  // Shareable invite links (email === '__invite_link__') are intentionally
  // multi-use and bypass this check.
  const invite = await workspaces.getInviteByToken(parsed.data.token);
  if (!invite) {
    return c.json({ error: "Invalid, expired, or already accepted invite" }, 400);
  }
  const isLinkInvite = invite.email === "__invite_link__";
  if (!isLinkInvite) {
    const caller = await users.findById(userId);
    if (!caller || caller.email.toLowerCase() !== invite.email.toLowerCase()) {
      return c.json(
        { error: "This invite was not sent to your email address" },
        403
      );
    }
  }

  const result = await workspaces.acceptInvite(parsed.data.token, userId);

  if (!result) {
    return c.json({ error: "Invalid, expired, or already accepted invite" }, 400);
  }

  return c.json({ data: result });
});

// ─── Get Workspace ──────────────────────────────────────────
workspaceRoutes.get("/:id", requireRole("viewer"), async (c) => {
  const id = c.req.param("id");
  const workspace = await workspaces.findById(id);

  if (!workspace) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  return c.json({ data: workspace });
});

// ─── Update Workspace ───────────────────────────────────────
const updateSchema = z.object({
  name: z.string().min(1).max(100).transform(safeName).pipe(z.string().min(1)).optional(),
  description: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
});

workspaceRoutes.patch("/:id", requireRole("admin"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const workspace = await workspaces.update(id, parsed.data);

  if (!workspace) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  return c.json({ data: workspace });
});

// ─── Delete Workspace ───────────────────────────────────────
workspaceRoutes.delete("/:id", requireRole("owner"), async (c) => {
  const id = c.req.param("id");
  const deleted = await workspaces.delete(id);

  if (!deleted) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  return c.json({ data: { id, deleted: true } });
});

// ─── Transfer Ownership ────────────────────────────────────
const transferSchema = z.object({
  newOwnerId: z.string().uuid(),
});

workspaceRoutes.post("/:id/transfer", requireRole("owner"), async (c) => {
  const workspaceId = c.req.param("id");
  const callerId = c.get("userId");
  const body = await c.req.json();
  const parsed = transferSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const { newOwnerId } = parsed.data;

  // Verify new owner is a member
  const newOwnerRole = await workspaces.getMemberRole(workspaceId, newOwnerId);
  if (!newOwnerRole) {
    return c.json({ error: "User is not a member of this workspace" }, 400);
  }

  // Update workspace owner_id
  await sql`UPDATE workspaces SET owner_id = ${newOwnerId} WHERE id = ${workspaceId}`;

  // Set new owner role
  await workspaces.updateMemberRole(workspaceId, newOwnerId, "owner");

  // Demote current owner to admin
  await workspaces.updateMemberRole(workspaceId, callerId, "admin");

  const workspace = await workspaces.findById(workspaceId);
  return c.json({ data: workspace });
});

// ─── List Members (with user details) ──────────────────────
workspaceRoutes.get("/:id/members", requireRole("viewer"), async (c) => {
  const id = c.req.param("id");
  const workspace = await workspaces.findById(id);

  if (!workspace) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const members = await workspaces.getWorkspaceMembers(id);

  return c.json({ data: members });
});

// ─── Invite Member (by email) ──────────────────────────────
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]),
});

// Shared handler for both POST mounts. Two paths exist for historical
// reasons: `/members/invite` is the original, `/invites` is the canonical
// REST shape documented in TC-WS-INVITES.md (BUG-CORPUS-WS-002 — POST
// `/invites` previously 404'd because only the GET was mounted under that
// path). Both POST handlers share this function so behaviour stays
// identical.
async function inviteMemberHandler(c: Context<AuthEnv>) {
  const workspaceId = c.req.param("id");
  if (!workspaceId) return c.json({ error: "Workspace ID required" }, 400);
  const userId = c.get("userId");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = inviteSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  // Check if user is already a member.
  // BUG-CORPUS-PROJ-005 (same root cause): under authMiddlewareWithRls the
  // users_workspace_visible RLS policy hides users who don't share a
  // workspace with the caller — exactly the cohort being invited. Use
  // the SECURITY DEFINER lookup so the "user already a member" 409 short-
  // circuit doesn't silently miss known users on RLS-gated routes.
  const existingUser = await users.findByEmailForInvite(parsed.data.email);
  if (existingUser) {
    const existingRole = await workspaces.getMemberRole(workspaceId, existingUser.id);
    if (existingRole) {
      return c.json({ error: "User is already a member of this workspace" }, 409);
    }
  }

  // Enforce plan member limit
  const workspace = await workspaces.findById(workspaceId);
  if (workspace) {
    const effectiveLimits = await getEffectivePlanLimits();
    const limits = effectiveLimits[workspace.plan as WorkspacePlan] ?? effectiveLimits.free;
    const members = await workspaces.listMembers(workspaceId);
    if (members.length >= limits.maxMembers) {
      return c.json({
        error: `Member limit reached (${limits.maxMembers} for ${workspace.plan} plan). Upgrade to invite more.`,
      }, 403);
    }
  }

  // Create invite
  const invite = await workspaces.createInvite(
    workspaceId,
    parsed.data.email,
    parsed.data.role,
    userId
  );

  // Send invite email (queued, non-blocking)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const acceptUrl = `${appUrl}/invite/${invite.token}`;
  const inviterUser = await users.findById(userId);
  sendTemplatedEmail(parsed.data.email, "invite", {
    workspaceName: workspace?.name ?? "a workspace",
    inviterName: inviterUser?.display_name ?? inviterUser?.email ?? "Someone",
    acceptUrl,
  }).catch((err) => {
    console.error(`[Invite] Failed to send invite email to ${parsed.data.email}:`, err instanceof Error ? err.message : err);
  }); // fire-and-forget but log failures

  return c.json({ data: invite }, 201);
}

workspaceRoutes.post("/:id/members/invite", requireRole("admin"), inviteMemberHandler);
workspaceRoutes.post("/:id/invites", requireRole("admin"), inviteMemberHandler);

// ─── List Pending Invites ──────────────────────────────────
workspaceRoutes.get("/:id/invites", requireRole("admin"), async (c) => {
  const workspaceId = c.req.param("id");
  const invites = await workspaces.listInvites(workspaceId);
  return c.json({ data: invites });
});

// ─── Revoke Invite ─────────────────────────────────────────
workspaceRoutes.delete("/:id/invites/:inviteId", requireRole("admin"), async (c) => {
  const workspaceId = c.req.param("id");
  const inviteId = c.req.param("inviteId");

  const revoked = await workspaces.revokeInvite(workspaceId, inviteId);

  if (!revoked) {
    return c.json({ error: "Invite not found" }, 404);
  }

  return c.json({ data: { inviteId, revoked: true } });
});

// ─── Generate Shareable Invite Link ────────────────────────
const inviteLinkSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});

workspaceRoutes.post("/:id/invite-link", requireRole("admin"), async (c) => {
  const workspaceId = c.req.param("id");
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = inviteLinkSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const invite = await workspaces.createInviteLink(
    workspaceId,
    parsed.data.role,
    userId
  );

  return c.json({ data: invite }, 201);
});

// ─── Remove Member ──────────────────────────────────────────
workspaceRoutes.delete("/:id/members/:userId", requireRole("admin"), async (c) => {
  const workspaceId = c.req.param("id");
  const targetUserId = c.req.param("userId");
  const callerId = c.get("userId");

  // Prevent removing yourself (use leave instead)
  if (targetUserId === callerId) {
    return c.json({ error: "Cannot remove yourself. Use leave workspace instead." }, 400);
  }

  // Prevent removing the owner
  const workspace = await workspaces.findById(workspaceId);
  if (workspace?.owner_id === targetUserId) {
    return c.json({ error: "Cannot remove the workspace owner" }, 400);
  }

  // Admins can't remove other admins — only owners can
  const callerRole = await workspaces.getMemberRole(workspaceId, callerId);
  const targetRole = await workspaces.getMemberRole(workspaceId, targetUserId);

  if (callerRole !== "owner" && targetRole === "admin") {
    return c.json({ error: "Only workspace owners can remove admins" }, 403);
  }

  const removed = await workspaces.removeMember(workspaceId, targetUserId);

  if (!removed) {
    return c.json({ error: "Member not found" }, 404);
  }

  return c.json({ data: { workspaceId, userId: targetUserId, removed: true } });
});

// ─── Update Member Role ─────────────────────────────────────
const updateRoleSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});

workspaceRoutes.patch("/:id/members/:userId", requireRole("owner"), async (c) => {
  const workspaceId = c.req.param("id");
  const targetUserId = c.req.param("userId");
  const callerId = c.get("userId");
  const body = await c.req.json();
  const parsed = updateRoleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  // Cannot change own role
  if (targetUserId === callerId) {
    return c.json({ error: "Cannot change your own role" }, 400);
  }

  const member = await workspaces.updateMemberRole(
    workspaceId,
    targetUserId,
    parsed.data.role
  );

  if (!member) {
    return c.json({ error: "Member not found" }, 404);
  }

  return c.json({ data: member });
});
