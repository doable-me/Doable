# AI Chat / Copilot Flow — Deep Code Analysis

**Date**: 2026-04-09
**Scope**: End-to-end SSE streaming, tool execution, provider fallback, frontend state management, preview updates, token/credit tracking

---

## CRITICAL Issues

### C1. Frontend `broadcastMsgId` Never Matches Server `messageId` — Collaboration Dedup is Broken

**Files**: `apps/web/src/modules/editor/hooks/use-chat.ts:188-189`, `services/api/src/routes/chat.ts:1505`

The frontend generates `broadcastMsgId` using `generateId()` (which produces `msg_<timestamp>_<random>`) and adds it to `ownMessageIds` (line 189). The server generates its own `messageId` using `crypto.randomUUID()` (line 1505) and broadcasts that via `ai:message-sent`, `ai:stream-chunk`, and `ai:stream-end` events.

The WS dedup check at line 163 (`if (ownMessageIds.current.has(msgId)) break;`) compares `msg.messageId` (server-side UUID) against `broadcastMsgId` (client-side `msg_xxx`). **These will never match** because they use different ID generators with different formats.

**Impact**: The dedup guard is dead code. When the user who sent the message receives their own `ai:message-sent` broadcast back via WS, they will:
1. Add a duplicate user message (`remote_user_${msgId}`)
2. Add a duplicate assistant placeholder (`remote_ai_${msgId}`)
3. See double messages in the chat

**Fix**: Either send `broadcastMsgId` to the server and have it use that as the broadcast `messageId`, or have the server echo back the client-generated ID for dedup. Alternatively, dedup by `userId` instead of `messageId`.

---

### C2. Race Condition: `isStreaming` Gate Allows Concurrent Requests After State Lag

**Files**: `apps/web/src/modules/editor/hooks/use-chat.ts:185,216`, `use-editor-store.ts:230`

`sendMessage` checks `if (!projectId || !content.trim() || isStreaming) return;` (line 185), then later calls `setStreaming(true)` (line 216). But `isStreaming` is read from the Zustand store at render time, not at invocation time. Between the check on line 185 and `setStreaming(true)` on line 216, multiple rapid calls (e.g., double-click, Enter key repeat) can pass the guard because the React state update is async.

Additionally, the previous `AbortController` is aborted on line 219 (`abortRef.current?.abort()`), which cancels the in-flight request but does NOT cancel the SDK session server-side through the abort endpoint. The client-side abort fires `DOMException(AbortError)` which returns silently (line 452), but the server continues processing the first request until the Hono request signal fires abort.

**Impact**: Rapid message sends can create orphaned server-side sessions consuming tokens.

---

### C3. `create_file` in Copilot SDK Tools Does Not Check If File Exists

**Files**: `services/api/src/ai/providers/copilot.ts:713-724` vs `services/api/src/ai/tools/create-file.ts:23-38`

The standalone `createFileTool` in `tools/create-file.ts` properly checks whether the file already exists (lines 28-38) and returns an error if it does. However, the Copilot SDK `create_file` tool in `copilot.ts` (lines 713-724) calls `writeFile()` directly with no existence check. The AI sees `create_file` described as creating new files, but nothing prevents it from silently overwriting existing files.

**Impact**: The AI can accidentally destroy existing project files when it calls `create_file` on a path that already exists, losing user work.

---

### C4. `edit_file` in Copilot SDK Tools Does Full File Replacement Instead of Search-Replace

**Files**: `services/api/src/ai/providers/copilot.ts:727-755` vs `services/api/src/ai/tools/edit-file.ts:1-102`

The standalone `editFileTool` implements proper search-and-replace with `old_string` / `new_string` matching, occurrence counting, and Yjs CRDT integration. The Copilot SDK `edit_file` tool is described as "Replace the entire content of an existing file" and takes `path` + `content` parameters — it's actually a full-file overwrite, not an edit.

This creates two problems:
1. **Description mismatch**: Two different tools named `edit_file` with completely different semantics. If the AI model is trained to call `edit_file` with `old_string`/`new_string` params (matching the standalone tool), those params are silently ignored by the SDK tool which only uses `path` and `content`.
2. **No Yjs CRDT routing**: The SDK `edit_file` writes directly to filesystem via `writeFile()`, bypassing the Yjs bridge. If a collaborator has the file open in Monaco, they won't see the update through CRDT — they'll see it only when Vite HMR triggers a reload.

