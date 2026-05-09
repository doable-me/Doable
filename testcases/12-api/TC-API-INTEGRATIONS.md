# TC-API-INTEGRATIONS — /integrations route group

Mounted at `/` (`services/api/src/routes.ts:99-100`). Source: `routes/integrations.ts`, `routes/integrations/`, `routes/integrations-*.ts`.

Endpoints (representative — Activepieces npm pieces + ActionContext adapter):
- `GET    /integrations/catalog`
- `GET    /integrations/catalog/:slug`
- `GET    /integrations/connections`
- `POST   /integrations/connections`             — connect (start OAuth or save key)
- `GET    /integrations/connections/:cid`
- `DELETE /integrations/connections/:cid`
- `POST   /integrations/connections/:cid/refresh`
- `POST   /integrations/connections/:cid/test`
- `GET    /integrations/oauth/start`
- `GET    /integrations/oauth/callback`
- `POST   /integrations/connections/:cid/run/:action`
- `POST   /integrations/supabase/provision`
- `GET    /integrations/admin/pieces`             — admin list npm pieces

---

## TC-API-INTEG-001 — GET /integrations/catalog 200
- **Expected:** 200 list of available pieces.
- **Severity:** smoke

## TC-API-INTEG-002 — GET catalog filter ?category=
- **Expected:** 200 filtered.
- **Severity:** medium

## TC-API-INTEG-003 — GET catalog/:slug 200
- **Expected:** 200 detail with schema.
- **Severity:** smoke

## TC-API-INTEG-004 — GET catalog/:slug not found → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-INTEG-005 — GET /connections 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-INTEG-006 — GET /connections 200
- **Expected:** 200 list of user's connections.
- **Severity:** smoke

## TC-API-INTEG-007 — POST /connections 201 (api-key)
- **Steps:** POST `{slug:"openai", auth:{type:"apiKey", apiKey}}`.
- **Expected:** 201.
- **Severity:** smoke

## TC-API-INTEG-008 — POST /connections OAuth piece returns redirect URL
- **Steps:** POST `{slug:"slack"}`.
- **Expected:** 200 with `oauthUrl`.
- **Severity:** smoke

## TC-API-INTEG-009 — POST /connections invalid slug → 404
- **Expected:** 404.
- **Severity:** high

## TC-API-INTEG-010 — POST /connections by viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-INTEG-011 — POST /connections over plan limit → 403/422
- **Expected:** 403/422.
- **Severity:** medium

## TC-API-INTEG-012 — POST /connections missing required auth fields → 400
- **Steps:** POST without apiKey for an api-key piece.
- **Expected:** 400.
- **Severity:** high

## TC-API-INTEG-013 — POST /connections invalid api key (rejected by upstream) → 400/502
- **Expected:** 400/502; never stored.
- **Severity:** high

## TC-API-INTEG-014 — GET /connections/:cid 200
- **Expected:** 200; secrets redacted.
- **Severity:** smoke

## TC-API-INTEG-015 — DELETE /connections/:cid 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-INTEG-016 — POST /connections/:cid/refresh 200
- **Expected:** 200; new access token cached.
- **Severity:** medium

## TC-API-INTEG-017 — POST /connections/:cid/test 200
- **Expected:** 200 reachable.
- **Severity:** medium

## TC-API-INTEG-018 — POST /connections/:cid/test invalid creds → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-INTEG-019 — GET /oauth/start 200/302
- **Expected:** 302 to provider with state.
- **Severity:** smoke

## TC-API-INTEG-020 — GET /oauth/callback state mismatch → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-INTEG-021 — GET /oauth/callback no code → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-INTEG-022 — POST /run/:action 200
- **Steps:** POST with valid input schema.
- **Expected:** 200 result.
- **Severity:** smoke

## TC-API-INTEG-023 — POST /run/:action invalid input → 400
- **Expected:** 400 with details.
- **Severity:** high

## TC-API-INTEG-024 — POST /run/:action upstream timeout → 504
- **Expected:** 504 or 502.
- **Severity:** high

## TC-API-INTEG-025 — POST /supabase/provision 200
- **Steps:** POST with project ref.
- **Expected:** 200; supabase project provisioned.
- **Severity:** high

## TC-API-INTEG-026 — POST supabase/provision missing token → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-INTEG-027 — GET /integrations/admin/pieces non-admin → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-INTEG-028 — GET /integrations/admin/pieces admin 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-INTEG-029 — POST /connections SSRF blocked
- **Steps:** custom webhook URL pointing to localhost.
- **Expected:** 400.
- **Severity:** smoke

## TC-API-INTEG-030 — Connection secret never echoed in any GET
- **Expected:** All GETs redact secrets.
- **Severity:** smoke

## TC-API-INTEG-031 — Path SQL injection on :cid
- **Expected:** 400.
- **Severity:** smoke

## TC-API-INTEG-032 — Wrong method PATCH /connections → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-INTEG-033 — Body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-INTEG-034 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-INTEG-035 — Header CRLF injection
- **Expected:** 400.
- **Severity:** medium

## TC-API-INTEG-036 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-INTEG-037 — Idempotency-Key on POST /connections
- **Expected:** Single connection row.
- **Severity:** medium

## TC-API-INTEG-038 — Filter ?status=connected|expired|errored
- **Expected:** 200 filtered.
- **Severity:** medium

## TC-API-INTEG-039 — Pagination cursor edges
- **Expected:** Empty/end correct.
- **Severity:** medium

## TC-API-INTEG-040 — Server error returns JSON
- **Pre:** Force npm piece exception.
- **Expected:** 500 JSON.
- **Severity:** high

## TC-API-INTEG-041 — Filter combo (slug × status × visibility)
- **Expected:** Correct subsets.
- **Severity:** medium
