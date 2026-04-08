# Bug 11 — `SDK silent for 2×60s — bailing` emits "AI didn't respond in time" error *after* the turn has already completed successfully

**Severity:** 🔴 Critical (user-visible: shows a scary red error banner on a successful turn)
**Area:** `services/api/src/routes/chat.ts` SDK-idle watchdog in the event iterator loop (lines ~1420–1480), interaction with `services/api/src/ai/providers/copilot.ts:304–306` (`assistant.turn_end` soft-signal)
**Discovered:** 2026-04-09 during the 10-turn to-do-list E2E test (`bugs/test-methodology-gaps.md:59–70`)
**Status:** Fixed (2026-04-09) — verified clean on a fresh 10-turn run
**Related:** Commit `4432cc2 fix: only reset sawTurnEnd on assistant message events, not tool events` partially fixed related `sawTurnEnd` logic; this bug is a different path in the same watchdog.

## Fix shipped & verified (2026-04-09)

**File changed:** `services/api/src/routes/chat.ts` (silent-bail branch in the event-iterator loop around line ~1480).

**What was done:**

In the `silentIterations >= MAX_SILENT_ITERATIONS` bail branch, we now check whether *anything* has already been produced for the current turn before emitting the red error SSE. If the stream has already accumulated any of:

- `assistantContent.length > 0` — some text was streamed to the client
- `hadToolCalls === true` — at least one tool call fired (and therefore files likely landed on disk)
- `anyTurnEndSeen === true` — the SDK signaled end-of-turn at least once (new persistent flag, unlike `sawTurnEnd` it is **not** reset when a subsequent `message_delta` arrives, so we remember the SDK committed the turn even mid-multi-turn)

…then the 2×60s silence is treated as a **clean-but-degraded completion** (log `[Chat] SDK idle after turn produced content — treating as clean completion for <pid>` as a `console.warn`), and the iterator exits without emitting the `type: "error"` SSE frame. The only path that still sends the user-facing error is "nothing ever came back at all" — a true hang with no content, no tools, no turn_end.

**NOTE — regression and rollback:** An earlier iteration of the patch also added a `POST_TURN_END_IDLE_MS = 20_000` shorter timeout for the mid-stream `anyTurnEndSeen && hadToolCalls` case. This was over-aggressive: it counted from the last *any* event (including ordinary message deltas), so a turn that had a legitimate 25s thinking gap mid-stream would trip the 20s early-exit → iterator closes → SSE disconnects client → frontend shows a different "Connection interrupted" banner. **That shortcut has been reverted**; only the clean-completion-bypass in the bail branch ships. Mid-stream timeouts still use the full `SDK_IDLE_TIMEOUT_MS = 60_000`.

**How it was verified:**

Re-ran the 10-turn todo script on a brand-new project (`30c46a29-b982-44e5-8d86-fe953f9c95f8`) with the fix in place. All 10 turns completed without the red error banner. Specifically, the four turns that had reproduced Bug 11 on the earlier runs (v1 Turns 6+10, v2 Turns 5, 6, 9, 10 — six bails across the two runs) all now show either:

- A clean `[Chat] turn_end grace expired (10s) — treating as complete` exit (simple turns), or
- A normal stream-done flush (multi-file turns that end cleanly without tripping the silence bail at all).

Zero `bailing` lines, zero `AI didn't respond in time` banners across the full 10-turn verification run.

## Symptom

On certain turns — specifically turns where the AI does multi-file edits and the session emits many `assistant.turn_end` soft signals after tool use — the chat stream shows a red error banner in the chat panel:

> **AI didn't respond in time — please try again.**

But:
1. The file edits **do land correctly on disk** (`services/api/projects/<projectId>/src/...`).
2. The preview iframe **does** reflect the changes after Vite HMR picks them up.
3. The server logs show the stream finished cleanly: `stream done — content: N chars`, `Sending [DONE]`, `Thumbnail captured`.
4. Subsequent turns in the same session work fine — no permanent damage, the next prompt streams normally.

So the error banner is **cosmetic-but-loud**: it's telling the user their fix didn't apply, when it did. That's the worst kind of false negative — the user will retry, causing a duplicate edit, or assume Doable is broken.

## Impact

- **User trust.** User types a prompt, sees code change in preview, *and also* sees a big red "try again" — feels buggy and unreliable.
- **Duplicate work.** Natural user response is to click "try again" / retype the prompt. The AI then re-does the same edits on the already-edited files, sometimes successfully, sometimes producing garbled double-applied patches.
- **Masks real SDK hangs.** If the Copilot SDK ever *actually* hangs, this same banner fires — but since users will have seen it on successful turns too, they'll ignore it. Boy-who-cried-wolf.
- **Reproducible on large-diff turns.** The methodology retrospective (`bugs/test-methodology-gaps.md`) already called for testing multi-file polish prompts; this bug is exactly what shows up there.

