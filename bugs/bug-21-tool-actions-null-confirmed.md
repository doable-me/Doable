# Bug 21 — `ai_messages.tool_actions` column is NULL for every assistant turn (bug-06 still reproducing)

**Severity:** 🟡 Medium (chat history replay broken — tools aren't visible on reload)
**Area:** `services/api/src/routes/chat.ts` — post-stream persistence path, where `tool_calls` is stored but `tool_actions` is omitted
**Discovered:** 2026-04-09 round-2 E2E (previously reported as bug-06 on 2026-04-08)
**Status:** Open — bug-06 never fixed

## Symptom

Query after a multi-tool turn:

```sql
SELECT id, role, had_tool_calls,
       (tool_actions IS NOT NULL AND jsonb_array_length(COALESCE(tool_actions,'[]'::jsonb)) > 0) AS has_actions,
       jsonb_array_length(COALESCE(tool_actions,'[]'::jsonb)) AS n_actions
FROM ai_messages
WHERE session_id = 'ca229e51-47d2-4e13-878f-62bc2c63ed0c'
ORDER BY created_at DESC LIMIT 4;
```

Result: every assistant row has `had_tool_calls=true` and `n_actions=0`. The `tool_calls` column **is** populated with a JSON array of tool call records, but `tool_actions` (the structured, UI-displayable action list with status + diff + outputs) is empty.

## Impact

- When a user refreshes the editor mid-session or reopens a project, the chat history re-renders without the "14 file changes" / "22 actions" collapsibles for prior turns — users lose the audit trail of what the AI did.
- Replay of failed turns is broken — the retry flow can't reconstruct which actions succeeded vs failed.
- This is the same defect bug-06 described on 2026-04-08 but under a new session id, proving bug-06 is not yet fixed.

## Reproduction

Identical to bug-06 reproduction.

## Root cause

(Not yet investigated. bug-06 hypothesized this was a code-path gap in the persistence layer — the stream handler writes `tool_calls` but never writes `tool_actions` despite accumulating action records in memory during the stream.)

## Fix

Re-open bug-06 with the additional data point that the defect still reproduces on round-2 (2026-04-09). Defer fix until after higher-priority bugs 13–20 are closed.

## Acceptance

Same as bug-06:
1. After a multi-tool turn, the DB row has `tool_actions` populated with the action list.
2. Reopening the editor renders the "N file changes" collapsible for each prior turn.
