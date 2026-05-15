/**
 * Workspace sandbox HTTP endpoints — consumed by the doable-CLI per
 * SandboxAgnosticSandboxingPRD ch 10.
 *
 *   GET    /workspaces/:wsId/sandbox/settings           — read defaults
 *   PUT    /workspaces/:wsId/sandbox/settings           — update defaults (admin)
 *   GET    /workspaces/:wsId/sandbox/rules              — list rules
 *   POST   /workspaces/:wsId/sandbox/rules              — add a rule (admin)
 *   DELETE /workspaces/:wsId/sandbox/rules/:ruleId      — remove a rule (admin)
 *   GET    /workspaces/:wsId/sandbox/profiles/:key      — resolved profile preview
 *   GET    /workspaces/:wsId/sandbox/audit              — recent spawn audit rows
 *   GET    /workspaces/:wsId/sandbox/backends           — registry probe (admin)
 */

import { Hono } from "hono";
import { sql } from "../../db/index.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { resolveProfile } from "../../sandbox/profile-resolver.js";
import { getSandboxRegistry } from "../../../../../packages/dovault/src/sandbox-registry.js";

export const workspaceSandboxRoutes = new Hono<AuthEnv>({ strict: false });

// GET /workspaces/:wsId/sandbox/settings
workspaceSandboxRoutes.get("/:wsId/sandbox/settings", async (c) => {
  const wsId = c.req.param("wsId");
  const userId = c.get("userId");
  const [member] = await sql`
    SELECT role FROM workspace_members WHERE workspace_id = ${wsId} AND user_id = ${userId}
  `;
  if (!member) return c.json({ error: "Not a member" }, 403);

  const [row] = await sql`
    SELECT workspace_id, sandbox_backend, allowed_profile_keys
    FROM workspace_sandbox_settings WHERE workspace_id = ${wsId}
  `;
  return c.json({
    settings: row ?? {
      workspace_id: wsId,
      sandbox_backend: null,
      allowed_profile_keys: ["ai-bash", "vite-preview", "install", "build"],
    },
  });
});

// PUT /workspaces/:wsId/sandbox/settings  (admin only)
workspaceSandboxRoutes.put("/:wsId/sandbox/settings", async (c) => {
  const wsId = c.req.param("wsId");
  const userId = c.get("userId");
  const [member] = await sql`SELECT role FROM workspace_members WHERE workspace_id = ${wsId} AND user_id = ${userId}`;
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req
    .json<{ sandbox_backend?: string | null; allowed_profile_keys?: string[] }>()
    .catch(() => ({} as { sandbox_backend?: string | null; allowed_profile_keys?: string[] }));

  await sql`
    INSERT INTO workspace_sandbox_settings (workspace_id, sandbox_backend, allowed_profile_keys)
    VALUES (${wsId}, ${body.sandbox_backend ?? null}, ${body.allowed_profile_keys ?? sql`DEFAULT`})
    ON CONFLICT (workspace_id) DO UPDATE SET
      sandbox_backend = EXCLUDED.sandbox_backend,
      allowed_profile_keys = EXCLUDED.allowed_profile_keys
  `;
  return c.json({ ok: true });
});

// GET /workspaces/:wsId/sandbox/rules
workspaceSandboxRoutes.get("/:wsId/sandbox/rules", async (c) => {
  const wsId = c.req.param("wsId");
  const userId = c.get("userId");
  const [member] = await sql`SELECT role FROM workspace_members WHERE workspace_id = ${wsId} AND user_id = ${userId}`;
  if (!member) return c.json({ error: "Not a member" }, 403);
  const rules = await sql`
    SELECT id, rule_type, pattern, action, priority, enabled, reason, created_at
    FROM workspace_sandbox_rules WHERE workspace_id = ${wsId} ORDER BY priority ASC, created_at DESC
  `;
  return c.json({ rules });
});

// POST /workspaces/:wsId/sandbox/rules
workspaceSandboxRoutes.post("/:wsId/sandbox/rules", async (c) => {
  const wsId = c.req.param("wsId");
  const userId = c.get("userId");
  const [member] = await sql`SELECT role FROM workspace_members WHERE workspace_id = ${wsId} AND user_id = ${userId}`;
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const body = await c.req.json<{
    rule_type: string;
    pattern: string;
    action: string;
    priority?: number;
    reason?: string;
  }>();
  const [row] = await sql`
    INSERT INTO workspace_sandbox_rules (workspace_id, rule_type, pattern, action, priority, reason, created_by)
    VALUES (${wsId}, ${body.rule_type}, ${body.pattern}, ${body.action}, ${body.priority ?? 100}, ${body.reason ?? null}, ${userId})
    RETURNING *
  `;
  return c.json({ rule: row }, 201);
});

// DELETE /workspaces/:wsId/sandbox/rules/:ruleId
workspaceSandboxRoutes.delete("/:wsId/sandbox/rules/:ruleId", async (c) => {
  const wsId = c.req.param("wsId");
  const ruleId = c.req.param("ruleId");
  const userId = c.get("userId");
  const [member] = await sql`SELECT role FROM workspace_members WHERE workspace_id = ${wsId} AND user_id = ${userId}`;
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await sql`DELETE FROM workspace_sandbox_rules WHERE id = ${ruleId} AND workspace_id = ${wsId}`;
  return c.json({ ok: true });
});

// GET /workspaces/:wsId/sandbox/profiles/:key — resolved profile
workspaceSandboxRoutes.get("/:wsId/sandbox/profiles/:key", async (c) => {
  const wsId = c.req.param("wsId");
  const key = c.req.param("key");
  const userId = c.get("userId");
  const [member] = await sql`SELECT role FROM workspace_members WHERE workspace_id = ${wsId} AND user_id = ${userId}`;
  if (!member) return c.json({ error: "Not a member" }, 403);

  const profile = await resolveProfile(key as any, {
    projectId: "_preview",
    workspaceId: wsId,
    userId,
    sessionId: "_preview",
    hardening: (process.env.DOABLE_HARDENING_LEVEL as any) ?? "dev",
  }).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  return c.json({ profile });
});

// GET /workspaces/:wsId/sandbox/audit?since=ISO&limit=100
workspaceSandboxRoutes.get("/:wsId/sandbox/audit", async (c) => {
  const wsId = c.req.param("wsId");
  const userId = c.get("userId");
  const [member] = await sql`SELECT role FROM workspace_members WHERE workspace_id = ${wsId} AND user_id = ${userId}`;
  if (!member) return c.json({ error: "Not a member" }, 403);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10) || 100, 500);
  const since = c.req.query("since");
  const rows = since
    ? await sql`SELECT * FROM audit_sandbox_spawn WHERE workspace_id = ${wsId} AND started_at >= ${since} ORDER BY started_at DESC LIMIT ${limit}`
    : await sql`SELECT * FROM audit_sandbox_spawn WHERE workspace_id = ${wsId} ORDER BY started_at DESC LIMIT ${limit}`;
  return c.json({ audit: rows });
});

// GET /workspaces/:wsId/sandbox/backends — registry probe (admin diagnostics)
workspaceSandboxRoutes.get("/:wsId/sandbox/backends", async (c) => {
  const wsId = c.req.param("wsId");
  const userId = c.get("userId");
  const [member] = await sql`SELECT role FROM workspace_members WHERE workspace_id = ${wsId} AND user_id = ${userId}`;
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const probes = await getSandboxRegistry().probeAll();
  return c.json({ backends: probes });
});
