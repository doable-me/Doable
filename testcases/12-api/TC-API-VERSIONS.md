# TC-API-VERSIONS — /projects/:id/versions group

Mounted at `/projects` (`services/api/src/routes.ts:87`). Source: `services/api/src/routes/versions.ts`.

Endpoints (representative):
- `GET    /projects/:id/versions`
- `POST   /projects/:id/versions`             — snapshot
- `GET    /projects/:id/versions/:vid`
- `POST   /projects/:id/versions/:vid/restore`
- `DELETE /projects/:id/versions/:vid`
- `GET    /projects/:id/versions/:vid/diff`

---

## TC-API-VERSIONS-001 — GET /versions 200
- **Expected:** 200 list of snapshots ordered by createdAt desc.
- **Severity:** smoke

## TC-API-VERSIONS-002 — GET /versions 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-VERSIONS-003 — GET /versions cross-project (other user) → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-VERSIONS-004 — POST /versions create snapshot 201
- **Steps:** POST `{label:"v1.0", description:"first cut"}`.
- **Expected:** 201.
- **Severity:** smoke

## TC-API-VERSIONS-005 — POST /versions empty label → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-VERSIONS-006 — POST /versions over snapshot quota → 403/422
- **Expected:** 403/422.
- **Severity:** high

## TC-API-VERSIONS-007 — GET /versions/:vid 200
- **Expected:** 200 detail.
- **Severity:** smoke

## TC-API-VERSIONS-008 — GET /versions/:vid wrong project → 404
- **Steps:** vid belongs to other project.
- **Expected:** 404.
- **Severity:** high

## TC-API-VERSIONS-009 — POST /versions/:vid/restore 200
- **Expected:** 200; project files revert.
- **Severity:** high

## TC-API-VERSIONS-010 — POST restore by viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-VERSIONS-011 — POST restore creates auto-snapshot of current state
- **Expected:** New snapshot row precedes restore.
- **Severity:** medium

## TC-API-VERSIONS-012 — DELETE /versions/:vid 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-VERSIONS-013 — DELETE last remaining → 400
- **Steps:** only 1 snapshot.
- **Expected:** 400 cannot delete last.
- **Severity:** medium

## TC-API-VERSIONS-014 — GET /versions/:vid/diff 200
- **Steps:** GET diff from current.
- **Expected:** 200 with `{added, removed, modified}` arrays.
- **Severity:** medium

## TC-API-VERSIONS-015 — GET diff with `?from=<vid>` 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-VERSIONS-016 — GET diff invalid `from` → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-VERSIONS-017 — POST /versions large body → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-VERSIONS-018 — Path SQL injection on :vid
- **Expected:** 400.
- **Severity:** smoke

## TC-API-VERSIONS-019 — Wrong method PATCH /versions/:vid → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-VERSIONS-020 — Pagination cursor edges
- **Expected:** Empty/end behave correctly.
- **Severity:** medium

## TC-API-VERSIONS-021 — Filter ?label=substring case-insensitive
- **Expected:** 200 filtered.
- **Severity:** medium

## TC-API-VERSIONS-022 — Header CRLF on `If-Match`
- **Expected:** 400.
- **Severity:** medium

## TC-API-VERSIONS-023 — CORS preflight
- **Expected:** 204.
- **Severity:** smoke

## TC-API-VERSIONS-024 — Server error returns JSON
- **Expected:** 500 JSON.
- **Severity:** medium
