# BUG-TRACE-001 — `tool_call_count = 0` on auto-continue cycles despite real tool invocations

**Severity:** medium (analytics/observability — not user-blocking, but breaks usage metering and trace fidelity)
**Found:** 2026-05-10 by trace-analyst on env1, replayed via session log
**Where:** AI chat post-stream tracing. Affects per-turn `tool_call_count` field returned in the SSE `usage` event AND the OTel/Honeycomb spans.

## Reproduction

1. Run a 4+ turn AI chat conversation where one turn triggers an "auto-continue" cycle (the model emitted code as text instead of writing files, so the orchestrator forces another tool-call round).
2. Inspect the trace for that turn (e.g. via `/admin/audit` or the trace table directly).

## Actual

Turn 4 traces showed `tool_call_count = 0` even though ~19 real tool calls (read_file / edit_file) ran through the SDK during the auto-continue cycle.
Turns 1–3 (no auto-continue) had correct counts: 11/11, 16/16, 3/3.

## Expected

`tool_call_count` reflects every tool invocation including those during auto-continue rounds. The `tool_start` / `tool_end` trace events should fire for each.

## Root cause hypothesis

`onToolStart` / `onToolEnd` callbacks are likely registered ONCE on the initial Copilot SDK request. Auto-continue spawns a fresh `sendMessage` call internally without re-binding those callbacks, so its tool events disappear from the trace + the counter stays 0.

## Suggested fix

In `services/api/src/routes/chat/auto-continue.ts` (or wherever the auto-continue loop lives), thread the same `onToolStart` / `onToolEnd` handlers into the recursive call. Increment `state.toolCallCount` from inside the callback body so the count survives auto-continues. Verify each iteration emits its own pair of trace events.

## Evidence
Trace IDs from the prior session: 8f96878e (turn 4 with the bug), fdf82bad / d8b9d6b8 / a190f0f9 (turns 1-3, control).
Total session: 715s wall, ~49 tool calls reported by the SDK across 4 turns. Trace recorded 30 (11+16+3+0) — 19 missing all from turn 4.
