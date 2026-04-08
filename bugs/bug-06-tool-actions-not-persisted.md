# Bug 6 — `ai_messages.tool_actions` column is empty despite the assistant having 4 `tool_calls`

**Severity:** 🟡 Medium (persistence gap, cosmetic in UI but data loss for history/analytics)
**Area:** `services/api/src/routes/chat.ts` post-stream persistence
**Discovered:** 2026-04-08 DB inspection
**Status:** Open

## Symptom

After a chat stream completes, the assistant's row in `ai_messages` has:
- `tool_calls` = populated JSONB array with 4 entries
- `tool_actions` = empty JSONB array (length 0)
- `had_tool_calls` = true
- `content` = populated (799 chars)
- `thinking_content` = populated (549 chars)

Both columns exist and both are meant to hold structured tool-event records. Only `tool_calls` is being populated.

## Evidence

Database query after the 2026-04-08 test run:

```sql
SELECT
  m.role,
  LENGTH(m.content) AS content_len,
  LENGTH(m.thinking_content) AS thinking_len,
  jsonb_array_length(COALESCE(m.tool_calls, '[]'::jsonb))   AS tool_calls_count,
  jsonb_array_length(COALESCE(m.tool_actions, '[]'::jsonb)) AS tool_actions_count,
  m.had_tool_calls
FROM ai_messages m
JOIN ai_sessions s ON s.id = m.session_id
WHERE s.project_id = 'db9a5d1c-7164-47df-8402-17910ffabe75'
ORDER BY m.created_at ASC;
```

Result:
```
  role      content_len  thinking_len  tool_calls_count  tool_actions_count  had_tool_calls
  user      279          0             0                 0                   false
  assistant 799          549           4                 0                   true
```

## Why the UI still works

`apps/web/src/app/editor/[projectId]/page.tsx:2019-2020` has a fallback when loading chat history from the API:

```ts
toolActions: m.tool_actions || (Array.isArray(m.tool_calls) && m.tool_calls.length > 0
  ? m.tool_calls.map((tc: { name?: string; arguments?: Record<string, unknown> }, i: number) => ({
      // ... construct a minimal tool action from tool_calls
    }))
  : undefined),
```

So when `tool_actions` is empty, the UI synthesizes tool actions from `tool_calls`. It doesn't look broken. But the synthesized actions are minimal:
- No friendly description (the `"Reading App.tsx"` / `"Updating App.tsx"` strings the user sees during live streaming are lost)
- No status history (running → completed timeline)
- No per-action IDs or timestamps
- No ability to group / re-expand tool cards the way they appeared live

Analytics/metrics that query `tool_actions` directly will see an empty array.

## Root cause

The `tool_actions` array is built up on the **frontend** during streaming (the editor page maintains a React state `toolActions` on each message, populated by the `onToolCompleted` callback). That rich state never flows back to the server to be persisted alongside `tool_calls`.

On the server, `chat.ts` writes `tool_calls` from the SDK events directly (the underlying Copilot SDK's tool-call records) but never builds the richer `tool_actions` structure. The `tool_actions` column is created but never written.

## Fix options

### Option A — server-side rich tool actions

Build the rich `tool_actions` structure on the server as each tool event streams, matching the shape the frontend expects. Persist both columns at post-processing time. This keeps the frontend's fallback code path but makes it a backup rather than the primary path.

### Option B — frontend posts tool_actions back

When the local stream's `onDone` fires, POST the built-up `tool_actions` array back to the server with a dedicated endpoint like `PATCH /projects/:id/chat/messages/:messageId/tool-actions`. Two network hops per turn but keeps the single source of truth on the client.

### Option C — drop the column

If `tool_actions` is genuinely redundant and the frontend fallback produces sufficient UX on history reload, drop the column and the frontend synthesis becomes the canonical path. Document this as "tool_actions is view-layer only, tool_calls is the source of truth."

## Recommendation

Option A. The server already has all the tool event data; building the richer shape in the post-processing step is the smallest change. The frontend state is just a mirror of what flows through SSE anyway.

## Reproduction

Any chat turn that invokes tools will show `tool_actions_count = 0, tool_calls_count > 0` on the assistant row. Verified on 2026-04-08 test.
