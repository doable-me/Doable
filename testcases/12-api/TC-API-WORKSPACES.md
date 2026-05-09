# TC-API-WORKSPACES — /workspaces route group HTTP coverage

Mounted at `/workspaces` (`services/api/src/routes.ts:76,77,79,80,97,101-103`). Source: `services/api/src/routes/workspaces.ts` plus AI settings, providers, usage, connectors, skills, environments, env-vars sub-routers.

Endpoints (workspace CRUD slice — sub-routers covered in their own files):
- `GET    /workspaces`                              — list user's workspaces
- `POST   /workspaces`
- `GET    /workspaces/:wid`
- `PUT    /workspaces/:wid`
- `DELETE /workspaces/:wid`
- `GET    /workspaces/:wid/members`
- `POST   /workspaces/:wid/members`                  — invite
- `DELETE /workspaces/:wid/members/:userId`
- `PUT    /workspaces/:wid/members/:userId`          — change role
- `POST   /workspaces/:wid/leave`
- `POST   /workspaces/:wid/transfer`                 — transfer ownership
- `GET    /workspaces/:wid/usage`                    — credit usage
- `GET    /workspaces/:wid/billing/plan`
- `GET    /workspaces/:wid/log-filters`
- `POST   /workspaces/:wid/log-filters`

Auth: required.

---

## TC-API-WS-001 — GET /workspaces 200
- **Steps:** Bearer token, `GET /workspaces`.
- **Expected:** 200 `{data:[...]}` containing personal + invited workspaces, each with `id,name,slug,role,plan,createdAt`.
- **Severity:** smoke

## TC-API-WS-002 — GET /workspaces 401 no auth
- **Steps:** no token.
- **Expected:** 401.
- **Severity:** smoke

## TC-API-WS-003 — GET /workspaces returns role for caller
- **Pre:** User is `admin` in WS A and `viewer` in WS B.
- **Steps:** GET.
- **Expected:** Each row carries the caller's role; A=admin, B=viewer.
- **Severity:** high

## TC-API-WS-004 — POST /workspaces 201
- **Steps:** POST `{name:"QA Team", slug:"qa-team-001"}`.
- **Expected:** 201 with `id,role:"owner"`.
- **Severity:** smoke

## TC-API-WS-005 — POST /workspaces missing name → 400
- **Steps:** `{slug:"x"}`.
- **Expected:** 400.
- **Severity:** smoke

## TC-API-WS-006 — POST /workspaces duplicate slug → 409
- **Steps:** POST same slug twice.
- **Expected:** 409 `{error:"slug already taken"}`.
- **Severity:** high

## TC-API-WS-007 — POST /workspaces slug with spaces → 400
- **Steps:** `slug:"has spaces"`.
- **Expected:** 400 invalid slug.
- **Severity:** high

## TC-API-WS-008 — POST /workspaces slug uppercase → 400/normalised
- **Steps:** `slug:"QA-Team"`.
- **Expected:** 400 or auto-lowercased; record.
- **Severity:** medium

## TC-API-WS-009 — POST /workspaces slug 1-char → 400
- **Steps:** slug "a".
- **Expected:** 400 min length.
- **Severity:** medium

## TC-API-WS-010 — POST /workspaces over user workspace limit → 403/422
- **Pre:** User at plan max.
- **Steps:** POST.
- **Expected:** 403 / 422 plan limit.
- **Severity:** high

## TC-API-WS-011 — GET /workspaces/:wid 200
- **Steps:** GET own workspace.
- **Expected:** 200 detail.
- **Severity:** smoke

## TC-API-WS-012 — GET /workspaces/:wid not member → 403/404
- **Steps:** Other user's workspace.
- **Expected:** 403 or 404.
- **Severity:** smoke

## TC-API-WS-013 — GET /workspaces/:wid wid not UUID → 400
- **Steps:** GET /workspaces/abc.
- **Expected:** 400.
- **Severity:** high

## TC-API-WS-014 — GET /workspaces/:wid SQL injection
- **Steps:** wid=`1' OR 1=1`.
- **Expected:** 400 invalid UUID.
- **Severity:** smoke

## TC-API-WS-015 — PUT /workspaces/:wid by owner 200
- **Steps:** PUT name.
- **Expected:** 200.
- **Severity:** smoke

