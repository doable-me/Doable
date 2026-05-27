/**
 * Tool callback factories: deduplicating recorder and
 * shared tool-progress hooks created per-request.
 */
import type { SSEStreamingApi } from "hono/streaming";
import type { ChatStreamState } from "./types.js";
import type { TraceCollector } from "../../ai/trace-collector.js";
import { sql } from "../../db/index.js";
import { pendingUiResources } from "../../mcp/tool-bridge.js";
import { storeArtifact } from "../artifacts.js";
import { pushArtifacts } from "./artifact-stash.js";
import { writeProjectFile } from "../../ai/project-files.js";

const ARTIFACT_PUBLIC_URL =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4000";

type ArtifactRef = {
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Project-relative file path the artifact was also persisted to (HTML decks). */
  projectPath?: string;
};

/**
 * Rewrite oversize `data:<mime>;base64,<b64>` URIs inside MCP-UI rawHtml
 * payloads to small `https://api/.../artifacts/<id>` URLs. Cloudflare
 * Tunnel can drop SSE events whose single `data:` line exceeds ~50KB, so
 * extracting the bytes here keeps the streamed event tiny. Also returns
 * the artifacts so the caller can emit a separate, dedicated SSE event
 * (the mcp_ui_resource iframe path can still be flaky on some networks).
 *
 * For HTML decks (web-slides), the bytes are also written to the project's
 * `index.html` so the deck behaves like any other generated website:
 * survives page reloads, gets thumbnailed by the dashboard, and can be
 * iteratively edited by the AI via the standard read/edit-file tools.
 */
function offloadDataUris(
  html: string,
  projectId?: string,
  resourceUri?: string,
): {
  html: string;
  artifacts: ArtifactRef[];
  bytesByExt: Map<string, Buffer>;
  urlByExt: Map<string, string>;
} {
  const artifacts: ArtifactRef[] = [];
  // Hoisted above the early-return so callers always get the maps back,
  // even for empty html. This decouples persistViewerToProject() from any
  // future tweak to this function's size-guard / SSE-size optimization.
  const bytesByExt = new Map<string, Buffer>();
  const urlByExt = new Map<string, string>();
  if (projectId && resourceUri) {
    console.error(`[tool-callbacks] offloadDataUris entry project=${projectId} resourceUri=${resourceUri} htmlLen=${html?.length ?? 0}`);
  }
  if (!html) return { html, artifacts, bytesByExt, urlByExt };
  // Dedup identical data URIs (same mime + same base64 body). The
  // unified deck card references the HTML data URI in BOTH the "Open"
  // link and the "Download .html" link; without dedup each match would
  // store a separate artifact and surface as two download rows.
  const byKey = new Map<string, string>(); // key → public url
  const out = html.replace(
    /data:([a-zA-Z0-9.+/-]+(?:;[^,;]+)*);base64,([A-Za-z0-9+/=]{500,})/g,
    (_match, mime: string, b64: string) => {
      const key = `${mime}|${b64.length}|${b64.slice(0, 32)}|${b64.slice(-32)}`;
      const existing = byKey.get(key);
      if (existing) return existing;
      try {
        const bytes = Buffer.from(b64, "base64");
        const ext =
          mime.includes("presentationml") ? "pptx" :
          mime.includes("spreadsheetml") ? "xlsx" :
          mime.includes("text/csv") ? "csv" :
          mime.includes("text/markdown") ? "md" :
          mime.includes("html") ? "html" :
          mime.includes("pdf") ? "pdf" :
          mime.includes("png") ? "png" :
          "bin";
        const baseByExt: Record<string, string> = {
          pptx: "presentation",
          xlsx: "spreadsheet",
          csv: "spreadsheet",
          md: "document",
          pdf: "document",
          html: "document",
          png: "image",
        };
        const base = baseByExt[ext] || "artifact";
        const fileName = `${base}-${Date.now()}.${ext}`;
        const id = storeArtifact({ bytes, mimeType: mime, fileName });
        const url = `${ARTIFACT_PUBLIC_URL.replace(/\/$/, "")}/artifacts/${id}.${ext}`;
        const ref: ArtifactRef = { url, fileName, mimeType: mime, sizeBytes: bytes.length };

        if (!bytesByExt.has(ext)) bytesByExt.set(ext, bytes);
        if (!urlByExt.has(ext)) urlByExt.set(ext, url);

        artifacts.push(ref);
        byKey.set(key, url);
        return url;
      } catch {
        return _match;
      }
    },
  );

  return { html: out, artifacts, bytesByExt, urlByExt };
}

