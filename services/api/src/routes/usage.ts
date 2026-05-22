import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { usageService } from "../services/usage-service.js";
import type { WorkspaceRole } from "@doable/shared";

const workspaces = workspaceQueries(sql);

export const usageRoutes = new Hono<AuthEnv>({ strict: false });

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

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM-WIDE ROUTES (for platform admins only - cross-workspace visibility)
// These MUST be defined BEFORE /:workspaceId routes to avoid "platform" being
// matched as a workspaceId.
// ═══════════════════════════════════════════════════════════════════════════

async function requirePlatformAdmin(userId: string): Promise<string | null> {
  const [user] = await sql`SELECT is_platform_admin FROM users WHERE id = ${userId}`;
  if (!user?.is_platform_admin) return "Requires platform admin access";
  return null;
}

// ─── GET /platform/usage ─────────────────────────────────
// Platform-wide usage summary (all workspaces)
usageRoutes.get("/platform/usage", async (c) => {
  const userId = c.get("userId");

  const err = await requirePlatformAdmin(userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = parseDateParam(c.req.query("from"), monthStart);
    const to = parseDateParam(c.req.query("to"), now);

    const summary = await usageService.getPlatformSummary(from, to);
    return c.json({ data: summary });
  } catch (e) {
    console.error("[Usage] GET /platform/usage:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load platform usage" }, 500);
  }
});

// ─── GET /platform/usage/users ───────────────────────────
// All users across all workspaces with usage
usageRoutes.get("/platform/usage/users", async (c) => {
  const userId = c.get("userId");

  const err = await requirePlatformAdmin(userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = parseDateParam(c.req.query("from"), monthStart);
    const to = parseDateParam(c.req.query("to"), now);
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "50", 10) || 50, 1), 200);

    const users = await usageService.getPlatformUserBreakdown(from, to, limit);
    return c.json({ data: users });
  } catch (e) {
    console.error("[Usage] GET /platform/usage/users:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load platform users" }, 500);
  }
});

// ─── GET /platform/usage/copilot-accounts ────────────────
// All copilot accounts with per-user usage breakdown
usageRoutes.get("/platform/usage/copilot-accounts", async (c) => {
  const userId = c.get("userId");

  const err = await requirePlatformAdmin(userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = parseDateParam(c.req.query("from"), monthStart);
    const to = parseDateParam(c.req.query("to"), now);

    const accounts = await usageService.getPlatformCopilotAccountUsage(from, to);
    return c.json({ data: accounts });
  } catch (e) {
    console.error("[Usage] GET /platform/usage/copilot-accounts:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load copilot account usage" }, 500);
  }
});

// ─── GET /platform/usage/models ──────────────────────────
// Platform-wide model usage breakdown with per-user details
usageRoutes.get("/platform/usage/models", async (c) => {
  const userId = c.get("userId");

  const err = await requirePlatformAdmin(userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = parseDateParam(c.req.query("from"), monthStart);
    const to = parseDateParam(c.req.query("to"), now);

    const models = await usageService.getPlatformModelBreakdown(from, to);
    return c.json({ data: models });
  } catch (e) {
    console.error("[Usage] GET /platform/usage/models:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load platform model usage" }, 500);
  }
});

// ─── GET /platform/usage/custom-providers ────────────────
// Custom (BYOK) providers with per-user per-model breakdown
usageRoutes.get("/platform/usage/custom-providers", async (c) => {
  const userId = c.get("userId");

  const err = await requirePlatformAdmin(userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = parseDateParam(c.req.query("from"), monthStart);
    const to = parseDateParam(c.req.query("to"), now);

    const providers = await usageService.getPlatformCustomProviderUsage(from, to);
    return c.json({ data: providers });
  } catch (e) {
    console.error("[Usage] GET /platform/usage/custom-providers:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load custom provider usage" }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKSPACE-SCOPED ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /:workspaceId/usage/me ──────────────────────────
// Current user's usage summary (today, this week, this month)
usageRoutes.get("/:workspaceId/usage/me", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = parseDateParam(c.req.query("from"), monthStart);
    const to = parseDateParam(c.req.query("to"), now);

    const summary = await usageService.getUserSummary(userId, workspaceId, from, to);
    return c.json({ data: summary });
  } catch (e) {
    console.error("[Usage] GET /usage/me:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load usage summary" }, 500);
  }
});

// ─── GET /:workspaceId/usage/me/history ──────────────────
// Usage over time for the current user
usageRoutes.get("/:workspaceId/usage/me/history", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  try {
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
  } catch (e) {
    console.error("[Usage] GET /usage/me/history:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load usage history" }, 500);
  }
});

// ─── GET /:workspaceId/usage/me/hourly ───────────────────
// Hourly activity heatmap for current user
usageRoutes.get("/:workspaceId/usage/me/hourly", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const from = parseDateParam(c.req.query("from"), thirtyDaysAgo);
    const to = parseDateParam(c.req.query("to"), now);

    const hours = await usageService.getUserHourlyActivity(userId, workspaceId, from, to);
    return c.json({ data: hours });
  } catch (e) {
    console.error("[Usage] GET /usage/me/hourly:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load hourly usage" }, 500);
  }
});

