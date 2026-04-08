# Bug 10 — React Fast Refresh is disabled in the preview iframe

**Severity:** 🟠 High (blocks a good fix for [bug-01](bug-01-preview-frozen-during-streaming.md))
**Area:** `.doable/vite-plugin-source-annotations.js` (suspected) / Vite plugin ordering
**Discovered:** 2026-04-08 ui-driver browser console inspection
**Status:** Open, culprit suspected but not confirmed

## Symptom

When the preview iframe loads a project's Vite dev server at `http://localhost:4000/preview/<projectId>/`, the browser console shows:

```
[DEBUG]   @vite/client:788  [vite] connecting...
[WARNING] @react-refresh:341  Something has shimmed the React DevTools global hook
                              (__REACT_DEVTOOLS_GLOBAL_HOOK__). Fast Refresh is not
                              compatible with this shim and will be disabled.
[DEBUG]   @vite/client:911  [vite] connected.
```

React Fast Refresh is **disabled** in every preview iframe. Vite's HMR still works at the module-transport level (files still stream over WS, the dev server still processes edits), but when a React component module changes, Fast Refresh can't hot-swap it — the whole app has to reload.

## Root cause (suspected)

The `.doable/vite-plugin-source-annotations.js` plugin, which ships in every scaffolded project, injects a large IIFE into the preview page:

```js
(function() {
  if (window.__visualEditBridge) return;
  window.__visualEditBridge = true;
  // ... hover/select overlays, postMessage handlers for the visual edit toolbar, etc.
})()
```

This plugin runs the element-picker bridge used by the visual-edit feature. It almost certainly touches `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` (directly or through an observability/instrumentation shim) to wrap React render calls for the element-picker's hover tracking.

If it does so *before* `react-refresh` initializes, `react-refresh` detects a pre-existing shim and disables itself. That matches the observed warning exactly.

**Not confirmed.** I read ui-driver's observation but did not open `.doable/vite-plugin-source-annotations.js` to grep for `__REACT_DEVTOOLS_GLOBAL_HOOK__`. That's the obvious first step to confirm the root cause.

## Why this matters for Bug 1

[Bug 1](bug-01-preview-frozen-during-streaming.md) (preview not live-updating during streaming) can be fixed by installing a 3-6s refresh poll that bumps `iframe.src = previewUrl + '?t=' + Date.now()`. But with Fast Refresh disabled, every refresh is a **full hard reload** of the entire preview app:

- Scroll position lost
- Form state lost (inputs cleared)
- Any React component local state lost
- Any `useRef` mutables lost
- Fresh JS parse + fresh HMR socket handshake

Doing this every 3-6 seconds during a streaming build would be visually jarring — the preview flashing/resetting while the user tries to watch the app being built. It might be **worse UX** than the current "frozen until done" behavior.

If Fast Refresh is restored, the same `iframe.src` change becomes a near-instantaneous component swap: scroll position preserved, form state preserved, no flash, just the updated component re-rendering in place. That's the UX the architecture was clearly designed around (hence the disclaimer comment at `page.tsx:2644`: "Final preview refresh — always hard reload the iframe to guarantee the user sees the latest build output (HMR can silently fail)").

## Fix path

### Step 1 — confirm the culprit

```bash
# is the file even in the scaffold root or in services/api/projects/<id>/.doable/ ?
find /c/Users/gj/Documents/workspace/doable -name "vite-plugin-source-annotations*" -type f 2>/dev/null

# does it touch the devtools hook?
grep -n "__REACT_DEVTOOLS_GLOBAL_HOOK__" .doable/vite-plugin-source-annotations.js
```

If the file touches the hook before react-refresh, root cause is confirmed.

### Step 2 — fix the plugin load order

Options, in order of preference:

1. **Don't touch the devtools hook at all.** The element-picker can use normal DOM events (`mouseover`/`mouseout`/`click` on `document.body`) plus `data-source-file` attributes (which is what source annotations are presumably for anyway). No React internals required.

2. **Touch the hook, but only after react-refresh.** Vite plugin ordering: ensure `@vitejs/plugin-react` (which installs react-refresh) runs before any plugin that injects the visual-edit bridge. This means the bridge IIFE runs *after* react-refresh has registered itself, so the "pre-existing shim" check doesn't trip.

3. **Wrap, don't shim.** If the bridge must intercept render calls, wrap the existing hook instead of replacing it:

```js
const existing = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
if (existing) {
  const origOnCommitFiberRoot = existing.onCommitFiberRoot;
  existing.onCommitFiberRoot = function (id, root, ...rest) {
    // ... my extra work ...
    return origOnCommitFiberRoot?.call(existing, id, root, ...rest);
  };
} else {
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { /* ... */ };
}
```

But this still trips the react-refresh check because react-refresh looks for a hook with its own marker. The only reliable fix is option 1 or 2.

### Step 3 — verify Fast Refresh is back

After the fix, open a preview iframe, check the console:
- No Fast Refresh warning
- Edit `src/App.tsx` on disk (add a word to the H1), save
- Vite should hot-swap the component in-place without a full reload — H1 text changes, scroll position and form state preserved

### Step 4 — then fix [bug-01](bug-01-preview-frozen-during-streaming.md)

Once Fast Refresh is live, the Bug 1 fix becomes cheap and safe: every 3-6s during streaming, bump `iframe.src`, and HMR does the smooth thing.

## Impact of not fixing

- Bug 1 is either left broken (frozen previews) or "fixed" with jarring full-reload flashes.
- Visual-edit feature may also be affected indirectly — if the bridge is running but React internals can't cooperate with it, the element-picker may miss updates or double-fire.
- Developer experience inside a Doable preview is degraded vs. a vanilla Vite project.

## Reproduction

1. Open any Doable project editor.
2. Open browser devtools on the preview iframe (right-click iframe → Inspect → Console, or navigate directly to `http://localhost:4000/preview/<projectId>/` in a new tab).
3. Refresh.
4. Observe the Fast Refresh disabled warning in console.
5. Attempt to edit `src/App.tsx` on disk (change a string) and watch the preview: it should cold-reload, not hot-swap.

Deterministic across all projects.
