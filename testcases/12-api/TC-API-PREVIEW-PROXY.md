# TC-API-PREVIEW-PROXY — preview reverse-proxy

Mounted at `/` (`services/api/src/routes.ts:57`). Source: `services/api/src/routes/preview-proxy.ts`. Forwards `/preview/:projectId/*` to the project's Vite dev server.

---

## TC-API-PP-001 — GET /preview/:projectId/ 200 happy path
- **Pre:** Dev server running.
- **Expected:** 200 HTML; `Content-Type: text/html`.
- **Severity:** smoke

## TC-API-PP-002 — GET when dev server stopped → 502/503
- **Expected:** 502/503 maintenance page.
- **Severity:** high

## TC-API-PP-003 — GET projectId not UUID → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-PP-004 — GET projectId not found → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-PP-005 — Path traversal `/preview/:id/../etc/passwd` → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-PP-006 — Long path 4000 chars → 414/400
- **Expected:** 414/400.
- **Severity:** medium

## TC-API-PP-007 — WebSocket upgrade for HMR
- **Steps:** Upgrade `/preview/:id/__hmr` connection.
- **Expected:** 101 Switching Protocols.
- **Severity:** smoke

## TC-API-PP-008 — Sub-resource forwarded (CSS/JS)
- **Steps:** GET `/preview/:id/src/main.tsx`.
- **Expected:** 200 with JS Content-Type.
- **Severity:** smoke

## TC-API-PP-009 — Cross-project leak: projectId mismatch
- **Steps:** Try fetching A's path while logged in as user with no access.
- **Expected:** Documented; preview is by URL only — auth not required.
- **Severity:** smoke

## TC-API-PP-010 — Header CRLF in Host → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-PP-011 — Slow upstream → 504
- **Pre:** Dev server hung.
- **Expected:** 504 within timeout.
- **Severity:** high

## TC-API-PP-012 — Streaming response forwarded
- **Steps:** Upstream emits chunked.
- **Expected:** Client sees chunks.
- **Severity:** medium

## TC-API-PP-013 — Body upload (POST) forwarded
- **Steps:** POST file via fetch in app.
- **Expected:** Forwarded; status reflects upstream.
- **Severity:** medium

## TC-API-PP-014 — 5MB upload through proxy
- **Expected:** Upstream receives full body or 413 if capped.
- **Severity:** medium

## TC-API-PP-015 — Wrong method TRACE → 405/400
- **Expected:** 405/400.
- **Severity:** low

## TC-API-PP-016 — CORS preflight forwarded to upstream
- **Expected:** Upstream's CORS headers reflected.
- **Severity:** medium

## TC-API-PP-017 — Auth headers stripped or forwarded?
- **Steps:** Send Authorization to /preview path.
- **Expected:** Document — typically stripped.
- **Severity:** medium

## TC-API-PP-018 — `X-Forwarded-For` header populated
- **Expected:** Upstream sees client IP.
- **Severity:** low

## TC-API-PP-019 — Concurrent connections (>20) limited per project
- **Expected:** Caps with 503 after threshold.
- **Severity:** medium

## TC-API-PP-020 — Path with query string forwarded
- **Steps:** `/preview/:id/?foo=bar`.
- **Expected:** 200; query reaches upstream.
- **Severity:** medium

## TC-API-PP-021 — Project archived → 403
- **Expected:** 403 maintenance.
- **Severity:** medium

## TC-API-PP-022 — Project not started → server auto-starts or 503
- **Expected:** Document behavior.
- **Severity:** medium

## TC-API-PP-023 — Server error during proxy → 502 JSON or HTML
- **Expected:** 502.
- **Severity:** high
