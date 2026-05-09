# TC-API-THUMBNAILS — /thumbnails

Mounted at `/thumbnails` (`services/api/src/routes.ts:89`). Source: `services/api/src/routes/thumbnails.ts`.

Endpoints:
- `GET    /thumbnails/:projectId`
- `GET    /thumbnails/:projectId/:size`           — small/medium/large
- `POST   /thumbnails/:projectId/regenerate`
- `DELETE /thumbnails/:projectId`

---

## TC-API-THUMB-001 — GET 200 PNG
- **Expected:** 200 `image/png`.
- **Severity:** smoke

## TC-API-THUMB-002 — GET unknown project → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-THUMB-003 — GET when not yet generated → 404 or default placeholder
- **Expected:** Document.
- **Severity:** medium

## TC-API-THUMB-004 — GET size variants `small`, `medium`, `large` 200
- **Expected:** 200 each.
- **Severity:** medium

## TC-API-THUMB-005 — GET unknown size → 400
- **Steps:** size "ginormous".
- **Expected:** 400.
- **Severity:** high

## TC-API-THUMB-006 — Caching headers (`ETag`, `Cache-Control`)
- **Expected:** Present.
- **Severity:** medium

## TC-API-THUMB-007 — Conditional GET If-None-Match → 304
- **Expected:** 304.
- **Severity:** medium

## TC-API-THUMB-008 — POST regenerate 202
- **Expected:** 202; thumbnail re-rendered async.
- **Severity:** medium

## TC-API-THUMB-009 — POST regenerate 401
- **Expected:** 401.
- **Severity:** smoke

## TC-API-THUMB-010 — POST regenerate viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-THUMB-011 — POST regenerate when project unbuildable → 422
- **Expected:** 422 with reason.
- **Severity:** medium

## TC-API-THUMB-012 — DELETE 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-THUMB-013 — Path SQL injection
- **Expected:** 400.
- **Severity:** smoke

## TC-API-THUMB-014 — Wrong method PATCH → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-THUMB-015 — Header CRLF → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-THUMB-016 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-THUMB-017 — Public access for shared projects
- **Steps:** GET without auth on a publicly-shared project.
- **Expected:** 200 if public; 401 otherwise.
- **Severity:** medium

## TC-API-THUMB-018 — Server error during generate → 500
- **Pre:** Force puppeteer crash.
- **Expected:** 500 JSON.
- **Severity:** high
