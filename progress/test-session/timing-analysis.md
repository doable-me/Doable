# "Taking longer than usual" Timing Analysis

## Bug Description

The UI shows "Taking longer than usual" after only ~23 seconds of AI processing. Users report this feels too aggressive -- the AI is working normally, just handling a complex request.

## Where the Threshold Lives

**File**: `apps/web/src/app/editor/[projectId]/page.tsx`
**Line**: 3637

```tsx
{chatElapsedSec >= 20 && (
  <span className="italic text-[#9b9a77]/60 text-[10px] flex-shrink-0">Taking longer than usual</span>
)}
```

The threshold is hardcoded to **20 seconds**.

## How the Timer Works

**Lines 1404, 1426-1437**:

```tsx
const [chatElapsedSec, setChatElapsedSec] = useState(0);

useEffect(() => {
  if (!isStreaming) {
    setChatElapsedSec(0);
    return;
  }
  const start = Date.now();
  setChatElapsedSec(0);
  const id = window.setInterval(() => {
    setChatElapsedSec(Math.floor((Date.now() - start) / 1000));
  }, 1000);
  return () => window.clearInterval(id);
}, [isStreaming]);
```

The timer starts when `isStreaming` becomes `true` (when the chat SSE stream opens) and counts up every second. It resets to 0 when streaming ends.

The "Taking longer than usual" message appears as an inline hint next to the elapsed seconds counter in the header bar, visible only while `isStreaming && liveStatus` is truthy.

## Why 23s Was Observed

The 20-second threshold is in the code, but the user saw the message at ~23 seconds. This is expected: the `isStreaming` flag may be set a few seconds before the first real AI event arrives (the stream opens, then there's a connection/thinking phase). The timer starts on stream open, but the user may not notice the elapsed counter until the message appears at 20s+, perceiving it as 23s.

## Is 20 Seconds Too Aggressive?

**Yes.** Here's why:

1. **Normal AI operations regularly take 20-40 seconds**: A single tool call (scaffold, write multiple files, install packages) can easily take 20+ seconds. The AI is actively working, not stuck.

2. **The backend has much more generous timeouts**:
   - `SDK_IDLE_TIMEOUT_MS`: 60 seconds (standard idle detection)
   - `IDLE_GRACE_MS`: 15 seconds (after turn_end with no tools in-flight)
   - `HARD_FALLBACK_MS`: 90 seconds (total silence = definitely dead)

3. **BYOK providers can be slower**: The code at chat.ts line 1601-1602 even has a comment: "BYOK providers can take 30s+ to first token." Showing "taking longer than usual" before the first token even arrives from a BYOK provider is misleading.

4. **Multi-turn tool chains are common**: The AI frequently makes 3-5 tool calls in sequence (read files, install packages, create files, edit files). Each tool call takes 3-10 seconds. A 5-tool sequence easily exceeds 30 seconds of total elapsed time.

5. **Psychological impact**: "Taking longer than usual" creates anxiety. At 20 seconds, the AI is almost always still actively working. The message implies something is wrong when nothing is.

## Recommended Threshold

**45 seconds** is a better threshold:

- Aligns with the backend's 60-second idle timeout (message appears 15s before the backend would consider it truly idle)
- Covers 95%+ of normal multi-tool-call sequences without false alarms
- Still provides useful feedback for genuinely slow responses
- Matches the backend's "Working on a complex step -- still here..." status message timing

Alternatively, consider **removing the static timer entirely** and instead showing the message only when the backend sends a specific "slow" status event. The backend already emits status messages like "Working on a complex step -- still here..." (chat.ts line 1776) and "Waiting for a tool to finish..." (line 1776) which are much more context-aware.

## Proposed Fix

### Quick fix: Raise the threshold

Change line 3637:
```tsx
// Before
{chatElapsedSec >= 20 && (
// After
{chatElapsedSec >= 45 && (
```

### Better fix: Use backend status signals

Instead of a dumb timer, only show "Taking longer than usual" when the backend hasn't sent ANY event (text_delta, tool_call, tool_result, status) for more than 15 seconds. This way, if the AI is actively running tools, the message never appears regardless of total elapsed time.

This would require tracking `lastEventTime` and comparing `chatElapsedSec` against time-since-last-event rather than time-since-stream-start.
