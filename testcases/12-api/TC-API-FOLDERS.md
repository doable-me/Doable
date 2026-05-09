# TC-API-FOLDERS — /folders route group

Mounted at `/folders` (`services/api/src/routes.ts:81`). Source: `services/api/src/routes/folders.ts`.

Endpoints:
- `GET    /folders?workspaceId=...`
- `POST   /folders`
- `GET    /folders/:id`
- `PUT    /folders/:id`
- `DELETE /folders/:id`
- `POST   /folders/:id/move`
- `GET    /folders/:id/children`

---

## TC-API-FOLDERS-001 — GET /folders?workspaceId 200
- **Steps:** GET with workspaceId of own WS.
- **Expected:** 200 list of folders.
- **Severity:** smoke

## TC-API-FOLDERS-002 — GET /folders missing workspaceId → 400
- **Expected:** 400 required.
- **Severity:** high

## TC-API-FOLDERS-003 — GET /folders 401 no token
- **Expected:** 401.
- **Severity:** smoke

## TC-API-FOLDERS-004 — GET /folders workspaceId not member → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-FOLDERS-005 — GET /folders workspaceId not UUID → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-FOLDERS-006 — POST /folders 201
- **Steps:** POST `{workspaceId, name:"Designs"}`.
- **Expected:** 201.
- **Severity:** smoke

## TC-API-FOLDERS-007 — POST /folders parent in different workspace → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-FOLDERS-008 — POST /folders empty name → 400
- **Expected:** 400 min(1).
- **Severity:** high

## TC-API-FOLDERS-009 — POST /folders name 256+ chars → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-FOLDERS-010 — POST /folders unicode name 201
- **Expected:** 201, persisted.
- **Severity:** low

## TC-API-FOLDERS-011 — POST /folders nested >5 levels → 400
- **Expected:** 400 depth limit if enforced; record.
- **Severity:** medium

## TC-API-FOLDERS-012 — POST /folders cycle attempt (parent=self) → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-FOLDERS-013 — GET /folders/:id 200
- **Expected:** 200.
- **Severity:** smoke

## TC-API-FOLDERS-014 — GET /folders/:id not found → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-FOLDERS-015 — PUT /folders/:id rename 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-FOLDERS-016 — PUT /folders/:id by viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-FOLDERS-017 — DELETE /folders/:id empty → 204
- **Expected:** 204.
- **Severity:** smoke

## TC-API-FOLDERS-018 — DELETE /folders/:id with children → 409 / cascade
- **Steps:** DELETE folder containing projects.
- **Expected:** 409 or cascade per design; record.
- **Severity:** high

## TC-API-FOLDERS-019 — POST /folders/:id/move new parent 200
- **Expected:** 200; tree updated.
- **Severity:** medium

## TC-API-FOLDERS-020 — POST move into descendant → 400 (cycle)
- **Expected:** 400.
- **Severity:** high

## TC-API-FOLDERS-021 — POST move parent=null (to root) 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-FOLDERS-022 — GET /folders/:id/children 200
- **Expected:** 200 `{folders:[],projects:[]}`.
- **Severity:** medium

## TC-API-FOLDERS-023 — Path SQL injection in :id
- **Expected:** 400 invalid UUID.
- **Severity:** smoke

## TC-API-FOLDERS-024 — Wrong method PATCH /folders/:id → 404/405
- **Expected:** 404/405.
- **Severity:** low

## TC-API-FOLDERS-025 — Large body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-FOLDERS-026 — Header CRLF injection
- **Expected:** 400/sanitized.
- **Severity:** medium

## TC-API-FOLDERS-027 — Pagination on children ?cursor=
- **Expected:** 200.
- **Severity:** medium

## TC-API-FOLDERS-028 — Filter combination archived × parent
- **Expected:** Correct subsets.
- **Severity:** medium
