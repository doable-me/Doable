# Always-Connected User Experience — Technical Architecture

> **Priority**: This document describes Doable's most critical UX guarantee — the user must
> never feel abandoned during any AI operation. Every second of wait time must have
> visible, meaningful feedback.

## Core Principle

From the moment a user presses Enter to the moment they see their app in the preview,
**every phase emits real-time status events**. There is no silent gap longer than 2 seconds.

---

## The Full Pipeline (New Project, Plan Mode)

```
User presses Enter
  │
  ├─ "Setting up..."                          (instant)
  ├─ "Creating project files..."              (5-15s — scaffold + npm install)
  ├─ "Starting live preview..."               (2-10s — Vite dev server)
  ├─ "Connecting to AI..."                    (2-5s — Copilot engine + session)
  │
  ├─ AI calls ask_clarification tool
  │   ├─ tool_call SSE: "Working on your project"
  │   ├─ tool_result SSE: success
  │   └─ clarification SSE: interactive question cards appear
  │       └─ User answers → "Continue"
  │
  ├─ AI calls create_plan tool
  │   ├─ tool_call SSE: "Working on your project"
  │   ├─ tool_result SSE: success
  │   └─ plan SSE: PlanCard with steps appears
  │       └─ User clicks "Start Building"
  │
  ├─ Mode switches to agent (build)
  │   ├─ AI streams text_delta tokens (real-time typing)
  │   ├─ tool_call: "Creating file — App.tsx"
  │   ├─ tool_result: "Added to your project"
  │   │   └─ Preview refreshes (1s delay for HMR)
  │   ├─ tool_call: "Installing package — react-router-dom"
  │   ├─ tool_result: "Package installed"
  │   └─ ... more tool calls ...
  │
  ├─ Auto-fix loop (if errors detected)
  │   ├─ "Checking preview for errors..."     (1.5s HMR settle + detection)
  │   ├─ "Found an error — fixing it..."      (AI fix attempt)
  │   ├─ "Verifying the fix..."               (re-check)
  │   └─ "Error fixed successfully"           (or retry up to 3x)
  │
  ├─ version_created SSE: git commit SHA
  │   └─ "Undo" button appears on message
  │
  └─ Stream ends → final preview refresh
```

---

## SSE Event Types Reference

### Streaming Events (continuous during AI response)

| Event | Data | Frontend Rendering | Duration |
|-------|------|--------------------|----------|
| `text_delta` | Token string | Accumulated text with animated cursor | Continuous |
| `thinking` | Reasoning token | Collapsible "Thinking..." box with brain icon | Seconds |
| `keep_alive` | Empty | Ignored (prevents proxy timeout) | Every 10s |

### Tool Execution Events (per tool call)

| Event | Data | Frontend Rendering | Duration |
|-------|------|--------------------|----------|
| `tool_call` | `{name, friendlyMessage}` | Spinning wrench icon + friendly message | Until result |
| `tool_result` | `{name, success, friendlyMessage}` | Green checkmark + message; triggers preview refresh | Instant |

### Plan Mode Events

| Event | Data | Frontend Rendering | Triggers |
|-------|------|--------------------|----------|
| `clarification` | `{questions: [...]}` | Interactive `ClarificationCard` components with radio buttons, free text, "Continue"/"Skip" | User must respond |
| `plan` | `{plan: {...}}` | `PlanCard` with steps, complexity badge, "Start Building"/"Refine"/"Reset" buttons | User must approve |
| `plan_step_update` | `{stepId, status}` | `PlanProgress` checklist with animated step completion | During build |

### Status Phase Events (setup + auto-fix)

| Phase | Message | When | Duration |
|-------|---------|------|----------|
| `scaffolding` | "Creating project files..." | First message to new project | 5-15s |
| `dev-server` | "Starting live preview..." | First message, after scaffold | 2-10s |
| `connecting` | "Connecting to AI..." | First session creation | 2-5s |
| `reconnecting` | "Reconnecting to AI..." | Session lost mid-conversation | 3-8s |
| `checking` | "Checking preview for errors..." | After AI writes files | 2s |
| `fixing` | "Found an error — fixing it..." | Error detected in preview | 10-30s |
| `verifying` | "Verifying the fix..." | After fix attempt | 2s |
| `fixed` | "Error fixed successfully" | Fix verified | Instant |

### Lifecycle Events

| Event | Data | Purpose |
|-------|------|---------|
| `version_created` | `{sha}` | Enables "Undo" button; git commit created |
| `auto_fix_complete` | `{success, error?}` | Signals end of auto-fix loop |
| `error` | Error string | Renders red error text in chat |

