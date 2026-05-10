# TC-PROJ-UUID-VALIDATION-EXTENDED — UUID guard covers ALL project sub-routers

Source: BUG-CORPUS-PROJ-003 (env1, 2026-05-10).
Helper under test: `services/api/src/routes/projects/helpers.ts` →
`validateProjectIdParam(paramName)` factory + `validateUuidQueryParam(name, label)`
factory.

**Scope expansion** beyond the original BUG-CORPUS-PROJ-002 fix
(TC-PROJ-UUID-VALIDATION.md, which only covered `projectItemRoutes` and
`projectApiKeyRoutes`). Now also covers:

- `projectListRoutes` — `workspaceId` and `folderId` *query* params
  (`GET /projects?workspaceId=…&folderId=…`)
- `versionRoutes` — `:projectId/*` (e.g. `GET /projects/:id/versions`)
- `securityRoutes` — `:id/security/*`
- `projEnvVarRoutes` — `:projectId/env-vars`, `:projectId/env-vars/*`
- `projectFileRoutes` — `:id/*` no longer silently skips on non-UUID; now
  returns 400 like the others

All of the below MUST respond `400 {"error":"Invalid project id"}` (or
`{"error":"Invalid workspaceId"}` for the query-param case) BEFORE
postgres.js sees the value.

---

## TC-PROJ-UUIDX-001 — `GET /projects?workspaceId=not-a-uuid` → 400

- **Steps:**
  ```bash
  curl -sS -o - -w "\nHTTP=%{http_code}\n" -H "Authorization: Bearer $TOK" \
    "https://<env>-api.doable.me/projects?workspaceId=not-a-uuid"
  ```
- **Expected:** `HTTP=400`, body `{"error":"Invalid workspaceId"}`.
- **Severity:** medium (original PROJ-003 repro item 4).

## TC-PROJ-UUIDX-002 — `GET /projects?folderId=garbage` → 400

- **Expected:** `HTTP=400`, body `{"error":"Invalid folderId"}`.

## TC-PROJ-UUIDX-003 — `GET /projects?workspaceId=` (empty) → 200

- **Expected:** `HTTP=200`. Empty query param is treated as absent and
  the user falls back to their default workspace.

## TC-PROJ-UUIDX-004 — `GET /projects/abc/versions` → 400

- **Expected:** `HTTP=400`, `{"error":"Invalid project id"}`. Confirms
  the `:projectId` param-name variant of the middleware on `versionRoutes`.

## TC-PROJ-UUIDX-005 — `POST /projects/abc/security/scan` → 400

- **Expected:** `HTTP=400`, `{"error":"Invalid project id"}`. Confirms
  the `:id/security/*` mount on `securityRoutes`.

## TC-PROJ-UUIDX-006 — `GET /projects/abc/env-vars` → 400

- **Expected:** `HTTP=400`, `{"error":"Invalid project id"}`. Confirms
  the `:projectId/env-vars*` mount on `projEnvVarRoutes`.

## TC-PROJ-UUIDX-007 — `GET /projects/abc/files` → 400 (was: silent pass-through then 500)

- **Steps:** `GET /projects/abc/files` with bearer.
- **Expected:** `HTTP=400`, `{"error":"Invalid project id"}`. The
  previous `project-files.ts` middleware did
  `if (!UUID_RE.test(projectId)) { await next(); return; }` which
  bypassed access checks AND the inner SQL still 500'd. Now we return
  400 explicitly.

## TC-PROJ-UUIDX-008 — `POST /projects/abc/star` → 400 (already covered by item-routes mw — regression guard)

- **Expected:** `HTTP=400`, `{"error":"Invalid project id"}`.

## TC-PROJ-UUIDX-009 — `GET /projects/abc/collaborators` → 400 (already covered — regression guard)

- **Expected:** `HTTP=400`.

## TC-PROJ-UUIDX-010 — Real UUID for non-existent project on each sub-router still 404 (not 400)

- **Steps:** `NONCE=$(uuidgen)`, then:
  - `GET /projects/$NONCE/versions` → expect 404
  - `POST /projects/$NONCE/security/scan` → expect 404 or 200 (handler-specific)
  - `GET /projects/$NONCE/env-vars` → expect 404 or 403
- **Expected:** middleware passes through (UUID is shape-valid); handler
  rejects with appropriate auth/existence code. Confirms the guard
  doesn't over-reject.

## TC-PROJ-UUIDX-011 — `/starred`, `/shared`, `/recently-viewed` keep working

- **Steps:** `GET /projects/starred` (and the other two) with bearer.
- **Expected:** `HTTP=200`. Confirms list-routes' literal paths aren't
  eclipsed by any of the new middleware.
