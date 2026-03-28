/**
 * Thumbnail Capture Service
 *
 * Uses Puppeteer to take real screenshots of project previews.
 * Screenshots are saved as PNG files in the `thumbnails/` directory
 * and served via the /thumbnails/:projectId.png route.
 *
 * The browser instance is lazily created and reused across captures
 * to avoid the cost of launching Chrome on every request.
 */

import puppeteer, { type Browser } from "puppeteer";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { sql } from "../db/index.js";

// Puppeteer evaluate callbacks run in the browser context where `document` exists.
// Declare it here since the API tsconfig does not include the DOM lib.
declare const document: {
  querySelector(selectors: string): unknown;
  body?: { innerText: string; children: { length: number } };
};

const THUMBNAILS_DIR = path.resolve("thumbnails");
const VIEWPORT = { width: 1280, height: 720 };

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
  }
  return browser;
}

/**
 * Check whether the page is showing a Vite error overlay or a blank/error page.
 * Returns true if the preview looks healthy, false if it has errors.
 */
async function isPreviewHealthy(page: import("puppeteer").Page): Promise<boolean> {
  try {
    const hasError = await page.evaluate(() => {
      // Check for Vite error overlay custom element
      if (document.querySelector("vite-error-overlay")) return true;
      // Check for error overlay class patterns
      if (document.querySelector('[class*="err-"]')) return true;
      if (document.querySelector('pre[class="message"]')) return true;
      // Check for common error page text
      const bodyText = document.body?.innerText ?? "";
      if (bodyText.includes("Internal Server Error")) return true;
      if (bodyText.includes("504 (Outdated Optimize Dep)")) return true;
      // Check for essentially blank page (no meaningful content)
      if ((document.body?.children.length ?? 0) === 0) return true;
      // Check for "Your project is ready" placeholder — means the app hasn't rendered yet
      if (bodyText.includes("Your project is ready")) return true;
      // Check for "Starting dev server" or loading states
      if (bodyText.includes("Starting dev server")) return true;
      if (bodyText.includes("Loading...")) return true;
      return false;
    });
    return !hasError;
  } catch {
    return false;
  }
}

/**
 * Capture a screenshot of the given preview URL and save it as a
 * PNG thumbnail for the project. Skips capture if the preview shows
 * an error overlay to avoid saving broken thumbnails.
 *
 * @param projectId - The project identifier (used as the filename).
 * @param previewUrl - The internal URL to navigate to.
 * @param options.retries - Number of retry attempts (default: 1).
 * @param options.retryDelayMs - Delay between retries in ms (default: 5000).
 * @returns The file path of the saved thumbnail, or null on failure.
 */
export async function captureProjectThumbnail(
  projectId: string,
  previewUrl: string,
  options?: { retries?: number; retryDelayMs?: number; triggeredBy?: "auto" | "admin" | "regenerate" },
): Promise<string | null> {
  const maxAttempts = 1 + (options?.retries ?? 1);
  const retryDelay = options?.retryDelayMs ?? 5000;
  const triggeredBy = options?.triggeredBy ?? "auto";
  const startTime = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (!existsSync(THUMBNAILS_DIR)) {
        await mkdir(THUMBNAILS_DIR, { recursive: true });
      }

      const b = await getBrowser();
      const page = await b.newPage();
      await page.setViewport(VIEWPORT);

      // Navigate with timeout — use networkidle0 to wait for all requests to settle
      await page.goto(previewUrl, {
        waitUntil: "networkidle0",
        timeout: 15000,
      });

      // Wait a bit for any animations / transitions to settle
      await new Promise((r) => setTimeout(r, 1000));

      // Check if the preview is actually showing content (not an error overlay)
      const healthy = await isPreviewHealthy(page);
      if (!healthy) {
        await page.close();
        if (attempt < maxAttempts) {
          console.log(`[Thumbnail] Preview has errors for ${projectId}, retrying in ${retryDelay}ms (attempt ${attempt}/${maxAttempts})`);
          await new Promise((r) => setTimeout(r, retryDelay));
          continue;
        }
        const msg = `Preview has errors after ${maxAttempts} attempts`;
        console.warn(`[Thumbnail] Skipping capture for ${projectId} — ${msg}`);
        void logThumbnailAttempt({ projectId, status: "skipped", previewUrl, errorMessage: msg, durationMs: Date.now() - startTime, triggeredBy });
        return null;
      }

      const filePath = path.join(THUMBNAILS_DIR, `${projectId}.png`);
      await page.screenshot({ path: filePath, type: "png" });
      await page.close();

      console.log(`[Thumbnail] Captured screenshot for ${projectId}`);
      void logThumbnailAttempt({ projectId, status: "success", previewUrl, durationMs: Date.now() - startTime, triggeredBy });
      return filePath;
    } catch (err) {
      if (attempt < maxAttempts) {
        console.log(`[Thumbnail] Attempt ${attempt} failed for ${projectId}, retrying in ${retryDelay}ms`);
        await new Promise((r) => setTimeout(r, retryDelay));
        continue;
      }
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.warn(`[Thumbnail] Failed to capture for ${projectId} after ${maxAttempts} attempts:`, err);
      void logThumbnailAttempt({ projectId, status: "failed", previewUrl, errorMessage: msg, durationMs: Date.now() - startTime, triggeredBy });
      return null;
    }
  }
  return null;
}

/**
 * Get the path where a project's thumbnail would be stored.
 */
export function getThumbnailPath(projectId: string): string {
  return path.join(THUMBNAILS_DIR, `${projectId}.png`);
}

/**
 * Check whether a thumbnail exists for the given project.
 */
export function thumbnailExists(projectId: string): boolean {
  return existsSync(getThumbnailPath(projectId));
}

/**
 * Log a thumbnail generation attempt to the database.
 */
export async function logThumbnailAttempt(opts: {
  projectId: string;
  projectName?: string;
  status: "success" | "failed" | "skipped";
  previewUrl?: string;
  errorMessage?: string;
  durationMs?: number;
  triggeredBy?: "auto" | "admin" | "regenerate";
}): Promise<void> {
  try {
    await sql`INSERT INTO thumbnail_logs (project_id, project_name, status, preview_url, error_message, duration_ms, triggered_by)
      VALUES (${opts.projectId}, ${opts.projectName ?? null}, ${opts.status}, ${opts.previewUrl ?? null}, ${opts.errorMessage ?? null}, ${opts.durationMs ?? null}, ${opts.triggeredBy ?? "auto"})`;
  } catch (e) {
    console.warn("[Thumbnail] Failed to write log:", e);
  }
}

// ─── Cleanup on shutdown ────────────────────────────────────

async function closeBrowser(): Promise<void> {
  if (browser) {
    try {
      await browser.close();
    } catch {
      // Ignore close errors during shutdown
    }
    browser = null;
  }
}

process.on("SIGINT", () => {
  closeBrowser();
});

process.on("SIGTERM", () => {
  closeBrowser();
});