## Root cause trace

### The error message source

`services/api/src/routes/chat.ts:1443–1463`:

```ts
if (raceResult.done) {
  if (raceResult.value === TIMEOUT_SENTINEL) {
    // After turn_end, bail immediately on first timeout (10s grace)
    if (sawTurnEnd) {
      console.log(`[Chat] turn_end grace expired (${TURN_END_GRACE_MS / 1000}s) — treating as complete for ${projectId}`);
      iterDone = true;
      break;
    }
    silentIterations++;
    if (silentIterations >= MAX_SILENT_ITERATIONS) {
      // True hang — bail with a clean error.
      console.error(`[Chat] SDK silent for ${silentIterations}×${SDK_IDLE_TIMEOUT_MS / 1000}s — bailing for ${projectId}`);
      try {
        await stream.writeSSE({
          data: JSON.stringify({
            type: "error",
            data: "AI didn't respond in time \u2014 please try again.",
          }),
        });
      } catch { /* stream already closed */ }
      iterDone = true;
      break;
    }
```

This is the *only* place in the codebase that emits that error string. The condition to reach it is:
1. `sawTurnEnd === false` (no recent `assistant.turn_end` event in the iterator), AND
2. `silentIterations >= MAX_SILENT_ITERATIONS` (which is 2, with `SDK_IDLE_TIMEOUT_MS = 60_000` each).

So the server waits 60s for an SDK event, emits a reassuring `"thinking"` status, waits another 60s, and if still nothing, emits the red error and breaks the loop.

### The "soft signal" turn_end source

`services/api/src/ai/providers/copilot.ts:302–306`:

```ts
// Soft signal: assistant.turn_end means text is done, but session.idle
// remains authoritative for terminal completion. Log for visibility only.
if ((event as { type?: string }).type === "assistant.turn_end") {
  console.log(`[CopilotEngine] assistant.turn_end (soft signal) (${sessionId.slice(0, 8)}…)`);
}
```

The engine wrapper pushes every SDK event onto its queue and logs each `assistant.turn_end` as a "soft signal". These events **are** delivered to `chat.ts`'s iterator loop via the queue.

### The `sawTurnEnd` reset logic

`services/api/src/routes/chat.ts:1501–1517`:

```ts
// Only genuine assistant MESSAGE events should cancel the turn_end
// grace period (= new turn started). Tool lifecycle events (tool.*) can
// fire alongside or after turn_end and must NOT reset the flag.
const MESSAGE_CONTENT_EVENTS = new Set([
  "assistant.message_delta", "assistant.streaming_delta",
  "assistant.message", "assistant.reasoning_delta", "assistant.reasoning",
]);
if (MESSAGE_CONTENT_EVENTS.has(evtType)) {
  sawTurnEnd = false; // new assistant content after turn_end = multi-turn, reset
}

// Track turn_end to trigger short grace period
if (evtType === "assistant.turn_end") {
  sawTurnEnd = true;
  turnEndAt = Date.now();
  console.log(`[Chat][${projectId.slice(0, 8)}] assistant.turn_end — grace period started`);
}
```

So the intended flow is:
- First `assistant.turn_end` → `sawTurnEnd = true`, next timeout uses the 10s grace and breaks out cleanly.
- But if a `message_delta` comes *after* turn_end (multi-turn), `sawTurnEnd` is reset to `false`, restoring the 60s timeout. Reasonable.

### What actually happens

The captured log (`progress/.10turn_log_t6_end.txt`) and a fresh pull on Turn 10 show this sequence:

**Turn 6** (project `ac6264be-64de-4fad-af8b-6589387af136`, session `718a8b15…`):

```
[CopilotEngine] assistant.turn_end (soft signal) (718a8b15…)
[CopilotEngine] assistant.turn_end (soft signal) (718a8b15…)
[CopilotEngine] assistant.turn_end (soft signal) (718a8b15…)
[CopilotEngine] assistant.turn_end (soft signal) (718a8b15…)
[CopilotEngine] assistant.turn_end (soft signal) (718a8b15…)
[CopilotEngine] assistant.turn_end (soft signal) (718a8b15…)
[Chat] SDK idle 60s (iter 1/2), continuing for ac6264be-64de-4fad-af8b-6589387af136
[Chat] SDK silent for 2×60s — bailing for ac6264be-64de-4fad-af8b-6589387af136
[Chat][ac6264be] stream done — content: 377 chars, thinking: 1542 chars, toolCalls: true, tools: 6
[Chat] AI streaming complete for ac6264be-64de-4fad-af8b-6589387af136, starting post-processing...
[Chat] Sending [DONE] for ac6264be-64de-4fad-af8b-6589387af136
[Thumbnail] Captured screenshot for ac6264be-64de-4fad-af8b-6589387af136
```

