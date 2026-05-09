# TC-API-ARTIFACTS — /artifacts route group

Mounted at `/artifacts` (`services/api/src/routes.ts:52`). Source: `services/api/src/routes/artifacts.ts`.

Endpoints (representative):
- `GET    /artifacts/:projectId`
- `GET    /artifacts/:projectId/:filename`
- `POST   /artifacts/:projectId`           — upload artifact
- `DELETE /artifacts/:projectId/:filename`

---

## TC-API-ART-001 — GET 200 list
- **Expected:** 200 list.
- **Severity:** smoke

## TC-API-ART-002 — GET single 200 with binary content-type
- **Expected:** 200; appropriate `Content-Type`.
- **Severity:** smoke

## TC-API-ART-003 — GET single non-existent → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-ART-004 — POST upload 201
- **Steps:** multipart/form-data.
- **Expected:** 201.
- **Severity:** smoke

## TC-API-ART-005 — POST upload too large → 413
- **Expected:** 413.
- **Severity:** high

## TC-API-ART-006 — POST forbidden file type (.exe) → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-ART-007 — POST upload by viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-ART-008 — DELETE 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-ART-009 — Path traversal in filename → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-ART-010 — Long filename (256+) → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-ART-011 — Wrong method PATCH → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-ART-012 — Wrong content-type for upload → 415
- **Expected:** 415.
- **Severity:** medium

## TC-API-ART-013 — Header CRLF → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-ART-014 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-ART-015 — Server error returns JSON
- **Expected:** 500.
- **Severity:** medium
