# TC-API-SECURITY — /projects/:id/security audit endpoints

Mounted at `/projects` (`services/api/src/routes.ts:95`). Source: `services/api/src/routes/security.ts`.

Endpoints (representative):
- `GET    /projects/:id/security/findings`
- `GET    /projects/:id/security/findings/:fid`
- `POST   /projects/:id/security/scan`        — trigger scan
- `POST   /projects/:id/security/findings/:fid/dismiss`
- `POST   /projects/:id/security/findings/:fid/fix`

---

## TC-API-SEC-001 — GET /findings 200
- **Expected:** 200 list.
- **Severity:** smoke

## TC-API-SEC-002 — GET 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-SEC-003 — GET other project → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-SEC-004 — GET filter ?severity=high
- **Expected:** 200 filtered.
- **Severity:** medium

## TC-API-SEC-005 — GET filter invalid severity → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-SEC-006 — POST /scan 202
- **Expected:** 202 queued.
- **Severity:** smoke

## TC-API-SEC-007 — POST /scan over rate → 429
- **Expected:** 429 if more than 1/min.
- **Severity:** medium

## TC-API-SEC-008 — POST /scan by viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-SEC-009 — POST dismiss 200
- **Expected:** 200; finding marked dismissed.
- **Severity:** medium

## TC-API-SEC-010 — POST dismiss already dismissed → 409
- **Expected:** 409.
- **Severity:** low

## TC-API-SEC-011 — POST fix 202
- **Expected:** 202; auto-fix queued.
- **Severity:** medium

## TC-API-SEC-012 — POST fix unfixable finding → 400
- **Expected:** 400 with reason.
- **Severity:** medium

## TC-API-SEC-013 — Path SQL injection
- **Expected:** 400.
- **Severity:** smoke

## TC-API-SEC-014 — Wrong method PATCH → 405/404
- **Expected:** 405/404.
- **Severity:** low

## TC-API-SEC-015 — Body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-SEC-016 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-SEC-017 — Header CRLF → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-SEC-018 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-SEC-019 — Server error returns JSON
- **Expected:** 500.
- **Severity:** medium

## TC-API-SEC-020 — Pagination cursor edges
- **Expected:** Empty/end correct.
- **Severity:** medium

## TC-API-SEC-021 — Filter combo (severity × status × tool)
- **Expected:** Correct subsets.
- **Severity:** medium
