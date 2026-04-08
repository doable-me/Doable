# Bug 5 — Inconsistent `tool.execution_*` logging

**Severity:** 🟢 Low (log hygiene)
**Area:** `services/api/src/routes/chat.ts:1528` (approximate)
**Discovered:** 2026-04-08 test run
**Status:** Open

## Symptom

Tool execution log lines sometimes render with an empty tool name:

```
[Chat][db9a5d1c] tool.execution_start: report_intent
[Chat][db9a5d1c] tool.execution_start: read_file
[Chat][db9a5d1c] tool.execution_start: read_file
[Chat][db9a5d1c] tool.execution_complete:
[Chat][db9a5d1c] tool.execution_complete:
[Chat][db9a5d1c] tool.execution_complete:
```

The trailing `tool.execution_complete:` lines with nothing after the colon are real log lines — the tool name is missing.

## Root cause

`chat.ts:1528-1530` (approximate) logs tool events with:

```ts
console.log(`[Chat][${projectShort}] ${evtType}: ${evtData?.toolName ?? evtData?.name ?? ""}`);
```

When the SDK emits `tool.execution_complete` events without `toolName` or `name` in `data` (which it does for some tool shapes), the fallback is an empty string. The log line prints the event type with no name suffix.

Additionally: the 2026-04-08 test showed only 3 `tool.execution_start` lines but the stream-done summary reported `tools: 4`. The 4th tool either (a) was emitted through a different code path that doesn't hit this logger (e.g. `onToolEvent` path at `chat.ts:1036` which calls `recordAssistantToolCall` without the 1528 logger), or (b) scrolled off the 37-line tmux pane between polls. Either way, log coverage for tool events is inconsistent.

## Impact

- Log readers can't count tool calls reliably by grepping the log.
- Blame-mapping which specific tool "completed" is impossible for events without a name.
- Inflates the noise/signal ratio in the API log.

## Fix

### Correlate via `tool_use_id`

The SDK emits a `tool_use_id` on both `execution_start` and `execution_complete` for the same tool. Maintain a map in the chat handler:

```ts
const pendingTools = new Map<string, string>();  // tool_use_id → toolName
// on execution_start:
pendingTools.set(evtData.tool_use_id, evtData.toolName);
// on execution_complete:
const name = evtData.toolName ?? pendingTools.get(evtData.tool_use_id) ?? "?";
console.log(`[Chat][${projectShort}] ${evtType}: ${name}`);
pendingTools.delete(evtData.tool_use_id);
```

### Or drop empty-name logs

Simpler: skip logging when there's no name to show.

```ts
const name = evtData?.toolName ?? evtData?.name;
if (name) console.log(`[Chat][${projectShort}] ${evtType}: ${name}`);
```

Loses some signal (you no longer see *that* an event fired) but eliminates the noise.

### Unify tool event logging

The dual-path problem (path B at `chat.ts:1528` vs path C at `chat.ts:1036`) should also be resolved. All tool events should funnel through one logger so the log is the canonical count of tool calls per run. api-watcher noted during the audit that this dual-path structure made it impossible to confirm whether all tool events were logged or just a subset.

## Reproduction

Reliable during any chat run that invokes 2+ tools. Observed on 2026-04-08 test.
