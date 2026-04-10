# Deploy/Publish Pipeline — Code Analysis

**Date:** 2026-04-09
**Analyst:** Claude (Sonnet 4.6)
**Files reviewed:**
- `services/api/src/routes/deploy.ts`
- `services/api/src/deploy/pipeline.ts`
- `services/api/src/deploy/builder.ts`
- `services/api/src/deploy/adapters/doable-cloud.ts`
- `apps/web/src/modules/editor/toolbar/publish-button.tsx`
- `apps/web/src/modules/editor/toolbar/publish-dialog.tsx`

---

## CRITICAL

### C1 — No concurrency guard: parallel deploys will corrupt the file system
**File:** `services/api/src/deploy/pipeline.ts` lines 66–228  
**File:** `services/api/src/deploy/adapters/doable-cloud.ts` lines 75–105

Two simultaneous deploys for the same project+environment will race to `rm -rf` then `mkdir` the same `targetDir`. The sequence is:
1. Deploy A calls `rm(targetDir, recursive)`
2. Deploy B calls `rm(targetDir, recursive)` — now operating on the directory Deploy A just recreated
3. Deploy A calls `cp(buildOutputDir, targetDir)` — may write into a partially-deleted tree

There is no lock, mutex, or "is-deploying" check at any layer (route, pipeline, or adapter). The DB record for "building" is written after the fact and is not consulted before a new deploy starts.

**Impact:** corrupted live site, half-deployed artifacts, directory ENOENT errors mid-copy.

---

### C2 — Rollback re-runs the build, not the saved artifacts
**File:** `services/api/src/routes/deploy.ts` lines 403–425  
**File:** `services/api/src/deploy/adapters/doable-cloud.ts` lines 131–153

`/rollback/:deploymentId` calls `runPipeline(...)` — a full fresh build from current source code. This means "rollback" actually deploys whatever is in the project directory *right now*, not the files from the target deployment. The saved `deployment_artifacts` rows and `targetDir` metadata are never used. Rollback is therefore a lie: it will deploy the latest code under the old deployment ID.

**Impact:** data loss — users believe they reverted to a prior version but actually deployed the current (potentially broken) code.

---

## HIGH

### H1 — Subdomain generation race: two first-publishes can collide
**File:** `services/api/src/deploy/pipeline.ts` lines 92–108

The check-then-assign is not atomic:
```
const existing = await projects.findBySubdomain(candidate); // read
if (!existing) { subdomain = candidate; break; }            // gap
await projects.update(projectId, { subdomain });            // write
```
Two concurrent first-publishes for different projects can both find `candidate` unoccupied and assign the same subdomain. The DB has no unique constraint enforced at this level (only application-level retry). This results in two projects sharing one subdomain — the second deploy silently overwrites the first.

**Impact:** site data loss; live sites pointing to wrong content.

---

### H2 — Build timeout does not prevent `resolve()` being called twice
**File:** `services/api/src/deploy/builder.ts` lines 89–145

When the timeout fires (line 89), it calls `proc.kill("SIGTERM")` and then `resolve(...)`. The process `close` event will still fire after SIGTERM, potentially also calling `resolve(...)` (line 114). A Node.js `Promise` silently ignores subsequent resolve calls, but `onLog` callbacks will still be invoked after the timeout resolve — meaning SSE events will fire after the stream has logically ended on the server side.

Additionally, the timeout `resolve` at line 93–99 returns `{ success: false, outputDir, ... }` where `outputDir` is set to the `dist` path even though the build never completed. If the pipeline then checks `buildResult.success` and finds `false`, it is fine — but `outputDir` being set to a non-existent path could confuse any code that reads it in error paths.

---

### H3 — `collectFileInfo` called twice per deploy, hashing all files twice
**File:** `services/api/src/deploy/adapters/doable-cloud.ts` lines 91 and 113

`collectFileInfo(targetDir, targetDir)` is called at line 91 (inside the try block, result discarded) and again at line 113 (outside the try block, result used for the return value). Every deployed file is SHA-256 hashed twice. For large sites this doubles I/O and CPU time during the deploy phase. The inner result at line 91 is also stored in a `const files` that shadows the outer `let buildFiles` — this is confusing but not a bug per se. The real problem is the double work.

---

### H4 — SSE stream: `deploying` status event is never sent from server
**File:** `services/api/src/routes/deploy.ts` lines 113–158  
**File:** `apps/web/src/modules/editor/toolbar/publish-dialog.tsx` lines 227–229

