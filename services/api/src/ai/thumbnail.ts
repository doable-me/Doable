/**
 * Thumbnail capture scheduling — debounced so only one capture runs
 * at a time per project, with a TTL so a hung capture can't
 * permanently block.
 */

import { sql } from "../db/index.js";
import { getDevServerInternalUrl } from "../projects/dev-server.js";
import { broadcastToRoom } from "./yjs-bridge.js";

// Map of projectId → timestamp when capture started.
const captureInProgress = new Map<string, number>();
const CAPTURE_TTL_MS = 60_000; // 60 seconds

/**
 * Schedule a thumbnail capture for a project. Debounced — only one
 * capture runs at a time per project. Waits for Vite HMR to settle
 * before taking the screenshot.
 *
 * @param projectId - The project to capture
 * @param delayMs - How long to wait for Vite HMR to settle (default: 3000)
 */
export function scheduleThumbnailCapture(projectId: string, delayMs = 3000): void {
  const existingTs = captureInProgress.get(projectId);
  if (existingTs) {
    if (Date.now() - existingTs < CAPTURE_TTL_MS) {
      console.log(`[Thumbnail] Skipping capture for ${projectId} — already in progress`);
      return;
    }
    console.warn(`[Thumbnail] Previous capture for ${projectId} expired (>60s) — allowing retry`);
  }
  captureInProgress.set(projectId, Date.now());

  const internalUrl = getDevServerInternalUrl(projectId);
  if (!internalUrl) {
    captureInProgress.delete(projectId);
    console.warn(`[Thumbnail] Skipping capture for ${projectId} — dev server not running`);
    return;
  }

  const previewUrl = `${internalUrl}/preview/${projectId}/`;
  setTimeout(() => {
    import("../thumbnails/capture.js")
      .then(({ captureProjectThumbnail }) =>
        captureProjectThumbnail(projectId, previewUrl)
      )
      .then(async (filePath) => {
        if (filePath) {
          try {
            const thumbnailUrl = `/thumbnails/${projectId}.png`;
            await sql`UPDATE projects SET thumbnail_url = ${thumbnailUrl}, updated_at = NOW() WHERE id = ${projectId}`;
            broadcastToRoom(projectId, {
              type: "thumbnail:updated",
              thumbnailUrl,
            }).catch(() => {});
          } catch (e) {
            console.warn("[Thumbnail] Failed to save URL to DB:", e);
          }
        } else {
          console.warn(`[Thumbnail] Capture returned null for ${projectId} — preview may have errors`);
        }
      })
      .finally(() => captureInProgress.delete(projectId))
      .catch((err) => console.warn(`[Thumbnail] Capture failed for ${projectId}:`, err));
  }, delayMs);
}
