# TC-AI-CHAT-POST-PROCESSING-LATENCY — Post-stream phase boundaries are observable

Source: BUG-TRACE-002 (env1, 2026-05-10).
Helper under test: `services/api/src/routes/chat/send-handler.ts` →
`tracePhase()` wrapper.

Background: in the original repro, Turn 3 had a 121s "dead gap" between
SDK `sendAndWait` resolution and the first
`post_processing_phase:*` event. During that window, ZERO trace events
were recorded — there was no way to attribute the wait to a specific
post-processing step (autoContinue, emptyRetry, autoFixPreview,
versionAndMemory, finalCleanup).

The fix wraps every post-stream await with `tracePhase(state, phase, fn)`
which emits, via `traceCollector.pushRaw`:
- `post_stream_boundary` once when SDK stream resolves (phase: `sdk_stream_resolved`)
- `post_processing_phase_start` at phase entry (with `phase` name)
- `post_processing_phase_pending` every 5s while the phase is still
  in-flight (with `phase`, `elapsed_ms`, `ping` counter)
- `post_processing_phase_end` at phase exit (with `phase`, `duration_ms`)
- `post_processing_phase_error` if the wrapped fn throws

After the fix, any > 5s stall between SDK stream end and SSE `done` is
attributable to a specific phase by reading the trace event timeline. Any
> 0.5s stall between phase boundaries is gap-free instrumentation
(boundary → next boundary), so the dead gap simply cannot recur silently.

Phases wrapped in send-handler.ts:
- `auto_continue` — `handleAutoContinue(...)`
- `empty_response_retry` — `handleEmptyResponseRetry(...)`
- `auto_fix_preview` — `handleAutoFixPreview(...)`
- `version_and_memory` — `handleVersionAndMemory(...)`
- `final_cleanup` — `handleFinalCleanup(...)`

---

## TC-AICPPL-001 — `post_stream_boundary` fires once per turn at SDK stream end

- **Steps:** Run any chat turn (env1, browser or curl). After completion,
  query trace events:
  ```sql
  SELECT events_json
  FROM ai_traces WHERE project_id = $PID ORDER BY created_at DESC LIMIT 1;
  ```
- **Expected:** exactly one event of `type: "post_stream_boundary"` with
  `data.phase = "sdk_stream_resolved"` and the
  `content_chars`/`thinking_chars`/`had_tool_calls` snapshot.

## TC-AICPPL-002 — Each phase emits a matched start/end pair

- **Steps:** Same trace dump as 001.
- **Expected:** for every phase name in
  `[auto_continue, empty_response_retry, auto_fix_preview, version_and_memory, final_cleanup]`:
  - exactly one `post_processing_phase_start` event with `data.phase = <name>`
  - exactly one `post_processing_phase_end` event with `data.phase = <name>`
  - the `_end.duration_ms` is finite and ≥ 0
  - the `_end.elapsed_ms` (from trace start) > the `_start.elapsed_ms`

## TC-AICPPL-003 — Long phases emit periodic `pending` heartbeats every ~5s

- **Steps:** Run a turn that takes > 10s of post-processing (e.g. a
  multi-file edit that triggers `auto_fix_preview` to call the AI a
  second time).
- **Expected:** at least one `post_processing_phase_pending` event with
  `data.phase = "auto_fix_preview"`, `data.elapsed_ms ≥ 5000`, and
  `data.ping ≥ 1`.

## TC-AICPPL-004 — Phase error path emits `post_processing_phase_error`

- **Steps:** Force an error inside `handleVersionAndMemory` (e.g. by
  pointing at a project whose disk path was removed mid-turn). NOTE: this
  is a destructive test — perform on a throwaway project only.
- **Expected:** trace contains `post_processing_phase_error` with
  `data.phase = "version_and_memory"` and `data.error` matching the
  thrown message. The `_end` event still fires (finally clause).

## TC-AICPPL-005 — End-to-end: zero "dead gap" > 6s without a `pending` event

- **Steps:** Run a 4-turn chat session designed to maximize post-stream
  work (large file edit on each turn, auto-fix expected to trigger).
  After all turns, dump trace events and walk the timeline of
  `post_processing_phase_*` events for each turn.
- **Expected:** for any two adjacent post-processing events with
  `elapsed_ms` delta > 6000 ms, there must be at least one
  `post_processing_phase_pending` between them. No silent > 6s gap.
  This is the explicit BUG-TRACE-002 regression assertion.
- **Severity:** medium (the original BUG-TRACE-002 repro).
