#!/usr/bin/env node
/**
 * PDF Builder — a Doable built-in MCP App.
 * --------------------------------------------------------
 * Standards-compliant per modelcontextprotocol.io/extensions/apps:
 * tools return UIResource cards rendered as sandboxed iframes.
 *
 *   1. `create_pdf({ topic, audience?, tone?, length?, pageSize? })`
 *        Returns a status card. Injects a BUILD_PDF prompt back to
 *        the host. The LLM narrates progress, then calls `build_pdf`
 *        once with a complete print-ready HTML document.
 *
 *   2. `build_pdf({ topic, html, fileName?, pageSize?, margins? })`
 *        ★ primary tool. Renders the HTML to PDF via puppeteer
 *        (shared singleton browser). Returns a unified card with:
 *          - live HTML preview of the same document
 *          - Download .pdf button
 *          - Download .html button
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createUIResource } from "@mcp-ui/server";
import puppeteer from "puppeteer";

import { autoBuildCardHtml, previewDownloadCardHtml, escapeHtml, slugify } from "../_shared/ui.mjs";

function dlog(msg) {
  if (!process.env.MCP_DEBUG) return;
  console.error(`[${new Date().toISOString()}] [PDF] ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────
// LLM build prompt
// ─────────────────────────────────────────────────────────────────────────
function buildPdfPrompt({ topic, audience, tone, length, pageSize }) {
  const topicEsc = String(topic).replace(/"/g, '\\"');
  const targetWords =
    length === "short" ? "400-700"
    : length === "long" ? "2000-3500"
    : "900-1500";
  const sz = pageSize || "A4";
  return [
    `BUILD_PDF topic="${topicEsc}"${audience ? ` audience="${String(audience).replace(/"/g, '\\"')}"` : ""}${tone ? ` tone="${String(tone).replace(/"/g, '\\"')}"` : ""} length="${length || "medium"}" pageSize="${sz}"`,
    ``,
    `You are about to create a polished print-ready PDF document. Think editorial — clean typography, hierarchical structure, generous whitespace, professional layout.`,
    ``,
    `━━━ TRANSPARENCY (visible chat lines) ━━━`,
    `Stream these short status lines as plain assistant chat content (NOT inside thinking blocks). Blank line before/after each. Do not batch.`,
    `  1. "🔍 Researching ${topicEsc}…"   (call web_search NOW if needed)`,
    `  2. "🎨 Designing the layout and typography…"`,
    `  3. "✍️ Drafting section <n>: <topic>"   (one line per section)`,
    `  4. "📐 Polishing the print stylesheet…"`,
    `  5. "🚀 Rendering to PDF…"   → then the tool call.`,
    ``,
    `FORBIDDEN visible output: reasoning, "Let me think…", code fences, the HTML before the tool call.`,
    ``,
    `━━━ DELIVERABLE — call build_pdf({ topic, html, pageSize? }) ONCE ━━━`,
    ``,
    `  topic:    "${topicEsc}"`,
    `  pageSize: "A4" | "Letter" | "Legal" (default ${sz})`,
    `  html:     COMPLETE single-file HTML document (~${targetWords} words). Print-ready.`,
    ``,
    `Print-ready HTML rules (CRITICAL):`,
    `- Start with <!doctype html><html lang="en"><head>…</head><body>…</body></html>.`,
    `- Embed all CSS in <style> in <head>. NO external stylesheets except Google Fonts via <link>.`,
    `- Use @page { size: ${sz}; margin: 18mm 16mm; } at the top of your CSS.`,
    `- Body width is constrained by @page margins — do NOT set body width manually.`,
    `- Use real CSS units mm/cm/pt for print sizing; px for borders/radii is fine.`,
    `- Hierarchy: ONE <h1> at the top, multiple <h2> sections, <h3> sub-sections.`,
    `- Page breaks: \`h1, h2 { page-break-after: avoid; }\` and use \`<div style="page-break-before:always"></div>\` between major sections only when content is long.`,
    `- Print font sizes: body 10.5–11.5pt, h2 16–22pt, h1 24–32pt, captions 8.5–9.5pt.`,
    `- Use a tasteful Google Fonts pair (one display + one body).`,
    `- Color: dark text on white. Allow brand accent colors for headings + rules.`,
    `- Tables: thin borders, alternating row tint OK for print, header row bolded.`,
    `- Images: only if you have a real public URL. Use \`<img style="max-width:100%; break-inside: avoid">\`.`,
    `- Add a small footer with the document title and a generated date if appropriate (use position: running() if you know what you're doing, otherwise keep it inline at the bottom of the body).`,
    `- NO interactive JS. Static document only.`,
    ``,
    `Quality bar:`,
    `- Real facts, real numbers, real names. NO placeholders.`,
    `- Each section has substance — at least one concrete example or data point.`,
    `- Whitespace is a feature: don't cram. Leave breathing room.`,
    `- Title page or banner: the document opens with a clear, prominent title block.`,
    ``,
    `After the tool returns, reply with EXACTLY one short sentence ("PDF ready — preview and download above.") and STOP. Do NOT call write_file.`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────────
const PAGE_SIZES = ["A4", "Letter", "Legal", "A3", "A5"];

const TOOLS = [
  {
    name: "create_pdf",
    description:
      "Kick off a creative PDF document build. REQUIRED for any request involving a PDF, "
      + "report, whitepaper, brief, handout, invoice, certificate, or printable document. "
      + "Returns a status card that immediately injects a BUILD_PDF prompt back as the next "
      + "user turn — instructing you (the AI) to narrate your design and call build_pdf ONCE "
      + "with a complete print-ready HTML document. After invoking this, reply with ONE short "
      + "sentence ('Designing your PDF…') and stop.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Subject of the document (required)." },
        audience: { type: "string", description: "Target reader." },
        tone: { type: "string", description: "formal | casual | technical | tutorial | reference" },
        length: { type: "string", enum: ["short", "medium", "long"], description: "short ~500w, medium ~1200w, long ~2500w." },
        pageSize: { type: "string", enum: PAGE_SIZES, description: "Page size (default A4)." },
      },
      required: ["topic"],
    },
  },
  {
    name: "build_pdf",
    description:
      "★ PRIMARY PDF renderer. Call ONCE with COMPLETE print-ready HTML. Returns a unified "
      + "card with: live HTML preview, Download .pdf, Download .html. The engine renders the "
      + "exact HTML to PDF via headless Chrome (so the .pdf matches the preview pixel-for-pixel). "
      + "Use ONLY in response to a BUILD_PDF prompt. Do NOT also call write_file.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Document topic (used for filename + caption)." },
        html: { type: "string", description: "Complete single-file HTML document, print-ready (uses @page for sizing)." },
        pageSize: { type: "string", enum: PAGE_SIZES, description: "Default: A4." },
        margins: {
          type: "object",
          description: "Optional page margins. Default 18mm/16mm.",
          properties: {
            top:    { type: "string", description: "e.g. '18mm'" },
            right:  { type: "string" },
            bottom: { type: "string" },
            left:   { type: "string" },
          },
        },
        landscape: { type: "boolean", description: "Default false." },
        fileName: { type: "string", description: "Optional base filename (no extension)." },
      },
      required: ["topic", "html"],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Singleton puppeteer browser
// ─────────────────────────────────────────────────────────────────────────
let _browser = null;
let _browserPromise = null;
let _idleTimer = null;
const LAUNCH_TIMEOUT_MS = 30_000;
// Hard ceiling on a single render (setContent + page.pdf). On timeout the page
// is force-closed so a pathological document can NEVER leave Chrome stuck.
const RENDER_TIMEOUT_MS = 45_000;
// Close the shared browser after this much inactivity so it never lingers.
const BROWSER_IDLE_MS = 3 * 60_000;

async function getBrowser() {
  if (_browser && _browser.connected) return _browser;
  // A launch is already underway — join it rather than starting another, so
  // concurrent renders share ONE Chrome instead of spawning (and leaking) many.
  if (_browserPromise) return _browserPromise;
  _browserPromise = (async () => {
    dlog("launching puppeteer…");
    const launch = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Browser launch timed out after 30s")), LAUNCH_TIMEOUT_MS),
    );
    try {
      const b = await Promise.race([launch, timeout]);
      _browser = b;
      b.on("disconnected", () => { if (_browser === b) _browser = null; });
      return b;
    } catch (err) {
      // Launch lost the race to the timeout — reap the eventual Chrome so it
      // can't linger as an orphan.
      launch.then((b) => b.close()).catch(() => {});
      throw err;
    } finally {
      _browserPromise = null;
    }
  })();
  return _browserPromise;
}

/** (Re)arm the idle timer that closes the shared browser after inactivity. */
function touchIdleTimer() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => { void shutdown(); }, BROWSER_IDLE_MS);
  if (typeof _idleTimer.unref === "function") _idleTimer.unref();
}

