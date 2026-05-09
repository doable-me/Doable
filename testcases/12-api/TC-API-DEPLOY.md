# TC-API-DEPLOY — /deploy + /domains route group

Mounted at `/deploy` (`services/api/src/routes.ts:83`) and `/domains` (`:84`). Source: `routes/deploy.ts`, `routes/deploy/`, `routes/custom-domains.ts`.

Endpoints (representative):
- `POST   /deploy/:projectId/publish`
- `POST   /deploy/:projectId/unpublish`
- `GET    /deploy/:projectId/status`
- `GET    /deploy/:projectId/history`
- `POST   /deploy/:projectId/rollback/:deployId`
- `GET    /deploy/:projectId/preview-url`
- `POST   /deploy/:projectId/build`
- `GET    /domains`
- `POST   /domains`
- `DELETE /domains/:id`
- `POST   /domains/:id/verify`
- `GET    /domains/:id/dns-records`

---

## TC-API-DEPLOY-001 — POST /deploy/:projectId/publish 202
- **Steps:** POST `{}`.
- **Expected:** 202 deploy queued; SSE on /status.
- **Severity:** smoke

## TC-API-DEPLOY-002 — POST publish 401
- **Expected:** 401.
- **Severity:** smoke

## TC-API-DEPLOY-003 — POST publish viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-DEPLOY-004 — POST publish wrong project → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-DEPLOY-005 — POST publish path SQL injection on :projectId
- **Expected:** 400.
- **Severity:** smoke

## TC-API-DEPLOY-006 — POST publish concurrent calls → 409 or queued
- **Steps:** 2 publishes in flight.
- **Expected:** 409 or both 202 with queued status.
- **Severity:** high

## TC-API-DEPLOY-007 — POST /unpublish 200
- **Pre:** Already published.
- **Expected:** 200 site removed; subdomain returns 404 in browser.
- **Severity:** smoke

## TC-API-DEPLOY-008 — POST unpublish when not published → 409
- **Expected:** 409 or 200 idempotent.
- **Severity:** medium

## TC-API-DEPLOY-009 — GET /status 200
- **Expected:** 200 `{state:"idle"|"building"|"deployed"|"failed", lastDeployedAt}`.
- **Severity:** smoke

## TC-API-DEPLOY-010 — GET /history 200 paginated
- **Expected:** 200 list, cursor.
- **Severity:** medium

## TC-API-DEPLOY-011 — GET /history pagination cursor invalid → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-DEPLOY-012 — POST /rollback/:deployId 202
- **Expected:** 202 rollback queued.
- **Severity:** high

## TC-API-DEPLOY-013 — POST rollback to non-existent → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-DEPLOY-014 — POST rollback to deploy from different project → 404/403
- **Expected:** 404.
- **Severity:** high

## TC-API-DEPLOY-015 — POST /build 202
- **Expected:** 202 build event SSE.
- **Severity:** smoke

## TC-API-DEPLOY-016 — POST build with framework not enabled → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-DEPLOY-017 — POST build with broken project (syntax error) → 200, status=failed
- **Expected:** 202 with later state=failed; logs available.
- **Severity:** high

## TC-API-DEPLOY-018 — GET /preview-url 200
- **Expected:** 200 with `<projectId>.staging.doable.me` (or env-prefixed).
- **Severity:** smoke

## TC-API-DEPLOY-019 — GET preview-url stale (project moved)
- **Expected:** 200 with current URL.
- **Severity:** medium

## TC-API-DEPLOY-020 — Server error reproducible (kill builder)
- **Pre:** Builder process dies mid-deploy.
- **Expected:** /status returns `failed` with error reason.
- **Severity:** high

## TC-API-DEPLOY-021 — GET /domains 200
- **Expected:** 200 user's custom domains.
- **Severity:** smoke

## TC-API-DEPLOY-022 — POST /domains 201
- **Steps:** POST `{domain:"acme.com", projectId, workspaceId}`.
- **Expected:** 201 pending verification.
- **Severity:** smoke

## TC-API-DEPLOY-023 — POST /domains malformed domain → 400
- **Steps:** domain "not a domain".
- **Expected:** 400.
- **Severity:** high

## TC-API-DEPLOY-024 — POST /domains taken by another workspace → 409
- **Expected:** 409.
- **Severity:** smoke

## TC-API-DEPLOY-025 — POST /domains punycode IDN
- **Steps:** domain `xn--bcher-kva.example`.
- **Expected:** 201.
- **Severity:** medium

## TC-API-DEPLOY-026 — POST /domains over plan limit → 403/422
- **Expected:** 403/422.
- **Severity:** high

## TC-API-DEPLOY-027 — POST /domains/:id/verify success 200
- **Pre:** DNS TXT record set correctly.
- **Expected:** 200 `{verified:true}`.
- **Severity:** high

## TC-API-DEPLOY-028 — POST verify when DNS not propagated → 400
- **Expected:** 400 with reason.
- **Severity:** high

## TC-API-DEPLOY-029 — DELETE /domains/:id 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-DEPLOY-030 — DELETE /domains/:id by non-owner → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-DEPLOY-031 — GET /domains/:id/dns-records 200
- **Expected:** 200 returns required CNAME + TXT records to add.
- **Severity:** smoke

## TC-API-DEPLOY-032 — GET dns-records non-existent → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-DEPLOY-033 — Path SQL injection on /domains/:id
- **Expected:** 400.
- **Severity:** smoke

## TC-API-DEPLOY-034 — Wrong method PUT /domains → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-DEPLOY-035 — Body 5MB on POST /deploy → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-DEPLOY-036 — Header CRLF injection on X-Build-Tag
- **Expected:** 400.
- **Severity:** medium

## TC-API-DEPLOY-037 — Idempotency-Key on POST publish
- **Expected:** Single deploy created.
- **Severity:** medium

## TC-API-DEPLOY-038 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-DEPLOY-039 — DB down during /publish → 500 JSON
- **Expected:** 500.
- **Severity:** high

## TC-API-DEPLOY-040 — Apex domain rejected (`example.com` only allowed if SSL ready)
- **Steps:** POST apex when ACM disabled.
- **Expected:** 400 or 201 with warning.
- **Severity:** high

## TC-API-DEPLOY-041 — Filter combination on /history (status × since × limit)
- **Expected:** Correct subsets.
- **Severity:** medium

## TC-API-DEPLOY-042 — Long URL on /deploy/:projectId/rollback/:deployId
- **Expected:** 414 or 404.
- **Severity:** medium
