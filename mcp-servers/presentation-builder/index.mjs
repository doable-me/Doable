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
import { buildPptx, buildWebSlides, buildPptxFromSpec, PALETTE_IDS, PPTX_LAYOUTS } from "./presentation-engine.mjs";

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
  const bits = [`topic="${String(topic).replace(/"/g, '\\"')}"`];
  if (slideCount) bits.push(`slides=${slideCount}`);
  if (audience) bits.push(`audience="${String(audience).replace(/"/g, '\\"')}"`);
  if (tone) bits.push(`tone="${String(tone).replace(/"/g, '\\"')}"`);
  return bits.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────
// LLM prompts — INTENTIONALLY SHORT and IMPERATIVE.
//
// We do NOT ship the full 26 KB skill markdown into the user message. A long
// reference document in the user turn confuses the model into echoing the
// markdown back as text instead of producing a tool call. Instead we send a
// command-style brief (~70 lines) with hard output rules. The detailed design
// guidance lives in the system prompt where the model treats it as policy,
// not as content to summarise.
// ─────────────────────────────────────────────────────────────────────────
const WEB_SLIDES_DESIGN_BRIEF = `
DESIGN RULES (apply per slide; vary across the deck):
- Layout variety: cover, two-column, big-stat, 3-card grid, timeline, pull-quote, comparison, takeaways, closing. NEVER reuse the same layout twice in a row.
- Composition (3 layers): (1) full-bleed background with subtle gradient + 2-3 blurred decorative orbs; (2) structural elements (numbered eyebrow, accent bar, divider line); (3) content with strict typographic hierarchy.
- Palette: pick ONE bespoke 5-color palette that fits the topic mood. Define as CSS variables --bg, --fg, --muted, --accent, --accent2. Use real colors, not greys.
- Typography: import 2 contrasting Google Fonts (one display + one text). Use clamp() for fluid sizing. Display font 56-104px on covers, 36-56px on section headers.
- Animations: each slide does an entrance (fadeUp / slideIn / scaleIn). Animate child elements with staggered delays (0.05s steps). Use CSS @keyframes, no JS animation libs.
- Navigation: arrow keys + space + click anywhere to advance. Show slide counter "3 / 10" bottom-right. Press F for fullscreen. Slide transitions with translateX + opacity.
- Content: write SPECIFIC, INTERESTING facts about the topic. No "Insight #1" placeholders. No lorem ipsum. Real numbers, real names, real examples.
- Single file only. Inline CSS + JS. No external assets except Google Fonts via <link>.
`.trim();

const PPTX_DESIGN_BRIEF = `
DESIGN RULES (apply per slide; vary across the deck):
- Layout variety: cover, two-column, big-stat, 3-card grid, timeline, pull-quote, comparison, takeaways, closing. NEVER reuse the same layout twice in a row.
- Composition (3 layers per slide):
    (1) Background: full-bleed addShape({rect}) filled with a topic-bespoke dark or accent color; optional 2-3 large faintly-tinted ellipse shapes for depth (transparency 70-85).
    (2) Structural: a thin accent bar (rect, h:0.08, w:1.5), eyebrow text (numbered "01", small caps), divider lines.
    (3) Content: strict hierarchy — title (fontSize 44-72, bold), subtitle (24-32), body (14-20), captions (10-12).
- Palette: pick ONE bespoke 5-color palette that fits the topic mood. Hex strings WITHOUT # prefix (PptxGenJS convention). Use a dark background (e.g. "0d1117", "1a1a2e") with 1-2 vivid accent colors plus a warm light tone for text.
- Layout: pptx.layout = "LAYOUT_WIDE" (13.333×7.5 inches).
- Typography: choose 2 fonts — a display face (Calibri / Segoe UI / Georgia / Impact) and a body face. Stay consistent across the deck.
- Charts (when relevant): use addChart with brand colors. Avoid default Office blue.
- Content: write SPECIFIC, INTERESTING facts about the topic. No "Insight #1" placeholders. Real numbers, real examples.
`.trim();

