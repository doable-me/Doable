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
import { SpanStatusCode } from "@opentelemetry/api";
import { getTracer } from "../tracing/instrumentation.js";

// Puppeteer evaluate callbacks run in the browser context where `document` exists.
// Declare it here since the API tsconfig does not include the DOM lib.
declare const document: {
  querySelector(selectors: string): unknown;
  getElementById(id: string): { children: { length: number }; textContent: string | null } | null;
  body?: { innerText: string; children: { length: number } };
};

const THUMBNAILS_DIR = path.resolve("thumbnails");
const VIEWPORT = { width: 1280, height: 720 };

// TUNNEL-MODE FALSE POSITIVE: Vite's HMR client logs a websocket-connect failure
// (and may flash a transient "server connection lost" overlay) when its live-reload
// websocket can't reach the dev server. In tunnel mode the preview is served
// cross-origin via cloudflared → api → per-project Vite, and the HMR ws relay can be
// momentarily unreachable during the sandboxed cross-origin handshake. This is a
// connectivity/infra condition, NOT a code/render defect — the app is already mounted
// and rendering. We must ignore it so the self-heal loop doesn't burn MAX_FIX_ATTEMPTS
// (and the thumbnail capture isn't skipped) for a benign HMR warning.
// Defined locally to avoid importing from ai/preview-errors.ts (which imports this module).
const HMR_WS_CONNECT_RE =
  /failed to connect to websocket|\[vite\][^\n]*websocket|server connection lost|websocket connection[^\n]*fail/i;

const BROWSER_LAUNCH_TIMEOUT_MS = 30_000;
// Hard ceiling on a single capture (goto + settle + health-check + screenshot).
// On timeout we force-close the page so headless Chrome can NEVER stick around.
const CAPTURE_TIMEOUT_MS = 30_000;
// Close the shared browser after this much inactivity so it never lingers
// indefinitely between bursts of captures.
const BROWSER_IDLE_MS = 3 * 60_000;

let browser: Browser | null = null;
// Single in-flight launch promise. Concurrent callers (e.g. a retry storm of
// preview errors) all await THIS one launch instead of each spawning their own
// Chrome — the original bug that leaked ~20 orphaned chromium processes.
let launchInFlight: Promise<Browser> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) return browser;
  // A launch is already underway — join it rather than starting another.
  if (launchInFlight) return launchInFlight;

  launchInFlight = (async () => {
    // BUG-ANALYTICS-002: `--no-sandbox` / `--disable-setuid-sandbox` disable
    // Chromium's process isolation. They are only required when running as
    // root (where the SUID sandbox helper refuses to start). On non-root
    // accounts (which is how production should run — see the security sprint
    // notes) we MUST keep the sandbox enabled.
    //
    // BUG-R27-005: inside a Docker container the runtime already provides
    // namespace + seccomp isolation, and Chrome's SUID sandbox helper isn't
    // shipped in the image. So `--no-sandbox` is required INSIDE a container
    // regardless of UID, or Chrome refuses to start with "Failed to launch
    // the browser process: Code: null" and every thumbnail capture fails.
    // Detect via `/.dockerenv` (canonical Docker convention; also present in
    // most other OCI runtimes) and treat as equivalent to root for sandbox.
    const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
    const inContainer = existsSync("/.dockerenv");
    const launchArgs = ["--disable-gpu"];
    if (isRoot || inContainer) {
      launchArgs.unshift("--no-sandbox", "--disable-setuid-sandbox");
    }
    // Wrap puppeteer.launch() with a timeout so a missing/broken Chrome
    // binary can't hang forever and permanently block thumbnail captures.
    const launchPromise = puppeteer.launch({
      headless: true,
      args: launchArgs,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Browser launch timed out after 30s")), BROWSER_LAUNCH_TIMEOUT_MS)
    );
    try {
      const b = await Promise.race([launchPromise, timeoutPromise]);
      browser = b;
      // If the launch lost the race to the timeout but Chrome eventually came
      // up, reap that orphan instead of leaking it.
      b.on("disconnected", () => {
        if (browser === b) browser = null;
      });
      return b;
    } catch (err) {
      // The launch timed out (or failed) — but the underlying Chrome process
      // may still be starting. Reap it once it resolves so it can't linger.
      launchPromise.then((b) => b.close()).catch(() => {});
      throw err;
    } finally {
      launchInFlight = null;
    }
  })();
  return launchInFlight;
}

