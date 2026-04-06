import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { usageService } from "../services/usage-service.js";
import type { WorkspaceRole } from "@doable/shared";

const workspaces = workspaceQueries(sql);

export const usageRoutes = new Hono<AuthEnv>();

// All usage routes require authentication
usageRoutes.use("*", authMiddleware);

// ─── Role helpers ──────────────────────────────────────────
const ADMIN_ROLES: WorkspaceRole[] = ["owner", "admin"];

async function requireAdmin(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  if (!ADMIN_ROLES.includes(role)) return "Requires admin or owner role";
  return null;
}

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

// ─── Date parsing helper ─────────────────────────────────
function parseDateParam(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? fallback : parsed;
}

// ─── GET /:workspaceId/usage/me ──────────────────────────
// Current user's usage summary (today, this week, this month)
usageRoutes.get("/:workspaceId/usage/me", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = parseDateParam(c.req.query("from"), monthStart);
  const to = parseDateParam(c.req.query("to"), now);

  const summary = await usageService.getUserSummary(userId, workspaceId, from, to);
  return c.json({ data: summary });
});

// ─── GET /:workspaceId/usage/me/history ──────────────────
// Usage over time for the current user
usageRoutes.get("/:workspaceId/usage/me/history", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = parseDateParam(c.req.query("from"), thirtyDaysAgo);
  const to = parseDateParam(c.req.query("to"), now);
  const groupBy = (c.req.query("groupBy") ?? "day") as "day" | "week" | "month";

  if (!["day", "week", "month"].includes(groupBy)) {
    return c.json({ error: "groupBy must be day, week, or month" }, 400);
  }

  const periods = await usageService.getUserHistory(userId, workspaceId, from, to, groupBy);
  return c.json({ data: { periods } });
});

// ─── GET /:workspaceId/usage/me/breakdown ────────────────
// Breakdown by project, model, and mode for current user
usageRoutes.get("/:workspaceId/usage/me/breakdown", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = parseDateParam(c.req.query("from"), thirtyDaysAgo);
  const to = parseDateParam(c.req.query("to"), now);

  const breakdown = await usageService.getUserBreakdown(userId, workspaceId, from, to);
  return c.json({ data: breakdown });
});

// ─── GET /:workspaceId/usage ─────────────────────────────
// Workspace-wide usage summary (admin only)
usageRoutes.get("/:workspaceId/usage", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = parseDateParam(c.req.query("from"), monthStart);
  const to = parseDateParam(c.req.query("to"), now);

  const summary = await usageService.getWorkspaceSummary(workspaceId, from, to);
  return c.json({ data: summary });
});

// ─── GET /:workspaceId/usage/members ─────────────────────
// Per-member usage breakdown (admin only)
usageRoutes.get("/:workspaceId/usage/members", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = parseDateParam(c.req.query("from"), monthStart);
  const to = parseDateParam(c.req.query("to"), now);

  const members = await usageService.getMemberBreakdown(workspaceId, from, to);
  return c.json({ data: members });
});

// ─── GET /:workspaceId/usage/providers ───────────────────
// Per-provider cost breakdown (admin only)
usageRoutes.get("/:workspaceId/usage/providers", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = parseDateParam(c.req.query("from"), monthStart);
  const to = parseDateParam(c.req.query("to"), now);

  const providers = await usageService.getProviderBreakdown(workspaceId, from, to);
  return c.json({ data: providers });
});
