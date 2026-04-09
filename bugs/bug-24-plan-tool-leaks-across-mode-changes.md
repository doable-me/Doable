# Bug 24 — Plan-only tools leak into Build mode via cached Copilot session

**Severity:** 🔴 P0 — silently breaks mode separation. Build-mode users get plans generated, `create_plan` rows land in the DB, and the UI gets hijacked into PlanCard review state on every reload.
**Area:** `services/api/src/routes/chat.ts:1326` session resolution + `:1598` session-recreation path
**Discovered:** 2026-04-09 after a user noticed the plan review UI appearing even though the mode toggle clearly said "Build"
**Status:** ✅ Fixed 2026-04-09 — per-session mode tracker + eviction on mode mismatch + recreation-path filter

## Symptom

User types a prompt in Build mode. Later, they reload the page and the chat panel is hijacked by a full PlanCard review UI (title + description + step list + Show details + Add a step + Start Building + Refine… + Reset buttons). The textarea is disabled because `planPhase === "reviewing"`. The user never asked for planning; they're confident they're in Build mode; the mode toggle still reads "Build" after the reload.

DB query confirms a draft plan row was created:

```sql
SELECT id, status, summary FROM plans WHERE project_id = '<pid>';
-- c44b6276  draft  "A clean, minimal todo app that saves your tasks to a database..."
```

## Two independent bugs, same symptom

### Bug 24a — session tool list is frozen at create/resume time

`chat.ts` computes a mode-filtered tool list per request:

```ts
const sessionTools = mode === "plan"
  ? allTools.filter((t) => PLAN_MODE_ALLOWED.has(t.name ?? ""))
  : allTools.filter((t) => !PLAN_ONLY_TOOLS.has(t.name ?? ""));
```

Where `PLAN_ONLY_TOOLS = { "ask_clarification", "create_plan", "mark_step_complete" }`. This filter is correct.

But `sessionTools` is only passed to `eng.createSession({ tools: sessionTools })` or `eng.resumeSession(sid, { tools: sessionTools })`. The Copilot SDK locks the tool list to the session object at that moment. Once the sessionId is cached in the in-memory `projectSessions` map, subsequent messages on that session go straight to `eng.sendMessage(sessionId, prompt)` — which takes no tools parameter. **The tool list is whatever the session was created with, forever.**

So the leak sequence:

1. User sends a message in **Plan mode** for the first time (maybe by accident, maybe by toggling once and forgetting).
2. `sessionTools` is computed for plan mode — includes `create_plan`, `ask_clarification`, `mark_step_complete`.
3. `eng.createSession({ tools: sessionTools })` — Plan tools are now baked into this session.
4. `projectSessions.set(sessionKey, sessionId)`.
5. User switches to **Build mode** and sends another message.
6. `let sessionId = projectSessions.get(sessionKey);` — hits the cache.
7. `if (!sessionId) { ... }` — skipped, the whole resume/create block that would re-apply mode-filtered tools is bypassed.
8. Session still has `create_plan` loaded. AI sees it in its tool list, calls it.
9. `chat.ts:1205-1233` onToolEnd hook catches `create_plan`, saves the plan to the `plans` table as `status='draft'`, emits a `plan` SSE frame.
10. Frontend sets `planPhase = "reviewing"` and the PlanCard is now rendered in the chat panel.

The user never chose plan mode for THIS turn, never saw a toggle flip, and the backend accepts the tool call because it was already in the session's locked tool list from a previous turn.

### Bug 24b — recreation path drops the agent-mode filter entirely

`chat.ts:1598-1600`, the recovery path when the first `eng.sendMessage` fails because the engine was recycled:

```ts
const recreationTools = mode === "plan"
  ? freshTools.filter((t) => PLAN_MODE_ALLOWED.has(t.name ?? ""))
  : freshTools;  // ← !!
```

In plan mode, tools are filtered down to `PLAN_MODE_ALLOWED`. In agent mode, `freshTools` is passed straight through **with no filter at all** — meaning `create_plan`, `ask_clarification`, and `mark_step_complete` are all back in the list. Every time a Copilot engine got recycled and this recreation branch fired in build mode, the recreated session got plan-only tools smuggled back in.

