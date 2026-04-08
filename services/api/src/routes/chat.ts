import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import {
  getCopilotEngine,
  createDoableTools,
  createAllTools,
  onToolEvent,
  type ByokProviderConfig,
  type CopilotEngine,
} from "../ai/providers/copilot.js";
import { getCopilotManager } from "../ai/providers/copilot-manager.js";
import { createUsageCollector } from "../ai/usage-collector.js";
import { aiSettingsQueries, shareTrackingQueries } from "@doable/db";
import {
  createProject,
  isProjectScaffolded,
  getProjectPath,
  readFile,
  listFiles,
} from "../projects/file-manager.js";
import {
  startDevServer,
  isRunning as isDevServerRunning,
  getDevServerUrl,
  getDevServerInternalUrl,
} from "../projects/dev-server.js";
import { autoVersion } from "../version-control/manager.js";
import { isGitRepo } from "../git/init.js";
import { autoCommit } from "../git/commits.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { contextManager } from "../context/manager.js";
import { buildContextPrompt } from "../context/injector.js";
import { broadcastToRoom } from "../ai/yjs-bridge.js";
import { processAttachments } from "../ai/attachments.js";
import { bodyLimit } from "hono/body-limit";
import { environmentQueries, skillsQueries, marketplaceQueries } from "@doable/db";

export const chatRoutes = new Hono<AuthEnv>();
const aiSettingsDb = aiSettingsQueries(sql, process.env.ENCRYPTION_KEY);
const shareTrackingDb = shareTrackingQueries(sql);
const ctxManager = contextManager(sql);
const envDb = environmentQueries(sql);
const skillsDb = skillsQueries(sql);
const mktDb = marketplaceQueries(sql);

// Require authentication for all chat and AI routes
chatRoutes.use("/projects/:id/chat", authMiddleware);
chatRoutes.use("/projects/:id/chat/*", authMiddleware);
chatRoutes.use("/ai/*", authMiddleware);

// Auto-join: when a user accesses chat, add as collaborator ONLY if link sharing enabled
chatRoutes.use("/projects/:id/chat", async (c, next) => {
  const projectId = c.req.param("id");
  const userId = c.get("userId");
  if (projectId && userId) {
    try {
      const [project] = await sql`SELECT visibility, workspace_id FROM projects WHERE id = ${projectId}`;
      if (project?.visibility === 'public') {
        await sql`
          INSERT INTO project_collaborators (project_id, user_id, role)
          VALUES (${projectId}, ${userId}, 'editor')
          ON CONFLICT DO NOTHING
        `;
        // Track this visit for "Shared with me" and share analytics
        // (only if visitor is not a workspace member — the query handles dedup)
        const [isMember] = await sql`
          SELECT 1 FROM workspace_members
          WHERE workspace_id = ${project.workspace_id} AND user_id = ${userId}
        `;
        if (!isMember) {
          await shareTrackingDb.recordVisit(projectId, userId);
          // Also increment the public_projects view counter
          await sql`
            UPDATE public_projects SET view_count = view_count + 1
            WHERE project_id = ${projectId}
          `;
        }
      }
    } catch { /* non-critical */ }
  }
  await next();
});

// ─── AI provider resolution ─────────────────────────────

/**
 * Resolve which AI engine, model, and provider to use for a request.
 *
 * Priority chain:
 *   1. Admin enforcement — workspace_ai_settings.enforce_ai = true
 *   2. Explicit request params — copilotAccountId / providerId / model from body
 *   3. User preferences — from user_ai_preferences table
 *   4. Workspace defaults — from workspace_ai_settings
 *   5. System default — gh CLI auth (no token)
 */