The server sends `status: { step: "building" }` before the pipeline runs (line 113) but never sends `status: { step: "deploying" }`. The pipeline calls `onBuildLog?.("Deploying...\n")` (pipeline.ts line 156) as a raw log line, not as a structured `status` event. The frontend `handleSSEEvent` listens for `event: status` with `step === "deploying"` to advance the progress bar to the "Deploying" segment. That transition never happens — the UI stays stuck on "Building" until the `complete` or `error` event arrives.

**Impact:** progress bar always shows only "Building" lit up; "Deploying" segment never activates.

---

### H5 — No auth check on SSE streaming endpoint
**File:** `services/api/src/routes/deploy.ts` lines 88–160

The route `POST /:projectId/stream` is behind `authMiddleware` (line 17) which is correct for the route declaration. However, the `streamSSE` callback starts immediately and calls `runPipeline` without re-verifying that the token is still valid at that moment (tokens can expire mid-build for long deployments). There is also no check that the authenticated `userId` has write permission to `projectId` — only that the project exists. Any authenticated user can deploy any project they can name the ID of.

---

## MEDIUM

### M1 — `emitActivity` is fire-and-forget with no error handling
**File:** `services/api/src/routes/deploy.ts` lines 66–72, 135–141, 200–206, 254–260

`emitActivity(...)` is called without `await` and there is no `.catch()`. If it throws (DB down, schema mismatch), the error is silently swallowed and the activity event is lost. This is probably intentional for non-critical logging, but combined with no observability, failures here are invisible.

---

### M2 — `deploying` status DB update is missing `buildLog` from the build phase
**File:** `services/api/src/deploy/pipeline.ts` line 155

```ts
await deployments.updateStatus(deployment.id, "deploying", { buildTimeMs });
```

When status transitions to `deploying`, `buildLog` is not saved. If the deploy step subsequently throws (e.g., disk full, adapter error), the catch block at line 213 calls:

```ts
await deployments.updateStatus(deployment.id, "failed", { errorMessage });
```

...without `buildLog`. The build output is lost from the DB record. The pipeline return value (line 222) also returns `buildLog: ""` in the catch path, so the SSE `error` event carries no build log either.

**Impact:** when deploy-phase errors occur, users see no build output — making debugging nearly impossible.

---

### M3 — Teardown is a stub — deletes nothing
**File:** `services/api/src/deploy/adapters/doable-cloud.ts` lines 131–153

`teardown()` only logs directory names and never removes any files. Any call to tear down a project (e.g., project deletion, rollback cleanup) silently does nothing. Old site files accumulate on disk indefinitely.

---

### M4 — `getLatestLive` returns `rolled_back` deployments as "current live" reference
**File:** `packages/db/src/queries/deployments.ts` lines 91–104  
**File:** `services/api/src/routes/deploy.ts` line 283

`getLatestLive` filters `WHERE status = 'live'` — this is correct. But the `/status` endpoint (deploy.ts line 274) returns `getLatestLive` which can return `null` if no live deployment exists (e.g., after a rollback that failed). The frontend receives `data: null` with no indication of whether the project was previously deployed or never deployed — both look the same.

---

### M5 — Frontend `resetDialog` not called on dialog re-open
**File:** `apps/web/src/modules/editor/toolbar/publish-dialog.tsx` lines 101–109

`resetDialog` clears all state. It is called when the user explicitly closes the dialog, but there is no `useEffect` triggered when `open` transitions from `false` to `true`. If a deploy ends in `error`, the user closes the dialog, then immediately re-opens it — the dialog opens in `"configure"` step (because `resetDialog` was called on close) which is correct. However, if the user opens the dialog, starts a deploy (step becomes `"building"`), and the connection is dropped (network error), the dialog reaches `"error"` state. On retry via the "Retry" button (line 649), `handlePublish()` is called without resetting `buildLog` — so the previous failed build's log is prepended to the new run's log. This is low-severity in isolation but confusing.

---

### M6 — History panel does not filter by environment
**File:** `apps/web/src/modules/editor/toolbar/publish-dialog.tsx` lines 112–128  
**File:** `services/api/src/routes/deploy.ts` lines 294–320

`loadHistory()` fetches `GET /deploy/${projectId}/history?pageSize=10` without passing `?environment=`. The backend `listByProject` applies no environment filter when the param is absent. The history panel therefore shows production and preview deployments mixed together, without any visual distinction between them in the list item (the environment label is shown, but the list is unsorted by environment). When the user is configuring a preview deploy they see unrelated production history entries.

