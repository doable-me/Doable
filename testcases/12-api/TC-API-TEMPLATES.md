# TC-API-TEMPLATES — /templates route group

Mounted at `/templates` (`services/api/src/routes.ts:86`). Source: `services/api/src/routes/templates.ts`.

Endpoints (representative):
- `GET    /templates`
- `GET    /templates/:id`
- `POST   /templates/:id/instantiate`        — create project from template
- `POST   /templates`                        — admin create
- `PUT    /templates/:id`                    — admin
- `DELETE /templates/:id`                    — admin

---

## TC-API-TEMPLATES-001 — GET /templates 200
- **Steps:** GET (no auth allowed?).
- **Expected:** 200 list; record auth requirement.
- **Severity:** smoke

## TC-API-TEMPLATES-002 — GET /templates filter category
- **Steps:** ?category=portfolio.
- **Expected:** 200 filtered.
- **Severity:** medium

## TC-API-TEMPLATES-003 — GET /templates pagination cursor
- **Expected:** 200 with cursor.
- **Severity:** medium

## TC-API-TEMPLATES-004 — GET /templates/:id 200
- **Expected:** 200 detail.
- **Severity:** smoke

## TC-API-TEMPLATES-005 — GET /templates/:id not found → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-TEMPLATES-006 — GET path SQL injection
- **Expected:** 400.
- **Severity:** smoke

## TC-API-TEMPLATES-007 — POST /templates/:id/instantiate 201
- **Steps:** POST `{workspaceId, name:"My Site"}`.
- **Expected:** 201 new project.
- **Severity:** smoke

## TC-API-TEMPLATES-008 — POST instantiate 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-TEMPLATES-009 — POST instantiate over plan limit → 403/422
- **Expected:** 403/422.
- **Severity:** high

## TC-API-TEMPLATES-010 — POST instantiate to workspace not member → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-TEMPLATES-011 — POST instantiate name missing → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-TEMPLATES-012 — POST instantiate template archived → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-TEMPLATES-013 — POST /templates create as non-admin → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-TEMPLATES-014 — POST /templates create 201 (admin)
- **Expected:** 201.
- **Severity:** medium

## TC-API-TEMPLATES-015 — POST /templates required fields validation
- **Steps:** missing slug.
- **Expected:** 400.
- **Severity:** high

## TC-API-TEMPLATES-016 — POST /templates duplicate slug → 409
- **Expected:** 409.
- **Severity:** medium

## TC-API-TEMPLATES-017 — PUT /templates/:id 200 (admin)
- **Expected:** 200.
- **Severity:** medium

## TC-API-TEMPLATES-018 — PUT /templates by viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-TEMPLATES-019 — DELETE /templates/:id 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-TEMPLATES-020 — DELETE in use → 409
- **Expected:** 409 if referenced; or soft delete.
- **Severity:** medium

## TC-API-TEMPLATES-021 — Body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-TEMPLATES-022 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-TEMPLATES-023 — Header CRLF → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-TEMPLATES-024 — Wrong method PATCH → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-TEMPLATES-025 — CORS preflight
- **Expected:** 204.
- **Severity:** smoke

## TC-API-TEMPLATES-026 — Filter combination matrix (category × tag × language)
- **Expected:** Correct subsets.
- **Severity:** medium

## TC-API-TEMPLATES-027 — Server error reproducible
- **Pre:** Force fs error.
- **Expected:** 500 JSON.
- **Severity:** medium

## TC-API-TEMPLATES-028 — Idempotency-Key on POST instantiate
- **Expected:** Single project.
- **Severity:** medium

## TC-API-TEMPLATES-029 — Filter ?language=invalid → 400/empty
- **Expected:** 400 or 200 empty.
- **Severity:** medium

## TC-API-TEMPLATES-030 — Long :id path → 414 or 400
- **Expected:** 414/400.
- **Severity:** low
