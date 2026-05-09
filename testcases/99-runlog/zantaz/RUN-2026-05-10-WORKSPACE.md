# Doable zantaz — WORKSPACE shard run log (2026-05-10)

**Owner:** workspace-shard executor (Opus 4.7 1M)
**Target:** https://zantaz-api.doable.me
**Tokens:** testcases/evidence/_tokens-zantaz.json (qa-owner / qa-admin / qa-member / qa-viewer / qa-alice / qa-bob / qa-charlie)
**Corpus:** 02-workspace, 03-projects, 17-folders, 18-versions, 16-templates
**Hard deadline:** 5 minutes; will request extension if tests remain.

## Sanity (pre-run)
- `GET /auth/me` qa-owner → 200, isPlatformAdmin=true.
- `GET /workspaces` qa-owner → 200, two enterprise workspaces present:
  - `4bbd6afe-c396-4da6-add5-d71f73f51801` — qa-platform-owner (default)
  - `a5a1aabc-9999-0000-0000-000000000001` — qa-shared

## Result legend
PASS / FAIL / BLOCKED / PARTIAL / INFO

## Live runs (chronological)

| Test ID | UTC | Result | Notes |
|---------|-----|--------|-------|
| TC-WS-CRUD-001 | 18:39:58Z | PASS | got=200 exp=200 · GET /workspaces lists · {"data":[{"id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Platform Owner's workspace","slug":"qa-platform-owner","description":null,"avatar_url":null,"owner_id":"d58e6d7c-91 |
| TC-WS-CRUD-003 | 18:39:58Z | PASS | got=401 exp=401 · GET /workspaces no auth → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-WS-CRUD-004 | 18:39:59Z | PASS | got=201 exp=201 · POST /workspaces happy · {"data":{"id":"d1b3cec2-3a99-4dc7-a473-64699f80b9e0","name":"WS Smoke","slug":"ws-smoke-zz1","description":null,"avatar_url":null,"owner_id":"d58e6d7c-915a-414f-ac3b-f2161c0b508d", |
| TC-WS-CRUD-006 | 18:39:59Z | PASS | got=400 exp=400 · POST missing name → 400 · {"error":"Validation failed","details":{"name":["Required"]}} |
| TC-WS-CRUD-007 | 18:40:00Z | PASS | got=400 exp=400 · POST missing slug → 400 · {"error":"Validation failed","details":{"slug":["Required"]}} |
| TC-WS-CRUD-009 | 18:40:01Z | PASS | got=400 exp=400 · POST name 101 → 400 · {"error":"Validation failed","details":{"name":["String must contain at most 100 character(s)"]}} |
| TC-WS-CRUD-011 | 18:40:01Z | PASS | got=400 exp=400 · POST slug len 2 → 400 · {"error":"Validation failed","details":{"slug":["String must contain at least 3 character(s)"]}} |
| TC-WS-CRUD-014 | 18:40:02Z | PASS | got=400 exp=400 · POST slug len 49 → 400 · {"error":"Validation failed","details":{"slug":["String must contain at most 48 character(s)"]}} |
| TC-WS-CRUD-015 | 18:40:03Z | PASS | got=400 exp=400 · POST slug uppercase → 400 · {"error":"Validation failed","details":{"slug":["Invalid"]}} |
| TC-WS-CRUD-019 | 18:40:03Z | PASS | got=400 exp=400 · POST slug with underscore → 400 · {"error":"Validation failed","details":{"slug":["Invalid"]}} |
| TC-WS-CRUD-022 | 18:40:04Z | PASS | got=409 exp=409 · POST duplicate slug → 409 · {"error":"A workspace with this slug already exists"} |
| TC-WS-CRUD-029 | 18:40:05Z | PASS | got=200 exp=200 · GET /:id member returns 200 · {"data":{"id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"QA Platform Owner's workspace","slug":"qa-platform-owner","description":null,"avatar_url":null,"owner_id":"d58e6d7c-915 |
| TC-WS-CRUD-030 | 18:40:05Z | PASS | got=403 exp=403 · GET /:id non-member → 403 · {"error":"Not a member of this workspace"} |
| TC-WS-CRUD-032 | 18:40:06Z | PASS | got=500 exp= · GET /:id malformed UUID · {"error":"Internal Server Error"} |
| TC-WS-CRUD-033 | 18:40:45Z | FAIL | got=308 exp=200 · PATCH name as owner ·  |
| TC-WS-CRUD-038 | 18:40:45Z | FAIL | got=308 exp=200 · PATCH empty body no-op ·  |
| TC-WS-CRUD-039 | 18:40:46Z | FAIL | got=308 exp=200 · PATCH slug stripped silently ·  |
| TC-WS-CRUD-041 | 18:40:47Z | FAIL | got=308 exp=403 · PATCH non-member → 403 ·  |
| TC-WS-CRUD-042 | 18:40:48Z | FAIL | got=308 exp=200 · DELETE owner happy ·  |
| TC-WS-CRUD-046 | 18:40:48Z | FAIL | got=308 exp=403 · DELETE same id again → 403 ·  |
| TC-PROJ-CREATE-001 | 18:40:49Z | PASS | got=201 exp=201 · default vite-react · {"data":{"id":"d95d642b-a671-4104-a1e4-659caf06eeed","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"Smoke Vite","slug":"smoke-vite","description":null,"status":"draf |
| TC-PROJ-CREATE-002 | 18:40:50Z | PASS | got=201 exp=201 · explicit vite-react · {"data":{"id":"affea179-0ebc-46ba-a2a7-3d349b93bb1e","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"Vite Explicit","slug":"vite-explicit","description":null,"status" |
| TC-PROJ-CREATE-003 | 18:40:51Z | FAIL | got=403 exp=201 · explicit nextjs-app · {"error":"Framework \"nextjs-app\" is currently disabled by the platform admin."} |
| TC-PROJ-CREATE-004 | 18:40:51Z | PASS | got=403 exp=403 · disabled framework django → 403 · {"error":"Framework \"django\" is currently disabled by the platform admin."} |
| TC-PROJ-CREATE-005 | 18:40:52Z | PASS | got=403 exp=403 · non-existent fw made-up → 403 · {"error":"Framework \"made-up-fw\" is currently disabled by the platform admin."} |
