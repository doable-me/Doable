# TC-API-ANALYTICS — /analytics

Mounted at `/analytics` (`services/api/src/routes.ts:91`). Source: `services/api/src/routes/analytics/dashboard.ts` and `routes/analytics/tracking.ts`.

> CORRECTED 2026-05-10 (env1 verified): the dashboard reads are `project**s**` plural and `pageviews` (single word, no dash). Old listing was wrong on both counts.

Dashboard endpoints (auth required):
- `GET    /analytics/projects/:id/overview`
- `GET    /analytics/projects/:id/timeseries`
- `GET    /analytics/projects/:id/pageviews`
- `GET    /analytics/projects/:id/events`
- `GET    /analytics/projects/:id/pages`
- `GET    /analytics/projects/:id/referrers`
- `GET    /analytics/projects/:id/devices`
- `GET    /analytics/projects/:id/browsers`
- `GET    /analytics/projects/:id/os`
- `GET    /analytics/projects/:id/realtime`
- `GET    /analytics/projects/:id/settings`

Tracking (public):
- `GET    /analytics/script.js`
- `POST   /analytics/track`
- `GET    /analytics/funnels/:id`

---

## TC-API-ANA-001 — GET overview 200 (admin/owner)
- **Expected:** 200.
- **Severity:** smoke

## TC-API-ANA-002 — GET overview 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-ANA-003 — GET overview viewer → 200/403 (record permissions)
- **Expected:** Document.
- **Severity:** medium

## TC-API-ANA-004 — GET projects ?since=ISO 200
- **Expected:** 200 deltas.
- **Severity:** medium

## TC-API-ANA-005 — GET projects ?since=invalid → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-ANA-006 — GET usage 200
- **Expected:** 200 credit usage.
- **Severity:** medium

## TC-API-ANA-007 — GET project views 200
- **Expected:** 200 timeseries.
- **Severity:** medium

## TC-API-ANA-008 — GET views ?range=30d granularity
- **Expected:** 200.
- **Severity:** medium

## TC-API-ANA-009 — POST /analytics/track public 200
- **Steps:** POST `{event:"page_view", projectId, sessionId}`.
- **Expected:** 200; event ingested.
- **Severity:** smoke

## TC-API-ANA-010 — POST track without projectId → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-ANA-011 — POST track invalid event name → 400
- **Steps:** event "_internal".
- **Expected:** 400.
- **Severity:** medium

## TC-API-ANA-012 — POST track 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-ANA-013 — POST track rate limit (high)
- **Expected:** 429 after threshold.
- **Severity:** high

## TC-API-ANA-014 — Path SQL injection
- **Expected:** 400.
- **Severity:** smoke

## TC-API-ANA-015 — Wrong method PATCH → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-ANA-016 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-ANA-017 — Header CRLF → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-ANA-018 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-ANA-019 — Cross-tenant: caller asks for another workspace's wid
- **Expected:** 403/404.
- **Severity:** smoke

## TC-API-ANA-020 — Server error returns JSON
- **Expected:** 500 JSON.
- **Severity:** medium

## TC-API-ANA-021 — Filter combination (workspaceId × range × granularity)
- **Expected:** Correct subsets.
- **Severity:** medium

## TC-API-ANA-022 — Pagination cursor edges on /projects
- **Expected:** Empty/end correct.
- **Severity:** medium

## TC-API-ANA-023 — XSS in track properties stored sanitized
- **Steps:** properties.title `<script>...`.
- **Expected:** 200; rendering escapes.
- **Severity:** smoke
