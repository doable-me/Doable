/**
 * Project Files API Routes
 *
 * Real filesystem-backed endpoints for project scaffolding,
 * file CRUD, and dev server preview URLs. These power the
 * editor's live preview and file tree.
 *
 * All routes require JWT authentication via authMiddleware.
 */

import { Hono } from "hono";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import {
  createProject,
  readFile,
  writeFile,
  deleteFile,
  listFiles,
  getProjectPath,
  isProjectScaffolded,
  ensureDependencies,
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
import { sql } from "../db/index.js";
import { buildZipBuffer } from "../lib/zip.js";
import { getTemplate } from "../templates/registry.js";
import { emitActivity } from "../lib/activity.js";

export const projectFileRoutes = new Hono<AuthEnv>();

// Require authentication for all project file operations
projectFileRoutes.use("/projects/:id/*", authMiddleware);

// In-flight scaffold locks — prevents two concurrent scaffold calls from
// double-creating a project (e.g. frontend mount + chat auto-scaffold).
// The value is a promise that resolves when the first caller finishes.
const scaffoldLocks = new Map<string, Promise<void>>();

// ─── POST /projects/:id/scaffold ─ Create project scaffold ──

// ─── Auto-join: add user as collaborator ONLY if project link sharing is enabled ──
projectFileRoutes.use("/projects/:id/*", async (c, next) => {
  const projectId = c.req.param("id");
  const userId = c.get("userId");
  if (projectId && userId) {
    try {
      // Check if user already has access (owner or collaborator)
      const [existing] = await sql`
        SELECT 1 FROM projects p
        JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = ${userId}
        WHERE p.id = ${projectId}
        UNION ALL
        SELECT 1 FROM project_collaborators
        WHERE project_id = ${projectId} AND user_id = ${userId}
        LIMIT 1
      `;
      if (!existing) {
        // Only auto-add if the project has link sharing enabled (visibility = 'public')
        const [project] = await sql`
          SELECT visibility FROM projects WHERE id = ${projectId}
        `;
        if (project?.visibility === 'public') {
          await sql`
            INSERT INTO project_collaborators (project_id, user_id, role)
            VALUES (${projectId}, ${userId}, 'editor')
            ON CONFLICT DO NOTHING
          `;
        }
        // If private, user can still view but won't be auto-added as collaborator
        // They need to be explicitly invited by the owner
      }
    } catch {
      // Non-critical — don't block the request
    }
  }
  await next();
});

projectFileRoutes.post("/projects/:id/scaffold", async (c) => {
  const projectId = c.req.param("id");

  // If a scaffold is already in-flight for this project, wait for it to
  // finish and then handle this request normally (which will hit the
  // ProjectExistsError path and just start the dev server).
  const existingLock = scaffoldLocks.get(projectId);
  if (existingLock) {
    try {
      await existingLock;
    } catch {
      // Previous scaffold failed — we'll try again below
    }
  }

  // Create a lock for this scaffold operation
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  scaffoldLocks.set(projectId, lockPromise);

  try {
    // Check if this project has a template_id — if so, use template files
    let templateFiles: Record<string, string> | undefined;
    try {
      const [project] = await sql<{ template_id: string | null }[]>`
        SELECT template_id FROM projects WHERE id = ${projectId}
      `;
      if (project?.template_id) {
        const template = getTemplate(project.template_id);
        if (template) {
          templateFiles = template.codeFiles;
          console.log(`[Scaffold] Using template "${template.id}" for project ${projectId}`);
        }
      }
    } catch {
      // DB lookup failed — fall back to blank scaffold
    }

    const result = await createProject(projectId, templateFiles);

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

    // Ensure a project record exists in the database so the dashboard can list it
    await ensureProjectDbRecord(projectId);

    return c.json(
      {
        data: {
          projectId,
          files: result.files,
          previewUrl: devServer?.url ?? null,
          devServerPort: devServer?.port ?? null,
        },
      },
      201,
    );
  } catch (err) {
    if (err instanceof ProjectExistsError) {
      // Project already exists — ensure deps installed, then start dev server
      let devServer: { url: string; port: number } | null = null;
      try {
        await ensureDependencies(projectId);
        devServer = await startDevServer(projectId);
      } catch (devErr) {
        console.error(
          `[Scaffold] Dev server failed for existing project ${projectId}:`,
          devErr,
        );
      }

      // Also ensure DB record exists for previously-scaffolded projects
      await ensureProjectDbRecord(projectId);

      return c.json({
        data: {
          projectId,
          files: [],
          previewUrl: devServer?.url ?? null,
          devServerPort: devServer?.port ?? null,
          alreadyExists: true,
        },
      });
    }
    throw err;
  } finally {
    releaseLock!();
    scaffoldLocks.delete(projectId);
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

    emitActivity(sql, {
      projectId,
      userId: c.get("userId"),
      eventType: "file_save",
      summary: `saved ${filePath.split("/").pop()}`,
      metadata: { filePath },
    });

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

    emitActivity(sql, {
      projectId,
      userId: c.get("userId"),
      eventType: "file_delete",
      summary: `deleted ${filePath.split("/").pop()}`,
      metadata: { filePath },
    });

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

  // If project is scaffolded, ensure deps installed and auto-start the dev server
  if (isProjectScaffolded(projectId)) {
    try {
      await ensureDependencies(projectId);
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

// ─── POST /projects/:id/download ─ Download ZIP of all project files ──

projectFileRoutes.post("/projects/:id/download", async (c) => {
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

/**
 * Check if a string is a valid UUID v4 format.
 */
function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Ensure a project record exists in the database.
 * This is needed because the scaffold endpoint creates files on disk
 * but doesn't require auth, so the normal POST /projects flow (which
 * requires auth) may not have been called. Without a DB record the
 * dashboard's GET /projects returns nothing.
 *
 * Only works for UUID project IDs (the projects table has a uuid primary key).
 * Non-UUID IDs (e.g. "proj-1234567890") are skipped since they come from
 * the editor's "new project" flow and will get a proper DB record later.
 *
 * Uses INSERT ... ON CONFLICT DO NOTHING so it's safe to call multiple times.
 */
async function ensureProjectDbRecord(projectId: string): Promise<void> {
  try {
    // The projects table uses uuid as the primary key type.
    // Skip non-UUID project IDs — they can't be stored.
    if (!isValidUuid(projectId)) {
      console.log(`[Scaffold] Skipping DB record for non-UUID projectId: ${projectId}`);
      return;
    }

    // Check if a record already exists
    const existing = await sql`SELECT id FROM projects WHERE id = ${projectId}`;
    if (existing.length > 0) return;

    // Find a workspace to associate the project with.
    // Since this endpoint has no auth, pick the first available workspace.
    const workspaces = await sql`SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`;
    if (workspaces.length === 0) {
      console.warn(
        `[Scaffold] No workspaces in DB — cannot create project record for ${projectId}. ` +
        `The project will exist on disk but won't appear on the dashboard until a workspace is created.`
      );
      return;
    }

    const workspaceId = workspaces[0]!.id as string;

    // Derive a human-readable name from the projectId
    const projectName = projectId
      .replace(/^proj-/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .slice(0, 100) || "Untitled Project";

    // Generate a slug from the projectId, adding a timestamp suffix for uniqueness
    // (the projects table has a UNIQUE(workspace_id, slug) constraint)
    const baseSlug = projectId.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40) || "project";
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    await sql`
      INSERT INTO projects (id, workspace_id, name, slug, status)
      VALUES (${projectId}, ${workspaceId}, ${projectName}, ${slug}, 'draft')
      ON CONFLICT (id) DO NOTHING
    `;

    console.log(`[Scaffold] Created DB record for project ${projectId} in workspace ${workspaceId}`);
  } catch (err) {
    // Don't let DB errors break the scaffold flow — the project still works on disk
    console.warn(`[Scaffold] Failed to create DB record for ${projectId}:`, err);
  }
}
