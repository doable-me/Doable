import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import {
  getCopilotEngine,
  createDoableTools,
  type ByokProviderConfig,
} from "../ai/providers/copilot.js";
import {
  createProject,
  isProjectScaffolded,
  getProjectPath,
} from "../projects/file-manager.js";
import {
  startDevServer,
  isRunning as isDevServerRunning,
  getDevServerUrl,
} from "../projects/dev-server.js";
import { autoVersion } from "../version-control/manager.js";
import { optionalAuthMiddleware, type AuthEnv } from "../middleware/auth.js";

export const chatRoutes = new Hono<AuthEnv>();

// Apply optional auth to all chat routes — authenticated users get their
// userId tracked, unauthenticated users proceed as "anonymous".
chatRoutes.use("/projects/:id/chat", optionalAuthMiddleware);
chatRoutes.use("/projects/:id/chat/*", optionalAuthMiddleware);

// ─── In-memory session mapping (projectId → copilot sessionId) ─
const projectSessions = new Map<string, string>();

// ─── Debounce guard for thumbnail captures ─
const captureInProgress = new Set<string>();

// ─── POST /projects/:id/chat ─ SSE streaming response ───────
const sendMessageSchema = z.object({
  content: z.string().min(1).max(32_000),
  mode: z.enum(["agent", "plan"]).default("agent"),
  model: z.string().optional(),
  provider: z
    .object({
      type: z.enum(["openai", "azure", "anthropic"]).optional(),
      baseUrl: z.string(),
      apiKey: z.string().optional(),
    })
    .optional(),
});

