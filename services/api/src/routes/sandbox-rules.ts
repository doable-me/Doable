/**
 * Sandbox rule admin routes.
 *
 * Workspace owner/admin reads/writes:
 *   GET    /workspaces/:wsId/sandbox/settings      — read defaults
 *   PUT    /workspaces/:wsId/sandbox/settings      — update defaults
 *   GET    /workspaces/:wsId/sandbox/rules         — list rules
 *   POST   /workspaces/:wsId/sandbox/rules         — add a rule
 *   PATCH  /workspaces/:wsId/sandbox/rules/:id     — modify a rule
 *   DELETE /workspaces/:wsId/sandbox/rules/:id     — remove a rule
 *
 * Migration 073 / Sandbox allowlist scaffold.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { workspaceQueries } from "@doable/db";
import { sql } from "../db/index.js";
import {
  getSandboxSettings,
  upsertSandboxSettings,
  listSandboxRules,
  addSandboxRule,
  updateSandboxRule,
  deleteSandboxRule,
  getSandboxRuleWorkspaceId,
} from "../sandbox/queries.js";
import type { WorkspaceRole } from "@doable/shared";

const workspaces = workspaceQueries(sql);

export const sandboxRoutes = new Hono<AuthEnv>({ strict: false });
sandboxRoutes.use("*", authMiddleware);

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

// ─── Settings ───────────────────────────────────────────────

sandboxRoutes.get("/:workspaceId/sandbox/settings", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const settings = await getSandboxSettings(workspaceId);
  return c.json({ data: settings });
});

const updateSettingsSchema = z.object({
  tool_default_action: z.enum(["allow", "deny"]).optional(),
  network_default_action: z.enum(["allow", "deny"]).optional(),
});

sandboxRoutes.put(
  "/:workspaceId/sandbox/settings",
  zValidator("json", updateSettingsSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const updated = await upsertSandboxSettings(workspaceId, {
      tool_default_action: body.tool_default_action,
      network_default_action: body.network_default_action,
      updatedBy: userId,
    });
    return c.json({ data: updated });
  },
);

// ─── Rules ──────────────────────────────────────────────────

sandboxRoutes.get("/:workspaceId/sandbox/rules", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const rules = await listSandboxRules(workspaceId);
  return c.json({ data: rules });
});

const addRuleSchema = z.object({
  rule_type: z.enum(["tool", "network"]),
  pattern: z.string().min(1).max(500),
  action: z.enum(["allow", "deny"]),
  priority: z.number().int().min(0).max(10000).optional(),
  description: z.string().max(500).nullable().optional(),
});

sandboxRoutes.post(
  "/:workspaceId/sandbox/rules",
  zValidator("json", addRuleSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    try {
      const rule = await addSandboxRule({
        workspaceId,
        ruleType: body.rule_type,
        pattern: body.pattern,
        action: body.action,
        priority: body.priority,
        description: body.description ?? null,
        createdBy: userId,
      });
      return c.json({ data: rule }, 201);
    } catch (dbErr: unknown) {
      const msg = dbErr instanceof Error ? dbErr.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return c.json(
          { error: "A rule with this type, pattern, and action already exists in this workspace" },
          409,
        );
      }
      throw dbErr;
    }
  },
);

const updateRuleSchema = z.object({
  pattern: z.string().min(1).max(500).optional(),
  action: z.enum(["allow", "deny"]).optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  description: z.string().max(500).nullable().optional(),
});

sandboxRoutes.patch(
  "/:workspaceId/sandbox/rules/:id",
  zValidator("json", updateRuleSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const ruleId = c.req.param("id");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const ruleWs = await getSandboxRuleWorkspaceId(ruleId);
    if (ruleWs !== workspaceId) return c.json({ error: "Rule not found" }, 404);

    const updated = await updateSandboxRule(ruleId, body);
    if (!updated) return c.json({ error: "Rule not found" }, 404);
    return c.json({ data: updated });
  },
);

sandboxRoutes.delete("/:workspaceId/sandbox/rules/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const ruleId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const ruleWs = await getSandboxRuleWorkspaceId(ruleId);
  if (ruleWs !== workspaceId) return c.json({ error: "Rule not found" }, 404);

  const deleted = await deleteSandboxRule(ruleId);
  if (!deleted) return c.json({ error: "Rule not found" }, 404);
  return c.json({ data: { id: ruleId, deleted: true } });
});