**Impact**: Collaborator edits can be silently lost when the AI does a full-file overwrite through the SDK tool path.

---

## HIGH Issues

### H1. `pollStreamStatus` Leaks Intervals — No Cleanup on Component Unmount

**Files**: `apps/web/src/modules/editor/hooks/use-chat.ts:604-647`

`pollStreamStatus` creates a `setInterval` that polls every 3s with a 5-minute timeout (`setTimeout(() => clearInterval(interval), 5 * 60 * 1000)`). However, this function is called inside `loadHistory` which is invoked from a `useEffect` in `ChatPanel`. If the component unmounts (user navigates away), the interval is never cleaned up because:
1. `pollStreamStatus` is a standalone `useCallback` that doesn't return a cleanup function
2. The interval handle is local to the function, not stored in a ref
3. The `useEffect` in `ChatPanel` (line 57) doesn't track or clean up `loadHistory`'s side effects

**Impact**: Memory leak and unnecessary network requests for up to 5 minutes after navigating away from the editor.

---

### H2. Duplicate `tool_call` SSE Events from Three Independent Channels

**Files**: `services/api/src/routes/chat.ts:1219-1241` (toolProgress), `1532-1541` (onToolEvent), `1951-1955` (mapEventToSSE)

Three independent channels emit `tool_call` SSE events:
1. **toolProgress.onToolStart** (via RPC hooks) — lines 1219-1241
2. **onToolEvent subscription** (via custom event emitter) — lines 1532-1541
3. **mapEventToSSE** processing `tool.execution_start` events — lines 3682-3709

While `recordAssistantToolCall` has dedup logic (lines 949-978), the SSE `stream.writeSSE()` calls are NOT deduplicated. Each channel independently writes `tool_call` events to the SSE stream.

The frontend accumulates these for display as live status (`liveStatus: tool_call:${friendly}`) which just updates in-place (last one wins), so the user doesn't see visual duplication. However, if the frontend were to count tool calls from `tool_call` events, it would triple-count.

**Impact**: Frontend receives 2-3x duplicate `tool_call` SSE events per actual tool call. Currently masked by the UI showing only the latest status, but any future counting logic would be wrong.

---

### H3. `tool_result` SSE Events Also Duplicate — `onToolEnd` + `mapEventToSSE`

**Files**: `services/api/src/routes/chat.ts:1242-1336` (onToolEnd), `3716-3727` (mapEventToSSE)

Similar to H2, `tool_result` events are emitted from:
1. **toolProgress.onToolEnd** — lines 1242-1247
2. **mapEventToSSE** processing `tool.execution_complete` — lines 3716-3727

The frontend calls `useEditorStore.getState().bumpToolResultVersion()` on every `tool_result` event (line 340 in use-chat.ts), which increments a counter that triggers preview iframe reload. Double `tool_result` events means the preview is refreshed twice per tool call.

**Impact**: Preview iframe refreshes 2x for each file change, causing unnecessary flicker and potential race conditions with Vite HMR.

---

### H4. `approvePlan` Uses `setTimeout(100ms)` to Chain Messages — Fragile Timing

**Files**: `apps/web/src/modules/editor/hooks/use-chat.ts:504-507`

After approving a plan, the code switches the mode to "agent" via `useEditorStore.getState().approvePlan()` (which sets `mode: "agent"`) and then uses `setTimeout(() => sendMessage(...), 100)` to trigger the build.

The problem: `sendMessage` checks `isStreaming` (line 185). If the approve API call takes > 100ms, `sendMessage` fires while the approve request's response might still be processing. But more critically, `sendMessage` captures `mode` from the Zustand store via `useCallback` dependencies. The Zustand `mode` update from `approvePlan()` is synchronous, but the `useCallback` for `sendMessage` (line 466) has `mode` in its dependency array. React may not have re-rendered and provided the updated `sendMessage` with the new `mode` value within 100ms.

**Impact**: The "start building" message may be sent with `mode: "plan"` instead of `mode: "agent"`, causing the AI to plan instead of build.

---

### H5. `clearChat` Deletes Server-Side Session Using Singleton Engine, Not Pool Engine

**Files**: `services/api/src/routes/chat.ts:2727-2757`

The DELETE handler at line 2733 calls `getCopilotEngine()` (singleton) to delete the session, but sessions are created on pool engines via `getCopilotManager().getEngine()`. The singleton's `sessions` map is empty, so `engine.deleteSession(sessionId)` tries to disconnect a session that doesn't exist on that engine instance.

