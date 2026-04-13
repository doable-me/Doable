import { Hono } from "hono";
import type { AuthEnv } from "../../middleware/auth.js";
import {
  readFile,
  writeFile,
  deleteFile,
  listFiles,
  FileNotFoundError,
  FileAccessError,
} from "../../projects/file-manager.js";
import { sql } from "../../db/index.js";
import { emitActivity } from "../../lib/activity.js";

export const fileCrudRoutes = new Hono<AuthEnv>();

// ─── GET /projects/:id/files ─ List all project files ────────

fileCrudRoutes.get("/projects/:id/files", async (c) => {
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

fileCrudRoutes.get("/projects/:id/files/*", async (c) => {
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

fileCrudRoutes.put("/projects/:id/files/*", async (c) => {
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

    // Bump project's updated_at so the dashboard's "recently edited" sort
    // reflects this save. Fire-and-forget — don't block the response.
    sql`UPDATE projects SET updated_at = now() WHERE id = ${projectId}`.catch(
      (err: unknown) =>
        console.warn("[project-files] updated_at bump failed:", err)
    );

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

fileCrudRoutes.delete("/projects/:id/files/*", async (c) => {
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
