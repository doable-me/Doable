#!/usr/bin/env node
/**
 * Presentation Builder MCP Server
 * --------------------------------
 * Exposes two tools for Doable's chat:
 *
 *   1. `create_presentation(topic, ...)` —
 *        Returns an interactive `__ui` select widget in Doable's chat with
 *        two options: Web Slides (HTML artifact) or PPTX (PptxGenJS code).
 *
 *   2. `ui_action(toolCallId, action, payload)` —
 *        Called by Doable when the user picks an option. Responds with the
 *        matching skill instructions (SKILL.md contents) so the Copilot LLM
 *        can proceed to generate the actual artifact.
 *
 * Session state (topic + options) is kept in an in-memory Map keyed by
 * toolCallId. For a single-user local setup this is sufficient.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function dlog(msg) {
  if (!process.env.MCP_DEBUG) return;
  console.error(`[${new Date().toISOString()}] [PB] ${msg}`);
}

// ----------------------------------------------------------------------------
// Skill loader — resolve SKILL.md files from my_skills/ in repo root
// ----------------------------------------------------------------------------
// The server may be installed as a sibling folder of `my_skills/` inside the
// Doable repo, OR provided via SKILLS_DIR env var if it's somewhere else.

function findSkillsDir() {
  if (process.env.SKILLS_DIR && existsSync(process.env.SKILLS_DIR)) {
    return process.env.SKILLS_DIR;
  }
  // Look for the `skills` folder in the same directory as this file
  const localSkills = join(__dirname, "skills");
  if (existsSync(localSkills)) return localSkills;

  // Fallback: search parent directories
  let cur = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = join(cur, "skills");
    if (existsSync(candidate)) return candidate;
    cur = resolve(cur, "..");
  }
  return null;
}

const SKILLS_DIR = findSkillsDir();

function loadSkill(name, files) {
  if (!SKILLS_DIR) {
    return `[skill "${name}" not found — set SKILLS_DIR env var to the path of my_skills/]`;
  }
  const parts = [];
  for (const f of files) {
    const p = join(SKILLS_DIR, name, f);
    if (existsSync(p)) {
      parts.push(`\n\n===== ${name}/${f} =====\n\n` + readFileSync(p, "utf8"));
    }
  }
  return parts.join("\n") || `[no files loaded for skill "${name}"]`;
}

// ----------------------------------------------------------------------------
// Session store — remember topic per toolCallId between create_presentation
// and the subsequent ui_action call.
// ----------------------------------------------------------------------------
/** @type {Map<string, { topic: string; slideCount?: number; audience?: string; tone?: string; createdAt: number }>} */
const sessions = new Map();

// Garbage-collect sessions older than 1 hour every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, s] of sessions) {
    if (s.createdAt < cutoff) sessions.delete(id);
  }
}, 10 * 60 * 1000).unref?.();

// ----------------------------------------------------------------------------
// UI payload builder
// ----------------------------------------------------------------------------
function buildSelectWidget({ topic, slideCount, audience, tone }) {
  return {
    __ui: {
      uiType: "select",
      title: `How should I build your presentation on "${topic}"?`,
      schema: {
        options: [
          {
            value: "web-slides",
            label: "🌐 Web Slides (HTML)",
            description:
              "A self-contained HTML artifact with cinematic animations, topic-matched theme, keyboard navigation. Viewable in any browser.",
          },
          {
            value: "pptx",
            label: "📊 PowerPoint (.pptx)",
            description:
              "A downloadable PowerPoint file generated with PptxGenJS. Editable in PowerPoint, Keynote, or Google Slides.",
          },
        ],
        actions: [
          { id: "proceed", label: "Generate" },
          { id: "cancel", label: "Cancel" },
        ],
      },
      state: {
        topic,
        slideCount: slideCount ?? null,
        audience: audience ?? null,
        tone: tone ?? null,
      },
    },
  };
}

