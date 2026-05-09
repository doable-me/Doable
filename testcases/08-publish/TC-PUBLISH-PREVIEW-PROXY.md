# TC-PUBLISH-PREVIEW-PROXY — Preview-proxy reverse proxy to Vite dev server with WS upgrade

Covers the `/preview-proxy` endpoint that surfaces an in-progress dev preview from a sandbox-running Vite (or similar) at a stable doable URL with HMR over WebSocket.

---

## TC-PUBLISH-PREVIEW-PROXY-001
**Title:** Preview proxy serves Vite dev index
**Pre:** Project has dev server running on internal port (e.g., 127.0.0.1:5173 in sandbox)
**Steps:**
1. Open `/preview-proxy/<projectId>/`
**Expected:** Returns 200 with Vite-served index.html. Source links resolve under same prefix.
**Severity:** Critical

## TC-PUBLISH-PREVIEW-PROXY-002
**Title:** Preview proxy upgrades WebSocket for HMR
**Pre:** Same as above
**Steps:**
1. Browser loads preview; observe `/preview-proxy/<projectId>/` HMR WebSocket
**Expected:** WS upgrade succeeds (101 Switching Protocols). HMR `connected` event from Vite reaches client. File edit triggers update without full reload.
**Severity:** Critical

## TC-PUBLISH-PREVIEW-PROXY-003
**Title:** Preview proxy isolates per-project (no cross-project leak)
**Pre:** Two projects have dev servers
**Steps:**
1. User loads `/preview-proxy/A/` then `/preview-proxy/B/`
**Expected:** Each routes to its own backend port. No path/cookie carryover.
**Severity:** High

## TC-PUBLISH-PREVIEW-PROXY-004
**Title:** Preview proxy auth: only project members
**Pre:** User B not on project A
**Steps:**
1. User B opens `/preview-proxy/A/`
**Expected:** 403 with simple "You don't have access to this preview" page.
**Severity:** Critical

## TC-PUBLISH-PREVIEW-PROXY-005
**Title:** Preview proxy auth via signed token (shareable previews)
**Pre:** Owner generates share link with TTL
**Steps:**
1. Anonymous user opens `/preview-proxy/A/?t=<token>`
**Expected:** Allowed if token valid + not expired. Recorded in `preview_share_grants`.
**Severity:** High

## TC-PUBLISH-PREVIEW-PROXY-006
**Title:** Expired share token rejected
**Pre:** Token TTL 60 min, now 90 min later
**Steps:**
1. Same anon user opens
**Expected:** 401 "Preview link expired". Owner can regenerate.
**Severity:** High

## TC-PUBLISH-PREVIEW-PROXY-007
**Title:** Backend dev server not running — friendly error
**Pre:** Vite dev process not started
**Steps:**
1. Open preview
**Expected:** 502 with HTML page "Preview server is starting up… (auto-retry)" and JS that retries every 2s.
**Severity:** High

## TC-PUBLISH-PREVIEW-PROXY-008
**Title:** Backend crash mid-session — auto-reconnect HMR
**Pre:** Active preview
**Steps:**
1. Kill Vite process server-side
2. Wait
3. Restart it
**Expected:** WS drops; client retries; on reconnect HMR resumes. No infinite spinner.
**Severity:** Medium

## TC-PUBLISH-PREVIEW-PROXY-009
**Title:** Path stripping: prefix removed before forwarding
**Pre:** Vite expects requests at `/`
**Steps:**
1. Browser requests `/preview-proxy/<id>/src/main.tsx`
**Expected:** Backend receives `/src/main.tsx`. Vite serves it.
**Severity:** High

## TC-PUBLISH-PREVIEW-PROXY-010
**Title:** Vite base path option configured for sub-path
**Pre:** Vite started with `--base /preview-proxy/<id>/` (or proxy rewrites)
**Steps:**
1. Verify HTML asset URLs
**Expected:** Asset hrefs/src include the prefix; no broken links.
**Severity:** High

