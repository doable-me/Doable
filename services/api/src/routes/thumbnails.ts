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
  captureProjectThumbnail,
  getThumbnailPath,
  thumbnailExists,
} from "../thumbnails/capture.js";
import { getDevServerInternalUrl } from "../projects/dev-server.js";
import { sql } from "../db/index.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";

export const thumbnailRoutes = new Hono<AuthEnv>({ strict: false });

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
    // Prevent browsers/proxies from caching the 404 — the thumbnail
    // may be generated moments later by an in-flight capture.
    return c.body("Not found", 404, {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
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
      return c.body(null, 304, {
        "Access-Control-Allow-Origin": "*",
      });
    }

    return c.body(data, 200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=30", // 30s cache — thumbnails update after each AI edit
      "ETag": etag,
      "Last-Modified": fileStat.mtime.toUTCString(),
      "Access-Control-Allow-Origin": "*",
    });
  } catch {
    return c.notFound();
  }
});

// POST /thumbnails/:projectId/regenerate — force re-capture a project thumbnail
thumbnailRoutes.post("/:projectId/regenerate", authMiddleware, async (c) => {
  const projectId = c.req.param("projectId");

  const internalUrl = getDevServerInternalUrl(projectId);
  if (!internalUrl) {
    return c.json({ error: "Project dev server is not running" }, 400);
  }

  const previewUrl = `${internalUrl}/preview/${projectId}/`;
  const filePath = await captureProjectThumbnail(projectId, previewUrl, {
    retries: 2,
    retryDelayMs: 3000,
  });

  if (!filePath) {
    return c.json({ error: "Failed to capture thumbnail — preview may have errors" }, 500);
  }

  try {
    const thumbnailUrl = `/thumbnails/${projectId}.png`;
    await sql`UPDATE projects SET thumbnail_url = ${thumbnailUrl}, updated_at = NOW() WHERE id = ${projectId}`;
  } catch {
    // Non-critical — file was saved even if DB update fails
  }

  return c.json({ data: { success: true, url: `/thumbnails/${projectId}.png` } });
});
