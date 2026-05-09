# TC-API-HEALTH — Health & readiness probe endpoints

Routes under test (mounted at `/health`):
- `GET /health/` — full status incl. DB latency, memory, dev servers
- `GET /health/live` — liveness probe (no DB)
- `GET /health/ready` — readiness probe (DB-dependent)

Source: `services/api/src/routes/health.ts`. Mounted at `app.route("/health", healthRoutes)` in `services/api/src/routes.ts:51`.

Standard error envelope: `{"error":"<msg>"}`. No auth required on this group.

---

## TC-API-HEALTH-001 — GET /health 200 happy path
- **Pre:** API running, DB reachable.
- **Steps:** `curl -i https://staging-api.doable.me/health/`
- **Expected:** 200; body `{status:"healthy", timestamp:ISO8601, version, uptime:number, checks:{database:{status:"up", latencyMs:number}, memory:{rssBytes,heapUsedBytes,heapTotalBytes}, devServers:{active:number}}}`. `Content-Type: application/json; charset=UTF-8`.
- **Severity:** smoke

## TC-API-HEALTH-002 — GET /health DB unreachable → 503
- **Pre:** Stop PostgreSQL or block port 5432 with iptables.
- **Steps:** `GET /health/`
- **Expected:** 503; `status:"degraded"`, `checks.database.status:"down"`. Service stays up.
- **Severity:** high

## TC-API-HEALTH-003 — GET /health no auth required
- **Steps:** `GET /health/` with no `Authorization` header.
- **Expected:** 200 (auth not enforced).
- **Severity:** smoke

## TC-API-HEALTH-004 — GET /health with bogus Authorization
- **Steps:** `GET /health/` with `Authorization: Bearer junk`.
- **Expected:** 200; bogus header ignored.
- **Severity:** low

## TC-API-HEALTH-005 — GET /health/live always 200
- **Pre:** Even if DB is down.
- **Steps:** `GET /health/live`
- **Expected:** 200 `{status:"alive"}`.
- **Severity:** smoke

## TC-API-HEALTH-006 — GET /health/live with DB down
- **Pre:** Pause/Stop DB.
- **Steps:** `GET /health/live`
- **Expected:** 200 — liveness must not depend on DB.
- **Severity:** high

## TC-API-HEALTH-007 — GET /health/ready DB up → 200
- **Steps:** `GET /health/ready`
- **Expected:** 200 `{status:"ready"}`.
- **Severity:** smoke

## TC-API-HEALTH-008 — GET /health/ready DB down → 503
- **Pre:** Stop DB.
- **Steps:** `GET /health/ready`
- **Expected:** 503 `{status:"not ready", reason:"database unavailable"}`.
- **Severity:** high

## TC-API-HEALTH-009 — POST /health → 404 or 405
- **Steps:** `POST /health/` with empty body.
- **Expected:** 404 (Hono returns 404 for unmatched method on this route), or 405 if globally configured. Record actual.
- **Severity:** medium

## TC-API-HEALTH-010 — PUT /health/live → 404
- **Steps:** `PUT /health/live`
- **Expected:** 404.
- **Severity:** low

## TC-API-HEALTH-011 — DELETE /health/ready → 404
- **Steps:** `DELETE /health/ready`
- **Expected:** 404.
- **Severity:** low

## TC-API-HEALTH-012 — HEAD /health → 200 with no body
- **Steps:** `curl -I /health/`
- **Expected:** 200, headers only, no body. (Hono auto-handles HEAD for GET routes.)
- **Severity:** medium

## TC-API-HEALTH-013 — OPTIONS /health (CORS preflight)
- **Steps:** `OPTIONS /health/` with `Origin: https://staging.doable.me`, `Access-Control-Request-Method: GET`.
- **Expected:** 204 with `Access-Control-Allow-Origin` reflecting allowed origin.
- **Severity:** medium

## TC-API-HEALTH-014 — OPTIONS /health from disallowed origin
- **Steps:** `OPTIONS /health/` with `Origin: https://evil.example.com`.
- **Expected:** No `Access-Control-Allow-Origin` header (or 403 depending on cors middleware config).
- **Severity:** high

