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
 * Vite's HMR client logs a websocket-connect failure (and may flash a transient
 * "server connection lost" overlay) when its live-reload websocket cannot reach
 * the dev server. In TUNNEL MODE the preview is served cross-origin through
 * cloudflared → api :4000 → per-project Vite, and the HMR ws relay
 * (wss://<domain>/preview/<id>/__hmr) can be momentarily unreachable during the
 * sandboxed cross-origin handshake. This is a CONNECTIVITY/INFRA condition, not
 * a code/render defect — the app is already mounted and rendering. Surfacing it
 * to the self-heal loop is a false positive: the model correctly concludes
 * "infrastructure issue, not a code issue", can't fix it, and burns all
 * MAX_FIX_ATTEMPTS, then the editor shows the scary "Auto-fix paused" banner.
 * Match the HMR-ws-connect shape so callers can drop it when the app is mounted.
 */
export const HMR_WS_CONNECT_RE =
  /failed to connect to websocket|\[vite\][^\n]*websocket|server connection lost|websocket connection[^\n]*fail/i;

/** True when `text` is (only) the benign Vite HMR websocket-connect failure. */
export function isHmrWsConnectError(text: string): boolean {
  return HMR_WS_CONNECT_RE.test(text);
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

    // MCP doc-builders (markdown, presentation) emit a self-contained index.html
    // that does NOT load a /src module entry. The React scaffold's src/*.tsx are
    // left orphaned (and may be stale/broken — e.g. a model-written App.tsx with
    // a JSX typo) but are NEVER served, so probing them yields false "preview
    // errors" the auto-fix loop can't resolve (it tries to repair code the live
    // page doesn't use). Only a real Vite/React app's index.html references
    // /src/main.tsx — when it does not, treat the project as a standalone
    // document and skip all src probing (still check index.html + the page).
    let isStandaloneDoc = false;
    if (projectFileSet.has("index.html")) {
      try {
        const r = await fetch(`${base}/index.html`, { headers: { Accept: "text/html" }, signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const html = await r.text();
          isStandaloneDoc = !/src=["']\/?src\/(?:main|index)\.[tj]sx?["']/i.test(html);
        }
      } catch {
        // dev server may be restarting — fall through to the normal checks
      }
    }

    const filesToCheck = (isStandaloneDoc
      ? CANDIDATE_FILES.filter((f) => f === "index.html")
      : CANDIDATE_FILES
    ).filter((f) => projectFileSet.has(f));

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

    // Deep-module probe. The entry files (main/App) transform fine even when a
    // NON-entry module (e.g. src/hooks/useGoldPrice.ts) has a resolve or syntax
    // error, because Vite transforms modules on-demand per request and does not
    // eagerly walk the import graph when you fetch the entry. The HMR error
    // overlay is injected client-side over the websocket, so it never appears in
    // the server-rendered "/" HTML either. Net effect: a single bad import in any
    // non-entry module produces a blank screen that the checks above miss. Probe
    // every local source module through Vite and surface the first transform
    // error. Type-only imports are elided by the transform, so a wrong `import
    // type` path never false-positives here — only real (value) resolve/syntax
    // errors 500.
    if (!isStandaloneDoc) {
      const SOURCE_RE = /\.(tsx?|jsx?|mjs)$/;
      const deepFiles = projectFiles
        .map((f) => f.replace(/\\/g, "/"))
        .filter(
          (f) =>
            f.startsWith("src/") &&
            SOURCE_RE.test(f) &&
            !f.endsWith(".d.ts") &&
            !filesToCheck.includes(f),
        )
        .slice(0, 80); // bound cost for pathologically large projects

      const probe = async (file: string): Promise<PreviewErrorInfo | null> => {
        try {
          const res = await fetch(`${base}/${file}`, {
            headers: { Accept: "application/javascript" },
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) return null;
          const body = await res.text();
          const clean = body
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 800);
          if (isDoableResolveTransient(clean) && (await doableImportNowResolves(base, clean))) {
            return null;
          }
          return { message: `Error in ${file}: ${clean}`, source: file, raw: clean };
        } catch {
          return null; // network blip — dev server may be restarting
        }
      };

      const CONCURRENCY = 8;
      for (let i = 0; i < deepFiles.length; i += CONCURRENCY) {
        const batch = deepFiles.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(probe));
        const firstErr = results.find((r): r is PreviewErrorInfo => r !== null);
        if (firstErr) return firstErr;
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

    // Browser-runtime probe (REAL REACT APPS ONLY). The server-side fetches
    // above cannot see two real failure modes: (1) a Vite HMR error overlay
    // injected CLIENT-SIDE over the websocket (e.g. vite:import-analysis
    // "Failed to resolve import './lib/utils'") which never appears in the
    // server-rendered "/" HTML, and (2) a runtime throw during React mount that
    // leaves #root empty with no overlay (a silent blank screen). Both are only
    // observable after the bundle runs in a real browser. We gate this behind
    // the SAME `isStandaloneDoc` flag used everywhere above: doc-artifacts
    // (markdown/pdf/pptx static HTML with no /src entry) legitimately have an
    // empty #root / no React mount and must NEVER be probed this way. The probe
    // fails open (returns null) on any Chrome/launch/timeout error, so a missing
    // browser can't manufacture a false "broken" verdict. It reuses the shared
    // headless Chrome that thumbnail capture already manages.
    if (!isStandaloneDoc) {
      try {
        const { probePreviewRuntime } = await import("../thumbnails/capture.js");
        const runtime = await probePreviewRuntime(`${base}/`);
        if (runtime) {
          if (isDoableResolveTransient(runtime.message) && (await doableImportNowResolves(base, runtime.message))) {
            return null;
          }
          // TUNNEL-MODE FALSE POSITIVE: a client-injected overlay that is only the
          // Vite HMR websocket-connect failure means HMR couldn't reach the dev
          // server through the cross-origin tunnel — the app itself is mounted and
          // rendering. probePreviewRuntime only returns kind:"overlay" when #root
          // has content (the blank-root branch handles an empty root separately),
          // so this is purely a connectivity warning. Do NOT treat it as a preview
          // error or the self-heal loop burns MAX_FIX_ATTEMPTS on an infra issue.
          if (runtime.kind === "overlay" && isHmrWsConnectError(runtime.message)) {
            return null;
          }
          return {
            message:
              runtime.kind === "overlay"
                ? `Preview page shows error overlay: ${runtime.message}`
                : runtime.message,
            source: "preview page",
            raw: runtime.message,
          };
        }
      } catch {
        // Probe unavailable (e.g. Chrome not installed) — fail open.
      }
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
  // A "Failed to resolve import './x'" or "../x" is a LOCAL FILE path error, not
  // a missing npm package. install_package can never fix it (and 404s). The
  // model must correct the relative path (or create the missing file) instead.
  const isRelativeResolve =
    /failed to resolve import\s+["']\.\.?\//i.test(error) ||
    /(?:cannot|could not) resolve\s+["']\.\.?\//i.test(error);
  const relativeNote = isRelativeResolve
    ? `\n⚠️ This is a RELATIVE import (starts with "./" or "../") — it points to a LOCAL file in this ` +
      `project, NOT an npm package. DO NOT install_package it (that will 404). The file was likely ` +
      `placed in a different folder than the import assumes. Read the importing file, find where the ` +
      `target actually lives (commonly src/lib/, src/components/, src/hooks/, src/types), and correct ` +
      `the relative path (e.g. a file in src/hooks/ importing shared utils must use "../lib/utils", not ` +
      `"./utils"). If the target genuinely does not exist, create it. Then re-save the importing file.\n`
    : "";
  // A "lucide-react does not provide an export named 'X'" error means the model
  // imported an icon that does not exist in lucide-react — almost always a
  // hallucinated Phosphor / react-icons / heroicons name (e.g. ChatCircle,
  // ArrowSquareOut). install_package can't fix it and re-importing the same bad
  // name loops forever (this is the #1 cause of stuck auto-fix). Tell the model
  // the import is invalid and to swap to a real lucide-react icon.
  const badIconMatch = /lucide-react[^]*?does not provide an export named ['"]?([A-Za-z0-9_]+)/i.exec(error);
  const lucideNote = badIconMatch
    ? `\n⚠️ "${badIconMatch[1]}" is NOT a real lucide-react icon (it looks like a Phosphor/react-icons/` +
      `heroicons name). DO NOT install_package and DO NOT keep re-importing it — that loops forever. ` +
      `Replace it (and audit EVERY lucide-react import across all components) with a real lucide-react ` +
      `icon. Common valid swaps: ChatCircle/ChatCircleDots→MessageCircle or MessageSquare, ` +
      `ArrowSquareOut→ExternalLink, Maximize2→Maximize, Minimize2→Minimize, MagnifyingGlass→Search, ` +
      `Trash→Trash2, Gear→Settings, House→Home, CurrencyDollar→DollarSign, Coins→Coins, Diamond→Gem. ` +
      `If unsure a name exists, use a safe common icon (Circle, Star, Info, Check, X). Then re-save.\n`
    : "";
  return (
    `URGENT: The live preview has an error that users can see. You MUST fix this now.\n\n` +
    `Error details:\n${error}\n` +
    doableNote +
    relativeNote +
    lucideNote +
    `\nRULES for fixing:\n` +
    `1. Read the file that has the error FIRST\n` +
    `2. If it's "Failed to resolve import 'X'": when X is a RELATIVE path ("./" or "../") fix the path to the real local file (or create it) — do NOT install_package. When X is a bare package name, install it with install_package, then re-save the importing file (EXCEPT @doable/* — see the warning above; never install or stub those)\n` +
    `3. If it's a syntax error → read the file, find the exact issue, rewrite the COMPLETE file\n` +
    `4. If it's "X is not exported" → read the exporting file and fix the export\n` +
    `5. If it's a runtime error → read src/App.tsx and any mentioned files, fix the logic\n` +
    `6. If it's "You cannot render a <Router> inside another <Router>" → there are TWO Router wrappers. REMOVE the Router from src/main.tsx (main.tsx must only have ErrorBoundary + StrictMode + <App />). Keep the Router ONLY in src/App.tsx.\n` +
    `7. After fixing, verify by reading the file again\n` +
    `8. PRESERVE the feature's intent — never delete, disable, or fake a real feature/integration (e.g. an AI chat, a DB query, an API call) just to make the preview render. Fix the real code path.\n\n` +
    `Fix it now. Do NOT explain — just fix.`
  );
}