async function resolveAiEngine(
  projectId: string,
  userId: string,
  overrides: {
    copilotAccountId?: string;
    providerId?: string;
    provider?: ByokProviderConfig;
    model?: string;
  },
): Promise<{
  model?: string;
  provider?: ByokProviderConfig;
  githubToken?: string;
}> {
  let resolvedProvider: ByokProviderConfig | undefined = overrides.provider;
  let resolvedModel: string | undefined = overrides.model;
  let githubToken: string | undefined;

  // Track whether we picked a copilot account / provider through any tier
  let selectedCopilotAccountId: string | undefined = overrides.copilotAccountId;
  let selectedProviderId: string | undefined = overrides.providerId;

  try {
    // Look up the project's workspace
    const [project] = await sql`SELECT workspace_id FROM projects WHERE id = ${projectId}`;
    if (project?.workspace_id) {
      const config = await aiSettingsDb.getEffectiveAiConfig(project.workspace_id, userId);

      if (config) {
        // ── Tier 1: Admin enforcement ──
        if (config.enforce_ai) {
          selectedCopilotAccountId = config.enforced_copilot_account_id ?? undefined;
          selectedProviderId = config.enforced_provider_id ?? undefined;
          resolvedModel = config.enforced_model ?? resolvedModel;
          // Enforcement overrides any request-level provider/copilot values
          resolvedProvider = undefined;
        } else if (!selectedCopilotAccountId && !selectedProviderId && !resolvedProvider) {
          // No enforcement and no explicit overrides — walk down the chain.
          //
          // IMPORTANT: With migration 042, both copilot AND custom configs
          // can be persisted simultaneously. The active side is determined
          // by the explicit `*_source` column — never by "which id is set".
          // Pick exactly one side based on source so the inactive side is
          // ignored even when it has a value.

          // ── Tier 3: User preferences ──
          // A user override is "active" if the row exists and the side
          // selected by `user_source` actually has a value to use.
          const hasUserOverride =
            (config.user_source === "copilot" && config.user_copilot_account_id) ||
            (config.user_source === "custom" && config.user_provider_id);

          if (hasUserOverride) {
            if (config.user_source === "custom") {
              selectedProviderId = config.user_provider_id ?? undefined;
              if (!resolvedModel && config.user_provider_model) {
                resolvedModel = config.user_provider_model;
              }
            } else {
              selectedCopilotAccountId = config.user_copilot_account_id ?? undefined;
              if (!resolvedModel && config.user_copilot_model) {
                resolvedModel = config.user_copilot_model;
              }
            }
          }
          // ── Tier 4: Workspace defaults ──
          else {
            if (config.default_source === "custom") {
              selectedProviderId = config.default_provider_id ?? undefined;
              if (!resolvedModel && config.default_provider_model) {
                resolvedModel = config.default_provider_model;
              }
            } else {
              selectedCopilotAccountId = config.default_copilot_account_id ?? undefined;
              if (!resolvedModel && config.default_copilot_model) {
                resolvedModel = config.default_copilot_model;
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[Chat] Failed to resolve workspace/user AI config:", err);
  }

  // ── Decrypt selected provider key ──
  if (selectedProviderId && !resolvedProvider) {
    try {
      const providerData = await aiSettingsDb.getProviderWithKey(selectedProviderId);
      if (providerData) {
        resolvedProvider = {
          type: providerData.row.provider_type as "openai" | "azure" | "anthropic",
          baseUrl: providerData.row.base_url,
          apiKey: providerData.apiKey ?? undefined,
          bearerToken: providerData.bearerToken ?? undefined,
          ...(providerData.row.wire_api ? { wireApi: providerData.row.wire_api as "completions" | "responses" } : {}),
          ...(providerData.row.azure_api_version
            ? { azure: { apiVersion: providerData.row.azure_api_version } }
            : {}),
        };
      }
    } catch (err) {
      console.error("[Chat] Failed to decrypt provider key:", err);
    }
  }

  // ── Decrypt selected copilot account token ──
  if (selectedCopilotAccountId) {
    try {
      githubToken = (await aiSettingsDb.getCopilotAccountToken(selectedCopilotAccountId)) ?? undefined;
    } catch (err) {
      console.error("[Chat] Failed to decrypt copilot account token:", err);
    }
  }

  return { model: resolvedModel, provider: resolvedProvider, githubToken };
}

// ─── Helpers: project context & error detection ─────────

/**
 * Build a context string describing the project's current files and
 * installed packages. Injected into the system prompt so the AI
 * knows what already exists before it starts generating code.
 */
async function buildProjectContext(projectId: string): Promise<string> {
  let context = "";

  // ── .doable/ context files (always load, even before scaffold) ──
  try {
    const contextFiles = await ctxManager.initializeContext(projectId);
    if (contextFiles.length > 0) {
      // Build the context prompt using the injector (mode defaults to agent)
      const contextPrompt = buildContextPrompt(contextFiles, "agent");
      if (contextPrompt) {
        context += `\n\n${contextPrompt}`;
      }
    }
  } catch (err) {
    console.warn("[Chat] Failed to load .doable/ context files:", err);
  }

  // ── File listing and package info ──
  if (!isProjectScaffolded(projectId)) return context;

  try {
    const [files, pkgContent] = await Promise.all([
      listFiles(projectId).catch(() => [] as string[]),
      readFile(projectId, "package.json").catch(() => ""),
    ]);

    if (files.length > 0) {
      context += `\n\nCurrent project files:\n${files.join("\n")}`;
    }

    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        const deps = Object.keys(pkg.dependencies || {});
        const devDeps = Object.keys(pkg.devDependencies || {});
        context += `\n\nInstalled dependencies: ${deps.join(", ") || "(none)"}`;
        context += `\nInstalled devDependencies: ${devDeps.join(", ") || "(none)"}`;
      } catch { /* ignore parse errors */ }
    }

    return context;
  } catch {
    return context;
  }
}

/**
 * Build project context with mode-specific injection.
 * Uses the context injector to select the right files per mode.
 */
async function buildProjectContextForMode(
  projectId: string,
  mode: "agent" | "plan" | "chat" | "visual-edit",
  workspaceId?: string,
  userId?: string,
): Promise<string> {
  let context = "";

  // Map visual-edit to agent mode for context purposes
  const contextMode = mode === "visual-edit" ? "agent" : mode;

  // ── .doable/ context files (multi-scope if workspace/user available) ──
  try {
    if (workspaceId && userId) {
      // Multi-scope: workspace > project > user
      const contextPrompt = await ctxManager.resolveEffectiveContext(
        workspaceId, projectId, userId, contextMode,
      );
      if (contextPrompt) {
        context += `\n\n${contextPrompt}`;
      }
    } else {
      // Fallback: project-scoped only
      const contextFiles = await ctxManager.initializeContext(projectId);
      if (contextFiles.length > 0) {
        const contextPrompt = buildContextPrompt(contextFiles, contextMode);
        if (contextPrompt) {
          context += `\n\n${contextPrompt}`;
        }
      }
    }
  } catch (err) {
    console.warn("[Chat] Failed to load .doable/ context files:", err);
  }

  // ── Skills, Rules, Knowledge & Instructions from effective environment ──
  if (workspaceId) {
    try {
      // Resolve: project env > workspace default env > all workspace items
      const { environment, source } = await mktDb.resolveEffectiveEnvironment(
        workspaceId,
        // projectId is always available in this function
        projectId,
      );

      let skills: { skill_name: string; skill_content: string }[] = [];
      let rules: { rule_name: string; content: string }[] = [];
      let instructions: { filename: string; content: string }[] = [];

      if (environment) {
        // Custom environment (from project or workspace level)
        skills = environment.skills;
        rules = environment.rules;
        // Knowledge is already loaded via resolveEffectiveContext above (multi-scope merged)
        instructions = environment.instructions;
      } else {
        // No custom default — use all workspace-level skills & rules
        const items = await envDb.getDefaultItems(workspaceId);
        skills = items.skills;
        rules = items.rules;
        // No instructions for virtual default
      }

      if (skills.length > 0) {
        context += `\n\n<skills>\n${skills.map((s) => `<skill name="${s.skill_name}">\n${s.skill_content}\n</skill>`).join("\n")}\n</skills>`;
      }
      if (rules.length > 0) {
        context += `\n\n<rules>\n${rules.map((r) => `<rule name="${r.rule_name}">\n${r.content}\n</rule>`).join("\n")}\n</rules>`;
      }
      if (instructions.length > 0) {
        context += `\n\n<environment-instructions>\n${instructions.map((i) => `<instruction file="${i.filename}">\n${i.content}\n</instruction>`).join("\n")}\n</environment-instructions>`;
      }
    } catch (err) {
      console.warn("[Chat] Failed to load environment skills/rules:", err);
    }
  }

  // ── Connected integrations manifest (vault-bridge) ──
  if (workspaceId && userId) {
    try {
      const { buildConnectedIntegrationsContext } = await import("../integrations/prompt-manifest.js");
      const block = await buildConnectedIntegrationsContext(projectId, workspaceId, userId);
      if (block) context += `\n\n${block}`;
    } catch (err) {
      console.warn("[Chat] integrations manifest failed:", err);
    }
  }

  // ── File listing and package info ──
  if (!isProjectScaffolded(projectId)) return context;

  try {
    const [files, pkgContent] = await Promise.all([
      listFiles(projectId).catch(() => [] as string[]),
      readFile(projectId, "package.json").catch(() => ""),
    ]);

    if (files.length > 0) {
      context += `\n\nCurrent project files:\n${files.join("\n")}`;
    }

    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        const deps = Object.keys(pkg.dependencies || {});
        const devDeps = Object.keys(pkg.devDependencies || {});
        context += `\n\nInstalled dependencies: ${deps.join(", ") || "(none)"}`;
        context += `\nInstalled devDependencies: ${devDeps.join(", ") || "(none)"}`;
      } catch { /* ignore parse errors */ }
    }

    return context;
  } catch {
    return context;
  }
}

/**
 * Extract a plan from the AI's response text.
 * Looks for markdown plan structure and wraps it appropriately.
 */
function extractPlanFromResponse(text: string): string | null {
  // Look for a markdown plan header
  const planHeaderPattern = /^#\s+Plan/m;
  if (planHeaderPattern.test(text)) {
    const match = text.match(planHeaderPattern);
    if (match?.index !== undefined) {
      return text.slice(match.index).trim();
    }
  }

  // If the response looks like a structured plan, wrap it
  if (
    text.includes("##") &&
    (text.includes("Step") || text.includes("Task") || text.includes("Phase"))
  ) {
    return `# Plan\n\n${text.trim()}`;
  }

  // Fallback: if substantial text, treat it all as a plan
  if (text.trim().length > 200) {
    return `# Plan\n\n${text.trim()}`;
  }

  return null;
}

/** Structured error info returned by detectPreviewError */
interface PreviewErrorInfo {
  /** Human-readable error summary */
  message: string;
  /** The source of the error (file path or "preview page") */
  source: string;
  /** Raw error text (trimmed) */
  raw: string;
}

/**
 * Detect if HTML contains Vite's error overlay markup.
 * Returns the extracted error message or null.
 */
function extractViteErrorOverlay(html: string): string | null {
  // Vite injects a custom element <vite-error-overlay> or a <pre class="message">
  if (
    html.includes("vite-error-overlay") ||
    html.includes('pre class="message"') ||
    html.includes("Internal Server Error") ||
    html.includes("504 (Outdated Optimize Dep)")
  ) {
    // Try to extract the error message from the overlay
    const preMatch = html.match(/<pre[^>]*class="message"[^>]*>([\s\S]*?)<\/pre>/);
    if (preMatch) return preMatch[1]!.trim().slice(0, 800);

    // Try extracting from err-message or similar divs
    const errMatch = html.match(/class="err-message"[^>]*>([\s\S]*?)<\//);
    if (errMatch) return errMatch[1]!.trim().slice(0, 800);

    // Fallback: strip tags and return a portion
    const clean = html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 800);
    return clean;
  }
  return null;
}

/**
 * Check whether the Vite dev server can successfully transform
 * the project's key source files AND whether the preview page
 * shows Vite's error overlay. Returns structured error info if
 * something is broken, or null if everything is OK.
 */
async function detectPreviewError(projectId: string): Promise<PreviewErrorInfo | null> {
  try {
    const internalUrl = getDevServerInternalUrl(projectId);
    if (!internalUrl) return null;

    const base = `${internalUrl}/preview/${projectId}`;

    // 1. Check key entry-point modules — Vite returns 500 when transform fails.
    //    Only check files that actually exist in the project to avoid false
    //    positives (e.g. reporting src/index.tsx as broken when the real
    //    entry point is src/main.tsx).
    const CANDIDATE_FILES = ["src/main.tsx", "src/App.tsx", "index.html", "src/index.tsx", "src/main.ts"];
    const projectFiles = await listFiles(projectId).catch(() => [] as string[]);
    const projectFileSet = new Set(projectFiles.map((f) => f.replace(/\\/g, "/")));
    const filesToCheck = CANDIDATE_FILES.filter((f) => projectFileSet.has(f));

    for (const file of filesToCheck) {
      try {
        const headers: Record<string, string> =
          file === "index.html"
            ? { Accept: "text/html" }
            : { Accept: "application/javascript" };
        const res = await fetch(`${base}/${file}`, { headers, signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
          const body = await res.text();
          const clean = body
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 800);
          return {
            message: `Error in ${file}: ${clean}`,
            source: file,
            raw: clean,
          };
        }
      } catch {
        // Network error — dev server might be restarting, not a code error
      }
    }

    // 2. Fetch the root preview page and check for Vite error overlay
    try {
      const pageRes = await fetch(`${base}/`, {
        headers: { Accept: "text/html" },
        signal: AbortSignal.timeout(5000),
      });
      if (pageRes.ok) {
        const pageHtml = await pageRes.text();
        const overlayError = extractViteErrorOverlay(pageHtml);
        if (overlayError) {
          return {
            message: `Preview page shows error overlay: ${overlayError}`,
            source: "preview page",
            raw: overlayError,
          };
        }
      } else {
        const body = await pageRes.text();
        const clean = body
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 800);
        return {
          message: `Preview page returned ${pageRes.status}: ${clean}`,
          source: "preview page",
          raw: clean,
        };
      }
    } catch {
      // Network error on page fetch — not a code error
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Build a targeted, structured prompt for the AI to fix a preview error.
 */
function buildAutoFixPrompt(error: string): string {
  return (
    `URGENT: The live preview has an error that users can see. You MUST fix this now.\n\n` +
    `Error details:\n${error}\n\n` +
    `RULES for fixing:\n` +
    `1. Read the file that has the error FIRST\n` +
    `2. If it's "Failed to resolve import 'X'" → install the package with install_package, then re-save the importing file\n` +
    `3. If it's a syntax error → read the file, find the exact issue, rewrite the COMPLETE file\n` +
    `4. If it's "X is not exported" → read the exporting file and fix the export\n` +
    `5. If it's a runtime error → read src/App.tsx and any mentioned files, fix the logic\n` +
    `6. After fixing, verify by reading the file again\n\n` +
    `Fix it now. Do NOT explain — just fix.`
  );
}

// ─── In-memory session mapping (projectId → copilot sessionId) ─
const projectSessions = new Map<string, string>();

// Track active streaming requests per project so /ai-status can report
// whether the AI is still working (survives page refresh).
const activeRequests = new Map<string, { mode: string; startedAt: number }>();

/** Snapshot of active chat sessions for admin monitoring */
export function getChatSessionsSnapshot(): Array<{
  sessionKey: string;
  projectId: string;
  sessionId: string;
  isVisualEdit: boolean;
  active: boolean;
  mode: string | null;
  startedAt: number | null;
}> {
  return Array.from(projectSessions.entries()).map(([key, sessionId]) => {
    const baseProjectId = key.replace(/:visual-edit$/, "");
    const req = activeRequests.get(baseProjectId);
    return {
      sessionKey: key,
      projectId: baseProjectId,
      sessionId,
      isVisualEdit: key.endsWith(":visual-edit"),
      active: !!req,
      mode: req?.mode ?? null,
      startedAt: req?.startedAt ?? null,
    };
  });
}

// ─── Debounce guard for thumbnail captures ─
// Map of projectId → timestamp when capture started.
// Entries auto-expire after CAPTURE_TTL_MS so a hung capture can't permanently block a project.
const captureInProgress = new Map<string, number>();
const CAPTURE_TTL_MS = 60_000; // 60 seconds

/**
 * Schedule a thumbnail capture for a project. Debounced — only one
 * capture runs at a time per project. Waits for Vite HMR to settle
 * before taking the screenshot.
 *
 * @param projectId - The project to capture
 * @param delayMs - How long to wait for Vite HMR to settle (default: 3000)
 */
function scheduleThumbnailCapture(projectId: string, delayMs = 3000): void {
  const existingTs = captureInProgress.get(projectId);
  if (existingTs) {
    if (Date.now() - existingTs < CAPTURE_TTL_MS) {
      console.log(`[Thumbnail] Skipping capture for ${projectId} — already in progress`);
      return;
    }
    // TTL expired — previous capture likely hung, allow retry
    console.warn(`[Thumbnail] Previous capture for ${projectId} expired (>60s) — allowing retry`);
  }
  captureInProgress.set(projectId, Date.now());

  const internalUrl = getDevServerInternalUrl(projectId);
  if (!internalUrl) {
    captureInProgress.delete(projectId);
    console.warn(`[Thumbnail] Skipping capture for ${projectId} — dev server not running`);
    return;
  }

  const previewUrl = `${internalUrl}/preview/${projectId}/`;
  setTimeout(() => {
    import("../thumbnails/capture.js")
      .then(({ captureProjectThumbnail }) =>
        captureProjectThumbnail(projectId, previewUrl)
      )
      .then(async (filePath) => {
        if (filePath) {
          try {
            const thumbnailUrl = `/thumbnails/${projectId}.png`;
            await sql`UPDATE projects SET thumbnail_url = ${thumbnailUrl}, updated_at = NOW() WHERE id = ${projectId}`;
            // Notify dashboard clients so thumbnail refreshes without tab switch
            broadcastToRoom(projectId, {
              type: "thumbnail:updated",
              thumbnailUrl,
            }).catch(() => {});
          } catch (e) {
            console.warn("[Thumbnail] Failed to save URL to DB:", e);
          }
        } else {
          console.warn(`[Thumbnail] Capture returned null for ${projectId} — preview may have errors`);
        }
      })
      .finally(() => captureInProgress.delete(projectId))
      .catch((err) => console.warn(`[Thumbnail] Capture failed for ${projectId}:`, err));
  }, delayMs);
}

// ─── POST /projects/:id/chat ─ SSE streaming response ───────
const sendMessageSchema = z.object({
  content: z.string().min(1).max(100_000),
  mode: z.enum(["agent", "plan", "visual-edit"]).default("agent"),
  model: z.string().optional(),
  provider: z
    .object({
      type: z.enum(["openai", "azure", "anthropic"]).optional(),
      baseUrl: z.string(),
      apiKey: z.string().optional(),
    })
    .optional(),
  providerId: z.string().uuid().optional(),
  copilotAccountId: z.string().uuid().optional(),
  attachments: z
    .array(
      z.object({
        type: z.string(),
        data: z.string(),
        name: z.string(),
      })
    )
    .max(5)
    .optional(),
});

chatRoutes.post(
  "/projects/:id/chat",
  bodyLimit({ maxSize: 20 * 1024 * 1024 }), // 20 MB — accommodates base64-encoded image attachments
  zValidator("json", sendMessageSchema),
  async (c) => {
    const projectId = c.req.param("id");
    const { content, mode, model, provider, providerId, copilotAccountId, attachments } = c.req.valid("json");
    const userId = c.get("userId")!;

    // Process attachments: inline text/code into the prompt, save images as temp files for SDK
    let augmentedContent = content;
    let fileAttachments: Array<{ type: "file"; path: string; displayName?: string }> = [];

    if (attachments && attachments.length > 0) {
      const processed = processAttachments(attachments, content);
      augmentedContent = processed.augmentedPrompt;
      fileAttachments = processed.fileAttachments;
    }

    // Start SSE stream IMMEDIATELY — all setup runs inside the callback
    // so HTTP headers are sent right away and Cloudflare Tunnel / proxies
    // don't time out waiting for the initial response.
    c.header("X-Accel-Buffering", "no"); // Prevent proxy buffering of SSE

    // Hook client disconnect → cancel the in-flight Copilot SDK call.
    // Without this, closing the client fetch (AbortController, tab close,
    // network loss) severs the SSE writer but the server keeps running the
    // LLM call to completion — billing tokens, polluting chat history with
    // the full off-track response, and leaving an ai_active_streams row
    // flagged until natural completion. engine.abortSession() calls
    // session.abort() which terminates the SDK call cleanly.
    c.req.raw.signal.addEventListener("abort", () => {
      const sessionKeyForAbort = mode === "visual-edit" ? `${projectId}:visual-edit` : projectId;
      const sid = projectSessions.get(sessionKeyForAbort);
      if (!sid) return;
      // CRITICAL: must target the per-project pool engine that owns the
      // session, NOT the singleton getCopilotEngine(). The manager pool
      // (CopilotEngineManager) keeps a Map<projectId, engine> and each
      // project's session lives on its own engine instance. Calling
      // getCopilotEngine().abortSession(sid) hits a different engine
      // whose sessions Map is empty, so the abort is silently a no-op.
      const eng = getCopilotManager().tryGetEngine(projectId);
      if (!eng) return;
      eng.abortSession(sid).catch(() => {
        /* client is gone; nothing to report to */
      });
      console.log(`[Chat] client disconnected — aborting session ${sid.slice(0, 8)}… on pool engine`);
    });

    return streamSSE(c, async (stream) => {
    // Keep-alive: send periodic SSE pings to prevent Cloudflare Tunnel
    // and other proxies from closing the connection during slow operations
    // (session creation, AI thinking, tool execution, etc.)
    const keepAlive = setInterval(async () => {
      try {
        await stream.writeSSE({ data: JSON.stringify({ type: "keep_alive" }) });
      } catch { /* stream already closed */ }
    }, 10_000);

    // Soft heartbeat: fires unconditionally after 3s of SSE silence so the
    // frontend's stale-stream detector resets AND the user always sees a
    // live status. Message rotates based on how long the SDK has been
    // genuinely silent (lastRealEventAt) — never says "timeout" on a
    // healthy slow run. Goal: chat must always feel responsive.
    let lastSseEmitAt = Date.now();
    let lastRealEventAt = Date.now();
    let lastToolName: string | undefined;
    let friendlyLastTool: string | undefined;
    const softHeartbeat = setInterval(async () => {
      const sseSilence = Date.now() - lastSseEmitAt;
      if (sseSilence < 3_000) return;
      const realSilence = Date.now() - lastRealEventAt;
      let msg: string;
      if (realSilence < 15_000) {
        msg = friendlyLastTool ? `Working on ${friendlyLastTool}\u2026` : "Thinking\u2026";
      } else if (realSilence < 30_000) {
        msg = friendlyLastTool ? `Still working on ${friendlyLastTool}\u2026` : "Still thinking\u2026";
      } else if (realSilence < 60_000) {
        msg = "Working on a complex step \u2014 hold on\u2026";
      } else {
        msg = "This one's taking a while \u2014 still going\u2026";
      }
      try {
        await stream.writeSSE({
          data: JSON.stringify({
            type: "status",
            data: { phase: "thinking", message: msg },
          }),
        });
        lastSseEmitAt = Date.now();
      } catch { /* stream already closed */ }
    }, 3_000);

    // Track assistant state across the whole request lifecycle so both
    // success and error paths can persist the same in-flight data.
    let hadToolCalls = false;
    let versionSha: string | undefined;
    const pendingToolNames: string[] = [];
    const toolCallIdMap = new Map<string, string>(); // toolCallId → toolName
    let assistantContent = "";
    let assistantThinking = "";
    let lastCapturedMsgId: string | undefined;
    let msgIdDeltaStart = 0;
    let assistantMessageId: string | undefined;
    let lastFlushLen = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let assistantToolCalls: any[] = [];
    // Hoisted outside the try so the catch path can flush usage on errors.
    let usageCollector: ReturnType<typeof createUsageCollector> | null = null;

    const recordAssistantToolCall = (name?: string, args?: unknown) => {
      if (!name) return;
      const normalizedArgs = args && typeof args === "object"
        ? (args as Record<string, unknown>)
        : undefined;
      const argsKey = JSON.stringify(normalizedArgs ?? null);

      // Multiple channels record the same tool call with varying timing:
      //   path A: SDK onPreToolUse hook (RPC, may arrive late after the event)
      //   path B: SDK iterator yields tool.execution_start (mapEventToSSE)
      //   path C: custom tool bridge via onToolEvent
      // Dedupe rules:
      //  1. Exact (name + args) match anywhere in the array → skip.
      //  2. Incoming has args, an existing entry with same name has NO args
      //     → upgrade the existing entry in place.
      //  3. Incoming has NO args, an existing entry with same name HAS args
      //     → skip (keep the richer version).
      for (let i = 0; i < assistantToolCalls.length; i++) {
        const e = assistantToolCalls[i] as { name?: string; arguments?: unknown };
        if (e.name !== name) continue;
        const existingKey = JSON.stringify(e.arguments ?? null);
        if (existingKey === argsKey) return; // exact dup
        if (normalizedArgs && !e.arguments) {
          assistantToolCalls[i] = { name, arguments: normalizedArgs };
          return;
        }
        if (!normalizedArgs && e.arguments) return;
      }
      assistantToolCalls.push({ name, arguments: normalizedArgs });
      hadToolCalls = true;
    };

    try {
      // Send initial status so the client knows we're alive
      await stream.writeSSE({
        data: JSON.stringify({ type: "thinking", data: "Setting up..." }),
      });

      // Auto-scaffold the project if it hasn't been created yet
      if (!isProjectScaffolded(projectId)) {
        try {
          await stream.writeSSE({
            data: JSON.stringify({ type: "status", data: { phase: "scaffolding", message: "Creating project files..." } }),
          });
          console.log(`[Chat] Auto-scaffolding project ${projectId}`);
          await createProject(projectId);
        } catch (err: unknown) {
          const isAlreadyExists = err instanceof Error && err.message.includes("already scaffolded");
          if (!isAlreadyExists) {
            console.error(`[Chat] Scaffold failed for project ${projectId}:`, err);
          }
        }
      }

      // Auto-start the dev server if not running
      if (!isDevServerRunning(projectId) && isProjectScaffolded(projectId)) {
        try {
          await stream.writeSSE({
            data: JSON.stringify({ type: "status", data: { phase: "dev-server", message: "Starting live preview..." } }),
          });
          console.log(`[Chat] Auto-starting dev server for project ${projectId}`);
          // Pass userId so vault-backed integration credentials get injected
          // into the spawned Vite process (Phase 1C/1D of the integration↔AI
          // chat bridge). Other startDevServer call sites that lack a user
          // context fall back to user `env_vars` only — still valid, just no
          // user-scoped vault credentials.
          await startDevServer(projectId, { userId });
        } catch (err) {
          console.error(`[Chat] Dev server start failed for project ${projectId}:`, err);
        }
      }

      // ── Resolve AI config + workspace in parallel ──
      const sessionKey = mode === "visual-edit" ? `${projectId}:visual-edit` : projectId;
      const [aiConfig, workspaceRow] = await Promise.all([
        resolveAiEngine(projectId, userId, {
          copilotAccountId,
          providerId,
          provider: provider as ByokProviderConfig | undefined,
          model,
        }),
        sql`SELECT workspace_id FROM projects WHERE id = ${projectId}`.catch(() => []),
      ]);
      const { model: resolvedModel, provider: resolvedProvider, githubToken: resolvedGithubToken } = aiConfig;
      const workspaceId: string | undefined = workspaceRow[0]?.workspace_id;

      // ── Usage collector (non-blocking, fire-and-forget) ──
      usageCollector = workspaceId ? createUsageCollector({
        userId,
        workspaceId,
        projectId,
        provider: resolvedProvider ? "byok" : "copilot",
        providerLabel: resolvedProvider?.type ?? "GitHub Copilot",
        byokProviderId: providerId,
        mode,
      }) : null;

      // Build context + tools in parallel (both need workspaceId but not each other)
      const previewUrl = getDevServerUrl(projectId);
      const [projectContext, allTools] = await Promise.all([
        buildProjectContextForMode(projectId, mode, workspaceId, userId),
        createAllTools(projectId, workspaceId, userId),
      ]);

      const systemPrompt =
          mode === "plan"
            ? `You are Doable's Plan Mode AI. You have two tools for planning: ask_clarification and create_plan.

STEP 1 — CLARIFY (if needed):
- If the request is vague or ambiguous, call ask_clarification with 2-4 focused questions
- Each question should have smart default options when possible
- Use plain language, no technical jargon
- If the request is very specific, you may skip straight to STEP 2

STEP 2 — PLAN:
- After understanding the request, call create_plan
- Write a 1-2 sentence summary in plain language
- Create 3-8 concrete steps with action-oriented titles
- Step descriptions should explain WHAT will be built, not HOW
- Put technical details (file paths, implementation notes) in the optional details field
- Estimate complexity as simple/moderate/complex

IMPORTANT: Do NOT write code. Do NOT create or edit files. Only analyze and plan. You MUST use the ask_clarification and create_plan tools — do not output plans as plain text.`
            : mode === "visual-edit"
            ? `You are Doable's Visual Edit AI. You make precise, surgical edits to individual UI elements. The user has selected a specific element in the visual preview and wants you to modify it.

RULES:
- Make ONLY the specific change requested. Do not refactor surrounding code.
- Read the target file first, then edit only the relevant element.
- Use Tailwind CSS classes for styling changes.
- Be fast and precise — modify only what's needed, nothing more.
- Respond briefly: state what you changed in 1-2 sentences.

The project is a Vite + React + TypeScript app with Tailwind CSS v4.${previewUrl ? `\nPreview: ${previewUrl}` : ""}`
            : `You are Doable's Agent Mode AI. You build complete, working web applications by creating files, editing files, and installing packages. The user sees a live preview that updates in real-time as you make changes.

The project is a Vite + React 19 + TypeScript app with Tailwind CSS v4 (using the @tailwindcss/vite plugin). Files are hot-reloaded via Vite.${previewUrl ? `\nLive preview: ${previewUrl}` : ""}${projectContext}

═══════════════════════════════════════════════════════════════
  💬  COMMUNICATION STYLE — HOW TO RESPOND  💬
═══════════════════════════════════════════════════════════════
1. **START WITH A BRIEF PLAN**: Before making any tool calls, write 1-3 sentences explaining what you're going to build or change. The user should understand your approach before seeing file operations.
2. **EXPLAIN AS YOU GO**: Between groups of related tool calls, add brief updates about progress or what's coming next. Don't just silently chain tool calls.
3. **SUMMARIZE AT THE END**: After completing all changes, write a short summary of what was built and any important details (e.g., "I built a task manager with drag-and-drop using react-beautiful-dnd. The main components are TaskBoard, TaskColumn, and TaskCard.").
4. **BE CONVERSATIONAL**: Write like a helpful colleague, not a machine. Use plain language.

═══════════════════════════════════════════════════════════════
  ⚠️  BEFORE WRITING ANY FILE — MANDATORY CHECKLIST  ⚠️
═══════════════════════════════════════════════════════════════
Before you create or edit ANY file, mentally walk through this checklist:
  ☐ Did I call list_files to see the current project structure?
  ☐ Did I check the installed dependencies list above?
  ☐ For EVERY import of an npm package in my code, is it already installed?
  ☐ If not → call install_package FIRST, before writing the file.
  ☐ Am I using .tsx extension for any file containing JSX?
  ☐ Am I using relative paths (e.g., "./components/Button") for local imports?
═══════════════════════════════════════════════════════════════

CRITICAL RULES — violating these will break the live preview:

0. **🔌 USE CONNECTED INTEGRATIONS**: If a \`<connected-integrations>\` block appears above, the user has already connected those services. You MUST reference the listed env vars (via \`import.meta.env.VITE_*\` for client vars, \`process.env.*\` for server vars) and call the listed tools. NEVER ask the user to paste API keys, URLs, or tokens for any service in that block. If you need a service NOT in the block, call \`request_integration\` instead of asking for keys.

1. **🚨 INSTALL BEFORE IMPORT (the #1 cause of errors) 🚨**: You MUST call install_package to install any npm package BEFORE writing any file that imports it. Check the "Installed dependencies" list above — if a package is NOT listed there, you MUST install it first. The preview WILL crash with "Failed to resolve import" errors otherwise.

   COMMONLY NEEDED PACKAGES (always install before using):
   - Routing: react-router-dom
   - State management: zustand, jotai, @reduxjs/toolkit
   - Data fetching: axios, @tanstack/react-query, swr
   - Animation: framer-motion
   - Date/time: date-fns, dayjs
   - Utilities: uuid, lodash-es, clsx
   - Icons: react-icons, lucide-react, @heroicons/react
   - Forms: react-hook-form, zod, @hookform/resolvers
   - Charts: recharts, chart.js, react-chartjs-2
   - UI components: @radix-ui/react-*, @headlessui/react

2. **READ BEFORE EDIT**: Always call read_file before editing a file. Never assume what a file contains.

3. **LIST FILES FIRST**: At the start, call list_files to see the current project structure before making changes.

4. **COMPLETE FILES**: Always write the complete, valid file content. Never use placeholder comments like "// rest of code here" or "// ...existing code...".

5. **VALID IMPORTS**: Only import packages that are in the installed dependencies list above, or that you just installed. For local files, use relative paths (e.g., "./components/Button"). Do NOT use path aliases like "@/" unless you have verified that tsconfig.json has "paths" configured for it (the default scaffold does NOT have @/ configured).

6. **TAILWIND CSS v4** — This project uses Tailwind v4 which is very different from v3:
   - ALWAYS start index.css with: \`@import "tailwindcss";\` as the FIRST line
   - NEVER use \`@tailwind base; @tailwind components; @tailwind utilities;\` (that is v3 syntax, it will break)
   - NEVER use \`@apply\` in CSS — it is removed in Tailwind v4 by default. Use utility classes directly in JSX instead.
   - NEVER create a tailwind.config.ts or tailwind.config.js — it's not needed. Tailwind v4 auto-detects utility classes.
   - For custom theme values (colors, fonts, spacing), use the \`@theme\` directive in CSS:
     \`\`\`css
     @import "tailwindcss";
     @theme {
       --color-brand: #3b82f6;
       --font-heading: "Inter", sans-serif;
     }
     \`\`\`
   - Then use them as classes: \`className="text-brand font-heading"\`

7. **DEFAULT EXPORT**: src/App.tsx must use \`export default\` since src/main.tsx imports it as a default import.

8. **BUILD ORDER**: Follow this sequence:
   a. Call list_files to see what exists
   b. Install ALL needed packages with install_package (do this BEFORE creating any files)
   c. Create utility/helper files first
   d. Create components
   e. Update src/App.tsx last (importing the new components)

9. **WORKING CODE**: Every file must be syntactically valid. Verify all JSX tags are properly closed, all imports resolve, and all variables are defined before use.

10. **FILE EXTENSIONS**: Always use \`.tsx\` for files containing JSX/TSX markup. Use \`.ts\` for pure TypeScript files with no JSX. Never put JSX in a \`.ts\` file.

11. **IMPORT TYPES**: Do not use \`import type { X }\` for values that are used at runtime (e.g., as a component, in a function call, or as a value). \`import type\` strips the import at compile time, causing runtime errors. Only use \`import type\` for values used exclusively in type annotations.

ERROR RECOVERY — if you encounter errors:
- "Failed to resolve import 'X'" → ALWAYS install the package first with install_package, then re-create the file that imports it.
- Syntax error → call read_file on the COMPLETE file to see its current state before making changes. Never guess.
- "X is not exported from Y" → read BOTH the importing file AND the exporting file to understand the mismatch.
- If multiple errors cascade, fix them one at a time starting with the root cause (usually a missing package or broken import).`;

      const projectPath = getProjectPath(projectId);

      // In plan mode, restrict tools to read-only + plan-specific tools.
      // This prevents the AI from building instead of planning.
      const PLAN_MODE_ALLOWED = new Set([
        "read_file", "list_files", "search_files",
        "ask_clarification", "create_plan", "mark_step_complete",
      ]);
      // In agent/build mode, exclude plan-only tools so the AI doesn't
      // trigger clarification or plan UI when the user chose build mode.
      const PLAN_ONLY_TOOLS = new Set([
        "ask_clarification", "create_plan", "mark_step_complete",
      ]);
      const sessionTools = mode === "plan"
        ? allTools.filter((t: { name?: string }) => PLAN_MODE_ALLOWED.has(t.name ?? ""))
        : allTools.filter((t: { name?: string }) => !PLAN_ONLY_TOOLS.has(t.name ?? ""));

      // Shared tool-progress callbacks used by both create and resume paths
      const toolProgress = {
        onToolStart: (toolName: string, args: unknown) => {
          recordAssistantToolCall(toolName, args as Record<string, unknown>);
          const friendly = friendlyToolMessage(toolName, args as Record<string, unknown>);
          stream.writeSSE({ data: JSON.stringify({
            type: "tool_call", data: { name: toolName, friendlyMessage: friendly },
          }) }).catch(() => {});
        },
        onToolEnd: (toolName: string, _args: unknown, result: unknown) => {
          hadToolCalls = true;
          const friendly = friendlyToolResult(toolName, result, true);
          stream.writeSSE({ data: JSON.stringify({
            type: "tool_result", data: { name: toolName, success: true, friendlyMessage: friendly },
          }) }).catch(() => {});

          // Plan Mode: Emit structured plan/clarification events
          if (toolName === "ask_clarification" && result) {
            try {
              const output = typeof result === "string" ? result : (result as Record<string, unknown>)?.output as string;
              if (output) {
                const questions = JSON.parse(output);
                if (Array.isArray(questions) && questions.length > 0) {
                  stream.writeSSE({ data: JSON.stringify({
                    type: "clarification", data: { questions },
                  }) }).catch(() => {});
                }
              }
            } catch { /* non-critical */ }
          }
          // Phase 2A: forward `provision_supabase` requests to the chat UI.
          // The tool handler returns `{ _sseHint: "provision_supabase_required", ... }`
          // — we emit a dedicated SSE event so the client can pop the
          // org/region picker dialog and POST to /api/integrations/supabase/provision.
          if (toolName === "provision_supabase" && result) {
            try {
              const r = result as Record<string, unknown>;
              if (r._sseHint === "provision_supabase_required") {
                stream.writeSSE({ data: JSON.stringify({
                  type: "provision_supabase_required",
                  data: { name: r.name ?? "", reason: r.reason ?? "" },
                }) }).catch(() => {});
              }
            } catch { /* non-critical */ }
          }
          // Phase 1H: surface integration_required as an inline Connect card.
          // Fires for ANY tool whose result is tagged with `_sseHint:
          // "integration_required"` — that's both the explicit
          // `request_integration` tool AND tool-bridge.ts tagging a
          // credentials_missing Activepieces failure the same way.
          if (result && typeof result === "object") {
            const r = result as Record<string, unknown>;
            if (r._sseHint === "integration_required" && r.integrationId) {
              stream.writeSSE({ data: JSON.stringify({
                type: "integration_required",
                data: {
                  integrationId: r.integrationId,
                  displayName: r.displayName ?? r.integrationId,
                  logoUrl: r.logoUrl,
                  reason: r.reason ?? "",
                },
              }) }).catch(() => {});
            }
          }
          if (toolName === "create_plan" && result) {
            try {
              const output = typeof result === "string" ? result : (result as Record<string, unknown>)?.output as string;
              if (output) {
                const plan = JSON.parse(output);
                if (plan?.id) {
                  stream.writeSSE({ data: JSON.stringify({
                    type: "plan", data: { plan },
                  }) }).catch(() => {});
                  // Save plan to DB
                  sql`INSERT INTO plans (id, project_id, summary, complexity, status, created_at)
                      VALUES (${plan.id}, ${projectId}, ${plan.summary}, ${plan.complexity}, 'draft', now())
                      ON CONFLICT (id) DO NOTHING`.catch(() => {});
                  if (Array.isArray(plan.steps)) {
                    for (const step of plan.steps) {
                      sql`INSERT INTO plan_steps (id, plan_id, "order", title, description, details, status, file_paths)
                          VALUES (${step.id}, ${plan.id}, ${step.order}, ${step.title}, ${step.description}, ${step.details ?? null}, 'pending', ${step.filePaths ?? null})
                          ON CONFLICT (id) DO NOTHING`.catch(() => {});
                    }
                  }
                }
              }
            } catch { /* non-critical */ }
          }
        },
        onSessionEnd: (reason: string, error?: string) => {
          if (error) console.error(`[Chat] Session ended: ${reason} —`, typeof error === 'object' ? JSON.stringify(error) : error);
        },
        onError: (error: unknown, context: string) => {
          const errorStr = typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error);
          console.error(`[Chat] Hook error (${context}):`, errorStr);
          // Don't send uninformative hook errors to the user.
          // The SDK fires model_call hook errors with {} — the real error details
          // arrive in session.error which has statusCode/errorType. Sending the
          // hook error just shows a confusing message that gets overwritten.
          if (!errorStr || errorStr === '{}' || errorStr === 'undefined') return;
          // Humanize the error for the user — don't expose internal context names
          let userMessage: string;
          if (errorStr.includes("404") || errorStr.includes("not found")) {
            userMessage = "The AI model returned an error (404). The model may be unavailable or the model ID is incorrect. Check your AI settings.";
          } else if (errorStr.includes("401") || errorStr.includes("unauthorized") || errorStr.includes("not authorized")) {
            userMessage = "Authentication failed with the AI provider. Please check your API key in AI settings.";
          } else if (errorStr.includes("429") || errorStr.includes("rate limit")) {
            userMessage = "Rate limit reached. Please wait a moment and try again.";
          } else if (errorStr.includes("500") || errorStr.includes("internal server")) {
            userMessage = "The AI provider returned a server error. Please try again.";
          } else {
            userMessage = "An error occurred while communicating with the AI model. Please try again.";
          }
          stream.writeSSE({ data: JSON.stringify({
            type: "error", data: userMessage,
          }) }).catch(() => {});
        },
      };

      let sessionId = projectSessions.get(sessionKey);
      if (!sessionId) {
        await stream.writeSSE({
          data: JSON.stringify({ type: "status", data: { phase: "connecting", message: "Connecting to AI..." } }),
        });

        const manager = getCopilotManager();

        // Try to resume a previous SDK session from the database.
        // The SDK persists conversation state to disk, so resumeSession()
        // restores full context (all prior messages + tool call history).
        let resumed = false;
        try {
          const [dbRow] = await sql`
            SELECT id, copilot_session_id FROM ai_sessions
            WHERE project_id = ${projectId} AND copilot_session_id IS NOT NULL
            ORDER BY updated_at DESC LIMIT 1
          `;
          if (dbRow?.copilot_session_id) {
            sessionId = await manager.withAutoRetry(projectId, resolvedGithubToken, async (eng) => {
              return eng.resumeSession(dbRow.copilot_session_id, {
                tools: sessionTools,
                toolProgress,
              });
            });
            projectSessions.set(sessionKey, sessionId!);
            resumed = true;
            console.log(`[Chat] Resumed SDK session ${dbRow.copilot_session_id.slice(0, 8)}… for ${projectId.slice(0, 8)}…`);
          }
        } catch (err) {
          // Resume failed (stale/deleted session) — fall through to create
          console.log(`[Chat] Session resume failed for ${projectId.slice(0, 8)}…, creating new:`, err instanceof Error ? err.message : err);
          sessionId = undefined;
        }

        if (!resumed) {
          // Use withAutoRetry to handle stale Copilot API tokens —
          // if session creation fails with an auth error, the manager evicts
          // the cached engine, creates a fresh one, and retries.
          sessionId = await manager.withAutoRetry(projectId, resolvedGithubToken, async (eng) => {
            return eng.createSession({
              projectId,
              userId,
              model: resolvedModel,
              provider: resolvedProvider,
              workingDirectory: projectPath,
              systemPrompt,
              tools: sessionTools,
              toolProgress,
            });
          });
          projectSessions.set(sessionKey, sessionId);
        }
      }

      // Persist session to database — shared per-project (not per-user)
      let dbSessionId: string | undefined;
      try {
        const [dbSession] = await sql`
          SELECT id FROM ai_sessions
          WHERE project_id = ${projectId}
          ORDER BY created_at DESC LIMIT 1
        `;
        if (dbSession) {
          dbSessionId = dbSession.id;
          // Store the SDK session ID so we can resume after restart
          if (sessionId) {
            sql`UPDATE ai_sessions SET copilot_session_id = ${sessionId}, updated_at = now()
                WHERE id = ${dbSession.id}`.catch(() => {});
          }
        } else {
          const [newSession] = await sql`
            INSERT INTO ai_sessions (project_id, user_id, mode, copilot_session_id)
            VALUES (${projectId}, ${userId}, ${mode}, ${sessionId ?? null})
            RETURNING id
          `;
          dbSessionId = newSession?.id;
        }
      } catch (e) {
        console.warn("[Chat] DB session lookup failed:", e);
      }

      // Pass the DB session ID to the usage collector so per-request logs
      // are associated with the correct ai_sessions row.
      if (usageCollector && dbSessionId) {
        usageCollector.setSessionId(dbSessionId);
      }

      // Resolve user display info for message attribution
      let senderDisplayName = "";
      let senderColor = "";
      try {
        const [userRow] = await sql`SELECT display_name FROM users WHERE id = ${userId}`;
        senderDisplayName = userRow?.display_name ?? "";
      } catch { /* ignore */ }
      // Deterministic color from userId hash
      {
        let hash = 0;
        for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
        const colors = ["#E57373","#F06292","#BA68C8","#9575CD","#7986CB","#64B5F6","#4FC3F7","#4DD0E1","#4DB6AC","#81C784","#AED581","#FFD54F","#FFB74D","#FF8A65","#A1887F","#90A4AE"];
        senderColor = colors[Math.abs(hash) % colors.length]!;
      }

      // Save user message to database with attribution
      if (dbSessionId) {
        try {
          await sql`
            INSERT INTO ai_messages (session_id, role, content, sent_by_user_id, display_name, user_color)
            VALUES (${dbSessionId}, 'user', ${content}, ${userId}, ${senderDisplayName}, ${senderColor})
          `;
        } catch (e) {
          console.warn("[Chat] Failed to save user message:", e);
        }
      }

      // Broadcast to other collaborators that a message was sent
      const messageId = crypto.randomUUID();
      broadcastToRoom(projectId, {
        type: "ai:message-sent",
        userId,
        displayName: senderDisplayName,
        content: content.slice(0, 200),
        messageId,
      }, userId).catch(() => {});

        // Mark this project as having an active AI request (in-memory + DB)
        activeRequests.set(projectId, { mode, startedAt: Date.now() });
        sql`INSERT INTO ai_active_streams (project_id, message_id) VALUES (${projectId}, ${messageId}) ON CONFLICT (project_id) DO UPDATE SET message_id = ${messageId}, started_at = now()`.catch(() => {});

        // Pre-insert an empty assistant message row so partial content is never lost
        if (dbSessionId) {
          try {
            const [row] = await sql`
              INSERT INTO ai_messages (session_id, role, content)
              VALUES (${dbSessionId}, 'assistant', '')
              RETURNING id
            `;
            assistantMessageId = row?.id;
          } catch { /* non-critical */ }
        }
        // Subscribe to tool execution events — captures plan/clarification data
        // from tool handlers in real-time as they execute, independently of SDK
        // event delivery. This is the reliable channel for structured plan data.
        const unsubToolEvents = onToolEvent(projectId, (toolName, status, args) => {
          if (status === "start") {
            recordAssistantToolCall(toolName, args);
            const friendly = friendlyToolMessage(toolName, args);
            stream.writeSSE({
              data: JSON.stringify({
                type: "tool_call",
                data: { name: toolName, friendlyMessage: friendly, arguments: args },
              }),
            }).catch(() => {});
          }

          if (status === "end") {
            // Emit plan/clarification SSE events from tool handler output
            if (toolName === "ask_clarification" && args.output) {
              try {
                const questions = JSON.parse(args.output as string);
                stream.writeSSE({
                  data: JSON.stringify({ type: "clarification", data: { questions } }),
                }).catch(() => {});
              } catch { /* parse error — skip */ }
            }
            if (toolName === "create_plan" && args.output) {
              try {
                const plan = JSON.parse(args.output as string);
                // Save plan to DB
                (async () => {
                  try {
                    const planId = plan.id as string;
                    await sql`
                      INSERT INTO plans (id, project_id, summary, complexity, status, created_at)
                      VALUES (${planId}, ${projectId}, ${plan.summary}, ${plan.complexity}, 'draft', ${plan.createdAt})
                      ON CONFLICT (id) DO NOTHING
                    `;
                    if (Array.isArray(plan.steps)) {
                      for (const step of plan.steps) {
                        await sql`
                          INSERT INTO plan_steps (id, plan_id, "order", title, description, details, status, file_paths)
                          VALUES (${step.id}, ${planId}, ${step.order}, ${step.title}, ${step.description}, ${step.details ?? null}, 'pending', ${step.filePaths ?? null})
                          ON CONFLICT (id) DO NOTHING
                        `;
                      }
                    }
                  } catch (dbErr) {
                    console.warn("[Chat] Failed to save plan to DB:", dbErr);
                  }
                })();
                stream.writeSSE({
                  data: JSON.stringify({ type: "plan", data: { plan } }),
                }).catch(() => {});
              } catch { /* parse error — skip */ }
            }
          }
        });

        // Track active request so engine pool doesn't recycle mid-stream
        const releaseTracker = getCopilotManager().trackRequest(projectId);
        try {
          // Get a fresh engine reference — the pooled engine may have been
          // recycled since resolveAiEngine ran (max-age, idle, or eviction).
          const manager = getCopilotManager();
          let currentEngine = await manager.getEngine(projectId, resolvedGithubToken);

          // Try to send. If the session was lost (engine recycled), recreate it.
          let messageStream: AsyncGenerator<import("@github/copilot-sdk").SessionEvent>;
          try {
            const originalStream = currentEngine.sendMessage(sessionId!, augmentedContent, fileAttachments.length > 0 ? fileAttachments : undefined);
            // Send an immediate status so the frontend exits "Connecting to AI..."
            // before the model responds (BYOK providers can take 30s+ to first token).
            await stream.writeSSE({
              data: JSON.stringify({ type: "status", data: { phase: "thinking", message: "Waiting for AI model to respond..." } }),
            });
            // Force the generator to yield once — "Session not found" throws here
            // because async generators are lazy (the body doesn't run until iterated).
            const first = await originalStream.next();
            // Once we get the first event, update status to show the model is actively generating.
            await stream.writeSSE({
              data: JSON.stringify({ type: "status", data: { phase: "thinking", message: "AI is writing code..." } }),
            });
            // Wrap in a helper that re-yields the first value then continues.
            // IMPORTANT: use `originalStream` — not `messageStream` — to avoid
            // self-delegation after the reassignment below.
            messageStream = (async function* () {
              if (!first.done) yield first.value;
              yield* originalStream;
            })();
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("not found") || msg.includes("not started") || msg.includes("stopped")) {
              // Session or engine was lost (engine recycled/stopped) — recreate
              console.log(`[Chat] Session or engine lost for ${projectId}: ${msg.slice(0, 80)}`);
              stream.writeSSE({
                data: JSON.stringify({ type: "status", data: { phase: "reconnecting", message: "Reconnecting to AI..." } }),
              }).catch(() => {});
              projectSessions.delete(sessionKey);
              currentEngine = await manager.getEngine(projectId, resolvedGithubToken);
              const freshTools = await createAllTools(projectId, workspaceId, userId);
              const recreationTools = mode === "plan"
                ? freshTools.filter((t: { name?: string }) => PLAN_MODE_ALLOWED.has(t.name ?? ""))
                : freshTools;
              sessionId = await currentEngine.createSession({
                projectId, userId, model: resolvedModel, provider: resolvedProvider,
                workingDirectory: projectPath, systemPrompt, tools: recreationTools,
                toolProgress,
              });
              projectSessions.set(sessionKey, sessionId);
              // Persist new SDK session ID to DB
              if (dbSessionId) {
                sql`UPDATE ai_sessions SET copilot_session_id = ${sessionId}, updated_at = now()
                    WHERE id = ${dbSessionId}`.catch(() => {});
              }
              messageStream = currentEngine.sendMessage(sessionId, augmentedContent, fileAttachments.length > 0 ? fileAttachments : undefined);
            } else {
              throw err;
            }
          }

          // Wrap the SDK's async generator with a per-iteration timeout.
          // The SDK sometimes stops yielding events without closing the
          // generator or emitting a terminal event. We race each .next()
          // against a 60s deadline. On timeout we DON'T bail immediately —
          // healthy slow runs can have legitimate 60s+ thinking gaps. We
          // emit a calm reassuring status, increment a silentIterations
          // counter, and keep waiting. Only after 3 consecutive silent
          // iterations (180s of pure SDK silence) do we declare a real
          // hang and surface a clean error.
          const SDK_IDLE_TIMEOUT_MS = 60_000;
          const MAX_SILENT_ITERATIONS = 2;
          const TIMEOUT_SENTINEL = Symbol("timeout");
          const channelRouter = new ChannelTokenRouter();
          const iterator = messageStream![Symbol.asyncIterator]();
          let iterDone = false;
          let silentIterations = 0;
          let sawTurnEnd = false;
          let turnEndAt = 0;
          const TURN_END_GRACE_MS = 10_000; // 10s grace after turn_end
          while (!iterDone) {
            // Use shorter timeout after turn_end: session should go idle quickly
            const effectiveTimeout = sawTurnEnd
              ? TURN_END_GRACE_MS
              : SDK_IDLE_TIMEOUT_MS;
            const raceResult = await Promise.race([
              iterator.next(),
              new Promise<{ done: true; value: typeof TIMEOUT_SENTINEL }>((resolve) =>
                setTimeout(() => resolve({ done: true, value: TIMEOUT_SENTINEL }), effectiveTimeout),
              ),
            ]);
            if (raceResult.done) {
              if (raceResult.value === TIMEOUT_SENTINEL) {
                // After turn_end, bail immediately on first timeout (10s grace)
                if (sawTurnEnd) {
                  console.log(`[Chat] turn_end grace expired (${TURN_END_GRACE_MS / 1000}s) — treating as complete for ${projectId}`);
                  iterDone = true;
                  break;
                }
                silentIterations++;
                if (silentIterations >= MAX_SILENT_ITERATIONS) {
                  // True hang — bail with a clean error.
                  console.error(`[Chat] SDK silent for ${silentIterations}×${SDK_IDLE_TIMEOUT_MS / 1000}s — bailing for ${projectId}`);
                  try {
                    await stream.writeSSE({
                      data: JSON.stringify({
                        type: "error",
                        data: "AI didn't respond in time \u2014 please try again.",
                      }),
                    });
                  } catch { /* stream already closed */ }
                  iterDone = true;
                  break;
                }
                // Not a real hang yet — emit a calm reassuring status and keep waiting.
                console.log(`[Chat] SDK idle ${SDK_IDLE_TIMEOUT_MS / 1000}s (iter ${silentIterations}/${MAX_SILENT_ITERATIONS}), continuing for ${projectId}`);
                try {
                  await stream.writeSSE({
                    data: JSON.stringify({
                      type: "status",
                      data: { phase: "thinking", message: "Working on a complex step \u2014 still here\u2026" },
                    }),
                  });
                  lastSseEmitAt = Date.now();
                } catch { /* stream already closed */ }
                continue;
              }
              iterDone = true;
              break;
            }
            // Real SDK event arrived
            lastRealEventAt = Date.now();
            const event = raceResult.value as Record<string, unknown>;
            const evtType = event.type as string;
            const evtData = event.data as Record<string, unknown> | undefined;

            // Only reset silence counter for CONTENT-BEARING events.
            // Non-content events (background_tasks_changed, tools_updated, etc.)
            // should NOT prevent timeout from progressing.
            const CONTENT_EVENTS = new Set([
              "assistant.message_delta", "assistant.streaming_delta",
              "assistant.message", "assistant.reasoning_delta", "assistant.reasoning",
              "tool.execution_start", "tool.execution_complete", "tool.execution_partial_result",
              "tool.running", "tool_call",
              "session.idle", "session.error", "done",
            ]);
            if (CONTENT_EVENTS.has(evtType)) {
              silentIterations = 0;
              sawTurnEnd = false; // new content after turn_end = multi-turn, reset
            }

            // Track turn_end to trigger short grace period
            if (evtType === "assistant.turn_end") {
              sawTurnEnd = true;
              turnEndAt = Date.now();
            }

            // ── Debug: trace SDK events to diagnose silent model failures ──
            if (evtType === "session.error" || evtType === "session.idle" || evtType === "done") {
              console.log(`[Chat][${projectId.slice(0, 8)}] terminal event: ${evtType}`, evtData ? JSON.stringify(evtData).slice(0, 300) : "");
            } else if (evtType === "assistant.message_delta" || evtType === "assistant.streaming_delta") {
              // Only log once per message to avoid flooding
              const deltaMessageId = evtData?.messageId as string | undefined;
              if (deltaMessageId && deltaMessageId !== lastCapturedMsgId) {
                console.log(`[Chat][${projectId.slice(0, 8)}] first delta for msg ${deltaMessageId?.slice(0, 8)}`);
              }
            } else if (evtType.startsWith("tool.") || evtType === "tool_call") {
              console.log(`[Chat][${projectId.slice(0, 8)}] ${evtType}: ${(evtData?.toolName ?? evtData?.name ?? "").toString().slice(0, 50)}`);
            }

            // Feed every event to the usage collector (no-op for non-usage events)
            if (usageCollector) usageCollector.onUsageEvent(event);

            // Track the start of a new assistant turn when its first delta arrives.
            // This ensures msgIdDeltaStart is set BEFORE deltas are accumulated,
            // so the assistant.message catch-up check is per-turn accurate.
            if (evtType === "assistant.message_delta" || evtType === "assistant.streaming_delta") {
              const deltaMessageId = evtData?.messageId as string | undefined;
              if (deltaMessageId && deltaMessageId !== lastCapturedMsgId) {
                lastCapturedMsgId = deltaMessageId;
                msgIdDeltaStart = assistantContent.length;
              }
            }

            // Capture full assistant.message for DB persistence.
            // Each assistant.message event carries content for THAT specific turn only
            // (not cumulative). Track per-message-ID to correctly append multi-turn text.
            if (evtType === "assistant.message") {
              const msgId = evtData?.messageId as string | undefined;
              const content = (evtData?.content ?? "") as string;

              // Detect a new assistant turn (new messageId)
              if (msgId && msgId !== lastCapturedMsgId) {
                lastCapturedMsgId = msgId;
                msgIdDeltaStart = assistantContent.length; // deltas for this message start here
              }

              if (content) {
                // Compare against deltas accumulated for THIS specific message
                const deltasSoFar = assistantContent.slice(msgIdDeltaStart);
                if (content.length > deltasSoFar.length) {
                  // Deltas missed part of this message — emit the missing suffix
                  // Route through channel router so <|channel>thought blocks
                  // are split into thinking vs text correctly
                  const missing = content.slice(deltasSoFar.length);
                  const routedChunks = channelRouter.process(missing);
                  for (const chunk of routedChunks) {
                    if (!chunk.content) continue;
                    if (chunk.type === "text") {
                      const cleaned = sanitizeText(chunk.content);
                      if (cleaned) {
                        await stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: cleaned }) });
                      }
                    } else {
                      assistantThinking += chunk.content;
                      await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: chunk.content }) });
                    }
                  }
                  // Replace the per-message portion with the authoritative full text
                  assistantContent = assistantContent.slice(0, msgIdDeltaStart) + sanitizeText(content);
                } else if (!deltasSoFar && !assistantContent) {
                  // No deltas at all — use full content via channel router
                  const routedChunks = channelRouter.process(content);
                  for (const chunk of routedChunks) {
                    if (!chunk.content) continue;
                    if (chunk.type === "text") {
                      const cleaned = sanitizeText(chunk.content);
                      if (cleaned) {
                        await stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: cleaned }) });
                      }
                    } else {
                      assistantThinking += chunk.content;
                      await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: chunk.content }) });
                    }
                  }
                  assistantContent = sanitizeText(content);
                }
              }
            }

            const sseData = mapEventToSSE(event);
            if (sseData) {
              // Track toolCallId → toolName for proper pairing
              if (evtType === "tool.execution_start" || evtType === "tool.running") {
                const tcId = evtData?.toolCallId as string | undefined;
                const tcName = evtData?.toolName as string | undefined;
                if (tcId && tcName) toolCallIdMap.set(tcId, tcName);
              }

              // When a tool_call is emitted, record the name for pairing
              if (sseData.type === "tool_call") {
                const toolData = sseData.data as Record<string, unknown>;
                if (toolData?.name) {
                  pendingToolNames.push(toolData.name as string);
                  recordAssistantToolCall(toolData.name as string, toolData?.arguments);
                  // Heartbeat: remember the in-flight tool so soft heartbeat
                  // can tell the user what's still running.
                  lastToolName = toolData.name as string;
                  friendlyLastTool = (toolData.friendlyMessage as string | undefined) ?? lastToolName;
                }
              }
              // When a tool_result is emitted, inject the name from the map or queue
              if (sseData.type === "tool_result") {
                hadToolCalls = true;
                const resultData = sseData.data as Record<string, unknown>;
                if (!resultData?.name) {
                  // Try toolCallId-based lookup first (more accurate than queue)
                  const tcId = evtData?.toolCallId as string | undefined;
                  const mappedName = tcId ? toolCallIdMap.get(tcId) : undefined;
                  if (mappedName) {
                    resultData.name = mappedName;
                    toolCallIdMap.delete(tcId!);
                    // Also remove from pendingToolNames queue
                    const idx = pendingToolNames.indexOf(mappedName);
                    if (idx !== -1) pendingToolNames.splice(idx, 1);
                  } else if (pendingToolNames.length > 0) {
                    resultData.name = pendingToolNames.shift();
                  }
                }
                // Heartbeat: tool finished, clear the in-flight marker
                lastToolName = undefined;
                friendlyLastTool = undefined;
              }

              // ── Route text_delta through the channel token parser ──
              // Gemma 4 inlines thinking in <|channel>thought...<channel> blocks
              // within message_delta text. The channelRouter splits them so
              // thinking content goes to the "thinking" SSE event and visible
              // text goes to "text_delta".
              if (sseData.type === "text_delta") {
                const rawDelta = typeof sseData.data === "string" ? sseData.data : "";
                const routed = channelRouter.process(rawDelta);
                for (const chunk of routed) {
                  if (!chunk.content) continue;
                  if (chunk.type === "text") {
                    const cleaned = sanitizeText(chunk.content);
                    if (!cleaned) continue;
                    // Accumulate for DB
                    assistantContent += cleaned;
                    if (assistantMessageId && assistantContent.length - lastFlushLen > 500) {
                      lastFlushLen = assistantContent.length;
                      sql`UPDATE ai_messages SET content = ${assistantContent} WHERE id = ${assistantMessageId}`.catch(() => {});
                    }
                    broadcastToRoom(projectId, {
                      type: "ai:stream-chunk", chunk: cleaned, messageId, isThinking: false,
                    }, userId).catch(() => {});
                    await stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: cleaned }) });
                    lastSseEmitAt = Date.now();
                  } else {
                    // thinking
                    assistantThinking += chunk.content;
                    broadcastToRoom(projectId, {
                      type: "ai:stream-chunk", chunk: chunk.content, messageId, isThinking: true,
                    }, userId).catch(() => {});
                    await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: chunk.content }) });
                    lastSseEmitAt = Date.now();
                  }
                }
              } else if (sseData.type === "thinking") {
                // Native reasoning_delta — accumulate and broadcast
                const thinkingDelta = typeof sseData.data === "string" ? sseData.data : "";
                assistantThinking += thinkingDelta;
                broadcastToRoom(projectId, {
                  type: "ai:stream-chunk",
                  chunk: thinkingDelta,
                  messageId,
                  isThinking: true,
                }, userId).catch(() => {});
                await stream.writeSSE({ data: JSON.stringify(sseData) });
                lastSseEmitAt = Date.now();
              } else {
                // All non-text SSE events (tool_call, tool_result, status, error, etc.)
                // Broadcast tool_call / tool_result events
                if (sseData.type === "tool_call" || sseData.type === "tool_result") {
                  broadcastToRoom(projectId, {
                    type: "ai:tool-event",
                    messageId,
                    event: sseData.type,
                    data: (sseData.data ?? {}) as Record<string, unknown>,
                  }, userId).catch(() => {});
                }
                // Broadcast status & auto_fix_complete events
                if (sseData.type === "status" || sseData.type === "auto_fix_complete") {
                  broadcastToRoom(projectId, {
                    type: "ai:status",
                    messageId,
                    data: sseData.data,
                  }, userId).catch(() => {});
                }
                // Broadcast errors
                if (sseData.type === "error") {
                  broadcastToRoom(projectId, {
                    type: "ai:error",
                    messageId,
                    error: sseData.data,
                  }, userId).catch(() => {});
                }
                await stream.writeSSE({ data: JSON.stringify(sseData) });
                lastSseEmitAt = Date.now();
              }
            }

            // Break out of the loop when the SDK signals the SESSION is complete.
            // Only session-level events are terminal. assistant.message and
            // assistant.turn_end are PER-TURN events that fire between tool
            // calls in agentic workflows — treating them as terminal would
            // kill the stream after the first tool call, losing all
            // subsequent thinking/text/tool streaming.
            const SESSION_TERMINAL_EVENTS = new Set([
              "session.idle", "session.error", "done",
            ]);
            if (SESSION_TERMINAL_EVENTS.has(evtType)) {
              console.log(`[Chat] Session terminal event "${evtType}" — exiting stream loop for ${projectId}`);
              // Heartbeat: clear the in-flight tool marker
              lastToolName = undefined;
              friendlyLastTool = undefined;
              break;
            }
            // Log unexpected event types for debugging
            if (!sseData && !SESSION_TERMINAL_EVENTS.has(evtType) && ![
              "pending_messages.modified", "session.tools_updated", "session.usage_info",
              "session.background_tasks_changed",
              "assistant.usage", "hook.start", "hook.end", "user.message",
              "assistant.turn_start", "assistant.turn_end", "permission.requested",
              "permission.completed", "assistant.reasoning", "assistant.message",
              "assistant.streaming_delta", "assistant.reasoning_delta",
              "external_tool.requested", "external_tool.completed",
            ].includes(evtType)) {
              console.log(`[Chat] Unmapped SDK event: "${evtType}" for ${projectId}`);
            }
          }

          // Flush any buffered channel-router content at stream end
          for (const chunk of channelRouter.flush()) {
            if (!chunk.content) continue;
            if (chunk.type === "text") {
              const cleaned = sanitizeText(chunk.content);
              if (cleaned) {
                assistantContent += cleaned;
                await stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: cleaned }) });
              }
            } else {
              assistantThinking += chunk.content;
              await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: chunk.content }) });
            }
          }

          // ── Debug: stream summary ──
          console.log(`[Chat][${projectId.slice(0, 8)}] stream done — content: ${assistantContent.length} chars, thinking: ${assistantThinking.length} chars, toolCalls: ${hadToolCalls}, tools: ${assistantToolCalls.length}`);

          // ── Empty response detection + auto-retry ──
          // When the model produces absolutely nothing (0 content, 0 thinking,
          // 0 tool calls) the user sees a dead spinner. Retry once before giving up.
          // NIM free-tier models often return empty on first try due to rate limits.
          if (!assistantContent && !assistantThinking && !hadToolCalls) {
            console.warn(`[Chat][${projectId.slice(0, 8)}] empty response — auto-retrying once`);
            await stream.writeSSE({
              data: JSON.stringify({ type: "status", data: { phase: "retrying", message: "Model returned empty — retrying..." } }),
            });
            try {
              const retryStream = currentEngine.sendMessage(sessionId!, augmentedContent, fileAttachments.length > 0 ? fileAttachments : undefined);
              const retryRouter = new ChannelTokenRouter();
              const RETRY_TIMEOUT_MS = 30_000; // 30s max for retry
              const retryIterator = retryStream[Symbol.asyncIterator]();
              let retryDone = false;
              while (!retryDone) {
                const retryRace = await Promise.race([
                  retryIterator.next(),
                  new Promise<{ done: true; value: "retry-timeout" }>((r) =>
                    setTimeout(() => r({ done: true, value: "retry-timeout" }), RETRY_TIMEOUT_MS),
                  ),
                ]);
                if (retryRace.done) {
                  if (retryRace.value === "retry-timeout") console.warn(`[Chat][${projectId.slice(0, 8)}] retry timed out after ${RETRY_TIMEOUT_MS / 1000}s`);
                  retryDone = true;
                  break;
                }
                const retryEvent = retryRace.value;
                const rType = (retryEvent as Record<string, unknown>).type as string;
                const rData = (retryEvent as Record<string, unknown>).data as Record<string, unknown> | undefined;
                if (usageCollector) usageCollector.onUsageEvent(retryEvent);
                const retrySseData = mapEventToSSE(retryEvent);
                if (retrySseData?.type === "text_delta") {
                  const rawDelta = typeof retrySseData.data === "string" ? retrySseData.data : "";
                  for (const chunk of retryRouter.process(rawDelta)) {
                    if (!chunk.content) continue;
                    if (chunk.type === "text") {
                      const cleaned = sanitizeText(chunk.content);
                      if (cleaned) {
                        assistantContent += cleaned;
                        await stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: cleaned }) });
                      }
                    } else {
                      assistantThinking += chunk.content;
                      await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: chunk.content }) });
                    }
                  }
                } else if (retrySseData?.type === "thinking") {
                  const td = typeof retrySseData.data === "string" ? retrySseData.data : "";
                  assistantThinking += td;
                  await stream.writeSSE({ data: JSON.stringify(retrySseData) });
                } else if (retrySseData && retrySseData.type !== "done") {
                  // Forward tool_call, tool_result, error, status, etc.
                  if (retrySseData.type === "tool_call" || retrySseData.type === "tool_result") hadToolCalls = true;
                  await stream.writeSSE({ data: JSON.stringify(retrySseData) });
                }
                if (rType === "session.idle" || rType === "session.error" || rType === "done") { retryDone = true; break; }
              }
              for (const chunk of retryRouter.flush()) {
                if (!chunk.content) continue;
                if (chunk.type === "text") {
                  const cleaned = sanitizeText(chunk.content);
                  if (cleaned) { assistantContent += cleaned; await stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: cleaned }) }); }
                } else {
                  assistantThinking += chunk.content;
                  await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: chunk.content }) });
                }
              }
              console.log(`[Chat][${projectId.slice(0, 8)}] retry result — content: ${assistantContent.length} chars, thinking: ${assistantThinking.length} chars, toolCalls: ${hadToolCalls}`);
            } catch (retryErr) {
              console.warn(`[Chat][${projectId.slice(0, 8)}] retry failed:`, retryErr instanceof Error ? retryErr.message : String(retryErr));
            }
            // If STILL empty after retry, inform the user
            if (!assistantContent && !assistantThinking && !hadToolCalls) {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: "error",
                  data: "The AI model returned an empty response after retrying. This is usually a rate limiting issue. Try again in a moment, or switch to a different model in AI Settings.",
                }),
              });
            }
          }

          // If the loop exited (via timeout or terminal event) with pending
          // tool_calls that never got a tool_result, flush synthetic results
          // so the frontend can mark those actions as completed.
          for (const pendingName of pendingToolNames) {
            await stream.writeSSE({
              data: JSON.stringify({
                type: "tool_result",
                data: {
                  name: pendingName,
                  success: true,
                  friendlyMessage: "Done",
                },
              }),
            });
          }
          pendingToolNames.length = 0;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);

          // If streaming failed due to a stale auth token, evict the engine
          // so the next request gets a fresh one automatically.
          if (msg.includes("not authorized") || msg.includes("policy") || msg.includes("unauthorized")) {
            const manager = getCopilotManager();
            await manager.evictEngine(projectId);
            projectSessions.delete(sessionKey);
            console.log("[Chat] Evicted stale engine after streaming auth error");
          }

          await stream.writeSSE({
            data: JSON.stringify({ type: "error", data: msg }),
          });
        } finally {
          unsubToolEvents();
          releaseTracker();
          console.log(`[Chat] AI streaming complete for ${projectId}, starting post-processing...`);
        }

        // ── Auto-detect and fix preview errors ─────────────
        if (hadToolCalls && isProjectScaffolded(projectId)) {
          try {
          const MAX_FIX_ATTEMPTS = 3;
          let fixedSuccessfully = false;

          for (let attempt = 0; attempt < MAX_FIX_ATTEMPTS; attempt++) {
            // Status: checking
            await stream.writeSSE({
              data: JSON.stringify({
                type: "status",
                data: { phase: "checking", message: "Checking preview for errors..." },
              }),
            });

            // Give Vite time to process file changes (1.5s is enough for HMR)
            await new Promise((r) => setTimeout(r, 1500));
            const previewError = await detectPreviewError(projectId);
            if (!previewError) {
              if (attempt > 0) {
                // We fixed a previous error — notify
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "status",
                    data: { phase: "fixed", message: "Error fixed successfully" },
                  }),
                });
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "auto_fix_complete",
                    data: { success: true },
                  }),
                });
              }
              fixedSuccessfully = true;
              break;
            }

            console.log(
              `[Chat] Preview error detected (attempt ${attempt + 1}/${MAX_FIX_ATTEMPTS}): ${previewError.message.slice(0, 200)}`,
            );

            // Status: fixing
            await stream.writeSSE({
              data: JSON.stringify({
                type: "status",
                data: {
                  phase: "fixing",
                  message: "Found an error — fixing it automatically...",
                  attempt: attempt + 1,
                },
              }),
            });
            await stream.writeSSE({
              data: JSON.stringify({
                type: "text_delta",
                data: `\n\n---\n**Preview error detected — auto-fixing (attempt ${attempt + 1}/${MAX_FIX_ATTEMPTS})...**\n\n`,
              }),
            });

            try {
              const fixEngine = await getCopilotManager().getEngine(projectId, resolvedGithubToken);
              const FIX_TERMINAL_EVENTS = new Set([
                "session.idle", "done",
              ]);
              const FIX_IDLE_TIMEOUT_MS = 30_000;
              const FIX_TIMEOUT_SENTINEL = Symbol("fix-timeout");
              const fixStream = fixEngine.sendMessage(
                sessionId!,
                buildAutoFixPrompt(previewError.message),
              );
              const fixIter = fixStream[Symbol.asyncIterator]();
              let fixDone = false;
              while (!fixDone) {
                const fixResult = await Promise.race([
                  fixIter.next(),
                  new Promise<{ done: true; value: typeof FIX_TIMEOUT_SENTINEL }>((resolve) =>
                    setTimeout(() => resolve({ done: true, value: FIX_TIMEOUT_SENTINEL }), FIX_IDLE_TIMEOUT_MS),
                  ),
                ]);
                if (fixResult.done) {
                  if (fixResult.value === FIX_TIMEOUT_SENTINEL) {
                    console.log(`[Chat] Auto-fix generator idle for ${FIX_IDLE_TIMEOUT_MS / 1000}s — forcing exit for ${projectId}`);
                  }
                  fixDone = true;
                  break;
                }
                const event = fixResult.value as Record<string, unknown>;
                const sseData = mapEventToSSE(event);
                if (sseData) {
                  await stream.writeSSE({ data: JSON.stringify(sseData) });
                }
                // Guard against SDK generator hanging (same as main loop)
                const fixEvtType = event.type as string;
                if (FIX_TERMINAL_EVENTS.has(fixEvtType)) {
                  console.log(`[Chat] Auto-fix terminal event "${fixEvtType}" — exiting fix loop for ${projectId}`);
                  break;
                }
              }
            } catch (fixErr) {
              console.warn(
                `[Chat] Auto-fix attempt ${attempt + 1} failed:`,
                fixErr,
              );
              break;
            }

            // Status: verifying
            await stream.writeSSE({
              data: JSON.stringify({
                type: "status",
                data: { phase: "verifying", message: "Verifying the fix..." },
              }),
            });
          }

          // If we exhausted all attempts, do a final check
          if (!fixedSuccessfully) {
            await new Promise((r) => setTimeout(r, 1500));
            const finalError = await detectPreviewError(projectId);
            if (!finalError) {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: "status",
                  data: { phase: "fixed", message: "Error fixed successfully" },
                }),
              });
              await stream.writeSSE({
                data: JSON.stringify({
                  type: "auto_fix_complete",
                  data: { success: true },
                }),
              });
            } else {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: "auto_fix_complete",
                  data: { success: false, error: finalError.message },
                }),
              });
            }
          }
          } catch (autoFixErr) {
            console.warn("[Chat] Auto-fix system failed:", autoFixErr);
          }
        }

        // Auto-create a version snapshot after AI finishes making changes
        if (hadToolCalls && isProjectScaffolded(projectId)) {
          try {
            const projectPath = getProjectPath(projectId);

            // Use git-based versioning if available, otherwise legacy snapshots
            if (isGitRepo(projectPath)) {
              const commitInfo = await autoCommit(
                projectPath,
                content.slice(0, 100),
                { type: "ai", sessionMessageId: messageId }
              );
              if (commitInfo) {
                versionSha = commitInfo.sha;
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "version_created",
                    data: { sha: commitInfo.sha, messageId },
                  }),
                });
              }
            } else {
              await autoVersion(
                projectId,
                projectPath,
                content.slice(0, 100),
                userId
              );
            }
          } catch (vErr) {
            console.warn("[Chat] Auto-version failed:", vErr);
          }

          // Update project's updated_at so dashboard shows fresh data & cache busts thumbnails
          try {
            await sql`UPDATE projects SET updated_at = NOW() WHERE id = ${projectId}`;
          } catch {
            // Non-critical — don't break the chat if DB update fails
          }

          // Update .doable/memory.md with a summary of what was done
          try {
            const summary = content.slice(0, 120).replace(/\n/g, " ");
            await ctxManager.appendToMemory(
              projectId,
              `User asked: "${summary}${content.length > 120 ? "..." : ""}" — AI made file changes.`
            );
          } catch {
            // Non-critical — don't break if memory update fails
          }
        }

        // Capture thumbnail asynchronously (don't block the response)
        if (hadToolCalls) {
          scheduleThumbnailCapture(projectId);
        }

        // Broadcast stream end to collaborators
        broadcastToRoom(projectId, {
          type: "ai:stream-end",
          messageId,
          finalContent: assistantContent.slice(0, 500),
        }, userId).catch(() => {});

        // Final save of assistant message (update the pre-inserted row).
        // Save even when content is empty if tool calls were made — the task card
        // in history depends on tool_calls being persisted.
        if (assistantMessageId && (assistantContent || hadToolCalls)) {
          try {
            await sql`
              UPDATE ai_messages
              SET content = ${assistantContent || null},
                  tool_calls = ${assistantToolCalls.length > 0 ? sql.json(assistantToolCalls) : sql.json([])},
                  version_sha = ${versionSha ?? null},
                  had_tool_calls = ${hadToolCalls},
                  thinking_content = ${assistantThinking || null}
              WHERE id = ${assistantMessageId}
            `;
          } catch (e) {
            console.warn("[Chat] Failed to save assistant message:", e);
          }
        } else if (assistantMessageId) {
          // Remove empty placeholder only if AI produced nothing at all
          sql`DELETE FROM ai_messages WHERE id = ${assistantMessageId}`.catch(() => {});
        }

        // Clear active stream markers (in-memory + DB)
        activeRequests.delete(projectId);
        sql`DELETE FROM ai_active_streams WHERE project_id = ${projectId}`.catch(() => {});

        // In plan mode, save the assistant response as .doable/plan.md
        if (mode === "plan" && assistantContent) {
          try {
            const planContent = extractPlanFromResponse(assistantContent);
            if (planContent) {
              await ctxManager.updateContextFile(projectId, "plan.md", planContent);
            }
          } catch {
            // Non-critical — don't break if plan save fails
          }
        }

        clearInterval(keepAlive);
        clearInterval(softHeartbeat);
        // Flush usage data before closing the stream
        if (usageCollector) {
          try { await usageCollector.flush(); } catch { /* non-critical */ }
          const usage = usageCollector.getAccumulatedUsage();
          if (usage.tokensAvailable) {
            await stream.writeSSE({ data: JSON.stringify({ type: "usage", data: usage }) });
          }
        }
        // Explicit "done" signal so the frontend can render a complete state
        // before the stream tears down.
        try {
          await stream.writeSSE({
            data: JSON.stringify({ type: "status", data: { phase: "complete", message: "Done" } }),
          });
        } catch { /* stream already closed */ }
        console.log(`[Chat] Sending [DONE] for ${projectId}`);
        await stream.writeSSE({ data: "[DONE]" });
    } catch (err) {
      activeRequests.delete(projectId);
      sql`DELETE FROM ai_active_streams WHERE project_id = ${projectId}`.catch(() => {});
      clearInterval(keepAlive);
      clearInterval(softHeartbeat);
      // Flush partial usage data so it's not lost on error
      if (usageCollector) await usageCollector.flush().catch(() => {});
      // Copilot SDK is the core engine — surface the real error, don't work around it
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[Chat] Copilot SDK error:", errMsg);

      // Save partial assistant message so chat history isn't lost on error.
      // Preserve rows with tool calls even if no text content.
      if (assistantMessageId && (assistantContent || hadToolCalls)) {
        try {
          await sql`
            UPDATE ai_messages
            SET content = ${assistantContent || null},
                tool_calls = ${assistantToolCalls.length > 0 ? sql.json(assistantToolCalls) : sql.json([])},
                version_sha = ${versionSha ?? null},
                had_tool_calls = ${hadToolCalls},
                thinking_content = ${assistantThinking || null}
            WHERE id = ${assistantMessageId}
          `;
        } catch (e) {
          console.warn("[Chat] Failed to save partial assistant message:", e);
        }
      } else if (assistantMessageId) {
        sql`DELETE FROM ai_messages WHERE id = ${assistantMessageId}`.catch(() => {});
      }

      await stream.writeSSE({
        data: JSON.stringify({
          type: "error",
          data: `Copilot SDK error: ${errMsg}. Ensure you have a GitHub Copilot subscription or configure BYOK in settings.`,
        }),
      });
      await stream.writeSSE({ data: "[DONE]" });
    }
    });
  },
);

