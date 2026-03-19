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
  options?: { retries?: number; retryDelayMs?: number },
): Promise<string | null> {
  const maxAttempts = 1 + (options?.retries ?? 1);
  const retryDelay = options?.retryDelayMs ?? 5000;

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
        console.warn(`[Thumbnail] Skipping capture for ${projectId} — preview has errors after ${maxAttempts} attempts`);
        return null;
      }

      const filePath = path.join(THUMBNAILS_DIR, `${projectId}.png`);
      await page.screenshot({ path: filePath, type: "png" });
      await page.close();

      console.log(`[Thumbnail] Captured screenshot for ${projectId}`);
      return filePath;
    } catch (err) {
      if (attempt < maxAttempts) {
        console.log(`[Thumbnail] Attempt ${attempt} failed for ${projectId}, retrying in ${retryDelay}ms`);
        await new Promise((r) => setTimeout(r, retryDelay));
        continue;
      }
      console.warn(`[Thumbnail] Failed to capture for ${projectId} after ${maxAttempts} attempts:`, err);
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
