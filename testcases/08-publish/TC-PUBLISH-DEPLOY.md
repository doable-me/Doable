# TC-PUBLISH-DEPLOY — Deploy artifact storage, build process, build_stream SSE

Covers static-file build pipeline, artifact persistence under `/root/doable/sites/<sub>/`, and the SSE `build-stream` channel.

> **Path note (2026-05-09 corpus run):** deploy routes are mounted at `/deploy/*`. Smoke endpoints:
> - `GET /deploy/:projectId/status` — current deploy state
> - `GET /deploy/:projectId/history` — recent deploys
> - `GET /deploy/:projectId/deployments` — full deployment list
> - `POST /deploy/:projectId` — trigger build (body optional; missing fields default to `adapter:doable-cloud, environment:production`)
> - `POST /deploy/:projectId/publish` and `POST /deploy/:projectId/publish/preview` — same default-body behavior; on env1 these returned 200 with a `live` deployment when called with `{}`. Author tip: don't expect 400 for empty body — assert on the deployment shape instead.
> - `POST /deploy/:projectId/rollback/:deploymentId` — 404 on unknown deployment id
> Source: `services/api/src/routes/deploy/deploy-trigger.ts:27–231`, `deploy-query.ts:17–108`.

---

## TC-PUBLISH-DEPLOY-001
**Title:** Static HTML site builds and writes to live/
**Pre:** Project with index.html, styles.css, script.js
**Steps:**
1. Click Publish
**Expected:** Files copied to `/root/doable/sites/<sub>/live/`. Permissions readable by Caddy. URL serves matching content.
**Severity:** Critical

## TC-PUBLISH-DEPLOY-002
**Title:** Vite/Next static export build runs `pnpm build`
**Pre:** Vite project
**Steps:**
1. Publish
2. Watch /build-stream
**Expected:** Build runs `pnpm install` (cached) + `pnpm build`; final dist/ rsync'd to live/. Build steps stream as SSE events.
**Severity:** Critical

## TC-PUBLISH-DEPLOY-003
**Title:** Build artifacts versioned under timestamp directory
**Pre:** Project published once
**Steps:**
1. Inspect `/root/doable/sites/<sub>/`
**Expected:** Contains `live/` (symlink → `versions/<timestamp>/`) and `versions/<timestamp>/`. Last 5 versions retained.
**Severity:** High

## TC-PUBLISH-DEPLOY-004
**Title:** Symlink swap is atomic on republish
**Pre:** Published v1
**Steps:**
1. Republish v2
2. While ab-loading the URL, check no 404 window during swap
**Expected:** `live` symlink atomically updated via `ln -sfn` + rename trick. No request returns 5xx during swap.
**Severity:** High

## TC-PUBLISH-DEPLOY-005
**Title:** Old versions purged beyond retention (5)
**Pre:** Project republished 6 times
**Steps:**
1. List versions/
**Expected:** Only most recent 5 remain (excluding the live one). Oldest deleted from disk.
**Severity:** Medium

## TC-PUBLISH-DEPLOY-006
**Title:** Build_stream SSE emits `progress` events
**Pre:** Authenticated user, deployment in progress
**Steps:**
1. Open EventSource to /build-stream?deployment_id=<id>
2. Trigger publish
**Expected:** Receive named events: `queued`, `installing`, `building`, `uploading`, `caddy_reload`, `done`. Each carries phase + percent + log_tail.
**Severity:** High

## TC-PUBLISH-DEPLOY-007
**Title:** Build_stream SSE emits `error` event on failure
**Pre:** Project with build error
**Steps:**
1. Subscribe to /build-stream
2. Publish
**Expected:** Receives `error` event with `error_message` and last 100 lines of build log; stream closes after.
**Severity:** Critical

## TC-PUBLISH-DEPLOY-008
**Title:** Build_stream auth: user can only stream own deployments
**Pre:** User A's deployment id
**Steps:**
1. User B subscribes /build-stream?deployment_id=<A's id>
**Expected:** 403 immediately, stream not opened.
**Severity:** Critical