// ─── GET /projects/:id/ai-status ─ Is AI actively working? ──
// Called by frontend on page refresh to detect in-progress builds
// and start polling for updates instead of showing a dead page.
chatRoutes.use("/projects/:id/ai-status", authMiddleware);
chatRoutes.get("/projects/:id/ai-status", async (c) => {
  const projectId = c.req.param("id");
  const active = activeRequests.get(projectId);
  if (active) {
    return c.json({
      active: true,
      mode: active.mode,
      startedAt: active.startedAt,
      elapsed: Date.now() - active.startedAt,
    });
  }
  return c.json({ active: false });
});

// ─── GET /projects/:id/chat/status ─ DB-backed active stream check ──
// Complements /ai-status (in-memory). This one survives API restarts.
chatRoutes.get("/projects/:id/chat/status", async (c) => {
  const projectId = c.req.param("id");
  try {
    const [row] = await sql`
      SELECT message_id, started_at FROM ai_active_streams
      WHERE project_id = ${projectId}
    `;
    if (row) {
      const age = Date.now() - new Date(row.started_at).getTime();
      if (age > 5 * 60 * 1000) {
        sql`DELETE FROM ai_active_streams WHERE project_id = ${projectId}`.catch(() => {});
        return c.json({ streaming: false });
      }
      return c.json({ streaming: true, messageId: row.message_id, startedAt: row.started_at });
    }
    return c.json({ streaming: false });
  } catch {
    return c.json({ streaming: false });
  }
});

