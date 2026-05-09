# TC-API-PLAN — /plan route group

Mounted at `/` (`services/api/src/routes.ts:73`). Source: `services/api/src/routes/plan.ts`.

Endpoints (representative):
- `GET    /plan/limits`                   — current user's plan limits
- `GET    /plan/usage`
- `POST   /plan/upgrade`                  — initiate upgrade
- `GET    /plan/features`

---

## TC-API-PLAN-001 — GET /plan/limits 200
- **Expected:** 200 `{maxProjects, maxIntegrations, maxSeats, ...}`.
- **Severity:** smoke

## TC-API-PLAN-002 — GET /plan/limits 401
- **Expected:** 401.
- **Severity:** smoke

## TC-API-PLAN-003 — GET /plan/usage 200
- **Expected:** 200 used/total.
- **Severity:** smoke

## TC-API-PLAN-004 — GET /plan/features 200
- **Expected:** 200 feature flags by plan.
- **Severity:** medium

## TC-API-PLAN-005 — POST /plan/upgrade 200 redirect
- **Steps:** POST `{plan:"pro"}`.
- **Expected:** 200 with checkout URL.
- **Severity:** smoke

## TC-API-PLAN-006 — POST upgrade unknown plan → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-PLAN-007 — POST upgrade same plan → 409
- **Expected:** 409.
- **Severity:** medium

## TC-API-PLAN-008 — Path SQL injection
- **Expected:** 400.
- **Severity:** smoke

## TC-API-PLAN-009 — Wrong method PATCH → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-PLAN-010 — Body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-PLAN-011 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-PLAN-012 — Header CRLF → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-PLAN-013 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-PLAN-014 — Server error returns JSON
- **Expected:** 500.
- **Severity:** medium
