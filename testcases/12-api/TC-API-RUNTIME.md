# TC-API-RUNTIME — /projects/:id/runtime + /workspaces/:wid/runtime

Mounted at `/` and `/workspaces` (`services/api/src/routes.ts:63-64`). Source: `services/api/src/routes/runtime.ts`.

Endpoints (representative — PRD 06 §4):
- `GET    /projects/:id/runtime/status`
- `POST   /projects/:id/runtime/start`
- `POST   /projects/:id/runtime/stop`
- `POST   /projects/:id/runtime/restart`
- `GET    /projects/:id/runtime/logs`
- `GET    /projects/:id/runtime/metrics`
- `GET    /workspaces/:wid/runtime/active`        — list active dev servers in workspace

---

## TC-API-RT-001 — GET /runtime/status 200 running
- **Expected:** 200 `{status:"running", pid, port, uptime}`.
- **Severity:** smoke

## TC-API-RT-002 — GET /runtime/status 200 stopped
- **Expected:** 200 `{status:"stopped"}`.
- **Severity:** smoke

## TC-API-RT-003 — GET /runtime/status 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-RT-004 — GET other project → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-RT-005 — POST /runtime/start 202
- **Expected:** 202; status flips to running shortly.
- **Severity:** smoke

## TC-API-RT-006 — POST start when already running → 200/409
- **Expected:** 200 idempotent or 409.
- **Severity:** medium

## TC-API-RT-007 — POST start by viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-RT-008 — POST start over concurrent dev-server cap → 429/503
- **Expected:** 429/503.
- **Severity:** medium

## TC-API-RT-009 — POST start framework not enabled → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-RT-010 — POST /runtime/stop 200
- **Expected:** 200.
- **Severity:** smoke

## TC-API-RT-011 — POST stop when stopped → 200/409
- **Expected:** Document.
- **Severity:** low

## TC-API-RT-012 — POST /runtime/restart 200
- **Expected:** 200; PID rotates.
- **Severity:** medium

## TC-API-RT-013 — GET /runtime/logs 200 SSE
- **Expected:** 200 with `text/event-stream`; SSE frames.
- **Severity:** smoke

## TC-API-RT-014 — GET logs without dev server running → 200 with empty stream or 404
- **Expected:** Document.
- **Severity:** medium

## TC-API-RT-015 — GET logs ?since=ISO 200
- **Expected:** 200 returning since timestamp.
- **Severity:** medium

## TC-API-RT-016 — GET logs ?level=error filtered
- **Expected:** 200 only error frames.
- **Severity:** medium

## TC-API-RT-017 — GET logs ?level=invalid → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-RT-018 — GET /runtime/metrics 200
- **Expected:** 200 `{cpu,mem,uptime}`.
- **Severity:** medium

## TC-API-RT-019 — GET /workspaces/:wid/runtime/active 200
- **Expected:** 200 list.
- **Severity:** medium

## TC-API-RT-020 — Path SQL injection
- **Expected:** 400.
- **Severity:** smoke

## TC-API-RT-021 — Wrong method PATCH /runtime/start → 405/404
- **Expected:** 405/404.
- **Severity:** low

## TC-API-RT-022 — Body 5MB on POST start → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-RT-023 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-RT-024 — Header CRLF → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-RT-025 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-RT-026 — Server error during start → 500 JSON
- **Pre:** Force fork error.
- **Expected:** 500 JSON.
- **Severity:** high

## TC-API-RT-027 — Idempotency-Key on POST start → single process
- **Expected:** One PID.
- **Severity:** medium

## TC-API-RT-028 — Concurrent restarts → 409 or queued
- **Steps:** Two restarts in flight.
- **Expected:** 409 or queued.
- **Severity:** high

## TC-API-RT-029 — Filter logs ?level × since × source matrix
- **Expected:** Correct subsets.
- **Severity:** medium