// ─── GET /projects/:id/chat/history ─ Chat history ──────────
chatRoutes.get("/projects/:id/chat/history", async (c) => {
  const projectId = c.req.param("id");
  const userId = c.get("userId")!;

  try {
    // Load from database — shared session (all users see all messages)
    const [dbSession] = await sql`
      SELECT id FROM ai_sessions
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC LIMIT 1
    `;

    if (!dbSession) {
      return c.json({ data: [] });
    }

    const messages = await sql`
      SELECT id, role, content, tool_calls, suggestions, tool_actions,
             sent_by_user_id, display_name, user_color, created_at,
             version_sha, had_tool_calls, thinking_content
      FROM ai_messages
      WHERE session_id = ${dbSession.id}
      ORDER BY created_at ASC
    `;

    return c.json({ data: messages });
  } catch (err) {
    console.warn("[Chat] Failed to load history from DB:", err);
    // Fallback to in-memory if DB fails
    const sessionId = projectSessions.get(projectId);
    if (!sessionId) return c.json({ data: [] });
    try {
      const engine = await getCopilotEngine();
      const messages = await engine.getSessionMessages(sessionId);
      return c.json({ data: messages });
    } catch {
      return c.json({ data: [] });
    }
  }
});

// ─── DELETE /projects/:id/chat ─ Clear chat ─────────────────
chatRoutes.delete("/projects/:id/chat", async (c) => {
  const projectId = c.req.param("id");
  const userId = c.get("userId")!;
  const sessionId = projectSessions.get(projectId);

  if (sessionId) {
    try {
      const engine = await getCopilotEngine();
      await engine.deleteSession(sessionId);
    } catch {
      // Ignore cleanup errors
    }
    projectSessions.delete(projectId);
  }

  // Also clear database messages (shared session — clears for all users)
  try {
    const [dbSession] = await sql`
      SELECT id FROM ai_sessions
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC LIMIT 1
    `;
    if (dbSession) {
      await sql`DELETE FROM ai_messages WHERE session_id = ${dbSession.id}`;
    }
  } catch (e) {
    console.warn("[Chat] Failed to clear DB messages:", e);
  }

  return c.json({ data: { cleared: true } });
});

