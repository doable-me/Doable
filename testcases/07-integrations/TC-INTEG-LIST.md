# TC-INTEG-LIST — Integrations marketplace & listing

Covers GET /integrations, /integrations/categories, /integrations/:slug. Search, filters, paging, capability advertisement, plan gating, feature flags.

## TC-INTEG-LIST-001 — List integrations (smoke)
- **Steps:** GET /integrations
- **Expected:** 200 with array of {slug,name,category,iconUrl,description,actions[],triggers[],authType}
- **Severity:** smoke

## TC-INTEG-LIST-002 — Default page size 50
- **Severity:** medium

## TC-INTEG-LIST-003 — Pagination via cursor
- **Severity:** medium

## TC-INTEG-LIST-004 — Filter by category
- **Steps:** ?category=crm
- **Severity:** medium

## TC-INTEG-LIST-005 — Filter by authType=oauth
- **Severity:** medium

## TC-INTEG-LIST-006 — Search by name fuzzy
- **Steps:** ?q=stri
- **Expected:** stripe surfaces; ranked by trigram similarity
- **Severity:** medium

## TC-INTEG-LIST-007 — Search by action name
- **Severity:** low

## TC-INTEG-LIST-008 — Filter by featured=true
- **Severity:** low

## TC-INTEG-LIST-009 — Categories endpoint returns counts
- **Severity:** low

## TC-INTEG-LIST-010 — Integration detail GET /integrations/:slug
- **Severity:** smoke

## TC-INTEG-LIST-011 — Detail includes connect URL
- **Severity:** smoke

## TC-INTEG-LIST-012 — Detail includes setup instructions markdown
- **Severity:** medium

## TC-INTEG-LIST-013 — Disabled integration excluded from list
- **Severity:** medium

## TC-INTEG-LIST-014 — Beta integration shown only to opted-in workspaces
- **Severity:** medium

## TC-INTEG-LIST-015 — Plan-gated integration shows upgrade CTA
- **Severity:** high

## TC-INTEG-LIST-016 — Sort by popularity
- **Severity:** low

## TC-INTEG-LIST-017 — Sort by recency
- **Severity:** low

## TC-INTEG-LIST-018 — Empty list when feature flag off
- **Severity:** medium

## TC-INTEG-LIST-019 — Activepieces piece registry refresh job
- **Severity:** low

## TC-INTEG-LIST-020 — 630+ integrations advertised at scale
- **Severity:** medium

## TC-INTEG-LIST-021 — Integration list response cached 60s
- **Severity:** low

## TC-INTEG-LIST-022 — Integration list compressed gzip
- **Severity:** low

## TC-INTEG-LIST-023 — XSS in marketplace description rendered escaped
- **Severity:** critical

## TC-INTEG-LIST-024 — Icon URL same-origin or signed
- **Severity:** medium

## TC-INTEG-LIST-025 — i18n: integration name localized when available
- **Severity:** low

## TC-INTEG-LIST-026 — User connections endpoint shows installed
- **Steps:** `curl -H "Authorization: Bearer $TOKEN" "$API/integrations/connections?workspaceId=$WORKSPACE_ID"`
- **Note:** `workspaceId` query param is REQUIRED — endpoint returns 400 without it. Connections are scoped per workspace.
- **Expected:** 200 `{data: [{id, integrationId, displayName, logoUrl, scope, projectId, authType, status, errorMessage, createdAt, updatedAt}]}` — caller must be a member of `workspaceId` (else 403).
- **Severity:** smoke

## TC-INTEG-LIST-027 — Connections cross-tenant isolated
- **Steps:** `curl -H "Authorization: Bearer $TOKEN" "$API/integrations/connections?workspaceId=$OTHER_WORKSPACE_ID"`
- **Expected:** 403 `{error:"Not a member of this workspace"}` when caller is not a member of the requested workspace.
- **Severity:** critical

## TC-INTEG-LIST-028 — Connections include error state when token expired
- **Steps:** `curl -H "Authorization: Bearer $TOKEN" "$API/integrations/connections?workspaceId=$WORKSPACE_ID"`
- **Expected:** rows with expired tokens have `status:"error"` and a populated `errorMessage`.
- **Severity:** high

## TC-INTEG-LIST-029 — Connections list grouped by category
- **Steps:** `curl -H "Authorization: Bearer $TOKEN" "$API/integrations/connections?workspaceId=$WORKSPACE_ID"`
- **Severity:** low

## TC-INTEG-LIST-030 — Connection labels editable
- **Severity:** low

## TC-INTEG-LIST-031 — Connection metadata exposes enabled actions
- **Steps:** `curl -H "Authorization: Bearer $TOKEN" "$API/integrations/connections?workspaceId=$WORKSPACE_ID"`
- **Severity:** medium

## TC-INTEG-LIST-032 — Marketplace filter by trigger-only
- **Severity:** low

## TC-INTEG-LIST-033 — Marketplace shows version per integration
- **Severity:** low

## TC-INTEG-LIST-034 — Per-integration changelog endpoint
- **Severity:** low

## TC-INTEG-LIST-035 — Listing rate-limited
- **Severity:** low

## TC-INTEG-LIST-036 — Listing returns minimal fields with ?fields=
- **Severity:** low

## TC-INTEG-LIST-037 — Listing supports If-None-Match
- **Severity:** low

## TC-INTEG-LIST-038 — Anon access denied
- **Severity:** high

## TC-INTEG-LIST-039 — Listing performance < 500ms p95
- **Severity:** medium

## TC-INTEG-LIST-040 — Bad slug returns 404 with not_found shape
- **Severity:** low