---

## How Each Phase Stays Responsive

### 1. Scaffold + Dev Server (First Message Only)

**Problem**: `npm install` + Vite startup can take 15-30 seconds.

**Solution**: Granular status events before each sub-step:
```
stream.writeSSE({ type: "status", data: { phase: "scaffolding", message: "Creating project files..." } })
→ createProject(projectId)   // includes npm install

stream.writeSSE({ type: "status", data: { phase: "dev-server", message: "Starting live preview..." } })
→ startDevServer(projectId)  // Vite spawn + health checks
```

**Parallelization**: While scaffold/dev-server are sequential (dev server needs `node_modules`),
the AI config resolution and workspace lookup run in parallel:
```typescript
const [aiConfig, workspaceRow] = await Promise.all([
  resolveAiEngine(...),
  sql`SELECT workspace_id FROM projects WHERE id = ${projectId}`,
]);
```

Context building and tool creation also run in parallel:
```typescript
const [projectContext, allTools] = await Promise.all([
  buildProjectContextForMode(...),
  createAllTools(...),
]);
```

### 2. AI Session Creation

**Problem**: Starting a Copilot engine CLI process + creating a session takes 2-5s.

**Solution**: `"Connecting to AI..."` status event before `withAutoRetry(createSession)`.

**Recovery**: If the session is lost (engine recycled, auth error), the recreation path
emits `"Reconnecting to AI..."` before the 3-8s recreation process. The `withAutoRetry`
mechanism automatically evicts stale engines and retries with fresh auth.

### 3. Streaming AI Response

**Problem**: AI responses can take 10-60 seconds with many tool calls.

**Solution**: Multiple concurrent feedback channels:

1. **Text streaming** (`text_delta`): Token-by-token rendering with animated cursor.
   Batched via `requestAnimationFrame` to avoid excessive re-renders.

2. **Tool progress** (`tool_call` / `tool_result`): Each tool shows a spinning wrench
   with a human-friendly message ("Creating your homepage", "Installing react-router-dom").
   When done, switches to green checkmark.

3. **Thinking indicator** (`thinking`): If the model uses extended reasoning, a collapsible
   "Thinking..." section appears with the brain icon.

4. **SDK RPC hooks** (`toolProgress.onToolStart/onToolEnd`): These fire via a separate
   RPC channel from the SDK, guaranteed to deliver even if the event stream has gaps.
   The `onToolEnd` hook also emits `clarification`/`plan` structured events.

5. **Tool event bridge** (`onToolEvent`): A backup channel — tool handlers in `copilot.ts`
   call `emitToolEvent()` directly, and the chat route subscribes via `onToolEvent()`.
   Both channels emit the same events for redundancy.

### 4. Preview Updates

**Problem**: User needs to see their app update as the AI writes files.

**Solution**: Three-layer refresh strategy:

1. **Vite HMR** (primary): Vite's built-in Hot Module Replacement updates the preview
   iframe automatically when files change on disk. No explicit trigger needed.

2. **Tool result refresh** (1s delay): After each `tool_result` event, the preview panel
   triggers a cache-bust iframe reload after 1 second (gives HMR time to process).

3. **Periodic fallback** (8s interval): During streaming, a fallback refresh runs every
   8 seconds to catch any missed HMR updates.

4. **End-of-stream refresh** (800ms): When streaming ends, a final refresh ensures the
   preview shows the complete result.

### 5. Auto-Fix Loop

**Problem**: The AI might write code with errors (missing imports, syntax errors).

**Solution**: After the AI finishes writing files, an automatic error detection + fix loop runs:

1. Wait 1.5s for Vite HMR to process all file changes
2. Fetch the preview page and check for `<vite-error-overlay>` or error markers
3. If error found → send fix prompt to AI → stream the fix → verify
4. Repeat up to 3 times

Each phase emits a status event ("Checking...", "Fixing...", "Verifying...") so the user
sees progress throughout.

### 6. Plan Mode Interaction

**Problem**: Plan mode needs to walk the user through questions before building.

**Solution**: Interactive card-based flow:

1. AI calls `ask_clarification` tool → `clarification` SSE event → frontend renders
   `ClarificationCard` components with radio buttons, free text, skip option
2. User answers → sent as follow-up message → AI calls `create_plan` tool
3. `plan` SSE event → frontend renders `PlanCard` with draggable steps,
   edit/remove/reorder, "Start Building" button
