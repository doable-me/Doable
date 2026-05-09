# TC-API-INTERNAL — /internal endpoints

Mounted at `/internal` (`services/api/src/routes.ts:53`). Source: `services/api/src/routes/internal.ts`. Auth via `X-Internal-Secret`.

Endpoints (representative):
- `GET    /internal/health`
- `POST   /internal/notifications/send`
- `POST   /internal/build/event`
- `POST   /internal/team-chat/broadcast`
- `POST   /internal/runtime/restart`
- `POST   /internal/audit`

---

## TC-API-INT-001 — GET /internal/health correct secret 200
- **Expected:** 200.
- **Severity:** smoke

## TC-API-INT-002 — GET /internal/health no secret → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-INT-003 — Wrong secret → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-INT-004 — Empty secret → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-INT-005 — Constant-time compare for secret
- **Steps:** Vary by single byte; measure timing.
- **Expected:** No measurable timing leak (advisory).
- **Severity:** medium

## TC-API-INT-006 — POST /internal/notifications/send 200
- **Steps:** POST `{userId, payload}` with secret.
- **Expected:** 200; queued.
- **Severity:** medium

## TC-API-INT-007 — POST /internal/build/event 200
- **Expected:** 200; SSE bus broadcasts.
- **Severity:** smoke

## TC-API-INT-008 — POST /internal endpoint never reachable from public Cloudflare
- **Steps:** Curl from public IP.
- **Expected:** Document; tunnel only? secret only? — verify.
- **Severity:** smoke

## TC-API-INT-009 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-INT-010 — Body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-INT-011 — Header CRLF on X-Internal-Secret → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-INT-012 — Wrong method PATCH → 405/404
- **Expected:** 405/404.
- **Severity:** low

## TC-API-INT-013 — Path SQL injection
- **Expected:** 400.
- **Severity:** smoke

## TC-API-INT-014 — Server error returns JSON
- **Expected:** 500 JSON.
- **Severity:** medium

## TC-API-INT-015 — Public Authorization header ignored on internal
- **Steps:** Send Bearer plus X-Internal-Secret.
- **Expected:** Auth path uses secret.
- **Severity:** smoke
