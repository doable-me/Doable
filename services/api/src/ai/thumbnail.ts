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

/**
 * Periodic backfill: find projects whose dev server is currently running
 * but whose `thumbnail_url` is still NULL (i.e. the original
 * `scheduleThumbnailCapture` call after chat completion either fired
 * before the Puppeteer Chrome libs were installed, or hit a transient
 * Chrome launch error). Re-schedule a capture for each — `scheduleThumbnailCapture`'s
 * own per-project debounce prevents duplicate work. Caps at 10 projects
 * per sweep so a backlog can't stall the API event loop.
 *
 * Without this, projects that completed during a Chrome outage stayed
 * blank forever — the only recovery path was a manual admin call to
 * `POST /api/thumbnails/<projectId>/regenerate`. Now any project with
 * a live dev server self-heals within one sweep window.
 */
export async function backfillMissingThumbnails(maxPerSweep = 10): Promise<number> {
  try {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM projects
      WHERE thumbnail_url IS NULL
        AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT ${maxPerSweep * 4}
    `;
    let scheduled = 0;
    for (const { id } of rows) {
      if (scheduled >= maxPerSweep) break;
      if (!getDevServerInternalUrl(id)) continue;
      scheduleThumbnailCapture(id, 1000);
      scheduled++;
    }
    if (scheduled > 0) {
      console.log(`[Thumbnail] backfill sweep scheduled ${scheduled} captures`);
    }
    return scheduled;
  } catch (err) {
    console.warn("[Thumbnail] backfill sweep failed:", err);
    return 0;
  }
}

/**
 * Start the periodic thumbnail backfill sweeper. Called once from API
 * init; runs every 10 minutes. The first sweep runs after a 30s warmup
 * so the API doesn't compete with the rest of startup work.
 */
export function startThumbnailBackfillSweeper(): void {
  const FIRST_SWEEP_DELAY_MS = 30_000;
  const SWEEP_INTERVAL_MS = 10 * 60_000;
  setTimeout(() => {
    void backfillMissingThumbnails();
    setInterval(() => { void backfillMissingThumbnails(); }, SWEEP_INTERVAL_MS);
  }, FIRST_SWEEP_DELAY_MS);
}
