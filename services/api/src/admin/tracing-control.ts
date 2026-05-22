// Admin kill-switch endpoints for the tracing pipeline.
//
// Mounted at /admin/tracing. All endpoints require platform-admin auth.
// Every level change (global or scoped) writes a row to tracing_audit_log
// so we have a tamper-evident trail of who turned tracing up/down and why.
//
// Pattern follows services/api/src/routes/admin-*.ts: Hono router +
// authMiddleware + platformAdminMiddleware applied to all routes.

import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import {
  getGlobalLevel,
  setGlobalLevel,
  addOverride,
  listActiveOverrides,
  revokeOverride,
  refreshOverrideCaches,
} from "../tracing/level-registry.js";
import { TRACING_LEVELS, type TracingLevel } from "../tracing/types.js";

export const tracingControlRouter = new Hono<AuthEnv>({ strict: false });

tracingControlRouter.use("*", authMiddleware);
tracingControlRouter.use("*", platformAdminMiddleware);

// ─── helpers ─────────────────────────────────────────────────────────

const levelSchema = z.enum(TRACING_LEVELS as [TracingLevel, ...TracingLevel[]]);

const setLevelSchema = z.object({
  level: levelSchema,
  reason: z.string().min(1).max(500),
});

const addOverrideSchema = z.object({
  scope: z.enum(["user", "workspace", "route"]),
  scope_value: z.string().min(1).max(500),
  level: levelSchema,
  reason: z.string().min(1).max(500),
  // Cap at 240 (4h) per kill-switch SLA. Floor at 1 minute.
  ttl_min: z.number().int().min(1).max(240),
});

function clientIp(c: Context): string | null {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    // x-forwarded-for is "client, proxy1, proxy2" — first entry is the origin
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return c.req.header("x-real-ip") ?? null;
}

interface AuditRow {
  actorId: string;
  actorEmail: string | null;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
  clientIp: string | null;
}

async function writeAudit(row: AuditRow): Promise<void> {
  // tracing_audit_log: actor_id uuid, actor_email text, action text,
  // old_value jsonb, new_value jsonb, reason text, client_ip inet.
  // Wrap in try/catch — auditing must never break the kill-switch itself.
  try {
    await sql`
      INSERT INTO tracing_audit_log (
        actor_id, actor_email, action, old_value, new_value, reason, client_ip
      ) VALUES (
        ${row.actorId}::uuid,
        ${row.actorEmail},
        ${row.action},
        ${row.oldValue == null ? null : sql.json(row.oldValue as never)},
        ${row.newValue == null ? null : sql.json(row.newValue as never)},
        ${row.reason},
        ${row.clientIp}
      )
    `;
  } catch (err) {
    // Log but don't fail — the level change has already happened.
    // Operators can cross-check via getGlobalLevel() / overrides table.
    console.error("[tracing-control] audit log write failed", err);
  }
}

// ─── GET /admin/tracing/level ────────────────────────────────────────

tracingControlRouter.get("/level", async (c) => {
  await refreshOverrideCaches();
  const overrides = (await listActiveOverrides()) as unknown as unknown[];
  return c.json({
    level: getGlobalLevel(),
    overrides_count: overrides.length,
  });
});

// ─── POST /admin/tracing/level ───────────────────────────────────────

tracingControlRouter.post("/level", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = setLevelSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const { level, reason } = parsed.data;
  const actorId = c.get("userId");
  const actorEmail = c.get("userEmail") ?? null;

  const oldLevel = getGlobalLevel();
  if (oldLevel === level) {
    // No-op, but still audit so we have a trail of attempted changes.
    await writeAudit({
      actorId,
      actorEmail,
      action: "set_global_level_noop",
      oldValue: { level: oldLevel },
      newValue: { level },
      reason,
      clientIp: clientIp(c),
    });
    return c.json({ ok: true, level, changed: false });
  }

  setGlobalLevel(level);

  await writeAudit({
    actorId,
    actorEmail,
    action: "set_global_level",
    oldValue: { level: oldLevel },
    newValue: { level },
    reason,
    clientIp: clientIp(c),
  });

  return c.json({ ok: true, level, changed: true });
});

// ─── POST /admin/tracing/overrides ───────────────────────────────────

tracingControlRouter.post("/overrides", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = addOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const { scope, scope_value, level, reason, ttl_min } = parsed.data;
  const actorId = c.get("userId");
  const actorEmail = c.get("userEmail") ?? null;

  // For 'route' scope, validate the regex compiles before committing.
  if (scope === "route") {
    try { new RegExp(scope_value); }
    catch { return c.json({ error: "Invalid regex for route scope" }, 400); }
  }

  let id: string;
  try {
    id = await addOverride({
      scope,
      scopeValue: scope_value,
      level,
      reason,
      grantedBy: actorId,
      ttlMinutes: ttl_min,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to add override", message }, 500);
  }

  await writeAudit({
    actorId,
    actorEmail,
    action: "add_override",
    oldValue: null,
    newValue: { id, scope, scope_value, level, ttl_min },
    reason,
    clientIp: clientIp(c),
  });

  return c.json({ ok: true, id, scope, scope_value, level, ttl_min }, 201);
});

// ─── GET /admin/tracing/overrides ────────────────────────────────────

tracingControlRouter.get("/overrides", async (c) => {
  await refreshOverrideCaches();
  const overrides = await listActiveOverrides();
  return c.json({ overrides });
});

// ─── DELETE /admin/tracing/overrides/:id ─────────────────────────────

tracingControlRouter.delete("/overrides/:id", async (c) => {
  const id = c.req.param("id");
  // Basic uuid sanity check — addOverride/level-registry casts ::uuid which
  // would 500 on a bad id. Fail fast with 400 instead.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: "Invalid override id" }, 400);
  }

  // Capture pre-state for audit (best-effort).
  const [existing] = (await sql`
    SELECT id, scope, scope_value, level, reason, expires_at, revoked_at
    FROM tracing_overrides
    WHERE id = ${id}::uuid
  `) as Array<{
    id: string;
    scope: string;
    scope_value: string;
    level: TracingLevel;
    reason: string;
    expires_at: Date;
    revoked_at: Date | null;
  }>;

  if (!existing) {
    return c.json({ error: "Override not found" }, 404);
  }
  if (existing.revoked_at) {
    return c.json({ ok: true, id, already_revoked: true });
  }

  const reason = c.req.query("reason") ?? "revoked via admin api";
  const actorId = c.get("userId");
  const actorEmail = c.get("userEmail") ?? null;

  try {
    await revokeOverride(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to revoke override", message }, 500);
  }

  await writeAudit({
    actorId,
    actorEmail,
    action: "revoke_override",
    oldValue: {
      id: existing.id,
      scope: existing.scope,
      scope_value: existing.scope_value,
      level: existing.level,
    },
    newValue: { id: existing.id, revoked: true },
    reason,
    clientIp: clientIp(c),
  });

  return c.json({ ok: true, id });
});
