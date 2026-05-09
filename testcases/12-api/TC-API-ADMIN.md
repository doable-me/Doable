# TC-API-ADMIN — /admin route group

Mounted at `/admin` (`services/api/src/routes.ts:91-94`). Source: `routes/admin.ts`, `routes/admin-*.ts`, `admin/trace-routes.ts`, `admin/audit-routes.ts`, `admin/tracing-control.ts`.

All admin routes require `users.is_platform_admin = true`.

Endpoints (representative):
- `GET    /admin/users`
- `PUT    /admin/users/:id`
- `DELETE /admin/users/:id`
- `POST   /admin/users/:id/reset-password`
- `GET    /admin/workspaces`
- `GET    /admin/projects`
- `GET    /admin/audit`
- `GET    /admin/audit/:id`
- `GET    /admin/traces`
- `GET    /admin/traces/:traceId`
- `POST   /admin/tracing/start` / `stop` / `status`
- `GET    /admin/plan-limits`
- `PUT    /admin/plan-limits/:plan`
- `GET    /admin/features` / `PUT /admin/features/:flag`
- `GET    /admin/frameworks`
- `PUT    /admin/frameworks/:id`
- `POST   /admin/email/send-test`
- `GET    /admin/ops/queue`
- `POST   /admin/tools/run/:tool`

---

## TC-API-ADMIN-001 — GET /admin/users 200 (admin)
- **Steps:** Auth as platform admin.
- **Expected:** 200 paginated users.
- **Severity:** smoke

## TC-API-ADMIN-002 — GET /admin/users 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-ADMIN-003 — GET /admin/users 403 non-admin
- **Steps:** Regular user token.
- **Expected:** 403 `{error:"Requires platform admin"}`.
- **Severity:** smoke

## TC-API-ADMIN-004 — GET /admin/users filter ?email=
- **Expected:** 200 matching subset.
- **Severity:** medium

## TC-API-ADMIN-005 — GET /admin/users pagination cursor
- **Expected:** 200.
- **Severity:** medium

## TC-API-ADMIN-006 — PUT /admin/users/:id 200
- **Steps:** Update displayName / role.
- **Expected:** 200.
- **Severity:** medium

## TC-API-ADMIN-007 — PUT /admin/users/:id with bad role → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-ADMIN-008 — PUT /admin/users/:id self-demote sole admin → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-ADMIN-009 — DELETE /admin/users/:id 204
- **Expected:** 204; user soft-deleted.
- **Severity:** high

## TC-API-ADMIN-010 — DELETE self → 400
- **Expected:** 400 cannot delete self.
- **Severity:** high

## TC-API-ADMIN-011 — POST /admin/users/:id/reset-password 200
- **Expected:** 200; reset email queued.
- **Severity:** medium

## TC-API-ADMIN-012 — GET /admin/workspaces 200
- **Expected:** 200 list.
- **Severity:** smoke

## TC-API-ADMIN-013 — GET /admin/workspaces filter ?plan=pro
- **Expected:** 200 filtered.
- **Severity:** medium

## TC-API-ADMIN-014 — GET /admin/projects 200
- **Expected:** 200.
- **Severity:** smoke

## TC-API-ADMIN-015 — GET /admin/projects filter ?archived=true
- **Expected:** 200 filtered.
- **Severity:** medium

## TC-API-ADMIN-016 — GET /admin/audit 200
- **Expected:** 200 audit log entries.
- **Severity:** high

## TC-API-ADMIN-017 — GET /admin/audit since=ISO
- **Expected:** 200 delta.
- **Severity:** medium

## TC-API-ADMIN-018 — GET /admin/audit invalid since → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-ADMIN-019 — GET /admin/audit/:id 200
- **Expected:** 200 detail.
- **Severity:** medium

## TC-API-ADMIN-020 — GET /admin/audit/:id non-existent → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-ADMIN-021 — GET /admin/traces 200
- **Expected:** 200; list of traces if tracing on.
- **Severity:** medium

## TC-API-ADMIN-022 — GET /admin/traces/:traceId 200
- **Expected:** 200 spans.
- **Severity:** medium

