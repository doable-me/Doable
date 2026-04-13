/**
 * In-memory session state maps for the chat system.
 * Tracks Copilot SDK session IDs, modes, and active streaming requests.
 */

// projectId (or "projectId:visual-edit") → copilot sessionId
export const projectSessions = new Map<string, string>();

// Tracks which chat mode each cached session was LAST resolved with.
// The Copilot SDK locks a session's tool list at session create/resume
// time, so if we cache a session created in plan mode and then reuse
// it for a build-mode message, `create_plan` stays in the tool list
// and the AI can still call it — bypassing our
// PLAN_ONLY_TOOLS / PLAN_MODE_ALLOWED filtering.
// See bugs/bug-24 for the full trail.
export const projectSessionModes = new Map<string, string>();

// Track active streaming requests per project so /ai-status can report
// whether the AI is still working (survives page refresh).
export const activeRequests = new Map<string, { mode: string; startedAt: number }>();

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
