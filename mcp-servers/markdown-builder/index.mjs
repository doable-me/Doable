#!/usr/bin/env node
/**
 * Markdown Builder — a Doable built-in MCP App.
 * --------------------------------------------------------
 * Standards-compliant per modelcontextprotocol.io/extensions/apps:
 * tools return UIResource cards rendered as sandboxed iframes by the
 * Doable host (and any other MCP-Apps-compatible host).
 *
 *   1. `create_markdown({ topic, audience?, tone?, length? })`
 *        Returns a status card that postMessages a BUILD_MARKDOWN
 *        prompt back to the host as a synthetic user turn. The LLM
 *        narrates progress, then makes ONE `build_markdown` call.
 *
 *   2. `build_markdown({ topic, content, fileName?, frontmatter? })`
 *        ★ primary tool. Renders a unified card with:
 *          - live HTML preview of the markdown (rendered with `marked`)
 *          - Download .md button
 *          - Download .html button (the rendered prose)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createUIResource } from "@mcp-ui/server";
import { marked } from "marked";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { autoBuildCardHtml, previewDownloadCardHtml, escapeHtml, slugify } from "../_shared/ui.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function dlog(msg) {
  if (!process.env.MCP_DEBUG) return;
  console.error(`[${new Date().toISOString()}] [MD] ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────
// LLM build prompt — short, imperative, transparency-driven.
// ─────────────────────────────────────────────────────────────────────────
function buildMarkdownPrompt({ topic, audience, tone, length }) {
  const topicEsc = String(topic).replace(/"/g, '\\"');
  const targetWords =
    length === "short" ? "400-700"
    : length === "long" ? "2000-3500"
    : "900-1500";
  return [
    `BUILD_MARKDOWN topic="${topicEsc}"${audience ? ` audience="${String(audience).replace(/"/g, '\\"')}"` : ""}${tone ? ` tone="${String(tone).replace(/"/g, '\\"')}"` : ""} length="${length || "medium"}"`,
    ``,
    `You are about to write a polished, well-structured Markdown document. This is a writing moment — clear, specific, useful prose, not boilerplate.`,
    ``,
    `━━━ TRANSPARENCY (visible chat lines) ━━━`,
    `Stream these short status lines as plain assistant chat content (NOT inside thinking/analysis blocks). Blank line before and after each line. Do not batch.`,
    `  1. "🔍 Researching ${topicEsc}…"   (call web_search NOW if needed)`,
    `  2. "📝 Outlining sections…"`,
    `  3. "✍️ Drafting section <n>: <topic>"   (one line per section)`,
    `  4. "🎯 Tightening prose and headings…"`,
    `  5. "🚀 Saving the document…"   → then the tool call.`,
    ``,
    `FORBIDDEN visible output: "Let me think…", "Here's my plan:", code fences, your reasoning, the markdown content itself before the tool call.`,
    ``,
    `━━━ DELIVERABLE — call build_markdown({ topic, content, frontmatter? }) ONCE ━━━`,
    `  topic:   "${topicEsc}"`,
    `  content: COMPLETE markdown body (~${targetWords} words). Structure:`,
    `           # Title`,
    `           Short lead paragraph (1-3 sentences setting context).`,
    `           ## H2 Section`,
    `           ### H3 Subsection (when needed)`,
    `           - Bullets when listing.`,
    `           1. Numbered when ordered.`,
    `           > Blockquotes for important callouts.`,
    `           \`inline code\` and \`\`\`fenced blocks\`\`\` when relevant.`,
    `           | Table | Cells |   when comparing.`,
    `           [link](url) for citations.`,
    `           ![alt](url) for images (only if you have a real public URL).`,
    `  frontmatter (optional): { title, date?, author?, tags?[] } — emitted as YAML.`,
    ``,
    `Quality bar:`,
    `  - Specific facts, real numbers, real names. NO placeholder text.`,
    `  - Concrete examples in every section.`,
    `  - Headings MUST be hierarchical (no skipping H2 → H4).`,
    `  - Wrap at natural sentence boundaries (no manual line breaks mid-sentence).`,
    `  - End with a brief "Key takeaways" list when length ≥ medium.`,
    ``,
    `After the tool returns, reply with EXACTLY one short sentence ("Document ready — preview and download above.") and STOP. Do NOT call write_file or any file tool.`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "create_markdown",
    description:
      "Kick off a creative Markdown document build. REQUIRED for any request involving a "
      + "markdown file, README, article, blog post, technical writeup, notes document, "
      + "wiki page, or .md export. Returns a small status card that immediately injects "
      + "a BUILD_MARKDOWN prompt back as the next user turn — telling you (the AI) to "
      + "narrate your writing process and then call build_markdown ONCE. After invoking "
      + "this, reply with ONE short sentence ('Drafting your document…') and stop; the "
      + "injected prompt arrives next.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Subject of the document (required)." },
        audience: { type: "string", description: "Target reader (e.g. 'engineers', 'execs', 'students')." },
        tone: { type: "string", description: "casual | formal | technical | tutorial | reference | reflective" },
        length: { type: "string", enum: ["short", "medium", "long"], description: "short ~500w, medium ~1200w, long ~2500w. Default medium." },
      },
      required: ["topic"],
    },
  },
  {
    name: "build_markdown",
    description:
      "★ PRIMARY markdown renderer. Call this ONCE with the COMPLETE finished markdown body. "
      + "Returns a unified UI card with: rendered HTML preview, Download .md, Download .html. "
      + "Use ONLY in response to a BUILD_MARKDOWN prompt. Do NOT also call write_file.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Document topic (used for filename + caption)." },
        content: {
          type: "string",
          description:
            "Complete Markdown body. Plain markdown (no code fences wrapping the whole thing). "
            + "Use #/##/### headings, lists, tables, blockquotes, links freely.",
        },
        frontmatter: {
          type: "object",
          description: "Optional YAML frontmatter object (title, date, author, tags[]).",
          properties: {
            title:  { type: "string" },
            date:   { type: "string", description: "ISO date (YYYY-MM-DD) or any string." },
            author: { type: "string" },
            tags:   { type: "array", items: { type: "string" } },
          },
        },
        fileName: { type: "string", description: "Optional base filename (no extension)." },
      },
      required: ["topic", "content"],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Markdown → preview HTML
// ─────────────────────────────────────────────────────────────────────────
marked.setOptions({ gfm: true, breaks: false });

function frontmatterToYaml(fm) {
  if (!fm || typeof fm !== "object") return "";
  const lines = ["---"];
  if (fm.title)  lines.push(`title: ${JSON.stringify(String(fm.title))}`);
  if (fm.date)   lines.push(`date: ${JSON.stringify(String(fm.date))}`);
  if (fm.author) lines.push(`author: ${JSON.stringify(String(fm.author))}`);
  if (Array.isArray(fm.tags) && fm.tags.length) {
    lines.push("tags:");
    for (const t of fm.tags) lines.push(`  - ${JSON.stringify(String(t))}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

/**
 * Build a complete <html> document around rendered markdown so the
 * iframe preview is fully self-contained and theme-adaptive.
 */
