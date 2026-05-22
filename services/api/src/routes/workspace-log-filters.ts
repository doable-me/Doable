// PRD 04 §4.2: workspace-admin custom log filters.
// CRUD over `workspace_log_filters`. The filters defined here are layered
// on top of the always-on baseline redaction chain (env-values, shapes,
// entropy, paths, urls, usernames). Integration into the actual
// LogFilterChain is intentionally deferred — this is the data + route
// foundation only.
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";

const workspaces = workspaceQueries(sql);

export const workspaceLogFilterRoutes = new Hono<AuthEnv>({ strict: false });

workspaceLogFilterRoutes.use("*", authMiddleware);

// ─── Membership guard ─────────────────────────────────────
async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

// ─── Validation ────────────────────────────────────────────
const denyPatternConfig = z.object({
  pattern: z.string().min(1),
  token: z.string().min(1),
});
const dropPatternConfig = z.object({
  pattern: z.string().min(1),
});

const createSchema = z.discriminatedUnion("filter_id", [
  z.object({ filter_id: z.literal("deny-pattern"), config: denyPatternConfig }),
  z.object({ filter_id: z.literal("drop-pattern"), config: dropPatternConfig }),
]);

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.unknown().optional(),
});

interface FilterRow {
  workspace_id: string;
  id: number;
  filter_id: "deny-pattern" | "drop-pattern";
  config: unknown;
  enabled: boolean;
  created_at: Date;
}

// ─── GET list ─────────────────────────────────────────────
workspaceLogFilterRoutes.get("/:wsId/log-filters", async (c) => {
  const wsId = c.req.param("wsId");
  const userId = c.get("userId");
  const err = await requireMember(wsId, userId);
  if (err) return c.json({ error: err }, 403);
  const rows = await sql<FilterRow[]>`
    SELECT workspace_id, id, filter_id, config, enabled, created_at
      FROM workspace_log_filters
     WHERE workspace_id = ${wsId}
     ORDER BY id ASC
  `;
  return c.json({ data: rows });
});

// ─── POST create ──────────────────────────────────────────
workspaceLogFilterRoutes.post(
  "/:wsId/log-filters",
  zValidator("json", createSchema),
  async (c) => {
    const wsId = c.req.param("wsId");
    const userId = c.get("userId");
    const err = await requireMember(wsId, userId);
    if (err) return c.json({ error: err }, 403);
    const body = c.req.valid("json");
    const [row] = await sql<FilterRow[]>`
      INSERT INTO workspace_log_filters (workspace_id, filter_id, config)
      VALUES (${wsId}, ${body.filter_id}, ${sql.json(body.config as never)})
      RETURNING workspace_id, id, filter_id, config, enabled, created_at
    `;
    return c.json({ data: row }, 201);
  },
);

// ─── PATCH update ─────────────────────────────────────────
workspaceLogFilterRoutes.patch(
  "/:wsId/log-filters/:id",
  zValidator("json", patchSchema),
  async (c) => {
    const wsId = c.req.param("wsId");
    const idParam = c.req.param("id");
    const id = Number.parseInt(idParam, 10);
    if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);
    const userId = c.get("userId");
    const err = await requireMember(wsId, userId);
    if (err) return c.json({ error: err }, 403);
    const body = c.req.valid("json");

    // Look up existing row so we can validate the config shape against the
    // existing filter_id (filter_id itself is immutable post-create).
    const [existing] = await sql<FilterRow[]>`
      SELECT workspace_id, id, filter_id, config, enabled, created_at
        FROM workspace_log_filters
       WHERE workspace_id = ${wsId} AND id = ${id}
    `;
    if (!existing) return c.json({ error: "Not found" }, 404);

    let nextConfig: unknown = existing.config;
    if (body.config !== undefined) {
      const schema =
        existing.filter_id === "deny-pattern" ? denyPatternConfig : dropPatternConfig;
      const parsed = schema.safeParse(body.config);
      if (!parsed.success) {
        return c.json({ error: "Invalid config", issues: parsed.error.issues }, 400);
      }
      nextConfig = parsed.data;
    }
    const nextEnabled = body.enabled ?? existing.enabled;

    const [row] = await sql<FilterRow[]>`
      UPDATE workspace_log_filters
         SET enabled = ${nextEnabled},
             config  = ${sql.json(nextConfig as never)}
       WHERE workspace_id = ${wsId} AND id = ${id}
      RETURNING workspace_id, id, filter_id, config, enabled, created_at
    `;
    return c.json({ data: row });
  },
);

// ─── DELETE ───────────────────────────────────────────────
workspaceLogFilterRoutes.delete("/:wsId/log-filters/:id", async (c) => {
  const wsId = c.req.param("wsId");
  const idParam = c.req.param("id");
  const id = Number.parseInt(idParam, 10);
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);
  const userId = c.get("userId");
  const err = await requireMember(wsId, userId);
  if (err) return c.json({ error: err }, 403);
  const rows = await sql<{ id: number }[]>`
    DELETE FROM workspace_log_filters
     WHERE workspace_id = ${wsId} AND id = ${id}
    RETURNING id
  `;
  if (rows.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
