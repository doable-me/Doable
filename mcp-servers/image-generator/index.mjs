#!/usr/bin/env node
/**
 * Image Generator — a Doable built-in MCP App.
 * --------------------------------------------------------
 * Standards-compliant per modelcontextprotocol.io/extensions/apps:
 * the tool returns a UIResource card rendered as a sandboxed iframe by the
 * Doable host (and any other MCP-Apps-compatible host).
 *
 *   `generate_image({ prompt, aspect_ratio? })`
 *      Calls the provider, then returns:
 *        - text:  JSON { status, asset_id, image_url, model, prompt }
 *        - image: raw base64 bytes — the host persists these into the project
 *                 at public/generated/<asset_id>.png, so the agent can embed
 *                 `<img src="/generated/….png" />` and it renders in the live
 *                 preview immediately (and survives deploy).
 *                 See services/api/src/mcp/generated-image-persist.ts.
 *        - a UI card with an inline preview + PNG download.
 *
 * MODEL — single, fixed, set in code (below). There is deliberately NO model
 * picker and NO per-project/workspace/user selection yet. To switch models,
 * edit the MODEL const and set the matching key in the API's .env.
 *
 * KEY — read from the process env. The host does NOT leak its full env into MCP
 * subprocesses (see services/api/src/mcp/transport-stdio.ts); it forwards only
 * the allowlisted image keys declared by this builtin in builtin-connectors.ts.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createUIResource } from "@mcp-ui/server";

import { previewDownloadCardHtml, escapeHtml } from "../_shared/ui.mjs";

function dlog(msg) {
  if (!process.env.MCP_DEBUG) return;
  console.error(`[${new Date().toISOString()}] [IMG] ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────
// ★ THE MODEL — the one and only. Change this object to switch models.
//
//   provider : "replicate" | "openai" | "gemini"  (adapters below)
//   ref      : provider's model identifier
//   envKey   : env var holding the API key — set this in the API's .env
//
// Imagen is a PAID model — a Google account with no billing credit returns
// HTTP 429 RESOURCE_EXHAUSTED ("prepayment credits are depleted") for every
// image model, Imagen and gemini-*-flash-image alike.
//
// Alternatives, ready to drop in:
//   { label: "Flux Schnell", provider: "replicate",
//     ref: "black-forest-labs/flux-schnell", envKey: "REPLICATE_API_TOKEN" }
//   { label: "GPT Image 1",  provider: "openai", ref: "gpt-image-1",
//     envKey: "OPENAI_API_KEY" }
// ─────────────────────────────────────────────────────────────────────────
const MODEL = {
  label: "Imagen 4",
  provider: "gemini",
  ref: "imagen-4.0-generate-001",
  envKey: "GEMINI_API_KEY",
};

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];

// ─────────────────────────────────────────────────────────────────────────
// Provider adapters — each returns { bytes: Buffer, mimeType: string }
// ─────────────────────────────────────────────────────────────────────────

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Replicate. `Prefer: wait` blocks until the prediction finishes, which avoids a
 * polling loop for the common case; we still poll as a fallback for models that
 * exceed the sync window.
 */
async function generateReplicate({ prompt, aspectRatio, apiKey }) {
  const input = { prompt };
  if (MODEL.ref.startsWith("black-forest-labs/")) input.aspect_ratio = aspectRatio;

  const res = await fetch(
    `https://api.replicate.com/v1/models/${MODEL.ref}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({ input }),
    },
  );
  if (!res.ok) {
    throw new Error(`Replicate error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  let pred = await res.json();

  const deadline = Date.now() + 120_000;
  while (
    (pred.status === "starting" || pred.status === "processing")
    && Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!poll.ok) throw new Error(`Replicate poll failed: HTTP ${poll.status}`);
    pred = await poll.json();
  }

  if (pred.status !== "succeeded") {
    throw new Error(`Replicate ${pred.status}: ${pred.error ?? "no output"}`);
  }

  const url = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (typeof url !== "string") throw new Error("Replicate returned no image URL.");
  return { bytes: await fetchBytes(url), mimeType: "image/png" };
}

/** OpenAI — returns base64 inline, no polling. */
async function generateOpenAI({ prompt, aspectRatio, apiKey }) {
  const size =
    aspectRatio === "16:9" ? "1536x1024"
    : aspectRatio === "9:16" ? "1024x1536"
    : "1024x1024";

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL.ref, prompt, size, n: 1 }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data.");
  return { bytes: Buffer.from(b64, "base64"), mimeType: "image/png" };
}

