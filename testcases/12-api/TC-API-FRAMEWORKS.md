# TC-API-FRAMEWORKS — public framework catalog

Mounted at `/` (`services/api/src/routes.ts:113`). Source: `services/api/src/routes/admin-frameworks.ts` (public part).

Endpoints:
- `GET /frameworks`           — public list of enabled frameworks

---

## TC-API-FW-001 — GET /frameworks 200 public (no auth)
- **Expected:** 200 list of enabled frameworks for current platform.
- **Severity:** smoke

## TC-API-FW-002 — Reflects admin disable
- **Pre:** Admin disabled `next-app`.
- **Steps:** GET.
- **Expected:** `next-app` not in list.
- **Severity:** high

## TC-API-FW-003 — Wrong method POST → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-FW-004 — Cache-Control set
- **Expected:** ETag or Cache-Control present.
- **Severity:** medium

## TC-API-FW-005 — Server error returns JSON
- **Expected:** 500 JSON.
- **Severity:** medium

## TC-API-FW-006 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-FW-007 — Header CRLF → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-FW-008 — Long URL → 414
- **Expected:** 414.
- **Severity:** low