## TC-API-WS-016 — PUT /workspaces/:wid by admin 200
- **Steps:** Admin updates name.
- **Expected:** 200 (admins allowed).
- **Severity:** medium

## TC-API-WS-017 — PUT /workspaces/:wid by viewer → 403
- **Steps:** Viewer updates.
- **Expected:** 403.
- **Severity:** high

## TC-API-WS-018 — PUT /workspaces/:wid changing slug to taken → 409
- **Steps:** PUT slug already in use.
- **Expected:** 409.
- **Severity:** high

## TC-API-WS-019 — DELETE /workspaces/:wid by owner 204
- **Pre:** No projects (or cascade allowed).
- **Steps:** DELETE.
- **Expected:** 204.
- **Severity:** smoke

## TC-API-WS-020 — DELETE /workspaces/:wid by admin → 403
- **Steps:** Non-owner admin.
- **Expected:** 403 (only owner).
- **Severity:** smoke

## TC-API-WS-021 — DELETE /workspaces/:wid with active subscription → 400/409
- **Steps:** DELETE while billing active.
- **Expected:** 400/409 cancel-first error.
- **Severity:** high

## TC-API-WS-022 — DELETE /workspaces/:wid personal workspace → 400
- **Steps:** Try to delete the auto-created personal WS.
- **Expected:** 400 cannot delete personal.
- **Severity:** high

## TC-API-WS-023 — GET /workspaces/:wid/members 200
- **Steps:** GET.
- **Expected:** 200 `data:[{userId,email,displayName,role,joinedAt}]`.
- **Severity:** smoke

## TC-API-WS-024 — GET /workspaces/:wid/members non-member → 403/404
- **Steps:** Outsider GETs.
- **Expected:** 403 or 404.
- **Severity:** smoke

## TC-API-WS-025 — POST /workspaces/:wid/members invite by email 201
- **Steps:** POST `{email:"new@user.com",role:"editor"}`.
- **Expected:** 201 invite created.
- **Severity:** high

## TC-API-WS-026 — POST members invalid role → 400
- **Steps:** role "supremo".
- **Expected:** 400 enum.
- **Severity:** high

## TC-API-WS-027 — POST members duplicate active member → 409
- **Steps:** Invite existing member.
- **Expected:** 409.
- **Severity:** medium

## TC-API-WS-028 — POST members exceed seat limit → 403/422
- **Pre:** Plan seat cap reached.
- **Steps:** Invite one more.
- **Expected:** 403/422.
- **Severity:** high

## TC-API-WS-029 — POST members with malformed email → 400
- **Steps:** email "no-at-sign".
- **Expected:** 400.
- **Severity:** high

## TC-API-WS-030 — PUT /workspaces/:wid/members/:userId change role 200
- **Steps:** PUT role:admin.
- **Expected:** 200.
- **Severity:** medium

## TC-API-WS-031 — PUT change own role lower than required for action → 400
- **Steps:** Owner demotes self with no other owner.
- **Expected:** 400 must transfer first.
- **Severity:** high

## TC-API-WS-032 — DELETE /workspaces/:wid/members/:userId 204
- **Steps:** Remove member.
- **Expected:** 204.
- **Severity:** smoke

## TC-API-WS-033 — DELETE owner → 400
- **Steps:** Try to remove the owner.
- **Expected:** 400 cannot remove sole owner.
- **Severity:** high

## TC-API-WS-034 — DELETE non-member → 404
- **Steps:** UserId never in workspace.
- **Expected:** 404.
- **Severity:** medium

## TC-API-WS-035 — POST /workspaces/:wid/leave 204
- **Steps:** Member leaves.
- **Expected:** 204; no longer in members list.
- **Severity:** medium

## TC-API-WS-036 — POST /workspaces/:wid/leave by sole owner → 400
- **Steps:** Owner leaves.
- **Expected:** 400 transfer first.
- **Severity:** high

## TC-API-WS-037 — POST /workspaces/:wid/transfer 200
- **Steps:** Owner transfers to admin.
- **Expected:** 200; new owner.
- **Severity:** high

## TC-API-WS-038 — POST transfer to non-member → 400
- **Steps:** Random userId.
- **Expected:** 400.
- **Severity:** high

