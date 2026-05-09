# BUG-CORPUS-VERSIONS-001 — POST /projects/:id/versions returns 400 "Missing required fields: createdBy, projectPath"

**Severity:** medium
**Env:** env1 / zantaz (`https://zantaz-api.doable.me`)
**Found by:** corpus runner, RUN-2026-05-10-CORPUS

## Repro
```
POST /projects/{PID}/versions
Authorization: Bearer <qa-owner>
Content-Type: application/json
Body: {"label":"corpus-smoke"}
```

## Actual
HTTP 400 — `{"error":"Missing required fields: createdBy, projectPath"}`

## Expected
HTTP 201 with new version row.

## Analysis
`services/api/src/routes/versions.ts` declares the POST handler requires `createdBy` and `projectPath` in the request body. These are values the **server** can derive from the auth context (`createdBy = userId`) and from project lookup (`projectPath = getProjectPath(projectId)`). Forcing the client to supply them is wrong:
- The CLI/Web UI cannot/should not know the on-disk project path.
- `createdBy` is already enforced by auth — accepting it from the body is also a privilege-escalation risk (a user could attribute snapshots to another user).

## Fix recommendation
- Drop `createdBy` and `projectPath` from the required body schema.
- Use `c.get("userId")` for `createdBy`.
- Use `getProjectPath(projectId)` to resolve `projectPath` server-side (same call already used elsewhere in the file).

## Evidence
`testcases/evidence/env1/TC-VERSIONS-CRUD-003.body`
