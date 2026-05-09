# TC-THUMB-GEN — Puppeteer Thumbnail Generation

Scope: Screenshot generation on publish, retry on crash, fallback placeholder, queueing, dimensions.

---

## TC-THUMB-GEN-001
- Pre: User publishes project.
- Steps: Watch thumbnails queue.
- Expected: Job enqueued automatically; status pending → generating → done; row in thumbnails table with URL.
- Severity: P0

## TC-THUMB-GEN-002
- Pre: Republish.
- Expected: Thumbnail regenerated; previous version replaced; cache busted via versioned URL.
- Severity: P0

## TC-THUMB-GEN-003
- Pre: Puppeteer launches.
- Expected: Headless Chrome process; isolated profile; no shared cookies between renders.
- Severity: P0

## TC-THUMB-GEN-004
- Pre: Thumbnail dimensions configured.
- Expected: Default 1200x630 (OG) or 800x600 per config; matches output PNG.
- Severity: P1

## TC-THUMB-GEN-005
- Pre: Multiple sizes generated.
- Expected: Per config (e.g., og 1200x630, card 600x315, thumb 240x180).
- Severity: P2

## TC-THUMB-GEN-006
- Pre: Site has no <body>.
- Expected: Fallback placeholder used; status=fallback; row shows reason.
- Severity: P1

## TC-THUMB-GEN-007
- Pre: Site returns 5xx during render.
- Expected: Retry with backoff up to 3; fallback placeholder if all fail.
- Severity: P1

## TC-THUMB-GEN-008
- Pre: Site returns 4xx (404).
- Expected: Single attempt then fallback; not retried.
- Severity: P1

## TC-THUMB-GEN-009
- Pre: Puppeteer crashes mid-render.
- Expected: Job retried up to 3 times; if persistent, fallback; admin alert.
- Severity: P1

## TC-THUMB-GEN-010
- Pre: Render times out >30s.
- Expected: Page closed; status=failed; retry once; fallback if fails again.
- Severity: P1

## TC-THUMB-GEN-011
- Pre: Render under heavy concurrent load.
- Expected: Queue limits to MAX_THUMB_CONCURRENCY (e.g., 3); excess queued.
- Severity: P1

## TC-THUMB-GEN-012
- Pre: Many simultaneous publishes.
- Expected: Queue serialized per project; cross-project parallel up to cap.
- Severity: P1

## TC-THUMB-GEN-013
- Pre: Generated PNG file size.
- Expected: <500KB typical; max 2MB; oversize compressed via WebP fallback.
- Severity: P2

## TC-THUMB-GEN-014
- Pre: WebP support detected.
- Expected: WebP variant generated alongside PNG.
- Severity: P2

## TC-THUMB-GEN-015
- Pre: User uploads animated GIF as a "site".
- Expected: Static frame captured as PNG; not stored as GIF.
- Severity: P2

## TC-THUMB-GEN-016
- Pre: Large image (>10MB) on page.
- Expected: Render proceeds; final thumbnail still <2MB.
- Severity: P2

## TC-THUMB-GEN-017
- Pre: Site requires JS to render content.
- Expected: Puppeteer waits for `networkidle0` or DOMContentLoaded; renders post-JS.
- Severity: P1

## TC-THUMB-GEN-018
- Pre: Site has lazy-loaded images.
- Expected: Initial viewport scrolled to trigger lazy loads; reasonable wait.
- Severity: P2

## TC-THUMB-GEN-019
- Pre: Site has infinite loop / heavy CPU.
- Expected: Timeout enforced; render aborts; fallback.
- Severity: P1

## TC-THUMB-GEN-020
- Pre: Site references blocked URLs.
- Expected: Renders without those resources; placeholder for missing images.
- Severity: P2

## TC-THUMB-GEN-021
- Pre: Site has cookie banner.
- Expected: Either dismissed via known selector or captured with banner; consistent behavior.
- Severity: P2

## TC-THUMB-GEN-022
- Pre: Site behind auth (private preview).
- Expected: Either authenticated render via signed URL, or fallback.
- Severity: P1

