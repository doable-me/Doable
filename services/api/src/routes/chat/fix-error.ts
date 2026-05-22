/**
 * POST /projects/:id/chat/fix-error — Fix runtime errors from preview.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { streamSSE } from "hono/streaming";
import { sql } from "../../db/index.js";
import { createAllTools, type ByokProviderConfig } from "../../ai/providers/copilot.js";
import { getCopilotManager } from "../../ai/providers/copilot-manager.js";
import { isProjectScaffolded, getProjectPath } from "../../projects/file-manager.js";
import { isGitRepo } from "../../git/init.js";
import { autoCommit } from "../../git/commits.js";
import { autoVersion } from "../../version-control/manager.js";
import { resolveAiEngine } from "../../ai/engine-resolver.js";
import { mapEventToSSE } from "../../ai/sse-mapper.js";
import { detectPreviewError } from "../../ai/preview-errors.js";
import { scheduleThumbnailCapture } from "../../ai/thumbnail.js";
import { createPermissionHandler } from "../../ai/docore-bridge.js";
import { materializeSkillsForSession } from "../../ai/skills-materializer.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { projectSessions } from "./session-state.js";
import { creditQueries } from "@doable/db/queries/credits";
import { sql as dbSql } from "../../db/index.js";

const fixErrorSchema = z.object({
  error: z.string().min(1).max(16_000),
  context: z.string().max(4000).optional(),
});

const PLAN_ONLY_TOOLS = new Set(["ask_clarification", "create_plan", "mark_step_complete"]);

export function registerFixErrorRoute(app: Hono<AuthEnv>) {
  app.post(
    "/projects/:id/chat/fix-error",
    zValidator("json", fixErrorSchema),
    async (c) => {
      const projectId = c.req.param("id");
      const { error, context } = c.req.valid("json");
      const userId = c.get("userId")!;

      if (!isProjectScaffolded(projectId)) {
        return c.json({ error: "Project is not scaffolded." }, 400);
      }

      const aiConfig = await resolveAiEngine(projectId, userId, {});
      const manager = getCopilotManager();

      let sessionId = projectSessions.get(projectId);
      if (!sessionId) {
        try {
          const [dbRow] = await sql`
            SELECT copilot_session_id FROM ai_sessions
            WHERE project_id = ${projectId} AND copilot_session_id IS NOT NULL
            ORDER BY updated_at DESC LIMIT 1
          `;
          if (dbRow?.copilot_session_id) {
            const tools = await createAllTools(projectId, undefined, userId);
            const sessionTools = tools.filter((t: { name?: string }) => !PLAN_ONLY_TOOLS.has(t.name ?? ""));
            const projectPath = getProjectPath(projectId);

            // Resolve workspace + materialize skills (best-effort).
            let skillDirectories: string[] | undefined;
            try {
              const [proj] = await sql<{ workspace_id: string }[]>`SELECT workspace_id FROM projects WHERE id = ${projectId}`;
              if (proj?.workspace_id) {
                const mat = await materializeSkillsForSession({ workspaceId: proj.workspace_id, projectId, userId });
                skillDirectories = mat.skillDirectories.length > 0 ? mat.skillDirectories : undefined;
              }
            } catch (err) {
              console.warn(`[Chat] fix-error skill materialization failed:`, err instanceof Error ? err.message : err);
            }

            sessionId = await manager.withAutoRetry(projectId, aiConfig.githubToken, async (eng) => {
              return eng.resumeSession(dbRow.copilot_session_id, { tools: sessionTools, onPermissionRequest: createPermissionHandler(userId, projectPath), skillDirectories });
            });
            if (sessionId) {
              projectSessions.set(projectId, sessionId);
              console.log(`[Chat] fix-error resumed session ${dbRow.copilot_session_id.slice(0, 8)}…`);
            }
          }
        } catch (err) {
          console.warn(`[Chat] fix-error session resume failed:`, err instanceof Error ? err.message : err);
        }
      }

      if (!sessionId) {
        return c.json({ error: "No active chat session for this project. Send a chat message first." }, 400);
      }

      const engine = await manager.getEngine(projectId, aiConfig.githubToken);

      return streamSSE(c, async (stream) => {
        let hadToolCalls = false;

        try {
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

          await stream.writeSSE({
            data: JSON.stringify({ type: "status", data: { phase: "fixing", message: "Found an error — fixing it automatically...", attempt: 1 } }),
          });

          const pendingToolNames: string[] = [];
          await engine.sendMessage(sessionId, fixMessage, undefined, (event: import("@github/copilot-sdk").SessionEvent) => {
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
              stream.writeSSE({ data: JSON.stringify(sseData) }).catch(() => {});
            }
          });

          await stream.writeSSE({
            data: JSON.stringify({ type: "status", data: { phase: "verifying", message: "Verifying the fix..." } }),
          });
          await new Promise((r) => setTimeout(r, 1500));
          const remainingError = await detectPreviewError(projectId);

          if (!remainingError) {
            await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "fixed", message: "Error fixed successfully" } }) });
            await stream.writeSSE({ data: JSON.stringify({ type: "auto_fix_complete", data: { success: true } }) });
          } else {
            await stream.writeSSE({ data: JSON.stringify({ type: "auto_fix_complete", data: { success: false, error: remainingError.message } }) });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await stream.writeSSE({ data: JSON.stringify({ type: "error", data: msg }) });
        }

        if (hadToolCalls && isProjectScaffolded(projectId)) {
          try {
            const projectPath = getProjectPath(projectId);
            if (isGitRepo(projectPath)) {
              const commitInfo = await autoCommit(projectPath, `Fix runtime error: ${error.slice(0, 80)}`, { type: "ai" });
              if (commitInfo) {
                await stream.writeSSE({ data: JSON.stringify({ type: "version_created", data: { sha: commitInfo.sha } }) });
              }
            } else {
              await autoVersion(projectId, projectPath, `Fix runtime error: ${error.slice(0, 80)}`, userId);
            }
          } catch (vErr) {
            console.warn("[Chat] Auto-version after fix-error failed:", vErr);
          }
          try { await sql`UPDATE projects SET updated_at = NOW() WHERE id = ${projectId}`; } catch {}
          scheduleThumbnailCapture(projectId);
        }

        // Consume 1 credit after fix-error completion
        try {
          const [proj] = await dbSql<[{ workspace_id: string }?]>`
            SELECT workspace_id FROM projects WHERE id = ${projectId}
          `;
          if (proj?.workspace_id) {
            const credits = creditQueries(dbSql);
            await credits.consumeCredits(userId, proj.workspace_id, 1, {
              actionType: "ai_fix",
              projectId,
            });
          }
        } catch (err) {
          console.warn("[Chat] Failed to consume credit for fix-error:", err instanceof Error ? err.message : err);
        }

        await stream.writeSSE({ data: "[DONE]" });
      });
    },
  );
}
