# Bug 28 — Stale traces stuck in "streaming" status after API restart

**Status:** ✅ RESOLVED (2026-04-13)
**Severity:** 🟡 Medium (data integrity, misleading metrics)
**Area:** `services/api/src/ai/trace-collector.ts`, `chat_traces` table
**Discovered:** 2026-04-13 E2E test

## Root Cause
`index.ts` startup cleanup only handled `ai_active_streams` table, NOT `chat_traces`. Traces in "streaming" status from mid-stream crashes were never finalized.

## Fix
Added SQL UPDATE on startup to mark `chat_traces` with status='streaming' and `turn_started_at < now() - interval '5 minutes'` as 'aborted'.

## Verification
`aborted: 2` in trace-stats (previously 0 — two stale traces correctly cleaned up).
**Status:** Open

## Symptom

When the API process restarts mid-stream (e.g., docore rebuild triggers tsx watch restart), in-progress chat traces remain in `status: "streaming"` forever. They have no `turn_ended_at`, no token counts, and no cost data.

Evidence from `/projects/:id/traces`:
```json
{
  "id": "cfb24b3d-...",
  "status": "streaming",
  "turn_ended_at": null,
  "duration_ms": 435383,
  "ttft_ms": null,
  "prompt_tokens": null,
  "total_tokens": null,
  "estimated_cost_usd": null,
  "tool_call_count": 120
}
```

This trace was from the first build attempt that got interrupted when the API restarted due to sandbox code changes.

## Impact

- `/projects/:id/trace-stats` reports inflated `avg_duration_ms` (stale traces have very long durations)
- `total_traces: 4` but only `completed: 2` — the 2 stale traces skew averages
- No way to distinguish an interrupted trace from a truly stalled one
- Missing token/cost data makes billing reconciliation incomplete

## Expected Behavior

On API startup, any traces in `"streaming"` status older than N minutes should be marked as `"aborted"` or `"interrupted"` with the current timestamp as `turn_ended_at`.

## Fix Suggestion

Add a cleanup query on startup in the trace collector or server init:
```sql
UPDATE chat_traces
SET status = 'aborted', turn_ended_at = NOW()
WHERE status = 'streaming'
  AND turn_started_at < NOW() - INTERVAL '5 minutes';
```