## TC-PUBLISH-DEPLOY-009
**Title:** Build_stream reconnect with Last-Event-ID
**Pre:** Build in progress
**Steps:**
1. Subscribe, drop connection mid-build
2. Reconnect with Last-Event-ID
**Expected:** Server resumes from event after the given id (using in-memory ring buffer or DB log). No duplicate `done`.
**Severity:** Medium

## TC-PUBLISH-DEPLOY-010
**Title:** Build_stream heartbeat keeps connection alive through proxy
**Pre:** Long-running build
**Steps:**
1. Subscribe; wait 30s with no real events
**Expected:** Server emits `:keepalive\n\n` every 15s; no Cloudflare 524 idle timeout.
**Severity:** Medium

## TC-PUBLISH-DEPLOY-011
**Title:** Very large bundle (>200MB) builds and uploads
**Pre:** Project with assets totaling 220MB
**Steps:**
1. Publish
**Expected:** Build completes; rsync to live/ succeeds; URL serves assets. Memory usage on server stays under 1GB.
**Severity:** High

## TC-PUBLISH-DEPLOY-012
**Title:** Bundle exceeding plan limit rejected pre-build
**Pre:** Free plan, 50MB cap; project at 60MB
**Steps:**
1. Publish
**Expected:** Build rejected before install with 413 "Bundle exceeds 50MB plan limit". User shown upgrade hint.
**Severity:** High

## TC-PUBLISH-DEPLOY-013
**Title:** Build timeout after configured limit
**Pre:** Project with infinite-loop in build script
**Steps:**
1. Publish (timeout = 10 min)
**Expected:** After 10min, build process killed (SIGKILL after SIGTERM grace), status=error, error_message="Build exceeded 10 minute timeout".
**Severity:** High

## TC-PUBLISH-DEPLOY-014
**Title:** Build script runs in sandbox (dovault) — no host access
**Pre:** Malicious build script attempts to read /etc/passwd
**Steps:**
1. Publish
**Expected:** Read fails (sandbox denies); build still completes other steps; suspicious access logged. Or: read succeeds with chroot/empty version (depending on sandbox impl) — but no real /etc/passwd leaked.
**Severity:** Critical

## TC-PUBLISH-DEPLOY-015
**Title:** Build script cannot bind to network port
**Pre:** Build script tries `net.createServer().listen(8080)`
**Steps:**
1. Publish
**Expected:** Sandbox denies listen; build still finishes if non-fatal, or fails with clear error.
**Severity:** High

## TC-PUBLISH-DEPLOY-016
**Title:** Build script cannot exfiltrate via DNS
**Pre:** Egress jail enabled
**Steps:**
1. Build script does `dig attacker.example.com`
**Expected:** Resolution fails or only reaches allowlisted resolvers. Logged.
**Severity:** High

## TC-PUBLISH-DEPLOY-017
**Title:** Build artifact path traversal resisted
**Pre:** Hostile project includes file `../../etc/passwd`
**Steps:**
1. Publish
**Expected:** Sanitized; no file written outside `/root/doable/sites/<sub>/versions/<ts>/`. Path traversal blocked at copy step.
**Severity:** Critical

## TC-PUBLISH-DEPLOY-018
**Title:** Build artifact symlinks resolved/blocked
**Pre:** Project includes symlink `link → /etc/passwd`
**Steps:**
1. Publish
**Expected:** rsync run with `--safe-links` or follow-only-within-tree; no symlink to outside artifact tree persisted.
**Severity:** Critical

## TC-PUBLISH-DEPLOY-019
**Title:** Hidden files (.env, .git) excluded from artifact
**Pre:** Project has .env with secrets, .git directory
**Steps:**
1. Publish
2. Inspect live/
**Expected:** No `.env`, `.git`, `node_modules` (unless required runtime), `.DS_Store` in live/. Public URL `/.env` returns 404.
**Severity:** Critical

## TC-PUBLISH-DEPLOY-020
**Title:** node_modules excluded from artifact (static project)
**Pre:** Static HTML project with package.json + node_modules
**Steps:**
1. Publish
**Expected:** node_modules not copied; only built assets. Live size remains small.
**Severity:** High

