# Bug 20 — Preview iframe serves 502 for Vite `.vite/deps/*` chunks during dev-server restart triggered by `install_package`

**Severity:** 🟡 Medium (transient UX glitch — preview flashes errors during package installs)
**Area:** `services/api/src/dev-server/*` — per-project Vite dev server restart sequence
**Discovered:** 2026-04-09 round-2 E2E
**Status:** Open

## Symptom

When the AI calls the `install_package` tool (e.g. `react-router-dom`), the API server restarts the per-project Vite dev server to pick up the new dep. During the ~200ms restart window, any in-flight preview requests from the iframe get a 502:

```
[DevServer] Stopping server for project <pid>
[DevServer] Cleared Vite cache at .../node_modules/.vite
[DevServer] Starting Vite dev server for project <pid> on port 3101
<-- GET /preview/<pid>/node_modules/.vite/deps/chunk-7MWNDFAY.js
<-- GET /preview/<pid>/node_modules/.vite/deps/chunk-QA7QF6QY.js
--> GET /preview/<pid>/node_modules/.vite/deps/chunk-7MWNDFAY.js 502 16ms
--> GET /preview/<pid>/node_modules/.vite/deps/chunk-QA7QF6QY.js 502 16ms
[DevServer] Project <pid> ready at http://localhost:3101
[install_package] Restarted Vite dev server for <pid>
```

The iframe then shows a Vite client error overlay until the user reloads.

## Impact

- Every `install_package` during AI streaming flashes a red error overlay in the preview.
- Worse on multi-install turns (react-router-dom + @supabase/supabase-js + lucide-react in one turn): 3 error flashes per turn.
- Users perceive the preview as flaky even when the final state is correct.

## Fix options

1. **Queue preview requests during restart.** In the preview proxy (the `/preview/:projectId/*` handler in the dev-server proxy), detect the "restarting" state and hold requests until ready (or up to a small timeout, then serve a loading placeholder). Simple implementation: a `Map<projectId, Promise<void>>` that resolves when the new dev server is ready.
2. **Graceful handoff.** Keep the old Vite server running until the new one is ready; swap atomically; only then kill the old.
3. **Force full reload after restart.** Send a WS message to the iframe asking it to reload, rather than relying on Vite HMR to recover.

Option 1 is the smallest change and the cleanest UX.

## Acceptance

1. Run a turn that triggers `install_package`. No 502 lines in `tmux capture-pane -t doable:0 -p` during the restart window.
2. Preview iframe shows a brief loading state (or no visible flash) during restart, not a Vite error overlay.
3. Once the new server is ready, HMR picks up normally.