---

## LOW

### L1 — `status` query param not validated on `/status` endpoint
**File:** `services/api/src/routes/deploy.ts` line 276

`environment` is taken directly from the query string with no validation:
```ts
const environment = c.req.query("environment") ?? "production";
```
Any string (e.g. `?environment=; DROP TABLE deployments`) is passed directly to `getLatestLive(projectId, environment)` which interpolates it into a parameterized SQL query — so SQL injection is not a risk. However, `getLatestLive` will silently return `undefined` for invalid environment values, which is indistinguishable from "no deployments." A 400 with a clear message would be better.

---

### L2 — `publish-button.tsx` status never reverts to `idle` on dialog close without success
**File:** `apps/web/src/modules/editor/toolbar/publish-button.tsx` lines 63–69

The `onOpenChange` handler only resets status to `idle` after `success`. If the user opens the dialog, starts a deploy, gets an error, then closes the dialog via backdrop click, `status` stays `"error"` and the button shows "Retry" indefinitely until the page reloads or a new publish succeeds.

---

### L3 — `publish-dialog.tsx` uses `localStorage` token — no refresh fallback
**File:** `apps/web/src/modules/editor/toolbar/publish-dialog.tsx` lines 58–70

Auth token is read from `localStorage.access_token` at call time. If the token has expired, the API returns 401 and the streaming fetch's `res.ok` will be false, hitting the error path at line 154 — which is handled. However, there is no token refresh attempt before the deploy. For projects with long build times (approaching the 120s timeout), a token issued 1 hour before could expire mid-stream. The `EventSource`-style reader will simply stop receiving data and the frontend will never receive `done`, leaving the UI spinning indefinitely in `"building"` state.

---

### L4 — SSE `done` event handler is a no-op — stream hang if `complete`/`error` missed
**File:** `apps/web/src/modules/editor/toolbar/publish-dialog.tsx` lines 255–258

The `done` event does nothing. If for any reason the `complete` or `error` event is dropped (SSE buffering, proxy truncation), the stream ends with `done` but the UI remains stuck in `"building"` or `"deploying"` state with no timeout or recovery path.

---

### L5 — `doable-cloud.ts` uses `process.cwd()` fallback on Windows for `SITES_DIR`
**File:** `services/api/src/deploy/adapters/doable-cloud.ts` lines 12–16

The Windows fallback `path.join(process.cwd(), "data", "sites")` means the sites directory depends on the working directory when the API process was started. If the process is launched from a different directory (e.g., monorepo root vs `services/api`), deployments will scatter across different directories. This is dev-only behavior but has caused confusion in the past when local test deploys go to unexpected paths.

---

## Summary Table

| ID | Severity | Category | Short Description |
|----|----------|----------|-------------------|
| C1 | Critical | Race Condition | No concurrency guard — parallel deploys corrupt file system |
| C2 | Critical | Logic Error | Rollback re-builds from current source, not saved artifacts |
| H1 | High | Race Condition | Subdomain assignment not atomic — collision on first publish |
| H2 | High | Build Pipeline | Timeout + close event double-resolve; phantom log after timeout |
| H3 | High | Performance | `collectFileInfo` (SHA-256 hashes all files) called twice per deploy |
| H4 | High | SSE/Status | `deploying` step never sent as structured SSE event; progress bar broken |
| H5 | High | Security | No ownership check — any authenticated user can deploy any project |
| M1 | Medium | Observability | `emitActivity` fire-and-forget; failures silently lost |
| M2 | Medium | Status Tracking | Build log not saved to DB when deploy phase throws |
| M3 | Medium | Cleanup | `teardown()` is a stub — never removes files |
| M4 | Medium | Status Tracking | `/status` returns `null` for both "never deployed" and "rollback failed" |
| M5 | Medium | Frontend State | Retry re-uses previous build log; confusing log concatenation |
| M6 | Medium | Frontend UX | History panel mixes environments with no filter |
| L1 | Low | Validation | `environment` query param unvalidated on `/status` |
| L2 | Low | Frontend State | Button stays in `error` state after dialog close without success |
| L3 | Low | Auth | Token not refreshed before long build; UI can hang if token expires |
| L4 | Low | SSE | `done` event is no-op; no recovery if `complete`/`error` dropped |
| L5 | Low | Config | `SITES_DIR` Windows fallback depends on `process.cwd()` |