// ─── POST /projects/:id/chat/abort ─ Abort current request ──
chatRoutes.post("/projects/:id/chat/abort", async (c) => {
  const projectId = c.req.param("id");
  // The main chat handler keys normal-mode sessions by projectId and
  // visual-edit by `${projectId}:visual-edit`. Try both so the abort
  // hits whichever session is currently active.
  const sessionId =
    projectSessions.get(projectId) ??
    projectSessions.get(`${projectId}:visual-edit`);

  if (sessionId) {
    // CRITICAL: abort must run on the per-project POOL engine that owns
    // the session. getCopilotEngine() returns a singleton with an empty
    // sessions map and the abort flag lands on the wrong engine instance.
    const engine = getCopilotManager().tryGetEngine(projectId);
    if (engine) {
      try {
        await engine.abortSession(sessionId);
      } catch {
        // Ignore
      }
    }
  }

  return c.json({ data: { aborted: true } });
});

// ─── POST /projects/:id/chat/fix-error ─ Fix runtime errors from preview ──
const fixErrorSchema = z.object({
  error: z.string().min(1).max(16_000),
  context: z.string().max(4000).optional(),
});

chatRoutes.post(
  "/projects/:id/chat/fix-error",
  zValidator("json", fixErrorSchema),
  async (c) => {
    const projectId = c.req.param("id");
    const { error, context } = c.req.valid("json");
    const userId = c.get("userId")!;

    // Must have an active session for this project
    const sessionId = projectSessions.get(projectId);
    if (!sessionId) {
      return c.json(
        { error: "No active chat session for this project. Send a chat message first." },
        400,
      );
    }

    if (!isProjectScaffolded(projectId)) {
      return c.json({ error: "Project is not scaffolded." }, 400);
    }

    const engine = await getCopilotEngine();

    return streamSSE(c, async (stream) => {
      let hadToolCalls = false;

      try {
        // Build a structured error fix message
        const fixMessage =
          `URGENT: The live preview has a runtime error that the user can see in their browser. You MUST fix this now.\n\n` +
          `Error details:\n${error}\n` +
          (context ? `\nContext:\n${context}\n` : "") +
          `\nRULES for fixing:\n` +
          `1. Read the file that has the error FIRST\n` +
          `2. If it's "Failed to resolve import 'X'" → install the package with install_package, then re-save the importing file\n` +
          `3. If it's a syntax error → read the file, find the exact issue, rewrite the COMPLETE file\n` +
          `4. If it's "X is not exported" → read the exporting file and fix the export\n` +
          `5. If it's a runtime error → read src/App.tsx and any mentioned files, fix the logic\n` +
          `6. After fixing, verify by reading the file again\n\n` +
          `Fix it now. Do NOT explain — just fix.`;

        // Status: starting fix
        await stream.writeSSE({
          data: JSON.stringify({
            type: "status",
            data: { phase: "fixing", message: "Found an error — fixing it automatically...", attempt: 1 },
          }),
        });

        // Stream the AI response
        const pendingToolNames: string[] = [];
        for await (const event of engine.sendMessage(sessionId, fixMessage)) {
          const sseData = mapEventToSSE(event);
          if (sseData) {
            if (sseData.type === "tool_call") {
              const toolData = sseData.data as Record<string, unknown>;
              if (toolData?.name) pendingToolNames.push(toolData.name as string);
            }
            if (sseData.type === "tool_result") {
              hadToolCalls = true;
              const resultData = sseData.data as Record<string, unknown>;
              if (!resultData?.name && pendingToolNames.length > 0) {
                resultData.name = pendingToolNames.shift();
              }
            }
            await stream.writeSSE({ data: JSON.stringify(sseData) });
          }
        }

        // After AI finishes, check if the fix actually worked
        await stream.writeSSE({
          data: JSON.stringify({
            type: "status",
            data: { phase: "verifying", message: "Verifying the fix..." },
          }),
        });

        await new Promise((r) => setTimeout(r, 1500));
        const remainingError = await detectPreviewError(projectId);

        if (!remainingError) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "status",
              data: { phase: "fixed", message: "Error fixed successfully" },
            }),
          });
          await stream.writeSSE({
            data: JSON.stringify({
              type: "auto_fix_complete",
              data: { success: true },
            }),
          });
        } else {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "auto_fix_complete",
              data: { success: false, error: remainingError.message },
            }),
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await stream.writeSSE({
          data: JSON.stringify({ type: "error", data: msg }),
        });
      }

      // Auto-create a version snapshot after AI finishes making changes
      if (hadToolCalls && isProjectScaffolded(projectId)) {
        try {
          const projectPath = getProjectPath(projectId);

          if (isGitRepo(projectPath)) {
            const commitInfo = await autoCommit(
              projectPath,
              `Fix runtime error: ${error.slice(0, 80)}`,
              { type: "ai" }
            );
            if (commitInfo) {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: "version_created",
                  data: { sha: commitInfo.sha },
                }),
              });
            }
          } else {
            await autoVersion(
              projectId,
              projectPath,
              `Fix runtime error: ${error.slice(0, 80)}`,
              userId,
            );
          }
        } catch (vErr) {
          console.warn("[Chat] Auto-version after fix-error failed:", vErr);
        }

        try {
          await sql`UPDATE projects SET updated_at = NOW() WHERE id = ${projectId}`;
        } catch {
          // Non-critical
        }

        // Re-capture thumbnail after fix (the previous one may show an error overlay)
        scheduleThumbnailCapture(projectId);
      }

      await stream.writeSSE({ data: "[DONE]" });
    });
  },
);

