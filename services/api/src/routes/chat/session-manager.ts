/**
 * Session management: eviction, resume, creation, DB persistence,
 * and session recreation on engine loss during sendMessage.
 */
import { sql } from "../../db/index.js";
import { getCopilotManager } from "../../ai/providers/copilot-manager.js";
import { createAllTools, type ByokProviderConfig } from "../../ai/providers/copilot.js";
import type { TraceCollector } from "../../ai/trace-collector.js";
import { createPermissionHandler } from "../../ai/docore-bridge.js";
import { projectSessions, projectSessionModes } from "./session-state.js";
import { modeToolQueries } from "@doable/db";

const modeTools = modeToolQueries(sql);

// Hardcoded fallbacks (used when no DB config exists)
const PLAN_MODE_ALLOWED_DEFAULT = new Set([
  "read_file", "list_files", "search_files",
  "ask_clarification", "create_plan", "mark_step_complete",
]);
const PLAN_ONLY_TOOLS = new Set([
  "ask_clarification", "create_plan", "mark_step_complete",
]);

// In-memory cache for DB tool configs (refreshed every 60s)
let _toolConfigCache: Map<string, Set<string>> | null = null;
let _toolConfigCacheAt = 0;
const TOOL_CONFIG_CACHE_TTL = 60_000;

async function getToolConfigForMode(mode: string): Promise<Set<string> | null> {
  const now = Date.now();
  if (!_toolConfigCache || now - _toolConfigCacheAt > TOOL_CONFIG_CACHE_TTL) {
    try {
      const configs = await modeTools.list();
      _toolConfigCache = new Map();
      for (const c of configs) {
        _toolConfigCache.set(c.mode, new Set(c.allowed_tools));
      }
      _toolConfigCacheAt = now;
    } catch {
      // DB not ready or table doesn't exist yet — use fallbacks
      return null;
    }
  }
  return _toolConfigCache?.get(mode) ?? null;
}

/** Filter tools based on chat mode. Uses DB config with hardcoded fallback. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function filterToolsForMode(allTools: any[], mode: string) {
  const dbAllowed = await getToolConfigForMode(mode);
  if (dbAllowed) {
    return allTools.filter((t: { name?: string }) => dbAllowed.has(t.name ?? ""));
  }
  // Fallback to hardcoded defaults
  return mode === "plan"
    ? allTools.filter((t: { name?: string }) => PLAN_MODE_ALLOWED_DEFAULT.has(t.name ?? ""))
    : allTools.filter((t: { name?: string }) => !PLAN_ONLY_TOOLS.has(t.name ?? ""));
}

/** Check if session mode changed and evict if needed. Returns true if mode changed. */
export function checkAndEvictOnModeChange(
  sessionKey: string,
  mode: string,
  traceCollector: TraceCollector | null,
): boolean {
  const cachedMode = projectSessionModes.get(sessionKey);
  const modeChanged = !!cachedMode && cachedMode !== mode;
  if (modeChanged) {
    const evictedSid = projectSessions.get(sessionKey);
    console.log(`[Chat] mode changed ${cachedMode} → ${mode} for ${sessionKey} — evicting cached session`);
    projectSessions.delete(sessionKey);
    projectSessionModes.delete(sessionKey);
    if (evictedSid) {
      traceCollector?.onSessionEvict(evictedSid, `mode_change:${cachedMode}->${mode}`);
    }
  }
  return modeChanged;
}

