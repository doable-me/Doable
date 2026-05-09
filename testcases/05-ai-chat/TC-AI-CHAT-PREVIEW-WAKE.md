# TC-AI-CHAT-PREVIEW-WAKE — Preview proxy lazy wake-up after eviction

Covers `services/api/src/routes/preview-proxy/proxy-handler.ts` lazy
respawn behavior introduced for **BUG-PREVIEW-EVICTION-001**.

When the dev-server registry has evicted a project's vite process (idle
sweep, memory pressure, max-N policy) but the project's files still exist
on disk, the preview proxy MUST auto-respawn the dev server on the next
request rather than returning a silent 503 / hanging the iframe.

Capping behavior:
- Max wait inside the proxy: 30 s (`WAKE_TIMEOUT_MS`).
- Beyond that the proxy returns a **structured 503** so the editor frontend
  can render an explicit retry state (no infinite spinner).

## TC-AI-CHAT-PREVIEW-WAKE-001 — Happy path: dev-server already running
- **Pre:** Project P scaffolded; `startDevServer(P)` already returned ready.
- **Steps:** `GET /preview/P/`
- **Expected:**
  - 200 OK with proxied vite HTML
  - Bridge scripts injected (`<meta name="doable-project-id">` present)
  - No spawn happens (verify `getRunningServers().find(s=>s.projectId===P)` was already present before the request)
- **Severity:** smoke

## TC-AI-CHAT-PREVIEW-WAKE-002 — Lazy wake after idle eviction
- **Pre:**
  - Project P scaffolded on disk (`isProjectScaffolded(P) === true`)
  - Dev-server for P was running, then evicted (e.g. `sweepIdleDevServers()` killed it; `isRunning(P) === false`)
- **Steps:** `GET /preview/P/`
- **Expected:**
  - Proxy detects no registry entry but disk files present
  - `ensureDependencies(P)` runs (no-op if `node_modules/` survives) and `startDevServer(P)` is invoked
  - `getDevServerInternalUrlWhenReady(P)` resolves within ≤30 s
  - Response is **200** with proxied vite HTML, NOT 503
  - `/admin/dev-servers` snapshot now lists P again
- **Severity:** smoke (this is the bug fix's core path)

## TC-AI-CHAT-PREVIEW-WAKE-003 — Wake exceeds 30 s budget → structured 503 (JSON)
- **Pre:** Same as 002, but artificially slow startup (e.g. simulate by
  setting `STARTUP_TIMEOUT_MS` higher than 30 s OR by injecting a sleep in
  the readiness probe via test harness).
- **Steps:** `GET /preview/P/` with `Accept: application/json`
- **Expected:**
  - 503 status
  - `Retry-After: 5` header
  - `Cache-Control: no-store`
  - JSON body: `{ "error": "dev_server_starting", "projectId": "<P>", "etaSeconds": 30 }`
  - Subsequent retry (5 s later, by then ready) returns 200
- **Severity:** high

## TC-AI-CHAT-PREVIEW-WAKE-004 — Wake exceeds 30 s budget → HTML retry page (browser)
- **Pre:** Same as 003.
- **Steps:** `GET /preview/P/` with `Accept: text/html` (default browser/iframe header).
- **Expected:**
  - 503 status
  - `Retry-After: 5`
  - `Content-Type: text/html`
  - Body is the `RETRY_HTML` self-refreshing page (so iframe doesn't show raw JSON to user).
- **Severity:** high

## TC-AI-CHAT-PREVIEW-WAKE-005 — Truly stale projectId (not on disk) → 404
- **Pre:** `projectId` is well-formed UUID but no directory at
  `getProjectPath(projectId)`; no entry in registry.
- **Steps:** `GET /preview/<random-uuid>/`
- **Expected:**
  - 404 "Not found"
  - **No** `startDevServer` invocation (verify via log/spy)
  - **No** 503 — the proxy must distinguish "evicted but disk-resident"
    (wake) from "deleted / never existed" (hard 404).
- **Severity:** high

## TC-AI-CHAT-PREVIEW-WAKE-006 — Invalid UUID → 404
- **Steps:** `GET /preview/not-a-uuid/`
- **Expected:** 404 "Not found"; no spawn attempted
- **Severity:** smoke

## TC-AI-CHAT-PREVIEW-WAKE-007 — Concurrent wake requests deduped
- **Pre:** Same as 002 (evicted, disk-resident).
- **Steps:** Fire 5 simultaneous `GET /preview/P/` requests.
- **Expected:**
  - Exactly **one** vite process is spawned (port allocator increments
    once; `startingServers` map dedupes via in-flight promise)
  - All 5 responses return 200 once vite is ready
  - No port collisions, no orphaned processes
- **Severity:** high

## TC-AI-CHAT-PREVIEW-WAKE-008 — Wake activity counter
- **Pre:** Same as 002.
- **Steps:** After successful wake, send a follow-up `GET /preview/P/main.tsx`.
- **Expected:**
  - `touchActivity(P)` updates `lastActivityAt` (registry entry's timestamp
    is within the last second).
  - Subsequent `sweepIdleDevServers()` does NOT re-evict P until
    `DEV_SERVER_IDLE_MS` has elapsed since this hit.
- **Severity:** medium

## Cross-reference
- Bug spec: `testcases/bugs/BUG-PREVIEW-EVICTION-001.md`
- Distinct from BUG-AI-PREVIEW-001 (initial scaffold gap, not eviction)
- Related: idle eviction sweeper at `services/api/src/projects/dev-server-core.ts`
- Related: in-flight start dedupe via `startingServers` map in
  `services/api/src/projects/dev-server-start.ts`