// ─── GET /ai/models ─ List available models ─────────────────
chatRoutes.get("/ai/models", async (c) => {
  try {
    const copilotAccountId = c.req.query("copilotAccountId");
    let githubToken: string | undefined;

    if (copilotAccountId) {
      githubToken = (await aiSettingsDb.getCopilotAccountToken(copilotAccountId)) ?? undefined;
    }

    // Key the pooled engine by account so each Copilot account gets its own
    // engine with its own token. Reusing a single "models" key would return
    // the engine cached for whichever token was passed first, and switching
    // accounts in the UI would silently keep listing the original account's
    // models — see CopilotEngineManager.getEngine, which doesn't compare
    // tokens against the cached entry.
    const engineKey = `models:${copilotAccountId ?? "default"}`;
    const manager = getCopilotManager();
    const engine = await manager.getEngine(engineKey, githubToken);
    const models = await engine.listModels();
    return c.json({ data: models });
  } catch (err) {
    return c.json({
      data: [],
      error: err instanceof Error ? err.message : "Failed to list models",
    });
  }
});

// ─── GET /ai/auth-status ─ Check Copilot auth status ────────
chatRoutes.get("/ai/auth-status", async (c) => {
  try {
    const engine = await getCopilotEngine();
    const status = await engine.getAuthStatus();
    return c.json({ data: status });
  } catch (err) {
    return c.json({
      data: { authenticated: false },
      error: err instanceof Error ? err.message : "Auth check failed",
    });
  }
});