## TC-PUBLISH-PREVIEW-PROXY-011
**Title:** Cross-origin request blocked by default
**Pre:** Embedded iframe from another origin
**Steps:**
1. Try fetch from external page
**Expected:** Blocked by CORS unless project explicitly enables. CSP frame-ancestors set tight by default.
**Severity:** High

## TC-PUBLISH-PREVIEW-PROXY-012
**Title:** Preview embeddable in editor iframe (same origin)
**Pre:** Editor `/editor/<id>` iframes preview
**Steps:**
1. Load editor
**Expected:** iframe loads preview. CSP allows same-origin frame; HMR works.
**Severity:** Critical

## TC-PUBLISH-PREVIEW-PROXY-013
**Title:** Preview proxy compresses responses
**Pre:** Large JS bundle
**Steps:**
1. curl -H "Accept-Encoding: gzip" /preview-proxy/<id>/src/main.tsx
**Expected:** Response gzipped. Latency reduced.
**Severity:** Low

## TC-PUBLISH-PREVIEW-PROXY-014
**Title:** Preview proxy honors max body size for POST (e.g., uploads in dev)
**Pre:** Plan limit 50MB
**Steps:**
1. Upload 100MB to dev server through proxy
**Expected:** 413 with clean error before reaching backend.
**Severity:** Medium

## TC-PUBLISH-PREVIEW-PROXY-015
**Title:** Preview proxy timeout for slow backend
**Pre:** Backend hangs on a request
**Steps:**
1. Request times out at 30s
**Expected:** Proxy returns 504. WS connections handled separately (long-lived OK).
**Severity:** Medium

## TC-PUBLISH-PREVIEW-PROXY-016
**Title:** Preview proxy supports SSE forwarding
**Pre:** Dev server uses SSE
**Steps:**
1. Open EventSource through proxy
**Expected:** Events stream end-to-end; proxy doesn't buffer.
**Severity:** Medium

## TC-PUBLISH-PREVIEW-PROXY-017
**Title:** WS upgrade preserves Sec-WebSocket-Protocol
**Pre:** HMR uses subprotocol
**Steps:**
1. Inspect handshake headers
**Expected:** Subprotocol forwarded both ways; HMR matches expected protocol.
**Severity:** Medium

## TC-PUBLISH-PREVIEW-PROXY-018
**Title:** WS upgrade preserves Origin/Cookie
**Pre:** Auth via cookie
**Steps:**
1. Connect WS
**Expected:** Cookie reaches backend; auth accepted. (If backend trusts proxy, header forwarded once not duplicated.)
**Severity:** High

## TC-PUBLISH-PREVIEW-PROXY-019
**Title:** Preview pause when project idle (sandbox suspends)
**Pre:** Sandbox auto-suspends after 10 min idle
**Steps:**
1. Leave preview open 15 min
**Expected:** Backend suspends; subsequent request triggers resume; UI shows "Resuming…" briefly.
**Severity:** Medium

## TC-PUBLISH-PREVIEW-PROXY-020
**Title:** Preview persists vite cookies/session for HMR
**Pre:** Active session
**Steps:**
1. Reload page
**Expected:** HMR reconnects without state loss; cookies scoped to /preview-proxy/<id>/.
**Severity:** Low

## TC-PUBLISH-PREVIEW-PROXY-021
**Title:** Static binary asset served correctly through proxy
**Pre:** Project has logo.png
**Steps:**
1. GET /preview-proxy/<id>/assets/logo.png
**Expected:** Binary intact (sha256 matches source); Content-Type image/png.
**Severity:** Medium

## TC-PUBLISH-PREVIEW-PROXY-022
**Title:** Range requests forwarded (video preview)
**Pre:** Project has video.mp4
**Steps:**
1. curl with `Range: bytes=0-1023`
**Expected:** 206 Partial Content with bytes 0–1023.
**Severity:** Low

