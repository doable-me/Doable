# 03 — Streaming Patterns (Discovery Brief)

> Read-only audit of every streaming/event channel in Doable, so the build-event
> protocol PRD can choose between reusing an existing channel and adding a new one.
> Repo state: branch `main`, top commit `80b4f85`. Note: `services/ws/` (not
> `apps/ws/` — the brief had it wrong).

## SSE endpoints

All SSE flows in `services/api` use Hono's `streamSSE` helper from
`hono/streaming`. There is no `EventSource`-style GET endpoint for live
updates outside of `chat/stream-resume`; everything else streams as the
*response body* of the originating POST.

| Route | File:line | Event types (`data.type` values) | Consumer |
|---|---|---|---|
| `POST /projects/:id/chat` | `services/api/src/routes/chat/send-handler.ts:178` (handler `streamSSE` opens) | `status` (phases: `scaffolding`, `dev-server`, `thinking`, `building`, `reconnecting`, `fixed`), `keep_alive`, `thinking`, `text_delta`, `tool_delta`, `tool_call`, `tool_executing`, `tool_result`, `tool.completed`, `clarification`, `plan`, `plan_step_update`, `mcp_ui_resource`, `artifact_ready`, `integration_required`, `version_created`, `auto_fix_complete`, `error`, `[DONE]` literal | `apps/web/src/app/editor/[projectId]/page.tsx` `streamChat()` (line 387) |
| `GET /projects/:id/chat/stream-resume?messageId&lastSeq` | `services/api/src/routes/chat/misc-routes.ts:97` | Replays original chat events with `seq` cursor; terminal: `complete`, `already_complete`, `no_buffer`, `resume_timeout` | Same `streamChat()` (resume path) — used after refresh / network blip |
| `POST /projects/:id/chat/fix-error` | `services/api/src/routes/chat/fix-error.ts:77` | `status`, `tool_call`, `tool_executing`, `tool_result`, `auto_fix_complete`, `version_created`, `error`, `[DONE]` | Editor preview-error overlay (auto-fix) |
| `POST /deploy/:projectId/stream` | `services/api/src/routes/deploy/deploy-trigger.ts:95` (parallel JSON variant at `:27`) | Uses Hono's `event:` field per write — `status` (with `step` of `building`/etc.), `complete`, `error` | Deploy dialog: `apps/web/src/modules/editor/toolbar/deploy-dialog.tsx:95` (this is the **only** client that branches on `Content-Type: text/event-stream`) |
| `POST /integrations/supabase/provision` (streaming variant) | `services/api/src/routes/integrations/supabase/provision-create.ts` (uses `streamSSE`); coordinates with `services/api/src/integrations/supabase/provisioner.ts` | Provision phases (auth wait, project create, key fetch); credentials are **never** put on the wire (see provisioner.ts:37 comment) | Supabase setup wizard |

The MCP transport (`services/api/src/mcp/transport-http.ts`, `discovery.ts`)
also negotiates `Accept: application/json, text/event-stream`, but that's
*outbound* — Doable's MCP client speaking the MCP HTTP+SSE transport to a
remote MCP server, not Doable serving SSE.

### Wire format conventions
- Helpers in `services/api/src/ai/streaming.ts` define a typed `StreamEvent =
  { type, data, timestamp }` model and a `serializeSSE` that emits
  `event: <type>\ndata: <json>\n\n` plus `SSE_HEADERS` including
  `X-Accel-Buffering: no`. **In practice** the chat routes don't use
  `serializeSSE` — they call `stream.writeSSE({ data: JSON.stringify({type,data})})`
  with no `event:` field. So the on-the-wire contract for chat is "single
  `data:` line, JSON object with `{type, data, ...}`". The `deploy-trigger`
  route is the one place that actually sets the SSE `event:` field.
- `[DONE]` is a literal terminator string the client checks before
  `JSON.parse`.
- Keep-alive: chat handler sends `{type:"keep_alive"}` every ~25s
  (`send-handler.ts:215`). Stale-stream timeout on the client is 75s.
- All chat events are also mirrored into a per-message replay buffer
  (`ai_active_streams` row + in-memory `streamBuffer`) so `stream-resume` can
  re-emit them with monotonic `seq`. This is the existing answer to
  reconnection/back-fill.

## WebSocket (services/ws)

- **Path**: `services/ws/src/index.ts`. Plain `ws` server, no subprotocol
  negotiation; all messages are JSON over a single socket. Auth: JWT in
  `?token=` query param (`index.ts:202-216`).
- **Yjs-only? No.** Yjs is *one* of many message types. `services/ws/src/message-handler.ts`
  switches over: `room:join`, `room:leave`, `heartbeat`, `presence:update`,
  `chat:send`, `chat:typing`, `awareness:file_open/close/selection`,
  `cursor:move`, `yjs:sync-request`, `yjs:update`, `ai:typing`,
  `visual-edit:select/deselect/style-change/text-change/cursor-move/preview-refresh`,
  `design-comment:add/resolve/unresolve/delete`.
