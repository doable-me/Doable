# TC-GH-TENANT-ISOLATION — Cross-tenant GitHub project routes must 404

Regression coverage for **BUG-CORPUS-GH-001** (cross-tenant data leak via
`/:projectId/github/*`). All `github/*` project routes share a single
membership guard (`requireProjectAccess`) chained right after
`authMiddleware`; a non-member must receive `404 {"error":"Project not
found"}` (existence-hiding, matching `/projects/:id`).

Spec: `services/api/src/routes/github/project-routes.ts` — `use("/:projectId/github/*", ...)` guard.
Helper: `services/api/src/routes/projects/helpers.ts::requireProjectAccess`.

---

## TC-GH-TENANT-ISOLATION-001
**Title:** Non-member GET /:pid/github/status → 404
**Pre:** `qa-owner` owns project P1 in workspace W1. `qa-bob` is in
workspace W2 only (no membership in W1, not a `project_collaborators`
row on P1, not a platform admin). P1 visibility = `private`.
**Steps:**
1. `curl -sS -H "Authorization: Bearer $TOK_BOB" $API/$P1/github/status`
**Expected:** HTTP 404 with body `{"error":"Project not found"}`.
No `repoOwner`, `repoName`, `repoUrl`, `lastCommitSha` field
appears anywhere in the response.
**Severity:** High

## TC-GH-TENANT-ISOLATION-002
**Title:** Non-member GET /:pid/github/commits → 404
**Pre:** Same as 001.
**Steps:**
1. `curl -sS -H "Authorization: Bearer $TOK_BOB" "$API/$P1/github/commits?page=1&pageSize=20"`
**Expected:** 404 `{"error":"Project not found"}`. No `commits` array
returned even when empty.
**Severity:** High

## TC-GH-TENANT-ISOLATION-003
**Title:** Non-member POST /:pid/github/connect → 404
**Pre:** Same as 001. Bob holds his own valid GH token (`X-GitHub-Token`).
**Steps:**
1. `curl -sS -XPOST -H "Authorization: Bearer $TOK_BOB" -H "Content-Type: application/json" -d '{"repoOwner":"bobx","repoName":"hijack"}' $API/$P1/github/connect`
**Expected:** 404 `{"error":"Project not found"}`. P1's
`projects.github_repo_url` and `github_connections` row remain
untouched (verify via DB).
**Severity:** High

## TC-GH-TENANT-ISOLATION-004
**Title:** Non-member POST /:pid/github/push → 404
**Pre:** Same as 001.
**Steps:**
1. `curl -sS -XPOST -H "Authorization: Bearer $TOK_BOB" -H "Content-Type: application/json" -d '{"message":"x","projectPath":"/tmp/x"}' $API/$P1/github/push`
**Expected:** 404 `{"error":"Project not found"}`. No filesystem
`getProjectPath(P1)` access attempted (check api log — should not see
`[GitHub] push` entry for P1).
**Severity:** High

## TC-GH-TENANT-ISOLATION-005
**Title:** Non-member POST /:pid/github/pull → 404
**Pre:** Same as 001.
**Steps:**
1. `curl -sS -XPOST -H "Authorization: Bearer $TOK_BOB" -H "Content-Type: application/json" -d '{"projectPath":"/tmp/x"}' $API/$P1/github/pull`
**Expected:** 404 `{"error":"Project not found"}`.
**Severity:** High

## TC-GH-TENANT-ISOLATION-006
**Title:** Non-member POST /:pid/github/import → 404
**Pre:** Same as 001.
**Steps:**
1. `curl -sS -XPOST -H "Authorization: Bearer $TOK_BOB" -H "Content-Type: application/json" -d '{"repoOwner":"bobx","repoName":"x"}' $API/$P1/github/import`
**Expected:** 404 `{"error":"Project not found"}`.
**Severity:** High

## TC-GH-TENANT-ISOLATION-007
**Title:** Non-member POST /:pid/github/resolve → 404
**Pre:** Same as 001.
**Steps:**
1. `curl -sS -XPOST -H "Authorization: Bearer $TOK_BOB" -H "Content-Type: application/json" -d '{"strategy":"ours","projectPath":"/tmp/x"}' $API/$P1/github/resolve`
**Expected:** 404 `{"error":"Project not found"}`. No row in
`github_connections` for P1 is mutated.
**Severity:** High

## TC-GH-TENANT-ISOLATION-008
**Title:** Non-member POST /:pid/github/abort-merge → 404
**Pre:** Same as 001.
**Steps:**
1. `curl -sS -XPOST -H "Authorization: Bearer $TOK_BOB" -H "Content-Type: application/json" -d '{"projectPath":"/tmp/x"}' $API/$P1/github/abort-merge`
**Expected:** 404 `{"error":"Project not found"}`.
**Severity:** High

## TC-GH-TENANT-ISOLATION-009
**Title:** Non-member DELETE /:pid/github/connect → 404
**Pre:** Same as 001 — P1 currently has a `github_connections` row.
**Steps:**
1. `curl -sS -XDELETE -H "Authorization: Bearer $TOK_BOB" $API/$P1/github/connect`
**Expected:** 404 `{"error":"Project not found"}`. P1's
`github_connections` row is **still present** afterwards (verify via
`SELECT count(*) FROM github_connections WHERE project_id = $P1`).
**Severity:** Critical (otherwise non-members can DoS another
tenant's GitHub link.)

## TC-GH-TENANT-ISOLATION-010
**Title:** Project collaborator (non-workspace-member) → 200
**Pre:** Bob is added to P1 as a `project_collaborators` editor.
**Steps:**
1. `curl -sS -H "Authorization: Bearer $TOK_BOB" $API/$P1/github/status`
**Expected:** 200 — collaborator path of `requireProjectAccess`
grants access; no false-positive denial.
**Severity:** Medium

## TC-GH-TENANT-ISOLATION-011
**Title:** Workspace member → 200 (positive control)
**Pre:** `qa-owner` (W1 owner) calls own project.
**Steps:**
1. `curl -sS -H "Authorization: Bearer $TOK_OWNER" $API/$P1/github/status`
**Expected:** 200 with the real status payload.
**Severity:** Medium

## TC-GH-TENANT-ISOLATION-012
**Title:** Platform admin → 200 (moderation path)
**Pre:** `users.is_platform_admin = true` for an admin caller who is
NOT in W1.
**Steps:**
1. `curl -sS -H "Authorization: Bearer $TOK_ADMIN" $API/$P1/github/status`
**Expected:** 200. Confirms the admin branch of
`requireProjectAccess` still works under the new guard.
**Severity:** Low

## TC-GH-TENANT-ISOLATION-013
**Title:** Webhook route is unaffected
**Pre:** N/A
**Steps:**
1. `curl -sS -XPOST -H "X-GitHub-Event: ping" -H "Content-Type: application/json" -d '{"zen":"x"}' $API/github/webhook`
**Expected:** 200/202 — the membership guard is scoped to
`/:projectId/github/*` and must not match `/github/webhook`.
**Severity:** Critical

## TC-GH-TENANT-ISOLATION-014
**Title:** Unknown projectId → 404 (no enumeration oracle)
**Pre:** Random UUID for a project that does not exist.
**Steps:**
1. `curl -sS -H "Authorization: Bearer $TOK_BOB" $API/00000000-0000-0000-0000-000000000000/github/status`
**Expected:** 404 `{"error":"Project not found"}` — same body as
non-member case so attacker cannot distinguish "project exists but
forbidden" from "project doesn't exist".
**Severity:** High
