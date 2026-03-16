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
 * Capture a screenshot of the given preview URL and save it as a
 * PNG thumbnail for the project.
 *
 * @param projectId - The project identifier (used as the filename).
 * @param previewUrl - The internal URL to navigate to (e.g. http://localhost:3100/preview/proj-xxx/).
 * @returns The file path of the saved thumbnail, or null on failure.
 */
export async function captureProjectThumbnail(
  projectId: string,
  previewUrl: string,
): Promise<string | null> {
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

    const filePath = path.join(THUMBNAILS_DIR, `${projectId}.png`);
    await page.screenshot({ path: filePath, type: "png" });
    await page.close();

    console.log(`[Thumbnail] Captured screenshot for ${projectId}`);
    return filePath;
  } catch (err) {
    console.warn(`[Thumbnail] Failed to capture for ${projectId}:`, err);
    return null;
  }
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
