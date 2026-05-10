# BUG-CORPUS-GH-001 — Cross-tenant read of project GitHub status / commits

**Severity:** high (info disclosure across workspaces)
**Filed:** 2026-05-10 (env1 / zantaz)
**Status:** OPEN

## Symptom

`qa-bob` (member of his own workspace only — `GET /projects/<pid>` returns
`{"error":"Project not found"}`) can still read GitHub-project routes for a
project owned by another workspace:

```
GET /<pid>/github/status   → 200  {"data":{"connected":false,"status":"disconnected",...}}
GET /<pid>/github/commits  → 200  {"data":{"commits":[],"total":0}}
```

Both ought to return 403 or 404 — qa-bob has no membership relation to the
project's workspace.

## Repro
```
TOK_BOB=$(jq -r '."qa-bob".access' testcases/evidence/_tokens-env1.json)
PID=<a project belonging to a workspace bob is NOT in>
curl -sS -H "Authorization: Bearer $TOK_BOB" https://zantaz-api.doable.me/$PID/github/status
# expected: 403 / 404. actual: 200 with payload
```

## Root cause

`services/api/src/routes/github/project-routes.ts` only chains
`authMiddleware` on `/:projectId/github/*` — there is no project-membership
check before the GitHub status / commits handlers run, unlike
`/projects/:id` which 404s on miss.

## Why it matters today

Today the leaked fields are fairly inert (`connected:false`, empty branch
defaults, empty commit list). But:

1. For projects that ARE connected, this reveals `repoOwner / repoName /
   repoUrl / lastCommitSha`, which can disclose private GH repo names and
   commit hashes.
2. The handler runs DB queries on a foreign project_id keyed only by
   `:projectId`, which is enumerable.

## Fix sketch

Add a `requireProjectMember` guard (already used by other project routes —
see `services/api/src/routes/projects/item-routes.ts`) before the GH status,
commits, push, pull, import, resolve, abort-merge, connect handlers in
`services/api/src/routes/github/project-routes.ts`.

## Evidence

- `testcases/evidence/env1/TC-GH-PROJ-STATUS-RBAC.body` — leaked status
- `testcases/evidence/env1/TC-GH-PROJ-COMMITS.body` — bob's read of commits