## TC-API-HEALTH-015 — Trailing slash variant `/health` vs `/health/`
- **Steps:** `GET /health` (no trailing slash) and `GET /health/` (with).
- **Expected:** Both return 200; record any redirect or 404 difference.
- **Severity:** medium

## TC-API-HEALTH-016 — Query string ignored on /health
- **Steps:** `GET /health/?ignore=me&debug=1`
- **Expected:** 200, identical body to plain GET.
- **Severity:** low

## TC-API-HEALTH-017 — Path parameter not allowed
- **Steps:** `GET /health/extra-path`
- **Expected:** 404 — only `/`, `/live`, `/ready` mounted.
- **Severity:** low

## TC-API-HEALTH-018 — Very long URL on /health
- **Steps:** `GET /health/?q=` followed by 8000 chars of `A`.
- **Expected:** Either 200 (server tolerates long URL) or 414 URI Too Long. Record.
- **Severity:** medium

## TC-API-HEALTH-019 — Header injection via custom header
- **Steps:** `GET /health/` with `X-Custom: foo\r\nX-Inject: bar`.
- **Expected:** Server rejects or sanitises CRLF; response should not include `X-Inject`.
- **Severity:** high

## TC-API-HEALTH-020 — devServers.active reflects running projects
- **Pre:** Start 2 dev servers via `/projects/:id/start`.
- **Steps:** `GET /health/`
- **Expected:** `checks.devServers.active >= 2`.
- **Severity:** medium

## TC-API-HEALTH-021 — Memory checks present and numeric
- **Steps:** `GET /health/`
- **Expected:** `checks.memory.rssBytes`, `heapUsedBytes`, `heapTotalBytes` all integers > 0.
- **Severity:** low

## TC-API-HEALTH-022 — Latency reasonable
- **Steps:** `GET /health/` ten times.
- **Expected:** `checks.database.latencyMs` < 500 in healthy state.
- **Severity:** medium

## TC-API-HEALTH-023 — Version field present
- **Steps:** `GET /health/`
- **Expected:** `version` is non-empty string. If `npm_package_version` not set, defaults to `"0.1.0"`.
- **Severity:** low

## TC-API-HEALTH-024 — Uptime increases monotonically
- **Steps:** Two `GET /health/` calls 5s apart.
- **Expected:** Second `uptime` >= first + ~5.
- **Severity:** low

## TC-API-HEALTH-025 — Timestamp is valid ISO8601
- **Steps:** `GET /health/`
- **Expected:** `Date.parse(timestamp)` returns a finite number.
- **Severity:** low

## TC-API-HEALTH-026 — Content-Length header present
- **Steps:** `curl -i /health/`
- **Expected:** Either `Content-Length` or `Transfer-Encoding: chunked`.
- **Severity:** low

## TC-API-HEALTH-027 — Concurrent /health hits do not crash
- **Steps:** `ab -c 50 -n 500 https://staging-api.doable.me/health/`.
- **Expected:** No 5xx responses.
- **Severity:** medium

## TC-API-HEALTH-028 — Slow DB (>1s) reflected in latencyMs
- **Pre:** Inject a `pg_sleep(2)` via fault injection or VPC throttle.
- **Steps:** `GET /health/`
- **Expected:** `latencyMs >= 2000`, status still 200 (still "up").
- **Severity:** medium

## TC-API-HEALTH-029 — DB crash mid-request → still returns JSON
- **Pre:** Kill DB while request in flight.
- **Steps:** `GET /health/`
- **Expected:** 503 with valid JSON, no HTML stack trace.
- **Severity:** high

## TC-API-HEALTH-030 — XSS attempt in query (no echo)
- **Steps:** `GET /health/?<script>alert(1)</script>`
- **Expected:** 200; query never reflected in body.
- **Severity:** medium

## TC-API-HEALTH-031 — SQL injection in query
- **Steps:** `GET /health/?id=1' OR '1=1`
- **Expected:** 200; query ignored.
- **Severity:** medium

## TC-API-HEALTH-032 — Body sent on GET ignored
- **Steps:** `GET /health/` with body `{"x":1}` and `Content-Type: application/json`.
- **Expected:** 200; body ignored.
- **Severity:** low