This is independent from 24a: even if you never went through plan mode, just hitting the recreation path in build mode would reintroduce the leak.

## Impact

- Build-mode users get plans generated and saved to the DB, which then auto-restore on every page reload (see also bug-23's companion fix for restore logic).
- Users never chose plan mode for the turn that produced the plan, so the UI feels haunted.
- The restored plan blocks further chat until the user manually clicks Reset (or the companion fix gates the restore on `chatMode === "plan"`).
- Any effort spent debugging "why is this plan showing up" is wasted unless you know about both the backend tool-leak and the frontend restore-mode mismatch.

## Fix

### Fix A — track mode per cached session, evict on mismatch

`services/api/src/routes/chat.ts`: add a parallel `projectSessionModes: Map<string, string>`. Before reading the cached `sessionId`, compare the caller's current mode against the cached mode. If they differ, delete the cached sessionId so the resume/create block runs fresh and re-applies the mode-filtered tool list.

```ts
const projectSessionModes = new Map<string, string>();

// ... inside the request handler, just above `let sessionId = projectSessions.get(sessionKey);` ...

const cachedSessionMode = projectSessionModes.get(sessionKey);
if (cachedSessionMode && cachedSessionMode !== mode) {
  console.log(`[Chat] mode changed ${cachedSessionMode} → ${mode} for ${sessionKey} — evicting cached session so fresh tool list applies`);
  projectSessions.delete(sessionKey);
  projectSessionModes.delete(sessionKey);
}
```

Then set `projectSessionModes.set(sessionKey, mode)` in each of the three places that set `projectSessions`:
- After the resume-from-DB branch
- After the fresh `createSession` branch
- After the recreation-on-error branch

Eviction is safe: the Copilot SDK persists conversation state to disk. `resumeSession(sessionId, { tools: sessionTools })` rehydrates the transcript and applies the new tool list in one call. Context is preserved.

### Fix B — filter the recreation path

Same file, line ~1598:

```ts
const recreationTools = mode === "plan"
  ? freshTools.filter((t) => PLAN_MODE_ALLOWED.has(t.name ?? ""))
  : freshTools.filter((t) => !PLAN_ONLY_TOOLS.has(t.name ?? ""));
```

Matches the main path's filter exactly.

### Companion fix (bug-23 / `d49704d`) — gate frontend restore on current mode

`apps/web/src/app/editor/[projectId]/page.tsx`: don't auto-restore draft plans on mount unless the user's current `chatMode === "plan"`. Also persist `chatMode` to `localStorage` so refreshes don't silently reset the user's choice. Both pieces are needed because bug-24a could still sneak a stale plan into the DB if a user ever briefly goes through plan mode, and the restore hijack is what makes that stale plan user-visible.

## Verification

1. Create a fresh project (cb78158a) where `plans` table has 0 rows for the project.
2. Confirm `chatMode === "agent"` in localStorage and the mode toggle reads "Build".
3. Send a prompt that would normally trigger planning: `"a todo app with supabase persistence"` — deliberately ambiguous + big-scope.
4. Backend log shows tool calls: `report_intent`, `supabase_custom_api_call`, `powershell`, `supabase_search_rows`. **No `create_plan` call.**
5. `SELECT count(*) FROM plans WHERE project_id = 'cb78158a-...'` — returns **0**.
6. Dialog state in Chrome: `planUi: false`.
7. Send a follow-up message on the SAME session, still in build mode. Backend log shows `[CopilotEngine] session.send() → msgId ... (ccdd120c…)` — same session ID reused. **No `mode changed` eviction log** (mode was consistent across turns). Tool calls same as turn 1 plus additional ones — still no `create_plan`.
8. Plans table still has **0** rows.

## Acceptance

- Mode-toggling mid-session correctly re-filters the tool list on the next message (evicts + resumes the session with the new mode's tools).
- Engine-recycle recreation paths also respect the agent-mode filter.
- The frontend never auto-restores a stale draft plan when the current chat mode is build.
- `chatMode` survives page refresh via localStorage.
