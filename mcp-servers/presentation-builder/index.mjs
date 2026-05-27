#!/usr/bin/env node
/**
 * Presentation Builder — an MCP App example for Doable.
 * --------------------------------------------------------
 * Maximum-creativity LLM generation with dual output (HTML preview + PPTX).
 *
 *   1. `create_presentation({ topic, slideCount?, audience?, tone? })`
 *        Injects a synthetic user message via `prompt` postMessage that
 *        commands the chat AI to narrate its design process transparently
 *        and then make ONE `build_deck` call with BOTH a bespoke HTML
 *        document AND a compact JSON spec describing the same deck.
 *
 *   2. `build_deck({ topic, html, spec })` ★ primary tool
 *        The LLM passes:
 *          html — fully freeform single-file HTML (max creative freedom,
 *                 any CSS/JS, any layout, no constraints) — used for the
 *                 inline preview + .html download.
 *          spec — the same deck as a compact JSON structure (palette +
 *                 slides) that the deterministic engine renders to a
 *                 matching .pptx. Downloadable alongside the HTML.
 *        Returns one unified UI card with: live HTML preview, Fullscreen,
 *        Open, Download .html, Download .pptx.
 *
 *   3. Legacy tools kept for back-compat:
 *        `render_web_slides`, `render_deck`, `render_pptx`,
 *        `build_presentation` — still work, but `build_deck` is preferred.
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
    `You are designing a stunning, BESPOKE PowerPoint deck. A deterministic engine does the heavy rendering from a JSON spec you supply — so this is fast (<2s) and reliable. You pick the palette, fonts, layout sequence, and content. Do NOT fall back on a preset theme — design one for this exact topic.`,
    ``,
    `OUTPUT PROTOCOL — follow EXACTLY:`,
    `1. Reply with ONE short status sentence in chat (e.g. "Designing 8 slides about ${String(opts.topic).replace(/"/g, '\\"')}…"). NOTHING ELSE. NO markdown. NO code fences. NO outline preview.`,
    `2. IMMEDIATELY make ONE tool call: render_deck({ format: "pptx", topic, palette, slides }).`,
    `3. After the tool returns, reply with EXACTLY one short sentence ("Deck ready — download from the card above.") and STOP.`,
    ``,
    `SPEC SHAPE (compact JSON the engine renders):`,
    `  topic:   string`,
    `  palette: {`,
    `    vars: { bg, panel, accent, accent2, accent3, text, sub, card?, border? }  // hex with '#', card/border can be rgba() for translucency`,
    `    fonts: { display: "'Display Family', genericFamily", body: "'Body Family', genericFamily" }  // pick Google Fonts that evoke the topic`,
    `    fontsUrl?: "https://fonts.googleapis.com/css2?family=…&display=swap"`,
    `  }`,
    `  slides: array, each { layout, title, subtitle?, bullets? }`,
    `    layout: one of "cover" | "twoCol" | "stat" | "cards" | "timeline" | "quote" | "compare" | "takeaways" | "closing"`,
    ``,
    `PALETTE DESIGN RULES (critical — this is why the deck feels bespoke):`,
    `- Choose colors that evoke the topic's MOOD and BRAND — don't default to purple/teal for everything. Examples:`,
    `    • Claude AI / Anthropic → warm cream bg (#faf7f2) + deep orange accent (#cc785c) + ink text (#141413)`,
    `    • Ocean conservation   → deep navy bg (#0a1f3d) + aqua accent (#2dd4bf) + sand text (#fef3c7)`,
    `    • Mid-century design   → mustard bg (#c9a227) + teal accent (#1b6b7a) + off-white text (#f5ecd7)`,
    `    • Gothic literature    → near-black bg (#1a1320) + crimson accent (#8b1e2d) + parchment text (#e8dcc4)`,
    `- Ensure text/bg contrast ≥ 7:1 for title, ≥ 4.5:1 for body.`,
    `- accent2 and accent3 should be distinct hues from accent so layouts with multiple accents (stat, cards, compare) look varied.`,
    `- Pick fonts that match the subject: humanist serif for literature/AI-humanism, grotesk sans for tech, condensed display for sports, slab for industrial/engineering, etc. Avoid defaulting to the same pair every deck.`,
    ``,
    `LAYOUT GUIDE (the engine handles decorative orbs, footer, typography sizing):`,
    `  cover     — title + subtitle. First slide. ALWAYS use exactly once.`,
    `  twoCol    — title + 3–4 bullets. Lead bullet shown larger on the left, all bullets in a glass card on the right.`,
    `  stat      — title + 3–4 bullets. Bullet[0] is the key metric label; bullets[1..3] are supporting cards.`,
    `  cards     — title + 3 bullets (each a punchy one-liner the renderer turns into a numbered card).`,
    `  timeline  — title + 3–4 bullets (each a step in chronological order).`,
    `  quote     — title is the attribution (e.g. "— Stephen Hawking, A Brief History of Time"); bullets[0] is the quote itself.`,
    `  compare   — title + 6 bullets (first 3 = "BEFORE" column, last 3 = "AFTER" column).`,
    `  takeaways — title + 3–4 bullets (final memorable points).`,
    `  closing   — title + subtitle. Last slide. ALWAYS use exactly once.`,
    ``,
    `CONTENT RULES:`,
    `- Generate ${opts.slideCount || 8} slides total: ALWAYS start with cover and end with closing; vary the middle layouts (no two adjacent slides the same).`,
    `- Write SPECIFIC, INTERESTING facts about the topic. Real numbers, real names, real examples. NO placeholder text like "Insight #1" or "key benefit".`,
    `- Bullets must be tight one-liners (≤ 90 chars each).`,
    ``,
    `Do NOT call write_file, create_file, install_packages, render_pptx, or build_presentation.`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// UNIFIED BUILD PROMPT — max creativity + transparency + dual output.
//
// The LLM produces ONE `build_deck` call containing both a fully-freeform
// HTML deck AND a compact JSON spec. This gives the user a live preview
// (HTML, any layout/CSS imaginable) plus a downloadable .pptx rendered
// deterministically from the matching spec.
//
// NARRATION is critical: the model must think out loud between milestones
// so the user watches a real progress story, not a loading spinner. Each
// "beat" is a short sentence sent as plain chat text BEFORE the tool call.
// The final tool call is still the single deliverable.
// ─────────────────────────────────────────────────────────────────────────
function buildDeckPrompt(opts) {
  const ctx = buildContextLine(opts);
  const topicEsc = String(opts.topic).replace(/"/g, '\\"');
  const slideCount = opts.slideCount || 8;
  return [
    `BUILD_DECK ${ctx}`,
    ``,
    `You are about to craft a stunning, one-of-a-kind presentation deck with BOTH a cinematic HTML preview AND a downloadable PowerPoint — from a single generation. This is a design moment, not a template fill. Approach it like an award-winning art director.`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `TRANSPARENCY PROTOCOL — stream narration as VISIBLE chat text.`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Emit each status below as plain assistant chat content that the user`,
    `literally sees stream into the chat bubble in real time. Do NOT place`,
    `these lines inside any thinking, reasoning, analysis, plan, or`,
    `<thinking> block. Do NOT batch them into one paragraph. Put a BLANK`,
    `LINE before AND after each status so the UI renders every line as`,
    `its own paragraph. Send the FIRST line immediately, BEFORE any`,
    `internal reasoning. Keep each line ≤ 90 chars, no markdown, no code,`,
    `no bullets — just human status sentences:`,
    ``,
    `  1. "🔍 Researching ${topicEsc}…"        (if you need web_search, call it NOW)`,
    `  2. "🎨 Designing a palette that feels like ${topicEsc}…"`,
    `  3. "🔤 Choosing typography — <font> for headlines, <font> for body"`,
    `  4. "📐 Planning ${slideCount} slides with varied layouts…"`,
    `  5. "✍️ Writing slide <n> of ${slideCount}: <what it's about>"  (ONE line per slide, NOT batched)`,
    `  6. "🎬 Composing the HTML deck (animations, typography, motion)…"`,
    `  7. "📊 Translating to PowerPoint spec…"`,
    `  8. "🚀 Rendering — one moment"   → then the tool call.`,
    ``,
    `CRITICAL: Your ONLY visible output must be the 8 status lines above,`,
    `nothing else. Then the build_deck tool call. Then one closing sentence.`,
    ``,
    `FORBIDDEN visible output — the user must NEVER see any of these:`,
    `• "Let me think about…", "Here's my plan:", "I need to…", "Now I need…"`,
    `• Internal reasoning, analysis, planning, color/font brainstorming`,
    `• Bullet lists of your approach or decision-making`,
    `• Code blocks, markdown headings, or explanations`,
    `• Phrases like "Let me narrate…", "I'll create…", "For this topic…"`,
    `All internal planning (palette choices, font decisions, slide layouts,`,
    `content research) MUST happen silently. The user only sees the emoji`,
    `status lines streaming one by one. Nothing else.`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `CREATIVE DIRECTION — zero constraints, zero templates.`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `You are NOT filling in a template. You are DESIGNING this deck fresh:`,
    ``,
    `• Visual language: invent whatever layout fits the topic — asymmetric grids,`,
    `  overlapping image-text compositions, editorial magazine spreads, full-bleed`,
    `  typographic hero slides, kinetic type, data-viz panels, diagonal splits,`,
    `  fullscreen quote moments, nested card galleries. Surprise the eye.`,
    `• Palette: design a bespoke color story for THIS topic. No presets. No`,
    `  default purple/teal. Think: what colors does this subject FEEL like?`,
    `    – Claude AI → warm cream + deep orange + ink`,
    `    – Ocean plastic → abyssal navy + bioluminescent aqua + warning coral`,
    `    – Ottoman architecture → Iznik blue + gold leaf + travertine cream`,
    `    – Cyberpunk Tokyo → jet black + neon magenta + electric cyan + rain`,
    `• Typography: pick Google Fonts that embody the subject. Humanist serif for`,
    `  literary/philosophy, geometric sans for tech, slab for industrial, script`,
    `  for fashion, monospace for cyber, condensed display for sports. Contrast`,
    `  a display face with a readable body face.`,
    `• Motion: staggered entrance animations, kinetic accent bars, slow-floating`,
    `  decorative blurs, parallax depth. Transitions between slides should feel`,
    `  intentional, not jarring. Arrow keys + space + click to navigate, F for`,
    `  fullscreen, slide counter bottom-right.`,
    `• Content: deeply specific, true, fascinating. Real names, real dates, real`,
    `  numbers. If you don't know something, call web_search. NEVER write`,
    `  "Insight #1" or "key benefit" or any placeholder text.`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `DELIVERABLE — one tool call: build_deck({ topic, html, spec? })  (spec is OPTIONAL)`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `After narrating your process, make EXACTLY ONE tool call with:`,
    ``,
    `  topic: "${topicEsc}"`,
    `  html:  complete single-file HTML document — <!doctype html> … </html>`,
    `         inline CSS + JS, Google Fonts via <link>, no external assets,`,
    `         ${slideCount} slides (or close). This is your FREEFORM canvas — any`,
    `         layout, any composition, any motion. Make it unforgettable.`,
    `  spec:  OPTIONAL — the SAME deck as a structured JSON object for PPTX export.`,
    `         OMIT spec ENTIRELY if the deck is large or you cannot serialize it`,
    `         compactly and reliably in one call — the html alone produces a fully`,
    `         usable, previewable, downloadable deck (only the .pptx export is`,
    `         skipped). When you DO include it, keep it <= 14 slides:`,
    `    {`,
    `      palette: {`,
    `        vars: { bg, panel, accent, accent2, accent3, text, sub, card?, border? }`,
    `               // hex with '#'; card/border can be rgba() for glass`,
    `        fonts: { display: "'Family Name', genericFallback",`,
    `                 body:    "'Family Name', genericFallback" }`,
    `        fontsUrl: "https://fonts.googleapis.com/css2?family=…&display=swap"`,
    `      },`,
    `      slides: [`,
    `        { layout: "cover"|"twoCol"|"stat"|"cards"|"timeline"|"quote"|"compare"|"takeaways"|"closing",`,
    `          title: string, subtitle?: string, bullets?: string[] },`,
    `        …`,
    `      ]`,
    `    }`,
    ``,
    `The spec uses a constrained layout vocabulary (PPTX can't match arbitrary`,
    `HTML). Map each freeform HTML slide to the closest spec layout:`,
    `  cover/closing for title slides · stat for big-number slides ·`,
    `  cards for 3-item grids · timeline for step sequences · quote for pull-quotes ·`,
    `  compare for before/after · takeaways for summary · twoCol for everything else.`,
    `Keep palette + fonts IDENTICAL to the HTML so PPTX feels like the same deck.`,
    ``,
    `After the tool returns, reply with EXACTLY one short sentence`,
    `("Deck ready — preview and download above.") and STOP.`,
    ``,
    `Do NOT call write_file, create_file, install_packages, render_pptx,`,
    `render_deck, render_web_slides, or build_presentation. Only build_deck.`,
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
      "Kick off a creative presentation build. REQUIRED for any request involving slides, a " +
      "deck, a pitch, a presentation, a slideshow, or a visual report. Returns a small " +
      "'building…' card that immediately injects a BUILD_DECK prompt back into the chat, " +
      "which instructs you (the AI) to narrate your design process transparently and then " +
      "make ONE build_deck call producing both a live HTML preview and a downloadable PPTX. " +
      "After calling this, reply with ONE short sentence ('Designing your deck…') and stop; " +
      "the injected prompt will arrive as the next user turn.",
    inputSchema: { type: "object", properties: presentationProps, required: ["topic"] },
  },
  {
    name: "build_deck",
    description:
      "★ PRIMARY creative-deck renderer. Call this ONCE with both a fully-freeform HTML " +
      "document (max creativity — any layout/CSS/JS) and a compact JSON spec describing " +
      "the same deck. Returns a unified UI card with live HTML preview, Fullscreen, Open, " +
      "Download .html, and Download .pptx (rendered deterministically from the spec in <1s). " +
      "Use this in response to a BUILD_DECK prompt. Do NOT also call render_web_slides / " +
      "render_deck / render_pptx.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Deck topic (used for file names and captions)." },
        html: {
          type: "string",
          description:
            "Complete single-file HTML document for the deck (doctype + <html>…). Fully " +
            "freeform — any CSS/JS/layout you invent. Used for live preview + .html download.",
        },
        spec: {
          type: "object",
          description:
            "OPTIONAL compact deck spec for PPTX rendering. Same palette + content as the HTML, " +
            "mapped to a constrained layout vocabulary the engine can render. OMIT this entirely " +
            "if you cannot produce it compactly/reliably (e.g. many slides) — the deck still works " +
            "as a previewable, downloadable HTML file; only the .pptx download is skipped. Keep it " +
            "small (<= 14 slides) when you do include it.",
          properties: {
            palette: {
              type: "object",
              description: "Bespoke palette + fonts. Keep identical to the HTML.",
              properties: {
                vars: {
                  type: "object",
                  description:
                    "Hex colors (with '#'). Keys: bg, panel, accent, accent2, accent3, text, sub. " +
                    "Optional: card, border (may be rgba() for translucency).",
                },
                fonts: {
                  type: "object",
                  description:
                    "{ display: \"'Family', genericFallback\", body: \"'Family', genericFallback\" }",
                },
                fontsUrl: { type: "string", description: "Google Fonts CSS URL." },
              },
              required: ["vars", "fonts"],
            },
            slides: {
              type: "array",
              maxItems: 14,
              description: "Ordered slide list (max 14). ALWAYS start with `cover` and end with `closing`.",
              items: {
                type: "object",
                properties: {
                  layout: {
                    type: "string",
                    enum: PPTX_LAYOUTS,
                    description: "One of cover | twoCol | stat | cards | timeline | quote | compare | takeaways | closing.",
                  },
                  title: { type: "string" },
                  subtitle: { type: "string" },
                  bullets: { type: "array", items: { type: "string" } },
                },
                required: ["layout", "title"],
              },
            },
          },
          required: ["palette", "slides"],
        },
        fileName: {
          type: "string",
          description: "Optional base name (without extension) for the downloads.",
        },
      },
      required: ["topic", "html"],
    },
  },
  {
    name: "render_web_slides",
    description:
      "[LEGACY] Render only an AI-generated single-file HTML deck (no PPTX). Prefer build_deck.",
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
        palette: {
          type: "object",
          description:
            "BESPOKE palette you design for this specific topic. PREFER this over paletteId so " +
            "fonts and colors match the subject (e.g. Claude AI → warm orange/cream + humanist serif; " +
            "ocean research → teal/navy + clean sans). Hex colors WITH '#'.",
          properties: {
            vars: {
              type: "object",
              properties: {
                bg:      { type: "string", description: "Main background (usually dark or soft light, e.g. '#0f172a' or '#faf7f2')." },
                panel:   { type: "string", description: "Slightly offset panel/card background." },
                accent:  { type: "string", description: "Primary accent (titles, icons, highlights)." },
                accent2: { type: "string", description: "Secondary accent (metrics, alt emphasis)." },
                accent3: { type: "string", description: "Tertiary accent (rare highlight / third category)." },
                text:    { type: "string", description: "Primary text color, strong contrast against bg." },
                sub:     { type: "string", description: "Secondary/muted text." },
                card:    { type: "string", description: "Card fill, often a translucent rgba()." },
                border:  { type: "string", description: "Card/divider border, often translucent rgba()." },
              },
              required: ["bg", "panel", "accent", "accent2", "accent3", "text", "sub"],
            },
            fonts: {
              type: "object",
              description: "CSS font-family strings. The engine extracts the first family name for PPTX.",
              properties: {
                display: { type: "string", description: "Headline font, e.g. \"'Fraunces', serif\"." },
                body:    { type: "string", description: "Body font, e.g. \"'Inter', sans-serif\"." },
              },
              required: ["display", "body"],
            },
          },
          required: ["vars", "fonts"],
        },
        paletteId: {
          type: "string",
          description:
            "Optional preset id (legacy shortcut). Only used when `palette` is not supplied. " +
            "Available ids: " + PALETTE_IDS.map((id) => `"${id}"`).join(", "),
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
  .card { color: #1a1a2e; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 18px; box-shadow: 0 2px 8px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.03); }
  h2 { margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #1a1a2e; }
  p.sub { margin: 0 0 14px 0; color: #6b7280; font-size: 12px; }
  p.sub strong { color: #1a1a2e; font-weight: 600; }
  .grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
  button.opt { all: unset; cursor: pointer; padding: 18px 16px; border-radius: 12px; border: 1.5px solid #e5e7eb; background: #ffffff; color: #1a1a2e; transition: all .15s; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; }
  button.opt:hover { border-color: #7c3aed; background: #faf8ff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(109,40,217,.12); }
  button.opt:disabled { opacity: .55; cursor: progress; transform: none; box-shadow: none; }
  .opt .ico { font-size: 30px; line-height: 1; }
  .opt .ttl { font-weight: 600; font-size: 14px; color: #1a1a2e; }
  .opt .desc { font-size: 11px; color: #6b7280; line-height: 1.4; }
  .footer { margin-top: 12px; display: flex; justify-content: center; gap: 8px; font-size: 11px; color: #9ca3af; }
  .footer button.quick { all: unset; cursor: pointer; color: #6b7280; text-decoration: underline; }
  .footer button.quick:hover { color: #1a1a2e; }
  .footer button.quick:disabled { opacity: .5; cursor: progress; text-decoration: none; }
  .status { margin-top: 12px; padding: 10px 12px; font-size: 12px; color: #6d28d9; background: #f3f0ff; border: 1px solid #c4b5fd; border-radius: 8px; display: none; align-items: center; gap: 8px; }
  .status.on { display: flex; }
  .spin { width: 14px; height: 14px; border: 2px solid #c4b5fd; border-top-color: #7c3aed; border-radius: 50%; animation: sp 0.7s linear infinite; flex: none; }
  @keyframes sp { to { transform: rotate(360deg); } }

  /* Dark mode */
  html[data-theme="dark"] body { color: #f4f4f5; }
  html[data-theme="dark"] .card { background: #111113; border-color: #27272a; color: #f4f4f5; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
  html[data-theme="dark"] h2 { color: #f4f4f5; }
  html[data-theme="dark"] p.sub { color: #a1a1aa; }
  html[data-theme="dark"] p.sub strong { color: #f4f4f5; }
  html[data-theme="dark"] button.opt { background: #18181b; border-color: #27272a; color: #f4f4f5; }
  html[data-theme="dark"] button.opt:hover { border-color: #7c3aed; background: #1e1b4b; }
  html[data-theme="dark"] .opt .ttl { color: #f4f4f5; }
  html[data-theme="dark"] .opt .desc { color: #a1a1aa; }
  html[data-theme="dark"] .footer { color: #52525b; }
  html[data-theme="dark"] .footer button.quick { color: #a1a1aa; }
  html[data-theme="dark"] .footer button.quick:hover { color: #f4f4f5; }
  html[data-theme="dark"] .status { color: #c4b5fd; background: #1e1b4b; border-color: #4c1d95; }
  html[data-theme="dark"] .spin { border-color: #4c1d95; border-top-color: #a78bfa; }
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
  .card { color: #1a1a2e; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px 18px; display: flex; gap: 14px; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.03); }
  .ico { font-size: 28px; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; background: #f3f0ff; border-radius: 10px; flex-shrink: 0; }
  .body { flex: 1; min-width: 0; }
  .ttl { font-weight: 600; font-size: 14px; margin-bottom: 2px; color: #1a1a2e; word-break: break-word; }
  .meta { font-size: 12px; color: #6b7280; }
  a.dl { all: unset; cursor: pointer; padding: 8px 16px; border-radius: 8px; background: #6d28d9; color: #ffffff; font-weight: 500; font-size: 13px; transition: all .15s ease; }
  a.dl:hover { background: #5b21b6; transform: translateY(-1px); box-shadow: 0 2px 6px rgba(109,40,217,.25); }

  /* Dark mode */
  html[data-theme="dark"] body { color: #f4f4f5; }
  html[data-theme="dark"] .card { background: #111113; border-color: #27272a; color: #f4f4f5; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
  html[data-theme="dark"] .ico { background: #1e1b4b; }
  html[data-theme="dark"] .ttl { color: #f4f4f5; }
  html[data-theme="dark"] .meta { color: #a1a1aa; }
  html[data-theme="dark"] a.dl { background: #7c3aed; }
  html[data-theme="dark"] a.dl:hover { background: #8b5cf6; box-shadow: 0 2px 6px rgba(139,92,246,.3); }
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
  *, html { box-sizing: border-box; }
  html { background: transparent; }
  body { margin: 0; font: 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 12px 0; background: transparent; }
  .wrap { color: #1a1a2e; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.03); }
  .bar { display: flex; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid #f0f0f5; background: #fafafa; }
  .bar .ico { font-size: 18px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; background: #f3f0ff; border-radius: 8px; flex-shrink: 0; }
  .bar .meta { flex: 1; min-width: 0; }
  .bar .ttl { font-weight: 600; font-size: 14px; color: #1a1a2e; }
  .bar .sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .btns { display: flex; gap: 8px; padding: 12px 18px; border-bottom: 1px solid #f0f0f5; align-items: center; flex-wrap: wrap; }
  .btns a, .btns button { all: unset; cursor: pointer; padding: 7px 14px; border-radius: 8px; font-weight: 500; font-size: 12px; transition: all .15s ease; display: inline-flex; align-items: center; gap: 5px; }
  .btns a.dl { background: #6d28d9; color: #ffffff; }
  .btns a.dl:hover { background: #5b21b6; transform: translateY(-1px); box-shadow: 0 2px 6px rgba(109,40,217,.25); }
  .btns a.open { background: transparent; color: #6d28d9; border: 1.5px solid #6d28d9; }
  .btns a.open:hover { background: #6d28d9; color: #ffffff; }
  .btns button.fs { background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb; }
  .btns button.fs:hover { background: #e5e7eb; color: #1f2937; }
  .btns .spacer { flex: 1; }
  .stage { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #0f172a; }
  .stage iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
  .hint { padding: 10px 18px; font-size: 11px; color: #9ca3af; border-top: 1px solid #f0f0f5; background: #fafafa; }

  /* Dark mode */
  html[data-theme="dark"] .wrap { background: #111113; border-color: #27272a; color: #f4f4f5; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
  html[data-theme="dark"] .bar { background: #18181b; border-bottom-color: #27272a; }
  html[data-theme="dark"] .bar .ico { background: #1e1b4b; }
  html[data-theme="dark"] .bar .ttl { color: #f4f4f5; }
  html[data-theme="dark"] .bar .sub { color: #a1a1aa; }
  html[data-theme="dark"] .btns { border-bottom-color: #27272a; }
  html[data-theme="dark"] .btns a.dl { background: #7c3aed; }
  html[data-theme="dark"] .btns a.dl:hover { background: #8b5cf6; box-shadow: 0 2px 6px rgba(139,92,246,.3); }
  html[data-theme="dark"] .btns a.open { color: #a78bfa; border-color: #a78bfa; }
  html[data-theme="dark"] .btns a.open:hover { background: #7c3aed; color: #ffffff; border-color: #7c3aed; }
  html[data-theme="dark"] .btns button.fs { background: #27272a; color: #d4d4d8; border-color: #3f3f46; }
  html[data-theme="dark"] .btns button.fs:hover { background: #3f3f46; color: #f4f4f5; }
  html[data-theme="dark"] .hint { color: #71717a; border-top-color: #27272a; background: #18181b; }
</style></head>
<body>
<div class="wrap">
  <div class="bar">
    <div class="ico">🌐</div>
    <div class="meta">
      <div class="ttl">${escapeHtml(fileName)}</div>
      <div class="sub">${sizeKb} KB · ${escapeHtml(summary)}</div>
    </div>
  </div>
  <div class="btns">
    <a class="dl" download="${escapeHtml(fileName)}" href="${dataHref}">Download</a>
    <a class="open" target="_blank" rel="noopener" href="${dataHref}">Open ↗</a>
    <span class="spacer"></span>
    <button class="fs" id="fs" type="button">⛶ Fullscreen</button>
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
// Auto-start card — shown right after create_presentation. Immediately
// injects the BUILD_DECK prompt back into the chat so the LLM starts
// narrating + generating without any user click.
// ─────────────────────────────────────────────────────────────────────────
function autoBuildCardHtml({ topic, buildPrompt }) {
  const buildPromptJson = JSON.stringify(buildPrompt);
  const topicJson = JSON.stringify(topic);
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  *, html { box-sizing: border-box; }
  html { background: transparent; }
  body { margin: 0; font: 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 10px 0; background: transparent; color: #1a1a2e; }
  .card { background: linear-gradient(135deg, #faf8ff 0%, #f3f0ff 100%); border: 1px solid #c4b5fd; border-radius: 14px; padding: 14px 18px; box-shadow: 0 2px 8px rgba(109,40,217,.08); }
  .hdr { display: flex; gap: 12px; align-items: center; }
  .spin { width: 18px; height: 18px; border: 2.5px solid #c4b5fd; border-top-color: #7c3aed; border-radius: 50%; animation: sp 0.8s linear infinite; flex: none; }
  .spin.done { border-top-color: #10b981; animation: none; background: #10b981; border-color: #10b981; position: relative; }
  .spin.done::after { content: '✓'; position: absolute; inset: 0; color: white; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  @keyframes sp { to { transform: rotate(360deg); } }
  .msg { flex: 1; min-width: 0; }
  .ttl { font-weight: 600; color: #6d28d9; font-size: 13px; }
  .sub { font-size: 11px; color: #7c3aed; margin-top: 2px; }
  .log { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #c4b5fd; max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .log:empty { display: none; }
  .line { font-size: 12px; color: #1e1b4b; line-height: 1.45; padding: 2px 0; animation: fi .25s ease-out; white-space: pre-wrap; word-wrap: break-word; font-variant-emoji: emoji; }
  .line.stale { color: #7c3aed; opacity: .65; }
  @keyframes fi { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .meta { margin-top: 8px; display: flex; justify-content: space-between; gap: 10px; font-size: 10px; color: #7c3aed; font-variant-numeric: tabular-nums; opacity: .7; }

  /* Dark mode */
  html[data-theme="dark"] body { color: #f4f4f5; }
  html[data-theme="dark"] .card { background: #111113; border-color: #27272a; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
  html[data-theme="dark"] .ttl { color: #f4f4f5; }
  html[data-theme="dark"] .sub { color: #a1a1aa; }
  html[data-theme="dark"] .spin { border-color: #3f3f46; border-top-color: #a78bfa; }
  html[data-theme="dark"] .log { border-top-color: #27272a; }
  html[data-theme="dark"] .line { color: #e4e4e7; }
  html[data-theme="dark"] .line.stale { color: #71717a; }
  html[data-theme="dark"] .meta { color: #71717a; }
  /* Scrollbar */
  html[data-theme="dark"] .log::-webkit-scrollbar { width: 6px; }
  html[data-theme="dark"] .log::-webkit-scrollbar-track { background: transparent; }
  html[data-theme="dark"] .log::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
  html[data-theme="dark"] .log::-webkit-scrollbar-thumb:hover { background: #52525b; }
  .log::-webkit-scrollbar { width: 6px; }
  .log::-webkit-scrollbar-track { background: transparent; }
  .log::-webkit-scrollbar-thumb { background: #c4b5fd; border-radius: 3px; }
  .log::-webkit-scrollbar-thumb:hover { background: #a78bfa; }
</style></head>
<body>
<div class="card">
  <div class="hdr">
    <div class="spin" id="spin"></div>
    <div class="msg">
      <div class="ttl" id="ttl">Designing your deck…</div>
      <div class="sub" id="sub">Warming up — the AI is beginning its research.</div>
    </div>
  </div>
  <div class="log" id="log"></div>
  <div class="meta"><span id="count">0 updates</span><span id="timer">0.0s</span></div>
</div>
<script>
  const buildPrompt = ${buildPromptJson};
  const topic = ${topicJson};
  const logEl = document.getElementById('log');
  const ttlEl = document.getElementById('ttl');
  const subEl = document.getElementById('sub');
  const spinEl = document.getElementById('spin');
  const countEl = document.getElementById('count');
  const timerEl = document.getElementById('timer');
  const t0 = performance.now();
  let count = 0;
  let done = false;
  const seen = new Set();
  const timerInterval = setInterval(() => {
    if (done) { clearInterval(timerInterval); return; }
    const s = ((performance.now() - t0) / 1000).toFixed(1);
    timerEl.textContent = s + 's';
  }, 200);
  function addStatus(text) {
    if (!text || typeof text !== 'string') return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    // mark older lines as stale — the newest is the current activity.
    for (const el of logEl.querySelectorAll('.line')) el.classList.add('stale');
    const el = document.createElement('div');
    el.className = 'line';
    el.textContent = trimmed;
    logEl.appendChild(el);
    logEl.scrollTop = logEl.scrollHeight;
    count++;
    countEl.textContent = count + (count === 1 ? ' update' : ' updates');
    subEl.textContent = trimmed.length > 80 ? trimmed.slice(0, 77) + '…' : trimmed;
    reportSize();
  }
  function markDone(finalText) {
    if (done) return;
    done = true;
    spinEl.classList.add('done');
    ttlEl.textContent = finalText || 'Deck ready';
    subEl.textContent = 'Preview and downloads are above.';
    reportSize();
  }
  // Handshake: wait until the host window tells us its postMessage listener
  // is attached before injecting the BUILD_DECK prompt. Firing on load would
  // race the parent's React ref/listener setup and get silently dropped.
  let fired = false;
  function firePrompt() {
    if (fired) return;
    fired = true;
    window.parent.postMessage({
      type: 'prompt',
      payload: {
        prompt: buildPrompt,
        displayText: '🎨 Designing a bespoke deck about "' + topic + '"…',
      },
    }, '*');
  }
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'host-ready') firePrompt();
    else if (d.type === 'status' && d.payload) {
      // Parent pushes narration lines extracted from the AI's streaming
      // assistant text so the user sees live progress in the card itself,
      // not just the static "Designing your deck…" placeholder.
      const lines = Array.isArray(d.payload.lines) ? d.payload.lines
        : (typeof d.payload.text === 'string' ? [d.payload.text] : []);
      for (const l of lines) addStatus(l);
    } else if (d.type === 'deck-ready') {
      markDone(d.payload && d.payload.text);
    }
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
// Unified deck card — HTML preview + .html download + .pptx download.
// Returned by build_deck. Single UI surface, both formats in one place.
// ─────────────────────────────────────────────────────────────────────────
function unifiedDeckCardHtml({ deckHtml, htmlBase64, htmlFileName, htmlSizeBytes, pptxBase64, pptxFileName, pptxSizeBytes, summary, slideCount }) {
  const htmlKb = (htmlSizeBytes / 1024).toFixed(1);
  const pptxKb = pptxBase64 ? (pptxSizeBytes / 1024).toFixed(1) : null;
  const srcdocSafe = deckHtml.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const htmlHref = `data:text/html;base64,${htmlBase64}`;
  const pptxHref = pptxBase64
    ? `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${pptxBase64}`
    : null;
  const pptxButton = pptxHref
    ? `<a class="dl pptx" download="${escapeHtml(pptxFileName)}" href="${pptxHref}" title="${pptxKb} KB">📊 Download .pptx</a>`
    : `<span class="dl dl-disabled" title="PPTX spec not provided">📊 .pptx unavailable</span>`;
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  *, html { box-sizing: border-box; }
  html { background: transparent; }
  body { margin: 0; font: 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 12px 0; background: transparent; }
  .wrap { color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
  .bar { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; flex-wrap: wrap; }
  .bar .meta { flex: 1; min-width: 180px; }
  .bar .ttl { font-weight: 600; color: #0f172a; word-break: break-word; }
  .bar .sub { font-size: 11px; color: #475569; }
  .bar .btns { display: flex; gap: 6px; flex-wrap: wrap; }
  .bar a, .bar button, .bar span.dl { all: unset; cursor: pointer; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 12px; transition: background .15s; display: inline-block; }
  .bar a.dl.html { background: #0284c7; color: #ffffff; }
  .bar a.dl.html:hover { background: #0369a1; }
  .bar a.dl.pptx { background: #d97706; color: #ffffff; }
  .bar a.dl.pptx:hover { background: #b45309; }
  .bar span.dl-disabled { background: #e2e8f0; color: #94a3b8; cursor: not-allowed; }
  .bar a.open, .bar button.fs { background: #e2e8f0; color: #0f172a; }
  .bar a.open:hover, .bar button.fs:hover { background: #cbd5e1; }
  .stage { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #0f172a; }
  .stage iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
  .hint { padding: 8px 14px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .hint .left { opacity: .85; }
  .hint .right { opacity: .7; font-variant-numeric: tabular-nums; }

  /* Dark mode — matches Doable's dark theme */
  html[data-theme="dark"] .wrap { background: #0f0f12; border-color: #27272a; color: #f2f2f2; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
  html[data-theme="dark"] .bar { background: #18181b; border-bottom-color: #27272a; }
  html[data-theme="dark"] .bar .ttl { color: #f2f2f2; }
  html[data-theme="dark"] .bar .sub { color: #a1a1aa; }
  html[data-theme="dark"] .bar a.open, html[data-theme="dark"] .bar button.fs { background: #27272a; color: #f2f2f2; }
  html[data-theme="dark"] .bar a.open:hover, html[data-theme="dark"] .bar button.fs:hover { background: #3f3f46; }
  html[data-theme="dark"] .bar span.dl-disabled { background: #27272a; color: #52525b; }
  html[data-theme="dark"] .hint { color: #71717a; border-top-color: #27272a; background: #18181b; }
</style></head>
<body>
<div class="wrap">
  <div class="bar">
    <div class="meta">
      <div class="ttl">${escapeHtml(summary)}</div>
      <div class="sub">${slideCount} slides · HTML preview is live · both downloads ready</div>
    </div>
    <div class="btns">
      <button class="fs" id="fs" type="button">⛶ Fullscreen</button>
      <a class="open" target="_blank" rel="noopener" href="${htmlHref}">Open ↗</a>
      <a class="dl html" download="${escapeHtml(htmlFileName)}" href="${htmlHref}" title="${htmlKb} KB">🌐 Download .html</a>
      ${pptxButton}
    </div>
  </div>
  <div class="stage" id="stage">
    <iframe id="deck" title="Deck preview" sandbox="allow-scripts allow-same-origin" allow="fullscreen" srcdoc="${srcdocSafe}"></iframe>
  </div>
  <div class="hint">
    <span class="left">Use ← → / Space to navigate · F for fullscreen inside the deck</span>
    <span class="right">.html ${htmlKb} KB${pptxKb ? ` · .pptx ${pptxKb} KB` : ""}</span>
  </div>
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
//
// Threat model: the `script` arg is AI-generated text, which means a
// prompt-injection or compromised provider could try to exfiltrate
// secrets (process.env), read the filesystem, or shell out. We defend
// in two layers:
//
//   1. Process isolation — `child_process.fork()` a worker subprocess
//      with `env: {}` so the worker's `process.env` is empty. Even if
//      the script escapes the inner vm sandbox, it cannot read
//      JWT_SECRET, ENCRYPTION_KEY, DOABLE_KEK, or any of the parent's
//      env. The subprocess receives the script via IPC (not argv, so
//      it never appears in `ps`), and is SIGKILL'd if it exceeds the
//      40-second outer timeout.
//
//   2. In-process vm sandbox (inside the worker) — seeded with only
//      PptxGenJS + Buffer + console + typed-array constructors. No
//      process, no require, no globalThis, no setTimeout.
//
// Buffer is returned via IPC as base64 (Node IPC supports Buffers
// directly on 18+ but base64 is the universally-portable encoding).
// Encoding overhead for a typical 100 KB .pptx is <100 ms.
// ─────────────────────────────────────────────────────────────────────────
async function runPptxScript(scriptBody) {
  if (typeof scriptBody !== "string" || !scriptBody.trim()) {
    throw new Error("`script` must be a non-empty string");
  }
  const { fork } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const { existsSync } = await import("node:fs");
  const here = dirname(fileURLToPath(import.meta.url));
  const workerPath = join(here, "pptx-worker.mjs");

  return new Promise((resolve, reject) => {
    // Node's --permission flag (stable in 24+) restricts the worker's
    // filesystem access to ONLY the paths we explicitly allow. Even if a
    // script escapes the inner vm sandbox via a prototype-chain trick and
    // grabs `process` via this.constructor.constructor, any
    // `require("fs").readFileSync("/home/doable/anything")` throws
    // ERR_ACCESS_DENIED — closing the last filesystem-exfiltration vector.
    // We allow `here` (the worker's own dir, needed for require to resolve
    // pptxgenjs from node_modules) and /tmp (Buffer write temp space for
    // pptxgenjs internals on some platforms). --allow-child-process is
    // OMITTED so the worker can't fork further to escape the permission
    // model. --allow-worker is also omitted for the same reason.
    // pnpm hoists workspace deps to <repo>/node_modules/.pnpm and the
    // per-package node_modules contains symlinks INTO that hoist dir. The
    // worker needs read access to the resolved real paths under
    // <repo>/node_modules/.pnpm — Node's permission system checks the
    // real path, not the symlink path. Walk up until we find a dir with
    // pnpm-workspace.yaml (true repo root) so the allowlist covers the
    // hoist dir regardless of install location.
    const repoRoot = (() => {
      let cur = here;
      while (cur && cur !== "/" && cur !== ".") {
        if (
          existsSync(join(cur, "pnpm-workspace.yaml")) ||
          existsSync(join(cur, "node_modules", ".pnpm"))
        ) {
          return cur;
        }
        cur = dirname(cur);
      }
      return here;
    })();
    const child = fork(workerPath, [], {
      env: {},                              // strip ALL parent env vars
      cwd: here,                            // keep cwd predictable
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      execArgv: [
        "--max-old-space-size=256",
        "--permission",
        `--allow-fs-read=${repoRoot}/node_modules`,    // hoisted pnpm deps (recursive)
        `--allow-fs-read=${here}`,                      // worker file
        "--allow-fs-read=/tmp",
        "--allow-fs-write=/tmp",
      ],
    });

    const stderr = [];
    child.stderr?.on("data", (chunk) => stderr.push(chunk.toString()));

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("PptxGenJS script timed out after 40s (worker killed)"));
    }, 40_000);

    child.on("message", (msg) => {
      clearTimeout(timeout);
      if (!msg || typeof msg !== "object") {
        reject(new Error("worker sent malformed message"));
      } else if (msg.ok) {
        resolve({
          buffer: Buffer.from(msg.bufferBase64, "base64"),
          slideCount: msg.slideCount ?? 0,
        });
      } else {
        reject(new Error(msg.error || "worker reported failure"));
      }
      child.disconnect();
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("exit", (code, sig) => {
      clearTimeout(timeout);
      if (code !== 0 && code !== null) {
        const tail = stderr.join("").slice(-400);
        reject(new Error(`worker exited with code ${code}${sig ? ` (signal ${sig})` : ""}${tail ? ` — stderr: ${tail}` : ""}`));
      }
    });

    child.send({ script: scriptBody });
  });
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
    const html = autoBuildCardHtml({
      topic,
      buildPrompt: buildDeckPrompt(opts),
    });
    const ui = createUIResource({
      uri: `ui://presentation-builder/auto-build/${Date.now()}`,
      content: { type: "rawHtml", htmlString: html },
      encoding: "text",
    });
    return {
      content: [
        ui,
        {
          type: "text",
          text:
            "Build card shown. It will immediately inject a BUILD_DECK prompt back as a new " +
            "user turn. Reply with ONE short sentence like \"Designing your deck…\" and STOP. " +
            "Do NOT call other tools or write code yet — wait for the BUILD_DECK prompt to " +
            "arrive, then follow its instructions (narrate progress + call build_deck once).",
        },
      ],
    };
  }

  if (name === "build_deck") {
    const topic = String(args?.topic ?? "").trim() || "presentation";
    const deckHtml = String(args?.html ?? "");
    const spec = args?.spec && typeof args.spec === "object" ? args.spec : null;
    const baseName = String(args?.fileName ?? slugify(topic));
    const htmlFileName = `${baseName}.html`;
    const pptxFileName = `${baseName}.pptx`;

    if (!deckHtml.trim()) {
      return { isError: true, content: [{ type: "text", text: "Error: `html` is required (the freeform single-file HTML deck)." }] };
    }
    if (!/<html[\s>]/i.test(deckHtml) && !/<!doctype/i.test(deckHtml)) {
      return { isError: true, content: [{ type: "text", text: "Error: `html` does not look like a complete HTML document. Include `<!doctype html>` and `<html>`." }] };
    }
    // `spec` is OPTIONAL. Smaller models (e.g. MiniMax M2.7) frequently cannot
    // emit BOTH the freeform HTML deck AND a redundant nested `spec` in a single
    // tool-call argument — the oversized JSON truncates/duplicates, the call
    // fails, and the model retries forever (BUG-DECK). So a missing/empty spec
    // now DEGRADES GRACEFULLY to an HTML-only deck (still previewable +
    // downloadable as .html) instead of hard-erroring. A valid spec still
    // produces the downloadable .pptx.
    const hasSpec = !!(spec && Array.isArray(spec.slides) && spec.slides.length > 0);

    const htmlBase64 = Buffer.from(deckHtml, "utf8").toString("base64");
    const htmlSizeBytes = Buffer.byteLength(deckHtml, "utf8");

    let pptxBase64 = null;
    let pptxSizeBytes = 0;
    let pptxError = null;
    let renderedSlideCount = hasSpec ? spec.slides.length : 0;
    if (hasSpec) {
      try {
        const { buffer, slideCount } = await buildPptxFromSpec({
          topic,
          palette: spec.palette && typeof spec.palette === "object" ? spec.palette : undefined,
          slides: spec.slides,
        });
        pptxBase64 = Buffer.from(buffer).toString("base64");
        pptxSizeBytes = buffer.length;
        renderedSlideCount = slideCount;
      } catch (err) {
        pptxError = err instanceof Error ? err.message : String(err);
        dlog(`build_deck: pptx render failed: ${pptxError}`);
      }
    } else {
      pptxError = "skipped: no spec provided (HTML-only deck)";
      dlog("build_deck: no spec provided — producing HTML-only deck");
    }

    const cardHtml = unifiedDeckCardHtml({
      deckHtml,
      htmlBase64,
      htmlFileName,
      htmlSizeBytes,
      pptxBase64,
      pptxFileName,
      pptxSizeBytes,
      summary: `Bespoke deck on "${topic}"`,
      slideCount: renderedSlideCount,
    });
    const ui = createUIResource({
      uri: `ui://presentation-builder/build-deck/${Date.now()}`,
      content: { type: "rawHtml", htmlString: cardHtml },
      encoding: "text",
    });

    const followupText = pptxError
      ? (hasSpec
          ? `Deck ready: ${htmlFileName} (HTML preview + download). PPTX render failed — ${pptxError}. Acknowledge briefly, mention the PPTX issue, and stop.`
          : `Deck ready: ${htmlFileName} (HTML preview + download). PPTX was skipped because no spec was provided — the HTML deck is fully usable. Acknowledge briefly and stop.`)
      : `Deck ready: ${htmlFileName} + ${pptxFileName} (${renderedSlideCount} slides). User can preview, fullscreen, or download either format from the card. Acknowledge briefly and stop.`;
    return {
      content: [
        ui,
        { type: "text", text: followupText },
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
    const palette = args?.palette && typeof args.palette === "object" ? args.palette : undefined;
    const format = String(args?.format ?? "pptx");
    if (format !== "pptx") {
      return { isError: true, content: [{ type: "text", text: `render_deck only supports format="pptx" right now (got "${format}"). Use build_presentation for HTML web decks.` }] };
    }
    if (slides.length === 0) {
      return { isError: true, content: [{ type: "text", text: "Error: `slides` must be a non-empty array." }] };
    }
    try {
      const { buffer, slideCount } = await buildPptxFromSpec({ topic, palette, paletteId, slides });
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
