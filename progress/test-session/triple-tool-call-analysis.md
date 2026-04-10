# Triple "Scanning project structure" Tool Call Analysis

## Bug Description

The chat UI shows "Scanning project structure" 3 times when only 1 actual `list_files` tool call executes.

## Root Cause: Three Independent `tool_call` SSE Emission Channels

When the AI calls a tool (e.g., `list_files`), three separate code paths each emit a `tool_call` SSE event to the frontend:

### Channel 1: `toolProgress.onToolStart` (line 1219-1224 of chat.ts)

The `toolProgress` object is passed to the Copilot SDK's `createSession` / `resumeSession`. The SDK invokes `onToolStart` before running any tool handler.

```typescript
// chat.ts line 1218-1224
const toolProgress = {
  onToolStart: (toolName: string, args: unknown) => {
    recordAssistantToolCall(toolName, args as Record<string, unknown>);
    const friendly = friendlyToolMessage(toolName, args as Record<string, unknown>);
    stream.writeSSE({ data: JSON.stringify({
      type: "tool_call", data: { name: toolName, friendlyMessage: friendly },
    }) }).catch(() => {});
  },
```

**When it fires**: The SDK calls this callback right before it invokes the tool handler.

### Channel 2: `onToolEvent` subscription (line 1532-1541 of chat.ts)

The `onToolEvent` system is an independent per-project event bus. Tool handlers in `copilot.ts` call `emitToolEvent()` at the start of their execution body.

```typescript
// chat.ts line 1532-1541
const unsubToolEvents = onToolEvent(projectId, (toolName, status, args) => {
  if (status === "start") {
    recordAssistantToolCall(toolName, args);
    const friendly = friendlyToolMessage(toolName, args);
    stream.writeSSE({
      data: JSON.stringify({
        type: "tool_call",
        data: { name: toolName, friendlyMessage: friendly, arguments: args },
      }),
    }).catch(() => {});
  }
```

**When it fires**: The tool handler itself calls `emitToolEvent(projectId, "list_files", "start", ...)` at `copilot.ts` line 809. This is INSIDE the tool handler, so it fires slightly after `onToolStart`.

### Channel 3: `mapEventToSSE` (line 3682-3708 of chat.ts, invoked at line 1941)

The SDK event iterator produces `tool.running` or `tool.execution_start` events. The main streaming loop calls `mapEventToSSE()` which maps these to `tool_call` SSE events.

```typescript
// chat.ts line 3681-3708
case "tool.running":
case "tool.execution_start": {
  const toolName = (data?.toolName ?? data?.name) as string | undefined;
  ...
  return {
    type: "tool_call",
    data: { name: toolName, friendlyMessage: ... },
  };
}
```

**When it fires**: The SDK emits these events as part of its event stream, processed at line 1941:
```typescript
const sseData = mapEventToSSE(event);
if (sseData) {
  // ... writes to stream at line 2058
  await stream.writeSSE({ data: JSON.stringify(sseData) });
}
```

## Execution Order for a Single `list_files` Call

1. SDK decides to call `list_files`
2. SDK fires `onToolStart` callback --> **Channel 1 emits `tool_call` SSE**
3. SDK invokes the tool handler
4. Tool handler calls `emitToolEvent("list_files", "start")` --> **Channel 2 emits `tool_call` SSE**
5. SDK iterator yields `tool.execution_start` event
6. Main loop calls `mapEventToSSE` --> **Channel 3 emits `tool_call` SSE**

Result: **3 identical `tool_call` SSE events** for 1 actual tool execution.

## Additionally: `recordAssistantToolCall` Is Called 3 Times

- Channel 1 calls it at line 1220
- Channel 2 calls it at line 1534
- Channel 3 calls it at line 1955

This means the tool call is recorded 3 times in the `assistantToolCalls` array, which is persisted to the database. This inflates the `tool_calls` column and the `tool_actions` derived from it.

## Recommendation: Which Channel to Keep

**Keep Channel 1 (`toolProgress.onToolStart`) as the canonical source. Remove Channels 2 and 3 for `tool_call` emissions.**

### Why Channel 1:
- It's the SDK's official callback mechanism, fired at the right moment (before tool execution)
- It already records tool calls and generates friendly messages
- It's the most reliable -- always fires when the SDK runs a tool
- It handles `provision_supabase` special logic (lines 1233-1240)

### Why NOT Channel 2 (`onToolEvent`):
- It was originally added for plan/clarification tool events that need real-time data from inside the tool handler (line 1529 comment: "captures plan/clarification data from tool handlers in real-time")
- The `status === "start"` branch duplicates Channel 1 exactly
- **Fix**: Remove the `if (status === "start")` block (lines 1533-1541). Keep the `status === "end"` block (lines 1544-1584) because it handles plan/clarification data extraction that Channel 1 cannot do (it needs the tool's return value parsed differently).

### Why NOT Channel 3 (`mapEventToSSE`):
- The `tool.running` / `tool.execution_start` SDK events duplicate what `onToolStart` already reported
- The code at line 1955 also calls `recordAssistantToolCall` again, triple-counting
- **Fix**: Have `mapEventToSSE` return `null` for `tool.running` and `tool.execution_start` events (same as it already does for `external_tool.requested` at line 3712). The tool_call emission is already handled by Channel 1.

## Proposed Fix

### Fix 1: Remove Channel 2's `start` emission (chat.ts ~line 1532-1541)

Change:
```typescript
const unsubToolEvents = onToolEvent(projectId, (toolName, status, args) => {
  if (status === "start") {
    recordAssistantToolCall(toolName, args);
    const friendly = friendlyToolMessage(toolName, args);
    stream.writeSSE({
      data: JSON.stringify({
        type: "tool_call",
        data: { name: toolName, friendlyMessage: friendly, arguments: args },
      }),
    }).catch(() => {});
  }
```

To:
```typescript
const unsubToolEvents = onToolEvent(projectId, (toolName, status, args) => {
  // NOTE: tool_call SSE for "start" is emitted by toolProgress.onToolStart
  // (Channel 1). Do NOT emit here to avoid triple tool_call events.
```

### Fix 2: Suppress Channel 3's tool_call emission (chat.ts ~line 3681-3708)

Change the `mapEventToSSE` function to skip `tool.running` and `tool.execution_start`:
```typescript
case "tool.running":
case "tool.execution_start":
  // Suppressed: tool_call SSE is emitted by toolProgress.onToolStart.
  // Emitting here would cause duplicate tool_call events in the chat UI.
  return null;
```

And remove the `recordAssistantToolCall` call at line 1955 (inside the `if (sseData.type === "tool_call")` block), or it becomes dead code since `tool_call` will only come from Channel 1 which already records.

### Fix 3: De-duplicate `recordAssistantToolCall`

After fixes 1 and 2, only Channel 1 calls `recordAssistantToolCall`. The calls at lines 1534 and 1955 become unreachable for tool_call events. Clean them up.

## Impact

- Chat UI will show exactly 1 "Scanning project structure" per tool call instead of 3
- The `tool_calls` column in `ai_messages` will have accurate counts
- The `tool_actions` derived from `tool_calls` will not have duplicates
- Channel 3 (`mapEventToSSE`) still handles `tool.execution_complete` -> `tool_result` which is NOT duplicated (only one source for results)