async function renderHtmlToPdf({ html, pageSize, margins, landscape }) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  // Hard per-render deadline so a hung setContent/page.pdf can't pin Chrome.
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`PDF render timed out after ${RENDER_TIMEOUT_MS}ms`)),
      RENDER_TIMEOUT_MS,
    );
  });

  const work = (async () => {
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });
    const pdf = await page.pdf({
      format: pageSize || "A4",
      printBackground: true,
      preferCSSPageSize: true,
      landscape: !!landscape,
      margin: {
        top: margins?.top || "18mm",
        right: margins?.right || "16mm",
        bottom: margins?.bottom || "18mm",
        left: margins?.left || "16mm",
      },
    });
    return Buffer.from(pdf);
  })();

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    // ALWAYS close the page — success, error, OR timeout.
    try { await page.close(); } catch {}
    touchIdleTimer();
  }
}

// Cleanup on process exit.
async function shutdown() {
  if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
  if (_browser) {
    try { await _browser.close(); } catch {}
    _browser = null;
  }
}
process.on("SIGINT", () => { shutdown().finally(() => process.exit(0)); });
process.on("SIGTERM", () => { shutdown().finally(() => process.exit(0)); });

// ─────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "pdf-builder", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  dlog(`tools/call ${name}`);

  if (name === "create_pdf") {
    const topic = String(args?.topic ?? "").trim();
    if (!topic) return { isError: true, content: [{ type: "text", text: "Error: 'topic' is required." }] };
    const opts = {
      topic, audience: args?.audience, tone: args?.tone,
      length: args?.length, pageSize: args?.pageSize,
    };
    const html = autoBuildCardHtml({
      topic,
      title: "Designing your PDF…",
      subtitle: "Warming up — picking layout and typography.",
      displayText: `📄 Designing a PDF document about "${topic}"…`,
      buildPrompt: buildPdfPrompt(opts),
      accent: {
        lightBg1: "#faf8ff", lightBg2: "#f3f0ff", lightBorder: "#c4b5fd",
        lightTitle: "#6d28d9", lightSub: "#7c3aed",
        spinTrack: "#c4b5fd", spinHead: "#7c3aed", scrollLight: "#c4b5fd",
      },
    });
    const ui = createUIResource({
      uri: `ui://pdf-builder/auto-build/${Date.now()}`,
      content: { type: "rawHtml", htmlString: html },
      encoding: "text",
    });
    return {
      content: [
        ui,
        {
          type: "text",
          text:
            "Build card shown. It will inject a BUILD_PDF prompt back as a new user turn. "
            + "Reply with ONE short sentence like \"Designing your PDF…\" and STOP. "
            + "DO NOT call write_file, create_file, edit_file, str_replace, or any "
            + "other tool — the next user turn will arrive automatically. "
            + "Wait for the BUILD_PDF prompt, then narrate progress and call build_pdf once.",
        },
      ],
    };
  }

  if (name === "build_pdf") {
    const topic = String(args?.topic ?? "").trim() || "document";
    const html = String(args?.html ?? "");
    const pageSize = PAGE_SIZES.includes(String(args?.pageSize)) ? String(args.pageSize) : "A4";
    const margins = args?.margins && typeof args.margins === "object" ? args.margins : null;
    const landscape = !!args?.landscape;
    const baseName = String(args?.fileName ?? slugify(topic));

    if (!html.trim()) {
      return { isError: true, content: [{ type: "text", text: "Error: `html` is required (the complete print-ready HTML document)." }] };
    }
    if (!/<html[\s>]/i.test(html) && !/<!doctype/i.test(html)) {
      return { isError: true, content: [{ type: "text", text: "Error: `html` does not look like a complete HTML document. Include `<!doctype html>` and `<html>`." }] };
    }

    let pdfBuf;
    try {
      pdfBuf = await renderHtmlToPdf({ html, pageSize, margins, landscape });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dlog(`render failed: ${msg}`);
      return { isError: true, content: [{ type: "text", text: `PDF render failed: ${msg}` }] };
    }
    const htmlBuf = Buffer.from(html, "utf8");

    // Estimate word count from rendered text (rough).
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const wordCount = (text.match(/\S+/g) || []).length;

    const card = previewDownloadCardHtml({
      title: `${baseName}.pdf`,
      subtitle: `${pageSize}${landscape ? " landscape" : ""} · ~${wordCount} words · "${topic}"`,
      previewKind: "iframe-html",
      previewHtml: html,
      iconEmoji: "📄",
      hint: "HTML preview · download .pdf (rendered) or .html (source)",
      downloads: [
        {
          label: "📥 Download .pdf",
          fileName: `${baseName}.pdf`,
          mimeType: "application/pdf",
          base64: pdfBuf.toString("base64"),
          sizeBytes: pdfBuf.length,
        },
        {
          label: "🌐 Download .html",
          fileName: `${baseName}.html`,
          mimeType: "text/html;charset=utf-8",
          base64: htmlBuf.toString("base64"),
          sizeBytes: htmlBuf.length,
        },
      ],
      accent: { primary: "#6d28d9", primaryHover: "#5b21b6", secondary: "#6d28d9", secondaryHover: "#5b21b6" },
    });

    const ui = createUIResource({
      uri: `ui://pdf-builder/build/${Date.now()}`,
      content: { type: "rawHtml", htmlString: card },
      encoding: "text",
    });
    return {
      content: [
        ui,
        {
          type: "text",
          text: `PDF ready: ${baseName}.pdf (${pageSize}${landscape ? " landscape" : ""}, ${(pdfBuf.length / 1024).toFixed(1)} KB). User can preview, download .pdf, or download .html. Acknowledge briefly and stop.`,
        },
      ],
    };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
dlog("MCP server started.");
