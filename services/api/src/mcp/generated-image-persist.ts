import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getProjectPath } from "../ai/project-files.js";
import type { McpContent } from "./types.js";

// Raw MCP tool names whose results carry a freshly generated image.
const IMAGE_GEN_TOOLS = new Set(["generate_image"]);

// asset_ids are `img_<ts>_<rand>` — strictly [A-Za-z0-9_]. Reject anything else so
// a crafted asset_id can never escape the project's public/ dir via path traversal.
const SAFE_ASSET_ID = /^[A-Za-z0-9_]+$/;

function log(msg: string): void {
  console.log(`[generated-image-persist] ${msg}`);
}

/**
 * Persist a generated image INTO the project that asked for it.
 *
 * This is the sibling of infographic-persist.ts, kept separate on purpose: that
 * module's `public/infographics/<jobId>.jpg` path is a public contract with app
 * code the agent has already written into existing projects, so it must not move.
 *
 * The image-generator MCP server hands back raw bytes plus a promised path,
 * `image_url = /generated/<asset_id>.png`. We write the bytes to exactly that path
 * under the project's `public/` dir. Vite serves `public/` at the web root in
 * preview (`vite dev`) AND copies it into `dist/` on deploy (`vite build`), so
 * `<img src="/generated/img_123_ab.png" />` renders in the live preview the moment
 * the agent writes it, and still works after deploy — no server, no expiry, and no
 * giant base64 string for the agent to transcribe.
 *
 * If persistence fails we blank `image_url` so the agent can't embed a path that
 * would 404. The tool call itself still succeeds — the user keeps the preview card
 * and the download button.
 *
 * @returns the content array to forward to the agent (rewritten, or the original).
 */
export async function persistGeneratedImageAsset(
  projectId: string,
  toolName: string,
  content: McpContent[],
): Promise<McpContent[]> {
  try {
    if (!IMAGE_GEN_TOOLS.has(toolName) || !Array.isArray(content)) return content;

    // The result JSON lives in the first text part.
    const textIdx = content.findIndex(
      (c): c is { type: "text"; text: string } =>
        c.type === "text" && typeof (c as { text?: unknown }).text === "string",
    );
    if (textIdx === -1) return content;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse((content[textIdx] as { text: string }).text);
    } catch {
      return content; // not JSON (e.g. an error string) — nothing to persist
    }
    if (!payload || payload.status !== "completed") return content;

    const assetId = typeof payload.asset_id === "string" ? payload.asset_id : null;
    if (!assetId) return content;
    if (!SAFE_ASSET_ID.test(assetId)) {
      log(`refusing unsafe asset_id: ${assetId}`);
      return blankImageUrl(content, textIdx, payload);
    }

    const imagePart = content.find(
      (c): c is { type: "image"; data: string; mimeType: string } => c.type === "image",
    );
    if (!imagePart?.data) {
      log(`no image bytes in result for ${assetId}`);
      return blankImageUrl(content, textIdx, payload);
    }

    const bytes = Buffer.from(imagePart.data, "base64");
    if (bytes.length === 0) return blankImageUrl(content, textIdx, payload);

    const relPath = `generated/${assetId}.png`;
    const destFile = path.join(getProjectPath(projectId), "public", relPath);
    await mkdir(path.dirname(destFile), { recursive: true });
    await writeFile(destFile, bytes);
    log(`saved ${bytes.length}B -> ${destFile} (project ${projectId})`);

    // The server already set image_url to `/generated/<assetId>.png` — the file now
    // exists at exactly that path, so the content passes through unchanged.
    return content;
  } catch (e) {
    log(`unexpected error: ${(e as Error).message}`);
    return content;
  }
}

/**
 * Persistence failed — null out `image_url` so the agent embeds nothing rather than
 * a path that 404s in the preview.
 */
function blankImageUrl(
  content: McpContent[],
  textIdx: number,
  payload: Record<string, unknown>,
): McpContent[] {
  payload.image_url = null;
  payload.error = "Image could not be saved into the project; do not embed it in the app.";
  const rewritten = content.slice();
  rewritten[textIdx] = { type: "text", text: JSON.stringify(payload) };
  return rewritten;
}
