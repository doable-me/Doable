/**
 * Thumbnail Routes
 *
 * Serves captured project thumbnail images.
 *
 * GET /thumbnails/:projectId.png — returns the PNG screenshot for a project,
 * or 404 if no thumbnail has been captured yet.
 *
 * Caching: responds with ETag based on file mtime so browsers can use
 * If-None-Match to avoid re-downloading unchanged thumbnails.
 */

import { Hono } from "hono";
import { readFile, stat } from "node:fs/promises";
import {
  getThumbnailPath,
  thumbnailExists,
} from "../thumbnails/capture.js";

export const thumbnailRoutes = new Hono();

// GET /thumbnails/:filename — serve a project thumbnail
// Expects filename like "proj-123.png"
thumbnailRoutes.get("/:filename", async (c) => {
  const filename = c.req.param("filename");

  // Extract project ID: strip the .png extension
  if (!filename.endsWith(".png")) {
    return c.json({ error: "Only .png thumbnails are supported" }, 400);
  }

  const projectId = filename.replace(/\.png$/, "");

  if (!thumbnailExists(projectId)) {
    return c.notFound();
  }

  try {
    const filePath = getThumbnailPath(projectId);
    const [data, fileStat] = await Promise.all([
      readFile(filePath),
      stat(filePath),
    ]);

    // ETag from file modification time for cache validation
    const etag = `"thumb-${fileStat.mtimeMs.toString(36)}"`;
    const ifNoneMatch = c.req.header("if-none-match");
    if (ifNoneMatch === etag) {
      return c.body(null, 304);
    }

    return c.body(data, 200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=30", // 30s cache — thumbnails update after each AI edit
      "ETag": etag,
      "Last-Modified": fileStat.mtime.toUTCString(),
    });
  } catch {
    return c.notFound();
  }
});
