# TC-AI-CHAT-AUTOCONTINUE-TRACE — `tool_call_count` survives auto-continue

Source: BUG-TRACE-001 (env1, 2026-05-10).
Helper under test: `services/api/src/routes/chat/tool-event-bookkeeping.ts` →
`recordToolEventForTrace()`, called from BOTH:
- `services/api/src/routes/chat/event-processor.ts` (main turn)
- `services/api/src/routes/chat/stream-recovery.ts` (auto-continue rounds)

Root cause covered: the auto-continue inline SDK callback in
`stream-recovery.ts` previously matched only `tool.execution_start` and
`tool.execution_complete|tool.completed`, missing `tool.running` (used by
some Copilot-SDK channels for tool execution start) and
`external_tool.completed` (used for MCP / external tool completion). Any
auto-continue round whose tools were dispatched on those event types had
its `tool_call_count` recorded as 0, which broke per-turn observability,
OTel `ai.tool_call_count` attribute, and `ai_usage_*` aggregation.

Both call sites now route every event through the same helper, so the two
paths can't drift again.

---

## TC-AICAT-001 — Tool start increments trace count for `tool.execution_start`

- **Setup:** unit-level — call `recordToolEventForTrace(state, evt, rec)`
  with `evt.type = "tool.execution_start"` and `evt.data = { toolName: "read_file", arguments: { path: "x" } }`.
- **Expected:**
  - `state.hadToolCalls === true`
  - `state.traceCollector.onToolStart` invoked once with `("read_file", { path: "x" })`
  - `recordAssistantToolCall` invoked once with `("read_file", { path: "x" })`
  - return value `{ handled: true, phase: "start", toolName: "read_file", toolArgs: { path: "x" } }`

## TC-AICAT-002 — Tool start increments trace count for `tool.running`

- **Setup:** as 001 but with `evt.type = "tool.running"`.
- **Expected:** identical to 001. This is the BUG-TRACE-001 regression
  guard — previously this event type was silently dropped in
  `stream-recovery.ts` so auto-continue's `tool_call_count` stayed at 0.

## TC-AICAT-003 — Tool end fires trace `onToolEnd` for `tool.execution_complete`

- **Setup:** call helper with `evt.type = "tool.execution_complete"`,
  `evt.data = { toolName: "edit_file", result: "ok" }`.
- **Expected:** `state.traceCollector.onToolEnd("edit_file", evtData, "ok")`
  invoked exactly once.

## TC-AICAT-004 — Tool end fires for `tool.completed`

- **Setup:** identical to 003 with `evt.type = "tool.completed"`.
- **Expected:** identical to 003.

## TC-AICAT-005 — Tool end fires for `external_tool.completed`

- **Setup:** identical to 003 with `evt.type = "external_tool.completed"`,
  `evt.data = { name: "mcp_canva_export", output: "ok" }`.
- **Expected:** `state.traceCollector.onToolEnd("mcp_canva_export", evtData, "ok")`
  invoked exactly once. Validates the MCP / external-tool code path that
  was missing from the auto-continue inline callback.

## TC-AICAT-006 — Non-tool events are ignored

- **Setup:** call helper with `evt.type = "assistant.message_delta"` and
  `evt.type = "session.idle"`.
- **Expected:** no calls to `traceCollector` and no mutation of `state`.
  Return value `{ handled: false, phase: null }`.

## TC-AICAT-007 — End-to-end: 4-turn chat with auto-continue → trace `tool_call_count > 0` for the auto-continue turn

- **Setup:** Run a 4-turn chat session in env1 (zantaz) where Turn 4 is
  intentionally crafted to trigger an auto-continue cycle (e.g. a build
  prompt the model initially explores via `read_file` only).
- **Steps:**
  1. Send 3 short build prompts; verify trace `tool_call_count > 0` each.
  2. Send a 4th prompt that the model is likely to "explore then
     continue": "Add a footer with copyright info to the existing app".
  3. After turn 4 completes, query the trace:
     ```sql
     SELECT tool_call_count, auto_continue_count
     FROM ai_traces
     WHERE project_id = $PROJECT_ID
     ORDER BY created_at DESC LIMIT 1;
     ```
- **Expected:** `tool_call_count > 0` AND `auto_continue_count >= 1`.
  Specifically, the per-turn count should match the SDK-reported tool
  count (visible in the SSE `usage` event for that turn).
- **Severity:** medium (the original BUG-TRACE-001 repro).
