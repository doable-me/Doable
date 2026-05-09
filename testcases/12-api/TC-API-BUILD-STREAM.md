# TC-API-BUILD-STREAM — /projects/:id/build-events SSE

Mounted at `/` (`services/api/src/routes.ts:66`). Source: `services/api/src/routes/build-stream.ts`. Per PRD 03 §4.3 — per-project build-event SSE stream.

Endpoint:
- `GET /projects/:id/build-events`               — SSE
- `GET /projects/:id/build-events/replay`        — replay buffered events

---

## TC-API-BS-001 — GET /build-events 200 text/event-stream
- **Expected:** 200; `Content-Type: text/event-stream`; keep-alive comments.
- **Severity:** smoke

## TC-API-BS-002 — GET 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-BS-003 — GET other project → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-BS-004 — Last-Event-Id resumes from id+1
- **Steps:** Disconnect; reconnect with header.
- **Expected:** Replay missed events.
- **Severity:** medium

## TC-API-BS-005 — Slow client back-pressure handled
- **Steps:** Pause reading 30s.
- **Expected:** Server buffers up to limit then drops oldest, or closes with too-slow.
- **Severity:** medium

## TC-API-BS-006 — Path SQL injection on :id
- **Expected:** 400.
- **Severity:** smoke

## TC-API-BS-007 — Wrong method POST → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-BS-008 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-BS-009 — Concurrent SSE clients on same project (>50)
- **Expected:** Caps; new clients 429/503.
- **Severity:** medium

## TC-API-BS-010 — Server error mid-stream emits `event:error` then closes
- **Pre:** DB drop.
- **Expected:** Error event observed.
- **Severity:** high

## TC-API-BS-011 — GET /build-events/replay 200
- **Expected:** 200 array of last N events.
- **Severity:** medium

## TC-API-BS-012 — Replay limit cap
- **Steps:** ?limit=10000.
- **Expected:** Capped (e.g. 200).
- **Severity:** medium

## TC-API-BS-013 — Header CRLF on Last-Event-Id → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-BS-014 — SSE `: ping` keep-alive every 15s
- **Expected:** Comments observed.
- **Severity:** medium

## TC-API-BS-015 — Project archived → 403
- **Expected:** 403 read-only allowed? document.
- **Severity:** medium