// ----------------------------------------------------------------------------
// MCP server setup
// ----------------------------------------------------------------------------
const server = new Server(
  { name: "presentation-builder", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

// Shared input schema for both format-specific generators
const presentationInputSchema = {
  type: "object",
  properties: {
    topic: {
      type: "string",
      description: "The subject of the presentation (required).",
    },
    slideCount: {
      type: "number",
      description: "Approximate number of slides (default 8–12).",
    },
    audience: {
      type: "string",
      description: "Target audience — e.g. executives, students, clients.",
    },
    tone: {
      type: "string",
      description: "formal | casual | inspirational | technical | storytelling",
    },
  },
  required: ["topic"],
};

const TOOLS = [
  {
    name: "create_presentation",
    description:
      "**REQUIRED** tool for any request involving slides, a deck, a pitch, a presentation, a slideshow, or a visual report on any topic. " +
      "You MUST call this tool FIRST before writing any code or editing any files when the user asks for a presentation. " +
      "Do NOT create React components, HTML files, or PowerPoint code directly — this tool returns an interactive picker that lets the user choose between Web Slides (HTML) and PowerPoint (.pptx). " +
      "When the user clicks a choice, the matching generator tool (generate_web_slides or generate_pptx) will be invoked automatically and return the skill content for that format. " +
      "Trigger phrases: 'make slides', 'create a presentation', 'build a deck', 'pitch deck', 'slideshow', 'presentation on X', 'slides about Y'.",
    inputSchema: presentationInputSchema,
  },
  {
    name: "generate_web_slides",
    description:
      "Produces a single-file HTML presentation artifact with cinematic CSS animations, topic-matched visual theme, and keyboard navigation. " +
      "Call this when the user has explicitly chosen the Web Slides format (or said 'web slides', 'HTML slides', 'browser slides'). " +
      "Returns the complete web-slides SKILL.md with layout templates, theme palettes, and animation recipes — use that content to generate the final HTML.",
    inputSchema: presentationInputSchema,
  },
  {
    name: "generate_pptx",
    description:
      "Produces a downloadable PowerPoint (.pptx) file via PptxGenJS. " +
      "Call this when the user has explicitly chosen the PPTX format (or said 'powerpoint', 'pptx', 'microsoft powerpoint'). " +
      "Returns the pptx SKILL.md with the full PptxGenJS API reference — use that content to generate runnable JavaScript.",
    inputSchema: presentationInputSchema,
  },
  {
    name: "ui_action",
    description:
      "Internal — invoked by Doable's chat UI when the user clicks an option in the select widget returned by create_presentation. Routes the click to generate_web_slides or generate_pptx.",
    inputSchema: {
      type: "object",
      properties: {
        toolCallId: { type: "string" },
        action: { type: "string" },
        payload: { type: "object" },
      },
      required: ["toolCallId", "action"],
    },
  },
];

// ----------------------------------------------------------------------------
// Generator helpers — shared by ui_action and the two first-class tools
// ----------------------------------------------------------------------------
function buildContext({ topic, slideCount, audience, tone }) {
  return (
    `**Topic:** ${topic}` +
    (slideCount ? `\n**Slide count:** ${slideCount}` : "") +
    (audience ? `\n**Audience:** ${audience}` : "") +
    (tone ? `\n**Tone:** ${tone}` : "")
  );
}

function generateWebSlidesResult(ctx) {
  const skill = loadSkill("web-slides", [
    "SKILL.md",
    "layout-templates.md",
    "theme-palettes.md",
    "animation-recipes.md",
  ]);
  return {
    content: [
      {
        type: "text",
        text:
          `Format: **Web Slides (HTML)**\n\n${ctx}\n\n` +
          `MANDATORY OUTPUT PROTOCOL — this runs inside Doable, not an artifact host:\n` +
          `• You MUST create the file by calling the \`write_file\` tool with path=\`index.html\`.\n` +
          `• Do NOT print the HTML into chat. Do NOT wrap it in markdown. Any raw HTML in your reply will be treated as a failure.\n` +
          `• After \`write_file\` succeeds, reply with a one-line confirmation (e.g. "Deck created — open the preview.") and stop.\n` +
          `• The file must be a single self-contained HTML document (inline CSS + JS, no external assets) that follows the skill below.\n\n` +
          `---\n# Skill (for content, theme, layout, animation choices only)\n\n${skill}`,
      },
    ],
  };
}

function generatePptxResult(ctx) {
  const skill = loadSkill("pptx", ["SKILL.md", "pptxgenjs.md"]);
  return {
    content: [
      {
        type: "text",
        text:
          `Format: **PowerPoint (.pptx)**\n\n${ctx}\n\n` +
          `MANDATORY OUTPUT PROTOCOL — this runs inside Doable, not an artifact host:\n` +
          `• You MUST create the file by calling the \`write_file\` tool with path=\`generate-pptx.mjs\` (a Node script using PptxGenJS).\n` +
          `• The script must \`import PptxGenJS from "pptxgenjs"\` and end with \`await pptx.writeFile({ fileName: "<topic>.pptx" })\`.\n` +
          `• Do NOT print the JavaScript into chat. Do NOT wrap it in markdown. Any raw code in your reply will be treated as a failure.\n` +
          `• After \`write_file\` succeeds, reply with a one-line confirmation and stop.\n\n` +
          `---\n# Skill (for content, layout, typography choices only)\n\n${skill}`,
      },
    ],
  };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  dlog(`tools/call name=${name} args=${JSON.stringify(args).slice(0, 200)}`);

  if (name === "create_presentation") {
    const topic = String(args?.topic ?? "").trim();
    if (!topic) {
      return {
        isError: true,
        content: [{ type: "text", text: "Error: 'topic' is required." }],
      };
    }

    // We don't know the toolCallId yet — Doable's tool-callbacks.ts fills it
    // in before emitting the mcp_ui_open SSE event. We generate a stable key
    // from topic+timestamp so ui_action can look it up via state echo.
    const sessionKey = `pres_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    sessions.set(sessionKey, {
      topic,
      slideCount: args?.slideCount,
      audience: args?.audience,
      tone: args?.tone,
      createdAt: Date.now(),
    });

    const widget = buildSelectWidget({
      topic,
      slideCount: args?.slideCount,
      audience: args?.audience,
      tone: args?.tone,
    });

    // Embed sessionKey so we can recover context in ui_action
    widget.__ui.state.__sessionKey = sessionKey;

    // Return the __ui envelope as the ONLY text content. Doable's
    // extractUiPayload does a JSON.parse on the full text, so it must be
    // pure JSON. The _llm field instructs the model to stop and wait.
    const envelope = {
      ...widget,
      _llm:
        "STOP. An interactive picker has been shown to the user. Do NOT call any other tools, " +
        "do NOT create any files, do NOT write any code. Respond with a single short sentence " +
        "like 'Please pick a format above.' and then wait. The `ui_action` tool will be invoked " +
        "automatically when the user clicks an option — it will return the full instructions " +
        "for the chosen format at that point.",
    };

    const respText = JSON.stringify(envelope);
    dlog(`create_presentation -> ${respText.length} bytes, starts with: ${respText.slice(0, 120)}`);
    return {
      content: [{ type: "text", text: respText }],
    };
  }

  if (name === "ui_action") {
    const action = String(args?.action ?? "");
    const payload = args?.payload ?? {};
    const selected = String(payload.selected ?? "");
    const sessionKey = String(payload.__sessionKey ?? "");

    if (action === "cancel") {
      return {
        content: [{ type: "text", text: "Presentation build cancelled by user." }],
      };
    }

    if (action !== "proceed") {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown action: ${action}` }],
      };
    }

    // Recover session — fall back to the most recent one if no key
    let session = sessionKey ? sessions.get(sessionKey) : null;
    if (!session) {
      const all = [...sessions.values()].sort((a, b) => b.createdAt - a.createdAt);
      session = all[0];
    }
    const topic = session?.topic ?? "(topic unknown — ask the user)";
    const slideCount = session?.slideCount;
    const audience = session?.audience;
    const tone = session?.tone;

    const ctx = buildContext({ topic, slideCount, audience, tone });

    if (selected === "web-slides") {
      dlog(`ui_action -> routing click to generate_web_slides`);
      return generateWebSlidesResult(ctx);
    }
    if (selected === "pptx") {
      dlog(`ui_action -> routing click to generate_pptx`);
      return generatePptxResult(ctx);
    }
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Unknown selection: "${selected}". Expected "web-slides" or "pptx".`,
        },
      ],
    };
  }

  if (name === "generate_web_slides") {
    const topic = String(args?.topic ?? "").trim();
    if (!topic) {
      return { isError: true, content: [{ type: "text", text: "Error: 'topic' is required." }] };
    }
    const ctx = buildContext({
      topic,
      slideCount: args?.slideCount,
      audience: args?.audience,
      tone: args?.tone,
    });
    return generateWebSlidesResult(ctx);
  }

  if (name === "generate_pptx") {
    const topic = String(args?.topic ?? "").trim();
    if (!topic) {
      return { isError: true, content: [{ type: "text", text: "Error: 'topic' is required." }] };
    }
    const ctx = buildContext({
      topic,
      slideCount: args?.slideCount,
      audience: args?.audience,
      tone: args?.tone,
    });
    return generatePptxResult(ctx);
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
  };
});

// ----------------------------------------------------------------------------
// Start
// ----------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
dlog(`MCP server started. skills_dir=${SKILLS_DIR ?? "(unset)"}`);
