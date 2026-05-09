# BUG-CORPUS-AN-001 — /analytics/* endpoints not implemented (404)

**Severity:** medium (gap — features documented in TCs but no API surface)
**Env:** env1 / zantaz (`https://zantaz-api.doable.me`)
**Found by:** corpus-16-26 runner, RUN-CORPUS-16-26 (2026-05-09)

## Repro
```
GET /analytics/events
GET /analytics/dashboard
GET /analytics/page-views
GET /analytics/retention
Authorization: Bearer <qa-owner>
```

## Actual
All four return HTTP 404 — `{"error":"Not Found","path":"/analytics/..."}`.

Anonymous calls return 401 (request hits auth middleware before reaching route table) — this is incidentally consistent with TC-ANALYTICS-EVENTS-anon (PASS).

## Expected (per testcases/26-analytics)
- `TC-ANALYTICS-EVENTS-001` — server writes/returns `analytics_events` rows.
- `TC-ANALYTICS-DASHBOARD-001` — dashboard data for workspace owner.
- `TC-ANALYTICS-PAGE-VIEWS-001` — published-site page view aggregates.
- `TC-ANALYTICS-RETENTION-001` — DAU/WAU/MAU retention curves.

## Analysis
No `analytics` route module exists at `services/api/src/routes/analytics*.ts`. The corpus runner already filed `BUG-CORPUS-VERSIONS-001` for similar gaps. This is the analytics counterpart.

The TCs themselves are author-spec-aspirational, not regression. The product decision to defer is fine, but the TCs should be marked `BLOCKED — feature not built` or moved to `prd/` until shipped, otherwise the corpus runner keeps re-finding them.

## Fix recommendation
Either:
1. Implement minimal `services/api/src/routes/analytics.ts` with the four GETs above gated by `authMiddleware` and workspace-membership; or
2. Add `> Status: NOT IMPLEMENTED — see PRD <link>` to each `26-analytics/*` TC head so the runner skips them as `INFO` rather than `FAIL`.

## Evidence
- `testcases/evidence/env1/TC-ANALYTICS-EVENTS-001.body` (404)
- `testcases/evidence/env1/TC-ANALYTICS-DASHBOARD-001.body` (404)
- `testcases/evidence/env1/TC-ANALYTICS-PV-001.body` (404)
- `testcases/evidence/env1/TC-ANALYTICS-RETENTION-001.body` (404)