## TC-API-WS-039 — GET /workspaces/:wid/usage 200
- **Steps:** GET.
- **Expected:** 200 `{usedCredits,totalCredits,resetAt,...}`.
- **Severity:** smoke

## TC-API-WS-040 — GET /workspaces/:wid/usage by viewer 200
- **Steps:** Viewer GETs.
- **Expected:** 200 (read).
- **Severity:** medium

## TC-API-WS-041 — GET /workspaces/:wid/billing/plan 200
- **Steps:** GET.
- **Expected:** 200 plan info.
- **Severity:** smoke

## TC-API-WS-042 — GET /workspaces/:wid/log-filters 200
- **Steps:** GET.
- **Expected:** 200 `data:[]`.
- **Severity:** medium

## TC-API-WS-043 — POST /workspaces/:wid/log-filters 201
- **Steps:** POST `{name:"Errors only", pattern:"level=error"}`.
- **Expected:** 201.
- **Severity:** medium

## TC-API-WS-044 — POST log-filters invalid pattern → 400
- **Steps:** Pattern `(unbalanced`.
- **Expected:** 400.
- **Severity:** medium

## TC-API-WS-045 — Unicode workspace name
- **Steps:** name "工作区 🌍".
- **Expected:** 201; persisted.
- **Severity:** low

## TC-API-WS-046 — Slug edge: trailing dash
- **Steps:** slug "abc-".
- **Expected:** 400.
- **Severity:** medium

## TC-API-WS-047 — Slug edge: starts with digit
- **Steps:** slug "1abc".
- **Expected:** 200/400 — record.
- **Severity:** medium

## TC-API-WS-048 — Slug 50+ chars → 400
- **Steps:** slug 60-char.
- **Expected:** 400 max length.
- **Severity:** medium

## TC-API-WS-049 — POST /workspaces empty body → 400
- **Steps:** Body `{}`.
- **Expected:** 400.
- **Severity:** smoke

## TC-API-WS-050 — Wrong content-type form-encoded → 415/400
- **Steps:** `name=foo&slug=bar`.
- **Expected:** 415 or 400.
- **Severity:** medium

## TC-API-WS-051 — Idempotency-Key on POST /workspaces
- **Steps:** Repeat with same key.
- **Expected:** Same body; only one row.
- **Severity:** medium

## TC-API-WS-052 — Path SQL injection on /members/:userId
- **Steps:** userId=`1' OR '1=1`.
- **Expected:** 400.
- **Severity:** smoke

## TC-API-WS-053 — Header injection on POST /members
- **Steps:** CRLF in custom header.
- **Expected:** 400 or sanitized.
- **Severity:** medium

## TC-API-WS-054 — Pagination on /members ?cursor=
- **Steps:** Empty cursor.
- **Expected:** 200 first page.
- **Severity:** medium

## TC-API-WS-055 — Pagination cursor beyond end
- **Steps:** Far-future cursor.
- **Expected:** 200 empty data.
- **Severity:** medium

## TC-API-WS-056 — Filter members by role=admin
- **Steps:** GET ?role=admin.
- **Expected:** Only admins.
- **Severity:** medium

## TC-API-WS-057 — Filter members by role=invalid → 400
- **Steps:** ?role=galaxybrain.
- **Expected:** 400.
- **Severity:** medium

## TC-API-WS-058 — Large page size capped
- **Steps:** ?limit=10000.
- **Expected:** 200 capped to 100.
- **Severity:** medium

## TC-API-WS-059 — CORS preflight allow staging
- **Steps:** OPTIONS /workspaces.
- **Expected:** 204 with allow.
- **Severity:** smoke

## TC-API-WS-060 — DB unavailable mid-create → 500 JSON
- **Pre:** DB stop.
- **Steps:** POST /workspaces.
- **Expected:** 500 JSON envelope.
- **Severity:** medium

## TC-API-WS-061 — DELETE workspace with members blocked → 400
- **Steps:** DELETE while members > 1.
- **Expected:** 400 must remove members.
- **Severity:** high

## TC-API-WS-062 — Trailing slash variant
- **Steps:** GET /workspaces/.
- **Expected:** Same as /workspaces.
- **Severity:** low
