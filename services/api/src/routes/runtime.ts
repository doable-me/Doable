/**
 * Runtime status / control routes (PRD 06).
 *
 * Exposes per-project runtime state to the editor + ops:
 *   - GET    /projects/:id/runtime          status snapshot
 *   - POST   /projects/:id/runtime/restart  systemctl restart on the unit
 *   - GET    /projects/:id/runtime/logs     tail of systemd journal
 *
 * Auth via the standard project-access middleware applied at the
 * mount site. No-op responses are returned when the runtime row is
 * absent or the platform has no systemd (dev hosts).
 */

import { Hono } from "hono";
import { spawnSync } from "node:child_process";
import { sql } from "../db/index.js";
import type { AuthEnv } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireProjectAccess } from "./projects/helpers.js";
import { getInstanceMetrics } from "../runtime/metrics.js";

export const runtimeRoutes = new Hono<AuthEnv>({ strict: false });

runtimeRoutes.use("/projects/*", authMiddleware);

interface RuntimeRow {
  project_id: string;
  framework_id: string;
  runtime_kind: "static" | "process";
  listen_kind: "unix-socket" | "tcp-port" | null;
  listen_addr: string | null;
  systemd_unit: string | null;
  state: "stopped" | "starting" | "running" | "failed" | "draining";
  last_active_at: Date | null;
  last_started_at: Date | null;
  fail_count: number;
  needs_restart: boolean;
  created_at: Date;
  updated_at: Date;
}

runtimeRoutes.get("/projects/:id/runtime", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);

  const rows = await sql<RuntimeRow[]>`
    SELECT
      project_id, framework_id, runtime_kind,
      listen_kind, listen_addr, systemd_unit,
      state, last_active_at, last_started_at,
      fail_count, needs_restart,
      created_at, updated_at
    FROM project_runtime
    WHERE project_id = ${id}
  `;

  if (rows.length === 0) {
    return c.json({ data: null });
  }

  // Touch last_active_at so idle detection knows the user is engaged.
  // Fire-and-forget — don't block the response.
  if (rows[0] && rows[0].state === "running") {
    sql`UPDATE project_runtime SET last_active_at = now() WHERE project_id = ${id}`.catch(() => {});
  }

  return c.json({ data: rows[0] });
});

runtimeRoutes.get("/projects/:id/runtime/metrics", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);

  const rows = await sql<{ project_slug: string }[]>`
    SELECT p.slug AS project_slug
    FROM project_runtime pr
    JOIN projects p ON p.id = pr.project_id
    WHERE pr.project_id = ${id}
  `;
  const slug = rows[0]?.project_slug;
  if (!slug) {
    return c.json({
      data: { state: "unknown", uptimeMs: null, memoryBytes: null, cpuPct: null, source: "none" },
    });
  }
  const metrics = await getInstanceMetrics(slug);
  return c.json({ data: metrics });
});

runtimeRoutes.post("/projects/:id/runtime/restart", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);

  const rows = await sql<{ systemd_unit: string | null; runtime_kind: string }[]>`
    SELECT systemd_unit, runtime_kind FROM project_runtime WHERE project_id = ${id}
  `;
  const row = rows[0];
  if (!row || !row.systemd_unit) {
    return c.json({ error: "no runtime registered for this project" }, 404);
  }
  if (row.runtime_kind !== "process") {
    return c.json({ error: "static runtime cannot be restarted" }, 400);
  }

  if (process.platform !== "linux") {
    return c.json({
      ok: false,
      reason: "systemctl not available on this host",
    });
  }

  // reset-failed clears any StartLimitBurst lockout from previous crashes.
  spawnSync("systemctl", ["reset-failed", row.systemd_unit], { stdio: "ignore" });
  const r = spawnSync("systemctl", ["restart", row.systemd_unit], { stdio: "ignore" });

  if (r.status !== 0) {
    return c.json({ ok: false, reason: `systemctl restart exited ${r.status}` }, 500);
  }

  await sql`
    UPDATE project_runtime
    SET state = 'starting', last_started_at = now(), updated_at = now()
    WHERE project_id = ${id}
  `;

  return c.json({ ok: true });
});