/**
 * Persist a viewer page to `projects/<id>/index.html` for built-in builder
 * MCP tools. Decoupled from `offloadDataUris` so any future change to that
 * function's SSE-size optimization cannot accidentally block preview
 * persistence — the regression that hid small spreadsheets in commits
 * prior to 6f0357e2. Call AFTER `offloadDataUris` with its returned maps.
 *
 * Match is by `resourceUri` substring (`presentation-builder`,
 * `pdf-builder/build`, `markdown-builder/build`, `spreadsheet-builder/build`)
 * — independent of how many or what size of data URIs the offload pass
 * extracted. If a future MCP server emits URL-referenced artifacts instead
 * of inline base64, the dispatch still fires and logs a "no viewer source"
 * diagnostic instead of silently doing nothing.
 */
function persistViewerToProject(
  projectId: string | undefined,
  resourceUri: string | undefined,
  artifacts: ArtifactRef[],
  bytesByExt: Map<string, Buffer>,
  urlByExt: Map<string, string>,
): void {
  if (!projectId || !resourceUri) return;
  const matchesBuilder = resourceUri.includes("presentation-builder")
    || resourceUri.includes("pdf-builder/build")
    || resourceUri.includes("markdown-builder/build")
    || resourceUri.includes("spreadsheet-builder/build");
  if (!matchesBuilder) return;

  const setProjectPath = (ext: string, path: string) => {
    const a = artifacts.find((x) => x.fileName.endsWith(`.${ext}`));
    if (a) a.projectPath = path;
  };
  const writeIndex = (text: string, primaryExt: string) => {
    console.error(`[tool-callbacks] persistViewerToProject called: project=${projectId} ext=${primaryExt} bytes=${text.length} resourceUri=${resourceUri}`);
    writeProjectFile(projectId, "index.html", text).then(
      () => { console.error(`[tool-callbacks] wrote viewer to projects/${projectId}/index.html (${text.length}B)`); },
      (err) => { console.error(`[tool-callbacks] writeProjectFile index.html failed: ${(err as Error).message}`); },
    );
    setProjectPath(primaryExt, "index.html");
  };

  console.error(`[tool-callbacks] persistViewerToProject dispatch project=${projectId} resourceUri=${resourceUri} extsByBytes=${[...bytesByExt.keys()].join(",")} urlExts=${[...urlByExt.keys()].join(",")}`);
  if (resourceUri.includes("presentation-builder")) {
    const htmlBytes = bytesByExt.get("html");
    if (htmlBytes) writeIndex(htmlBytes.toString("utf-8"), "html");
    else console.error(`[tool-callbacks] persistViewerToProject: presentation-builder missing html bytes — skipped`);
  } else if (resourceUri.includes("pdf-builder/build")) {
    const pdfUrl = urlByExt.get("pdf");
    const htmlUrl = urlByExt.get("html");
    if (pdfUrl) writeIndex(buildPdfViewerHtml({ pdfUrl, htmlUrl }), "pdf");
    else console.error(`[tool-callbacks] persistViewerToProject: pdf-builder missing pdf url — skipped`);
  } else if (resourceUri.includes("markdown-builder/build")) {
    const htmlUrl = urlByExt.get("html");
    const mdUrl = urlByExt.get("md");
    if (htmlUrl) writeIndex(buildMarkdownViewerHtml({ htmlUrl, mdUrl }), "md");
    else console.error(`[tool-callbacks] persistViewerToProject: markdown-builder missing html url — skipped`);
  } else if (resourceUri.includes("spreadsheet-builder/build")) {
    const xlsxUrl = urlByExt.get("xlsx");
    const csvUrl = urlByExt.get("csv");
    if (xlsxUrl) writeIndex(buildSpreadsheetViewerHtml({ xlsxUrl, csvUrl }), "xlsx");
    else console.error(`[tool-callbacks] persistViewerToProject: spreadsheet-builder missing xlsx url — skipped`);
  }
}

