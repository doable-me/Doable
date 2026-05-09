# TC-API-USAGE — /workspaces/:wid/usage

Mounted at `/workspaces` (`services/api/src/routes.ts:80`). Source: `services/api/src/routes/usage.ts`.

Endpoints (representative):
- `GET    /workspaces/:wid/usage`                       — credits + token usage summary
- `GET    /workspaces/:wid/usage/breakdown`             — by provider/model
- `GET    /workspaces/:wid/usage/timeseries`            — daily usage
- `GET    /workspaces/:wid/usage/users`                 — per-user usage

---

## TC-API-USE-001 — GET /usage 200
- **Expected:** 200 `{credits, tokens, byProvider, ...}`.
- **Severity:** smoke

## TC-API-USE-002 — GET 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-USE-003 — GET non-member → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-USE-004 — GET breakdown 200
- **Expected:** 200 grouped by provider/model.
- **Severity:** medium

## TC-API-USE-005 — GET timeseries ?range=30d
- **Expected:** 200 daily buckets.
- **Severity:** medium

## TC-API-USE-006 — GET timeseries invalid range → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-USE-007 — GET users 200
- **Expected:** 200 per-user list (admins only typically).
- **Severity:** medium

## TC-API-USE-008 — GET users by viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-USE-009 — Path SQL injection
- **Expected:** 400.
- **Severity:** smoke

## TC-API-USE-010 — Wrong method PATCH → 405/404
- **Expected:** 405/404.
- **Severity:** low

## TC-API-USE-011 — Filter combo (range × provider × user) matrix
- **Expected:** Correct subsets.
- **Severity:** medium

## TC-API-USE-012 — Pagination cursor edges
- **Expected:** Empty/end correct.
- **Severity:** medium

## TC-API-USE-013 — Server error returns JSON
- **Expected:** 500.
- **Severity:** medium

## TC-API-USE-014 — Header CRLF → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-USE-015 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke
