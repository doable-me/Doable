# BUG-CORPUS-PROJ-004 — PATCH/DELETE /projects/00000000-...-000000000000 returns 200 instead of 404

**Severity:** medium
**Env:** env1 (https://zantaz-api.doable.me)
**Found by:** Task #9 FULL-CORPUS-1 — corpus-runner-1 — 2026-05-10

## Reproduction

Auth: qa-owner Bearer token.

```
PATCH /projects/00000000-0000-0000-0000-000000000000  body {"name":"X"}
→ 200 {"data":{"id":"00000000-0000-0000-0000-000000000000","workspace_id":"4bbd6afe-...","name":"X","slug":"p-moyoy1sc",...}}

DELETE /projects/00000000-0000-0000-0000-000000000000
→ 200 {"data":{"id":"00000000-0000-0000-0000-000000000000","deleted":true}}
```

A previous test (CORPUS-01-02-03 row TC-PROJ-FETCH-001) showed `GET /projects/00000000-...` also returns a stub project ("hi" / "p-moyoy1sc"). It looks like *some* code path *creates* a placeholder row for the all-zeros UUID, and subsequent PATCH/DELETE then silently mutate it.

## Why this is a bug

1. PATCH/DELETE for a non-existent project must return 404, not 200. Returning 200 misleads clients into thinking they modified a real project.
2. The lingering all-zeros row is itself anomalous — it's bound to workspace `4bbd6afe-c396-4da6-add5-d71f73f51801` (qa-platform-owner) and survives DELETE (which marks deleted=true but a follow-up GET still returns it). Smells like soft-delete + "auto-create-on-fetch" code path.

## Fix sketch

1. Find where the placeholder is created (likely a dev-seed / GET-or-create path) and remove it.
2. PATCH and DELETE must look up the row and return 404 if not found.
3. Add a regression TC: `GET /projects/00000000-...-000000000000` → 404.

## Evidence

- Runlog: testcases/99-runlog/env1/CORPUS-FULL-1.md (rows TC-PROJ-UPDATE-003, TC-PROJ-DELETE-003)
- Pre-existing observation: testcases/99-runlog/env1/CORPUS-01-02-03.md row TC-PROJ-FETCH-001
