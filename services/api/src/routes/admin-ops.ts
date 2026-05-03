import { Hono } from "hono";
import { sql } from "../db/index.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { getCopilotManager } from "../ai/providers/copilot-manager.js";
import { getChatSessionsSnapshot } from "./chat/index.js";
import { getInstanceMetrics } from "../runtime/metrics.js";

export const adminOpsRoutes = new Hono<AuthEnv>();

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
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
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
  const rows = await sql<{
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
  }[]>`
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
    LEFT JOIN users u ON u.id = p.owner_id
    ORDER BY
      CASE pr.state WHEN 'running' THEN 0 WHEN 'starting' THEN 1
                    WHEN 'failed' THEN 2 ELSE 3 END,
      pr.last_active_at DESC NULLS LAST
  `;

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
