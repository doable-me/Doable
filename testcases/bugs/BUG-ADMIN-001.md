# BUG-ADMIN-001 — Multiple admin & platform endpoints return 404 on <env>

**Severity:** P0 (admin surface partially missing)
**Target:** https://<env>-api.doable.me
**Date:** 2026-05-10
**Discovered by:** autonomous QA executor (admin sweep)

## Summary
The <env> API is missing several admin-surface and platform endpoints listed in our TC corpus. Routes that DO exist live under `/admin/*` (no `/api` prefix). The following expected paths return `404 Not Found`:

| Route | Test corpus expects | Actual |
|---|---|---|
| `/admin` (or `/admin/dashboard`) | 200 dashboard JSON | 404 |
| `/admin/audit` (root list) | 200 list of activity_events | 404 (only `/admin/audit/actions` exists) |
| `/admin/chat` | 200 ai_sessions list | 404 |
| `/admin/runtime` | 200 systemd/pool overview | 404 |
| `/admin/feature-flags` | 200 flag list | 404 |
| `/admin/moderation` | 200 moderation queue | 404 |
| `/admin/trace` | 200 OTel waterfall | 404 |
| `/admin/impersonate` | 200/POST start | 404 |
| `/admin/users/<uuid>` (single-user detail) | 200 single user | 404 (only collection works) |
| `/notifications`, `/api/notifications`, `/v1/notifications` | 200 list | 404 |
| `/analytics/dashboard`, `/analytics/page-views`, `/analytics/events` | 200 metrics | 404 |
| `/runtime/capacity` | 200 capacity counts | 404 |

## Routes that ARE present and work
- `GET /admin/projects` (filters: `q`, `status`, `limit`) — 200 ✓
- `GET /admin/users` (collection) — 200 ✓
- `GET /admin/dev-servers` — 200 ✓
- `GET /admin/plan-limits` — 200 ✓
- `GET /admin/audit/actions` (admin_audit_log search; supports `action`, `limit`) — 200 ✓
- `GET /auth/me` — 200 ✓

## RBAC verification (PASSING)
For every existing admin route, qa-member (is_platform_admin=false) correctly receives `403`, qa-owner (is_platform_admin=true) gets `200`, corrupt JWT gets `401`, and missing Authorization gets `401 {"error":"Missing or invalid Authorization header"}`. The `platformAdminMiddleware` guard appears solid where routes exist.

## Implication for the test corpus
The 10-admin TCs (Chat/Runtime/Moderation/Feature-Flags/Trace/Impersonation), 22-notifications, 25-runtime (`/runtime/capacity`), and 26-analytics test cases are unrunnable on this build because the routes have not shipped. Either:
1. The features genuinely have not landed on <env> yet, or
2. They moved to a different prefix that QA hasn't been told about.

## Server-side baseline (from SSH probe)
- `doable.service`, `caddy.service`, `cloudflared.service`, `postgresql@16-main.service` all `loaded active running`.
- `ss -tlnp` confirms all app sockets bind 127.0.0.1 (caddy:8080, postgres:5432, squid:3128, cloudflared:20241). Security baseline OK.

## Next actions
- Confirm with platform team whether the 404 endpoints are intentionally not deployed to <env> or pending PRD work.
- Once routes are restored, re-run TC-ADMIN-CHAT-*, TC-ADMIN-RUNTIME-*, TC-ADMIN-MODERATION-*, TC-ADMIN-FF-*, TC-ADMIN-TRACE-*, TC-ADMIN-IMP-*, TC-NOTIF-*, TC-ANALYTICS-*, and TC-RUNTIME-CAP-*.
- Update `_INDEX.md` for 22-notifications / 26-analytics / 25-runtime if these are deferred features (mark NOT-YET-IMPL).

## Evidence
- `testcases/evidence/<env>/admin/TC-ADMIN-*.body` (route-discovery + RBAC)
- `testcases/99-runlog/<env>/RUN-2026-05-10-ADMIN.md`