4. User approves → mode switches to agent → AI executes the plan step by step
5. Each step completion emits `plan_step_update` → `PlanProgress` shows live checklist

**Tool restriction**: In plan mode, only read-only + plan tools are available:
`read_file`, `list_files`, `search_files`, `ask_clarification`, `create_plan`, `mark_step_complete`.
This prevents the AI from skipping the planning phase and building directly.

---

## Collaboration: Multi-User Real-Time

When multiple users are on the same project:

| WebSocket Event | Purpose |
|----------------|---------|
| `ai:message-sent` | Show remote user's prompt in local chat |
| `ai:stream-chunk` | Mirror AI text/thinking tokens to all users |
| `ai:stream-end` | Signal end of remote user's AI response |
| `ai:tool-event` | Show tool activity from remote requests |
| `ai:status` | Mirror status/auto-fix events |
| `ai:error` | Show errors from remote requests |

Every SSE event emitted to the requesting user is ALSO broadcast to collaborators
via WebSocket, so all users see the same real-time progress.

---

## Streaming Architecture: session.send() + session.on()

The Copilot SDK v0.2.0 `session.on()` handler delivers ALL events in real-time when
using `session.send()` (non-blocking):
- `assistant.message_delta` — token-by-token text streaming
- `assistant.reasoning_delta` — thinking/reasoning tokens
- `tool.execution_start` / `tool.execution_complete` — tool lifecycle
- `session.idle` — response complete
- `session.error` — errors

**Critical**: Do NOT use `session.sendAndWait()` — it consumes events internally and
the generator never receives them. Always use `session.send()` + `session.on()`.

The `sendMessage` generator in `copilot.ts` collects events via `session.on()` into
a queue, then yields them one by one to the caller (`chat.ts` streaming loop). The
caller maps each event through `mapEventToSSE` and writes it to the SSE stream.

Tool progress also flows through the separate `toolProgress` RPC hooks
(`onToolStart`/`onToolEnd`) for redundancy — both channels deliver tool events.

---

## Connection Resilience

| Mechanism | Purpose |
|-----------|---------|
| `keep_alive` every 10s | Prevents Cloudflare Tunnel / proxy timeouts |
| `X-Accel-Buffering: no` header | Prevents nginx/proxy SSE buffering |
| `trackRequest()` / `releaseTracker()` | Prevents engine pool from recycling mid-stream |
| `withAutoRetry()` | Auto-evicts stale auth tokens and retries with fresh engine |
| Session recreation with full `systemPrompt` | Mid-conversation engine loss recovers seamlessly |
| Activity-based timeout (2 min inactivity) | Prevents permanent hangs on dead sessions |

---

## Key Files

| File | Role |
|------|------|
| `services/api/src/routes/chat.ts` | SSE streaming endpoint, status events, auto-fix, plan event emission |
| `services/api/src/ai/providers/copilot.ts` | SDK tool definitions, `emitToolEvent` bridge, `sendMessage` generator |
| `services/api/src/ai/providers/copilot-manager.ts` | Per-project engine pool, `trackRequest`, `withAutoRetry` |
| `services/api/src/projects/dev-server.ts` | Vite process management, health checks |
| `services/api/src/projects/file-manager.ts` | Project scaffolding, file operations |
| `apps/web/src/modules/editor/hooks/use-chat.ts` | SSE parsing, state updates, plan callbacks |
| `apps/web/src/modules/editor/chat/chat-message.tsx` | Status icons, thinking box, tool cards |
| `apps/web/src/modules/editor/preview/preview-panel.tsx` | Preview refresh triggers (HMR + tool_result + periodic + end-of-stream) |
| `apps/web/src/modules/editor/chat/plan/` | ClarificationCard, PlanCard, PlanProgress components |
| `apps/web/src/app/editor/[projectId]/page.tsx` | Production editor, SSE parsing, plan state management |

---

## Anti-Patterns to Avoid

1. **Never add a sequential await without a status event** — if it takes >1s, emit progress first
2. **Never swallow errors silently** — always emit an `error` SSE event so the user knows what happened
3. **Never block the SSE stream** — use `.catch(() => {})` on non-critical writes
4. **Never skip the `keep_alive` interval** — proxy timeouts cause silent disconnects
5. **Never remove `toolProgress` hooks from `createSession`** — they're the reliable RPC channel for plan events
6. **Never remove `onToolEvent` subscription** — it's the backup channel for tool events
7. **Never use `systemPrompt: ""` in session recreation** — the AI loses all context
8. **Never allow write tools in plan mode** — the AI will skip planning and build directly