/** Resume or create a session, returning the sessionId. */
export async function resolveSession(
  projectId: string,
  userId: string,
  sessionKey: string,
  mode: string,
  modeChanged: boolean,
  resolvedModel: string | undefined,
  resolvedProvider: ByokProviderConfig | undefined,
  resolvedGithubToken: string | undefined,
  projectPath: string,
  systemPrompt: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionTools: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolProgress: any,
  traceCollector: TraceCollector | null,
  stream: import("hono/streaming").SSEStreamingApi,
): Promise<string> {
  let sessionId = projectSessions.get(sessionKey);
  if (sessionId) return sessionId;

  await stream.writeSSE({
    data: JSON.stringify({ type: "status", data: { phase: "connecting", message: "Connecting to AI..." } }),
  });

  const manager = getCopilotManager();
  let resumed = false;

  if (!modeChanged) {
    let resumeCopilotSessionId: string | undefined;
    try {
      const [dbRow] = await sql`
        SELECT id, copilot_session_id FROM ai_sessions
        WHERE project_id = ${projectId} AND copilot_session_id IS NOT NULL
        ORDER BY updated_at DESC LIMIT 1
      `;
      if (dbRow?.copilot_session_id) {
        resumeCopilotSessionId = dbRow.copilot_session_id;
        sessionId = await manager.withAutoRetry(projectId, resolvedGithubToken, async (eng) => {
          return eng.resumeSession(dbRow.copilot_session_id, {
            tools: sessionTools,
            toolProgress,
            workingDirectory: projectPath,
            onPermissionRequest: createPermissionHandler(userId, projectPath),
          });
        });
        projectSessions.set(sessionKey, sessionId!);
        projectSessionModes.set(sessionKey, mode);
        resumed = true;
        console.log(`[Chat] Resumed SDK session ${dbRow.copilot_session_id.slice(0, 8)}… for ${projectId.slice(0, 8)}… (mode=${mode}, tools=${sessionTools.length})`);
      }
    } catch (err) {
      console.log(`[Chat] Session resume failed for ${projectId.slice(0, 8)}…, creating new:`, err instanceof Error ? err.message : err);
      traceCollector?.onSessionResumeFailed(resumeCopilotSessionId ?? "unknown", err instanceof Error ? err.message : String(err));
      sessionId = undefined;
    }
  }

  if (!resumed) {
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
        onPermissionRequest: createPermissionHandler(userId, projectPath),
      });
    });
    projectSessions.set(sessionKey, sessionId!);
    projectSessionModes.set(sessionKey, mode);
  }

  return sessionId!;
}

/** Persist session to database. Returns dbSessionId. */
export async function persistSessionToDb(
  projectId: string,
  userId: string,
  mode: string,
  sessionId: string | undefined,
): Promise<string | undefined> {
  try {
    const [dbSession] = await sql`
      SELECT id FROM ai_sessions
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC LIMIT 1
    `;
    if (dbSession) {
      if (sessionId) {
        await sql`UPDATE ai_sessions SET copilot_session_id = ${sessionId}, updated_at = now()
            WHERE id = ${dbSession.id}`;
      }
      return dbSession.id;
    }
    const [newSession] = await sql`
      INSERT INTO ai_sessions (project_id, user_id, mode, copilot_session_id)
      VALUES (${projectId}, ${userId}, ${mode}, ${sessionId ?? null})
      RETURNING id
    `;
    return newSession?.id;
  } catch (e) {
    console.warn("[Chat] DB session lookup failed:", e);
    return undefined;
  }
}

/** Recreate session after engine loss. Returns new sessionId. */
export async function recreateSession(
  projectId: string,
  userId: string,
  sessionKey: string,
  mode: string,
  resolvedModel: string | undefined,
  resolvedProvider: ByokProviderConfig | undefined,
  resolvedGithubToken: string | undefined,
  projectPath: string,
  systemPrompt: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolProgress: any,
  traceCollector: TraceCollector | null,
  workspaceId: string | undefined,
  dbSessionId: string | undefined,
) {
  const manager = getCopilotManager();
  const currentEngine = await manager.getEngine(projectId, resolvedGithubToken);
  const freshTools = await createAllTools(projectId, workspaceId, userId);
  const recreationTools = await filterToolsForMode(freshTools, mode);
  const sessionId = await currentEngine.createSession({
    projectId, userId, model: resolvedModel, provider: resolvedProvider,
    workingDirectory: projectPath, systemPrompt, tools: recreationTools,
    toolProgress, onPermissionRequest: createPermissionHandler(userId, projectPath),
  });
  projectSessions.set(sessionKey, sessionId);
  projectSessionModes.set(sessionKey, mode);
  if (mode === "plan" && sessionId) {
    try {
      await currentEngine.setSessionMode(sessionId, "plan");
      traceCollector?.onSessionModeSwitch(sessionId, "interactive", "plan");
    } catch (e) {
      console.warn(`[Chat] setSessionMode(plan) on recreation failed:`, e instanceof Error ? e.message : e);
    }
  }
  if (dbSessionId) {
    sql`UPDATE ai_sessions SET copilot_session_id = ${sessionId}, updated_at = now()
        WHERE id = ${dbSessionId}`.catch(() => {});
  }
  return { sessionId, engine: currentEngine };
}
