# BUG-CORPUS-PROJ-003 — non-UUID :id on /projects routes returns 500 (should be 400)

**Severity:** medium
**Env:** env1 (https://zantaz-api.doable.me)
**Found by:** Task #9 FULL-CORPUS-1 — corpus-runner-1 — 2026-05-10
**Related:** BUG-CORPUS-PROJ-002 (validateProjectIdParam middleware fix; not yet applied to all routes)

## Reproduction

Auth: qa-owner Bearer token.

| Method | Path | Expected | Actual |
|---|---|---|---|
| GET    | `/projects/not-uuid`             | 400 | **500** Internal Server Error |
| PATCH  | `/projects/not-uuid`             | 400 | **500** |
| DELETE | `/projects/not-uuid`             | 400 | **500** |
| GET    | `/projects?workspaceId=not-uuid` | 400 | **500** |
| GET    | `/projects/not-uuid/collaborators`| 400 | **500** |
| POST   | `/projects/not-uuid/star`        | 400 | **500** |

Response body in every case: `{"error":"Internal Server Error"}` — Postgres throws on invalid UUID cast and the handler doesn't catch.

## Why this is a bug

5xx leaks implementation detail to clients and trips Cloudflare error pages / monitoring; clients can't distinguish "bad input" from "API down". Per BUG-CORPUS-PROJ-002 the `/projects/:id` and `/projects/:id/*` routes were supposed to be wrapped by `validateProjectIdParam`, but several siblings (collaborators GET, star POST, list query-param, etc.) clearly aren't — they 500 on the same input.

## Fix sketch

1. Apply the same `zValidator('param', z.object({ id: z.string().uuid() }))` middleware to the `/:id/star`, `/:id/collaborators`, `/:id/files` (already 200 — see PROJ-005), and any other `:id`-bearing routes.
2. Validate `workspaceId` query param in `GET /projects` with `zValidator('query', ...)` to catch bad UUIDs before SQL.
3. Add `try/catch` wrap with `if (err.code === '22P02') return c.json({error:'Invalid uuid'}, 400)` as a defence in depth.

## Evidence

- Runlog: testcases/99-runlog/env1/CORPUS-FULL-1.md (rows TC-PROJ-LIST-005, TC-PROJ-UPDATE-004, TC-PROJ-UUID-001, TC-PROJ-DELETE-004, TC-PROJ-COLLAB-003, TC-PROJ-MISC-002)