/**
 * Project-preview HTML for PDFs — mirrors the spreadsheet viewer's contract so a
 * PDF build surfaces a real, usable document in the editor preview (not the
 * default scaffold splash). Two things matter and both used to be missing:
 *
 *   1. A visible "Download PDF" button (and the source .html when available).
 *      The user's prompt explicitly asks for one; the spreadsheet viewer has
 *      its ⬇ XLSX / ⬇ CSV bar links, the PDF viewer had none.
 *   2. A render path that actually works inside a sandboxed Vite preview iframe.
 *      The browser's native PDF plugin (an <iframe>/<object> pointed at the
 *      artifact URL) is the reliable primary view — it does not depend on a
 *      CDN script load. PDF.js stays as a progressive enhancement: when it
 *      loads it paints crisp canvas pages on top; if the CDN is blocked or the
 *      script fails, the native viewer underneath is already showing the doc.
 */
function buildPdfViewerHtml({ pdfUrl, htmlUrl }: { pdfUrl: string; htmlUrl?: string }): string {
  const htmlLink = htmlUrl
    ? `<a href="${htmlUrl}" download style="margin-left:12px">⬇ HTML</a>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Document preview</title><script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"></script><style>html,body{margin:0;padding:0;min-height:100%;background:#1a1a1a;color:#eaeaea;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}.bar{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#0f0f12;border-bottom:1px solid #27272a;position:sticky;top:0;z-index:10}.bar a{color:#fff;text-decoration:none;font-weight:600}.bar a:hover{text-decoration:underline}.viewer{width:100%;height:calc(100vh - 44px);border:0;display:block;background:#525659}.pages{display:none;flex-direction:column;align-items:center;gap:14px;padding:14px}.pages canvas{max-width:100%;height:auto;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.4)}.pages.active{display:flex}.viewer.hidden{display:none}.msg{padding:30px 16px;text-align:center;color:#a1a1aa;font-size:14px}.err{color:#f87171}@media (prefers-color-scheme:light){html,body{background:#f1f5f9;color:#0f172a}.bar{background:#fff;border-bottom-color:#e2e8f0;color:#0f172a}}</style></head><body><div class="bar"><span>📄 PDF preview</span><span><a href="${pdfUrl}" download>⬇ PDF</a>${htmlLink}</span></div><iframe id="native" class="viewer" title="PDF preview" src="${pdfUrl}"></iframe><div id="pages" class="pages"></div><script>
(async () => {
  const wrap = document.getElementById("pages");
  const native = document.getElementById("native");
  try {
    if (!window.pdfjsLib) throw new Error("pdf.js failed to load");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    const doc = await pdfjsLib.getDocument({ url: ${JSON.stringify(pdfUrl)} }).promise;
    wrap.innerHTML = "";
    const max = Math.min(doc.numPages, 30);
    for (let i = 1; i <= max; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width; canvas.height = vp.height;
      wrap.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    }
    // PDF.js succeeded — swap to the crisp canvas render and drop the native frame.
    native.classList.add("hidden");
    wrap.classList.add("active");
  } catch (e) {
    // PDF.js unavailable (CDN blocked / script failed) — the native <iframe>
    // above is already showing the document, so just leave it in place. The
    // ⬇ PDF download button in the bar is always available regardless.
    console.warn("[pdf-viewer] inline PDF.js render unavailable, using native viewer:", e && e.message || e);
  }
})();
</script></body></html>`;
}

/**
 * Project-preview HTML for Markdown docs — mirrors the spreadsheet/PDF viewer's
 * contract so a markdown build surfaces a real, rendered document in the editor
 * preview (not the default scaffold splash). Why a dedicated viewer instead of
 * writing the rendered prose straight into index.html (the previous behavior):
 *
 *   1. A guaranteed-standalone page. The markdown-builder's rendered prose can
 *      legitimately CONTAIN the string `src="/src/main.tsx"` (e.g. a quickstart
 *      doc that documents the React scaffold). Persisting that prose AS
 *      index.html trips isStandaloneDoc (ai/preview-errors.ts) into treating the
 *      doc as a broken React app and sends the self-heal loop probing src/*.
 *      This wrapper page never contains a /src module entry, so isStandaloneDoc
 *      stays true and the doc-artifact guard keeps working.
 *   2. A visible download bar (⬇ MD / ⬇ HTML), matching the spreadsheet viewer's
 *      ⬇ XLSX / ⬇ CSV and the PDF viewer's ⬇ PDF — the downloadable artifact the
 *      builder produced is preserved in the preview, not dropped.
 *
 * The rendered `.html` artifact is shown via an <iframe src> (URL-referenced,
 * like the spreadsheet viewer fetches the .xlsx) so the page stays tiny and the
 * heavy document bytes live in the artifact store, not inline in index.html.
 */