chatRoutes.post(
  "/projects/:id/chat",
  zValidator("json", sendMessageSchema),
  async (c) => {
    const projectId = c.req.param("id");
    const { content, mode, model, provider } = c.req.valid("json");
    const userId = c.get("userId") ?? "anonymous";

    try {
      // Auto-scaffold the project if it hasn't been created yet
      if (!isProjectScaffolded(projectId)) {
        try {
          console.log(`[Chat] Auto-scaffolding project ${projectId}`);
          await createProject(projectId);
        } catch (err) {
          console.warn(`[Chat] Scaffold failed (may already exist):`, err);
        }
      }

      // Auto-start the dev server if not running
      if (!isDevServerRunning(projectId) && isProjectScaffolded(projectId)) {
        try {
          console.log(`[Chat] Auto-starting dev server for project ${projectId}`);
          await startDevServer(projectId);
        } catch (err) {
          console.warn(`[Chat] Dev server start failed:`, err);
        }
      }

      const engine = await getCopilotEngine();

      // Get or create session for this project
      let sessionId = projectSessions.get(projectId);
      if (!sessionId) {
        const previewUrl = getDevServerUrl(projectId);
        const systemPrompt =
          mode === "plan"
            ? "You are Doable's Plan Mode AI. Analyze requests, break them into steps, and produce structured plans. Do NOT write code directly — only plan and reason."
            : `You are Doable's Agent Mode AI. You autonomously generate production-ready code, create and edit files, install packages, and deploy apps. Work step by step, creating complete, working implementations.

The project is a Vite + React + TypeScript app with Tailwind CSS v4. The project files are on the server filesystem and changes are hot-reloaded via Vite.${previewUrl ? `\n\nThe live preview is available at: ${previewUrl}` : ""}

IMPORTANT RULES:
- Use Tailwind CSS classes for styling (v4 — just \`@import "tailwindcss"\` in CSS, no config needed).
- Write complete file contents when creating or editing files.
- Always use TypeScript (.tsx for React components, .ts for utilities).
- Prefer function components with hooks.
- Import styles and components using relative paths.`;

        const projectPath = getProjectPath(projectId);
        sessionId = await engine.createSession({
          projectId,
          userId,
          model,
          provider: provider as ByokProviderConfig | undefined,
          workingDirectory: projectPath,
          systemPrompt,
          tools: createDoableTools(projectId),
        });
        projectSessions.set(projectId, sessionId);
      }

      // Stream events via SSE
      return streamSSE(c, async (stream) => {
        let hadToolCalls = false;
        // Track pending tool names so tool_result events can include the name
        const pendingToolNames: string[] = [];
        try {
          for await (const event of engine.sendMessage(sessionId!, content)) {
            const sseData = mapEventToSSE(event);
            if (sseData) {
              // When a tool_call is emitted, record the name for pairing
              if (sseData.type === "tool_call") {
                const toolData = sseData.data as Record<string, unknown>;
                if (toolData?.name) {
                  pendingToolNames.push(toolData.name as string);
                }
              }
              // When a tool_result is emitted, inject the name from the queue
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
            await autoVersion(
              projectId,
              projectPath,
              content.slice(0, 100), // Use first 100 chars of prompt as description
              userId
            );
          } catch (vErr) {
            console.warn("[Chat] Auto-version failed:", vErr);
          }

          // Update project's updated_at so dashboard shows fresh data & cache busts thumbnails
          try {
            await sql`UPDATE projects SET updated_at = NOW() WHERE id = ${projectId}`;
          } catch {
            // Non-critical — don't break the chat if DB update fails
          }
        }

        // Capture thumbnail asynchronously (don't block the response)
        if (hadToolCalls && !captureInProgress.has(projectId)) {
          captureInProgress.add(projectId);
          const { getDevServerInternalUrl } = await import(
            "../projects/dev-server.js"
          );
          const internalUrl = getDevServerInternalUrl(projectId);
          if (internalUrl) {
            // The Vite base path is /preview/{projectId}/ — Puppeteer
            // needs the full internal URL with that path.
            const previewUrl = `${internalUrl}/preview/${projectId}/`;
            // Fire and forget — wait for Vite to process changes, then capture
            import("../thumbnails/capture.js")
              .then(({ captureProjectThumbnail }) => {
                setTimeout(() => {
                  captureProjectThumbnail(projectId, previewUrl)
                    .finally(() => captureInProgress.delete(projectId))
                    .catch(console.warn);
                }, 3000); // 3s delay for Vite HMR to settle
              })
              .catch((err) => {
                captureInProgress.delete(projectId);
                console.warn("[Thumbnail] Import failed:", err);
              });
          } else {
            captureInProgress.delete(projectId);
          }
        }

        await stream.writeSSE({ data: "[DONE]" });
      });
    } catch (err) {
      // Copilot SDK is the core engine — surface the real error, don't work around it
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[Chat] Copilot SDK error:", errMsg);

      return streamSSE(c, async (stream) => {
        await stream.writeSSE({
          data: JSON.stringify({
            type: "error",
            data: `Copilot SDK error: ${errMsg}. Ensure you have a GitHub Copilot subscription or configure BYOK in settings.`,
          }),
        });
        await stream.writeSSE({ data: "[DONE]" });
      });
    }
  },
);

// ─── GET /projects/:id/chat/history ─ Chat history ──────────
chatRoutes.get("/projects/:id/chat/history", async (c) => {
  const projectId = c.req.param("id");
  const sessionId = projectSessions.get(projectId);

  if (!sessionId) {
    return c.json({ data: [] });
  }

  try {
    const engine = await getCopilotEngine();
    const messages = await engine.getSessionMessages(sessionId);
    return c.json({ data: messages });
  } catch {
    return c.json({ data: [] });
  }
});

// ─── DELETE /projects/:id/chat ─ Clear chat ─────────────────
chatRoutes.delete("/projects/:id/chat", async (c) => {
  const projectId = c.req.param("id");
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

// ─── GET /ai/models ─ List available models ─────────────────
chatRoutes.get("/ai/models", async (c) => {
  try {
    const engine = await getCopilotEngine();
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
    const { lastAssistantMessage, userPrompt } = c.req.valid("json");

    try {
      const engine = await getCopilotEngine();

      // Create a lightweight session with a fast/cheap model for suggestions
      const sessionId = await engine.createSession({
        projectId: "suggestions",
        userId: "system",
        model: "gpt-4o-mini", // Fast, cheap model for simple text generation
        systemPrompt: `You generate short, contextual next-step suggestion chips for an AI app builder. Given the user's last prompt and the AI's response, return exactly 4 suggestions as a JSON array of strings. Each suggestion should be 2-6 words, actionable, and relevant to what was just built. Do NOT include generic suggestions. Focus on what the user would logically want to do next with THIS specific app. Return ONLY the JSON array, no other text.`,
      });

      const result = await engine.sendAndWait(
        sessionId,
        `User asked: "${userPrompt.slice(0, 200)}"\n\nAI built: "${lastAssistantMessage.slice(0, 500)}"\n\nReturn 4 contextual next-step suggestions as a JSON array:`,
        15_000, // 15s timeout — suggestions should be fast
      );

      // Clean up the ephemeral session
      engine.disconnectSession(sessionId).catch(() => {});

      // Parse the response — AssistantMessageEvent has { data: { content: string } }
      const resultData = result?.data as Record<string, unknown> | undefined;
      const content = typeof resultData?.content === "string" ? resultData.content : "";

      // Extract JSON array from the response (may have markdown fences)
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0]) as string[];
        return c.json({
          data: suggestions
            .filter((s): s is string => typeof s === "string")
            .slice(0, 5),
        });
      }

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

function mapEventToSSE(event: Record<string, unknown>): SSEEvent | null {
  const type = event.type as string;
  const data = event.data as Record<string, unknown> | undefined;

  switch (type) {
    // ─── Text content ─────────────────────────────────────
    case "text_delta":
      // Already in the right format — pass through
      return { type: "text_delta", data: data?.content ?? data ?? "" };
    case "assistant.message":
      return { type: "text_delta", data: data?.content ?? "" };

    // ─── Thinking / reasoning ─────────────────────────────
    case "assistant.thinking":
    case "assistant.reasoning":
      return { type: "thinking", data: data?.content ?? "" };

    // ─── Tool calls (starting) ────────────────────────────
    // Only emit from tool.execution_start — external_tool.requested
    // is a duplicate for the same tool invocation.
    case "tool.running":
    case "tool.execution_start":
      return {
        type: "tool_call",
        data: {
          name: data?.toolName ?? data?.name,
          arguments: data?.arguments,
        },
      };
    case "external_tool.requested":
      return null; // Skip — duplicate of tool.execution_start

    // ─── Tool results (completed) ─────────────────────────
    // Only emit from tool.execution_complete — external_tool.completed
    // is a duplicate for the same tool invocation.
    case "tool.completed":
    case "tool.execution_complete":
      return {
        type: "tool_result",
        data: {
          name: data?.toolName ?? data?.name,
          result: data?.result,
          success: data?.success,
        },
      };
    case "external_tool.completed":
      return null; // Skip — duplicate of tool.execution_complete

    // ─── Errors ───────────────────────────────────────────
    case "session.error":
      return {
        type: "error",
        data: data?.message ?? "Unknown error",
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

