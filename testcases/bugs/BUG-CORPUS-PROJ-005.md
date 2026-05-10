# BUG-CORPUS-PROJ-005 — POST /projects/:id/collaborators returns 404 (route not mounted)

**Severity:** medium
**Env:** env1 (https://zantaz-api.doable.me)
**Found by:** Task #9 FULL-CORPUS-1 PASS 2 — corpus-runner-1 — 2026-05-10

## Reproduction

Auth: qa-owner Bearer token. PID = a real project.

```
GET  /projects/${PID}/collaborators                       → 200 {"data":[]}
POST /projects/${PID}/collaborators body{}                → 404 {"error":"Not Found","path":"/projects/${PID}/collaborators"}
POST /projects/${PID}/collaborators body{"role":"editor"} → 404 (same)
POST /projects/${PID}/collaborators body{"userId":...}    → 404 (same)
```

Note the `path` is the right URL — Hono replies "Not Found" because **no POST handler is registered** for this route, only GET. The pass-1 row TC-PROJ-COLLAB-002 (`got=404 exp=404`) was a **false PASS** — it matched 404 for the wrong reason (route missing), not because of "user not found".

## Why this is a bug or spec-drift

`testcases/03-projects/TC-PROJ-COLLAB.md` documents `POST /projects/:id/collaborators` as the add-collaborator endpoint. Either:
- (a) the handler was never implemented or has been removed, **or**
- (b) the canonical path differs (e.g. `/projects/:id/collaborators/add` or `PATCH /projects/:id` with a `collaborators` field).

## Fix sketch

Identical pattern to BUG-CORPUS-WS-002 (missing POST /workspaces/:id/invites):
1. Implement the POST handler with the contract documented in TC-PROJ-COLLAB.md, **OR**
2. If using a different canonical path, update the TCs and routing.
3. Also consider DELETE /projects/:id/collaborators/:userId — likely the same gap.

## Evidence

- Runlog: testcases/99-runlog/env1/CORPUS-FULL-1.md (rows TC-PROJ-COLLAB-006, TC-PROJ-COLLAB-007 from pass 2; pass-1 TC-PROJ-COLLAB-002 was a false-PASS)