function buildMarkdownViewerHtml({ htmlUrl, mdUrl }: { htmlUrl: string; mdUrl?: string }): string {
  const mdLink = mdUrl
    ? `<a href="${mdUrl}" download style="margin-left:12px">⬇ MD</a>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Document preview</title><style>html,body{margin:0;padding:0;min-height:100%;background:#fff;color:#0f172a;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}.bar{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#6d28d9;color:#fff;position:sticky;top:0;z-index:10}.bar a{color:#fff;text-decoration:none;font-weight:600}.bar a:hover{text-decoration:underline}.viewer{width:100%;height:calc(100vh - 44px);border:0;display:block;background:#fff}@media (prefers-color-scheme:dark){html,body{background:#111113;color:#e4e4e7}.viewer{background:#111113}}</style></head><body><div class="bar"><span>📝 Document preview</span><span><a href="${htmlUrl}" download>⬇ HTML</a>${mdLink}</span></div><iframe class="viewer" title="Document preview" src="${htmlUrl}"></iframe></body></html>`;
}

/** Project-preview HTML for spreadsheets — renders the workbook with SheetJS. */
function buildSpreadsheetViewerHtml({ xlsxUrl, csvUrl }: { xlsxUrl: string; csvUrl?: string }): string {
  const csvLink = csvUrl
    ? `<a href="${csvUrl}" download style="margin-left:12px">⬇ CSV</a>`
    : "";
  // NOTE: Spreadsheet previews are intentionally pinned to a light palette.
  // Workbooks frequently embed explicit per-cell fill colors which SheetJS
  // emits as inline `background-color` on each <td>. If we let the preview
  // follow the host editor's dark mode (the visual-edit bridge mirrors
  // `prefers-color-scheme:dark` rules under `.dark`), body text flips light
  // while inline cell backgrounds stay light → unreadable light-on-light.
  // We pin html/body/.dark to a light scheme and force td/th text colors
  // with !important so the bridge's dark-shim can't override them.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Spreadsheet preview</title><meta name="color-scheme" content="light"/><script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script><style>html,body{margin:0;padding:0;background:#fff;color:#0f172a;color-scheme:light;font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}html.dark,html.dark body,.dark,.dark body{background:#fff!important;color:#0f172a!important;color-scheme:light!important}.bar{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#059669;color:#fff;position:sticky;top:0;z-index:10}.bar a{color:#fff;text-decoration:none;font-weight:600}.bar a:hover{text-decoration:underline}.tabs{display:flex;gap:2px;padding:0 16px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;overflow-x:auto}.tabs button{padding:8px 14px;border:0;background:transparent;color:#475569;font:inherit;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}.tabs button.active{color:#059669;border-bottom-color:#059669}.wrap{padding:14px 16px;overflow:auto;max-height:calc(100vh - 96px);background:#fff;color:#0f172a}table{border-collapse:collapse;font-size:12px;background:#fff;color:#0f172a}th,td{border:1px solid #e2e8f0;padding:6px 10px;text-align:left;vertical-align:top;max-width:280px;overflow:hidden;text-overflow:ellipsis;color:#0f172a!important}th{background:#0f172a;color:#fff!important;font-weight:600;position:sticky;top:0}tr:nth-child(even) td{background:#f8fafc}.loading,.err{padding:30px 16px;color:#64748b;font-size:14px}.err{color:#dc2626}</style></head><body><div class="bar"><span>📊 Spreadsheet preview</span><span><a href="${xlsxUrl}" download>⬇ XLSX</a>${csvLink}</span></div><div id="tabs" class="tabs"></div><div id="wrap" class="wrap"><div class="loading">Loading workbook…</div></div><script>(async()=>{const tabsEl=document.getElementById("tabs"),wrapEl=document.getElementById("wrap");try{const r=await fetch(${JSON.stringify(xlsxUrl)});if(!r.ok)throw new Error("HTTP "+r.status);const buf=await r.arrayBuffer();const wb=XLSX.read(buf,{type:"array"});const names=wb.SheetNames;function render(name){const ws=wb.Sheets[name];const html=XLSX.utils.sheet_to_html(ws,{editable:false});wrapEl.innerHTML=html.replace(/<table[^>]*>/,'<table>');for(const b of tabsEl.querySelectorAll("button"))b.classList.toggle("active",b.dataset.n===name)}for(const n of names){const b=document.createElement("button");b.textContent=n;b.dataset.n=n;b.onclick=()=>render(n);tabsEl.appendChild(b)}render(names[0])}catch(e){wrapEl.innerHTML='<div class="err">Failed to render workbook: '+(e&&e.message||e)+'<br><br>Use the XLSX download button above to open in Excel/Numbers/Sheets.</div>'}})();</script></body></html>`;
}

