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
 * A Vite "Failed to resolve import" error for a pre-linked @doable/* package is
 * almost always a STARTUP TRANSIENT: the dev server begins serving before
 * linkDoableSdk has finished writing node_modules/@doable, or during a dep
 * re-optimize window. It self-heals within a second or two. Surfacing it to the
 * AI is actively harmful — the auto-fix prompt tells the model to install the
 * package, but @doable/* are private + pre-linked (not on npm), so install_package
 * 404s and the model improvises broken workarounds (local db stubs, .d.ts files,
 * hand-rolled fetch clients pointed at invented URLs). Detect this shape so the
 * caller can re-verify resolution and drop the error if it has already cleared.
 */
export function isDoableResolveTransient(raw: string): boolean {
  return /(?:failed to resolve import|cannot resolve|could not resolve)[^\n]*@doable\/(?:data|sdk|ai)/i.test(raw)
    || /@doable\/(?:data|sdk|ai)[^\n]*(?:is not (?:installed|resolved|exported)|cannot be resolved)/i.test(raw);
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
/**
 * Re-verify that every @doable/* package referenced in a resolve error now
 * resolves through Vite. Used to drop transient startup resolve errors before
 * they reach the AI. Returns true only when all referenced modules serve 2xx.
 */
async function doableImportNowResolves(base: string, raw: string): Promise<boolean> {
  const pkgs: string[] = [];
  if (/@doable\/data/.test(raw)) pkgs.push("data");
  if (/@doable\/sdk/.test(raw)) pkgs.push("sdk");
  if (pkgs.length === 0) return false;
  for (const p of pkgs) {
    try {
      const r = await fetch(`${base}/node_modules/@doable/${p}/src/index.ts`, {
        headers: { Accept: "application/javascript" },
        signal: AbortSignal.timeout(3000),
      });
      if (!r.ok) return false;
    } catch {
      return false;
    }
  }
  return true;
}

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
          // Drop transient @doable/* resolve errors that have already cleared —
          // surfacing them sends the AI down the install/stub/hand-rolled-client
          // rabbit hole for packages that are pre-linked, not on npm.
          if (isDoableResolveTransient(clean) && (await doableImportNowResolves(base, clean))) {
            continue;
          }
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
          if (isDoableResolveTransient(overlayError) && (await doableImportNowResolves(base, overlayError))) {
            return null;
          }
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
  const doableNote = isDoableResolveTransient(error)
    ? `\n⚠️ This error mentions @doable/data, @doable/sdk, or @doable/ai. These are PRE-LINKED platform ` +
      `packages (NOT on npm). DO NOT install_package them, DO NOT create a local db.ts / stub / ` +
      `.d.ts / wrapper, and DO NOT hand-roll a fetch client or invent an API URL (there is no ` +
      `"api.doable.dev"). The ONLY correct usage is \`import { db } from "@doable/data"\` then ` +
      `\`await db.query(sql, params)\`. This resolve error is almost always a transient that clears ` +
      `once the dev server finishes linking — re-save src/App.tsx UNCHANGED (keep the @doable/data ` +
      `import) and stop. If you already created a local db wrapper/stub, DELETE it and import ` +
      `@doable/data directly.\n` +
      `For @doable/ai: NEVER remove the \`ai.chat()\` / \`ai.chatSync()\` call or replace it with a ` +
      `mock / setTimeout / canned-responses array to clear the error. These are pre-linked platform ` +
      `packages (not on npm); keep the real \`import { ai } from "@doable/ai"\` plus the real call and ` +
      `fix the actual usage instead.\n`
    : "";
  return (
    `URGENT: The live preview has an error that users can see. You MUST fix this now.\n\n` +
    `Error details:\n${error}\n` +
    doableNote +
    `\nRULES for fixing:\n` +
    `1. Read the file that has the error FIRST\n` +
    `2. If it's "Failed to resolve import 'X'" → install the package with install_package, then re-save the importing file (EXCEPT @doable/* — see the warning above; never install or stub those)\n` +
    `3. If it's a syntax error → read the file, find the exact issue, rewrite the COMPLETE file\n` +
    `4. If it's "X is not exported" → read the exporting file and fix the export\n` +
    `5. If it's a runtime error → read src/App.tsx and any mentioned files, fix the logic\n` +
    `6. If it's "You cannot render a <Router> inside another <Router>" → there are TWO Router wrappers. REMOVE the Router from src/main.tsx (main.tsx must only have ErrorBoundary + StrictMode + <App />). Keep the Router ONLY in src/App.tsx.\n` +
    `7. After fixing, verify by reading the file again\n` +
    `8. PRESERVE the feature's intent — never delete, disable, or fake a real feature/integration (e.g. an AI chat, a DB query, an API call) just to make the preview render. Fix the real code path.\n\n` +
    `Fix it now. Do NOT explain — just fix.`
  );
}
