# BUG-CORPUS-WS-002 — /workspaces/:id/invites route 404 (not mounted)

**Severity:** high
**Env:** env1 (https://zantaz-api.doable.me)
**Found by:** Task #9 FULL-CORPUS-1 — corpus-runner-1 — 2026-05-10

## Reproduction

Auth: qa-owner Bearer token. Workspace exists (created via POST /workspaces in same run).

```
POST /workspaces/c722b88b-db1f-4650-a5f9-1e34aa43ca40/invites
body {"email":"new@doable.test","role":"member"}
→ 404 {"error":"Not Found","path":"/workspaces/c722b88b-.../invites"}
```

Same with GET /workspaces/:id/invites, POST with invalid email, POST with invalid role — all 404.

## Why this is a bug or spec-drift

`testcases/02-workspace/TC-WS-INVITES.md` documents `POST /workspaces/:id/invites` as the invite endpoint. Either:
- (a) the route was never implemented or has since been removed, **or**
- (b) the route lives at a different path (e.g. `/invites?workspaceId=...` or `/workspaces/:id/members/invite`).

A previous run (CORPUS-01-02-03 row TC-WS-INVITES-001) saw `GET /workspaces/:id/invites` return **200 `{"data":[]}`**, which means the GET handler exists. The POST handler is missing or mounted under a different verb.

## Fix sketch

- Implement `POST /workspaces/:id/invites` with the contract documented in TC-WS-INVITES.md, **OR**
- If the canonical path differs, update the TC and `_AUTHOR-GUIDE.md` route-validation section, and verify GET aligns.

## Evidence

- Runlog: testcases/99-runlog/env1/CORPUS-FULL-1.md (rows TC-WS-INVITES-002/003/004)
- Older PASS observation of GET: testcases/99-runlog/env1/CORPUS-01-02-03.md row TC-WS-INVITES-001
