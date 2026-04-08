# Bug 1 — Preview iframe, file tree, and Monaco editor are frozen during streaming

**Severity:** 🔴 Critical (biggest real-user UX impact)
**Area:** `apps/web/src/app/editor/[projectId]/page.tsx`
**Discovered:** 2026-04-08 live test
**Status:** Open

## Symptom

While the AI is streaming a build (tool events arriving, files being written to disk), the editor UI shows rich chat-panel feedback (tool cards, overlay, live status) but:

1. **The preview iframe does not refresh.** It stays frozen on its previous state until ~1.5s after the stream ends.
2. **The file tree sidebar does not update.** New/modified files do not appear or highlight during the build.
3. **If the user has a file open in Monaco, its contents do not update** while the AI writes to that file.

All three views unfreeze together at `onDone` (stream end).

## Evidence

Measured during the 2026-04-08 test (project `db9a5d1c-7164-47df-8402-17910ffabe75`):

- ui-driver installed a `MutationObserver` on `iframe[src]` for the full 48 seconds of streaming.
- **Zero intermediate `src` changes recorded.**
- Exactly one refresh at t=+48.804s, ~1s after the "Stop Doable" button disappeared.
- The refresh URL was `/preview/.../?t=1775670939323` — cache-bust timestamp matches `onDone + ~1500ms` exactly.

## Root cause

### Path A — the dead 6-second polling loop

`apps/web/src/app/editor/[projectId]/page.tsx:2063-2112` installs the intended live-refresh poll *inside a mount-time `useEffect([resolvedProjectId])`*:

```tsx
useEffect(() => {
  // ...
  (async () => {
    const statusRes = await apiFetch('/projects/:id/ai-status');
    if (statusRes.active) {                   // ← mount-time gate
      setIsStreaming(true);
      let lastRefresh = 0;
      const poll = setInterval(async () => {
        await loadFromApi();
        loadFileTree();
        if (Date.now() - lastRefresh > 6000 && iframeRef.current && previewUrl) {
          iframeRef.current.src = previewUrl + '?t=' + Date.now();  // line 2080
          lastRefresh = Date.now();
        }
        // ...
      }, 3000);
    }
  })();
}, [resolvedProjectId]);
```

This only installs the `setInterval` if `/ai-status` reports `active: true` **at the exact moment the editor mounts**. That only happens on the "user hit F5 during a build" resume path — not the normal "open editor, type prompt, send" path.

For a fresh editor load + new chat, the gate fails and the poll is never installed.

### Path B — the local stream handler never refreshes

`sendMessage` in `apps/web/src/app/editor/[projectId]/page.tsx` calls `streamChat` (in `apps/web/src/lib/api.ts`), whose SSE parsing at lines 515-547 handles `tool_call` / `tool_result` / `tool.completed` events:

```ts
if ((parsed.type === "tool_result" || parsed.type === "tool.completed") && onToolCompleted) {
  // ...
  onToolCompleted(toolName, toolArgs);   // updates React state for chat tool cards
}
```

The callback updates the chat message's `toolActions` array so the tool cards render. It does **not** call `loadFileTree()`, does **not** touch `iframeRef`, does **not** call `loadFileContent(selectedFile)`.

### Path C — contrast: the remote handler DOES refresh

`page.tsx:3404-3474` `handleRemoteToolEvent` (used when watching another user's collaborative stream via WS) has a debounced 3s preview refresh at lines 3464-3471:

```tsx
// Debounced preview refresh — only trigger if no refresh in last 3s
if (iframeRef.current && previewUrl) {
  clearTimeout((handleRemoteToolEvent as any)._previewTimer);
  (handleRemoteToolEvent as any)._previewTimer = setTimeout(() => {
    if (iframeRef.current && previewUrl) {
      iframeRef.current.src = previewUrl + "?t=" + Date.now();
    }
  }, 3000);
}
```

The same logic wired into the local path would fix the bug. It just isn't wired.

### The single refresh that DOES fire

`page.tsx:2643-2653` in the `onDone` callback:

```tsx
// Final preview refresh — always hard reload the iframe to guarantee
// the user sees the latest build output (HMR can silently fail)
if (previewRefreshTimer.current) clearTimeout(previewRefreshTimer.current);
previewRefreshTimer.current = setTimeout(() => {
  previewRefreshTimer.current = null;
  if (iframeRef.current && previewUrl) {
    iframeRef.current.src = previewUrl + (previewUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
  }
}, 1500);
```

Similarly `loadFileTree()` fires at `page.tsx:2638` and `loadFileContent(selectedFile)` at lines 2640-2642, both only at stream end.

## UX impact

- On first-generation runs (`isFirstGeneration || hasActiveToolCalls`), the "Building your app…" overlay at `page.tsx:5048-5069` covers the preview iframe, partially masking the frozen state.
- On subsequent prompts in an existing project, the overlay doesn't show and the user watches a static preview for 30-60s while the chat panel fills with tool cards. This reads as "the AI is busy but nothing is actually being built."
- The file tree not highlighting modified files means users can't visually track what's being touched in real time.
- If Monaco has a file open that the AI is editing, the editor's contents stay stale — watching "your code" not change while the AI claims to be editing it is a confusing experience.

## Fix options

### Option A — minimal patch (recommended if shipping fast)

Wire the debounced 3s preview refresh from `handleRemoteToolEvent` into the local SSE tool_result callback. Inside `sendMessage`'s `onToolCompleted` (or wherever the local stream handler in `api.ts:streamChat` dispatches tool events), add the same clearTimeout/setTimeout pattern. Reuse the existing `previewRefreshTimer` ref at `page.tsx:2228-2232`.

Also call `loadFileTree()` on every tool_result so the sidebar updates.

### Option B — unified `useEffect([isStreaming])`

Move the 6s polling loop out of the mount-time effect and into a dedicated effect keyed on `isStreaming`:

```tsx
useEffect(() => {
  if (!isStreaming) return;
  let lastRefresh = 0;
  const poll = setInterval(async () => {
    loadFileTree();
    if (selectedFile) loadFileContent(selectedFile);
    if (Date.now() - lastRefresh > 6000 && iframeRef.current && previewUrl) {
      iframeRef.current.src = previewUrl + '?t=' + Date.now();
      lastRefresh = Date.now();
    }
  }, 3000);
  return () => clearInterval(poll);
}, [isStreaming, previewUrl, selectedFile, loadFileTree, loadFileContent]);
```

This is cleaner architecturally (one source of truth for "am I streaming → refresh stuff") and handles both the fresh-submit and resume cases uniformly.

### ⚠️ Dependency on Bug 10

**Fix Bug 10 first** (see [bug-10-react-fast-refresh-disabled.md](bug-10-react-fast-refresh-disabled.md)). React Fast Refresh is currently disabled in the preview iframe, which means every `iframe.src = …?t=…` is a full hard reload that throws away scroll position and form state. With Fast Refresh restored, the live-refresh becomes a cheap component swap; without it, refreshing every 3-6s during streaming will be visually jarring (flashes, resets) and might be worse UX than the current frozen-until-done behavior.

## Test plan (after fix)

1. Fresh editor load → type a prompt → send.
2. Verify `iframe.src` changes at least every 6s during streaming (MutationObserver).
3. Verify file tree updates as each new file appears.
4. Verify Monaco contents update if a file is open and being edited.
5. Verify there's no flash/reload jitter on each refresh (depends on Bug 10 fix).
6. Repeat on a 5-minute multi-tool-call build to check for memory leaks / observer churn.
7. Verify the resume flow still works: submit, F5 mid-stream, confirm the poll still installs and recovers.