## TC-PUBLISH-DEPLOY-021
**Title:** Build cache reused across republish
**Pre:** First publish completed (cache primed)
**Steps:**
1. Edit one source file
2. Republish; time the build
**Expected:** Second build noticeably faster (cached pnpm store + .next/cache or vite cache). Cache key includes lockfile hash.
**Severity:** Medium

## TC-PUBLISH-DEPLOY-022
**Title:** Lockfile change invalidates dependency cache
**Pre:** Existing publish
**Steps:**
1. Add new dep, lockfile changes
2. Publish
**Expected:** pnpm install runs (not skipped). Build succeeds.
**Severity:** Medium

## TC-PUBLISH-DEPLOY-023
**Title:** Caddy config written for new subdomain
**Pre:** Subdomain `acme` not yet in Caddyfile
**Steps:**
1. Publish
2. Inspect Caddy config endpoint or `/etc/caddy/Caddyfile.d/`
**Expected:** New site block appended (or regex auto-matches). `caddy reload` invoked. No full restart.
**Severity:** Critical

## TC-PUBLISH-DEPLOY-024
**Title:** Caddy reload failure surfaced
**Pre:** Caddy config invalid (e.g., disk full, syntax error in adjacent file)
**Steps:**
1. Publish
**Expected:** Status=error with "Caddy reload failed: <reason>". Artifact is rolled back; previous live left intact if it existed.
**Severity:** High

## TC-PUBLISH-DEPLOY-025
**Title:** Cloudflare tunnel route already wildcarded — no per-publish API call needed
**Pre:** `*.doable.me` tunnel route exists
**Steps:**
1. Publish new subdomain
**Expected:** No Cloudflare API call needed for tunnel (covered by wildcard). Logs confirm "tunnel route already exists, skipping".
**Severity:** Medium

## TC-PUBLISH-DEPLOY-026
**Title:** Tunnel route added when wildcard not present
**Pre:** Tunnel only routes specific hostnames; wildcard absent
**Steps:**
1. Publish
**Expected:** API call to Cloudflare adds the route. On API 5xx, retries with backoff.
**Severity:** High

## TC-PUBLISH-DEPLOY-027
**Title:** Deployment row stores published_by, published_at, version
**Pre:** Publish triggered by user U
**Steps:**
1. Inspect `deployments` row
**Expected:** Columns populated: project_id, subdomain, status, published_by=U, published_at=now, version=1, artifact_path, build_log_url.
**Severity:** Medium

## TC-PUBLISH-DEPLOY-028
**Title:** Build log persisted and downloadable
**Pre:** Completed publish
**Steps:**
1. Open Deployments tab; click "View build log"
**Expected:** Full log retrieved. Download button yields .txt file. Log retained 30 days.
**Severity:** Medium

## TC-PUBLISH-DEPLOY-029
**Title:** Multiple frameworks: Next.js static export
**Pre:** Next.js project with `output: 'export'`
**Steps:**
1. Publish
**Expected:** `pnpm build` then export to `out/`; out/ rsynced to live/. URL serves Next pages. No SSR.
**Severity:** High

## TC-PUBLISH-DEPLOY-030
**Title:** Multiple frameworks: pure HTML/CSS
**Pre:** Pure static project, no package.json
**Steps:**
1. Publish
**Expected:** Skip install/build; rsync project root → live/. Status=published in <5s.
**Severity:** High

## TC-PUBLISH-DEPLOY-031
**Title:** Multiple frameworks: Vite (React)
**Pre:** Vite React project
**Steps:**
1. Publish
**Expected:** dist/ produced; live/ serves SPA index.html with proper rewrite (catch-all → index.html for client routing).
**Severity:** High

## TC-PUBLISH-DEPLOY-032
**Title:** SPA catch-all rewrite serves index.html for unknown routes
**Pre:** Vite SPA published
**Steps:**
1. Visit `/some/deep/route`
**Expected:** Caddy rewrites to /index.html and serves it (200), JS handles routing client-side.
**Severity:** High

## TC-PUBLISH-DEPLOY-033
**Title:** Static asset cache headers set
**Pre:** Published site with hashed assets like main.abc123.js
**Steps:**
1. curl -I https://<sub>.doable.me/main.abc123.js
**Expected:** `Cache-Control: public, max-age=31536000, immutable` for hashed files; HTML has `Cache-Control: no-cache` or short max-age.
**Severity:** Medium

