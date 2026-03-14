import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { workspaceQueries, userQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
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

  // Enrich each workspace with member count and credits
  const data = await Promise.all(
    rows.map(async (ws) => {
      const [members, credits] = await Promise.all([
        workspaces.listMembers(ws.id),
        workspaces.getCredits(ws.id),
      ]);
      return {
        ...ws,
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

workspaceRoutes.patch("/:id", async (c) => {
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

// ─── List Members ───────────────────────────────────────────
workspaceRoutes.get("/:id/members", async (c) => {
  const id = c.req.param("id");
  const workspace = await workspaces.findById(id);

  if (!workspace) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const members = await workspaces.listMembers(id);

  return c.json({ data: members });
});

// ─── Invite Member ──────────────────────────────────────────
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]),
});

workspaceRoutes.post("/:id/members/invite", async (c) => {
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

  // Verify caller has permission
  const callerRole = await workspaces.getMemberRole(workspaceId, userId);
  if (!callerRole || !["owner", "admin"].includes(callerRole)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  // Find the user by email
  const invitee = await users.findByEmail(parsed.data.email);
  if (!invitee) {
    return c.json({ error: "User not found with this email" }, 404);
  }

  const member = await workspaces.addMember(
    workspaceId,
    invitee.id,
    parsed.data.role
  );

  return c.json({ data: member }, 201);
});

// ─── Remove Member ──────────────────────────────────────────
workspaceRoutes.delete("/:id/members/:userId", async (c) => {
  const workspaceId = c.req.param("id");
  const targetUserId = c.req.param("userId");
  const callerId = c.get("userId");

  // Verify caller has permission
  const callerRole = await workspaces.getMemberRole(workspaceId, callerId);
  if (!callerRole || !["owner", "admin"].includes(callerRole)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  // Prevent removing the owner
  const workspace = await workspaces.findById(workspaceId);
  if (workspace?.owner_id === targetUserId) {
    return c.json({ error: "Cannot remove the workspace owner" }, 400);
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

workspaceRoutes.patch("/:id/members/:userId", async (c) => {
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

  // Verify caller has permission
  const callerRole = await workspaces.getMemberRole(workspaceId, callerId);
  if (!callerRole || callerRole !== "owner") {
    return c.json({ error: "Only workspace owners can change roles" }, 403);
  }

  const member = await workspaces.addMember(
    workspaceId,
    targetUserId,
    parsed.data.role
  );

  return c.json({ data: member });
});
