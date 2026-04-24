#!/usr/bin/env node
/**
 * Presentation Builder — an MCP App example for Doable.
 * --------------------------------------------------------
 * This server is COMPLETELY DECOUPLED from Doable. It speaks only the
 * standard MCP protocol + the MCP Apps UI extension (mcpui.dev /
 * modelcontextprotocol.io/extensions/apps).
 *
 * Two tools, no host-specific magic:
 *
 *   1. `create_presentation({ topic, slideCount?, audience?, tone? })`
 *        Returns a UIResource (HTML, sandboxed iframe in any MCP App host)
 *        rendering a picker. The picker has two buttons. When the user clicks,
 *        the iframe `postMessage`s a standard tool-action back to the host
 *        which the host proxies as a `tools/call` to this server.
 *
 *   2. `build_presentation({ topic, format, slideCount?, audience?, tone? })`
 *        Generates the artifact in-process and returns a UIResource showing a
 *        Download card. The .pptx bytes are embedded as a base64 data URL
 *        inside the iframe HTML, so the user can download with one click,
 *        with zero further host involvement.
 *
 * Hosts that speak MCP Apps will render this without any custom code.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createUIResource } from "@mcp-ui/server";
import { buildPptx } from "./presentation-engine.mjs";

function dlog(msg) {
  if (!process.env.MCP_DEBUG) return;
  console.error(`[${new Date().toISOString()}] [PB] ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Tool input schema (shared)
// ─────────────────────────────────────────────────────────────────────────
const presentationProps = {
  topic: { type: "string", description: "Subject of the presentation (required)." },
  slideCount: { type: "number", description: "Approx. number of content slides (3–12, default 5)." },
  audience: { type: "string", description: "Target audience — executives, students, …" },
  tone: { type: "string", description: "formal | casual | inspirational | technical | storytelling" },
};

const TOOLS = [
  {
    name: "create_presentation",
    description:
      "Show the user an interactive picker so they can choose how to build a presentation " +
      "on a topic (PowerPoint .pptx or HTML web slides). REQUIRED for any request involving " +
      "slides, a deck, a pitch, a presentation, a slideshow, or a visual report. Do NOT " +
      "create files yourself — call this tool, the picker handles everything end-to-end.",
    inputSchema: { type: "object", properties: presentationProps, required: ["topic"] },
  },
  {
    name: "build_presentation",
    description:
      "Generate the actual presentation file. Invoked from the picker iframe via " +
      "MCP Apps tool action. Hosts may also call it directly if the user has " +
      "explicitly chosen a format. Returns a download card UI plus the binary.",
    inputSchema: {
      type: "object",
      properties: {
        ...presentationProps,
        format: { type: "string", enum: ["pptx", "html"], description: "pptx | html" },
      },
      required: ["topic", "format"],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────
// HTML resource: picker
// ─────────────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function pickerHtml({ topic, slideCount, audience, tone }) {
  const params = JSON.stringify({ topic, slideCount: slideCount ?? null, audience: audience ?? null, tone: tone ?? null });
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 16px; background: transparent; color: #0f172a; }
  @media (prefers-color-scheme: dark) { body { color: #f1f5f9; } }
  .card { border: 1px solid rgba(148,163,184,.4); border-radius: 12px; padding: 16px; background: rgba(255,255,255,.03); }
  h2 { margin: 0 0 4px 0; font-size: 15px; font-weight: 600; }
  p.sub { margin: 0 0 14px 0; opacity: .7; font-size: 13px; }
  .grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
  button.opt { all: unset; cursor: pointer; padding: 14px; border-radius: 10px; border: 1px solid rgba(148,163,184,.4); transition: all .15s; display: flex; gap: 12px; align-items: flex-start; background: transparent; }
  button.opt:hover { border-color: #38bdf8; background: rgba(56,189,248,.08); }
  button.opt:disabled { opacity: .4; cursor: progress; }
  .opt .ico { font-size: 22px; line-height: 1; }
  .opt .body { flex: 1; min-width: 0; }
  .opt .ttl { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
  .opt .desc { font-size: 12px; opacity: .7; line-height: 1.4; }
  .status { margin-top: 12px; font-size: 12px; opacity: .8; min-height: 16px; }
</style></head>
<body>
<div class="card">
  <h2>How should I build your presentation?</h2>
  <p class="sub">Topic: <strong>${escapeHtml(topic)}</strong></p>
  <div class="grid">
    <button class="opt" data-fmt="pptx">
      <div class="ico">📊</div>
      <div class="body">
        <div class="ttl">PowerPoint (.pptx)</div>
        <div class="desc">Editable in PowerPoint, Keynote, Google Slides.</div>
      </div>
    </button>
    <button class="opt" data-fmt="html">
      <div class="ico">🌐</div>
      <div class="body">
        <div class="ttl">Web Slides (HTML)</div>
        <div class="desc">Single-file deck with cinematic animations.</div>
      </div>
    </button>
  </div>
  <div class="status" id="status"></div>
</div>
<script>
  const params = ${params};
  const status = document.getElementById('status');
  for (const btn of document.querySelectorAll('button.opt')) {
    btn.addEventListener('click', () => {
      const format = btn.dataset.fmt;
      for (const b of document.querySelectorAll('button.opt')) b.disabled = true;
      status.textContent = 'Generating ' + (format === 'pptx' ? 'PowerPoint' : 'web slides') + '…';
      window.parent.postMessage({
        type: 'tool',
        payload: {
          toolName: 'build_presentation',
          params: { ...params, format },
        },
      }, '*');
    });
  }
  // Auto-report size to host so it can resize the iframe.
  function reportSize() {
    const h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'size', payload: { height: h } }, '*');
  }
  new ResizeObserver(reportSize).observe(document.body);
  window.addEventListener('load', reportSize);
  reportSize();
</script>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────
// HTML resource: download card with embedded data URL
// ─────────────────────────────────────────────────────────────────────────
function downloadHtml({ fileName, mimeType, base64, sizeBytes, summary }) {
  const sizeKb = (sizeBytes / 1024).toFixed(1);
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 16px; background: transparent; color: #0f172a; }
  @media (prefers-color-scheme: dark) { body { color: #f1f5f9; } }
  .card { border: 1px solid rgba(148,163,184,.4); border-radius: 12px; padding: 16px; background: rgba(255,255,255,.03); display: flex; gap: 14px; align-items: center; }
  .ico { font-size: 32px; }
  .body { flex: 1; min-width: 0; }
  .ttl { font-weight: 600; font-size: 14px; margin-bottom: 2px; word-break: break-word; }
  .meta { font-size: 12px; opacity: .7; }
  a.dl { all: unset; cursor: pointer; padding: 8px 14px; border-radius: 8px; background: #38bdf8; color: #0f172a; font-weight: 600; font-size: 13px; transition: background .15s; }
  a.dl:hover { background: #0ea5e9; }
</style></head>
<body>
<div class="card">
  <div class="ico">📊</div>
  <div class="body">
    <div class="ttl">${escapeHtml(fileName)}</div>
    <div class="meta">${sizeKb} KB · ${escapeHtml(summary)}</div>
  </div>
  <a class="dl" download="${escapeHtml(fileName)}" href="data:${mimeType};base64,${base64}">Download</a>
</div>
<script>
  function reportSize() {
    const h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'size', payload: { height: h } }, '*');
  }
  new ResizeObserver(reportSize).observe(document.body);
  window.addEventListener('load', reportSize);
  reportSize();
</script>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Server setup
// ─────────────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "presentation-builder", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  dlog(`tools/call name=${name}`);

  if (name === "create_presentation") {
    const topic = String(args?.topic ?? "").trim();
    if (!topic) {
      return { isError: true, content: [{ type: "text", text: "Error: 'topic' is required." }] };
    }
    const html = pickerHtml({
      topic,
      slideCount: args?.slideCount,
      audience: args?.audience,
      tone: args?.tone,
    });
    const ui = createUIResource({
      uri: `ui://presentation-builder/picker/${Date.now()}`,
      content: { type: "rawHtml", htmlString: html },
      encoding: "text",
    });
    return {
      content: [
        ui,
        {
          type: "text",
          text:
            "An interactive picker is now shown to the user. Wait for their selection. " +
            "Do not write code or call other tools. Reply with one short sentence like " +
            "\"Pick a format above.\" and stop.",
        },
      ],
    };
  }

  if (name === "build_presentation") {
    const topic = String(args?.topic ?? "").trim();
    const format = String(args?.format ?? "pptx").trim();
    if (!topic) {
      return { isError: true, content: [{ type: "text", text: "Error: 'topic' is required." }] };
    }
    if (format !== "pptx" && format !== "html") {
      return { isError: true, content: [{ type: "text", text: `Unknown format "${format}". Use pptx or html.` }] };
    }

    if (format === "pptx") {
      try {
        const { buffer, fileName, slideCount } = await buildPptx({
          topic,
          slideCount: args?.slideCount,
          audience: args?.audience,
          tone: args?.tone,
        });
        const base64 = Buffer.from(buffer).toString("base64");
        const html = downloadHtml({
          fileName,
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          base64,
          sizeBytes: buffer.length,
          summary: `${slideCount} slides on "${topic}"`,
        });
        const ui = createUIResource({
          uri: `ui://presentation-builder/download/${Date.now()}`,
          content: { type: "rawHtml", htmlString: html },
          encoding: "text",
        });
        return {
          content: [
            ui,
            {
              type: "text",
              text: `Presentation ready: ${fileName} (${slideCount} slides, ${buffer.length} bytes). User can download from the card. Acknowledge briefly and stop.`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        dlog(`build_presentation pptx error: ${msg}`);
        return { isError: true, content: [{ type: "text", text: `PPTX generation failed: ${msg}` }] };
      }
    }

    // format === "html" — minimal placeholder for now (kept for future).
    const html = `<!doctype html><html><body style="font:14px sans-serif;padding:16px;color:inherit;background:transparent">` +
      `<p>Web Slides format is not yet implemented in this MCP App. Pick PowerPoint for now.</p>` +
      `</body></html>`;
    const ui = createUIResource({
      uri: `ui://presentation-builder/notice/${Date.now()}`,
      content: { type: "rawHtml", htmlString: html },
      encoding: "text",
    });
    return {
      content: [
        ui,
        { type: "text", text: "Web Slides format is not yet implemented; let the user know briefly." },
      ],
    };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
});

// ─────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
dlog(`MCP server started.`);
