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
import { buildPptx, buildWebSlides } from "./presentation-engine.mjs";

function dlog(msg) {
  if (!process.env.MCP_DEBUG) return;
  console.error(`[${new Date().toISOString()}] [PB] ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Tool input schema (shared)
// ─────────────────────────────────────────────────────────────────────────
const presentationProps = {
  topic: { type: "string", description: "Subject of the presentation (required)." },
  slideCount: { type: "number", description: "Total number of slides including cover and closing (3–12, default 5). \"5 slides\" = 5 total." },
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
  /* The host iframe lives on a chat surface that may be light OR dark.
     We use an opaque card with its own palette to guarantee readability
     in either case. Do NOT rely on prefers-color-scheme — the iframe is
     transparent so we cannot detect the surrounding background. */
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 12px 0; background: transparent; }
  .card { color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
  h2 { margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: #0f172a; }
  p.sub { margin: 0 0 14px 0; color: #475569; font-size: 13px; }
  p.sub strong { color: #0f172a; }
  .grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
  button.opt { all: unset; cursor: pointer; padding: 14px; border-radius: 10px; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; transition: all .15s; display: flex; gap: 12px; align-items: flex-start; }
  button.opt:hover { border-color: #0284c7; background: #e0f2fe; }
  button.opt:disabled { opacity: .5; cursor: progress; }
  .opt .ico { font-size: 22px; line-height: 1; }
  .opt .body { flex: 1; min-width: 0; }
  .opt .ttl { font-weight: 600; font-size: 14px; margin-bottom: 2px; color: #0f172a; }
  .opt .desc { font-size: 12px; color: #475569; line-height: 1.4; }
  .status { margin-top: 12px; font-size: 12px; color: #475569; min-height: 16px; }
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
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 12px 0; background: transparent; }
  .card { color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; display: flex; gap: 14px; align-items: center; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
  .ico { font-size: 32px; line-height: 1; }
  .body { flex: 1; min-width: 0; }
  .ttl { font-weight: 600; font-size: 14px; margin-bottom: 2px; color: #0f172a; word-break: break-word; }
  .meta { font-size: 12px; color: #475569; }
  a.dl { all: unset; cursor: pointer; padding: 8px 14px; border-radius: 8px; background: #0284c7; color: #ffffff; font-weight: 600; font-size: 13px; transition: background .15s; }
  a.dl:hover { background: #0369a1; }
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
// HTML resource: live web-slides preview (deck rendered inline) + download bar
// The deck IS the UI. The host iframe renders the full deck at a fixed
// preview height with a top toolbar offering Download and Open-in-new-tab.
// ─────────────────────────────────────────────────────────────────────────
function webSlidesPreviewHtml({ deckHtml, fileName, base64, sizeBytes, summary }) {
  const sizeKb = (sizeBytes / 1024).toFixed(1);
  // Embed deck HTML safely inside srcdoc by escaping double quotes & ampersands.
  const srcdocSafe = deckHtml
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
  const dataHref = `data:text/html;base64,${base64}`;
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 12px 0; background: transparent; }
  .wrap { color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
  .bar { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
  .bar .ico { font-size: 18px; }
  .bar .meta { flex: 1; min-width: 0; }
  .bar .ttl { font-weight: 600; color: #0f172a; }
  .bar .sub { font-size: 11px; color: #475569; }
  .bar .btns { display: flex; gap: 6px; }
  .bar a, .bar button { all: unset; cursor: pointer; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 12px; transition: background .15s; }
  .bar a.dl { background: #0284c7; color: #ffffff; }
  .bar a.dl:hover { background: #0369a1; }
  .bar a.open, .bar button.fs { background: #e2e8f0; color: #0f172a; }
  .bar a.open:hover, .bar button.fs:hover { background: #cbd5e1; }
  .stage { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #0f172a; }
  .stage iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
  .hint { padding: 8px 14px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; background: #f8fafc; }
</style></head>
<body>
<div class="wrap">
  <div class="bar">
    <div class="ico">🌐</div>
    <div class="meta">
      <div class="ttl">${escapeHtml(fileName)}</div>
      <div class="sub">${sizeKb} KB · ${escapeHtml(summary)}</div>
    </div>
    <div class="btns">
      <button class="fs" id="fs" type="button">⛶ Fullscreen</button>
      <a class="open" target="_blank" rel="noopener" href="${dataHref}">Open ↗</a>
      <a class="dl" download="${escapeHtml(fileName)}" href="${dataHref}">Download</a>
    </div>
  </div>
  <div class="stage" id="stage">
    <iframe id="deck" title="Web slides preview" sandbox="allow-scripts allow-same-origin" allow="fullscreen" srcdoc="${srcdocSafe}"></iframe>
  </div>
  <div class="hint">Use ← → / Space to navigate · F for fullscreen inside the deck</div>
</div>
<script>
  document.getElementById('fs').addEventListener('click', () => {
    const stage = document.getElementById('stage');
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen();
  });
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

    // format === "html" — build a single-file HTML deck and embed as data URL.
    try {
      const { html: deckHtml, fileName, slideCount } = buildWebSlides({
        topic,
        slideCount: args?.slideCount,
        audience: args?.audience,
        tone: args?.tone,
      });
      const base64 = Buffer.from(deckHtml, "utf8").toString("base64");
      const cardHtml = webSlidesPreviewHtml({
        deckHtml,
        fileName,
        base64,
        sizeBytes: Buffer.byteLength(deckHtml, "utf8"),
        summary: `${slideCount} slides on "${topic}" · keyboard-navigable web deck`,
      });
      const ui = createUIResource({
        uri: `ui://presentation-builder/download/${Date.now()}`,
        content: { type: "rawHtml", htmlString: cardHtml },
        encoding: "text",
      });
      return {
        content: [
          ui,
          {
            type: "text",
            text: `Web Slides ready: ${fileName} (${slideCount} slides). User can download from the card. Acknowledge briefly and stop.`,
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dlog(`build_presentation html error: ${msg}`);
      return { isError: true, content: [{ type: "text", text: `Web slides generation failed: ${msg}` }] };
    }
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
});

// ─────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
dlog(`MCP server started.`);