function dlog(msg: string) {
  if (!process.env.MCP_DEBUG) return;
  console.error(`[${new Date().toISOString()}] [tool-callbacks] ${msg}`);
}
import {
  friendlyToolMessage,
  friendlyToolResult,
} from "../../ai/tool-messages.js";
import { extractSseHintPayload } from "../../ai/plan-parser.js";

/** Deduplicating recorder for assistant tool calls. */
export function createRecordAssistantToolCall(state: ChatStreamState) {
  return (name?: string, args?: unknown) => {
    if (!name) return;
    const normalizedArgs = args && typeof args === "object"
      ? (args as Record<string, unknown>)
      : undefined;
    const argsKey = JSON.stringify(normalizedArgs ?? null);

    for (let i = 0; i < state.assistantToolCalls.length; i++) {
      const e = state.assistantToolCalls[i] as { name?: string; arguments?: unknown };
      if (e.name !== name) continue;
      const existingKey = JSON.stringify(e.arguments ?? null);
      if (existingKey === argsKey) return;
      if (normalizedArgs && !e.arguments) {
        state.assistantToolCalls[i] = { name, arguments: normalizedArgs };
        return;
      }
      if (!normalizedArgs && e.arguments) return;
    }
    state.assistantToolCalls.push({ name, arguments: normalizedArgs });
    state.hadToolCalls = true;
  };
}