Similarly, the fallback in GET `/chat/history` (line 2717) uses `getCopilotEngine()` instead of the pool engine.

**Impact**: `clearChat` silently fails to clean up the SDK session. The session persists on disk and in the pool engine's memory until the engine is recycled. Stale sessions accumulate.

---

### H6. Usage Collector Double-Counts `toolCallCount` in Aggregates

**Files**: `services/api/src/ai/usage-collector.ts:251-253,329`

The `onUsageEvent` function increments `accumulatedUsage.toolCallCount++` on every `tool.completed` or `tool.execution_complete` event (lines 251-253). Later, `upsertDailyAggregate` and `upsertMonthlyAggregate` are called with `accumulatedUsage.toolCallCount` (line 329) on EVERY `assistant.usage` event.

The `assistant.usage` event fires multiple times per request (once per model call in multi-turn). Each time it fires, the aggregate upsert adds the FULL accumulated `toolCallCount` to the running total, not just the delta since last write.

**Impact**: Daily/monthly aggregate `tool_call_count` is inflated by the number of `assistant.usage` events per request (typically 2-5x).

---

### H7. Auto-Continue Loop Has No Recursion Guard

**Files**: `services/api/src/routes/chat.ts:2133-2189`

The auto-continue logic fires when `hadToolCalls && !wroteFiles && mode !== "plan"` (line 2137). It sends a nudge message and processes the response. However, the nudge response stream does NOT track whether the continuation itself wrote files. If the AI again only explores (reads files, installs packages) without writing, the code doesn't re-trigger because it only runs once. But a future modification could accidentally make it recursive.

More importantly, the continuation stream at lines 2154-2184 does NOT run through the `ChannelTokenRouter` for thinking/text separation, doesn't update `lastSseEmitAt` for heartbeat tracking, and doesn't call `broadcastToRoom` for collaborator streaming. The continuation content is invisible to collaborators.

**Impact**: Collaborators don't see AI continuation output. The continuation also bypasses all thinking/reasoning tag stripping.

---

## MEDIUM Issues

### M1. `updateMessageFields` Doesn't Preserve Existing `content` When Called With Partial Fields

**Files**: `apps/web/src/modules/editor/hooks/use-editor-store.ts:224-229`

`updateMessageFields` spreads `fields` over the message: `{ ...m, ...fields }`. But `pollStreamStatus` at line 623-631 calls BOTH `updateMessageFields(assistantMsgId, { content: lastMsg.content, ... })` AND `updateMessage(assistantMsgId, lastMsg.content)`. These are redundant and could cause a race condition if another state update happens between them.

The `updateMessage` call at line 632 overwrites the content that was already set by `updateMessageFields` on line 624. If a WS collaboration event updates the same message between these two calls, the WS update is lost.

**Impact**: Minor — both calls set the same content. But it's a latent race condition if future code adds WS-sourced content updates.

---

### M2. `sanitizeText` Aggressively Replaces Technical Terms That AI Intentionally Used

**Files**: `services/api/src/routes/chat.ts:3341-3408,3467-3491`

The `JARGON_MAP` replaces terms like "SQL" -> "database", "middleware" -> "security layer", "CORS" -> "cross-origin security", etc. When the AI says "I'll set up the SQL migration for your database tables", the user sees "I'll set up the database update for your data table data tables" — the replacements can produce awkward double-meanings.

Worse, code snippets in the AI's response text (e.g., explaining a `middleware` function name) get their identifiers replaced, making the explanation incorrect. The sanitization runs BEFORE markdown rendering, so code blocks are affected too.

**Impact**: AI responses can become confusing or technically incorrect after sanitization, especially when the AI is explaining what it did.

---

### M3. `provision_supabase_required` SSE Event Emitted Twice — Both onToolStart and onToolEnd

**Files**: `services/api/src/routes/chat.ts:1233-1240,1267-1292`

The `provision_supabase_required` event is intentionally emitted on tool START (lines 1233-1240) for timing reasons, but the onToolEnd handler ALSO emits it (lines 1267-1292) as a "belt-and-braces fallback". The frontend `setSupabaseProvisionRequest()` is idempotent (just sets state), but the user may see the dialog briefly flash or re-render.