// ─── POST /projects/:id/chat/suggestions ─ AI-powered suggestions ─
const suggestionsSchema = z.object({
  lastAssistantMessage: z.string().min(1).max(4000),
  userPrompt: z.string().min(1).max(4000),
});

chatRoutes.post(
  "/projects/:id/chat/suggestions",
  zValidator("json", suggestionsSchema),
  async (c) => {
    const projectId = c.req.param("id");
    const { lastAssistantMessage, userPrompt } = c.req.valid("json");

    try {
      // Resolve AI configs: suggestion-specific first, default as fallback
      const configs: Array<{
        model: string | undefined;
        githubToken: string | undefined;
        provider: ByokProviderConfig | undefined;
        label: string;
      }> = [];

      let settings: Awaited<ReturnType<typeof aiSettingsDb.getSettings>> | null = null;
      try {
        const [project] = await sql`SELECT workspace_id FROM projects WHERE id = ${projectId}`;
        if (project?.workspace_id) {
          settings = await aiSettingsDb.getSettings(project.workspace_id);
        }
      } catch (err) {
        console.error("[Chat] Failed to resolve suggestion settings:", err);
      }

      // Helper to resolve a provider config
      const resolveProvider = async (providerId: string | null | undefined): Promise<ByokProviderConfig | undefined> => {
        if (!providerId) return undefined;
        const providerData = await aiSettingsDb.getProviderWithKey(providerId);
        if (!providerData) return undefined;
        return {
          type: providerData.row.provider_type as "openai" | "azure" | "anthropic",
          baseUrl: providerData.row.base_url,
          apiKey: providerData.apiKey ?? undefined,
          bearerToken: providerData.bearerToken ?? undefined,
          ...(providerData.row.wire_api ? { wireApi: providerData.row.wire_api as "completions" | "responses" } : {}),
          ...(providerData.row.azure_api_version ? { azure: { apiVersion: providerData.row.azure_api_version } } : {}),
        };
      };

      if (settings) {
        if (settings.enforce_ai) {
          // Enforcement: single config, no fallback
          configs.push({
            model: settings.enforced_model ?? "gpt-4o-mini",
            githubToken: settings.enforced_copilot_account_id
              ? ((await aiSettingsDb.getCopilotAccountToken(settings.enforced_copilot_account_id)) ?? undefined)
              : undefined,
            provider: await resolveProvider(settings.enforced_provider_id),
            label: "enforced",
          });
        } else {
          // Suggestion-specific config — pick the side selected by
          // suggestion_source. Both copilot and custom may be persisted; we
          // must consult only the active side, never both.
          const useCustomSuggestion =
            settings.suggestion_source === "custom" && !!settings.suggestion_provider_id;
          const useCopilotSuggestion =
            settings.suggestion_source === "copilot" && !!settings.suggestion_copilot_account_id;

          if (useCustomSuggestion) {
            configs.push({
              model: settings.suggestion_provider_model ?? "gpt-4o-mini",
              githubToken: undefined,
              provider: await resolveProvider(settings.suggestion_provider_id),
              label: "suggestion",
            });
          } else if (useCopilotSuggestion) {
            configs.push({
              model: settings.suggestion_copilot_model ?? "gpt-4o-mini",
              githubToken: settings.suggestion_copilot_account_id
                ? ((await aiSettingsDb.getCopilotAccountToken(settings.suggestion_copilot_account_id)) ?? undefined)
                : undefined,
              provider: undefined,
              label: "suggestion",
            });
          }
          // No fallback to default workspace model — that may be an expensive
          // primary model (e.g. opus). The gpt-4o-mini fallback below covers
          // workspaces without any suggestion config.
        }
      }

      // Ensure there's always at least one config to try.
      // Use the workspace's default copilot account token so gpt-4o-mini
      // can authenticate even when no suggestion-specific model is set.
      if (configs.length === 0) {
        let fallbackToken: string | undefined;
        if (settings?.default_copilot_account_id) {
          fallbackToken = (await aiSettingsDb.getCopilotAccountToken(settings.default_copilot_account_id)) ?? undefined;
        }
        configs.push({ model: "gpt-4o-mini", githubToken: fallbackToken, provider: undefined, label: "fallback" });
      }

      const suggestionSystemPrompt = `You generate short, contextual next-step suggestion chips for an AI app builder. Given the user's last prompt and the AI's response, return exactly 4 suggestions as a JSON array of strings. Each suggestion should be 2-6 words, actionable, and relevant to what was just built. Do NOT include generic suggestions. Focus on what the user would logically want to do next with THIS specific app. Return ONLY the JSON array, no other text.`;
      const suggestionUserMessage = `User asked: "${userPrompt.slice(0, 200)}"\n\nAI built: "${lastAssistantMessage.slice(0, 500)}"\n\nReturn 4 contextual next-step suggestions as a JSON array:`;

      const manager = getCopilotManager();

      // Try each config in order until one succeeds.
      // withAutoRetry handles stale token eviction + retry transparently.
      for (const config of configs) {
        try {
          const suggestions = await manager.withAutoRetry("suggestions", config.githubToken, async (engine) => {
            const sessionId = await engine.createSession({
              projectId: "suggestions",
              userId: "system",
              model: config.model,
              ...(config.provider ? { provider: config.provider } : {}),
              systemPrompt: suggestionSystemPrompt,
            });

            const result = await engine.sendAndWait(sessionId, suggestionUserMessage, 15_000);
            engine.disconnectSession(sessionId).catch(() => {});

            const resultData = result?.data as Record<string, unknown> | undefined;
            const content = typeof resultData?.content === "string" ? resultData.content : "";

            const jsonMatch = content.match(/\[[\s\S]*?\]/);
            if (!jsonMatch) return null;

            const parsed = JSON.parse(jsonMatch[0]) as string[];
            return parsed.filter((s): s is string => typeof s === "string").slice(0, 5);
          });

          if (suggestions && suggestions.length > 0) {
            // Save suggestions to the last assistant message in DB
            const userId = c.get("userId")!;
            try {
              const [dbSession] = await sql`
                SELECT id FROM ai_sessions
                WHERE project_id = ${projectId} AND user_id = ${userId}
                ORDER BY created_at DESC LIMIT 1
              `;
              if (dbSession) {
                await sql`
                  UPDATE ai_messages
                  SET suggestions = ${sql.json(suggestions)}
                  WHERE id = (
                    SELECT id FROM ai_messages
                    WHERE session_id = ${dbSession.id} AND role = 'assistant'
                    ORDER BY created_at DESC LIMIT 1
                  )
                `;
              }
            } catch (e) {
              console.warn("[Chat] Failed to save suggestions:", e);
            }

            return c.json({ data: suggestions });
          }
          console.warn(`[Suggestions] Config '${config.label}' returned empty — trying next`);
        } catch (err) {
          console.warn(`[Suggestions] Config '${config.label}' (model=${config.model}) failed:`, err instanceof Error ? err.message : err);
          // Continue to next config
        }
      }

      console.warn("[Suggestions] All configs exhausted, returning empty");
      return c.json({ data: [] });
    } catch (err) {
      console.warn("[Suggestions] Failed:", err);
      return c.json({ data: [] });
    }
  },
);

// ─── Helpers ─────────────────────────────────────────────

interface SSEEvent {
  type: string;
  data: unknown;
}

/** Pretty-print a filename for creators (strip directory noise, keep readable) */
function prettyFileName(filePath?: string): string {
  if (!filePath) return "";
  const name = filePath.split("/").pop() ?? filePath;
  // Make component names more readable: "ProductCard.tsx" → "ProductCard"
  return name.replace(/\.(tsx?|jsx?|css|json|md|html)$/, "");
}

/** Describe what part of the project a path relates to */
function describeFileContext(filePath?: string): string {
  if (!filePath) return "";
  const lower = filePath.toLowerCase();
  if (lower.includes("/pages/") || lower.includes("/app/")) return "page";
  if (lower.includes("/components/ui/")) return "UI element";
  if (lower.includes("/components/")) return "component";
  if (lower.includes("/hooks/")) return "feature";
  if (lower.includes("/lib/") || lower.includes("/utils/")) return "utility";
  if (lower.includes("/styles/") || lower.endsWith(".css")) return "styles";
  if (lower.includes("layout")) return "layout";
  if (lower.includes("config") || lower.includes("vite.config") || lower.includes("tailwind")) return "configuration";
  if (lower.endsWith(".json")) return "configuration";
  if (lower.endsWith(".md")) return "documentation";
  return "file";
}

/** Generate a creator-friendly message for a tool operation (shown in real-time) */
function friendlyToolMessage(
  toolName: string,
  args?: Record<string, unknown>,
): string {
  const filePath = (args?.path ?? args?.filePath ?? args?.file) as string | undefined;
  const pretty = prettyFileName(filePath);
  const context = describeFileContext(filePath);
  const lower = toolName.toLowerCase();

  // Shell-ish tools: surface the actual command being run
  if (
    lower.includes("bash") ||
    lower.includes("shell") ||
    lower.includes("cmd") ||
    lower.includes("exec") ||
    lower.includes("run") ||
    lower.includes("terminal") ||
    lower.includes("command")
  ) {
    let cmd: string | undefined;
    const rawCmd = args?.command ?? args?.cmd;
    if (typeof rawCmd === "string" && rawCmd.trim()) {
      cmd = rawCmd.trim();
    } else if (args) {
      for (const value of Object.values(args)) {
        if (typeof value === "string" && value.trim()) {
          cmd = value.trim();
          break;
        }
      }
    }
    if (cmd) {
      if (cmd.length > 80) cmd = `${cmd.slice(0, 77)}...`;
      return `Running: ${cmd}`;
    }
    return "Running command";
  }

  if (lower.includes("create") || lower.includes("write")) {
    if (pretty) return `Building your ${context} \u2014 ${pretty}`;
    return `Running ${toolName}`;
  }
  if (lower.includes("edit") || lower.includes("update") || lower.includes("patch")) {
    if (pretty) return `Refining ${pretty}`;
    return `Running ${toolName}`;
  }
  if (lower.includes("read")) {
    if (pretty) return `Reviewing ${pretty}`;
    return `Running ${toolName}`;
  }
  if (lower.includes("search")) {
    const pattern = args?.pattern as string | undefined;
    if (pattern) return `Searching for "${pattern}"`;
    return `Running ${toolName}`;
  }
  if (lower.includes("install") || lower.includes("package")) {
    const rawPkgs = args?.packages;
    const pkgs = Array.isArray(rawPkgs) ? rawPkgs : typeof rawPkgs === "string" ? rawPkgs.split(/[\s,]+/).filter(Boolean) : [];
    if (pkgs.length > 0) {
      const names = pkgs.slice(0, 2).join(" & ");
      return `Adding ${names} to your toolkit`;
    }
    return "Adding new capabilities";
  }
  if (lower.includes("delete") || lower.includes("remove")) {
    if (pretty) return `Cleaning up ${pretty}`;
    return `Running ${toolName}`;
  }
  // Final fallback: show the raw tool name so the user at least sees what's happening
  return `Running ${toolName}`;
}

/**
 * Generate a creator-friendly result message for a completed tool operation.
 * Strips server paths and technical details, keeps it engaging.
 */
function friendlyToolResult(
  toolName: string,
  result?: unknown,
  success?: unknown,
): string {
  const lower = (toolName ?? "").toLowerCase();
  const ok = success !== false;

  if (!ok) {
    if (lower.includes("build")) return "Build ran into an issue \u2014 working on a fix";
    if (lower.includes("install")) return "Had trouble adding that package";
    return "Hit a snag \u2014 figuring it out";
  }

  if (lower.includes("create") || lower.includes("write")) return "Added to your project";
  if (lower.includes("edit") || lower.includes("update") || lower.includes("patch")) return "Changes applied";
  if (lower.includes("read")) return "Got it";
  if (lower.includes("list")) return "Project mapped out";
  if (lower.includes("search")) return "Search complete";
  if (lower.includes("install") || lower.includes("package")) return "Ready to use";
  if (lower.includes("build")) return "Build complete";
  if (lower.includes("delete") || lower.includes("remove")) return "Cleaned up";
  if (lower.includes("deploy")) return "Live and ready";

  return ok ? "Done" : "Issue encountered";
}

/**
 * Strip absolute server paths and humanize technical jargon
 * so the chat feels natural for creators, producers, and designers.
 *
 * Runs on every text token streamed to the frontend — must be fast.
 */

// Pre-compiled patterns for jargon replacement (word-boundary safe).
// Order matters: longer/more-specific phrases first to avoid partial matches.
const JARGON_MAP: Array<[RegExp, string]> = [
  // ── Database / SQL ───────────────────────────────────────
  [/\bSQL\s+migration(?:s)?\b/gi, "database update"],
  [/\bSQL\s+schema\b/gi, "data structure"],
  [/\bSQL\s+quer(?:y|ies)\b/gi, "data request"],
  [/\bSQL\s+table(?:s)?\b/gi, "data table"],
  [/\bSQL\s+column(?:s)?\b/gi, "data field"],
  [/\brun(?:ning)?\s+(?:the\s+)?migration(?:s)?\b/gi, "updating the database"],
  [/\bmigration\s+file(?:s)?\b/gi, "database update"],
  [/\bschema\s+migration(?:s)?\b/gi, "database update"],
  [/\bRow[- ]Level\s+Security\b/gi, "data protection rules"],
  [/\bRLS\s+polic(?:y|ies)\b/gi, "data protection rules"],
  [/\bforeign\s+keys\b/gi, "data links"],
  [/\bforeign\s+key\b/gi, "data link"],
  [/\bprimary\s+key\b/gi, "unique identifier"],
  [/\bPostgreSQL\s+database\b/gi, "database"],
  [/\bPostgres\s+database\b/gi, "database"],
  [/\bPostgreSQL\b/gi, "database"],
  [/\bPostgres\b/gi, "database"],
  [/\bSQL\b/g, "database"],
  [/\bCRUD\b/g, "create, read, update, delete"],

  // ── Build & tooling ─────────────────────────────────────
  [/\bVite\s+build\b/gi, "app build"],
  [/\bVite\s+dev\s+server\b/gi, "live preview server"],
  [/\bnpx\s+vite\b/gi, "build tool"],
  [/\bnode_modules\b/g, "dependencies"],
  [/\bpackage\.json\b/g, "project configuration"],
  [/\btsconfig\.json\b/g, "project settings"],
  [/\btailwind\.config\b/g, "style settings"],
  [/\bvite\.config\b/g, "build settings"],
  [/\bdevDependenc(?:y|ies)\b/gi, "development tools"],
  [/\b(?:run\s+)?npm\s+install\b/gi, "install packages"],
  [/\b(?:run\s+)?pnpm\s+add\b/gi, "install packages"],
  [/\b(?:run\s+)?yarn\s+add\b/gi, "install packages"],

  // ── Auth / security jargon ──────────────────────────────
  [/\bJWT\s+token(?:s)?\b/gi, "login session"],
  [/\bJWT\b/g, "authentication"],
  [/\bOAuth\s+2\.0\b/gi, "secure sign-in"],
  [/\bOAuth\b/gi, "secure sign-in"],
  [/\bBearer\s+token\b/gi, "access token"],
  [/\bCORS\s+(?:policy|config(?:uration)?|headers?)\b/gi, "security settings"],
  [/\bCORS\b/g, "cross-origin security"],
  [/\bmiddleware\b/gi, "security layer"],

  // ── API / networking ────────────────────────────────────
  [/\bAPI\s+endpoints\b/gi, "connection points"],
  [/\bAPI\s+endpoint\b/gi, "connection point"],
  [/\bREST\s+API\b/gi, "web service"],
  [/\bGraphQL\b/gi, "data query layer"],
  [/\bedge\s+functions\b/gi, "server functions"],
  [/\bedge\s+function\b/gi, "server function"],
  [/\bserverless\s+functions\b/gi, "server functions"],
  [/\bserverless\s+function\b/gi, "server function"],
  [/\bwebhooks\b/gi, "automated notifications"],
  [/\bwebhook\b/gi, "automated notification"],

  // ── Code structure (use lookaround for dotted extensions) ─
  [/\.tsx\s+files\b/gi, "components"],
  [/\.tsx\s+file\b/gi, "component"],
  [/\.ts\s+files\b/gi, "modules"],
  [/\.ts\s+file\b/gi, "module"],
  [/\.css\s+files\b/gi, "stylesheets"],
  [/\.css\s+file\b/gi, "stylesheet"],
  [/\.jsx\s+files\b/gi, "components"],
  [/\.jsx\s+file\b/gi, "component"],
];

