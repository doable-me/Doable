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

// Tracks the provider/model fingerprint each cached session was last
// created with. When an admin re-points the workspace at a different
// BYOK provider (different base_url, key, or model), the cached SDK
// session keeps trying to resume against the OLD provider's session
// id — typically failing with "No model available. Check policy
// enablement…" or similar. By fingerprinting the
// provider+model pair and comparing on each send, we evict the cache
// entry the moment the binding changes. The fingerprint uses a
// SHA-256-derived 12-char tag so the raw API key never lands in logs
// or trace events. (BUG-R9-CHAT-SESSION-STICKY-ON-OLD-PROVIDER.)
export const projectSessionProviders = new Map<string, string>();

// Track active streaming requests per project so /ai-status can report
// whether the AI is still working (survives page refresh).
export const activeRequests = new Map<string, { mode: string; startedAt: number }>();

/**
 * Evict all cached chat sessions for a project so the next chat message
 * creates a fresh session that picks up updated context (identity.md,
 * soul.md, instructions.md, knowledge.md etc.). Without this, edits to
 * `.doable/*.md` only take effect after the user manually starts a new
 * session — the AI keeps using the old system prompt.
 */
export function evictProjectSessions(projectId: string): number {
  let count = 0;
  for (const key of Array.from(projectSessions.keys())) {
    if (key === projectId || key.startsWith(`${projectId}:`)) {
      projectSessions.delete(key);
      projectSessionModes.delete(key);
      projectSessionProviders.delete(key);
      count++;
    }
  }
  return count;
}

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
