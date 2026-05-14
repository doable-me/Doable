# Root Cause — Live Streaming UI stuck on "Building..." (R12 / 2026-05-14)

## Observed symptom
- User submits prompt + PDF from dashboard.
- Editor opens at `/editor/[projectId]?prompt=...`.
- Chat panel shows: user message + assistant placeholder with orb saying "Building..." indefinitely.
- Preview iframe (right) ends up showing the fully built app — i.e. the AI work completed server-side.
- Backend `/projects/{id}/chat/status` reports `streaming: false`, `/ai-status` reports `active: false`, and `/chat/history` contains the assistant message with full `tool_calls` (here: ~142 KB).
- Yet the chat panel's `messages` state retains the optimistic placeholder with `content: ""`, no `toolActions`, no `liveStatus`.

## Root cause

The editor uses a `localStreamActiveRef: useRef(false)` flag to coordinate between two refresh paths:
1. The active SSE stream (sendMessage / bridge consume / stream-resume).
2. `loadFromApi()` which fetches `/chat/history` and replaces `messages`.

`loadFromApi` short-circuits when `localStreamActiveRef.current === true` to avoid clobbering optimistic in-flight UI:
```ts
// apps/web/src/app/editor/[projectId]/page.tsx:2700-2704
const loadFromApi = useCallback(async () => {
    if (localStreamActiveRef.current) {
      return;                                       // ← stops sync
    }
    ...
```

`localStreamActiveRef.current = true` is set in three places:
- sendMessage (line 3667)
- bridge consume (line 3178)
- stream-resume mount-effect (line 3024)

It is reset only inside the matching `onDone` / `onError` SSE handlers. If the SSE stream silently dies *without* delivering `[DONE]` or an error to the client (Cloudflare Tunnel idle timeout, TCP RST, lost-connection-during-tab-suspend, race during SPA navigation, etc.), then:
- `onDone` and `onError` never fire on this tab.
- `localStreamActiveRef.current` stays `true` forever.
- `loadFromApi()` returns early on every call.
- The optimistic placeholder is the only thing the user sees → "Building..." forever.

Backend completes the work and persists the assistant row (so `/chat/history` has the complete tool_calls and content), but the UI can never sync to it because the watchdog gate is stuck.

Compounding factor: the dashboard's `prompt-bridge.startBridge()` POSTs `/projects/{id}/chat` and stores the `reader` without reading. If the editor never `consumeBridge()`s (orphaned bridge — e.g. project mismatch or component never mounted for that id), the bridge fetch is held open with `transferSize: 0` for the lifetime of the tab. Server keeps writing into a buffer no client ever drains.

## Evidence collected pre-fix
- Probe `streaming-bug-probe` project: 25 SSE events captured by a direct backend probe → only `thinking`/`status`/`keep_alive` arrived before our probe-loop bailed (no `text_delta`, no `tool_call` in our probe window — but the eventual persistence had `2 × create_file` tool_calls).
- Live editor session reproduce: `/projects/02b1d12a-...chat` returned 94 SSE events including 15 `tool_call`s, 10 `tool_result`s, 29 `thinking`, ending with `[DONE]` + `STREAM_END` in ~92 seconds. UI updated live throughout — *so the happy path works*.
- The fault appears only when the stream is interrupted between *first event arrival* and `[DONE]`. The watchdog fix below makes the UI self-heal in that case.

## Fix

Two minimal changes:

### 1. `apps/web/src/app/editor/[projectId]/page.tsx` — add watchdog effect

Polls backend chat/status when `isStreaming === true`. If backend confirms the stream is no longer active (`streaming === false && active === false`), force-finalize: clear the ref, drop the streaming flag, abort the in-flight controller, and resync from `/chat/history`.

Sample probe interval: first check 18 s after `isStreaming` becomes true (enough for normal first chunks to arrive), then re-check every 12 s. Re-check is cheap (two small JSON GETs, the same shape the existing mount effect already does).

### 2. `apps/web/src/lib/prompt-bridge.ts` — auto-abort orphan bridges

Schedule a 30 s timeout in `startBridge()` that calls `abortController.abort()` if `consumed === false` by then. The editor-page consume path runs synchronously on mount so 30 s is generous — orphaned bridges (user closed editor immediately, navigation race, project-id mismatch) get cleaned up automatically.

Together these address the exact failure mode the user reported.