**Impact**: Double SSE emission. Functionally benign due to idempotent state setter, but wastes bandwidth and could cause UI flash.

---

### M4. `stopStreaming` Only Aborts Client Fetch — Does Not Cancel Server Session

**Files**: `apps/web/src/modules/editor/hooks/use-chat.ts:469-472`

`stopStreaming` calls `abortRef.current?.abort()` which aborts the client-side `fetch`. The server-side abort is triggered by the Hono request signal (line 870 in chat.ts). However, there is a dedicated abort endpoint at `POST /projects/:id/chat/abort` (line 2760) that is never called by the frontend `stopStreaming`.

The request signal abort at line 870 fires when the fetch is aborted, which does trigger `engine.abortSession()`. But the abort handler at line 882 runs on `eng.abortSession(sid).catch(() => {})` which is fire-and-forget. If the engine lookup fails (pool already recycled), the SDK session continues consuming tokens.

**Impact**: Stop button works for the UI, but the server may continue processing if the engine pool has recycled. The dedicated abort endpoint provides more reliable cancellation but is unused.

---

### M5. `extractPlanFromResponse` False Positive — Any Long AI Response Becomes a "Plan"

**Files**: `services/api/src/routes/chat.ts:548-562`

The function has a broad fallback at line 558: if the response is > 200 characters, treat it as a plan. This means ANY agent-mode response over 200 chars that also contains "##" and "Step/Task/Phase" gets written to `.doable/plan.md`. The check at line 2553 only gates on `mode === "plan"`, but if `extractPlanFromResponse` is ever called from agent mode, it would false-positive.

Currently safe because the check at line 2553 is `if (mode === "plan" && assistantContent)`, but the function itself is misleadingly permissive.

**Impact**: Latent bug — safe currently but fragile against future refactors.

---

### M6. SSE Buffer Parsing Can Drop Data at Stream Boundaries

**Files**: `apps/web/src/modules/editor/hooks/use-chat.ts:286-293`

The SSE line parser splits on `\n` and keeps the last element as the buffer (line 288: `buffer = lines.pop() ?? ""`). This correctly handles incomplete lines. However, the `data: ` prefix check (line 293) uses `trimmed.startsWith("data: ")` which requires EXACTLY `data: ` (with space). If the server ever sends `data:` without the space (valid per SSE spec), those events are silently dropped.

