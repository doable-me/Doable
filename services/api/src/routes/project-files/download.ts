/**
 * Binary download endpoint for project files.
 *
 * Unlike `/projects/:id/files/*` (which returns `{ data: { content: string } }`
 * for the editor), this serves the raw file bytes with appropriate
 * Content-Type and Content-Disposition headers — used for `.pptx`, images,
 * and any other artifact we want a user to download from chat.
 */
import { Hono } from "hono";
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { existsSync } from "node:fs";
import {
  getProjectPath,
  resolveFilePath,
  FileAccessError,
} from "../../ai/project-files.js";
import type { AuthEnv } from "../../middleware/auth.js";

export const downloadRoutes = new Hono<AuthEnv>();

const MIME_BY_EXT: Record<string, string> = {
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

downloadRoutes.get("/projects/:id/download/*", async (c) => {
  const projectId = c.req.param("id");
  const prefix = `/projects/${projectId}/download/`;
  const idx = c.req.path.indexOf(prefix);
  if (idx === -1) return c.json({ error: "Invalid path" }, 400);
  const filePath = decodeURIComponent(c.req.path.slice(idx + prefix.length));

  if (!filePath || filePath.includes("..")) {
    return c.json({ error: "Invalid file path" }, 400);
  }

  let resolved: string;
  try {
    resolved = resolveFilePath(projectId, filePath);
  } catch (err) {
    if (err instanceof FileAccessError) return c.json({ error: err.message }, 403);
    throw err;
  }

  if (!existsSync(resolved) || !resolved.startsWith(getProjectPath(projectId))) {
    return c.json({ error: "File not found" }, 404);
  }

  const stats = await stat(resolved);
  const buf = await readFile(resolved);
  const ext = extname(resolved).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const fileName = filePath.split(/[/\\]/).pop() ?? "download";

  c.header("Content-Type", mime);
  c.header("Content-Length", String(stats.size));
  c.header(
    "Content-Disposition",
    `attachment; filename="${fileName.replace(/"/g, "")}"`,
  );
  c.header("Cache-Control", "private, max-age=300");
  return c.body(buf);
});
