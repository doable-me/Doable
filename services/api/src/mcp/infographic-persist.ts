import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getProjectPath } from "../ai/project-files.js";
import type { McpContent } from "./types.js";

// Raw MCP tool names whose completed results carry an infographic image.
const INFOGRAPHIC_TOOLS = new Set(["generate_infographic", "check_infographic_status"]);

// job_ids are `job_<ts>_<rand>` — strictly [A-Za-z0-9_]. Reject anything else so
// a crafted job_id can never escape the project's public/ dir via path traversal.
const SAFE_JOB_ID = /^[A-Za-z0-9_]+$/;

function log(msg: string): void {
  console.log(`[infographic-persist] ${msg}`);
}

/**
 * Persist a completed NotebookLM infographic INTO the project that's using it.
 *
 * The MCP server hands back `image_url = http://localhost:3001/infographic-image/<jobId>`.
 * That URL is a dead end for a generated app: it's unreachable once the app is
 * deployed (visitor's browser resolves localhost to their own machine, and an
 * HTTPS page can't load http://localhost — mixed content), and the server deletes
 * the underlying file on a 10-minute TTL. Result: the infographic shows in the
 * on-box preview but vanishes after deploy, and disappears entirely within minutes.
 *
 * We instead write the image bytes into the project at `public/infographics/<jobId>.jpg`
 * and rewrite `image_url` to the project-relative `/infographics/<jobId>.jpg` before
 * the build agent ever sees the result. Vite serves `public/` at the web root in
 * preview (`vite dev`) AND copies it into `dist/` on deploy (`vite build`), so the
 * asset ships with the app and renders identically in both — no server, no cookies,
 * no expiry, and no giant base64 string for the agent to transcribe.
 *
 * Best-effort: any failure returns the original content unchanged so the tool call
 * never breaks because of asset persistence.
 *
 * @returns the content array to forward to the agent (rewritten, or the original).
 */
export async function persistInfographicAsset(
  projectId: string,
  toolName: string,
  content: McpContent[],
): Promise<McpContent[]> {
  try {
    if (!INFOGRAPHIC_TOOLS.has(toolName) || !Array.isArray(content)) return content;

    // The completed-job JSON lives in the first text part.
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

    const jobId = typeof payload.job_id === "string" ? payload.job_id : null;
    const imageUrl = typeof payload.image_url === "string" ? payload.image_url : null;
    if (!jobId || !imageUrl) return content; // still processing / no image yet
    if (imageUrl.startsWith("/")) return content; // already project-relative
    if (!SAFE_JOB_ID.test(jobId)) {
      log(`refusing unsafe job_id: ${jobId}`);
      return content;
    }

    // Prefer the base64 bytes already in the result (no re-download); otherwise
    // fetch the image_url the server gave us — it's a same-machine localhost URL.
    const imagePart = content.find(
      (c): c is { type: "image"; data: string; mimeType: string } => c.type === "image",
    );

    let bytes: Buffer | null = null;
    if (imagePart?.data) {
      bytes = Buffer.from(imagePart.data, "base64");
    } else {
      try {
        const res = await fetch(imageUrl);
        if (res.ok) bytes = Buffer.from(await res.arrayBuffer());
        else log(`fetch ${imageUrl} -> HTTP ${res.status}`);
      } catch (e) {
        log(`fetch ${imageUrl} failed: ${(e as Error).message}`);
      }
    }
    if (!bytes || bytes.length === 0) return content;

    const relPath = `infographics/${jobId}.jpg`;
    const publicDir = path.join(getProjectPath(projectId), "public");
    const destFile = path.join(publicDir, relPath);
    await mkdir(path.dirname(destFile), { recursive: true });
    await writeFile(destFile, bytes);
    log(`saved ${bytes.length}B -> ${destFile} (project ${projectId})`);

    // Rewrite image_url to a RELATIVE project path (no leading slash) so the agent
    // embeds `<img src="infographics/<jobId>.jpg">`. Relative resolves correctly in
    // BOTH the editor preview (served under /preview/<projectId>/, where a leading
    // slash would hit the auth-gated api root and 401) AND on deploy (app root).
    payload.image_url = relPath;
    const rewritten = content.slice();
    rewritten[textIdx] = { type: "text", text: JSON.stringify(payload) };
    return rewritten;
  } catch (e) {
    log(`unexpected error (leaving result unchanged): ${(e as Error).message}`);
    return content;
  }
}
