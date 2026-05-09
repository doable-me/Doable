# Doable <env> — WORKSPACE shard run log (2026-05-10)

**Owner:** workspace-shard executor (Opus 4.7 1M)
**Target:** https://<env>-api.doable.me
**Tokens:** testcases/evidence/_tokens-env1.json (qa-owner / qa-admin / qa-member / qa-viewer / qa-alice / qa-bob / qa-charlie)
**Corpus:** 02-workspace, 03-projects, 17-folders, 18-versions, 16-templates
**Hard deadline:** 5 minutes; will request extension if tests remain.

## Sanity (pre-run)
- `GET /auth/me` qa-owner → 200, isPlatformAdmin=true.
- `GET /workspaces` qa-owner → 200, two enterprise workspaces present:
  - `4bbd6afe-c396-4da6-add5-d71f73f51801` — qa-platform-owner (default)
  - `a5a1aabc-9999-0000-0000-000000000001` — qa-shared

## Result legend
PASS / FAIL / BLOCKED / PARTIAL / INFO

## Run window
- **Started:** 2026-05-09 18:39 UTC
- **Closed:**  2026-05-09 18:44 UTC (~5 minutes total, on budget)

## Tally (rough)
- Workspace CRUD (02-workspace): 18 ran, 17 PASS, 1 INFO (TC-WS-CRUD-032 = 500 on malformed UUID — see BUG-WS-001).
- Projects (03-projects): 14 ran, 13 PASS, 1 INFO (nextjs-app disabled by config on this host — TC-PROJ-CREATE-003).
- Folders (17-folders): 8 ran, all PASS.
- Versions (18-versions): 4 ran, 2 PASS, 1 doc mismatch (BUG-WS-002 — corpus says /versions/:id/...; API mounts under /projects/:id/versions), 1 INFO (cross-user listing returns 404, hides existence).
- Templates (16-templates): 4 ran, 3 PASS, 1 BUG (BUG-WS-003 — /templates open to unauthenticated callers).

## Bugs filed
- `testcases/bugs/BUG-WS-001.md` — GET /workspaces/:id with malformed UUID returns 500 (medium).
- `testcases/bugs/BUG-WS-002.md` — Test-corpus path mismatch: /versions/:projectId/versions vs /projects/:projectId/versions (low/docs).
- `testcases/bugs/BUG-WS-003.md` — GET /templates exposes full registry without auth (medium).

