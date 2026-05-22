import { Hono } from "hono";
import { sql } from "../db/index.js";
import { selectMessageContent } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { getCopilotManager } from "../ai/providers/copilot-manager.js";
import { getChatSessionsSnapshot } from "./chat/index.js";
import { getInstanceMetrics } from "../runtime/metrics.js";
import { getDevServersSnapshot } from "../projects/dev-server-core.js";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { recordAdminAction } from "../admin/audit-log.js";

// Secret-like patterns to redact from log output before returning to the
// admin UI. We err on the side of redacting too much rather than too
// little — admins can SSH for raw logs if they truly need them. Patterns
// match the surrounding context so we don't blow away unrelated text.
const REDACT_PATTERNS: { name: string; pattern: RegExp; replacement: string }[] = [
  // Bearer / Basic / API auth headers
  { name: "auth-header", pattern: /(authorization:\s*(?:bearer|basic)\s+)[a-z0-9._\-+/=]{8,}/gi, replacement: "$1[REDACTED]" },
  // JWTs (3 base64 segments separated by dots, leading "ey")
  { name: "jwt", pattern: /\bey[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, replacement: "[JWT_REDACTED]" },
  // password / pass / pwd in key=value form
  { name: "password-kv", pattern: /\b(pass(?:word|wd)?|pwd)\s*[:=]\s*[^\s,;)"']+/gi, replacement: "$1=[REDACTED]" },
  // api_key / apikey / secret / token / access_key / private_key
  { name: "secret-kv", pattern: /\b(api[_-]?key|secret|token|access[_-]?key|private[_-]?key)\s*[:=]\s*[^\s,;)"']+/gi, replacement: "$1=[REDACTED]" },
  // postgres / mysql / mongodb URLs with embedded creds
  { name: "db-url", pattern: /\b((?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/)([^:@\s]+:)([^@\s]+)(@)/gi, replacement: "$1$2[REDACTED]$4" },
  // AWS access key IDs
  { name: "aws-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "[AWS_KEY_REDACTED]" },
  // Long hex blobs (32+ chars) — catches generated secrets, hashes
  { name: "long-hex", pattern: /\b[a-f0-9]{40,}\b/gi, replacement: "[HEX_REDACTED]" },
  // Stripe-like sk_live_ / sk_test_
  { name: "stripe", pattern: /\bsk_(?:live|test)_[a-zA-Z0-9]{16,}/g, replacement: "[STRIPE_KEY_REDACTED]" },
  // GitHub PAT
  { name: "github-pat", pattern: /\bghp_[a-zA-Z0-9]{30,}\b/g, replacement: "[GITHUB_PAT_REDACTED]" },
];

function redactSecrets(line: string): string {
  let out = line;
  for (const { pattern, replacement } of REDACT_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export const adminOpsRoutes = new Hono<AuthEnv>({ strict: false });

adminOpsRoutes.use("*", authMiddleware);
adminOpsRoutes.use("*", platformAdminMiddleware);

// ─── Git Migration ─────────────────────────────────────────
adminOpsRoutes.post("/migrate-to-git", async (c) => {
  try {
    const { migrateAllProjects } = await import("../git/migrate.js");
    const result = await migrateAllProjects();
    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Migration failed", message }, 500);
  }
});

// ─── Thumbnail Management ─────────────────────────────────

adminOpsRoutes.get("/thumbnail-logs", async (c) => {
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "50", 10) || 50, 1), 500);
  try {
    const logs = await sql`
      SELECT tl.id, tl.project_id, tl.project_name, tl.status, tl.preview_url,
             tl.error_message, tl.duration_ms, tl.triggered_by, tl.created_at,
             p.name as current_project_name
      FROM thumbnail_logs tl
      LEFT JOIN projects p ON p.id = tl.project_id
      ORDER BY tl.created_at DESC
      LIMIT ${limit}
    `;
    return c.json({ data: logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to fetch thumbnail logs", message }, 500);
  }
});

adminOpsRoutes.post("/thumbnails/generate-missing", async (c) => {
  try {
    const { captureProjectThumbnail, thumbnailExists } = await import("../thumbnails/capture.js");
    const apiPort = parseInt(process.env.API_PORT ?? "4000", 10);

    const projects = await sql<{ id: string; name: string; thumbnail_url: string | null }[]>`
      SELECT id, name, thumbnail_url FROM projects ORDER BY updated_at DESC
    `;

    const missing: { id: string; name: string }[] = [];
    for (const p of projects) {
      if (!thumbnailExists(p.id)) {
        missing.push({ id: p.id, name: p.name });
      }
    }

    if (missing.length === 0) {
      return c.json({ data: { total: projects.length, missing: 0, queued: 0, message: "All projects already have thumbnails" } });
    }

    const queued = missing.length;

    (async () => {
      for (const project of missing) {
        const previewUrl = `http://127.0.0.1:${apiPort}/preview/${project.id}/`;
        try {
          const filePath = await captureProjectThumbnail(project.id, previewUrl, {
            retries: 3,
            retryDelayMs: 5000,
            triggeredBy: "admin" as const,
          });
          if (filePath) {
            const thumbnailUrl = `/thumbnails/${project.id}.png`;
            await sql`UPDATE projects SET thumbnail_url = ${thumbnailUrl}, updated_at = NOW() WHERE id = ${project.id}`;
          }
        } catch (e) {
          console.warn(`[Thumbnail Admin] Failed for ${project.id}:`, e);
        }
      }
      console.log(`[Thumbnail Admin] Finished generating ${queued} missing thumbnails`);
    })();

    return c.json({ data: { total: projects.length, missing: queued, queued, message: `Generating ${queued} missing thumbnails in background` } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to generate thumbnails", message }, 500);
  }
});

// ─── Copilot Sessions Monitoring ─────────────────────────────

adminOpsRoutes.get("/copilot-sessions", async (c) => {
  const manager = getCopilotManager();
  const poolSnapshot = manager.getPoolSnapshot();
  const chatSessions = getChatSessionsSnapshot();
  const mem = process.memoryUsage();

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const projectIds = [...new Set(poolSnapshot.map((e) => e.projectId))].filter((id) => uuidRe.test(id));
  let projectNames: Record<string, string> = {};
  if (projectIds.length > 0) {
    const rows = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM projects WHERE id = ANY(${projectIds})
    `;
    projectNames = Object.fromEntries(rows.map((r) => [r.id, r.name]));
  }

  const engines = poolSnapshot.map((e) => ({
    ...e,
    projectName: projectNames[e.projectId] ?? null,
    chatSessions: chatSessions.filter((s) => s.projectId === e.projectId),
  }));

  return c.json({
    data: {
      engines,
      poolSize: manager.poolSize,
      maxEngines: 20,
      processMemory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      uptime: process.uptime(),
    },
  });
});

adminOpsRoutes.delete("/copilot-sessions/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const manager = getCopilotManager();
  await manager.evictEngine(projectId);
  return c.json({ data: { projectId, terminated: true } });
});

adminOpsRoutes.delete("/copilot-sessions", async (c) => {
  const manager = getCopilotManager();
  const count = manager.poolSize;
  await manager.stopAll();
  return c.json({ data: { terminated: count } });
});

// ─── Runtime instances (platform-wide) ─────────────────────
// Cross-workspace listing of every project_runtime row joined with
// project + workspace + owner + live cgroup metrics. Powers the
// "Runtime" tab in /admin — answers "what's running, by whom, on
// which port, using how much CPU/memory, since when".
adminOpsRoutes.get("/runtime/instances", async (c) => {
  let rows: {
    project_id: string;
    project_name: string;
    project_slug: string;
    workspace_id: string;
    workspace_name: string;
    owner_email: string | null;
    framework_id: string;
    runtime_kind: "static" | "process";
    listen_kind: "unix-socket" | "tcp-port" | null;
    listen_addr: string | null;
    systemd_unit: string | null;
    state: string;
    fail_count: number;
    last_active_at: Date | null;
    last_started_at: Date | null;
  }[];
  try {
    rows = await sql<typeof rows>`
    SELECT
      pr.project_id, p.name AS project_name, p.slug AS project_slug,
      w.id AS workspace_id, w.name AS workspace_name,
      u.email AS owner_email,
      pr.framework_id, pr.runtime_kind, pr.listen_kind, pr.listen_addr,
      pr.systemd_unit, pr.state, pr.fail_count,
      pr.last_active_at, pr.last_started_at
    FROM project_runtime pr
    JOIN projects p ON p.id = pr.project_id
    JOIN workspaces w ON w.id = p.workspace_id
    LEFT JOIN users u ON u.id = w.owner_id
    ORDER BY
      CASE pr.state WHEN 'running' THEN 0 WHEN 'starting' THEN 1
                    WHEN 'failed' THEN 2 ELSE 3 END,
      pr.last_active_at DESC NULLS LAST
  `;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    // Common case on a freshly installed host where migrations haven't run.
    if (/relation .* does not exist/i.test(msg)) {
      return c.json({
        data: {
          instances: [],
          summary: { total: 0, running: 0, failed: 0, stopped: 0, totalMemoryBytes: 0 },
          warning: "project_runtime table not found — run `pnpm db:migrate` to enable runtime tracking.",
        },
      });
    }
    return c.json({ error: "runtime instances query failed", message: msg }, 500);
  }

  // Fan out per-instance cgroup probes in parallel; each one is
  // bounded (2s systemctl + ~200ms cpu sample) and never throws.
  const enriched = await Promise.all(
    rows.map(async (r) => {
      const metrics = await getInstanceMetrics(r.project_slug);
      // Sandbox user (Wave 27): per-project Linux uid created by
      // setupProjectUser() in deploy/adapters/doable-cloud.ts. Slug
      // is truncated to 32 chars to match the useradd Linux limit.
      const sandboxUser = `doable-${r.project_slug}`.slice(0, 32);
      return {
        projectId: r.project_id,
        projectName: r.project_name,
        projectSlug: r.project_slug,
        workspaceId: r.workspace_id,
        workspaceName: r.workspace_name,
        ownerEmail: r.owner_email,
        frameworkId: r.framework_id,
        runtimeKind: r.runtime_kind,
        listenKind: r.listen_kind,
        listenAddr: r.listen_addr,
        systemdUnit: r.systemd_unit,
        sandboxUser,
        dbState: r.state,
        failCount: r.fail_count,
        lastActiveAt: r.last_active_at,
        lastStartedAt: r.last_started_at,
        ...metrics,
      };
    })
  );

  // Aggregate counters so the UI can show a quick summary card.
  const summary = {
    total: enriched.length,
    running: enriched.filter((r) => r.state === "running").length,
    failed: enriched.filter((r) => r.state === "failed").length,
    stopped: enriched.filter((r) => r.state === "stopped").length,
    totalMemoryBytes: enriched.reduce((s, r) => s + (r.memoryBytes ?? 0), 0),
  };

  return c.json({ data: { instances: enriched, summary } });
});

// ─── Dev-server instances (in-memory) ─────────────────────
// Vite dev-servers run for the editor preview. They live in the
// in-memory `servers` map (services/api/src/projects/dev-server-core.ts)
// — not in project_runtime. This endpoint joins the snapshot with
// project metadata for the admin view.
adminOpsRoutes.get("/dev-servers", async (c) => {
  const snap = getDevServersSnapshot();
  if (snap.length === 0) {
    return c.json({ data: { servers: [], summary: { total: 0, alive: 0, ready: 0 } } });
  }

  const ids = snap.map((s) => s.projectId);
  const meta = await sql<{
    project_id: string;
    project_name: string;
    project_slug: string;
    workspace_name: string;
    owner_email: string | null;
    framework_id: string | null;
  }[]>`
    SELECT p.id AS project_id, p.name AS project_name, p.slug AS project_slug,
           w.name AS workspace_name, u.email AS owner_email, p.framework_id
    FROM projects p
    JOIN workspaces w ON w.id = p.workspace_id
    LEFT JOIN users u ON u.id = w.owner_id
    WHERE p.id = ANY(${ids})
  `;
  const metaById = new Map(meta.map((m) => [m.project_id, m]));

  // Per-pid memory probe via /proc — bounded, never throws. Linux only.
  const enriched = await Promise.all(
    snap.map(async (s) => {
      let memoryBytes: number | null = null;
      if (process.platform === "linux" && s.pid) {
        try {
          const status = await readFile(`/proc/${s.pid}/status`, "utf-8");
          const m = /^VmRSS:\s+(\d+)\s+kB/m.exec(status);
          if (m) memoryBytes = parseInt(m[1] ?? "0", 10) * 1024;
        } catch {
          /* process gone, ignore */
        }
      }
      const m = metaById.get(s.projectId);
      return {
        ...s,
        listenAddr: `127.0.0.1:${s.port}`,
        memoryBytes,
        projectName: m?.project_name ?? "(unknown — project deleted?)",
        projectSlug: m?.project_slug ?? "—",
        workspaceName: m?.workspace_name ?? "—",
        ownerEmail: m?.owner_email ?? null,
        frameworkId: m?.framework_id ?? "—",
      };
    })
  );

  const summary = {
    total: enriched.length,
    alive: enriched.filter((r) => r.alive).length,
    ready: enriched.filter((r) => r.ready).length,
    totalMemoryBytes: enriched.reduce((s, r) => s + (r.memoryBytes ?? 0), 0),
  };

  return c.json({ data: { servers: enriched, summary } });
});

// ─── Terminate a process-kind runtime (platform admin) ────
adminOpsRoutes.post("/runtime/:id/stop", async (c) => {
  const projectId = c.req.param("id");
  const rows = await sql<{ systemd_unit: string | null; runtime_kind: string }[]>`
    SELECT systemd_unit, runtime_kind FROM project_runtime WHERE project_id = ${projectId}
  `;
  const row = rows[0];
  if (!row?.systemd_unit) return c.json({ error: "no runtime registered" }, 404);
  if (row.runtime_kind !== "process") return c.json({ error: "static runtimes have no process to stop" }, 400);

  if (process.platform !== "linux") {
    return c.json({ ok: false, reason: "systemctl not available on this host" });
  }
  const r = spawnSync("systemctl", ["stop", row.systemd_unit], { stdio: "ignore" });
  if (r.status !== 0) return c.json({ ok: false, reason: `systemctl stop exited ${r.status}` }, 500);

  await sql`UPDATE project_runtime SET state = 'stopped', updated_at = now() WHERE project_id = ${projectId}`;
  return c.json({ ok: true });
});

// ─── Kill a dev-server (platform admin) ───────────────────
adminOpsRoutes.delete("/dev-servers/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const { stopDevServer } = await import("../projects/dev-server.js");
  try {
    await stopDevServer(projectId);
    return c.json({ ok: true, projectId });
  } catch (e) {
    return c.json({ ok: false, reason: e instanceof Error ? e.message : "kill failed" }, 500);
  }
});

// ─── All projects (not just published runtime) ────────────
// /admin/runtime only shows project_runtime rows (= published process apps).
// Most projects on a typical install are drafts that have never been
// published yet. This endpoint surfaces EVERY project with its current
// state (draft / published), framework, owner, last activity — and joins
// per-project metrics where a project_runtime row exists.
adminOpsRoutes.get("/projects", async (c) => {
  const search = (c.req.query("q") ?? c.req.query("search") ?? "").slice(0, 100);
  const page = Math.max(parseInt(c.req.query("page") ?? "1", 10) || 1, 1);
  const per = Math.min(parseInt(c.req.query("per") ?? c.req.query("limit") ?? "100", 10) || 100, 500);
  const limit = per;
  const offset = Math.max(parseInt(c.req.query("offset") ?? "0", 10) || 0, (page - 1) * per);
  const sortField = c.req.query("sort") ?? "updated_at";
  const sortDir = (c.req.query("dir") ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const allowedSorts: Record<string, string> = {
    name: "p.name", updated_at: "p.updated_at", created_at: "p.created_at", status: "p.status",
  };
  const orderCol = allowedSorts[sortField] ?? "p.updated_at";

  let rows: {
    project_id: string;
    project_name: string;
    project_slug: string;
    framework_id: string;
    status: string;
    visibility: string;
    workspace_name: string;
    owner_email: string | null;
    runtime_state: string | null;
    runtime_kind: string | null;
    listen_addr: string | null;
    sessions_count: number;
    messages_count: number;
    created_at: Date;
    updated_at: Date;
  }[];
  const searchPattern = `%${search}%`;
  try {
    rows = await sql<typeof rows>`
      SELECT
        p.id AS project_id, p.name AS project_name, p.slug AS project_slug,
        p.framework_id, p.status::text AS status, p.visibility::text AS visibility,
        w.name AS workspace_name, u.email AS owner_email,
        pr.state AS runtime_state, pr.runtime_kind AS runtime_kind, pr.listen_addr,
        COALESCE(s.sessions_count, 0) AS sessions_count,
        COALESCE(m.messages_count, 0) AS messages_count,
        p.created_at, p.updated_at
      FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      LEFT JOIN users u ON u.id = w.owner_id
      LEFT JOIN project_runtime pr ON pr.project_id = p.id
      LEFT JOIN (
        SELECT project_id, COUNT(*)::int AS sessions_count
        FROM ai_sessions GROUP BY project_id
      ) s ON s.project_id = p.id::text
      LEFT JOIN (
        SELECT s.project_id, COUNT(am.id)::int AS messages_count
        FROM ai_sessions s
        LEFT JOIN ai_messages am ON am.session_id = s.id
        GROUP BY s.project_id
      ) m ON m.project_id = p.id::text
      WHERE p.deleted_at IS NULL
        AND (
          ${search} = '' OR
          p.name ILIKE ${searchPattern} OR
          p.slug ILIKE ${searchPattern} OR
          w.name ILIKE ${searchPattern} OR
          u.email ILIKE ${searchPattern} OR
          p.framework_id ILIKE ${searchPattern}
        )
      ORDER BY ${sql.unsafe(orderCol)} ${sql.unsafe(sortDir)}
      LIMIT ${limit} OFFSET ${offset}
    `;
  } catch (e) {
    return c.json({
      error: "projects query failed",
      message: e instanceof Error ? e.message : "unknown",
    }, 500);
  }

  const totalRow = await sql<{ c: number }[]>`
    SELECT COUNT(*)::int AS c
    FROM projects p
    JOIN workspaces w ON w.id = p.workspace_id
    LEFT JOIN users u ON u.id = w.owner_id
    WHERE p.deleted_at IS NULL
      AND (
        ${search} = '' OR
        p.name ILIKE ${searchPattern} OR
        p.slug ILIKE ${searchPattern} OR
        w.name ILIKE ${searchPattern} OR
        u.email ILIKE ${searchPattern} OR
        p.framework_id ILIKE ${searchPattern}
      )
  `;
  const total = totalRow[0]?.c ?? 0;

  return c.json({
    data: {
      projects: rows.map((r) => ({
        projectId: r.project_id,
        projectName: r.project_name,
        projectSlug: r.project_slug,
        frameworkId: r.framework_id,
        status: r.status,
        visibility: r.visibility,
        workspaceName: r.workspace_name,
        ownerEmail: r.owner_email,
        runtimeState: r.runtime_state,
        runtimeKind: r.runtime_kind,
        listenAddr: r.listen_addr,
        sessionsCount: r.sessions_count,
        messagesCount: r.messages_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        sandboxUser: `doable-${r.project_slug}`.slice(0, 32),
      })),
      total,
      limit,
      offset,
      page,
      meta: { total, page, per, pages: Math.ceil(total / per) },
    },
  });
});

// ─── Project detail (platform admin) ──────────────────────
adminOpsRoutes.get("/projects/:id", async (c) => {
  const projectId = c.req.param("id");
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(projectId)) return c.json({ error: "Project not found" }, 404);

  const rows = await sql<{
    project_id: string; project_name: string; project_slug: string;
    framework_id: string; status: string; visibility: string;
    workspace_id: string; workspace_name: string; owner_email: string | null;
    runtime_state: string | null; runtime_kind: string | null; listen_addr: string | null;
    sessions_count: number; messages_count: number;
    created_at: Date; updated_at: Date;
  }[]>`
    SELECT
      p.id AS project_id, p.name AS project_name, p.slug AS project_slug,
      p.framework_id, p.status::text AS status, p.visibility::text AS visibility,
      w.id AS workspace_id, w.name AS workspace_name, u.email AS owner_email,
      pr.state AS runtime_state, pr.runtime_kind AS runtime_kind, pr.listen_addr,
      COALESCE(s.sessions_count, 0) AS sessions_count,
      COALESCE(m.messages_count, 0) AS messages_count,
      p.created_at, p.updated_at
    FROM projects p
    JOIN workspaces w ON w.id = p.workspace_id
    LEFT JOIN users u ON u.id = w.owner_id
    LEFT JOIN project_runtime pr ON pr.project_id = p.id
    LEFT JOIN (
      SELECT project_id, COUNT(*)::int AS sessions_count
      FROM ai_sessions GROUP BY project_id
    ) s ON s.project_id = p.id::text
    LEFT JOIN (
      SELECT s.project_id, COUNT(am.id)::int AS messages_count
      FROM ai_sessions s
      LEFT JOIN ai_messages am ON am.session_id = s.id
      GROUP BY s.project_id
    ) m ON m.project_id = p.id::text
    WHERE p.id = ${projectId} AND p.deleted_at IS NULL
  `;

  const r = rows[0];
  if (!r) return c.json({ error: "Project not found" }, 404);
  return c.json({
    data: {
      projectId: r.project_id, projectName: r.project_name, projectSlug: r.project_slug,
      frameworkId: r.framework_id, status: r.status, visibility: r.visibility,
      workspaceId: r.workspace_id, workspaceName: r.workspace_name, ownerEmail: r.owner_email,
      runtimeState: r.runtime_state, runtimeKind: r.runtime_kind, listenAddr: r.listen_addr,
      sessionsCount: r.sessions_count, messagesCount: r.messages_count,
      createdAt: r.created_at, updatedAt: r.updated_at,
      sandboxUser: `doable-${r.project_slug}`.slice(0, 32),
    },
  });
});

// ─── Chat sessions list (platform admin) ──────────────────
adminOpsRoutes.get("/chat-sessions", async (c) => {
  const search = c.req.query("search")?.slice(0, 100) ?? "";
  const userEmail = c.req.query("userEmail")?.slice(0, 200) ?? "";
  const projectId = c.req.query("projectId")?.slice(0, 100) ?? "";
  const mode = c.req.query("mode")?.slice(0, 50) ?? "";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);

  recordAdminAction(c, {
    action: "list_chat_sessions",
    details: { search, userEmail, projectId, mode, limit, offset },
  }).catch(() => {});

  let rows: {
    session_id: string;
    user_id: string;
    user_email: string | null;
    project_id: string;
    project_name: string | null;
    project_slug: string | null;
    mode: string;
    copilot_session_id: string | null;
    message_count: number;
    last_message_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }[];

  try {
    const searchP = `%${search}%`;
    rows = await sql<typeof rows>`
      SELECT
        s.id AS session_id, s.user_id, u.email AS user_email,
        s.project_id, p.name AS project_name, p.slug AS project_slug,
        s.mode::text AS mode, s.copilot_session_id,
        COALESCE(mc.cnt, 0) AS message_count,
        mc.last_at AS last_message_at,
        s.created_at, s.updated_at
      FROM ai_sessions s
      LEFT JOIN users u ON u.id::text = s.user_id
      LEFT JOIN projects p ON p.id::text = s.project_id
      LEFT JOIN (
        SELECT session_id, COUNT(*)::int AS cnt, MAX(created_at) AS last_at
        FROM ai_messages GROUP BY session_id
      ) mc ON mc.session_id = s.id
      WHERE
        (${search} = '' OR p.name ILIKE ${searchP} OR u.email ILIKE ${searchP})
        AND (${userEmail} = '' OR u.email = ${userEmail})
        AND (${projectId} = '' OR s.project_id = ${projectId})
        AND (${mode} = '' OR s.mode::text = ${mode})
      ORDER BY COALESCE(mc.last_at, s.created_at) DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } catch (e) {
    return c.json({
      error: "chat sessions query failed",
      message: e instanceof Error ? e.message : "unknown",
    }, 500);
  }

  const totalRow = await sql<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM ai_sessions`;
  return c.json({
    data: {
      sessions: rows.map((r) => ({
        sessionId: r.session_id,
        userId: r.user_id,
        userEmail: r.user_email,
        projectId: r.project_id,
        projectName: r.project_name,
        projectSlug: r.project_slug,
        mode: r.mode,
        copilotSessionId: r.copilot_session_id,
        messageCount: r.message_count,
        lastMessageAt: r.last_message_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total: totalRow[0]?.c ?? 0,
      limit, offset,
    },
  });
});

// ─── Chat session thread (platform admin, redacted) ───────
adminOpsRoutes.get("/chat-sessions/:id/messages", async (c) => {
  const sessionId = c.req.param("id");

  const sessionRow = await sql<{
    session_id: string; user_id: string; user_email: string | null;
    project_id: string; project_name: string | null; project_slug: string | null;
    mode: string; created_at: Date;
  }[]>`
    SELECT s.id AS session_id, s.user_id, u.email AS user_email,
           s.project_id, p.name AS project_name, p.slug AS project_slug,
           s.mode::text AS mode, s.created_at
    FROM ai_sessions s
    LEFT JOIN users u ON u.id::text = s.user_id
    LEFT JOIN projects p ON p.id::text = s.project_id
    WHERE s.id = ${sessionId}
  `;
  if (sessionRow.length === 0) return c.json({ error: "session not found" }, 404);
  const session = sessionRow[0]!;

  recordAdminAction(c, {
    action: "view_chat_thread",
    resourceType: "ai_session",
    resourceId: sessionId,
    targetProjectId: session.project_id,
    details: { userId: session.user_id, mode: session.mode },
  }).catch(() => {});

  const messages = await sql<{
    id: string; role: string; content: string | null;
    tool_calls: unknown; thinking_content: string | null;
    had_tool_calls: boolean; display_name: string | null;
    created_at: Date;
  }[]>`
    SELECT id, role::text AS role,
           ${selectMessageContent(sql)} AS content,
           tool_calls, thinking_content,
           had_tool_calls, display_name, created_at
    FROM ai_messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC
    LIMIT 5000
  `;

  return c.json({
    data: {
      session: {
        sessionId: session.session_id,
        userId: session.user_id,
        userEmail: session.user_email,
        projectId: session.project_id,
        projectName: session.project_name,
        projectSlug: session.project_slug,
        mode: session.mode,
        createdAt: session.created_at,
      },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content ? redactSecrets(m.content) : null,
        toolCalls: m.tool_calls ? JSON.parse(redactSecrets(JSON.stringify(m.tool_calls))) : null,
        thinkingContent: m.thinking_content ? redactSecrets(m.thinking_content) : null,
        hadToolCalls: m.had_tool_calls,
        displayName: m.display_name,
        createdAt: m.created_at,
      })),
      redacted: true,
      note: "Message content is auto-redacted (secrets, JWTs, API keys, hex blobs). Every view is in admin_audit_log.",
    },
  });
});

// ─── Per-project log viewer (platform admin) ──────────────
// Tails systemd journal for the project's runtime unit. Output is
// secret-redacted (REDACT_PATTERNS) before leaving the API. Every
// view records an admin_audit_log entry — admins are accountable
// for what they see. Lines capped at 1000 so a malicious input
// can't make us shell out for an unbounded log read.
adminOpsRoutes.get("/runtime/:id/logs", async (c) => {
  const projectId = c.req.param("id");
  const lines = Math.min(parseInt(c.req.query("lines") ?? "200", 10) || 200, 1000);
  const search = c.req.query("search")?.slice(0, 200) ?? "";

  const rows = await sql<{ systemd_unit: string | null; project_name: string }[]>`
    SELECT pr.systemd_unit, p.name AS project_name
    FROM project_runtime pr
    JOIN projects p ON p.id = pr.project_id
    WHERE pr.project_id = ${projectId}
  `;
  const row = rows[0];
  if (!row?.systemd_unit) {
    return c.json({ data: { lines: [], note: "no runtime registered for this project" } });
  }

  // Fire-and-forget audit entry — failures here must not block the read.
  recordAdminAction(c, {
    action: "view_project_logs",
    resourceType: "project_runtime",
    resourceId: projectId,
    targetProjectId: projectId,
    details: { systemdUnit: row.systemd_unit, lines, search: search || null },
  }).catch(() => {});

  if (process.platform !== "linux") {
    return c.json({ data: { lines: [], note: "journalctl not available on this host" } });
  }

  const r = spawnSync(
    "journalctl",
    ["-u", row.systemd_unit, "-n", String(lines), "--no-pager", "-o", "short-iso"],
    { encoding: "utf-8", timeout: 8000, maxBuffer: 8 * 1024 * 1024 },
  );

  if (r.status !== 0) {
    return c.json({
      data: {
        lines: [],
        note: `journalctl exited ${r.status}: ${(r.stderr ?? "").slice(0, 200)}`,
      },
    });
  }

  const raw = (r.stdout ?? "").split("\n").filter(Boolean);
  const filtered = search
    ? raw.filter((l) => l.toLowerCase().includes(search.toLowerCase()))
    : raw;
  const redacted = filtered.map(redactSecrets);

  return c.json({
    data: {
      lines: redacted,
      systemdUnit: row.systemd_unit,
      totalLines: raw.length,
      filteredLines: filtered.length,
      redacted: true,
      note: "Secrets auto-redacted (passwords, JWTs, API keys, hex blobs, DB URLs). SSH for raw logs.",
    },
  });
});

// ─── Per-project egress policy + activity ─────────────────
// Returns the project's egress allow-list (project_runtime.egress_hosts —
// enforced at the systemd unit level via IPAddressAllow) plus recent
// build-time outbound activity captured by Squid (the Wave 29 build proxy).
adminOpsRoutes.get("/runtime/:id/egress", async (c) => {
  const projectId = c.req.param("id");

  const rows = await sql<{
    project_slug: string;
    egress_hosts: string[] | null;
    systemd_unit: string | null;
  }[]>`
    SELECT p.slug AS project_slug, pr.egress_hosts, pr.systemd_unit
    FROM project_runtime pr
    JOIN projects p ON p.id = pr.project_id
    WHERE pr.project_id = ${projectId}
  `;
  const row = rows[0];
  if (!row) return c.json({ error: "no runtime row for project" }, 404);

  // Squid access log (build-time proxy — Wave 29). Format:
  //   timestamp.ms elapsed client action/code bytes method URL ...
  // We want lines that mention this project's slug as the X-Doable-Project
  // header (set by builder.ts) — newer Squid configs log it; if not, we
  // just return all recent lines so the operator can grep manually.
  const SQUID_LOG = "/var/log/squid/access.log";
  let squidEntries: { timestamp: string; action: string; method: string; url: string; bytes: number }[] = [];
  let squidNote: string | null = null;

  if (process.platform === "linux" && existsSync(SQUID_LOG)) {
    try {
      // tail -c bounds memory — log can be GB-sized in production.
      const t = spawnSync("tail", ["-c", "65536", SQUID_LOG], {
        encoding: "utf-8", timeout: 3000,
      });
      const tail = t.stdout ?? "";
      const lines = tail.split("\n").filter(Boolean).slice(-200);
      for (const ln of lines) {
        // Squid common log: 1714668000.123 234 10.0.0.5 TCP_MISS/200 1234 GET https://example.com/foo - HIER_DIRECT/1.2.3.4 text/html
        const parts = ln.split(/\s+/);
        if (parts.length < 7) continue;
        const ts = parts[0] ? new Date(parseFloat(parts[0]) * 1000).toISOString() : "";
        squidEntries.push({
          timestamp: ts,
          action: parts[3] ?? "",
          method: parts[5] ?? "",
          url: parts[6] ?? "",
          bytes: parseInt(parts[4] ?? "0", 10),
        });
      }
      // Project-specific filtering would need the X-Doable-Project header
      // logged by Squid. For now we return everything — UI can filter.
      squidNote = `last ${squidEntries.length} entries from Squid access log (build-time proxy, all projects)`;
    } catch (e) {
      squidNote = `failed to read Squid log: ${e instanceof Error ? e.message : "unknown"}`;
    }
  } else {
    squidNote = "Squid access log not found (build-time proxy disabled, or running on non-Linux host)";
  }

  // Recent IPAddressDeny=any kernel events for this systemd unit. Filter
  // journalctl by unit + match "BPF/firewall" lines — best-effort, format
  // varies by systemd version.
  let denyEvents: string[] = [];
  let denyNote: string | null = null;
  if (process.platform === "linux" && row.systemd_unit) {
    try {
      const r = spawnSync(
        "journalctl",
        ["-u", row.systemd_unit, "--since", "1 hour ago", "--no-pager", "-o", "short-iso", "-q"],
        { encoding: "utf-8", timeout: 5000 },
      );
      if (r.status === 0) {
        denyEvents = (r.stdout ?? "")
          .split("\n")
          .filter((l) => /denied|EPERM|EACCES|connection refused|outbound/i.test(l))
          .slice(-50);
        denyNote = `${denyEvents.length} potential egress-block lines in last hour`;
      } else {
        denyNote = `journalctl exited ${r.status}`;
      }
    } catch (e) {
      denyNote = `failed to read journal: ${e instanceof Error ? e.message : "unknown"}`;
    }
  } else {
    denyNote = "journalctl not available";
  }

  return c.json({
    data: {
      projectSlug: row.project_slug,
      systemdUnit: row.systemd_unit,
      egressHosts: row.egress_hosts ?? [],
      buildProxy: {
        enabled: process.env.BUILD_HTTP_PROXY ?? null,
        recentEntries: squidEntries.slice(-100),
        note: squidNote,
      },
      egressDenials: {
        recentEvents: denyEvents,
        note: denyNote,
      },
    },
  });
});