## TC-API-ADMIN-023 — POST /admin/tracing/start 200
- **Expected:** 200; status=on.
- **Severity:** medium

## TC-API-ADMIN-024 — POST /admin/tracing/stop 200
- **Expected:** 200; status=off.
- **Severity:** medium

## TC-API-ADMIN-025 — GET /admin/tracing/status 200
- **Expected:** 200.
- **Severity:** low

## TC-API-ADMIN-026 — GET /admin/plan-limits 200
- **Expected:** 200.
- **Severity:** smoke

## TC-API-ADMIN-027 — PUT /admin/plan-limits/:plan 200
- **Steps:** PUT `{maxProjects:50}`.
- **Expected:** 200.
- **Severity:** high

## TC-API-ADMIN-028 — PUT plan-limits invalid plan → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-ADMIN-029 — PUT plan-limits negative numbers → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-ADMIN-030 — GET /admin/features 200
- **Expected:** 200 flags.
- **Severity:** medium

## TC-API-ADMIN-031 — PUT /admin/features/:flag 200
- **Steps:** PUT `{enabled:true}`.
- **Expected:** 200.
- **Severity:** medium

## TC-API-ADMIN-032 — PUT features unknown flag → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-ADMIN-033 — GET /admin/frameworks 200
- **Expected:** 200 list with enabled flags.
- **Severity:** medium

## TC-API-ADMIN-034 — PUT /admin/frameworks/:id disable → 200
- **Expected:** 200; subsequent project create with that fw fails.
- **Severity:** high

## TC-API-ADMIN-035 — POST /admin/email/send-test 200
- **Steps:** POST `{to:"qa@doable.test", template:"welcome"}`.
- **Expected:** 200; email queued.
- **Severity:** medium

## TC-API-ADMIN-036 — POST email invalid template → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-ADMIN-037 — GET /admin/ops/queue 200
- **Expected:** 200 queue stats.
- **Severity:** medium

## TC-API-ADMIN-038 — POST /admin/tools/run/:tool 200
- **Expected:** 200 with execution log.
- **Severity:** high

## TC-API-ADMIN-039 — POST tools/run unknown tool → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-ADMIN-040 — Path SQL injection on /admin/users/:id
- **Expected:** 400.
- **Severity:** smoke

## TC-API-ADMIN-041 — Wrong method PATCH on /admin/audit → 405/404
- **Expected:** 405/404.
- **Severity:** low

## TC-API-ADMIN-042 — Body 5MB on PUT plan-limits → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-ADMIN-043 — Header CRLF injection
- **Expected:** 400.
- **Severity:** medium

## TC-API-ADMIN-044 — CORS preflight from staging.doable.me
- **Expected:** 204.
- **Severity:** smoke

## TC-API-ADMIN-045 — CORS from disallowed origin
- **Expected:** No allow header.
- **Severity:** smoke

## TC-API-ADMIN-046 — Idempotency-Key on PUT plan-limits
- **Expected:** Single update.
- **Severity:** medium

## TC-API-ADMIN-047 — Server error returns JSON envelope
- **Pre:** Force DB error.
- **Expected:** 500 JSON.
- **Severity:** medium

## TC-API-ADMIN-048 — Filter combo (role × email × archived)
- **Expected:** Correct subsets.
- **Severity:** medium

## TC-API-ADMIN-049 — Audit row never deletable
- **Steps:** DELETE /admin/audit/:id.
- **Expected:** 405/404 — audit immutable.
- **Severity:** smoke

## TC-API-ADMIN-050 — Token from non-admin sees zero rows on GET /audit (defence in depth)
- **Steps:** Non-admin token.
- **Expected:** 403 (not 200 with empty data).
- **Severity:** smoke

## TC-API-ADMIN-051 — Pagination cursor edges on /admin/users
- **Expected:** Empty/end correct.
- **Severity:** medium

## TC-API-ADMIN-052 — Limit cap on /admin/users
- **Steps:** ?limit=100000.
- **Expected:** Capped to e.g. 200.
- **Severity:** medium

## TC-API-ADMIN-053 — POST /admin/email/send-test rate limit
- **Expected:** 429 after threshold.
- **Severity:** medium
