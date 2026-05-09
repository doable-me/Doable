# BUG-CORPUS-PROJ-002 — GET /projects/:id with non-UUID returns 500 Internal Server Error

- **Severity:** low (DOS-amplifier / observability noise)
- **Component:** services/api projects route — id param validation
- **Env reproduced:** env1 (zantaz) — https://zantaz-api.doable.me
- **Run:** testcases/99-runlog/env1/CORPUS-01-02-03.md (TC-PROJ-FETCH-002)
- **Date:** 2026-05-10

## Summary
`GET /projects/:id` with a non-UUID `id` (e.g. `not-a-uuid`) returns `500 Internal Server Error`
with body `{"error":"Internal Server Error"}`. This is almost certainly an unhandled
`invalid input syntax for type uuid` PostgreSQL error bubbling up.

## Repro (curl)
```
curl -sS -o - -w "\n%{http_code}\n" \
  https://zantaz-api.doable.me/projects/not-a-uuid \
  -H "Authorization: Bearer $(jq -r .\"qa-owner\".access testcases/evidence/_tokens-env1.json)"
```
- Returns: HTTP 500, body `{"error":"Internal Server Error"}`.

For comparison, `GET /workspaces/:id` with `not-a-uuid` correctly returns 400
`{"error":"Invalid workspace id"}` — see TC-WS-CRUD-033 in the same run log.

## Expected
- HTTP 400 with `{"error":"Invalid project id"}` (mirroring the workspaces handler).

## Actual
- HTTP 500.

## Suggested fix
Add a pre-handler that validates `params.id` against the UUID regex and returns 400 before
hitting Postgres — same pattern used at `services/api/src/routes/workspaces.ts`.