## TC-PUBLISH-DEPLOY-034
**Title:** Gzip/brotli served for text assets
**Pre:** Published site
**Steps:**
1. curl -H "Accept-Encoding: br, gzip" -I https://<sub>.doable.me/main.js
**Expected:** Response `Content-Encoding: br` or `gzip`. Sizes ~30% of raw.
**Severity:** Medium

## TC-PUBLISH-DEPLOY-035
**Title:** Build env vars injected from project settings (NEXT_PUBLIC_ only)
**Pre:** Project has env `NEXT_PUBLIC_API_URL` and `SECRET_KEY`
**Steps:**
1. Publish
2. Inspect built bundle
**Expected:** `NEXT_PUBLIC_API_URL` inlined. `SECRET_KEY` NOT present in any artifact (server-only secrets stripped).
**Severity:** Critical

## TC-PUBLISH-DEPLOY-036
**Title:** Build_stream cancellation aborts build
**Pre:** Build in progress
**Steps:**
1. UI Cancel button → DELETE /deploy/<id>
**Expected:** Build process killed; status=cancelled; no artifact swap. SSE emits `cancelled` event.
**Severity:** High

## TC-PUBLISH-DEPLOY-037
**Title:** Disk full during build
**Pre:** Server disk at 99% used
**Steps:**
1. Publish
**Expected:** Status=error, error_message indicates ENOSPC; admin alerted via metrics. Old failed artifacts cleaned.
**Severity:** High

## TC-PUBLISH-DEPLOY-038
**Title:** OOM during build
**Pre:** Project with large memory build (e.g., big webpack)
**Steps:**
1. Publish on small VM (1GB RAM)
**Expected:** Process killed by OOM, error captured, message "Build out of memory; try upgrading server or smaller bundle".
**Severity:** High

## TC-PUBLISH-DEPLOY-039
**Title:** Concurrency cap: max N concurrent builds platform-wide
**Pre:** Cap = 3, currently 3 building
**Steps:**
1. New publish triggered
**Expected:** Queued state; SSE emits `queued`. Begins when slot frees.
**Severity:** Medium

## TC-PUBLISH-DEPLOY-040
**Title:** Idempotency: same source twice produces identical artifact hash
**Pre:** Project published; no source changes
**Steps:**
1. Republish
2. Compare artifact dir SHA-256
**Expected:** Hash matches (or differs only by timestamps). Determinism aids audit.
**Severity:** Low

## TC-PUBLISH-DEPLOY-041
**Title:** Publish writes only to /root/doable/sites and never elsewhere
**Pre:** strace or auditd
**Steps:**
1. Run audit during a publish
**Expected:** Writes confined to `/root/doable/sites/`, `/var/log/doable/`, and tmp/cache dirs. No writes to /etc, /usr, /var/lib unrelated paths.
**Severity:** Critical

## TC-PUBLISH-DEPLOY-042
**Title:** Build run as non-root if possible
**Pre:** Sandbox configured for unprivileged UID
**Steps:**
1. Publish; check process UID
**Expected:** Build runs as `doable-builder` (or sandbox UID), not root. Output owned by Caddy-readable group.
**Severity:** High

## TC-PUBLISH-DEPLOY-043
**Title:** SSE stream closes cleanly on success
**Pre:** Subscribe; publish succeeds
**Steps:**
1. Watch frames
**Expected:** Final event `done` with payload `{deployment_id, url}`; server sends `event: end` then closes the connection.
**Severity:** Low

## TC-PUBLISH-DEPLOY-044
**Title:** Multiple SSE subscribers on same deployment
**Pre:** Two browser tabs subscribed
**Steps:**
1. Publish
**Expected:** Both receive same event sequence in order; identical event ids.
**Severity:** Medium

## TC-PUBLISH-DEPLOY-045
**Title:** Deployment artifact path naming uses ULID/UUID, not user-provided slug
**Pre:** N/A
**Steps:**
1. Inspect filesystem
**Expected:** `versions/<ulid>/` (or similar collision-free id). User-provided text never directly forms a path.
**Severity:** Medium