function sanitizeText(text: string): string {
  if (!text) return text;

  let result = text;

  // 0. Strip leftover thinking/reasoning markers from all known model families
  //    <think>, </think> — DeepSeek-R1, Qwen3, Llama 3.x
  //    <|channel>thought, <channel>, <|channel|> — Gemma 4
  //    <rationale>, </rationale> — Claude (when prompted)
  //    <answer>, </answer> — DeepSeek (post-thinking answer marker)
  result = result.replace(/<\/?think>/gi, "");
  result = result.replace(/<\|?channel\|?>(?:thought)?/gi, "");
  result = result.replace(/<\/?rationale>/gi, "");
  result = result.replace(/<\/?answer>/gi, "");

  // 1. Strip absolute server paths
  //    e.g. /home/user/doable/projects/abc-123-def/src/App.tsx → src/App.tsx
  result = result.replace(
    /(?:[A-Za-z]:)?(?:[\\/][^\s:,)"']+)?[\\/]projects[\\/][a-f0-9-]+[\\/]/gi,
    "",
  );

  // 2. Humanize technical jargon
  for (const [pattern, replacement] of JARGON_MAP) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

/**
 * Stateful parser for model thinking markers.
 *
 * Supports ALL known model thinking/reasoning tag formats:
 * 1. Gemma 4:              `<|channel>thought\n...\n<channel>\n` or `<|channel|>thought`
 * 2. DeepSeek-R1/Qwen3/Llama: `<think>\n...\n</think>`
 * 3. DeepSeek distilled:   (may omit opening `<think>`, only emit `</think>` at end)
 * 4. Claude (prompted):    `<rationale>\n...\n</rationale>`
 * 5. DeepSeek answer:      `<answer>` tag stripped (content kept as text)
 *
 * Because streaming delivers tokens one at a time, the markers may be split
 * across multiple delta events. This class buffers partial markers and routes
 * content between them as `thinking` instead of `text_delta`.
 *
 * Usage: one instance per streaming session.
 */
class ChannelTokenRouter {
  /** True when we're inside a thinking block */
  private inThinking = false;
  /** Buffer for potential partial opening/closing markers */
  private buffer = "";
  /** Track whether any text has been emitted yet (for distilled model detection) */
  private hasEmittedText = false;

  // ── Regex patterns for opening/closing markers ──────────────────────
  // Opening: <think>, <rationale>, <|channel>thought, <|channel|>thought
  private static OPEN_RE = /<think>|<rationale>|<\|?channel\|?>thought/i;
  // Closing: </think>, </rationale>, <|channel|>, <channel>, <|channel>
  private static CLOSE_RE = /<\/think>|<\/rationale>|<\|?channel\|?>/i;
  // Partial trailing: could be start of any marker (buffered across deltas)
  private static PARTIAL_OPEN_RE =
    /<\/?(?:\|?c?h?a?n?n?e?l?\|?>?t?h?o?u?g?h?t?|t?h?i?n?k?>?|r?a?t?i?o?n?a?l?e?>?)$/i;
  private static PARTIAL_CLOSE_RE =
    /<\/?(?:\|?c?h?a?n?n?e?l?\|?>?|t?h?i?n?k?>?|r?a?t?i?o?n?a?l?e?>?)$/i;
  // Answer tag: <answer>, </answer> — strip marker, keep content as text
  private static ANSWER_RE = /<\/?answer>/gi;

  /**
   * Process a delta token and return categorized chunks.
   * Returns array of { type: "text" | "thinking", content: string }
   */
  process(delta: string): Array<{ type: "text" | "thinking"; content: string }> {
    const results: Array<{ type: "text" | "thinking"; content: string }> = [];
    const input = this.buffer + delta;
    this.buffer = "";

    // Strip <answer> / </answer> markers entirely (keep surrounding content)
    let remaining = input.replace(ChannelTokenRouter.ANSWER_RE, "");

    while (remaining.length > 0) {
      if (this.inThinking) {
        // Inside thinking block — look for any closing marker
        const closeIdx = remaining.search(ChannelTokenRouter.CLOSE_RE);
        if (closeIdx === -1) {
          // Check if trailing chars could be a partial closing marker
          const trailingMatch = remaining.match(ChannelTokenRouter.PARTIAL_CLOSE_RE);
          if (trailingMatch && trailingMatch.index !== undefined) {
            const before = remaining.slice(0, trailingMatch.index);
            if (before) results.push({ type: "thinking", content: before });
            this.buffer = trailingMatch[0];
          } else {
            if (remaining) results.push({ type: "thinking", content: remaining });
          }
          remaining = "";
        } else {
          // Found closing marker
          const before = remaining.slice(0, closeIdx);
          if (before) results.push({ type: "thinking", content: before });
          const closeMatch = remaining.slice(closeIdx).match(ChannelTokenRouter.CLOSE_RE);
          const markerLen = closeMatch ? closeMatch[0].length : 1;
          remaining = remaining.slice(closeIdx + markerLen);
          if (remaining.startsWith("\n")) remaining = remaining.slice(1);
          this.inThinking = false;
        }
      } else {
        // Outside thinking block — look for any opening marker
        const openIdx = remaining.search(ChannelTokenRouter.OPEN_RE);

        // Also check for orphaned </think> or </rationale> (distilled models
        // that omit the opening tag — all content before it is thinking)
        const orphanCloseIdx = remaining.search(ChannelTokenRouter.CLOSE_RE);

        if (openIdx === -1 && orphanCloseIdx !== -1 && !this.hasEmittedText) {
          // Distilled-model case: </think> without prior <think>.
          // Everything before the close marker was thinking all along.
          const before = remaining.slice(0, orphanCloseIdx);
          if (before) results.push({ type: "thinking", content: before });
          const closeMatch = remaining.slice(orphanCloseIdx).match(ChannelTokenRouter.CLOSE_RE);
          const markerLen = closeMatch ? closeMatch[0].length : 1;
          remaining = remaining.slice(orphanCloseIdx + markerLen);
          if (remaining.startsWith("\n")) remaining = remaining.slice(1);
          // Don't set inThinking — it was already closed
        } else if (openIdx === -1) {
          // No opening marker — check for partial trailing marker
          const trailingMatch = remaining.match(ChannelTokenRouter.PARTIAL_OPEN_RE);
          if (trailingMatch && trailingMatch.index !== undefined && trailingMatch[0].startsWith("<")) {
            const before = remaining.slice(0, trailingMatch.index);
            if (before) {
              results.push({ type: "text", content: before });
              this.hasEmittedText = true;
            }
            this.buffer = trailingMatch[0];
          } else {
            if (remaining) {
              results.push({ type: "text", content: remaining });
              this.hasEmittedText = true;
            }
          }
          remaining = "";
        } else {
          // Found opening marker
          const before = remaining.slice(0, openIdx);
          if (before) {
            results.push({ type: "text", content: before });
            this.hasEmittedText = true;
          }
          const openMatch = remaining.slice(openIdx).match(/<think>|<rationale>|<\|?channel\|?>thought[^\n]*/i);
          const markerLen = openMatch ? openMatch[0].length : 1;
          remaining = remaining.slice(openIdx + markerLen);
          if (remaining.startsWith("\n")) remaining = remaining.slice(1);
          this.inThinking = true;
        }
      }
    }

    return results;
  }

  /** Flush any buffered content at stream end */
  flush(): Array<{ type: "text" | "thinking"; content: string }> {
    if (!this.buffer) return [];
    const content = this.buffer;
    this.buffer = "";
    return [{ type: this.inThinking ? "thinking" : "text", content }];
  }
}

function mapEventToSSE(event: Record<string, unknown>): SSEEvent | null {
  const type = event.type as string;
  const data = event.data as Record<string, unknown> | undefined;

  switch (type) {
    // ─── Streaming text deltas (token-by-token from SDK) ──
    case "assistant.message_delta": {
      // SDK streaming: { deltaContent: "token" } — this is the real streaming event
      const delta = (data?.deltaContent ?? "") as string;
      if (!delta) return null;
      return { type: "text_delta", data: sanitizeText(delta) };
    }

    // ─── SDK v0.2.0 streaming delta (raw text chunks) ────
    case "assistant.streaming_delta": {
      // SDK v0.2.0 delivers text tokens via streaming_delta alongside message_delta.
      // The data shape varies — try common fields.
      const streamDelta = (data?.deltaContent ?? data?.content ?? data?.delta ?? "") as string;
      if (!streamDelta) return null;
      return { type: "text_delta", data: sanitizeText(streamDelta) };
    }

    // ─── Final complete message (sent after streaming ends) ─
    case "assistant.message":
      // Skip — deltas and streaming_delta already sent text incrementally.
      // The full content is captured separately for DB persistence in the
      // streaming loop (evtType === "assistant.message" check).
      return null;

    // ─── Legacy / direct provider text events ─────────────
    case "text_delta": {
      const raw = (data?.content ?? data ?? "") as string;
      return { type: "text_delta", data: sanitizeText(String(raw)) };
    }

    // ─── Streaming reasoning deltas (token-by-token thinking) ──
    case "assistant.reasoning_delta": {
      const reasoningDelta = (data?.deltaContent ?? "") as string;
      if (!reasoningDelta) return null;
      return { type: "thinking", data: reasoningDelta };
    }

    // ─── Final reasoning block ────────────────────────────
    case "assistant.reasoning":
      // Skip — deltas already sent thinking content
      return null;

    // ─── Thinking / reasoning (legacy events) ─────────────
    case "assistant.thinking":
      return { type: "thinking", data: data?.content ?? "" };

    // ─── Tool calls (starting) ────────────────────────────
    case "tool.running":
    case "tool.execution_start": {
      const toolName = (data?.toolName ?? data?.name) as string | undefined;
      const toolArgs = data?.arguments as Record<string, unknown> | undefined;
      // Strip file paths from arguments before sending to frontend
      const safeArgs = toolArgs ? { ...toolArgs } : undefined;
      if (safeArgs) {
        delete safeArgs.content; // Never send full file content to chat
      }
      return {
        type: "tool_call",
        data: {
          name: toolName,
          friendlyMessage: toolName ? friendlyToolMessage(toolName, toolArgs) : undefined,
          arguments: safeArgs, // frontend can render command preview
        },
      };
    }
    // external_tool.requested is a duplicate of tool.execution_start — skip to
    // avoid double tool_call SSE events that confuse frontend pairing.
    case "external_tool.requested":
      return null;

    // ─── Tool results (completed) ─────────────────────────
    case "tool.completed":
    case "tool.execution_complete": {
      const resultToolName = (data?.toolName ?? data?.name) as string;
      return {
        type: "tool_result",
        data: {
          name: resultToolName,
          success: data?.success,
          friendlyMessage: friendlyToolResult(resultToolName, data?.result, data?.success),
        },
      };
    }
    // external_tool.completed is a duplicate of tool.execution_complete — skip
    // to avoid double tool_result SSE events.
    case "external_tool.completed":
      return null;

    // ─── Errors ───────────────────────────────────────────
    case "session.error": {
      const rawMsg = String(data?.message ?? data?.errorType ?? "Unknown error");
      const statusCode = data?.statusCode as number | undefined;
      let userMsg: string;
      if (statusCode === 404 || rawMsg.includes("404")) {
        userMsg = "The AI model is unavailable (404). Check your model ID and provider settings.";
      } else if (statusCode === 401 || rawMsg.includes("unauthorized") || rawMsg.includes("not authorized")) {
        userMsg = "Authentication failed with the AI provider. Check your API key.";
      } else if (statusCode === 429 || rawMsg.includes("rate limit")) {
        userMsg = "Rate limit reached. Please wait and try again.";
      } else {
        userMsg = sanitizeText(rawMsg);
      }
      return { type: "error", data: userMsg };
    }

    // ─── Done ─────────────────────────────────────────────
    case "session.idle":
    case "done":
      return { type: "done", data: {} };

    // ─── Skip noise events ────────────────────────────────
    case "pending_messages.modified":
    case "session.tools_updated":
    case "session.usage_info":
    case "assistant.usage":
    case "hook.start":
    case "hook.end":
    case "user.message":
    case "assistant.turn_start":
    case "assistant.turn_end":
    case "permission.requested":
    case "permission.completed":
    case "model_call":
    case "model_call.start":
    case "model_call.end":
      return null;

    default:
      // Log unknown events for debugging but don't forward to client
      // to prevent internal SDK data from leaking into the UI
      console.debug(`[mapEventToSSE] unhandled event type: ${type}`);
      return null;
  }
}

// ─── AI Message Queue ─────────────────────────────────────────

chatRoutes.use("/projects/:id/chat/queue", authMiddleware);
chatRoutes.use("/projects/:id/chat/queue/*", authMiddleware);

// GET /projects/:id/chat/queue — list queued messages
chatRoutes.get("/projects/:id/chat/queue", async (c) => {
  const projectId = c.req.param("id");
  try {
    const queue = await sql`
      SELECT id, user_id, display_name, user_color, content, position, status, created_at
      FROM ai_message_queue
      WHERE project_id = ${projectId} AND status = 'queued'
      ORDER BY position ASC
    `;
    return c.json({ data: queue });
  } catch (err) {
    return c.json({ data: [], error: String(err) }, 500);
  }
});

// POST /projects/:id/chat/queue — add message to queue
chatRoutes.post(
  "/projects/:id/chat/queue",
  zValidator("json", z.object({
    content: z.string().min(1).max(32_000),
    displayName: z.string().optional(),
    userColor: z.string().optional(),
  })),
  async (c) => {
    const projectId = c.req.param("id");
    const userId = c.get("userId")!;
    const { content, displayName, userColor } = c.req.valid("json");

    try {
      // Get the next position
      const [maxPos] = await sql`
        SELECT COALESCE(MAX(position), 0) as max_pos
        FROM ai_message_queue
        WHERE project_id = ${projectId} AND status = 'queued'
      `;
      const position = (maxPos?.max_pos ?? 0) + 1;

      const [queued] = await sql`
        INSERT INTO ai_message_queue (project_id, user_id, display_name, user_color, content, position)
        VALUES (${projectId}, ${userId}, ${displayName ?? ""}, ${userColor ?? ""}, ${content}, ${position})
        RETURNING id, position
      `;

      // Broadcast queue update
      const allQueued = await sql`
        SELECT id, user_id, display_name, content, position
        FROM ai_message_queue
        WHERE project_id = ${projectId} AND status = 'queued'
        ORDER BY position ASC
      `;
      broadcastToRoom(projectId, {
        type: "ai:queue-update",
        queue: allQueued.map((q: any) => ({
          id: q.id,
          userId: q.user_id,
          displayName: q.display_name,
          content: q.content.slice(0, 100),
          position: q.position,
        })),
      }).catch(() => {});

      return c.json({ data: { id: queued?.id, position: queued?.position } });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  }
);

// DELETE /projects/:id/chat/queue/:queueId — cancel a queued message
chatRoutes.delete("/projects/:id/chat/queue/:queueId", async (c) => {
  const projectId = c.req.param("id");
  const queueId = c.req.param("queueId");

  try {
    await sql`
      UPDATE ai_message_queue
      SET status = 'cancelled', completed_at = NOW()
      WHERE id = ${queueId} AND project_id = ${projectId} AND status = 'queued'
    `;

    // Broadcast updated queue
    const allQueued = await sql`
      SELECT id, user_id, display_name, content, position
      FROM ai_message_queue
      WHERE project_id = ${projectId} AND status = 'queued'
      ORDER BY position ASC
    `;
    broadcastToRoom(projectId, {
      type: "ai:queue-update",
      queue: allQueued.map((q: any) => ({
        id: q.id,
        userId: q.user_id,
        displayName: q.display_name,
        content: q.content.slice(0, 100),
        position: q.position,
      })),
    }).catch(() => {});

    return c.json({ data: { cancelled: true } });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