## TC-THUMB-GEN-023
- Pre: Thumbnail storage path.
- Expected: Stored at /var/lib/doable/thumbnails/<project_id>/<version>.png; mode 0644.
- Severity: P1

## TC-THUMB-GEN-024
- Pre: Thumbnail URL served via Caddy.
- Expected: Public CDN-friendly URL; ETag/cache headers; long max-age + version-busted URL.
- Severity: P1

## TC-THUMB-GEN-025
- Pre: User unpublishes.
- Expected: Thumbnails removed; URL returns 404.
- Severity: P1

## TC-THUMB-GEN-026
- Pre: Project deleted.
- Expected: Thumbnails purged; storage reclaimed.
- Severity: P1

## TC-THUMB-GEN-027
- Pre: Puppeteer sandbox.
- Expected: Runs with `--no-sandbox` only if root user (avoided); otherwise full sandbox; isolated user.
- Severity: P0

## TC-THUMB-GEN-028
- Pre: Puppeteer process leaks.
- Expected: Old processes killed; periodic GC reaps zombies.
- Severity: P1

## TC-THUMB-GEN-029
- Pre: Memory pressure during render.
- Expected: Per-render memory cap; abort if exceeded; fallback.
- Severity: P1

## TC-THUMB-GEN-030
- Pre: Site contains malicious JS attempting fetch internal hosts.
- Expected: Network egress restricted to public; loopback denied; security_finding logged.
- Severity: P0

## TC-THUMB-GEN-031
- Pre: Render occurs over Cloudflare Tunnel domain.
- Expected: Renders the public URL `<env>-<slug>.doable.me`; no direct host access.
- Severity: P1

## TC-THUMB-GEN-032
- Pre: Render via internal IP.
- Expected: Refused; only public published URL allowed.
- Severity: P0

## TC-THUMB-GEN-033
- Pre: Thumbnail metadata.
- Expected: Stored with width, height, format, sha256, generated_at.
- Severity: P2

## TC-THUMB-GEN-034
- Pre: Marketplace item display.
- Expected: Uses thumbnail URL; if missing, shows placeholder.
- Severity: P2

## TC-THUMB-GEN-035
- Pre: Thumbnail regenerate button (admin / owner).
- Expected: Manual trigger enqueues job; UI shows progress.
- Severity: P2

## TC-THUMB-GEN-036
- Pre: Concurrent thumbnail jobs same project.
- Expected: Latest wins; older job aborted; result single row.
- Severity: P1

## TC-THUMB-GEN-037
- Pre: Thumbnail job retry policy.
- Expected: Exponential backoff: 1s, 5s, 25s; after 3 attempts → fallback.
- Severity: P1

## TC-THUMB-GEN-038
- Pre: Verify fallback placeholder is project initial / generated svg.
- Expected: Visually distinct; non-blank; identifies project.
- Severity: P2

## TC-THUMB-GEN-039
- Pre: Thumbnail accessible to non-owner of public published project.
- Expected: Public URL works; private projects' thumbnails require auth.
- Severity: P0

## TC-THUMB-GEN-040
- Pre: User tries to upload arbitrary thumbnail to bypass generation.
- Expected: Either feature exists with size/type validation, or rejected.
- Severity: P1

## TC-THUMB-GEN-041
- Pre: Job queue depth metric.
- Expected: Exposed via /admin/runtime metric; alert at threshold.
- Severity: P2

## TC-THUMB-GEN-042
- Pre: Job DLQ for repeatedly failing.
- Expected: After max retries, moved to dead-letter; admin can inspect.
- Severity: P2

## TC-THUMB-GEN-043
- Pre: Verify Chrome version pinned.
- Expected: setup-server.sh installs specific Chromium; CVE patched.
- Severity: P1

## TC-THUMB-GEN-044
- Pre: Render under DOABLE_HARDENING=full.
- Expected: Puppeteer process under sandbox; cannot escape FS.
- Severity: P0

## TC-THUMB-GEN-045
- Pre: Verify thumbnails table indexed.
- Expected: (project_id, version) unique; lookups fast.
- Severity: P2
