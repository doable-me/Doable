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
import { aiSettingsQueries } from "@doable/db";
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

export const chatRoutes = new Hono<AuthEnv>();
const aiSettingsDb = aiSettingsQueries(sql, process.env.ENCRYPTION_KEY);
const ctxManager = contextManager(sql);

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
      const [project] = await sql`SELECT visibility FROM projects WHERE id = ${projectId}`;
      if (project?.visibility === 'public') {
        await sql`
          INSERT INTO project_collaborators (project_id, user_id, role)
          VALUES (${projectId}, ${userId}, 'editor')
          ON CONFLICT DO NOTHING
        `;
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
          // No enforcement and no explicit overrides — walk down the chain

          // ── Tier 3: User preferences ──
          if (config.user_copilot_account_id || config.user_provider_id) {
            selectedCopilotAccountId = config.user_copilot_account_id ?? undefined;
            selectedProviderId = config.user_provider_id ?? undefined;
            if (!resolvedModel && config.user_model) {
              resolvedModel = config.user_model;
            }
          }
          // ── Tier 4: Workspace defaults ──
          else {
            selectedCopilotAccountId = config.default_copilot_account_id ?? undefined;
            selectedProviderId = config.default_provider_id ?? undefined;
            if (!resolvedModel && config.default_model) {
              resolvedModel = config.default_model;
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
        const res = await fetch(`${base}/${file}`, { headers });
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

// Track active AI work per project — allows clients to detect ongoing work after refresh
const activeAiSessions = new Map<string, { startedAt: number; mode: string; userId: string }>();

// ─── Debounce guard for thumbnail captures ─
const captureInProgress = new Set<string>();

/**
 * Schedule a thumbnail capture for a project. Debounced — only one
 * capture runs at a time per project. Waits for Vite HMR to settle
 * before taking the screenshot.
 *
 * @param projectId - The project to capture
 * @param delayMs - How long to wait for Vite HMR to settle (default: 3000)
 */
function scheduleThumbnailCapture(projectId: string, delayMs = 5000): void {
  if (captureInProgress.has(projectId)) {
    console.log(`[Thumbnail] Skipping capture for ${projectId} — already in progress`);
    return;
  }
  captureInProgress.add(projectId);

  const internalUrl = getDevServerInternalUrl(projectId);
  if (!internalUrl) {
    console.warn(`[Thumbnail] No dev server URL for ${projectId} — skipping capture`);
    captureInProgress.delete(projectId);
    return;
  }

  // Use the API server's proxy URL — Puppeteer loads through the reverse proxy
  // so assets, HMR, and base paths resolve correctly (same as the browser).
  const apiPort = parseInt(process.env.API_PORT ?? "4000", 10);
  const apiHost = process.env.API_HOST ?? "127.0.0.1";
  const previewUrl = `http://${apiHost}:${apiPort}/preview/${projectId}/`;
  console.log(`[Thumbnail] Scheduling capture for ${projectId} in ${delayMs}ms (preview: ${previewUrl})`);

  setTimeout(() => {
    import("../thumbnails/capture.js")
      .then(({ captureProjectThumbnail }) =>
        captureProjectThumbnail(projectId, previewUrl, { retries: 2, retryDelayMs: 3000 })
      )
      .then(async (filePath) => {
        if (filePath) {
          try {
            const thumbnailUrl = `/thumbnails/${projectId}.png`;
            await sql`UPDATE projects SET thumbnail_url = ${thumbnailUrl} WHERE id = ${projectId}`;
          } catch (e) {
            console.warn("[Thumbnail] Failed to save URL to DB:", e);
          }
        }
      })
      .finally(() => captureInProgress.delete(projectId))
      .catch(console.warn);
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
    // Anti-buffering headers for Cloudflare Tunnel and other reverse proxies
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
    // Keep-alive: send periodic SSE pings to prevent Cloudflare Tunnel
    // and other proxies from closing the connection during slow operations
    // (session creation, AI thinking, tool execution, etc.)
    const keepAlive = setInterval(async () => {
      try {
        await stream.writeSSE({ data: JSON.stringify({ type: "keep_alive" }) });
      } catch { /* stream already closed */ }
    }, 10_000);

    // Declare assistant tracking variables OUTSIDE try block so the outer
    // catch can access them for partial message persistence on error.
    let hadToolCalls = false;
    const pendingToolNames: string[] = [];
    let assistantContent = "";
    let assistantMessageId: string | undefined;
    let lastFlushLen = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let assistantToolCalls: any[] = [];
    let unsubToolEvents: (() => void) = () => {};

    try {
      // Send initial status so the client knows we're alive
      await stream.writeSSE({
        data: JSON.stringify({ type: "status", data: "Setting up..." }),
      });

      // Auto-scaffold the project if it hasn't been created yet
      if (!isProjectScaffolded(projectId)) {
        try {
          await stream.writeSSE({
            data: JSON.stringify({ type: "status", data: "Creating project files..." }),
          });
          console.log(`[Chat] Auto-scaffolding project ${projectId}`);
          await stream.writeSSE({
            data: JSON.stringify({ type: "status", data: "Installing dependencies — this may take a moment..." }),
          });
          await createProject(projectId);
          await stream.writeSSE({
            data: JSON.stringify({ type: "status", data: "Dependencies installed" }),
          });
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
            data: JSON.stringify({ type: "status", data: "Starting live preview..." }),
          });
          console.log(`[Chat] Auto-starting dev server for project ${projectId}`);
          await startDevServer(projectId);
          await stream.writeSSE({
            data: JSON.stringify({ type: "status", data: "Live preview ready" }),
          });
        } catch (err) {
          console.error(`[Chat] Dev server start failed for project ${projectId}:`, err);
        }
      }

      // ── Resolve AI config via fallback chain ──
      await stream.writeSSE({
        data: JSON.stringify({ type: "thinking", data: "Connecting to AI..." }),
      });
      const {
        model: resolvedModel,
        provider: resolvedProvider,
        githubToken: resolvedGithubToken,
      } = await resolveAiEngine(projectId, userId, {
        copilotAccountId,
        providerId,
        provider: provider as ByokProviderConfig | undefined,
        model,
      });

      // Get or create session for this project.
      // Visual-edit mode uses a separate session key so it doesn't
      // pollute the main chat context with element-level edits.
      const sessionKey = mode === "visual-edit" ? `${projectId}:visual-edit` : projectId;
      // Look up workspace for multi-scope context + MCP tools
      let workspaceId: string | undefined;
      try {
        const [proj] = await sql`SELECT workspace_id FROM projects WHERE id = ${projectId}`;
        workspaceId = proj?.workspace_id;
      } catch { /* ignore */ }

      // Pre-compute system prompt & context — needed both for fresh sessions
      // and for session recreation after engine recycling.
      const previewUrl = getDevServerUrl(projectId);
      const projectContext = await buildProjectContextForMode(projectId, mode, workspaceId, userId);

      const systemPrompt =
          mode === "plan"
            ? `You are Doable's planning assistant. You help people plan what they want to build — like a friendly product collaborator, not a developer.

CRITICAL: The user is likely a designer, business owner, creator, or someone with no coding background. NEVER use technical language. No file paths, no component names, no framework jargon, no "API", no "state management", no "routing". Speak in terms of what the user will SEE and EXPERIENCE.

You have two tools:
- ask_clarification: Ask 2-4 simple questions about what the user wants
- create_plan: Create a step-by-step plan the user can review and approve

Workflow:
1. Quietly read the codebase (use read_file, list_files) — do NOT mention files or code to the user
2. If the request is vague, call ask_clarification with friendly, non-technical questions
3. Once you understand what they want, call create_plan with a clear plan

QUESTION RULES (ask_clarification):
- Ask about the USER'S goals, not implementation details
- Good: "What's this app for?", "Who will use it?", "What should it look like?"
- Bad: "Should I use React Router?", "Do you want local state or a database?", "Which API?"
- Options should describe experiences, not technologies: "Clean and minimal" not "Tailwind with white background"
- Frame options as outcomes: "Users can save favorites" not "Add localStorage persistence"
- Maximum 4 questions, keep them short and conversational
- NEVER mention React, TypeScript, Tailwind, Vite, components, hooks, or any technical term

PLAN RULES (create_plan):
- Step titles describe what the user will SEE: "Add a sidebar with navigation" not "Create NavSidebar component"
- Step descriptions explain the EXPERIENCE: "Users will see a clean list of their tasks with checkboxes" not "Render a TaskList component with map over state array"
- NEVER mention file paths, imports, packages, or code in titles or descriptions
- Technical details (for the AI to use later during build) go ONLY in the hidden "details" field
- Complexity should be from the user's perspective: "simple" = quick, "moderate" = a few screens, "complex" = lots of features
- Keep the summary to 1-2 sentences a non-technical person would understand

Do NOT execute any file changes. Only plan.
You MUST call ask_clarification or create_plan — do not just output text.

${previewUrl ? `Preview: ${previewUrl}` : ""}${projectContext}`
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

      let sessionId = projectSessions.get(sessionKey);
      if (!sessionId) {
        // Send keep-alive status — session creation can be slow
        await stream.writeSSE({
          data: JSON.stringify({ type: "thinking", data: "Connecting to AI..." }),
        });

        const projectPath = getProjectPath(projectId);
        const allTools = await createAllTools(projectId, workspaceId, userId);

        // Use withAutoRetry to handle stale Copilot API tokens —
        // if session creation fails with an auth error, the manager evicts
        // the cached engine, creates a fresh one, and retries.
        const manager = getCopilotManager();
        sessionId = await manager.withAutoRetry(resolvedGithubToken, async (eng) => {
          return eng.createSession({
            projectId,
            userId,
            model: resolvedModel,
            provider: resolvedProvider,
            workingDirectory: projectPath,
            systemPrompt,
            tools: allTools,
            // SDK hooks — called via RPC for guaranteed progress updates
            toolProgress: {
              onToolStart: (toolName, args) => {
                console.log(`[Hook] Tool start: ${toolName}`);
                const friendly = friendlyToolMessage(toolName, args as Record<string, unknown>);
                stream.writeSSE({ data: JSON.stringify({
                  type: "tool_call", data: { name: toolName, friendlyMessage: friendly },
                }) }).catch(() => {});
              },
              onToolEnd: (toolName, args, result) => {
                console.log(`[Hook] Tool end: ${toolName}`);
                hadToolCalls = true;
                const friendly = friendlyToolResult(toolName, result, true);
                stream.writeSSE({ data: JSON.stringify({
                  type: "tool_result", data: { name: toolName, success: true, friendlyMessage: friendly },
                }) }).catch(() => {});

                // Plan Mode V2: Save plan to DB when create_plan tool completes
                // The SDK hook result is the handler's return value: { success, plan, message }
                if (toolName === "create_plan" && result) {
                  try {
                    const r = result as Record<string, unknown>;
                    const plan = r.plan as Record<string, unknown> | undefined;
                    if (plan?.id) {
                      sql`INSERT INTO plans (id, project_id, summary, complexity, status, created_at)
                          VALUES (${plan.id as string}, ${projectId}, ${plan.summary as string}, ${plan.complexity as string}, 'draft', now())
                          ON CONFLICT (id) DO NOTHING`.catch((e) => console.error("[Plan] DB save failed:", e));
                      const steps = plan.steps as Array<Record<string, unknown>> | undefined;
                      if (Array.isArray(steps)) {
                        for (const step of steps) {
                          sql`INSERT INTO plan_steps (id, plan_id, "order", title, description, details, status, file_paths)
                              VALUES (${step.id as string}, ${plan.id as string}, ${step.order as number}, ${step.title as string}, ${step.description as string}, ${(step.details as string) ?? null}, 'pending', ${(step.filePaths as string[]) ?? null})
                              ON CONFLICT (id) DO NOTHING`.catch((e) => console.error("[Plan] Step save failed:", e));
                        }
                      }
                      console.log(`[Plan] Saved plan ${plan.id} with ${steps?.length ?? 0} steps to DB`);
                    }
                  } catch (e) { console.error("[Plan] DB save error:", e); }
                }
              },
              onSessionEnd: (reason, error) => {
                console.log(`[Hook] Session end: ${reason}${error ? ` — ${error}` : ""}`);
              },
              onError: (error, context) => {
                console.error(`[Hook] Error (${context}): ${error}`);
                stream.writeSSE({ data: JSON.stringify({
                  type: "error", data: `${context}: ${error}`,
                }) }).catch(() => {});
              },
            },
          });
        });
        projectSessions.set(sessionKey, sessionId);
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
        } else {
          const [newSession] = await sql`
            INSERT INTO ai_sessions (project_id, user_id, mode)
            VALUES (${projectId}, ${userId}, ${mode})
            RETURNING id
          `;
          dbSessionId = newSession?.id;
        }
      } catch (e) {
        console.warn("[Chat] DB session lookup failed:", e);
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
        try {
          // Get a fresh engine reference — the pooled engine may have been
          // recycled since resolveAiEngine ran (max-age, idle, or eviction).
          const manager = getCopilotManager();
          let currentEngine = await manager.getEngine(resolvedGithubToken);

          // Subscribe to tool execution events so we can push live status to the client
          // while the Copilot SDK executes tools silently in the background.
          unsubToolEvents = onToolEvent(projectId, (toolName, status, args) => {
            hadToolCalls = true;
            const friendly = friendlyToolMessage(toolName, args);
            const ssePayload = status === "start"
              ? { type: "tool_call", data: { name: toolName, friendlyMessage: friendly, arguments: args } }
              : { type: "tool_result", data: { name: toolName, success: true, friendlyMessage: friendly } };
            stream.writeSSE({ data: JSON.stringify(ssePayload) }).catch(() => {});

            // Plan Mode V2: Emit plan events from tool event bridge
            if (status === "end" && toolName === "ask_clarification" && args?.output) {
              try {
                const questions = JSON.parse(args.output as string);
                if (Array.isArray(questions)) {
                  stream.writeSSE({ data: JSON.stringify({ type: "clarification", data: { questions } }) }).catch(() => {});
                }
              } catch { /* ignore */ }
            }
            if (status === "end" && toolName === "create_plan" && args?.output) {
              try {
                const plan = JSON.parse(args.output as string);
                if (plan?.id) {
                  stream.writeSSE({ data: JSON.stringify({ type: "plan", data: { plan } }) }).catch(() => {});
                }
              } catch { /* ignore */ }
            }
            // Broadcast to collaborators
            broadcastToRoom(projectId, {
              type: "ai:tool-event", messageId,
              event: status === "start" ? "tool_call" : "tool_result",
              data: (ssePayload.data ?? {}) as Record<string, unknown>,
            }, userId).catch(() => {});
            // Persist tool calls progressively
            if (status === "start") {
              assistantToolCalls.push({ name: toolName, arguments: args });
              if (assistantMessageId) {
                sql`UPDATE ai_messages SET tool_calls = ${sql.json(assistantToolCalls)} WHERE id = ${assistantMessageId}`.catch(() => {});
              }
            }
          });

          // Use sendAndGetReply with session.send() + session.on() + activity-based timeout.
          // SDK hooks (onPreToolUse/onPostToolUse) fire via RPC for guaranteed progress.
          // onToolEvent bridge provides additional file-level events from our tool handlers.
          // Timeout fires only after 2 minutes of NO activity — not a blind wall clock.

          // Progressive DB flush — save assistant content every 5s so refreshes don't lose work
          const flushInterval = setInterval(() => {
            if (assistantMessageId && assistantContent) {
              sql`UPDATE ai_messages SET content = ${assistantContent}, tool_calls = ${assistantToolCalls.length > 0 ? sql.json(assistantToolCalls) : sql.json([])} WHERE id = ${assistantMessageId}`.catch(() => {});
            }
          }, 5000);

          // Track active AI work per project so clients can detect ongoing work on refresh
          activeAiSessions.set(projectId, { startedAt: Date.now(), mode, userId });

          await stream.writeSSE({
            data: JSON.stringify({ type: "thinking", data: "Building your project..." }),
          });
          console.log(`[Chat] Sending message to session ${sessionId!.slice(0, 8)}… for project ${projectId}`);
          const releaseTracker = manager.trackRequest(resolvedGithubToken);
          let reply: { content: string; messageId?: string } | null = null;
          try {
            reply = await currentEngine.sendAndGetReply(
              sessionId!, augmentedContent,
              fileAttachments.length > 0 ? fileAttachments : undefined,
              // Activity callback — resets the inactivity timer and pushes SSE events
              (type, detail) => {
                if (type === "text_delta") {
                  // Streaming text arrived — accumulate for DB persistence
                  assistantContent += detail.replace(/^\+(\d+) chars$/, "");
                } else if (type === "event") {
                  // Any SDK event = activity
                  console.log(`[Chat] SDK activity: ${detail}`);
                }
              },
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("not found") || msg.includes("not started") || msg.includes("stopped")) {
              // Session or engine was lost — recreate
              console.log(`[Chat] Session lost for ${projectId}: ${msg.slice(0, 80)} — recreating`);
              await stream.writeSSE({
                data: JSON.stringify({ type: "thinking", data: "Reconnecting to AI..." }),
              });
              projectSessions.delete(sessionKey);
              currentEngine = await manager.getEngine(resolvedGithubToken);
              const projectPath = getProjectPath(projectId);
              const freshTools = await createAllTools(projectId, workspaceId, userId);
              sessionId = await currentEngine.createSession({
                projectId, userId, model: resolvedModel, provider: resolvedProvider,
                workingDirectory: projectPath, systemPrompt, tools: freshTools,
              });
              projectSessions.set(sessionKey, sessionId);
              reply = await currentEngine.sendAndGetReply(
                sessionId, augmentedContent,
                fileAttachments.length > 0 ? fileAttachments : undefined,
              );
            } else {
              throw err;
            }
          }
          releaseTracker();
          unsubToolEvents();
          clearInterval(flushInterval);
          activeAiSessions.delete(projectId);

          // Emit the final assistant text as a single text_delta
          if (reply?.content) {
            assistantContent = reply.content;
            const sanitized = sanitizeText(reply.content);
            await stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: sanitized }) });
            // Broadcast to collaborators
            broadcastToRoom(projectId, {
              type: "ai:stream-chunk", chunk: sanitized, messageId, isThinking: false,
            }, userId).catch(() => {});
          }
          console.log(`[Chat] SSE stream complete for ${projectId}: hadToolCalls=${hadToolCalls}, contentLen=${assistantContent.length}`);
        } catch (err) {
          clearInterval(flushInterval);
          activeAiSessions.delete(projectId);
          const msg = err instanceof Error ? err.message : String(err);

          // If streaming failed due to a stale auth token, evict the engine
          // so the next request gets a fresh one automatically.
          if (msg.includes("not authorized") || msg.includes("policy") || msg.includes("unauthorized")) {
            const manager = getCopilotManager();
            await manager.evictEngine(resolvedGithubToken);
            projectSessions.delete(sessionKey);
            console.log("[Chat] Evicted stale engine after streaming auth error");
          }

          await stream.writeSSE({
            data: JSON.stringify({ type: "error", data: msg }),
          });
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
              const fixEngine = await getCopilotManager().getEngine(resolvedGithubToken);
              for await (const event of fixEngine.sendMessage(
                sessionId!,
                buildAutoFixPrompt(previewError.message),
              )) {
                const sseData = mapEventToSSE(event);
                if (sseData) {
                  await stream.writeSSE({ data: JSON.stringify(sseData) });
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

        // Final save of assistant message (update the pre-inserted row)
        if (assistantMessageId && assistantContent) {
          try {
            await sql`
              UPDATE ai_messages
              SET content = ${assistantContent},
                  tool_calls = ${assistantToolCalls.length > 0 ? sql.json(assistantToolCalls) : sql.json([])}
              WHERE id = ${assistantMessageId}
            `;
          } catch (e) {
            console.warn("[Chat] Failed to save assistant message:", e);
          }
        } else if (assistantMessageId && !assistantContent) {
          // Remove empty placeholder if AI produced nothing
          sql`DELETE FROM ai_messages WHERE id = ${assistantMessageId}`.catch(() => {});
        }

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
        unsubToolEvents();
        await stream.writeSSE({ data: "[DONE]" });
    } catch (err) {
      clearInterval(keepAlive);
      unsubToolEvents();
      // Copilot SDK is the core engine — surface the real error, don't work around it
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[Chat] Copilot SDK error:", errMsg);

      // Save partial assistant message so chat history isn't lost on error
      if (assistantMessageId && assistantContent) {
        try {
          await sql`
            UPDATE ai_messages
            SET content = ${assistantContent},
                tool_calls = ${assistantToolCalls.length > 0 ? sql.json(assistantToolCalls) : sql.json([])}
            WHERE id = ${assistantMessageId}
          `;
        } catch (e) {
          console.warn("[Chat] Failed to save partial assistant message:", e);
        }
      } else if (assistantMessageId && !assistantContent) {
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

// ─── GET /projects/:id/ai-status ─ Check if AI is actively working ──
chatRoutes.get("/projects/:id/ai-status", async (c) => {
  const projectId = c.req.param("id");
  const active = activeAiSessions.get(projectId);
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
             sent_by_user_id, display_name, user_color, created_at
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
  const sessionId = projectSessions.get(projectId);

  if (sessionId) {
    try {
      const engine = await getCopilotEngine();
      await engine.abortSession(sessionId);
    } catch {
      // Ignore
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

    const manager = getCopilotManager();
    const engine = await manager.getEngine(githubToken);
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
          // Suggestion-specific config (primary attempt)
          if (settings.suggestion_model || settings.suggestion_copilot_account_id || settings.suggestion_provider_id) {
            configs.push({
              model: settings.suggestion_model ?? "gpt-4o-mini",
              githubToken: settings.suggestion_copilot_account_id
                ? ((await aiSettingsDb.getCopilotAccountToken(settings.suggestion_copilot_account_id)) ?? undefined)
                : undefined,
              provider: await resolveProvider(settings.suggestion_provider_id),
              label: "suggestion",
            });
          }
          // No fallback to default workspace model — that may be an expensive
          // primary model (e.g. opus). The gpt-4o-mini fallback below covers
          // workspaces without any suggestion config.
        }
      }

      // Ensure there's always at least one config to try
      if (configs.length === 0) {
        configs.push({ model: "gpt-4o-mini", githubToken: undefined, provider: undefined, label: "fallback" });
      }

      const suggestionSystemPrompt = `You generate short, contextual next-step suggestion chips for an AI app builder. Given the user's last prompt and the AI's response, return exactly 4 suggestions as a JSON array of strings. Each suggestion should be 2-6 words, actionable, and relevant to what was just built. Do NOT include generic suggestions. Focus on what the user would logically want to do next with THIS specific app. Return ONLY the JSON array, no other text.`;
      const suggestionUserMessage = `User asked: "${userPrompt.slice(0, 200)}"\n\nAI built: "${lastAssistantMessage.slice(0, 500)}"\n\nReturn 4 contextual next-step suggestions as a JSON array:`;

      const manager = getCopilotManager();

      // Try each config in order until one succeeds.
      // withAutoRetry handles stale token eviction + retry transparently.
      for (const config of configs) {
        try {
          const suggestions = await manager.withAutoRetry(config.githubToken, async (engine) => {
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

  if (lower.includes("create") || lower.includes("write")) {
    if (pretty) return `Building your ${context} \u2014 ${pretty}`;
    return "Crafting something new for your project";
  }
  if (lower.includes("edit") || lower.includes("update") || lower.includes("patch")) {
    if (pretty) return `Refining ${pretty}`;
    return "Polishing your design";
  }
  if (lower.includes("read")) {
    if (pretty) return `Reviewing ${pretty}`;
    return "Studying your project";
  }
  if (lower.includes("list")) {
    return "Exploring your project";
  }
  if (lower.includes("search")) {
    const pattern = args?.pattern as string | undefined;
    if (pattern) return `Searching for "${pattern}"`;
    return "Searching through your project";
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
  if (lower.includes("build")) {
    return "Preparing your app for the world";
  }
  if (lower.includes("delete") || lower.includes("remove")) {
    if (pretty) return `Cleaning up ${pretty}`;
    return "Tidying your project";
  }
  if (lower.includes("deploy")) {
    return "Publishing your creation";
  }
  if (lower.includes("sql") || lower.includes("query") || lower.includes("database") || lower.includes("db")) {
    return "Setting up your database";
  }
  if (lower.includes("run") || lower.includes("exec") || lower.includes("shell") || lower.includes("command")) {
    return "Running a quick task";
  }
  if (lower.includes("spawn") || lower.includes("agent") || lower.includes("sub")) {
    return "Coordinating the build";
  }
  if (lower.includes("scan") || lower.includes("report") || lower.includes("inspect") || lower.includes("analyze")) {
    return "Scanning project structure";
  }
  // Fallback: friendly generic message instead of raw tool name
  return "Working on your project";
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

    // ─── Final complete message (sent after streaming ends) ─
    case "assistant.message": {
      // The SDK's on() handler doesn't deliver streaming deltas — sendAndWait
      // returns the final assistant.message with full content. Emit it as
      // text_delta so the frontend displays the response text.
      const content = (data?.content ?? "") as string;
      if (!content) return null;
      return { type: "text_delta", data: sanitizeText(content) };
    }

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
        },
      };
    }
    case "external_tool.requested":
      return null; // Skip — duplicate of tool.execution_start

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
    case "external_tool.completed":
      return null; // Skip — duplicate of tool.execution_complete

    // ─── Errors ───────────────────────────────────────────
    case "session.error":
      return {
        type: "error",
        data: sanitizeText(String(data?.message ?? "Unknown error")),
      };

    // ─── Done ─────────────────────────────────────────────
    case "session.idle":
    case "done":
      return { type: "done", data: {} };

    // ─── Skip noise events ────────────────────────────────
    case "pending_messages.modified":
    case "session.tools_updated":
    case "session.usage_info":
    case "assistant.usage":
    case "user.message":
    case "assistant.turn_start":
    case "assistant.turn_end":
    case "permission.requested":
    case "permission.completed":
      return null;

    default:
      // Pass through other events
      if (data) {
        return { type, data };
      }
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