/** Google Imagen — returns base64 inline, no polling. */
async function generateGemini({ prompt, aspectRatio, apiKey }) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL.ref}:predict`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("Gemini returned no image data.");
  return { bytes: Buffer.from(b64, "base64"), mimeType: "image/png" };
}

const PROVIDERS = {
  replicate: generateReplicate,
  openai: generateOpenAI,
  gemini: generateGemini,
};

// ─────────────────────────────────────────────────────────────────────────
// Asset ids — [A-Za-z0-9_] only. The host re-validates this shape before
// writing to public/generated/, so a crafted id can never traverse out.
// ─────────────────────────────────────────────────────────────────────────
function newAssetId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Tool definition
// ─────────────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "generate_image",
    description:
      "★ Generates an image from a text prompt. REQUIRED whenever the user asks for an image, "
      + "picture, photo, illustration, icon, logo, hero image, or artwork — including \"generate "
      + "an image of a dog\" or \"add a picture of X to the page\". Returns JSON with `image_url`, "
      + "a project-relative path like /generated/img_123_ab.png. The host has ALREADY written the "
      + "file into the project's public/ directory, so that URL works immediately in the live "
      + "preview and after deploy. To SHOW the image in the app, embed image_url directly and "
      + "verbatim: <img src=\"/generated/img_123_ab.png\" />. Do NOT fetch the URL, do NOT inline "
      + "base64, and do NOT call write_file/create_file to save the image — it is already on disk. "
      + "If image_url is null, saving failed: say so and do not embed anything.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "What to depict. Pass the user's description enriched with useful visual detail "
            + "(subject, setting, lighting, style) — a richer prompt yields a better image.",
        },
        aspect_ratio: {
          type: "string",
          enum: ASPECT_RATIOS,
          description: "Image shape. Default 1:1. Use 16:9 for hero/banner images.",
        },
      },
      required: ["prompt"],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "image-generator", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  dlog(`tools/call ${name}`);

  if (name !== "generate_image") {
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  }

  const prompt = String(args?.prompt ?? "").trim();
  const aspectRatio = ASPECT_RATIOS.includes(args?.aspect_ratio) ? args.aspect_ratio : "1:1";

  if (!prompt) {
    return { isError: true, content: [{ type: "text", text: "Error: 'prompt' is required." }] };
  }

  const apiKey = process.env[MODEL.envKey];
  if (!apiKey) {
    return {
      isError: true,
      content: [{
        type: "text",
        text:
          `Image generation is not configured: ${MODEL.envKey} is not set. Add it to the API's `
          + `.env and restart the API. Tell the user this — do not retry.`,
      }],
    };
  }

  let bytes, mimeType;
  try {
    ({ bytes, mimeType } = await PROVIDERS[MODEL.provider]({ prompt, aspectRatio, apiKey }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dlog(`generation failed: ${msg}`);
    return {
      isError: true,
      content: [{ type: "text", text: `Image generation failed (${MODEL.label}): ${msg}` }],
    };
  }

  const assetId = newAssetId();
  const base64 = bytes.toString("base64");
  const fileName = `${assetId}.png`;

  // The host writes these bytes to <project>/public/generated/<assetId>.png and
  // serves them at this path. See services/api/src/mcp/generated-image-persist.ts.
  const imageUrl = `/generated/${fileName}`;

  const card = previewDownloadCardHtml({
    title: prompt.length > 60 ? `${prompt.slice(0, 57)}…` : prompt,
    subtitle: `${MODEL.label} · ${aspectRatio} · ${(bytes.length / 1024).toFixed(0)} KB`,
    previewKind: "html",
    previewHtml:
      `<div style="display:flex;justify-content:center;align-items:center;">`
      + `<img src="data:${mimeType};base64,${base64}" alt="${escapeHtml(prompt)}" `
      + `style="max-width:100%;max-height:220px;border-radius:10px;display:block;" /></div>`,
    iconEmoji: "🎨",
    hint: `Generated with ${MODEL.label} · saved to your project at ${imageUrl}`,
    downloads: [
      { label: "📥 Download .png", fileName, mimeType, base64, sizeBytes: bytes.length },
    ],
    accent: { primary: "#6d28d9", primaryHover: "#5b21b6", secondary: "#6d28d9", secondaryHover: "#5b21b6" },
  });

  const ui = createUIResource({
    uri: `ui://image-generator/result/${assetId}`,
    content: { type: "rawHtml", htmlString: card },
    encoding: "text",
  });

  return {
    content: [
      // The host reads this JSON to persist the asset; the agent reads image_url from it.
      {
        type: "text",
        text: JSON.stringify({
          status: "completed",
          asset_id: assetId,
          image_url: imageUrl,
          model: MODEL.ref,
          prompt,
          aspect_ratio: aspectRatio,
        }),
      },
      // The bytes the host persists into public/generated/. `formatMcpContent`
      // collapses this to "[Image: image/png]" for the LLM, so no base64 is ever
      // fed to the model.
      { type: "image", data: base64, mimeType },
      ui,
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
dlog("MCP server started.");
