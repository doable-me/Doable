#!/usr/bin/env node
/**
 * Presentation Builder — an MCP App example for Doable.
 * --------------------------------------------------------
 * Skill-driven LLM generation, with a deterministic fallback.
 *
 *   1. `create_presentation({ topic, slideCount?, audience?, tone? })`
 *        Returns a picker UIResource. Two AI buttons (Web Slides / PPTX)
 *        postMessage `prompt` events back to the host containing the full
 *        SKILL prompt for that format. The host injects the prompt as a
 *        synthetic user message; the chat AI generates a stunning,
 *        topic-bespoke artifact and calls render_web_slides / render_pptx.
 *        Two "Quick" links bypass the AI and call build_presentation
 *        directly for a fast deterministic deck.
 *
 *   2. `render_web_slides({ html, fileName?, topic? })`
 *        Wraps AI-generated HTML in an inline live preview UIResource.
 *
 *   3. `render_pptx({ script, fileName?, topic? })`
 *        Executes AI-generated PptxGenJS body in a sandboxed Function with
 *        PptxGenJS injected, captures the buffer, returns a download card.
 *
 *   4. `build_presentation({ topic, format, ... })`
 *        Deterministic fallback (in-process palette + layout engine).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createUIResource } from "@mcp-ui/server";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PptxGenJS from "pptxgenjs";
import { buildPptx, buildWebSlides } from "./presentation-engine.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "skills");

function dlog(msg) {
  if (!process.env.MCP_DEBUG) return;
  console.error(`[${new Date().toISOString()}] [PB] ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Skill loader
// ─────────────────────────────────────────────────────────────────────────
function loadSkill(name, files) {
  const parts = [];
  for (const f of files) {
    const p = join(SKILLS_DIR, name, f);
    if (existsSync(p)) {
      parts.push(`\n\n===== ${name}/${f} =====\n\n` + readFileSync(p, "utf8"));
    }
  }
  return parts.join("\n");
}

function buildContextLine({ topic, slideCount, audience, tone }) {
  const bits = [`**Topic:** ${topic}`];
  if (slideCount) bits.push(`**Slide count:** ${slideCount}`);
  if (audience) bits.push(`**Audience:** ${audience}`);
  if (tone) bits.push(`**Tone:** ${tone}`);
  return bits.join("\n");
}

function buildWebSlidesPrompt(opts) {
  const skill = loadSkill("web-slides", [
    "SKILL.md",
    "theme-palettes.md",
    "layout-templates.md",
    "animation-recipes.md",
  ]);
  const ctx = buildContextLine(opts);
  const topicEsc = String(opts.topic).replace(/"/g, '\\"');
  return [
    `Generate a stunning, single-file HTML web slides deck on this topic.`,
    ``,
    ctx,
    ``,
    `**MANDATORY OUTPUT PROTOCOL:**`,
    `1. Do NOT print HTML in chat. Do NOT wrap in markdown.`,
    `2. Do NOT call write_file or create_file.`,
    `3. Call the MCP tool **render_web_slides** with two parameters:`,
    `   - \`html\`: the COMPLETE single-file HTML document (inline CSS + JS, no external assets except Google Fonts).`,
    `   - \`topic\`: "${topicEsc}"`,
    `4. After the tool returns, reply with one short sentence ("Deck ready — open the preview.") and STOP.`,
    ``,
    `Follow the skill below precisely. Choose a topic-bespoke palette, varied layouts, real Google Fonts, cinematic animations, decorative orbs, and per-slide content that is INTERESTING and SPECIFIC to "${topicEsc}" — no generic placeholder bullets like "Insight #1".`,
    ``,
    `---`,
    `# Skill`,
    skill,
  ].join("\n");
}

function buildPptxPrompt(opts) {
  const skill = loadSkill("pptx", ["SKILL.md", "pptxgenjs.md"]);
  const ctx = buildContextLine(opts);
  const topicEsc = String(opts.topic).replace(/"/g, '\\"');
  return [
    `Generate a stunning, design-rich PowerPoint deck on this topic.`,
    ``,
    ctx,
    ``,
    `**MANDATORY OUTPUT PROTOCOL:**`,
    `1. Do NOT print code in chat. Do NOT wrap in markdown.`,
    `2. Do NOT call write_file / create_file. Do NOT install packages.`,
    `3. Call the MCP tool **render_pptx** with two parameters:`,
    `   - \`script\`: the JavaScript BODY (no imports, no module wrappers) that builds the deck. The body MUST:`,
    `     • Use the pre-injected \`PptxGenJS\` constructor (already in scope; do NOT import).`,
    `     • Create \`const pptx = new PptxGenJS();\`, set \`pptx.layout = "LAYOUT_WIDE";\`, and build all slides.`,
    `     • End by assigning \`__pptx = pptx;\` (this exports the instance — the tool serializes it).`,
    `     • Top-level \`await\` is supported; the body runs inside an async wrapper.`,
    `   - \`topic\`: "${topicEsc}"`,
    `4. After the tool returns, reply with one short sentence ("Deck ready.") and STOP.`,
    ``,
    `Follow the skill below precisely. Topic-bespoke palette, varied layouts (cover/twoCol/stat/cards/timeline/quote/compare/takeaways/closing), 3-layer composition (background + structural + content), per-slide content INTERESTING and SPECIFIC to "${topicEsc}" — no generic "Why this matters" placeholders.`,
    ``,
    `---`,
    `# Skill`,
    skill,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// Tool input schemas
// ─────────────────────────────────────────────────────────────────────────
const presentationProps = {
  topic: { type: "string", description: "Subject of the presentation (required)." },
  slideCount: { type: "number", description: "Total number of slides including cover and closing (3–12, default 7)." },
  audience: { type: "string", description: "Target audience — executives, students, clients." },
  tone: { type: "string", description: "formal | casual | inspirational | technical | storytelling" },
};

const TOOLS = [
  {
    name: "create_presentation",
    description:
      "Show the user an interactive picker so they can choose how to build a presentation " +
      "on a topic (PowerPoint .pptx or HTML web slides). REQUIRED for any request involving " +
      "slides, a deck, a pitch, a presentation, a slideshow, or a visual report. After calling " +
      "this tool, REPLY WITH ONE SHORT SENTENCE and STOP. The picker handles the rest: AI " +
      "buttons inject a SKILL prompt back to you (continue by calling render_web_slides / " +
      "render_pptx with your generated artifact); Quick links call build_presentation directly.",
    inputSchema: { type: "object", properties: presentationProps, required: ["topic"] },
  },
  {
    name: "render_web_slides",
    description:
      "Render an AI-generated single-file HTML web-slides deck. Call this AFTER you have " +
      "received the web-slides SKILL prompt from the picker, with `html` containing your " +
      "complete generated HTML document. Returns an inline preview card with Download / " +
      "Open / Fullscreen actions. Reply with a one-line confirmation after this returns.",
    inputSchema: {
      type: "object",
      properties: {
        html: { type: "string", description: "Complete single-file HTML document for the deck." },
        topic: { type: "string", description: "Topic of the deck (used for the file name)." },
        fileName: { type: "string", description: "Optional override for the download file name." },
      },
      required: ["html"],
    },
  },
  {
    name: "render_pptx",
    description:
      "Render an AI-generated PowerPoint deck from a PptxGenJS script body. Call this AFTER " +
      "you have received the pptx SKILL prompt from the picker, with `script` containing " +
      "the JS body (no imports). The body must use the pre-injected PptxGenJS, build the " +
      "deck, and end by assigning `__pptx = pptx;`. Returns a download card. Reply with a " +
      "one-line confirmation after this returns.",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string", description: "PptxGenJS JavaScript body. Must end with `__pptx = pptx;`." },
        topic: { type: "string", description: "Topic of the deck (used for the file name)." },
        fileName: { type: "string", description: "Optional override for the download file name." },
      },
      required: ["script"],
    },
  },
  {
    name: "build_presentation",
    description:
      "Deterministic fallback presentation generator. Uses an in-process palette + layout " +
      "engine — fast (~1s) but produces generic content per topic. Prefer the LLM-driven " +
      "render_web_slides / render_pptx flow for impressive, topic-bespoke decks. The picker " +
      "calls this when the user clicks a Quick link.",
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
// HTML helpers
// ─────────────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "presentation";
}

// ─────────────────────────────────────────────────────────────────────────
// Picker UIResource
// ─────────────────────────────────────────────────────────────────────────
function pickerHtml({ topic, slideCount, audience, tone, htmlPrompt, pptxPrompt }) {
  const baseParams = JSON.stringify({ topic, slideCount: slideCount ?? null, audience: audience ?? null, tone: tone ?? null });
  const htmlPromptJson = JSON.stringify(htmlPrompt);
  const pptxPromptJson = JSON.stringify(pptxPrompt);
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 12px 0; background: transparent; }
  .card { color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; box-shadow: 0 1px 3px rgba(15,23,42,.06); }
  h2 { margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #0f172a; letter-spacing: -0.01em; }
  p.sub { margin: 0 0 16px 0; color: #475569; font-size: 13px; }
  p.sub strong { color: #0f172a; }
  .grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
  button.opt { all: unset; cursor: pointer; padding: 16px; border-radius: 12px; border: 1px solid #cbd5e1; background: linear-gradient(180deg,#ffffff 0%,#f8fafc 100%); color: #0f172a; transition: all .15s; display: flex; gap: 12px; align-items: flex-start; position: relative; overflow: hidden; }
  button.opt:hover { border-color: #0284c7; background: linear-gradient(180deg,#f0f9ff 0%,#e0f2fe 100%); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(2,132,199,.12); }
  button.opt:disabled { opacity: .5; cursor: progress; transform: none; }
  .opt .ico { font-size: 26px; line-height: 1; }
  .opt .body { flex: 1; min-width: 0; }
  .opt .ttl { font-weight: 700; font-size: 14px; margin-bottom: 3px; color: #0f172a; }
  .opt .desc { font-size: 12px; color: #475569; line-height: 1.45; }
  .opt .badge { position: absolute; top: 8px; right: 8px; font-size: 9px; font-weight: 700; letter-spacing: 0.5px; padding: 2px 6px; border-radius: 999px; background: linear-gradient(90deg,#8b5cf6,#ec4899); color: white; }
  .footer { margin-top: 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 12px; color: #64748b; flex-wrap: wrap; }
  .footer button.quick { all: unset; cursor: pointer; color: #0284c7; text-decoration: underline; font-weight: 500; }
  .footer button.quick:hover { color: #0369a1; }
  .status { margin-top: 10px; font-size: 12px; color: #475569; min-height: 16px; font-weight: 500; }
</style></head>
<body>
<div class="card">
  <h2>How should I build your presentation?</h2>
  <p class="sub">Topic: <strong>${escapeHtml(topic)}</strong></p>
  <div class="grid">
    <button class="opt" data-fmt="html">
      <span class="badge">AI · STUNNING</span>
      <div class="ico">🌐</div>
      <div class="body">
        <div class="ttl">Web Slides (HTML)</div>
        <div class="desc">Cinematic single-file deck. Topic-bespoke palette, layouts &amp; animations. Built by AI from the design skill.</div>
      </div>
    </button>
    <button class="opt" data-fmt="pptx">
      <span class="badge">AI · STUNNING</span>
      <div class="ico">📊</div>
      <div class="body">
        <div class="ttl">PowerPoint (.pptx)</div>
        <div class="desc">Editable in PowerPoint, Keynote, Google Slides. Rich shapes, custom typography. Built by AI.</div>
      </div>
    </button>
  </div>
  <div class="footer">
    <span>Takes ~10–30s while the AI designs your deck.</span>
    <span>
      Need it instantly?
      <button class="quick" data-quick="html" type="button">Quick HTML</button>
      ·
      <button class="quick" data-quick="pptx" type="button">Quick PPTX</button>
    </span>
  </div>
  <div class="status" id="status"></div>
</div>
<script>
  const baseParams = ${baseParams};
  const htmlPrompt = ${htmlPromptJson};
  const pptxPrompt = ${pptxPromptJson};
  const status = document.getElementById('status');
  function disable() { for (const b of document.querySelectorAll('button')) b.disabled = true; }
  for (const btn of document.querySelectorAll('button.opt')) {
    btn.addEventListener('click', () => {
      const fmt = btn.dataset.fmt;
      disable();
      status.textContent = 'Sending to AI to design your deck — this takes ~10–30s while the AI writes the ' + (fmt === 'pptx' ? 'PowerPoint script' : 'HTML') + ' from scratch…';
      const prompt = fmt === 'html' ? htmlPrompt : pptxPrompt;
      window.parent.postMessage({ type: 'prompt', payload: { prompt } }, '*');
    });
  }
  for (const btn of document.querySelectorAll('button.quick')) {
    btn.addEventListener('click', () => {
      const fmt = btn.dataset.quick;
      disable();
      status.textContent = 'Generating quick ' + (fmt === 'pptx' ? 'PowerPoint' : 'web slides') + '…';
      window.parent.postMessage({
        type: 'tool',
        payload: { toolName: 'build_presentation', params: { ...baseParams, format: fmt } },
      }, '*');
    });
  }
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
// Download / inline preview UIResources
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

function webSlidesPreviewHtml({ deckHtml, fileName, base64, sizeBytes, summary }) {
  const sizeKb = (sizeBytes / 1024).toFixed(1);
  const srcdocSafe = deckHtml.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
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
// Sandboxed execution of an AI-supplied PptxGenJS script body.
// ─────────────────────────────────────────────────────────────────────────
async function runPptxScript(scriptBody) {
  if (typeof scriptBody !== "string" || !scriptBody.trim()) {
    throw new Error("`script` must be a non-empty string");
  }
  const wrapped = `
    return (async () => {
      let __pptx = null;
      ${scriptBody}
      ;return __pptx;
    })();
  `;
  // eslint-disable-next-line no-new-func
  const fn = new Function("PptxGenJS", "Buffer", "console", wrapped);
  const pptxInstance = await fn(PptxGenJS, Buffer, console);
  if (!pptxInstance || typeof pptxInstance.write !== "function") {
    throw new Error(
      "Script did not assign `__pptx = pptx;` to a PptxGenJS instance. " +
      "End your script body with: `__pptx = pptx;`",
    );
  }
  const buffer = await pptxInstance.write({ outputType: "nodebuffer" });
  let slideCount = 0;
  try { slideCount = pptxInstance.slides?.length ?? 0; } catch {}
  return { buffer, slideCount };
}

// ─────────────────────────────────────────────────────────────────────────
// Server setup
// ─────────────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "presentation-builder", version: "0.3.0" },
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
    const opts = { topic, slideCount: args?.slideCount, audience: args?.audience, tone: args?.tone };
    const html = pickerHtml({
      ...opts,
      htmlPrompt: buildWebSlidesPrompt(opts),
      pptxPrompt: buildPptxPrompt(opts),
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
            "Picker shown. Wait for the user to click a format. Reply with one short sentence " +
            "like \"Pick a format above.\" and stop. Do NOT call other tools or write code yet.",
        },
      ],
    };
  }

  if (name === "render_web_slides") {
    const html = String(args?.html ?? "");
    const topic = String(args?.topic ?? "").trim() || "presentation";
    const fileName = String(args?.fileName ?? `${slugify(topic)}.html`);
    if (!html.trim()) {
      return { isError: true, content: [{ type: "text", text: "Error: `html` is required." }] };
    }
    if (!/<html[\s>]/i.test(html) && !/<!doctype/i.test(html)) {
      return { isError: true, content: [{ type: "text", text: "Error: `html` does not look like a complete HTML document. Include `<!doctype html>` and `<html>`." }] };
    }
    try {
      const base64 = Buffer.from(html, "utf8").toString("base64");
      const cardHtml = webSlidesPreviewHtml({
        deckHtml: html,
        fileName,
        base64,
        sizeBytes: Buffer.byteLength(html, "utf8"),
        summary: `AI-generated web deck on "${topic}"`,
      });
      const ui = createUIResource({
        uri: `ui://presentation-builder/render-web/${Date.now()}`,
        content: { type: "rawHtml", htmlString: cardHtml },
        encoding: "text",
      });
      return {
        content: [
          ui,
          { type: "text", text: `Web Slides ready: ${fileName}. User can preview, fullscreen, or download from the card. Acknowledge briefly and stop.` },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text", text: `render_web_slides failed: ${msg}` }] };
    }
  }

  if (name === "render_pptx") {
    const script = String(args?.script ?? "");
    const topic = String(args?.topic ?? "").trim() || "presentation";
    const fileName = String(args?.fileName ?? `${slugify(topic)}.pptx`);
    if (!script.trim()) {
      return { isError: true, content: [{ type: "text", text: "Error: `script` is required." }] };
    }
    try {
      const { buffer, slideCount } = await runPptxScript(script);
      const base64 = Buffer.from(buffer).toString("base64");
      const html = downloadHtml({
        fileName,
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        base64,
        sizeBytes: buffer.length,
        summary: `AI-generated · ${slideCount || "?"} slides on "${topic}"`,
      });
      const ui = createUIResource({
        uri: `ui://presentation-builder/render-pptx/${Date.now()}`,
        content: { type: "rawHtml", htmlString: html },
        encoding: "text",
      });
      return {
        content: [
          ui,
          { type: "text", text: `Presentation ready: ${fileName} (${slideCount || "?"} slides, ${buffer.length} bytes). User can download from the card. Acknowledge briefly and stop.` },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dlog(`render_pptx error: ${msg}`);
      return { isError: true, content: [{ type: "text", text: `render_pptx failed: ${msg}\n\nMake sure your script body:\n• Uses the pre-injected \`PptxGenJS\` (no imports)\n• Creates \`const pptx = new PptxGenJS();\`\n• Builds slides with \`pptx.addSlide()\`\n• Ends with \`__pptx = pptx;\`` }] };
    }
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
            { type: "text", text: `Quick deck ready: ${fileName} (${slideCount} slides). User can download from the card. Acknowledge briefly and stop.` },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: `PPTX generation failed: ${msg}` }] };
      }
    }

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
          { type: "text", text: `Quick deck ready: ${fileName} (${slideCount} slides). User can download / preview from the card. Acknowledge briefly and stop.` },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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
