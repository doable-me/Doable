# BUG-CORPUS-PROJ-001 — POST /projects silently auto-selects workspace when workspaceId is omitted

- **Severity:** medium (privacy/data-routing risk)
- **Component:** services/api projects route — schema validation
- **Env reproduced:** env1 (zantaz) — https://zantaz-api.doable.me
- **Run:** testcases/99-runlog/env1/CORPUS-01-02-03.md (TC-PROJ-CREATE-010)
- **Date:** 2026-05-10

## Summary
The `POST /projects` schema documents `workspaceId UUID` as a required field. Sending a body
without `workspaceId` should return `400 Validation failed` with `details.workspaceId=["Required"]`.
Instead, the server returned `201 Created` and assigned the new project to the caller's default
(or most-recently-touched) workspace silently:

```
POST /projects
Authorization: Bearer <qa-owner JWT>
Content-Type: application/json
{"name":"X"}

→ 201
{"data":{"id":"1936851a-307a-443f-a0bd-b451bf30a121",
         "workspace_id":"f67d7a2b-0c29-4fe1-a0a5-d1e980b74206",
         "name":"X","slug":"x-moyv8hjm","framework_id":"vite-react",...}}
```

## Why this is a bug
1. Spec mismatch — TC-PROJ-CREATE-010 (and the README at `services/api/src/routes/projects.ts`
   schema) declares `workspaceId` required. Skipping validation breaks the contract.
2. Privacy/operator risk — for users who own multiple workspaces (e.g. a personal + an
   employer-shared workspace), a project intended for one ends up in the other if the client
   forgets to pass `workspaceId`. There is no UI affordance signalling which workspace was
   chosen.
3. Plan-limit accounting becomes ambiguous (which workspace's quota was consumed?).

## Repro (curl)
```
curl -sS -X POST https://zantaz-api.doable.me/projects \
  -H "Authorization: Bearer $(jq -r .\"qa-owner\".access testcases/evidence/_tokens-env1.json)" \
  -H "Content-Type: application/json" \
  -d '{"name":"X"}'
```

## Expected
- HTTP 400
- `{"error":"Validation failed","details":{"workspaceId":["Required"]}}`

## Actual
- HTTP 201, project created in caller's default workspace.

## Suggested fix
Tighten the zod schema for `POST /projects` so `workspaceId` is non-nullable and required.
If "default workspace" behaviour is desired, surface it as an explicit `workspaceId: "default"`
sentinel or a separate endpoint (e.g. `/me/quick-projects`) — never silently.