/** Create shared tool-progress callbacks for session create/resume. */
export function createToolProgressCallbacks(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  traceCollector: TraceCollector | null,
  recordAssistantToolCall: (name?: string, args?: unknown) => void,
  projectId?: string,
) {
  return {
    onToolStart: (toolName: string, rawArgs: unknown) => {
      // Some SDK channels wrap the real tool args under .arguments
      // ({ toolName, arguments: {...real args...}, toolCallId }); unwrap so
      // path/command extraction below finds the user-facing fields.
      const argsObj = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
      const args = (argsObj as { arguments?: Record<string, unknown> }).arguments ?? argsObj;
      recordAssistantToolCall(toolName, args);
      traceCollector?.onToolStart(toolName, args);
      const friendly = friendlyToolMessage(toolName, args);
      const a = args;
      const path =
        (a.path as string | undefined) ??
        (a.filePath as string | undefined) ??
        (a.file as string | undefined) ??
        (a.target as string | undefined);
      const rawCmd = a.command ?? a.cmd ?? a.input;
      const command = typeof rawCmd === "string" ? rawCmd : undefined;
      const packages = Array.isArray(a.packages)
        ? (a.packages as unknown[]).filter((p) => typeof p === "string").join(" ")
        : typeof a.packages === "string" ? (a.packages as string)
        : typeof a.name === "string" && (toolName.toLowerCase().includes("install") || toolName.toLowerCase().includes("package"))
          ? (a.name as string) : undefined;
      stream.writeSSE({ data: JSON.stringify({
        type: "tool_call",
        data: {
          name: toolName,
          friendlyMessage: friendly,
          arguments: args,
          ...(path ? { path } : {}),
          ...(command ? { command } : {}),
          ...(packages ? { packages } : {}),
        },
      }) }).catch(() => {});
      if (toolName === "provision_supabase") {
        const a = (args as Record<string, unknown>) ?? {};
        const name = typeof a.name === "string" ? a.name : "";
        stream.writeSSE({ data: JSON.stringify({
          type: "provision_supabase_required",
          data: { name, reason: "" },
        }) }).catch(() => {});
      }
    },
    onToolEnd: async (toolName: string, rawEndArgs: unknown, result: unknown) => {
      dlog(`onToolEnd ${toolName} pendingUiResources=${pendingUiResources.length}`);
      const _argsObj = (rawEndArgs && typeof rawEndArgs === "object" ? rawEndArgs : {}) as Record<string, unknown>;
      const _args = (_argsObj as { arguments?: Record<string, unknown> }).arguments ?? _argsObj;
      state.hadToolCalls = true;
      traceCollector?.onToolEnd(toolName, _args, result);
      const friendly = friendlyToolResult(toolName, result, true);
      const ea = _args;
      const endPath =
        (ea.path as string | undefined) ??
        (ea.filePath as string | undefined) ??
        (ea.file as string | undefined) ??
        (ea.target as string | undefined);
      // Pre-rewrite any pendingUiResources NOW so we can attach the
      // resulting artifact refs to the (always-delivered) tool_result
      // event below. We mutate items in place; the drain loop later just
      // emits them as-is. This makes downloads resilient to CF tunnel
      // dropping `mcp_ui_resource` or `artifact_ready` SSE events.
      const collectedArtifacts: ArtifactRef[] = [];
      for (const item of pendingUiResources) {
        const r = item.resource as unknown as Record<string, unknown> & { text?: string; uri?: string };
        // Always run extraction so persistViewerToProject() below has its
        // bytesByExt / urlByExt maps populated even for small payloads. The
        // historical `> 16 * 1024` gate was an SSE-size optimization that
        // silently broke preview persistence for sub-16KB builder outputs
        // (the bug behind project 3b698510). The regex inside offloadDataUris
        // still requires {500,} base64 chars per data URI, so tiny text-only
        // payloads return quickly with no real work done.
        if (typeof r?.text === "string") {
          const resourceUri = typeof r.uri === "string" ? r.uri : undefined;
          const { html: rewritten, artifacts: arts, bytesByExt, urlByExt } =
            offloadDataUris(r.text, projectId, resourceUri);
          if (arts.length > 0) {
            collectedArtifacts.push(...arts);
            (item.resource as unknown as Record<string, unknown>).text = rewritten;
            (item as unknown as Record<string, unknown>)._offloaded = true;
          }
          persistViewerToProject(projectId, resourceUri, arts, bytesByExt, urlByExt);
          // Mark as already-persisted so the drain loop below doesn't re-invoke
          // persistViewerToProject on the (now rewritten, no-data-URI) text.
          (item as unknown as Record<string, unknown>)._persisted = true;
        }
      }
      // If any artifact was persisted to a project file, surface that path
      // on the tool_result so the editor's standard "file changed" refresh
      // path picks it up — same UX as create_file.
      const persistedPath = collectedArtifacts.find((a) => a.projectPath)?.projectPath;
      stream.writeSSE({ data: JSON.stringify({
        type: "tool_result",
        data: {
          name: toolName,
          success: true,
          friendlyMessage: friendly,
          ...(persistedPath ? { path: persistedPath } : endPath ? { path: endPath } : {}),
          ...(collectedArtifacts.length > 0 ? { artifacts: collectedArtifacts } : {}),
        },
      }) }).catch(() => {});
      if (collectedArtifacts.length > 0) {
        // Stash for event-processor to merge into the canonical tool_result
        // emit. Use a process-global stash because the Copilot SDK caches
        // its toolProgress callbacks across requests, so per-request state
        // is not visible to the consumer side.
        pushArtifacts(toolName, collectedArtifacts);
        const existing = state.pendingArtifacts.get(toolName) ?? [];
        state.pendingArtifacts.set(toolName, [...existing, ...collectedArtifacts]);
        dlog(`tool_result included ${collectedArtifacts.length} artifact(s) inline for ${toolName} (also pushed to global stash + per-state map)`);
      }
      // ALSO emit each artifact as its own redundant tiny SSE event
      // type ("artifact"). Multiple distinct event types means even if one
      // is dropped by an upstream proxy/tunnel, the others arrive.
      for (const a of collectedArtifacts) {
        const payload = JSON.stringify({ type: "artifact", data: { ...a, toolName } });
        try {
          await stream.writeSSE({ data: payload });
          dlog(`artifact SSE emit OK ${payload.length}B`);
        } catch (e) {
          dlog(`artifact SSE emit FAILED: ${(e as Error).message}`);
        }
      }

      if (toolName === "ask_clarification" && result) {
        try {
          const output = typeof result === "string" ? result : (result as Record<string, unknown>)?.output as string;
          if (output) {
            const questions = JSON.parse(output);
            if (Array.isArray(questions) && questions.length > 0) {
              stream.writeSSE({ data: JSON.stringify({
                type: "clarification", data: { questions },
              }) }).catch(() => {});
            }
          }
        } catch { /* non-critical */ }
      }
      if (toolName === "provision_supabase") {
        try {
          const payload = extractSseHintPayload(result, "provision_supabase_required");
          if (payload) {
            stream.writeSSE({ data: JSON.stringify({
              type: "provision_supabase_required",
              data: { name: payload.name ?? "", reason: payload.reason ?? "" },
            }) }).catch(() => {});
          }
        } catch (e) {
          console.warn("[Chat] provision_supabase SSE forward threw:", e);
        }
      }
      {
        const integrationPayload = extractSseHintPayload(result, "integration_required");
        if (integrationPayload && integrationPayload.integrationId) {
          stream.writeSSE({ data: JSON.stringify({
            type: "integration_required",
            data: {
              integrationId: integrationPayload.integrationId,
              displayName: integrationPayload.displayName ?? integrationPayload.integrationId,
              logoUrl: integrationPayload.logoUrl,
              reason: integrationPayload.reason ?? "",
            },
          }) }).catch(() => {});
        }
      }
      if (toolName === "create_plan" && result) {
        try {
          const output = typeof result === "string" ? result : (result as Record<string, unknown>)?.output as string;
          if (output) {
            const plan = JSON.parse(output);
            if (plan?.id) {
              stream.writeSSE({ data: JSON.stringify({
                type: "plan", data: { plan },
              }) }).catch(() => {});
              sql`INSERT INTO plans (id, project_id, summary, complexity, status, created_at)
                  VALUES (${plan.id}, ${plan.projectId ?? ""}, ${plan.summary}, ${plan.complexity}, 'draft', now())
                  ON CONFLICT (id) DO NOTHING`.catch(() => {});
              if (Array.isArray(plan.steps)) {
                for (const step of plan.steps) {
                  sql`INSERT INTO plan_steps (id, plan_id, "order", title, description, details, status, file_paths)
                      VALUES (${step.id}, ${plan.id}, ${step.order}, ${step.title}, ${step.description}, ${step.details ?? null}, 'pending', ${step.filePaths ?? null})
                      ON CONFLICT (id) DO NOTHING`.catch(() => {});
                }
              }
            }
          }
        } catch { /* non-critical */ }
      }
      {
        // Drain MCP-Apps UI resources queued by tool-bridge during this call.
        while (pendingUiResources.length > 0) {
          const item = pendingUiResources.shift();
          if (!item) break;
          const emittedToolCallId = `tc_${toolName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          // Off-load any oversize base64 data: URIs inside the rawHtml so the
          // resulting SSE event stays small enough to flow through Cloudflare
          // Tunnel without buffering / drops, and grab the artifact refs so
          // we can also emit a small dedicated `artifact_ready` event (the
          // mcp_ui_resource iframe path can still be flaky).
          let artifacts: ArtifactRef[] = [];
          const safeResource = (() => {
            const r = item.resource as Record<string, unknown> & { text?: string; uri?: string };
            // Always run extraction (no size gate) so persistViewerToProject
            // fires for small builder outputs. See sibling pre-rewrite loop
            // above for the rationale (project 3b698510 regression).
            if (typeof r?.text === "string") {
              const resourceUri = typeof r.uri === "string" ? r.uri : undefined;
              const { html: rewritten, artifacts: arts, bytesByExt, urlByExt } =
                offloadDataUris(r.text, projectId, resourceUri);
              artifacts = arts;
              // Skip persistence if the pre-rewrite loop already handled this
              // item (avoids double-invocation log noise on already-rewritten text).
              const alreadyPersisted = (item as unknown as Record<string, unknown>)._persisted === true;
              if (!alreadyPersisted) {
                persistViewerToProject(projectId, resourceUri, arts, bytesByExt, urlByExt);
              }
              if (rewritten !== r.text) {
                return { ...r, text: rewritten };
              }
            }
            return r;
          })();
          // Emit one tiny `artifact_ready` event per off-loaded artifact
          // FIRST. Even if Cloudflare Tunnel drops the larger
          // mcp_ui_resource event, the client still gets a clickable
          // download link.
          for (const a of artifacts) {
            const small = JSON.stringify({ type: "artifact_ready", data: { ...a, toolName } });
            try {
              await stream.writeSSE({ data: small });
              dlog(`artifact_ready SSE write OK url=${a.url} (${small.length}B)`);
            } catch (e) {
              dlog(`artifact_ready SSE write FAILED: ${(e as Error).message}`);
            }
          }
          const sseData = JSON.stringify({
            type: "mcp_ui_resource",
            data: {
              toolCallId: emittedToolCallId,
              connectorId: item.connectorId,
              toolName,
              resource: safeResource,
            },
          });
          dlog(`mcp_ui_resource SSE emit uri=${item.resource.uri} bytes=${sseData.length}`);
          // BUG-R27-009: Hono's streamSSE drops 10+ KB writeSSE chunks
          // when the next event lands too quickly behind them. Two
          // synchronous console.log barriers around the write create the
          // event-loop turn that lets the chunk flush to the socket
          // before the next emit competes for the writer. With these
          // absent, the 13 KB presentation-builder auto-build card never
          // reaches the client — see investigation in commit message.
          // The log lines also double as production observability — they
          // are cheap and noted under [chat:mcp].
          console.log(`[chat:mcp] mcp_ui_resource emit uri=${item.resource.uri?.slice(0, 80)} bytes=${sseData.length}`);
          state.awaitingMcpWidget = true;
          try {
            await stream.writeSSE({ data: sseData });
            console.log(`[chat:mcp] mcp_ui_resource flushed uri=${item.resource.uri?.slice(0, 60)}`);
            dlog(`mcp_ui_resource SSE write OK`);
          } catch (e) {
            console.error(`[chat:mcp] mcp_ui_resource flush FAILED: ${(e as Error).message}`);
            dlog(`mcp_ui_resource SSE write FAILED: ${(e as Error).message}`);
          }
        }
      }
    },
    onSessionEnd: (reason: string, error?: string) => {
      if (error) console.error(`[Chat] Session ended: ${reason} —`, typeof error === 'object' ? JSON.stringify(error) : error);
    },
    onError: (error: unknown, context: string) => {
      const errorStr = typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error);
      console.error(`[Chat] Hook error (${context}):`, errorStr);
      if (!errorStr || errorStr === '{}' || errorStr === 'undefined') return;
      let userMessage: string;
      if (errorStr.includes("404") || errorStr.includes("not found")) {
        userMessage = "The AI model returned an error (404). The model may be unavailable or the model ID is incorrect. Check your AI settings.";
      } else if (errorStr.includes("401") || errorStr.includes("unauthorized") || errorStr.includes("not authorized")) {
        userMessage = "Authentication failed with the AI provider. Please check your API key in AI settings.";
      } else if (errorStr.includes("429") || errorStr.includes("rate limit")) {
        userMessage = "Rate limit reached. Please wait a moment and try again.";
      } else if (errorStr.includes("500") || errorStr.includes("internal server")) {
        userMessage = "The AI provider returned a server error. Please try again.";
      } else {
        userMessage = "An error occurred while communicating with the AI model. Please try again.";
      }
      stream.writeSSE({ data: JSON.stringify({
        type: "error", data: userMessage,
      }) }).catch(() => {});
    },
  };
}