function buildPreviewHtml(markdownContent, title) {
  const inner = marked.parse(markdownContent || "");
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title || "Document")}</title>
<style>
  *, html { box-sizing: border-box; }
  html { background: transparent; }
  body { margin: 0; padding: 24px 32px; font: 15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color: #1a1a2e; background: #ffffff; max-width: 820px; margin-left: auto; margin-right: auto; }
  h1, h2, h3, h4, h5, h6 { color: #1a1a2e; line-height: 1.25; margin: 1.6em 0 0.6em 0; font-weight: 600; }
  h1 { font-size: 2em; border-bottom: 1px solid #f0f0f5; padding-bottom: .35em; margin-top: 0; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #f0f0f5; padding-bottom: .25em; }
  h3 { font-size: 1.2em; }
  p { margin: 0 0 1em 0; }
  a { color: #6d28d9; text-decoration: underline; text-decoration-color: rgba(109,40,217,.4); }
  a:hover { text-decoration-color: #6d28d9; }
  code { font: 13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; background: #f3f0ff; padding: .15em .4em; border-radius: 4px; }
  pre { background: #faf8ff; border: 1px solid #f0f0f5; border-radius: 8px; padding: 14px 16px; overflow: auto; }
  pre code { background: transparent; padding: 0; }
  blockquote { border-left: 3px solid #c4b5fd; margin: 1em 0; padding: .25em 1em; color: #4b5563; background: #faf8ff; border-radius: 0 6px 6px 0; }
  ul, ol { padding-left: 1.4em; margin: 0 0 1em 0; }
  li { margin: .25em 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: .95em; }
  th, td { border: 1px solid #f0f0f5; padding: 8px 12px; text-align: left; }
  th { background: #fafafa; font-weight: 600; }
  hr { border: 0; border-top: 1px solid #f0f0f5; margin: 2em 0; }
  img { max-width: 100%; border-radius: 6px; }
  /* Dark theme */
  html[data-theme="dark"] body { background: #111113; color: #e4e4e7; }
  html[data-theme="dark"] h1, html[data-theme="dark"] h2, html[data-theme="dark"] h3,
  html[data-theme="dark"] h4, html[data-theme="dark"] h5, html[data-theme="dark"] h6 { color: #f4f4f5; }
  html[data-theme="dark"] h1, html[data-theme="dark"] h2 { border-bottom-color: #27272a; }
  html[data-theme="dark"] a { color: #a78bfa; text-decoration-color: rgba(167,139,250,.4); }
  html[data-theme="dark"] a:hover { text-decoration-color: #a78bfa; }
  html[data-theme="dark"] code { background: #1e1b4b; }
  html[data-theme="dark"] pre { background: #18181b; border-color: #27272a; }
  html[data-theme="dark"] blockquote { border-left-color: #4c1d95; background: #18181b; color: #a1a1aa; }
  html[data-theme="dark"] th, html[data-theme="dark"] td { border-color: #27272a; }
  html[data-theme="dark"] th { background: #18181b; }
  html[data-theme="dark"] hr { border-top-color: #27272a; }
</style></head>
<body>
${inner}
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "markdown-builder", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  dlog(`tools/call ${name}`);

  if (name === "create_markdown") {
    const topic = String(args?.topic ?? "").trim();
    if (!topic) {
      return { isError: true, content: [{ type: "text", text: "Error: 'topic' is required." }] };
    }
    const opts = { topic, audience: args?.audience, tone: args?.tone, length: args?.length };
    const html = autoBuildCardHtml({
      topic,
      title: "Drafting your document…",
      subtitle: "Warming up — researching your topic.",
      displayText: `📝 Writing a markdown document about "${topic}"…`,
      buildPrompt: buildMarkdownPrompt(opts),
      accent: {
        lightBg1: "#faf8ff", lightBg2: "#f3f0ff", lightBorder: "#c4b5fd",
        lightTitle: "#6d28d9", lightSub: "#7c3aed",
        spinTrack: "#c4b5fd", spinHead: "#7c3aed", scrollLight: "#c4b5fd",
      },
    });
    const ui = createUIResource({
      uri: `ui://markdown-builder/auto-build/${Date.now()}`,
      content: { type: "rawHtml", htmlString: html },
      encoding: "text",
    });
    return {
      content: [
        ui,
        {
          type: "text",
          text:
            "Build card shown. It will inject a BUILD_MARKDOWN prompt back as a new user turn. "
            + "Reply with ONE short sentence like \"Drafting your document…\" and STOP. "
            + "DO NOT call write_file, create_file, edit_file, str_replace, or any other tool — "
            + "the next user turn will arrive automatically. "
            + "Wait for the BUILD_MARKDOWN prompt to arrive, then narrate progress and call "
            + "build_markdown once.",
        },
      ],
    };
  }

  if (name === "build_markdown") {
    const topic = String(args?.topic ?? "").trim() || "document";
    const content = String(args?.content ?? "").trim();
    const frontmatter = args?.frontmatter && typeof args.frontmatter === "object" ? args.frontmatter : null;
    const baseName = String(args?.fileName ?? slugify(topic));

    if (!content) {
      return { isError: true, content: [{ type: "text", text: "Error: `content` is required (the complete markdown body)." }] };
    }

    const fmBlock = frontmatterToYaml(frontmatter);
    const fullMd = fmBlock ? fmBlock + content : content;

    const previewTitle = (frontmatter && frontmatter.title) || topic;
    const previewHtml = buildPreviewHtml(content, previewTitle);

    const mdBytes = Buffer.from(fullMd, "utf8");
    const htmlBytes = Buffer.from(previewHtml, "utf8");

    const wordCount = (content.match(/\S+/g) || []).length;
    const lineCount = content.split(/\r?\n/).length;

    const card = previewDownloadCardHtml({
      title: `${baseName}.md`,
      subtitle: `${wordCount} words · ${lineCount} lines · "${topic}"`,
      previewKind: "iframe-html",
      previewHtml,
      iconEmoji: "📝",
      hint: "Markdown preview · download .md or rendered .html",
      downloads: [
        {
          label: "📥 Download .md",
          fileName: `${baseName}.md`,
          mimeType: "text/markdown;charset=utf-8",
          base64: mdBytes.toString("base64"),
          sizeBytes: mdBytes.length,
        },
        {
          label: "🌐 Download .html",
          fileName: `${baseName}.html`,
          mimeType: "text/html;charset=utf-8",
          base64: htmlBytes.toString("base64"),
          sizeBytes: htmlBytes.length,
        },
      ],
      accent: { primary: "#6d28d9", primaryHover: "#5b21b6", secondary: "#6d28d9", secondaryHover: "#5b21b6" },
    });

    const ui = createUIResource({
      uri: `ui://markdown-builder/build/${Date.now()}`,
      content: { type: "rawHtml", htmlString: card },
      encoding: "text",
    });
    return {
      content: [
        ui,
        {
          type: "text",
          text: `Markdown ready: ${baseName}.md (${wordCount} words). User can preview, fullscreen, or download .md / .html from the card. Acknowledge briefly and stop.`,
        },
      ],
    };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
dlog("MCP server started.");
