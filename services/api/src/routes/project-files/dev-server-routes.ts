import { Hono } from "hono";
import type { AuthEnv } from "../../middleware/auth.js";
import {
  isProjectScaffolded,
  ensureDependencies,
  listFiles,
  readFile,
} from "../../projects/file-manager.js";
import {
  startDevServer,
  stopDevServer,
  getDevServerUrl,
  isRunning,
} from "../../projects/dev-server.js";
import { buildZipBuffer } from "../../lib/zip.js";

export const devServerFileRoutes = new Hono<AuthEnv>();

// ─── GET /projects/:id/debug-env ─ Debug env resolution ─────
devServerFileRoutes.get("/projects/:id/debug-env", async (c) => {
  const projectId = c.req.param("id");
  const uid = c.get("userId");
  try {
    const { resolveProjectEnvVars } = await import("../../env/resolve.js");
    const { resolveVaultEnv } = await import("../../env/vault-bridge.js");
    const { ENCRYPTION_KEY } = await import("../../lib/secrets.js");
    const { projectQueries } = await import("@doable/db");
    const { sql } = await import("../../db/index.js");
    const projects = projectQueries(sql);
    const project = await projects.findById(projectId);
    const wsId = project?.workspace_id;
    
    // Direct vault call
    let vaultResult: any = null;
    let vaultError: string | null = null;
    if (wsId && uid) {
      try {
        vaultResult = await resolveVaultEnv(wsId, projectId, uid);
      } catch (err) {
        vaultError = String(err);
      }
    }
    
    // Call the actual resolver and catch the error
    let env: Record<string, string> = {};
    let resolveError: string | null = null;
    try {
      env = await resolveProjectEnvVars(projectId, "development", undefined, uid);
    } catch (err) {
      resolveError = String(err);
    }
    
    return c.json({ 
      keys: Object.keys(env), 
      count: Object.keys(env).length, 
      userId: uid,
      workspaceId: wsId,
      projectFound: !!project,
      encKeyPrefix: ENCRYPTION_KEY.substring(0, 8),
      envEncKey: (process.env.ENCRYPTION_KEY ?? '').substring(0, 8),
      vaultKeys: vaultResult ? Object.keys(vaultResult.env) : null,
      vaultManifest: vaultResult?.manifest?.map((m: any) => m.integrationId) ?? null,
      vaultError,
      resolveError,
    });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ─── GET /projects/:id/preview-url ─ Get dev server URL ─────

devServerFileRoutes.get("/projects/:id/preview-url", async (c) => {
  const projectId = c.req.param("id");

  // If server is running, return its URL
  if (isRunning(projectId)) {
    const url = getDevServerUrl(projectId);
    return c.json({ data: { url, running: true } });
  }

  // If project is scaffolded, ensure deps installed and auto-start the dev server
  if (isProjectScaffolded(projectId)) {
    try {
      const uid = c.get("userId");
      await ensureDependencies(projectId);
      const { url } = await startDevServer(projectId, uid ? { userId: uid } : undefined);
      return c.json({ data: { url, running: true } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json(
        { error: `Failed to start dev server: ${msg}`, data: { url: null, running: false } },
        500,
      );
    }
  }

  return c.json({ data: { url: null, running: false } });
});

// ─── POST /projects/:id/dev-server/stop ─ Stop dev server ───

devServerFileRoutes.post("/projects/:id/dev-server/stop", async (c) => {
  const projectId = c.req.param("id");

  await stopDevServer(projectId);
  return c.json({ data: { stopped: true } });
});

// ─── POST /projects/:id/dev-server/restart ─ Restart server ─

devServerFileRoutes.post("/projects/:id/dev-server/restart", async (c) => {
  const projectId = c.req.param("id");

  // Stop if running
  await stopDevServer(projectId);

  // Start fresh
  if (isProjectScaffolded(projectId)) {
    try {
      const uid = c.get("userId");
      const { url, port } = await startDevServer(projectId, uid ? { userId: uid } : undefined);
      return c.json({ data: { url, port, running: true } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to restart dev server: ${msg}` }, 500);
    }
  }

  return c.json({ error: "Project not scaffolded" }, 400);
});

// ─── POST /projects/:id/download ─ Download ZIP of all project files ──

devServerFileRoutes.post("/projects/:id/download", async (c) => {
  const projectId = c.req.param("id");

  if (!isProjectScaffolded(projectId)) {
    return c.json({ error: "Project not scaffolded" }, 400);
  }

  try {
    const files = await listFiles(projectId);

    // Read all file contents
    const entries: Array<{ path: string; content: Buffer }> = [];
    for (const filePath of files) {
      try {
        const content = await readFile(projectId, filePath);
        entries.push({
          path: filePath,
          content: Buffer.from(content, "utf-8"),
        });
      } catch {
        // Skip files that can't be read (binary, etc.)
        continue;
      }
    }

    if (entries.length === 0) {
      return c.json({ error: "No files to download" }, 404);
    }

    const zipBuffer = buildZipBuffer(entries);

    c.header("Content-Type", "application/zip");
    c.header(
      "Content-Disposition",
      `attachment; filename="project-${projectId.slice(0, 8)}.zip"`
    );
    c.header("Content-Length", String(zipBuffer.length));

    return c.body(zipBuffer as unknown as ArrayBuffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to create download: ${msg}` }, 500);
  }
});
