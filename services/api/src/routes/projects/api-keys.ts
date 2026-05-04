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

export const projectApiKeyRoutes = new Hono<AuthEnv>();

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
    SELECT id, key_prefix, tier, label, created_at, last_used_at
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

  const body = await c.req.json<{ tier?: "client" | "server"; label?: string }>().catch(() => ({ tier: undefined, label: undefined }));
  const tier = body.tier === "server" ? "server" : "client";
  const label = body.label ?? null;

  const { key, hash, prefix } = generateProjectApiKey(tier);

  await sql`
    INSERT INTO project_api_keys (project_id, key_hash, key_prefix, tier, label, created_by)
    VALUES (${projectId}, ${hash}, ${prefix}, ${tier}, ${label}, ${userId})
  `;

  // Return the full key — this is the ONLY time it's shown
  return c.json({ key, prefix, tier, label, message: "Save this key now — it will not be shown again." }, 201);
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