**Turn 10** (same project, same session) — identical pattern, but **~20** consecutive `turn_end (soft signal)` lines before the bail, and one additional earlier `[Chat][ac6264be] assistant.turn_end — grace period started` + `[Chat][ac6264be] first delta for msg 6d75b34b` showing the grace period was briefly entered, then cancelled by a new delta, then re-entered by repeated turn_ends that never triggered the grace path again:

```
[Chat][ac6264be] assistant.turn_end — grace period started
[Chat][ac6264be] first delta for msg 6d75b34b
[CopilotEngine] assistant.turn_end (soft signal) (718a8b15…)  × ~20
[Chat] SDK idle 60s (iter 1/2), continuing for ac6264be-…
[Chat] SDK silent for 2×60s — bailing for ac6264be-…
[Chat][ac6264be] stream done — content: 406 chars, thinking: 188 chars, toolCalls: true, tools: 8
[Chat] Sending [DONE] for ac6264be-…
[Thumbnail] Captured screenshot for ac6264be-…
```

### What's wrong

Observations from the logs:

1. **`assistant.turn_end — grace period started` is logged from chat.ts:1516 only once**, even though copilot.ts:305 logs the event ~20 times. That means only one of the ~20 soft-signal `assistant.turn_end` events actually reached the chat.ts iterator and took the `sawTurnEnd = true` branch. The others are being dropped somewhere between `eventQueue.push(event)` in the engine and `iterator.next()` in chat.ts.
2. **After the one grace period was entered, a `first delta for msg 6d75b34b` came in and reset `sawTurnEnd = false`**. Then the SDK fell silent on deltas but *kept* firing turn_end events that the chat.ts consumer never saw (or saw but something else re-reset the flag before the timeout race).
3. **Because `sawTurnEnd === false` when the silence race fired**, the code took the 60s → 120s "true hang" bail path instead of the 10s grace path.
4. **The bail path then runs the normal post-loop code**: the SDK's accumulated state gets flushed (`stream done — content: N chars, tools: N`), `[DONE]` is sent, thumbnail is captured. So the user gets the fix *and* the error banner, because both are delivered over the same SSE stream.

In other words: **the bail path is the success path when the SDK stalls right at the end of a turn after tool use**. The "error" is really "the SDK went quiet even though everything worked" — and we're labeling that as a user-facing failure.

### Likely underlying cause

Copilot SDK v0.1.32 (per `project_copilot_sdk_issues.md`) fires `assistant.turn_end` as a non-terminal "soft" signal multiple times when the turn contains tool use — but it does NOT reliably emit `session.idle` or `done` afterwards if the agent internally decides the turn is over post-tool-use. The chat.ts watchdog was designed to use `session.idle` as authoritative; when that never arrives, the 120s hard-bail is the only exit.

## Reproduction

**Reliable trigger:** Any prompt that requires 5+ file edits in a single turn. Two observed in this run, both on the same session:

### Case A — Turn 6 of the 10-turn todo test

1. Create a fresh project via dashboard prompt: `"Build a to-do list app. Items should have a title, a checkbox, and a delete button. Store them in localStorage so they persist across refreshes."`
2. Run turns 2–5 from the documented script (`bugs/test-methodology-gaps.md:59–70`) so that `useTheme.ts` with `useLocalStorage("dark-mode", false)` exists.
3. Send the literal prompt: `"The dark mode isn't persisting. Fix it."` This is a *false bug report* — the hook already persists. The AI will identify an ancillary FOUC issue (`.dark` applied in `useEffect` → post-paint flash), plan a fix (inline script in `index.html` + switch to `useLayoutEffect`), and start writing files.
4. Observe: the AI writes the fixes to disk, but the chat UI displays the red error banner `"AI didn't respond in time — please try again."` at ~120s from send.
5. Verify on disk:
   - `services/api/projects/<projectId>/index.html` contains an inline `<script>try { if (JSON.parse(localStorage.getItem("dark-mode"))) { document.documentElement.classList.add("dark"); } } catch (e) {}</script>` block in `<head>`.
   - `services/api/projects/<projectId>/src/hooks/useTheme.ts` uses `useLayoutEffect` instead of `useEffect`.
6. Verify in `tmux capture-pane -t doable:0 -p -S -200 | grep -E "turn_end|bailing|stream done|DONE"` — the log fingerprint above appears.

