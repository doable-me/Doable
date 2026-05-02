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
import { requireProjectAccess } from "./projects/helpers.js";

export const runtimeRoutes = new Hono<AuthEnv>();

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

  return c.json({ data: rows[0] });
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
