# BUG-CORPUS-PARSED-001 — UUID + UUID-query guard gap on /folders, /projects DELETE/PATCH/COLLAB-DELETE, /projects?folderId, /projects/:id/context

**Severity:** medium (server-error noise — should be 4xx, leaks stack trace surface)
**Found:** 2026-05-10 by master via parsed-corpus runner (CORPUS-PARSED-RESULTS.csv)

## Findings (5 distinct routes, 7 TCs)

All return **HTTP 500** for a malformed input that should be **400 / 404**:

| TC | Method | Path | Expected | Got |
|---|---|---|---|---|
| TC-PROJ-COLLAB-014 | DELETE | `/projects/:id/collaborators/notuuid` | 404 | 500 |
| TC-PROJ-DELETE-022 | DELETE | `/projects/abc` | 404 | 500 |
| TC-PROJ-UPDATE-033 | PATCH | `/projects/notuuid` | 404 | 500 |
| TC-API-PROJECTS-010 | GET | `/projects?folderId=not-a-uuid` | 400 | 500 |
| TC-API-CTX-001 | GET | `/projects/:id/context` | 200 | 500 |
| TC-FOLDER-GET-001 | GET | `/folders/:id` | 200 | 500 |
| TC-FOLDER-DELETE-001 | DELETE | `/folders/:id` | 200 | 500 |

## Root causes

1. **Non-UUID :id on /projects DELETE/PATCH and /projects/:id/collaborators/:userId DELETE** — the `validateProjectIdParam` middleware was previously applied to GET/POST but DELETE/PATCH on `/projects/:id` and the inner `/collaborators/:userId` DELETE handler still hit Postgres with an invalid UUID and crash. Extension of BUG-CORPUS-PROJ-003.
2. **`/projects?folderId=not-a-uuid`** — query param `folderId` is fed straight into Postgres without zod validation. We have `validateUuidQueryParam` for `workspaceId` already; needs to cover `folderId` too.
3. **`/folders/:id` GET and DELETE** — folder router has no UUID middleware at all.
4. **`/projects/:id/context`** — separate context handler hits 500 on its own SQL when project doesn't exist or context table query fails. Needs project-existence precheck → 404.

## Suggested fix

- Apply existing `validateProjectIdParam` middleware to ALL `/projects/:id/*` verbs (currently it lives on the routers but apparently DELETE/PATCH on the bare `:id` and the COLLAB DELETE leak through).
- Add `validateUuidQueryParam("folderId")` to `services/api/src/routes/projects/list-routes.ts` query guard.
- New `validateFolderIdParam` middleware on `services/api/src/routes/folders.ts` (or whatever the folder router file is) covering `/:id`, `/:id/*`.
- `/projects/:id/context` handler: add a `SELECT 1 FROM projects WHERE id=$1` precheck; 404 if missing; otherwise wrap the SQL in try/catch returning structured error.

## Out-of-scope (TC drift, not bugs)

- TC-BILLING-PORTAL-001 + TC-API-BILLING-009 expect 200 on POST /billing/portal but env1 is in Stripe BYPASS so 503 is correct. These TCs need a "(Stripe-mode-only)" precondition note (already have BUG-PUB-002 fixed for the body-parsing case).

## Acceptance

- All 5 routes return 400/404 (not 500) for malformed input.
- /projects/:id/context returns 200 (or 404 for non-existent project) but never 500.
- Regression TC at testcases/12-api/TC-API-UUID-VALIDATION-EXTENDED.md.