// ─── GET /:workspaceId/usage/me/tokens ───────────────────
// Token split (prompt / completion / thinking / cached) for current user
usageRoutes.get("/:workspaceId/usage/me/tokens", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = parseDateParam(c.req.query("from"), monthStart);
    const to = parseDateParam(c.req.query("to"), now);

    const split = await usageService.getUserTokenSplit(userId, workspaceId, from, to);
    return c.json({ data: split });
  } catch (e) {
    console.error("[Usage] GET /usage/me/tokens:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load token split" }, 500);
  }
});

// ─── GET /:workspaceId/usage/me/credits ──────────────────
// Credits consumed / remaining for current user
usageRoutes.get("/:workspaceId/usage/me/credits", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const credits = await usageService.getUserCredits(userId, workspaceId);
    return c.json({ data: credits });
  } catch (e) {
    console.error("[Usage] GET /usage/me/credits:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load credit info" }, 500);
  }
});

// ─── GET /:workspaceId/usage/me/breakdown ────────────────
// Breakdown by project, model, and mode for current user
usageRoutes.get("/:workspaceId/usage/me/breakdown", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const from = parseDateParam(c.req.query("from"), thirtyDaysAgo);
    const to = parseDateParam(c.req.query("to"), now);

    const breakdown = await usageService.getUserBreakdown(userId, workspaceId, from, to);
    return c.json({ data: breakdown });
  } catch (e) {
    console.error("[Usage] GET /usage/me/breakdown:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load usage breakdown" }, 500);
  }
});

// ─── GET /:workspaceId/usage ─────────────────────────────
// Workspace-wide usage summary (admin only)
usageRoutes.get("/:workspaceId/usage", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = parseDateParam(c.req.query("from"), monthStart);
    const to = parseDateParam(c.req.query("to"), now);

    const summary = await usageService.getWorkspaceSummary(workspaceId, from, to);
    return c.json({ data: summary });
  } catch (e) {
    console.error("[Usage] GET /usage:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load workspace usage" }, 500);
  }
});

// ─── GET /:workspaceId/usage/members ─────────────────────
// Per-member usage breakdown (admin only)
usageRoutes.get("/:workspaceId/usage/members", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = parseDateParam(c.req.query("from"), monthStart);
    const to = parseDateParam(c.req.query("to"), now);

    const members = await usageService.getMemberBreakdown(workspaceId, from, to);
    return c.json({ data: members });
  } catch (e) {
    console.error("[Usage] GET /usage/members:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load member usage" }, 500);
  }
});

// ─── GET /:workspaceId/usage/providers ───────────────────
// Per-provider cost breakdown (admin only)
usageRoutes.get("/:workspaceId/usage/providers", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = parseDateParam(c.req.query("from"), monthStart);
    const to = parseDateParam(c.req.query("to"), now);

    const providers = await usageService.getProviderBreakdown(workspaceId, from, to);
    return c.json({ data: providers });
  } catch (e) {
    console.error("[Usage] GET /usage/providers:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load provider usage" }, 500);
  }
});

// ─── GET /:workspaceId/usage/members/models ──────────────
// Per-member model usage (admin only) - which models each user used
usageRoutes.get("/:workspaceId/usage/members/models", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = parseDateParam(c.req.query("from"), monthStart);
    const to = parseDateParam(c.req.query("to"), now);

    const breakdown = await usageService.getMemberModelBreakdown(workspaceId, from, to);
    return c.json({ data: breakdown });
  } catch (e) {
    console.error("[Usage] GET /usage/members/models:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load member model breakdown" }, 500);
  }
});

// ─── GET /:workspaceId/usage/copilot-accounts ────────────
// Copilot account usage breakdown (admin only) - which accounts used by whom
usageRoutes.get("/:workspaceId/usage/copilot-accounts", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = parseDateParam(c.req.query("from"), monthStart);
    const to = parseDateParam(c.req.query("to"), now);

    const breakdown = await usageService.getCopilotAccountBreakdown(workspaceId, from, to);
    return c.json({ data: breakdown });
  } catch (e) {
    console.error("[Usage] GET /usage/copilot-accounts:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load copilot account usage" }, 500);
  }
});

// ─── GET /:workspaceId/usage/top-consumers ───────────────
// Top token consumers (admin only) - users sorted by token usage
usageRoutes.get("/:workspaceId/usage/top-consumers", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = parseDateParam(c.req.query("from"), monthStart);
    const to = parseDateParam(c.req.query("to"), now);
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "10", 10) || 10, 1), 100);

    const consumers = await usageService.getTopTokenConsumers(workspaceId, from, to, limit);
    return c.json({ data: consumers });
  } catch (e) {
    console.error("[Usage] GET /usage/top-consumers:", e instanceof Error ? e.message : e);
    return c.json({ error: "Failed to load top consumers" }, 500);
  }
});
