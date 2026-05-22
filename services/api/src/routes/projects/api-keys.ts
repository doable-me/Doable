/**
 * Project API Key management routes.
 *
 * Endpoints:
 *   GET    /projects/:id/api-keys       — List active keys (prefix only, never full key)
 *   POST   /projects/:id/api-keys       — Create a new key (returns full key ONCE)
 *   DELETE /projects/:id/api-keys/:keyId — Revoke a key
 */

import { Hono } from "hono";
import { sql } from "../../db/index.js";
import { generateProjectApiKey } from "../connector-proxy.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { validateProjectIdParam } from "./helpers.js";

export const projectApiKeyRoutes = new Hono<AuthEnv>({ strict: false });

// Reject non-UUID `:id` with 400 before SQL (BUG-CORPUS-PROJ-002).
projectApiKeyRoutes.use("/:id/*", validateProjectIdParam());

projectApiKeyRoutes.get("/:id/api-keys", async (c) => {
  const projectId = c.req.param("id");
  const userId = c.get("userId");

  // Verify project access (reuse existing middleware — userId is set by auth middleware)
  const [project] = await sql`
    SELECT p.id FROM projects p
    JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = ${userId}
    WHERE p.id = ${projectId} AND p.deleted_at IS NULL
  `;
  if (!project) return c.json({ error: "Project not found" }, 404);

  const keys = await sql`
    SELECT id, key_prefix, tier, label, allowed_tools, allowed_origins, created_at, last_used_at
    FROM project_api_keys
    WHERE project_id = ${projectId} AND revoked_at IS NULL
    ORDER BY created_at DESC
  `;

  return c.json({ keys });
});

projectApiKeyRoutes.post("/:id/api-keys", async (c) => {
  const projectId = c.req.param("id");
  const userId = c.get("userId");

  const [project] = await sql`
    SELECT p.id, p.workspace_id FROM projects p
    JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = ${userId}
    WHERE p.id = ${projectId} AND p.deleted_at IS NULL
  `;
  if (!project) return c.json({ error: "Project not found" }, 404);

  const body = await c.req.json<{
    tier?: "client" | "server";
    label?: string;
    allowed_tools?: string[] | null;
    allowed_origins?: string[] | null;
  }>().catch(() => ({ tier: undefined, label: undefined, allowed_tools: undefined, allowed_origins: undefined }));
  const tier = body.tier === "server" ? "server" : "client";
  const label = body.label ?? null;
  const allowedTools = Array.isArray(body.allowed_tools) ? body.allowed_tools : null;
  const allowedOrigins = Array.isArray(body.allowed_origins) ? body.allowed_origins : null;

  const { key, hash, prefix } = generateProjectApiKey(tier);

  await sql`
    INSERT INTO project_api_keys (project_id, key_hash, key_prefix, tier, label, created_by, allowed_tools, allowed_origins)
    VALUES (${projectId}, ${hash}, ${prefix}, ${tier}, ${label}, ${userId}, ${allowedTools}, ${allowedOrigins})
  `;

  // Return the full key — this is the ONLY time it's shown
  return c.json({
    key, prefix, tier, label,
    allowed_tools: body.allowed_tools ?? null,
    allowed_origins: body.allowed_origins ?? null,
    message: "Save this key now — it will not be shown again.",
  }, 201);
});

projectApiKeyRoutes.delete("/:id/api-keys/:keyId", async (c) => {
  const projectId = c.req.param("id");
  const keyId = c.req.param("keyId");
  const userId = c.get("userId");

  const [project] = await sql`
    SELECT p.id FROM projects p
    JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = ${userId}
    WHERE p.id = ${projectId} AND p.deleted_at IS NULL
  `;
  if (!project) return c.json({ error: "Project not found" }, 404);

  const [result] = await sql`
    UPDATE project_api_keys
    SET revoked_at = now()
    WHERE id = ${keyId} AND project_id = ${projectId} AND revoked_at IS NULL
    RETURNING id
  `;
  if (!result) return c.json({ error: "Key not found or already revoked" }, 404);

  return c.json({ revoked: true });
});

// PATCH /projects/:id/api-keys/:keyId — Update allowed_tools / allowed_origins
projectApiKeyRoutes.patch("/:id/api-keys/:keyId", async (c) => {
  const projectId = c.req.param("id");
  const keyId = c.req.param("keyId");
  const userId = c.get("userId");

  const [project] = await sql`
    SELECT p.id FROM projects p
    JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = ${userId}
    WHERE p.id = ${projectId} AND p.deleted_at IS NULL
  `;
  if (!project) return c.json({ error: "Project not found" }, 404);

  const body = await c.req.json<{
    allowed_tools?: string[] | null;
    allowed_origins?: string[] | null;
    label?: string;
  }>().catch(() => ({}));

  const updates: string[] = [];
  const values: unknown[] = [];

  if ("allowed_tools" in body) {
    const val = Array.isArray(body.allowed_tools) ? body.allowed_tools : null;
    updates.push("allowed_tools");
    values.push(val);
  }
  if ("allowed_origins" in body) {
    const val = Array.isArray(body.allowed_origins) ? body.allowed_origins : null;
    updates.push("allowed_origins");
    values.push(val);
  }
  if ("label" in body && typeof body.label === "string") {
    updates.push("label");
    values.push(body.label);
  }

  if (updates.length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  // Build dynamic update (safe — column names are hardcoded above)
  const setClauses = updates.map((col, i) =>
    col === "allowed_tools" || col === "allowed_origins"
      ? `${col} = $${i + 3}::jsonb`
      : `${col} = $${i + 3}`
  ).join(", ");

  const [updated] = await sql.unsafe(
    `UPDATE project_api_keys SET ${setClauses}
     WHERE id = $1 AND project_id = $2 AND revoked_at IS NULL
     RETURNING id, allowed_tools, allowed_origins, label`,
    [keyId, projectId, ...values] as never[]
  );

  if (!updated) return c.json({ error: "Key not found or already revoked" }, 404);
  return c.json({ updated });
});