- **Yjs traffic** is the per-file CRDT sync; everything else is
  presence/awareness/team-chat/visual-edit/AI-status/design-comments. Server
  also exposes:
  - `POST /internal/broadcast` (auth via `X-Internal-Secret`) — API server
    pushes server-originated events into a project room. Used by chat send
    handler to mirror tool-status events to all collaborators
    (`send-handler.ts:303,322`).
  - `POST /internal/yjs/write` — API tools write through the CRDT when a room
    is active.
  - `GET /internal/collab-active/:projectId`, `/internal/presence/:projectId`
    — presence introspection.
- **Non-Yjs hook for AI/build events already exists**: the API broadcasts
  `ai:message-sent` and `ai:status` (with `{phase, message}`) into the room
  per-tool. So WS already carries non-Yjs traffic that mirrors the chat SSE
  status events — but it's a *secondary*, fan-out channel; the source of
  truth for the requesting client is still the chat SSE response body.

## Copilot tool-event bridge

- **Server-side wiring**:
  - `services/api/src/ai/providers/copilot-tools.ts:23-34` defines a
    per-project handler registry: `toolEventHandlers: Map<projectId, fn>` and
    `onToolEvent(projectId, handler)` returns an unsubscribe. Each Doable
    tool (`create_file`, `edit_file`, `read_file`, `list_files`, ...) calls
    `emitToolEvent(projectId, name, "start"|"end", args)` around its handler.
    This is the "fast-turn" path your project memory references.
  - `services/api/src/ai/providers/copilot-engine.ts:115-176` *also* fires
    `config.toolProgress.onToolStart`/`onToolEnd` from the Copilot SDK's
    `onPreToolUse`/`onPostToolUse` hooks. (Two parallel paths — the explicit
    in-tool emit avoids the SDK streaming bug noted in
    `project_copilot_sdk_issues.md`.)
  - `services/api/src/routes/chat/send-handler.ts:309-327` subscribes for the
    duration of one chat turn: `onToolEvent(projectId, (name,status,args)=> …)`
    builds a friendly status (`Creating Foo.tsx...`, `Updating ...`,
    `Reading ...`) and calls `stream.writeSSE({data:{type:"status", data:{phase:"building", message}}})`,
    then mirrors the same payload via WS `broadcastToRoom(projectId,
    {type:"ai:status",messageId,data})`.
  - `services/api/src/routes/chat/tool-callbacks.ts` is the longer-form
    callback set passed via `toolProgress`: it emits `tool_call` (with
    args), `tool_executing`, and `tool_result` SSE events plus accumulates
    artifacts and stashes them on terminal events.
  - `services/api/src/routes/chat/event-processor.ts` translates raw Copilot
    SDK chunks (`text_delta`, `thinking`, `tool_delta`) into SSE writes and
    feeds the trace collector.
- **Event vocabulary** at the wire (chat SSE): `tool_call`,
  `tool_executing`, `tool_result`, `tool.completed`, `tool_delta`, `status`
  (with `phase: "building"`), `integration_required`, `artifact_ready`.
- **SSE wire format** for tool events: `data: { "type": "tool_call",
  "data": { "name": <toolName>, "arguments": <argObj-or-jsonString> } }` and
  `data: { "type": "tool_result", "data": { "name", "success",
  "friendlyMessage", "artifacts"?, "result"? } }`. (Encoded by the chat
  routes with bare `writeSSE({data: JSON.stringify(...)})` — no `event:`
  field.)
- **Client consumer**: same `streamChat()` reader; tool dispatch logic at
  `apps/web/src/app/editor/[projectId]/page.tsx:535-635` (handles
  `tool_call`, `tool_executing`, `tool.completed`, `tool_result`).

## Editor chat client stream

- **Hook / function**: `streamChat()` defined inline at
  `apps/web/src/app/editor/[projectId]/page.tsx:387`. There's no extracted
  React hook — chat-panel.tsx is dead code (per memory).
- **Transport**: `fetch` + `res.body.getReader()` + `TextDecoder`, **not**
  `EventSource`. Comment at line 1061 explains: chosen so the request can
  carry the `Authorization: Bearer` header and a JSON body. Auto-refresh on
  401 retries the request once with a refreshed token.
- **Event handler dispatch**: a single `while`-loop reads the body, splits on
  `\n`, drops anything not starting with `data: `, treats the literal
  `[DONE]` as terminator, otherwise `JSON.parse`s the payload and `if
  (parsed.type === ...)` branches into the right callback. Callbacks are all
  parameters to `streamChat`: `onChunk`, `onThinking`, `onStatusChange`,
  `onToolStarted`, `onToolCompleted`, `onClarification`, `onPlan`,
  `onPlanStepUpdate`, `onProvisionSupabase`, `onMcpUiResource`,
  `onArtifactReady`, `onError`, `onDone`.
