import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
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
        try {
          for await (const event of engine.sendMessage(sessionId!, content)) {
            const sseData = mapEventToSSE(event);
            if (sseData) {
              if (sseData.type === "tool_result") hadToolCalls = true;
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
        }

        await stream.writeSSE({ data: "[DONE]" });
      });
    } catch (err) {
      // If Copilot SDK is not available, fall back to placeholder
      console.warn("[Chat] Copilot engine unavailable, using placeholder:", err);
      return streamSSE(c, async (stream) => {
        const responseText = generateFallbackResponse(content, mode);
        const words = responseText.split(" ");

        for (let i = 0; i < words.length; i++) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "text_delta",
              data: (i > 0 ? " " : "") + words[i],
            }),
          });
          await new Promise((resolve) => setTimeout(resolve, 30));
        }

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

// ─── Helpers ─────────────────────────────────────────────

interface SSEEvent {
  type: string;
  data: unknown;
}

function mapEventToSSE(event: Record<string, unknown>): SSEEvent | null {
  const type = event.type as string;
  const data = event.data as Record<string, unknown> | undefined;

  switch (type) {
    case "assistant.message":
      return { type: "text_delta", data: data?.content ?? "" };
    case "assistant.thinking":
      return { type: "thinking", data: data?.content ?? "" };
    case "tool.running":
      return {
        type: "tool_call",
        data: {
          name: data?.name,
          arguments: data?.arguments,
        },
      };
    case "tool.completed":
      return {
        type: "tool_result",
        data: {
          name: data?.name,
          result: data?.result,
        },
      };
    case "session.error":
      return {
        type: "error",
        data: data?.message ?? "Unknown error",
      };
    case "session.idle":
      return { type: "done", data: {} };
    default:
      // Pass through other events
      if (data) {
        return { type, data };
      }
      return null;
  }
}

function generateFallbackResponse(userMessage: string, mode: string): string {
  if (mode === "plan") {
    return `Here's my plan for: "${userMessage}"\n\n**Step 1:** Analyze requirements\n**Step 2:** Create file structure\n**Step 3:** Implement core logic\n**Step 4:** Add styling\n**Step 5:** Test & refine\n\nWould you like me to proceed?`;
  }

  return `I'll help you with: "${userMessage}"\n\nNote: The Copilot SDK agent is not yet connected. To enable AI-powered code generation, ensure you have a GitHub Copilot subscription or configure a BYOK API key in settings.\n\nIn the meantime, you can use the editor to build your app manually.`;
}