/** (Re)arm the idle timer that closes the shared browser after inactivity. */
function touchIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void closeBrowser();
  }, BROWSER_IDLE_MS);
  // Don't keep the event loop alive just for the reaper.
  if (typeof idleTimer.unref === "function") idleTimer.unref();
}

/**
 * Check whether the page is showing a Vite error overlay or a blank/error page.
 * Returns true if the preview looks healthy, false if it has errors.
 */
async function isPreviewHealthy(page: import("puppeteer").Page): Promise<boolean> {
  try {
    const hasError = await page.evaluate(() => {
      // TUNNEL-MODE FALSE POSITIVE: a Vite error overlay whose text is ONLY the
      // HMR websocket-connect failure is a connectivity/infra warning (the HMR
      // ws couldn't reach the dev server through the cross-origin tunnel), not a
      // render defect. If the app still mounted content, treat it as healthy.
      const hmrWsRe = /failed to connect to websocket|\[vite\][^\n]*websocket|server connection lost|websocket connection[^\n]*fail/i;
      const overlayEl = document.querySelector("vite-error-overlay") as unknown as {
        shadowRoot?: { querySelector(s: string): { textContent: string | null } | null };
        textContent?: string | null;
      } | null;
      if (overlayEl) {
        const overlayText = (
          overlayEl.shadowRoot?.querySelector(".message")?.textContent ??
          overlayEl.textContent ??
          ""
        );
        const rootEl = document.getElementById("root");
        const mounted =
          (rootEl?.children.length ?? 0) > 0 || (document.body?.innerText ?? "").trim().length > 0;
        // Only this overlay AND the app is mounted → benign HMR warning, healthy.
        if (hmrWsRe.test(overlayText) && mounted) return false;
      }
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
      // Check for scaffold placeholder — means the app hasn't been built yet
      if (bodyText.includes("Dream it. Build it.") && bodyText.includes("pulse")) return true;
      if (bodyText.includes("Dream it. Build it.") && bodyText.includes("Doable")) return true;
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
 * Perform a single capture attempt: open a page, navigate, health-check, and
 * screenshot. The page is closed in a `finally` no matter what, and the entire
 * sequence is bounded by a hard timeout. On timeout the page is force-closed,
 * so a hung navigation/screenshot can never leave a Chrome page (or browser)
 * stuck around — the user's explicit requirement.
 *
 * @returns `{ healthy: false }` if the preview shows errors (caller may retry),
 *          or `{ healthy: true, filePath }` on a successful screenshot.
 */
async function captureOnce(
  previewUrl: string,
  projectId: string,
): Promise<{ healthy: boolean; filePath?: string }> {
  const b = await getBrowser();
  const page = await b.newPage();

  // Hard per-operation deadline. Resolves to a sentinel rather than rejecting
  // so we can force-close the page before surfacing the timeout error.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Thumbnail capture timed out after ${CAPTURE_TIMEOUT_MS}ms`)),
      CAPTURE_TIMEOUT_MS,
    );
  });

  const work = (async (): Promise<{ healthy: boolean; filePath?: string }> => {
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
    if (!healthy) return { healthy: false };

    const filePath = path.join(THUMBNAILS_DIR, `${projectId}.png`);
    await page.screenshot({ path: filePath, type: "png" });
    return { healthy: true, filePath };
  })();

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    // ALWAYS close the page — even if `work` rejected or the deadline fired.
    await page.close().catch(() => {});
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

      // Run the whole newPage→goto→screenshot under a hard timeout. The page is
      // ALWAYS closed in `finally` (success, error, OR timeout) so a screenshot
      // never leaves a page — and therefore headless Chrome — stuck around.
      const result = await captureOnce(previewUrl, projectId);
      touchIdleTimer();

      if (result.healthy === false) {
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

      console.log(`[Thumbnail] Captured screenshot for ${projectId}`);
      void logThumbnailAttempt({ projectId, status: "success", previewUrl, durationMs: Date.now() - startTime, triggeredBy });
      return result.filePath!;
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
 * Runtime preview probe for the self-heal loop. Two failure modes are invisible
 * to the server-side `detectPreviewError` (which only does HTTP fetches in Node):
 *
 *   1. A Vite HMR error overlay (e.g. `[plugin:vite:import-analysis] Failed to
 *      resolve import "./lib/utils"`) is injected CLIENT-SIDE over the HMR
 *      websocket — it never appears in the server-rendered "/" HTML, so the
 *      fetch-based overlay check cannot see it.
 *   2. A runtime throw during React mount leaves `#root` with 0 children and NO
 *      overlay (a silent blank screen). The server HTML always ships an empty
 *      `<div id="root">`, so this is only observable AFTER the bundle executes
 *      in a real browser.
 *
 * This reuses the same shared headless Chrome as thumbnail capture and the same
 * lifecycle discipline (hard timeout, page always closed, fail-open). It returns
 * a short error string for the auto-fix loop, or null if the preview looks
 * healthy OR anything goes wrong (a missing/broken Chrome must NEVER produce a
 * false "broken" verdict — fail-open is the safe default here).
 *
 * IMPORTANT: callers MUST only invoke this for real React apps (an index.html
 * that loads /src/main.tsx). Standalone doc-artifacts (markdown/pdf/pptx that
 * replace index.html with self-contained static HTML and have NO /src entry)
 * legitimately have an empty `#root` / no React mount and would be falsely
 * flagged — `detectPreviewError`'s `isStandaloneDoc` guard gates that out.
 */
export async function probePreviewRuntime(
  previewUrl: string,
): Promise<{ kind: "overlay" | "blank-root"; message: string } | null> {
  let b: Browser;
  try {
    b = await getBrowser();
  } catch {
    return null; // no Chrome — fail open, never block completion
  }
  const page = await b.newPage();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Preview runtime probe timed out after ${CAPTURE_TIMEOUT_MS}ms`)),
      CAPTURE_TIMEOUT_MS,
    );
  });

  const work = (async (): Promise<{ kind: "overlay" | "blank-root"; message: string } | null> => {
    await page.setViewport(VIEWPORT);
    await page.goto(previewUrl, { waitUntil: "networkidle0", timeout: 15000 });
    // Let React mount + any HMR error overlay get injected before inspecting.
    await new Promise((r) => setTimeout(r, 1200));

    const result = await page.evaluate(() => {
      // 1. Client-injected Vite error overlay (the import-analysis / transform
      //    case that the server-side fetch can't see). The overlay is a custom
      //    element whose error text lives inside its shadow DOM.
      const overlay = document.querySelector("vite-error-overlay") as unknown as {
        shadowRoot?: { querySelector(s: string): { textContent: string | null } | null };
      } | null;
      if (overlay) {
        const inner = overlay.shadowRoot?.querySelector(".message")?.textContent
          ?? overlay.shadowRoot?.querySelector(".message-body")?.textContent
          ?? null;
        const text = (inner ?? "Vite error overlay is visible in the preview").trim().slice(0, 800);
        return { kind: "overlay" as const, message: text };
      }

      // 2. Mounted-but-blank: React threw during mount, so the root never
      //    received children and there is no overlay. Only flag a genuinely
      //    empty root with no visible text anywhere on the page (a loading
      //    spinner, skeleton, or any async content all keep this from firing).
      const root = document.getElementById("root");
      if (root && root.children.length === 0) {
        const bodyText = (document.body?.innerText ?? "").trim();
        if (bodyText.length === 0) {
          return {
            kind: "blank-root" as const,
            message:
              "The app rendered a BLANK screen: React mounted but #root has 0 children and " +
              "the page is empty, with no Vite error overlay. This is a runtime error thrown " +
              "during render/mount (check the browser console). Read src/main.tsx and src/App.tsx, " +
              "find the throw (a bad hook call, undefined access, or a crashing top-level component), " +
              "and fix it so the app renders.",
          };
        }
      }
      return null;
    });

    // TUNNEL-MODE FALSE POSITIVE: an overlay that is ONLY the Vite HMR
    // websocket-connect failure is a connectivity/infra warning, not a render
    // defect. The blank-root branch above already handles a genuinely empty
    // #root, so a kind:"overlay" result here means the app mounted with content.
    // Treat the HMR-ws overlay as healthy (return null) so it never reaches the
    // self-heal loop or skips a thumbnail.
    if (result && result.kind === "overlay" && HMR_WS_CONNECT_RE.test(result.message)) {
      return null;
    }
    return result;
  })();

  try {
    return await Promise.race([work, timeout]);
  } catch {
    return null; // navigation/eval/timeout error — fail open
  } finally {
    if (timer) clearTimeout(timer);
    await page.close().catch(() => {});
    touchIdleTimer();
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
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
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
