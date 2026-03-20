import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { workspaceQueries, userQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { requireRole } from "../middleware/workspace-role.js";
import { SLUG_REGEX, SLUG_MIN_LENGTH, SLUG_MAX_LENGTH } from "@doable/shared";

const workspaces = workspaceQueries(sql);
const users = userQueries(sql);

export const workspaceRoutes = new Hono<AuthEnv>();

// All workspace routes require authentication
workspaceRoutes.use("*", authMiddleware);

// ─── List User's Workspaces (with member count + credits) ───
workspaceRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await workspaces.listByUser(userId);

  // Enrich each workspace with member count, credits, and user's role
  const data = await Promise.all(
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
              monthlyRemaining: credits.monthly_remaining,
              rolloverCredits: credits.rollover_credits,
            }
          : null,
      };
    })
  );

  return c.json({ data });
});

// ─── Create Workspace ───────────────────────────────────────
const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(SLUG_MIN_LENGTH).max(SLUG_MAX_LENGTH).regex(SLUG_REGEX),
  description: z.string().max(500).optional(),
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

  const workspace = await workspaces.create({
    ...parsed.data,
    ownerId: userId,
  });

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

  const result = await workspaces.acceptInvite(parsed.data.token, userId);

  if (!result) {
    return c.json({ error: "Invalid, expired, or already accepted invite" }, 400);
  }

  return c.json({ data: result });
});

// ─── Get Workspace ──────────────────────────────────────────
workspaceRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const workspace = await workspaces.findById(id);

  if (!workspace) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  return c.json({ data: workspace });
});

// ─── Update Workspace ───────────────────────────────────────
const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
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
workspaceRoutes.get("/:id/members", async (c) => {
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

workspaceRoutes.post("/:id/members/invite", requireRole("admin"), async (c) => {
  const workspaceId = c.req.param("id");
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = inviteSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  // Check if user is already a member
  const existingUser = await users.findByEmail(parsed.data.email);
  if (existingUser) {
    const existingRole = await workspaces.getMemberRole(workspaceId, existingUser.id);
    if (existingRole) {
      return c.json({ error: "User is already a member of this workspace" }, 409);
    }
  }

  // Create invite
  const invite = await workspaces.createInvite(
    workspaceId,
    parsed.data.email,
    parsed.data.role,
    userId
  );

  return c.json({ data: invite }, 201);
});

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
