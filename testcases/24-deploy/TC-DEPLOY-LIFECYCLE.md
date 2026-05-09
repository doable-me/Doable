# TC-DEPLOY-LIFECYCLE — Build & Deploy Lifecycle

Scope: Deployment lifecycle, `deployments` and `deployment_artifacts` tables, build SSE stream, error surfaces.

---

## TC-DEPLOY-LIFECYCLE-001
- Pre: User authenticated; project with valid build.
- Steps: Click "Publish" button on editor.
- Expected: Server creates deployment row status=queued; UI shows progress modal; SSE stream connects.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-002
- Pre: User clicks publish.
- Steps: Subscribe SSE `/api/deploy/:id/stream`.
- Expected: Events: `queued`, `building`, `building:step:install`, `building:step:build`, `uploading`, `live`, `done`. Each event has timestamp.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-003
- Pre: Build fails on `npm install`.
- Steps: Watch SSE.
- Expected: Final event `failed` with stderr captured; deployment status=failed; published URL unchanged.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-004
- Pre: Build fails on TS error.
- Expected: Error logs streamed; UI shows file:line:col where possible.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-005
- Pre: Build succeeds.
- Expected: deployment_artifacts row written with bundle path, size_bytes, sha256, created_at.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-006
- Pre: User publishes 5 times.
- Expected: 5 deployment_artifacts rows; latest is_active=true; previous 4 retained per N=10 retention default.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-007
- Pre: User publishes 11 times (N=10 retention).
- Expected: Oldest artifact pruned; storage freed; audit/log row.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-008
- Pre: User publishes during another in-progress publish.
- Expected: Second deploy queued (same project serialized); SSE shows queue position.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-009
- Pre: Concurrent deploys for different projects.
- Expected: Both run in parallel up to a global concurrency cap.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-010
- Pre: User cancels mid-build.
- Steps: Click Cancel on SSE modal.
- Expected: Build process killed; deployment status=cancelled; artifact NOT promoted; SSE final event `cancelled`.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-011
- Pre: Build hangs >10 minutes.
- Expected: Auto-timeout; status=failed with reason=timeout; SSE emits `failed`.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-012
- Pre: Build emits OOM.
- Expected: Captured; suggestion in error: "Reduce bundle size or upgrade plan".
- Severity: P1

## TC-DEPLOY-LIFECYCLE-013
- Pre: Build artifact exceeds size limit (e.g., 100MB plan limit).
- Expected: Build fails after bundle creation with "exceeds plan size limit"; artifact deleted.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-014
- Pre: User publishes from offline / network drops mid-stream.
- Expected: SSE auto-reconnects with cursor; UI resumes; build continues server-side.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-015
- Pre: Multiple SSE clients (user has 2 tabs).
- Expected: Both tabs receive same events.
- Severity: P2

## TC-DEPLOY-LIFECYCLE-016
- Pre: Build success.
- Steps: Verify Caddy serves new bundle.
- Expected: published subdomain returns 200 with new content; old bundle replaced atomically.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-017
- Pre: Build success; thumbnail kicked off.
- Expected: Thumbnail job enqueued automatically; row in thumbnails queue.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-018
- Pre: Build success but Caddy reload fails.
- Expected: Deployment marked degraded; rollback path triggers; admin alerted.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-019
- Pre: User clicks publish twice rapidly.
- Expected: Idempotency token prevents double deploy; second click no-op or queues.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-020
- Pre: Plan-locked project.
- Expected: Publish blocked with upgrade prompt; no deployment row.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-021
- Pre: Free plan project with publish quota exceeded.
- Expected: 402 / quota error; no deployment row; clear messaging.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-022
- Pre: User publishes; verify SSE close on completion.
- Expected: Server sends `event: done` then closes connection; client unsubscribes.
- Severity: P2

## TC-DEPLOY-LIFECYCLE-023
- Pre: SSE event ordering.
- Expected: Strictly monotonic; never `done` before `building`.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-024
- Pre: Long log line (>1MB).
- Expected: Truncated or chunked into multiple SSE events; no buffer overflow.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-025
- Pre: Build emits ANSI color codes.
- Expected: UI strips or renders ANSI safely; no XSS via escape sequences.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-026
- Pre: Build environment uses sandbox.
- Expected: Build runs under DOVAULT_BACKEND with restricted FS access; cannot read other projects.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-027
- Pre: Build invokes external network.
- Expected: Allowed via Squid/egress proxy; or denied per hardening policy.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-028
- Pre: User publishes with custom domain.
- Expected: DNS/SSL provisioning triggers; status reported in stream.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-029
- Pre: Build completes; verify admin sees deploy in /admin/projects/:id.
- Expected: Build artifact list reflects new entry.
- Severity: P2

## TC-DEPLOY-LIFECYCLE-030
- Pre: Build with no source files.
- Expected: Friendly error "No files to build"; not a crash.
- Severity: P2

## TC-DEPLOY-LIFECYCLE-031
- Pre: User retries failed build.
- Expected: New deployment row; previous row preserved with status=failed; audit row.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-032
- Pre: User retries with same source.
- Expected: Honored; no caching issue producing stale errors.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-033
- Pre: Build error parser groups TS errors by file.
- Expected: UI shows tree by file with error count.
- Severity: P2

## TC-DEPLOY-LIFECYCLE-034
- Pre: Build emits warnings only.
- Expected: Status=success with warnings; UI shows count and link to view.
- Severity: P2

## TC-DEPLOY-LIFECYCLE-035
- Pre: Verify deployment SSE auth.
- Expected: Stream requires session cookie matching project owner/member; cross-user 403.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-036
- Pre: Build aborted because runtime cap reached.
- Expected: Queue retried after capacity frees; deployment shows queued state.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-037
- Pre: User publishes; tunnel (cloudflared) reload.
- Expected: Caddy + cloudflared coordinate; published subdomain reachable post-reload.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-038
- Pre: Build with secret env injection.
- Expected: Secrets injected at build time; never logged in SSE stream; redacted if echoed.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-039
- Pre: User unpublishes.
- Expected: deployments.is_active=false; subdomain returns 410 Gone; thumbnails cleared.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-040
- Pre: Republish after unpublish.
- Expected: New deployment; subdomain restored to 200.
- Severity: P0

## TC-DEPLOY-LIFECYCLE-041
- Pre: Verify build host disk usage check.
- Expected: Pre-flight rejects build if <500MB free; admin alerted.
- Severity: P1

## TC-DEPLOY-LIFECYCLE-042
- Pre: Verify deployment row carries trace_id.
- Expected: chat_traces or traces row linked; admin can view OTel trace for build.
- Severity: P1