### Case B — Turn 10 of the 10-turn todo test

Same project, same session. After turns 1–9, send: `"Make the whole thing feel more polished — better typography, spacing, colors."` Observe the same error banner at ~120s, while `App.tsx` grows from ~3.5KB to ~10.8KB (indicating the polish landed).

**Project/session used in this run:**
- project `ac6264be-64de-4fad-af8b-6589387af136`
- user `uniquegodwin@gmail.com` (`sub: 0ff7b403-24dd-4609-8d06-d594a6551658`)
- Copilot session `718a8b15…`
- Wall-clock: Turn 6 at 2026-04-09 00:28, Turn 10 at 2026-04-09 00:37 local

**Not triggered on:** Turns 1, 2, 3, 4, 5, 7, 8, 9 — all smaller-diff turns (1–3 files each). So the trigger correlates with "many file edits in one turn" more than "long wall clock". Turn 6 was 1542 chars of thinking + 377 chars content + 6 tools. Turn 10 was 188 chars thinking + 406 chars content + 8 tools. Both bailed.

## Fix options

### Option 1 — Treat "SDK silent after a turn has already produced content" as a clean completion (recommended)

If we reach the `SDK silent for 2×60s` path *and* the stream has already accumulated content + tool calls + the session has seen at least one `assistant.turn_end`, the right thing is to `console.warn` about the SDK stall but emit a normal completion, not an error:

```ts
if (silentIterations >= MAX_SILENT_ITERATIONS) {
  if (assistantContent.length > 0 || toolCallsSeen > 0) {
    // Content + tools were already produced. SDK just never fired session.idle.
    // Treat this as a clean but degraded completion, not a user-facing failure.
    console.warn(`[Chat] SDK silent after turn content was produced — flushing without error (${projectId})`);
    iterDone = true;
    break;
  }
  // True hang — no content at all. Keep the error.
  console.error(`[Chat] SDK silent for ${silentIterations}×${SDK_IDLE_TIMEOUT_MS / 1000}s — bailing for ${projectId}`);
  await stream.writeSSE({ data: JSON.stringify({ type: "error", data: "AI didn't respond in time \u2014 please try again." }) });
  iterDone = true;
  break;
}
```

This preserves the "true hang" error for sessions where nothing ever came back, but removes the false negative on successful turns.

### Option 2 — Let repeated `assistant.turn_end` events count toward the grace period

If we see `assistant.turn_end` more than once without any new `assistant.message_delta` between them, trust the signal: set `sawTurnEnd = true` and switch to the 10s grace timeout. This requires understanding why chat.ts only logs `grace period started` once despite copilot.ts logging ~20 events — there's a mismatch in how events are consumed.

### Option 3 — Add a post-turn-end delta count

Track whether any `assistant.message_delta` arrived *since the last turn_end*. If not, the turn is effectively over regardless of SDK silence. Exit cleanly on the next timeout.

### Option 4 (upstream) — File against Copilot SDK v0.1.32

The root cause is the SDK's behavior of firing `assistant.turn_end` without ever reaching `session.idle` on tool-heavy turns. Report upstream and pin SDK version. Meanwhile, work around with one of options 1–3.

**Recommended:** ship Option 1 as a fast-turnaround safety net, then investigate why chat.ts sees fewer turn_end events than the engine logs (Option 2 root-cause).

## Evidence files

- `progress/.10turn_log_t6_end.txt` — 37 lines of API log around Turn 6 timeout (`SDK silent for 2×60s — bailing` → `stream done` → `Sending [DONE]` → `Thumbnail captured`).
- `services/api/projects/ac6264be-64de-4fad-af8b-6589387af136/index.html` — contains the inline dark-mode-early-apply script that "didn't" land.
- `services/api/projects/ac6264be-64de-4fad-af8b-6589387af136/src/hooks/useTheme.ts` — uses `useLayoutEffect`, committed by the "failed" turn.
- `services/api/projects/ac6264be-64de-4fad-af8b-6589387af136/src/App.tsx` — 10.8KB after the "failed" Turn 10 polish (was ~3.5KB before).

## Acceptance criteria for a fix

1. Re-run Turn 6 of the todo script on a fresh project. Red error banner does NOT appear.
2. Re-run Turn 10 of the todo script on a fresh project. Red error banner does NOT appear.
3. Kill the Copilot subprocess mid-stream (`ps aux | grep copilot; kill -TERM <pid>`) before any content is produced. Red error banner DOES appear ("true hang" path still works).
4. Files still land on disk in cases 1 and 2, identical to the current buggy behavior.
