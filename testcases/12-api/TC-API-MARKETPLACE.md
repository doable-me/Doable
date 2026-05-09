# TC-API-MARKETPLACE — /marketplace + moderation route group

Mounted at `/` and `/workspaces` (`services/api/src/routes.ts:107-109`). Source: `routes/marketplace.ts`, `routes/marketplace-moderation.ts`.

Endpoints (representative):
- `GET    /marketplace/listings`
- `GET    /marketplace/listings/:slug`
- `POST   /workspaces/:wid/marketplace/listings`           — publish listing
- `PUT    /workspaces/:wid/marketplace/listings/:id`
- `DELETE /workspaces/:wid/marketplace/listings/:id`
- `POST   /workspaces/:wid/marketplace/listings/:id/install` — clone listing into workspace
- `GET    /marketplace/categories`
- `POST   /marketplace/listings/:id/like`
- `POST   /marketplace/listings/:id/report`
- `GET    /marketplace/admin/queue`                         — moderation queue
- `POST   /marketplace/admin/listings/:id/approve`
- `POST   /marketplace/admin/listings/:id/reject`

---

## TC-API-MKT-001 — GET /marketplace/listings 200 (public)
- **Expected:** 200 list of approved listings.
- **Severity:** smoke

## TC-API-MKT-002 — GET listings filter ?category=
- **Expected:** 200 filtered.
- **Severity:** medium

## TC-API-MKT-003 — GET listings ?sort=trending|recent|popular
- **Expected:** 200 ordered.
- **Severity:** medium

## TC-API-MKT-004 — GET /marketplace/listings/:slug 200
- **Expected:** 200 detail.
- **Severity:** smoke

## TC-API-MKT-005 — GET /listings/:slug not found → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-MKT-006 — POST publish listing 201
- **Steps:** POST `{title, description, projectId, slug, category}`.
- **Expected:** 201 with status=pending.
- **Severity:** smoke

## TC-API-MKT-007 — POST publish 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-MKT-008 — POST publish duplicate slug → 409
- **Expected:** 409.
- **Severity:** high

## TC-API-MKT-009 — POST publish project not in workspace → 403/404
- **Expected:** 403/404.
- **Severity:** high

## TC-API-MKT-010 — POST publish empty title → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-MKT-011 — POST publish too-long description → 400
- **Steps:** description 5001 chars.
- **Expected:** 400.
- **Severity:** medium

## TC-API-MKT-012 — POST publish XSS in description sanitized
- **Steps:** description with `<script>`.
- **Expected:** 201; rendering escapes.
- **Severity:** smoke

## TC-API-MKT-013 — POST publish over plan limit → 403/422
- **Expected:** 403/422.
- **Severity:** medium

## TC-API-MKT-014 — POST publish by viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-MKT-015 — PUT listing 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-MKT-016 — PUT listing by non-author → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-MKT-017 — DELETE listing 204
- **Expected:** 204; row soft-deleted.
- **Severity:** medium

## TC-API-MKT-018 — DELETE listing by mod 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-MKT-019 — POST install 201
- **Steps:** POST install into target workspace.
- **Expected:** 201; new project with cloned files.
- **Severity:** high

## TC-API-MKT-020 — POST install over plan limit → 403/422
- **Expected:** 403/422.
- **Severity:** high

## TC-API-MKT-021 — POST install of pending listing → 400/403
- **Expected:** 400 not approved.
- **Severity:** high

## TC-API-MKT-022 — POST install non-existent listing → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-MKT-023 — POST like 200
- **Expected:** 200.
- **Severity:** low

## TC-API-MKT-024 — POST like idempotent
- **Expected:** Same count after twice.
- **Severity:** low

## TC-API-MKT-025 — POST report 200
- **Steps:** reason "spam".
- **Expected:** 200.
- **Severity:** medium

## TC-API-MKT-026 — POST report invalid reason → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-MKT-027 — POST report rate limit
- **Expected:** 429 after threshold.
- **Severity:** medium

## TC-API-MKT-028 — GET /marketplace/admin/queue admin 200
- **Expected:** 200.
- **Severity:** smoke

## TC-API-MKT-029 — GET admin queue non-admin → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-MKT-030 — POST admin approve 200
- **Expected:** 200; status=approved; listing public.
- **Severity:** high

## TC-API-MKT-031 — POST admin approve already approved → 409
- **Expected:** 409.
- **Severity:** medium

## TC-API-MKT-032 — POST admin reject 200
- **Steps:** POST with reason.
- **Expected:** 200.
- **Severity:** medium

## TC-API-MKT-033 — POST admin reject without reason → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-MKT-034 — Path SQL injection
- **Expected:** 400.
- **Severity:** smoke

## TC-API-MKT-035 — Wrong method PATCH /listings → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-MKT-036 — Body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-MKT-037 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-MKT-038 — Header CRLF → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-MKT-039 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-MKT-040 — Idempotency-Key on POST install
- **Expected:** Single project created.
- **Severity:** medium

## TC-API-MKT-041 — Pagination on listings cursor
- **Expected:** 200 with cursor.
- **Severity:** medium

## TC-API-MKT-042 — Filter combination (category × sort × language) matrix
- **Expected:** Correct subsets.
- **Severity:** medium

## TC-API-MKT-043 — Server error returns JSON
- **Pre:** Force DB error.
- **Expected:** 500 JSON.
- **Severity:** high
