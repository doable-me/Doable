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
): { html: string; artifacts: ArtifactRef[] } {
  const artifacts: ArtifactRef[] = [];
  if (projectId && resourceUri) {
    console.error(`[tool-callbacks] offloadDataUris entry project=${projectId} resourceUri=${resourceUri} htmlLen=${html?.length ?? 0}`);
  }
  if (!html || html.length < 16 * 1024) return { html, artifacts };
  // Dedup identical data URIs (same mime + same base64 body). The
  // unified deck card references the HTML data URI in BOTH the "Open"
  // link and the "Download .html" link; without dedup each match would
  // store a separate artifact and surface as two download rows.
  const byKey = new Map<string, string>(); // key → public url
  // First-seen bytes per ext, used by the viewer-builder below to
  // craft a project-preview page that lives at projects/<id>/index.html.
  const bytesByExt = new Map<string, Buffer>();
  const urlByExt = new Map<string, string>();
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

  // Persist a project-preview page (`projects/<id>/index.html`) so the
  // right-side App Preview iframe shows the generated document. Each
  // built-in builder gets a viewer tuned to its document type. We
  // record the projectPath on the *first* matching artifact so the
  // editor's "file changed" refresh picks it up the same way it does
  // for create_file results.
  const setProjectPath = (ext: string, path: string) => {
    const a = artifacts.find((x) => x.fileName.endsWith(`.${ext}`));
    if (a) a.projectPath = path;
  };
  const persistIndex = (text: string, primaryExt: string) => {
    if (!projectId) return;
    console.error(`[tool-callbacks] persistIndex called: project=${projectId} ext=${primaryExt} bytes=${text.length} resourceUri=${resourceUri}`);
    writeProjectFile(projectId, "index.html", text).then(
      () => { console.error(`[tool-callbacks] wrote viewer to projects/${projectId}/index.html (${text.length}B)`); },
      (err) => { console.error(`[tool-callbacks] writeProjectFile index.html failed: ${(err as Error).message}`); },
    );
    setProjectPath(primaryExt, "index.html");
  };

  if (projectId && resourceUri) {
    console.error(`[tool-callbacks] offloadDataUris post-extract project=${projectId} resourceUri=${resourceUri} artifacts=${artifacts.length} extsByBytes=${[...bytesByExt.keys()].join(",")} urlExts=${[...urlByExt.keys()].join(",")}`);
    if (resourceUri.includes("presentation-builder")) {
      // Presentation deck: the html download IS the preview.
      const htmlBytes = bytesByExt.get("html");
      if (htmlBytes) persistIndex(htmlBytes.toString("utf-8"), "html");
    } else if (resourceUri.includes("pdf-builder/build")) {
      const pdfUrl = urlByExt.get("pdf");
      if (pdfUrl) persistIndex(buildPdfViewerHtml(pdfUrl), "pdf");
    } else if (resourceUri.includes("markdown-builder/build")) {
      // Rendered .html download is a standalone styled document — use it directly.
      const htmlBytes = bytesByExt.get("html");
      if (htmlBytes) persistIndex(htmlBytes.toString("utf-8"), "md");
    } else if (resourceUri.includes("spreadsheet-builder/build")) {
      const xlsxUrl = urlByExt.get("xlsx");
      const csvUrl = urlByExt.get("csv");
      if (xlsxUrl) persistIndex(buildSpreadsheetViewerHtml({ xlsxUrl, csvUrl }), "xlsx");
    }
  }

  return { html: out, artifacts };
}

/** Project-preview HTML for PDFs — renders pages via PDF.js (works inside a sandboxed iframe, unlike <embed>). */
function buildPdfViewerHtml(pdfUrl: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Document preview</title><script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"></script><style>html,body{margin:0;padding:0;min-height:100%;background:#1a1a1a;color:#eaeaea;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}.bar{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#0f0f12;border-bottom:1px solid #27272a;position:sticky;top:0;z-index:10}.bar a{color:#fff;background:#dc2626;padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px}.bar a:hover{background:#b91c1c}.pages{display:flex;flex-direction:column;align-items:center;gap:14px;padding:14px}.pages canvas{max-width:100%;height:auto;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.4)}.msg{padding:30px 16px;text-align:center;color:#a1a1aa;font-size:14px}.err{color:#f87171}@media (prefers-color-scheme:light){html,body{background:#f1f5f9;color:#0f172a}.bar{background:#fff;border-bottom-color:#e2e8f0;color:#0f172a}}</style></head><body><div class="bar"><span>📄 PDF preview</span><a href="${pdfUrl}" download>⬇ Download PDF</a></div><div id="pages" class="pages"><div class="msg">Loading PDF…</div></div><script>
(async () => {
  const wrap = document.getElementById("pages");
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
  } catch (e) {
    wrap.innerHTML = '<div class="msg err">Failed to render PDF inline: ' + (e && e.message || e) + '<br><br>Use the Download PDF button above to open the file directly.</div>';
  }
})();
</script></body></html>`;
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
        if (typeof r?.text === "string" && r.text.length > 16 * 1024) {
          const { html: rewritten, artifacts: arts } = offloadDataUris(r.text, projectId, typeof r.uri === "string" ? r.uri : undefined);
          if (arts.length > 0) {
            collectedArtifacts.push(...arts);
            (item.resource as unknown as Record<string, unknown>).text = rewritten;
            (item as unknown as Record<string, unknown>)._offloaded = true;
          }
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
            if (typeof r?.text === "string" && r.text.length > 16 * 1024) {
              const { html: rewritten, artifacts: arts } = offloadDataUris(r.text, projectId, typeof r.uri === "string" ? r.uri : undefined);
              artifacts = arts;
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
          state.awaitingMcpWidget = true;
          try {
            await stream.writeSSE({ data: sseData });
            dlog(`mcp_ui_resource SSE write OK`);
          } catch (e) {
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
