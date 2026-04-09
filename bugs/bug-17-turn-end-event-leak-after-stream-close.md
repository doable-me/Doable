# Bug 17 — `assistant.turn_end (soft signal)` logs flood the API server for 30+ seconds after the stream closes

**Severity:** 🟠 High (log pollution, CPU waste, memory growth — not user-facing but operationally painful)
**Area:** `services/api/src/routes/chat.ts:1425–1498` (iterator loop) + `services/api/src/ai/providers/copilot.ts:280–409` (async generator)
**Discovered:** 2026-04-09 round-2 E2E test; log tail shows dozens of orphan `turn_end` lines per completed turn
**Status:** Open — fix below

## Symptom

After each multi-tool AI turn completes and `[Chat] Sending [DONE] for <projectId>` is logged, the server continues to emit an unbounded stream of

```
[CopilotEngine] assistant.turn_end (soft signal) (<sessionId>…)
```

lines for 30–90+ seconds, until `[CopilotManager] Stopping engine (... — idle)` eventually GCs the pooled engine. On a typical multi-file turn (8+ tools) this is 30+ duplicate log lines per turn, with no semantic value and non-trivial CPU for stringification.

## Root cause

Sequence:

1. `services/api/src/routes/chat.ts:1425` calls `messageStream![Symbol.asyncIterator]()` and iterates via `await iterator.next()` inside a `while (!iterDone)` loop.

2. The iterator comes from `CopilotEngine.sendMessage()` in `copilot.ts:~275`, an async generator that:
   - Subscribes to `session.on((event) => { eventQueue.push(event); ... })` at copilot.ts:291
   - Yields events as the consumer pulls them
   - On exit, runs `finally { unsubscribe(); ... }` at copilot.ts:403

3. When chat.ts takes any of its early-exit paths (`iterDone = true; break;`), it **never calls `iterator.return()`**. The generator is suspended mid-`await`, not closed.

4. Because the generator is suspended (not returned/closed), its `finally` block does not run. `unsubscribe()` is NOT called. The `session.on` callback is still subscribed.

5. Copilot SDK v0.1.32 keeps firing background `assistant.turn_end` events for post-tool-use book-keeping long after the actual turn is done. Every one of these events hits the still-live `session.on` callback, which:
   - Pushes onto `eventQueue` (unused memory growth)
   - Logs `[CopilotEngine] assistant.turn_end (soft signal)` (copilot.ts:305)

6. Only when `CopilotManager`'s idle sweep eventually closes the session does the subscription die. That's typically 30–90s later.

## Impact

- **Log pollution:** Multi-file turns produce 30+ useless lines each. In a 10-turn session, that's 300+ lines of noise crowding out real signal in tmux scrollback.
- **CPU waste:** Every event still hits the JS callback, allocates a string, runs `console.log`.
- **Memory growth:** `eventQueue` keeps growing on the abandoned generator until GC.
- **Debugging friction:** Made it much harder to spot real errors while observing the round-2 E2E run — the turn_end flood buried the interesting signal.

## Fix

Two complementary changes:

### Fix A — chat.ts: always call `iterator.return()` in a `finally` block

Wrap the `while (!iterDone)` loop in a try/finally that properly closes the iterator on ANY exit path:

```ts
// services/api/src/routes/chat.ts around line 1425–1498
const iterator = messageStream![Symbol.asyncIterator]();
try {
  while (!iterDone) {
    // ... existing loop body
  }
} finally {
  // Always close the iterator — triggers the generator's finally block,
  // which unsubscribes the session.on listener and stops the log flood.
  try {
    await iterator.return?.(undefined);
  } catch {
    // Ignore — generator may already be closed (session.idle path)
  }
}
```

This single change eliminates ~95% of the leak in practice.

### Fix B — copilot.ts: downgrade the `turn_end` log to debug-only

The log line at copilot.ts:305 is described as "for visibility only" and is the direct culprit. Even after Fix A, the SDK still fires 1–5 `turn_end` events during the normal window before the stream is closed. Either:

- Remove the log entirely (it's not useful at INFO level — it fires many times per turn and has no diagnostic value for anyone not actively debugging), or
- Gate it behind `if (process.env.DEBUG_COPILOT_EVENTS) { console.log(...) }` so it can be enabled per-session when needed.

Recommended: remove entirely. The chat.ts side already logs `[Chat][<pid>] assistant.turn_end — grace period started` at a more useful layer.

## Acceptance

1. Run a multi-tool turn (5+ files edited). Watch `tmux capture-pane -t doable:0 -p -S -200 | grep "turn_end"`. After `[Chat] Sending [DONE]`, NO MORE `turn_end` lines appear for that session.
2. The `[CopilotManager] Stopping engine` line still fires eventually (on normal idle timeout), unchanged.
3. `assistantContent` and `tool_calls` are still captured correctly — don't regress bug-11's clean-completion bypass.
4. Abort mid-stream (Stop button) still unsubscribes cleanly — no orphan turn_end spam after abort either.
