/**
 * Preview error detection — inspects a running Vite dev server for
 * transform failures or overlay errors, and builds a targeted prompt
 * the AI can use to auto-fix them.
 */

import { listFiles } from "../projects/file-manager.js";
import { getDevServerInternalUrl } from "../projects/dev-server.js";

/** Structured error info returned by detectPreviewError */
export interface PreviewErrorInfo {
  /** Human-readable error summary */
  message: string;
  /** The source of the error (file path or "preview page") */
  source: string;
  /** Raw error text (trimmed) */
  raw: string;
}

/**
 * Detect if HTML contains Vite's error overlay markup.
 * Returns the extracted error message or null.
 */
export function extractViteErrorOverlay(html: string): string | null {
  if (
    html.includes("vite-error-overlay") ||
    html.includes('pre class="message"') ||
    html.includes("Internal Server Error") ||
    html.includes("504 (Outdated Optimize Dep)")
  ) {
    const preMatch = html.match(/<pre[^>]*class="message"[^>]*>([\s\S]*?)<\/pre>/);
    if (preMatch) return preMatch[1]!.trim().slice(0, 800);

    const errMatch = html.match(/class="err-message"[^>]*>([\s\S]*?)<\//);
    if (errMatch) return errMatch[1]!.trim().slice(0, 800);

    const clean = html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 800);
    return clean;
  }
  return null;
}

/**
 * Check whether the Vite dev server can successfully transform
 * the project's key source files AND whether the preview page
 * shows Vite's error overlay. Returns structured error info if
 * something is broken, or null if everything is OK.
 */
export async function detectPreviewError(projectId: string): Promise<PreviewErrorInfo | null> {
  try {
    const internalUrl = getDevServerInternalUrl(projectId);
    if (!internalUrl) return null;

    const base = `${internalUrl}/preview/${projectId}`;

    const CANDIDATE_FILES = ["src/main.tsx", "src/App.tsx", "index.html", "src/index.tsx", "src/main.ts"];
    const projectFiles = await listFiles(projectId).catch(() => [] as string[]);
    const projectFileSet = new Set(projectFiles.map((f) => f.replace(/\\/g, "/")));
    const filesToCheck = CANDIDATE_FILES.filter((f) => projectFileSet.has(f));

    for (const file of filesToCheck) {
      try {
        const headers: Record<string, string> =
          file === "index.html"
            ? { Accept: "text/html" }
            : { Accept: "application/javascript" };
        const res = await fetch(`${base}/${file}`, { headers, signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
          const body = await res.text();
          const clean = body
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 800);
          return {
            message: `Error in ${file}: ${clean}`,
            source: file,
            raw: clean,
          };
        }
      } catch {
        // Network error — dev server might be restarting
      }
    }

    try {
      const pageRes = await fetch(`${base}/`, {
        headers: { Accept: "text/html" },
        signal: AbortSignal.timeout(5000),
      });
      if (pageRes.ok) {
        const pageHtml = await pageRes.text();
        const overlayError = extractViteErrorOverlay(pageHtml);
        if (overlayError) {
          return {
            message: `Preview page shows error overlay: ${overlayError}`,
            source: "preview page",
            raw: overlayError,
          };
        }
      } else {
        const body = await pageRes.text();
        const clean = body
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 800);
        return {
          message: `Preview page returned ${pageRes.status}: ${clean}`,
          source: "preview page",
          raw: clean,
        };
      }
    } catch {
      // Network error on page fetch — not a code error
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Build a targeted, structured prompt for the AI to fix a preview error.
 */
export function buildAutoFixPrompt(error: string): string {
  return (
    `URGENT: The live preview has an error that users can see. You MUST fix this now.\n\n` +
    `Error details:\n${error}\n\n` +
    `RULES for fixing:\n` +
    `1. Read the file that has the error FIRST\n` +
    `2. If it's "Failed to resolve import 'X'" → install the package with install_package, then re-save the importing file\n` +
    `3. If it's a syntax error → read the file, find the exact issue, rewrite the COMPLETE file\n` +
    `4. If it's "X is not exported" → read the exporting file and fix the export\n` +
    `5. If it's a runtime error → read src/App.tsx and any mentioned files, fix the logic\n` +
    `6. After fixing, verify by reading the file again\n\n` +
    `Fix it now. Do NOT explain — just fix.`
  );
}
