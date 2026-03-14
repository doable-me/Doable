/**
 * Project Files API Routes
 *
 * Real filesystem-backed endpoints for project scaffolding,
 * file CRUD, and dev server preview URLs. These power the
 * editor's live preview and file tree.
 *
 * No auth required (DB is down) — these are public for now.
 */

import { Hono } from "hono";
import {
  createProject,
  readFile,
  writeFile,
  deleteFile,
  listFiles,
  getProjectPath,
  isProjectScaffolded,
  ProjectExistsError,
  FileNotFoundError,
  FileAccessError,
} from "../projects/file-manager.js";
import {
  startDevServer,
  stopDevServer,
  getDevServerUrl,
  isRunning,
} from "../projects/dev-server.js";

export const projectFileRoutes = new Hono();

// ─── POST /projects/:id/scaffold ─ Create project scaffold ──

projectFileRoutes.post("/projects/:id/scaffold", async (c) => {
  const projectId = c.req.param("id");

  try {
    const result = await createProject(projectId);

    // Start the dev server after scaffolding
    let devServer: { url: string; port: number } | null = null;
    try {
      devServer = await startDevServer(projectId);
    } catch (err) {
      console.error(
        `[Scaffold] Dev server failed to start for ${projectId}:`,
        err,
      );
    }

    return c.json(
      {
        data: {
          projectId,
          projectPath: result.projectPath,
          files: result.files,
          previewUrl: devServer?.url ?? null,
          devServerPort: devServer?.port ?? null,
        },
      },
      201,
    );
  } catch (err) {
    if (err instanceof ProjectExistsError) {
      // Project already exists — just ensure dev server is running
      let devServer: { url: string; port: number } | null = null;
      try {
        devServer = await startDevServer(projectId);
      } catch (devErr) {
        console.error(
          `[Scaffold] Dev server failed for existing project ${projectId}:`,
          devErr,
        );
      }

      return c.json({
        data: {
          projectId,
          projectPath: getProjectPath(projectId),
          files: [],
          previewUrl: devServer?.url ?? null,
          devServerPort: devServer?.port ?? null,
          alreadyExists: true,
        },
      });
    }
    throw err;
  }
});

// ─── GET /projects/:id/files ─ List all project files ────────

projectFileRoutes.get("/projects/:id/files", async (c) => {
  const projectId = c.req.param("id");

  try {
    const files = await listFiles(projectId);
    return c.json({ data: files });
  } catch (err) {
    if (err instanceof FileAccessError) {
      return c.json({ error: err.message }, 403);
    }
    return c.json({ data: [] });
  }
});

// ─── GET /projects/:id/files/* ─ Read a specific file ────────

projectFileRoutes.get("/projects/:id/files/*", async (c) => {
  const projectId = c.req.param("id");
  // Extract the file path after /projects/:id/files/
  const filePath = extractFilePath(c.req.path, projectId);

  if (!filePath) {
    return c.json({ error: "File path required" }, 400);
  }

  try {
    const content = await readFile(projectId, filePath);
    return c.json({
      data: {
        path: filePath,
        content,
      },
    });
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      return c.json({ error: `File not found: ${filePath}` }, 404);
    }
    if (err instanceof FileAccessError) {
      return c.json({ error: err.message }, 403);
    }
    throw err;
  }
});

// ─── PUT /projects/:id/files/* ─ Write/update a file ─────────

projectFileRoutes.put("/projects/:id/files/*", async (c) => {
  const projectId = c.req.param("id");
  const filePath = extractFilePath(c.req.path, projectId);

  if (!filePath) {
    return c.json({ error: "File path required" }, 400);
  }

  try {
    const body = await c.req.json<{ content: string }>();

    if (typeof body.content !== "string") {
      return c.json({ error: "Content must be a string" }, 400);
    }

    await writeFile(projectId, filePath, body.content);

    return c.json({
      data: {
        path: filePath,
        size: Buffer.byteLength(body.content, "utf-8"),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof FileAccessError) {
      return c.json({ error: err.message }, 403);
    }
    throw err;
  }
});

// ─── DELETE /projects/:id/files/* ─ Delete a file ────────────

projectFileRoutes.delete("/projects/:id/files/*", async (c) => {
  const projectId = c.req.param("id");
  const filePath = extractFilePath(c.req.path, projectId);

  if (!filePath) {
    return c.json({ error: "File path required" }, 400);
  }

  try {
    await deleteFile(projectId, filePath);
    return c.json({ data: { deleted: true, path: filePath } });
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      return c.json({ error: `File not found: ${filePath}` }, 404);
    }
    if (err instanceof FileAccessError) {
      return c.json({ error: err.message }, 403);
    }
    throw err;
  }
});

// ─── GET /projects/:id/preview-url ─ Get dev server URL ─────

projectFileRoutes.get("/projects/:id/preview-url", async (c) => {
  const projectId = c.req.param("id");

  // If server is running, return its URL
  if (isRunning(projectId)) {
    const url = getDevServerUrl(projectId);
    return c.json({ data: { url, running: true } });
  }

  // If project is scaffolded, auto-start the dev server
  if (isProjectScaffolded(projectId)) {
    try {
      const { url } = await startDevServer(projectId);
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

projectFileRoutes.post("/projects/:id/dev-server/stop", async (c) => {
  const projectId = c.req.param("id");

  await stopDevServer(projectId);
  return c.json({ data: { stopped: true } });
});

// ─── POST /projects/:id/dev-server/restart ─ Restart server ─

projectFileRoutes.post("/projects/:id/dev-server/restart", async (c) => {
  const projectId = c.req.param("id");

  // Stop if running
  await stopDevServer(projectId);

  // Start fresh
  if (isProjectScaffolded(projectId)) {
    try {
      const { url, port } = await startDevServer(projectId);
      return c.json({ data: { url, port, running: true } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to restart dev server: ${msg}` }, 500);
    }
  }

  return c.json({ error: "Project not scaffolded" }, 400);
});

// ─── Helpers ─────────────────────────────────────────────

/**
 * Extract the file path from the request URL.
 * Given `/projects/abc/files/src/App.tsx`, returns `src/App.tsx`.
 */
function extractFilePath(requestPath: string, projectId: string): string {
  const prefix = `/projects/${projectId}/files/`;
  const idx = requestPath.indexOf(prefix);
  if (idx === -1) return "";

  const raw = requestPath.slice(idx + prefix.length);
  return decodeURIComponent(raw);
}