- **Reconnect / backpressure**:
  - Reconnect: yes, via `stream-resume` — when the SSE response is
    interrupted (refresh, abort, transient network), the client GETs
    `/chat/stream-resume?messageId&lastSeq` and the server replays buffered
    events with monotonically-increasing `seq` until `complete` /
    `already_complete` / `no_buffer` / `resume_timeout`. Where this is
    triggered from in the editor UI: search for `stream-resume` callers.
  - Backpressure: none beyond the natural HTTP body backpressure. Stale
    detector: client bails after 75s with no meaningful event
    (`STALE_STREAM_MS`, `page.tsx:497`). Server keep-alive at ~25s.
  - One additional retry on initial fetch failure (1.5s delay,
    `page.tsx:464-475`).

## Dev-server stdout bridge

- **Capture point**: `services/api/src/projects/dev-server-start.ts:167-184`.
  Vite is spawned with `stdio: "pipe"` via `spawnJailedVite`; `child.stdout`
  and `child.stderr` are wired to `data` listeners that:
  1. Append the chunk to a local `outputBuffer` string (capped only by
     process lifetime), and
  2. Look for the literal substrings `"Local:"` or `"ready in"` to call
     `markReady()`.
- **Forwarded to UI? No.** The buffer is consumed only on failure — the last
  500 chars are interpolated into the error message thrown back to the
  starting caller. There is no SSE/WS hook, no log table, no sliding window
  exposed to the client. The editor learns about preview errors via a
  *different* path: the iframe runtime instruments console + window error
  events through `services/api/src/visual-edit-bridge-inline.ts` and the
  preview-error pipeline (`services/api/src/ai/preview-errors.ts`), which
  feeds the auto-fix flow at `POST /chat/fix-error`. **Vite's compile/HMR
  output never reaches the user**.
- This is the gap the build-event PRD has to fill.

## Reusable channel recommendation for build events

- **Best fit: extend the chat-SSE event vocabulary AND mirror via WS
  `ai:status`-style broadcasts.** Reasoning:
  1. The chat SSE pipe already carries `status` phases (`scaffolding`,
     `dev-server`, `building`, `fixed`), already keep-alives, already has
     `seq`-buffered reconnect via `stream-resume`, and the client already has
     a typed dispatcher that ignores unknown `type`s gracefully — adding
     `build_log`/`build_phase` events is additive and doesn't need a new
     transport.
  2. The WS `/internal/broadcast` + `ai:status` fan-out lets *other*
     collaborators in the project room see the same build progress without
     opening a second SSE — pattern is already used for tool status today.
  3. Dev-server stdout is currently captured in-process at a single point
     (`dev-server-start.ts:167`) — adding a publisher there is a one-file
     change.

  Alternative (worth surfacing in the PRD): a dedicated
  `GET /projects/:id/dev-server/logs` SSE endpoint that taps the same
  publisher. Cheap to add; lets a "Build Logs" UI tail logs without being
  inside an AI chat turn. Use the same `event:`-less `data: {type,data}`
  envelope so the existing client dispatcher works.

## Open questions for design wave

1. **Replay semantics for build logs**: chat events are buffered per
   `messageId` (a *turn*). Build logs are continuous and not turn-scoped —
   what's the cursor? Per-project ring buffer keyed on `(projectId, seq)`
   stored where (memory? Postgres? both, like `ai_active_streams`)? Need to
   pick before writing 03-build-event-protocol.
2. **Cardinality**: a `vite build` for a 50-file project can emit thousands
   of lines/sec during dep-optimize. The chat-SSE writer currently issues
   one `writeSSE` per logical event with no batching. Do we batch (e.g.
   `{type:"build_log", lines:[...]}`) or rate-limit at the publisher?
3. **Redaction surface**: `dev-server-start.ts` injects `userEnvVars` from
   `resolveProjectEnvVars` (vault-backed credentials). Vite's
   define-replacement / dotenv echo could leak these into stdout. The
   provisioner.ts:37 comment ("NEVER returned via SSE / logs / chat — only
   stored in the vault") is the existing rule — 04-redaction needs an
   allow/deny list applied at the publisher boundary, *before* anything hits
   SSE or WS.
4. **Two SDK callback paths** (in-tool `emitToolEvent` vs SDK
   `onPreToolUse`/`onPostToolUse`): is the build-event PRD also expected to
   pick *one* canonical path, or do we keep both for the SDK-streaming-bug
   workaround?
5. **WS subprotocol for non-collab clients**: today, joining a project room
   requires JWT + `room:join`. A "build observer" iframe on a published site
   would not have a JWT — does the PRD propose a read-only /
   anonymous-build-status path on WS, or strictly chat-SSE-only for that
   case?
6. **Naming**: the existing `status` envelope mixes scaffolding,
   dev-server, AI thinking, building, and auto-fix into one type. The PRD
   should decide whether build-events get a *new* top-level type
   (`build_phase`, `build_log`) or piggy-back on `status` with a new `phase`
   value. (Recommendation: new top-level types so `status` stays
   coarse-grained.)
7. **Hono `event:` field**: chat omits it, deploy uses it. Pick one for the
   build channel and document in 03-build-event-protocol.