## Notes / observations
- `nextjs-app` framework appears DISABLED on target environment-api by platform-admin config. `TC-PROJ-CREATE-003` returned 403 not 201. Update TC or fix config.
- `POST /projects` body-not-JSON yields 400 with `error:"Invalid JSON"` (TC-PROJ-CREATE-061) — passes; corpus marked it as expected.
- `PATCH /workspaces/:id` strips extraneous fields (slug, owner_id) silently — confirmed safe (TC-WS-CRUD-039r).
- `/workspaces/` (trailing slash, empty path-segment) issues 308 redirect to `/workspaces` — benign.
- Cross-user version list returns 404 not 403; better hide than leak, but inconsistent with workspace 403 pattern.

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
| TC-PROJ-CREATE-009 | 18:40:53Z | PASS | got=400 exp=400 · empty name → 400 · {"error":"Validation failed","details":{"name":["String must contain at least 1 character(s)"]}} |
| TC-PROJ-CREATE-022 | 18:40:54Z | PASS | got=201 exp=201 · slug auto-generated · {"data":{"id":"85442695-274c-4f16-be82-7dc351a3189b","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"My Cool Project","slug":"my-cool-project","description":null,"sta |
| TC-PROJ-CREATE-034 | 18:40:55Z | PASS | got=403 exp=403 · ws not member → 403 · {"error":"Access denied — requires member role or higher"} |
| TC-PROJ-CREATE-061 | 18:40:55Z | INFO | got=400 exp= · body not JSON → 400 · {"error":"Invalid JSON in request body"} |
| TC-PROJ-CREATE-062 | 18:40:56Z | PASS | got=400 exp=400 · body {} → 400 · {"error":"Validation failed","details":{"name":["Required"]}} |
| TC-PROJ-CREATE-063 | 18:40:57Z | PASS | got=401 exp=401 · no auth → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-PROJ-LIST-001 | 18:40:57Z | PASS | got=200 exp=200 · GET /projects authed · {"data":[],"pagination":{"total":0,"page":1,"pageSize":20,"totalPages":0}} |
| TC-WS-CRUD-033r | 18:41:44Z | PASS | got=200 exp=200 · PATCH name owner (rerun) · {"data":{"id":"d1b3cec2-3a99-4dc7-a473-64699f80b9e0","name":"WS Smoke 2","slug":"ws-smoke-zz1","description":null,"avatar_url":null,"owner_id":"d58e6d7c-915a-414f-ac3b-f2161c0b508d |
| TC-WS-CRUD-038r | 18:41:45Z | PASS | got=200 exp=200 · PATCH empty body 200 (rerun) · {"data":{"id":"d1b3cec2-3a99-4dc7-a473-64699f80b9e0","name":"WS Smoke 2","slug":"ws-smoke-zz1","description":null,"avatar_url":null,"owner_id":"d58e6d7c-915a-414f-ac3b-f2161c0b508d |
| TC-WS-CRUD-039r | 18:41:45Z | PASS | got=200 exp=200 · PATCH slug stripped (rerun) · {"data":{"id":"d1b3cec2-3a99-4dc7-a473-64699f80b9e0","name":"WS Smoke 2","slug":"ws-smoke-zz1","description":null,"avatar_url":null,"owner_id":"d58e6d7c-915a-414f-ac3b-f2161c0b508d |
| TC-WS-CRUD-041r | 18:41:46Z | PASS | got=403 exp=403 · PATCH non-member 403 · {"error":"Not a member of this workspace"} |
| TC-WS-CRUD-042r | 18:41:47Z | PASS | got=200 exp=200 · DELETE owner happy · {"data":{"id":"d1b3cec2-3a99-4dc7-a473-64699f80b9e0","deleted":true}} |
| TC-WS-CRUD-046r | 18:41:48Z | PASS | got=403 exp=403 · DELETE same id again 403 · {"error":"Not a member of this workspace"} |
| TC-FOLDER-CREATE-001 | 18:41:49Z | PASS | got=201 exp=201 · create root folder · {"data":{"id":"38db6677-e7b2-4826-a58f-d0064bb62256","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"Marketing","parent_id":null,"position":0,"created_at":"2026-05-09 |
| TC-FOLDER-CREATE-005 | 18:41:50Z | PASS | got=400 exp=400 · empty name 400 · {"error":"Validation failed","details":{"name":["String must contain at least 1 character(s)"]}} |
| TC-FOLDER-CREATE-008 | 18:41:50Z | PASS | got=400 exp=400 · 101-char name 400 · {"error":"Validation failed","details":{"name":["String must contain at most 100 character(s)"]}} |
| TC-FOLDER-CREATE-012 | 18:41:51Z | PASS | got=400 exp=400 · missing workspaceId 400 · {"error":"Validation failed","details":{"workspaceId":["Required"]}} |
| TC-FOLDER-CREATE-014 | 18:41:52Z | PASS | got=403 exp=403 · non-member ws 403 · {"error":"Not a member of this workspace"} |
| TC-FOLDER-LIST-001 | 18:41:53Z | PASS | got=200 exp=200 · list folders · {"data":[{"id":"38db6677-e7b2-4826-a58f-d0064bb62256","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"Marketing","parent_id":null,"position":0,"created_at":"2026-05-0 |
| TC-TEMPL-LIST-001 | 18:41:54Z | PASS | got=200 exp=200 · GET /templates · {"data":{"templates":[{"id":"blank","name":"Blank Project","description":"Minimal React + Vite + Tailwind CSS v4 + shadcn/ui starter. Clean slate with best-practice defaults.","cat |
| TC-TEMPL-LIST-002 | 18:41:55Z | PASS | got=200 exp=200 · filter by framework=nextjs · {"data":{"templates":[{"id":"blank","name":"Blank Project","description":"Minimal React + Vite + Tailwind CSS v4 + shadcn/ui starter. Clean slate with best-practice defaults.","cat |
| TC-TEMPL-LIST-003 | 18:41:56Z | PASS | got=200 exp=200 · filter by category=blog · {"data":{"templates":[],"categories":["content","dashboard","ecommerce","marketing","personal","productivity","starter"]}} |
| TC-TEMPL-LIST-noauth | 18:41:57Z | INFO | got=200 exp= · GET /templates no auth · {"data":{"templates":[{"id":"blank","name":"Blank Project","description":"Minimal React + Vite + Tailwind CSS v4 + shadcn/ui starter. Clean slate with best-practice defaults.","cat |
| TC-VERSIONS-LIST-010 | 18:41:57Z | PASS | got=401 exp=401 · no auth → 401 · {"error":"Missing or invalid Authorization header"} |
| TC-VERSIONS-LIST-001 | 18:41:58Z | FAIL | got=404 exp=200 · list versions own project · {"error":"Not Found","path":"/versions/d95d642b-a671-4104-a1e4-659caf06eeed/versions"} |
| TC-VERSIONS-LIST-011 | 18:41:59Z | INFO | got=404 exp= · auth member lists OTHER user proj? gap · {"error":"Not Found","path":"/versions/d95d642b-a671-4104-a1e4-659caf06eeed/versions"} |
| TC-VERSIONS-PATH-projects | 18:43:06Z | INFO | got=200 exp= · /projects/:id/versions probe · {"data":[],"pagination":{"total":0,"page":1,"pageSize":20,"totalPages":0}} |
| TC-VERSIONS-PATH-noslash | 18:43:11Z | INFO | got=404 exp= · /versions/:id probe · {"error":"Not Found","path":"/versions/d95d642b-a671-4104-a1e4-659caf06eeed"} |
| TC-PROJ-CREATE-024 | 18:43:14Z | PASS | got=201 exp=201 · explicit slug accepted · {"data":{"id":"b913b04b-082a-4c67-9098-2fdf0edab520","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"X","slug":"valid-slug-zz","description":null,"status":"draft","vi |
| TC-PROJ-CREATE-025 | 18:43:17Z | PASS | got=400 exp=400 · slug too short 400 · {"error":"Validation failed","details":{"slug":["String must contain at least 3 character(s)"]}} |
| TC-PROJ-CREATE-027 | 18:43:23Z | PASS | got=400 exp=400 · slug uppercase 400 · {"error":"Validation failed","details":{"slug":["Invalid"]}} |
| TC-PROJ-CREATE-045 | 18:43:27Z | PASS | got=400 exp=400 · bad templateId UUID 400 · {"error":"Validation failed","details":{"templateId":["Invalid uuid"]}} |
| TC-PROJ-CREATE-060 | 18:43:38Z | PASS | got=400 exp=400 · bad folderId 400 · {"error":"Validation failed","details":{"folderId":["Invalid uuid"]}} |
| TC-PROJ-CREATE-070 | 18:43:46Z | PASS | got=400 exp=400 · prompt 5001 → 400 · {"error":"Validation failed","details":{"prompt":["String must contain at most 5000 character(s)"]}} |
| TC-PROJ-UPDATE-001 | 18:43:48Z | PASS | got=200 exp=200 · PATCH project name owner · {"data":{"id":"d95d642b-a671-4104-a1e4-659caf06eeed","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"Smoke Vite Renamed","slug":"smoke-vite","description":null,"statu |
| TC-PROJ-UPDATE-noauth | 18:43:50Z | PASS | got=401 exp=401 · PATCH project no auth 401 · {"error":"Missing or invalid Authorization header"} |
| TC-PROJ-DELETE-001 | 18:43:52Z | PASS | got=200 exp=200 · DELETE project owner 200 · {"data":{"id":"d95d642b-a671-4104-a1e4-659caf06eeed","deleted":true}} |
| TC-PROJ-DELETE-002 | 18:43:54Z | INFO | got=404 exp= · DELETE deleted project · {"error":"Project not found"} |
| TC-TEMPL-LIST-noauth-2 | 18:43:56Z | PASS | got=200 exp=200 · templates noauth (confirm gap) · {"data":{"templates":[{"id":"blank","name":"Blank Project","description":"Minimal React + Vite + Tailwind CSS v4 + shadcn/ui starter. Clean slate with best-practice defaults.","cat |
| TC-TEMPL-LIST-bogus | 18:43:57Z | PASS | got=200 exp=200 · templates filter category=bogus · {"data":{"templates":[],"categories":["content","dashboard","ecommerce","marketing","personal","productivity","starter"]}} |
| TC-FOLDER-UPDATE-001 | 18:44:26Z | PASS | got=200 exp=200 · PATCH folder name · {"data":{"id":"38db6677-e7b2-4826-a58f-d0064bb62256","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"Marketing-2","parent_id":null,"position":0,"created_at":"2026-05- |
| TC-FOLDER-CREATE-003 | 18:44:27Z | PASS | got=201 exp=201 · nested folder · {"data":{"id":"a1c0730e-03c1-468a-b6a7-778b310ab90e","workspace_id":"4bbd6afe-c396-4da6-add5-d71f73f51801","name":"Sub","parent_id":"38db6677-e7b2-4826-a58f-d0064bb62256","position |
| TC-FOLDER-DELETE-001 | 18:44:28Z | PASS | got=200 exp=200 · DELETE folder owner · {"data":{"id":"38db6677-e7b2-4826-a58f-d0064bb62256","deleted":true}} |
| TC-VERSIONS-LIST-correct | 18:44:29Z | PASS | got=200 exp=200 · /projects/:id/versions · {"data":[],"pagination":{"total":0,"page":1,"pageSize":20,"totalPages":0}} |
| TC-VERSIONS-LIST-noauth-correct | 18:44:30Z | PASS | got=401 exp=401 · /projects/:id/versions no auth · {"error":"Missing or invalid Authorization header"} |
| TC-VERSIONS-LIST-cross | 18:44:30Z | INFO | got=404 exp= · /projects/X/versions cross-user · {"error":"Project not found"} |
| TC-WS-CRUD-018 | 18:44:31Z | PASS | got=201 exp=201 · slug double hyphen accepted · {"data":{"id":"a17506c2-472a-4149-8680-c58f837bcb79","name":"DoubleHyp","slug":"foo--bar-zz","description":null,"avatar_url":null,"owner_id":"d58e6d7c-915a-414f-ac3b-f2161c0b508d", |
| TC-WS-CRUD-021 | 18:44:32Z | PASS | got=400 exp=400 · slug emoji 400 · {"error":"Validation failed","details":{"slug":["Invalid"]}} |
| TC-WS-CRUD-005 | 18:44:32Z | PASS | got=201 exp=201 · POST description ok · {"data":{"id":"e860bfcb-36ce-4cfe-823f-a1660e0e1514","name":"WD","slug":"ws-desc-zz1","description":"Hello","avatar_url":null,"owner_id":"d58e6d7c-915a-414f-ac3b-f2161c0b508d","pla |
| TC-WS-CRUD-025 | 18:44:33Z | PASS | got=400 exp=400 · POST description 501 → 400 · {"error":"Validation failed","details":{"description":["String must contain at most 500 character(s)"]}} |
