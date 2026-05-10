# BUG-TRACE-002 — 121s "dead gap" between SDK stream completion and post-processing start

**Severity:** medium (intermittent; user sees ~120s spinner with nothing happening if it triggers)
**Found:** 2026-05-10 by trace-analyst on env1
**Where:** AI chat — between `sendAndWait` resolution and the post-processing phase (auto-fix-preview / version-create).

## Reproduction

Inconsistent. In a 4-turn session:
- Turn 3 had a 121s dead gap (SDK stream completed at +52s; post-processing started at +174s).
- Turn 4 had only a 0.5s gap.

So this is intermittent and depends on something we don't yet fully understand.

## Actual

For 121s, **zero trace events were recorded** in Turn 3 between:
- `sendAndWait` returning (SDK done streaming)
- The first `post_processing_start` / `post_processing_phase:*` event

User-side this looks like the chat panel finishing its response but the "Updating file" / version pill not appearing for ~2 minutes.

## Expected

Either:
- Post-processing kicks off immediately after SDK returns (target: < 1s gap)
- OR the gap is filled with explicit `post_processing_pending` events showing why it's waiting (e.g. `phase: "waiting_for_dev_server_quiesce"`, `waiting_for_yjs_flush`, etc.)

## Suggested investigation

1. `services/api/src/routes/chat/send-handler.ts` — find the code between the SDK `sendAndWait` resolution and the `handleAutoFixPreview` / `handleVersionAndMemory` calls. What's between them?
2. Check for any `await` that has no instrumentation — common candidates: `await yjsDoc.flushAndPersist()`, `await fs.writeFileSync(versions...)`, `await waitForDevServerQuiet()`, MCP-app post-processing.
3. Add `traceCollector.event("post_processing_wait_start" / "post_processing_wait_end")` around any await > 1s.

## Verification
Re-run the same 4-turn build and look for any > 5s gap. Root cause likely a single await that occasionally takes 100s+ (perhaps under contention).

## Cross-reference
The same session's BUG-B (tsx watch restart) was already fixed and verified — Turns 3-4 had no connection interruptions. So this dead gap is NOT a tsx-watch artifact; it's deeper in the chat post-processing path.