Additionally, lines that start with `event:` (which Hono's `streamSSE` can emit, and the `serializeSSE` function in streaming.ts explicitly generates at line 88) are completely ignored by the client parser. The client only looks for `data:` lines.

**Impact**: If `serializeSSE` from streaming.ts is ever used (it has `event: ${event.type}\ndata: ${data}\n\n` format), the client parser would work because it ignores the `event:` line and picks up the `data:` line. But named events would be ignored.

---

### M7. `loadHistory` Clears Messages Before Loading — Momentary Flash of Empty State

**Files**: `apps/web/src/modules/editor/hooks/use-chat.ts:560`

`clearMessages()` is called before the new messages are loaded from the server response. There's a time window where `messages` is `[]` and the UI shows the `EmptyState` component. The `ChatPanel` renders `EmptyState` when `messages.length === 0 && planPhase === "idle"` (line 82).

**Impact**: Visual flash of empty state on every page load and history refresh.

---

### M8. Thinking Content Not Persisted to Collaborator View via WS

**Files**: `apps/web/src/modules/editor/hooks/use-chat.ts:139-158`

The WS `ai:stream-chunk` handler accumulates `thinkingContent` for remote messages (lines 148-149), but when loading history (`loadHistory`), the thinking content is not mapped from the DB response. The history mapper at lines 568-579 does not include `thinking_content` from the DB, even though the server persists it (line 2537: `thinking_content = ${assistantThinking || null}`).

**Impact**: After page refresh, thinking content from AI responses is lost and cannot be viewed.

---

## LOW Issues

### L1. `generateId()` Uses `Date.now()` — Not Unique Under Rapid Calls

**Files**: `apps/web/src/modules/editor/hooks/use-chat.ts:37-39`

`generateId()` returns `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`. The 7-char random suffix provides ~36^7 = 78 billion possible values, so collisions are astronomically unlikely. The `Date.now()` prefix adds time-based ordering. This is fine for practical use.

**Impact**: Negligible collision risk. No action needed.

---

### L2. `captureInProgress` Map Never Cleaned Up on Server Shutdown

**Files**: `services/api/src/routes/chat.ts:755`

The `captureInProgress` Map has a TTL-based self-cleaning mechanism (line 769-775), but if the server crashes between setting the flag and the `.finally()` cleanup, the entry persists in memory for up to 60 seconds. Since it's in-memory and the server restarted, this is moot.

**Impact**: None — in-memory state is lost on restart anyway.

---

### L3. `useRotatingPlaceholder` Runs Even When Input Has Focus

**Files**: `apps/web/src/modules/editor/chat/chat-input.tsx:22-66`

The typing/erasing animation runs continuously via `setTimeout` chains. When the user is typing in the textarea, the placeholder is hidden by CSS, but the animation state machine continues to run, creating and clearing timeouts.

**Impact**: Minor unnecessary CPU work. Could be paused when input is focused.

---

### L4. `JARGON_MAP` Regex Runs on Every Text Delta Token

**Files**: `services/api/src/routes/chat.ts:3486-3488`

`sanitizeText` iterates over 30+ compiled regex patterns for every token delta. With token-by-token streaming, this runs hundreds of times per response. The individual regexes are fast, but the cumulative overhead adds up.

**Impact**: Minor performance concern. Could be batched or debounced.

---

### L5. `toolCallIdMap` Grows Unbounded During a Request

**Files**: `services/api/src/routes/chat.ts:937,1947,1970-1975`

The `toolCallIdMap` is populated on `tool.execution_start` (line 1947) and cleaned up on `tool.execution_complete` (line 1970-1975). But if a tool starts and the session errors before completion, the entry leaks. Since the map is scoped to a single request lifecycle, it's cleaned up when the request ends.

**Impact**: Negligible — bounded by request lifetime.

---

### L6. `mode` Sent to Server But Not Used for Session Keying Consistently

**Files**: `apps/web/src/modules/editor/hooks/use-chat.ts:237`, `services/api/src/routes/chat.ts:1022`

The frontend sends `mode` from the Zustand store (line 237). The store's `mode` is type `EditorMode = "agent" | "plan"`, but the server schema accepts `"agent" | "plan" | "visual-edit"` (line 815). The frontend never sends `"visual-edit"` from the chat hook — that mode is used elsewhere. If the EditorMode type is ever extended without updating the schema, the request would be rejected by Zod validation.

**Impact**: Type mismatch between frontend and backend mode enums. Currently benign.

---

### L7. Auto-Scroll Triggers on Every `messages` Array Change

**Files**: `apps/web/src/modules/editor/chat/chat-panel.tsx:51-53`

`useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);` fires on ANY change to the messages array, including `updateMessage` (content updates during streaming) and `updateMessageFields` (status updates). During streaming, this fires hundreds of times — once per token delta that triggers a state update.

However, `requestAnimationFrame` batching in `use-chat.ts` (lines 262-273) means `updateMessage` only fires once per animation frame, not per token. Still, each frame triggers a scroll.

**Impact**: Frequent smooth-scroll calls during streaming. `smooth` behavior is rate-limited by the browser, so actual scrolling is fine, but the `scrollIntoView` call overhead adds up.

---

## Summary by Category

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| SSE Streaming | C1 | H2, H3 | M3, M6 | L4 |
| Tool Execution | C3, C4 | H7 | M5 | L5 |
| Frontend State | C2 | H1, H4 | M1, M7, M8 | L1, L7 |
| Provider/Session | — | H5 | M4 | L6 |
| Token/Credits | — | H6 | M2 | L2, L3 |

### Top 5 Recommendations (Priority Order)

1. **Fix C1**: Send `broadcastMsgId` from client to server, or dedup WS broadcasts by `userId`. This is likely already causing duplicate messages in multi-user scenarios.

2. **Fix C3+C4**: Align Copilot SDK tool implementations with standalone tools — add existence checks to `create_file`, implement proper search-replace for `edit_file`, and route through Yjs CRDT.

3. **Fix H2+H3**: Consolidate tool event emission to a single channel. Either use only `toolProgress` hooks OR only `mapEventToSSE`, not both writing to the SSE stream.

4. **Fix H5**: Use `getCopilotManager().tryGetEngine(projectId)` instead of `getCopilotEngine()` in the DELETE and GET history fallback handlers.

5. **Fix H6**: Track `toolCallCount` delta between usage events instead of sending the cumulative total to aggregates each time.