runtimeRoutes.post("/projects/:id/runtime/egress", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid json body" }, 400);
  }

  const hosts = (body as { hosts?: unknown })?.hosts;
  if (!Array.isArray(hosts)) {
    return c.json({ error: "hosts must be an array of strings" }, 400);
  }

  const HOST_REGEX = /^[a-zA-Z0-9.-]+$/;
  for (const h of hosts) {
    if (typeof h !== "string" || h.length === 0 || h.length > 255 || !HOST_REGEX.test(h)) {
      return c.json({ error: `invalid host: ${String(h).slice(0, 64)}` }, 400);
    }
  }

  const cleaned = hosts as string[];

  await sql`
    INSERT INTO project_runtime (project_id, framework_id, runtime_kind, egress_hosts, state)
    VALUES (${id}, 'unknown', 'process', ${cleaned}, 'stopped')
    ON CONFLICT (project_id) DO UPDATE
    SET egress_hosts = EXCLUDED.egress_hosts, updated_at = now()
  `;

  return c.json({ ok: true });
});

runtimeRoutes.get("/projects/:id/runtime/logs", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);

  const rows = await sql<{ systemd_unit: string | null }[]>`
    SELECT systemd_unit FROM project_runtime WHERE project_id = ${id}
  `;
  const row = rows[0];
  if (!row?.systemd_unit) {
    return c.json({ data: [], reason: "no runtime registered" });
  }

  if (process.platform !== "linux") {
    return c.json({
      data: [],
      reason: "journalctl not available on this host",
    });
  }

  const lines = parseInt(c.req.query("lines") ?? "200", 10);
  const r = spawnSync(
    "journalctl",
    ["-u", row.systemd_unit, "-n", String(Math.min(lines, 1000)), "--no-pager", "-o", "short-iso"],
    { encoding: "utf-8" },
  );

  if (r.status !== 0) {
    return c.json({
      data: [],
      reason: `journalctl exited ${r.status}: ${r.stderr?.slice(0, 200) ?? ""}`,
    });
  }

  const data = (r.stdout ?? "").split("\n").filter(Boolean);
  return c.json({ data });
});

// ─── Workspace-level runtime listing ──────────────────────
// Mounted at /workspaces in routes.ts. Lists every project_runtime row
// for the workspace with live per-instance metrics joined in.
export const workspaceRuntimeRoutes = new Hono<AuthEnv>({ strict: false });
workspaceRuntimeRoutes.use("*", authMiddleware);

workspaceRuntimeRoutes.get("/:wid/runtime/instances", async (c) => {
  const workspaceId = c.req.param("wid");
  const userId = c.get("userId");

  // Workspace membership check via the same workspace_members pattern
  // used elsewhere — return 403 if the caller isn't a member.
  const member = await sql<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM workspace_members
      WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    ) AS exists
  `;
  if (!member[0]?.exists) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }

  const rows = await sql<{
    project_id: string;
    project_name: string;
    project_slug: string;
    state: string;
    fail_count: number;
    last_active_at: Date | null;
  }[]>`
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      p.slug AS project_slug,
      pr.state,
      pr.fail_count,
      pr.last_active_at
    FROM project_runtime pr
    JOIN projects p ON p.id = pr.project_id
    WHERE p.workspace_id = ${workspaceId}
    ORDER BY p.name
  `;

  const enriched = await Promise.all(
    rows.map(async (r) => {
      const metrics = await getInstanceMetrics(r.project_slug);
      return {
        projectId: r.project_id,
        projectName: r.project_name,
        projectSlug: r.project_slug,
        dbState: r.state,
        failCount: r.fail_count,
        lastActiveAt: r.last_active_at,
        ...metrics,
      };
    })
  );

  return c.json({ data: enriched });
});