## TC-PUBLISH-PREVIEW-PROXY-023
**Title:** Backend port discovery via project run state
**Pre:** Run service randomly assigns port (e.g., 5183)
**Steps:**
1. Open preview
**Expected:** Proxy looks up current port from run-state row; routes correctly. Port change after restart auto-picked up.
**Severity:** High

## TC-PUBLISH-PREVIEW-PROXY-024
**Title:** Stale port mapping returns 502 with auto-refresh
**Pre:** Port mapping cached but backend now on new port
**Steps:**
1. Request
**Expected:** First attempt 502 → cache invalidated → retry → 200. UI doesn't show error to user.
**Severity:** Medium

## TC-PUBLISH-PREVIEW-PROXY-025
**Title:** Proxy strips x-forwarded headers at boundary
**Pre:** Request with crafted X-Forwarded-User
**Steps:**
1. Send request with bogus header
**Expected:** Header stripped/overwritten by proxy before forwarding to backend.
**Severity:** Critical

## TC-PUBLISH-PREVIEW-PROXY-026
**Title:** Proxy adds X-Real-IP / X-Forwarded-For
**Pre:** N/A
**Steps:**
1. Inspect headers backend receives
**Expected:** X-Real-IP = client IP; X-Forwarded-For appended.
**Severity:** Low

## TC-PUBLISH-PREVIEW-PROXY-027
**Title:** Preview proxy refuses to forward to non-loopback
**Pre:** Misconfigured project_run.host = `1.2.3.4`
**Steps:**
1. Request preview
**Expected:** Refused; only forwards to 127.0.0.1. SSRF prevention.
**Severity:** Critical

## TC-PUBLISH-PREVIEW-PROXY-028
**Title:** Preview proxy rate limit per-user
**Pre:** Default 100 req/s/user
**Steps:**
1. Burst 500 req in 1s
**Expected:** Excess 429; well-formed Retry-After.
**Severity:** Medium

## TC-PUBLISH-PREVIEW-PROXY-029
**Title:** Preview proxy URL stable through deploy
**Pre:** Long preview session running
**Steps:**
1. Trigger publish (production deploy)
**Expected:** Preview proxy unaffected (separate from publish artifacts). Vite continues; HMR continues.
**Severity:** Medium

## TC-PUBLISH-PREVIEW-PROXY-030
**Title:** Preview proxy logs anonymous access metrics (without leaking content)
**Pre:** Active session
**Steps:**
1. Inspect proxy access logs
**Expected:** Records project_id, status, byte_count, ts; never logs request body or response body.
**Severity:** Medium

## TC-PUBLISH-PREVIEW-PROXY-031
**Title:** Preview proxy 404 for unknown project
**Pre:** project_id doesn't exist
**Steps:**
1. Open `/preview-proxy/zzz/`
**Expected:** 404 plain "Preview not found".
**Severity:** Low

## TC-PUBLISH-PREVIEW-PROXY-032
**Title:** Preview proxy iframe-busting test
**Pre:** Suspicious origin embeds preview
**Steps:**
1. Cross-origin embed
**Expected:** X-Frame-Options or CSP frame-ancestors restricts to platform's own origins.
**Severity:** Medium

## TC-PUBLISH-PREVIEW-PROXY-033
**Title:** Preview proxy supports POST forms
**Pre:** Dev server has form
**Steps:**
1. Submit form through preview
**Expected:** Form posted to backend; response served back through proxy. Cookies preserved.
**Severity:** Low

## TC-PUBLISH-PREVIEW-PROXY-034
**Title:** Preview proxy 'connection: upgrade' detected case-insensitively
**Pre:** WS request with lowercased header
**Steps:**
1. WS upgrade
**Expected:** Upgrade succeeds; server doesn't 400 on case differences.
**Severity:** Low

## TC-PUBLISH-PREVIEW-PROXY-035
**Title:** Preview proxy network-egress sandbox respected
**Pre:** Project policy denies external network
**Steps:**
1. Dev code fetches external URL
**Expected:** Backend (sandbox) blocks egress; preview shows error in console; no leak to attacker server.
**Severity:** Critical