function buildWebSlidesPrompt(opts) {
  const ctx = buildContextLine(opts);
  return [
    `BUILD_WEB_SLIDES_DECK ${ctx}`,
    ``,
    `OUTPUT PROTOCOL — follow EXACTLY:`,
    `1. Reply with NOTHING in chat. NO markdown. NO code fences. NO explanation. NO preamble.`,
    `2. Make ONE tool call: render_web_slides({ html, topic }).`,
    `   - html: the COMPLETE single-file HTML document for the deck.`,
    `   - topic: "${String(opts.topic).replace(/"/g, '\\"')}"`,
    `3. After the tool returns, reply with EXACTLY one short sentence ("Deck ready — open the preview.") and STOP.`,
    ``,
    `Do NOT call write_file, create_file, or any file system tool. Do NOT install packages.`,
    ``,
    WEB_SLIDES_DESIGN_BRIEF,
  ].join("\n");
}

function buildPptxPrompt(opts) {
  const ctx = buildContextLine(opts);
  return [
    `BUILD_PPTX_DECK ${ctx}`,
    ``,
    `You are designing a stunning PowerPoint deck. The HEAVY rendering is done by a deterministic engine — you only generate the CONTENT and DESIGN CHOICES as a JSON spec. This is fast (~10–15s) and reliable.`,
    ``,
    `OUTPUT PROTOCOL — follow EXACTLY:`,
    `1. Reply with ONE short status sentence in chat (e.g. "Designing 8 slides about ${String(opts.topic).replace(/"/g, '\\"')}…"). NOTHING ELSE. NO markdown. NO code fences. NO outline preview.`,
    `2. IMMEDIATELY make ONE tool call: render_deck({ format: "pptx", topic, paletteId, slides }).`,
    `3. After the tool returns, reply with EXACTLY one short sentence ("Deck ready — download from the card above.") and STOP.`,
    ``,
    `SPEC SHAPE (compact JSON the engine renders):`,
    `  topic: string`,
    `  paletteId: one of [${PALETTE_IDS.map((id) => `"${id}"`).join(", ")}] — pick the palette whose mood best fits the topic`,
    `  slides: array of slide objects, each:`,
    `    { layout: <one of "cover"|"twoCol"|"stat"|"cards"|"timeline"|"quote"|"compare"|"takeaways"|"closing">,`,
    `      title: string (mandatory; the on-slide headline),`,
    `      subtitle?: string (used by cover & closing),`,
    `      bullets?: string[] (3–4 specific facts/points the layout will display) }`,
    ``,
    `LAYOUT GUIDE (the engine handles all visuals — colors, decorative orbs, footer, typography):`,
    `  cover     — title + subtitle. First slide. ALWAYS use exactly once.`,
    `  twoCol    — title + 3–4 bullets. Lead bullet shown larger on the left, all bullets in glass card right.`,
    `  stat      — title + 3–4 bullets. Bullet[0] is the key metric label; bullets[1..3] are supporting cards.`,
    `  cards     — title + 3 bullets (each a punchy one-liner the renderer turns into a numbered card).`,
    `  timeline  — title + 3–4 bullets (each a step in chronological order).`,
    `  quote     — title is the attribution (e.g. "— Stephen Hawking, A Brief History of Time"); bullets[0] is the quote itself.`,
    `  compare   — title + 6 bullets (first 3 = "BEFORE" column, last 3 = "AFTER" column).`,
    `  takeaways — title + 3–4 bullets (final memorable points).`,
    `  closing   — title + subtitle. Last slide. ALWAYS use exactly once.`,
    ``,
    `RULES:`,
    `- Generate ${opts.slideCount || 8} slides total: ALWAYS start with cover and end with closing; vary the middle layouts (no two adjacent slides the same).`,
    `- Write SPECIFIC, INTERESTING facts about the topic. Real numbers, real names, real examples. NO placeholder text like "Insight #1" or "key benefit".`,
    `- Bullets must be tight one-liners (≤ 90 chars each).`,
    `- Pick paletteId based on topic mood: tech/AI → "neural-dark", finance → "gold-standard", nature/climate → "terra-viva", health → "vital-soft", history/academic → "scholar-crimson", art/design → "brutalist-pop", startup/saas → "venture-pulse", sports/action → "kinetic-edge".`,
    ``,
    `Do NOT call write_file, create_file, install_packages, render_pptx, or build_presentation.`,
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
      "[LEGACY — prefer render_deck] Render an AI-generated PowerPoint deck from a PptxGenJS " +
      "script body. Slow and brittle (AI must generate ~5KB of valid JS). Use render_deck instead, " +
      "which takes a small JSON spec and renders deterministically in <1s.",
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
    name: "render_deck",
    description:
      "Render a PowerPoint deck from a compact JSON spec. PREFERRED path for AI-driven " +
      "presentations — fast (<1s render), no syntax errors, gorgeous defaults. The deterministic " +
      "engine handles all visuals (palette, decorative orbs, typography, footer); you only " +
      "supply slide content + layout choices. Call AFTER receiving the BUILD_PPTX_DECK prompt " +
      "from the picker. See the prompt for the spec shape.",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["pptx"], description: "Currently only 'pptx' is supported." },
        topic: { type: "string", description: "Subject of the deck (used for the file name and stored as deck title)." },
        paletteId: {
          type: "string",
          enum: PALETTE_IDS,
          description: "Visual palette for the deck. Pick the one whose mood matches the topic.",
        },
        slides: {
          type: "array",
          minItems: 3,
          maxItems: 14,
          description: "Ordered slides. ALWAYS start with a 'cover' and end with a 'closing'.",
          items: {
            type: "object",
            properties: {
              layout: { type: "string", enum: PPTX_LAYOUTS, description: "Visual layout for this slide." },
              title: { type: "string", description: "On-slide headline (mandatory)." },
              subtitle: { type: "string", description: "Optional secondary line (used by cover & closing)." },
              bullets: {
                type: "array",
                items: { type: "string" },
                description: "Slide content points; meaning depends on layout (see prompt).",
              },
            },
            required: ["layout", "title"],
          },
        },
        fileName: { type: "string", description: "Optional override for the download file name." },
      },
      required: ["topic", "slides"],
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
  const topicJson = JSON.stringify(topic);
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 12px 0; background: transparent; }
  .card { color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; box-shadow: 0 1px 3px rgba(15,23,42,.06); }
  h2 { margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #0f172a; }
  p.sub { margin: 0 0 14px 0; color: #64748b; font-size: 12px; }
  p.sub strong { color: #0f172a; font-weight: 600; }
  .grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
  button.opt { all: unset; cursor: pointer; padding: 18px 16px; border-radius: 12px; border: 1.5px solid #e2e8f0; background: #ffffff; color: #0f172a; transition: all .15s; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; }
  button.opt:hover { border-color: #6366f1; background: #f8faff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,.15); }
  button.opt:disabled { opacity: .55; cursor: progress; transform: none; box-shadow: none; }
  .opt .ico { font-size: 30px; line-height: 1; }
  .opt .ttl { font-weight: 600; font-size: 14px; color: #0f172a; }
  .opt .desc { font-size: 11px; color: #64748b; line-height: 1.4; }
  .footer { margin-top: 12px; display: flex; justify-content: center; gap: 8px; font-size: 11px; color: #94a3b8; }
  .footer button.quick { all: unset; cursor: pointer; color: #64748b; text-decoration: underline; }
  .footer button.quick:hover { color: #0f172a; }
  .footer button.quick:disabled { opacity: .5; cursor: progress; text-decoration: none; }
  .status { margin-top: 12px; padding: 10px 12px; font-size: 12px; color: #4338ca; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; display: none; align-items: center; gap: 8px; }
  .status.on { display: flex; }
  .spin { width: 14px; height: 14px; border: 2px solid #c7d2fe; border-top-color: #6366f1; border-radius: 50%; animation: sp 0.7s linear infinite; flex: none; }
  @keyframes sp { to { transform: rotate(360deg); } }
</style></head>
<body>
<div class="card">
  <h2>Build your presentation</h2>
  <p class="sub">Topic: <strong>${escapeHtml(topic)}</strong></p>
  <div class="grid">
    <button class="opt" data-fmt="pptx">
      <div class="ico">📊</div>
      <div class="ttl">PowerPoint</div>
      <div class="desc">Editable .pptx file</div>
    </button>
    <button class="opt" data-fmt="html">
      <div class="ico">🌐</div>
      <div class="ttl">Web Slides</div>
      <div class="desc">Cinematic single-file deck</div>
    </button>
  </div>
  <div class="footer">
    <span>Or skip the AI:</span>
    <button class="quick" data-quick="pptx" type="button">Quick PPTX</button>
    <span>·</span>
    <button class="quick" data-quick="html" type="button">Quick HTML</button>
  </div>
  <div class="status" id="status"><div class="spin"></div><span id="statusText"></span></div>
</div>
<script>
  const baseParams = ${baseParams};
  const htmlPrompt = ${htmlPromptJson};
  const pptxPrompt = ${pptxPromptJson};
  const topic = ${topicJson};
  const status = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  function disable() { for (const b of document.querySelectorAll('button')) b.disabled = true; }
  function showStatus(text) { statusText.textContent = text; status.classList.add('on'); }
  for (const btn of document.querySelectorAll('button.opt')) {
    btn.addEventListener('click', () => {
      const fmt = btn.dataset.fmt;
      disable();
      const label = fmt === 'pptx' ? 'PowerPoint deck' : 'web slides deck';
      const emoji = fmt === 'pptx' ? '📊' : '🌐';
      showStatus('Designing your ' + label + '… (15–45s)');
      const prompt = fmt === 'html' ? htmlPrompt : pptxPrompt;
      const displayText = emoji + ' Designing a ' + label + ' about "' + topic + '"…';
      window.parent.postMessage({ type: 'prompt', payload: { prompt, displayText } }, '*');
    });
  }
  for (const btn of document.querySelectorAll('button.quick')) {
    btn.addEventListener('click', () => {
      const fmt = btn.dataset.quick;
      disable();
      showStatus('Generating quick ' + (fmt === 'pptx' ? 'PowerPoint' : 'web slides') + '…');
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

  if (name === "render_deck") {
    const topic = String(args?.topic ?? "").trim() || "presentation";
    const fileName = String(args?.fileName ?? `${slugify(topic)}.pptx`);
    const slides = Array.isArray(args?.slides) ? args.slides : [];
    const paletteId = args?.paletteId ? String(args.paletteId) : undefined;
    const format = String(args?.format ?? "pptx");
    if (format !== "pptx") {
      return { isError: true, content: [{ type: "text", text: `render_deck only supports format="pptx" right now (got "${format}"). Use build_presentation for HTML web decks.` }] };
    }
    if (slides.length === 0) {
      return { isError: true, content: [{ type: "text", text: "Error: `slides` must be a non-empty array." }] };
    }
    try {
      const { buffer, slideCount } = await buildPptxFromSpec({ topic, paletteId, slides });
      const base64 = Buffer.from(buffer).toString("base64");
      const html = downloadHtml({
        fileName,
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        base64,
        sizeBytes: buffer.length,
        summary: `AI-designed · ${slideCount} slides on "${topic}"`,
      });
      const ui = createUIResource({
        uri: `ui://presentation-builder/render-deck/${Date.now()}`,
        content: { type: "rawHtml", htmlString: html },
        encoding: "text",
      });
      return {
        content: [
          ui,
          { type: "text", text: `Presentation ready: ${fileName} (${slideCount} slides, ${buffer.length} bytes). User can download from the card. Acknowledge briefly and stop.` },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dlog(`render_deck error: ${msg}`);
      return { isError: true, content: [{ type: "text", text: `render_deck failed: ${msg}` }] };
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
