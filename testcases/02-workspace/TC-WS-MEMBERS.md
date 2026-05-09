# TC-WS-MEMBERS — Members CRUD, role enforcement

API: `/workspaces/:id/members[/:userId]`. Source: `services/api/src/routes/workspaces.ts:241-252, 366-434`.

## TC-WS-MEM-001 — GET /:id/members lists members (viewer+)
- **Pre:** ws has 3 members; caller is viewer.
- **Steps:** GET.
- **Expected:** 200 `{data:[{user_id,role,user:{...}}]}` length 3.
- **Severity:** smoke

## TC-WS-MEM-002 — GET /:id/members non-member → 403
- **Severity:** smoke

## TC-WS-MEM-003 — GET /:id/members on non-existent ws → 404
- **Steps:** Random UUID.
- **Expected:** 403 (role lookup fails first).
- **Severity:** medium

## TC-WS-MEM-004 — Member listing sanitises user (no password_hash)
- **Severity:** smoke

## TC-WS-MEM-005 — DELETE /:id/members/:userId from owner
- **Pre:** target is member; caller owner.
- **Steps:** DELETE.
- **Expected:** 200 `{data:{workspaceId,userId,removed:true}}`.
- **Severity:** smoke

## TC-WS-MEM-006 — DELETE /:id/members/:userId from admin (target=member) → 200
- **Severity:** smoke

## TC-WS-MEM-007 — DELETE /:id/members/:userId admin removing admin → 403
- **Steps:** Admin removes another admin.
- **Expected:** 403 `{"error":"Only workspace owners can remove admins"}`.
- **Severity:** high

## TC-WS-MEM-008 — DELETE owner removing admin → 200
- **Severity:** medium

## TC-WS-MEM-009 — DELETE self → 400 (use leave instead)
- **Steps:** DELETE /:id/members/<callerId>.
- **Expected:** 400 `Cannot remove yourself`.
- **Severity:** high

## TC-WS-MEM-010 — DELETE workspace owner → 400
- **Steps:** DELETE /:id/members/<ownerId> as another owner-equivalent (rare).
- **Expected:** 400 `Cannot remove the workspace owner`.
- **Severity:** high

## TC-WS-MEM-011 — DELETE non-member → 404
- **Steps:** DELETE userId not in ws.
- **Expected:** 404 `Member not found`.
- **Severity:** medium

## TC-WS-MEM-012 — DELETE from member role → 403
- **Severity:** smoke

## TC-WS-MEM-013 — DELETE from viewer → 403
- **Severity:** smoke

## TC-WS-MEM-014 — DELETE non-existent userId (random uuid)
- **Steps:** DELETE.
- **Expected:** 404.
- **Severity:** medium

## TC-WS-MEM-015 — PATCH /:id/members/:userId role to admin (owner only)
- **Pre:** Caller owner.
- **Steps:** PATCH `{role:"admin"}`.
- **Expected:** 200 with updated row.
- **Severity:** smoke

## TC-WS-MEM-016 — PATCH role from admin → 403
- **Steps:** Admin caller.
- **Expected:** 403 `Requires owner role or higher`.
- **Severity:** smoke

## TC-WS-MEM-017 — PATCH role from member → 403
- **Severity:** smoke

## TC-WS-MEM-018 — PATCH change own role → 400
- **Steps:** Owner PATCHes own row.
- **Expected:** 400 `Cannot change your own role`.
- **Severity:** high

## TC-WS-MEM-019 — PATCH role with `owner` value → 400
- **Steps:** PATCH `{role:"owner"}`.
- **Expected:** 400 (zod enum only accepts admin/member/viewer; owner role only via /transfer).
- **Severity:** high

## TC-WS-MEM-020 — PATCH role with garbage value → 400
- **Steps:** PATCH `{role:"superadmin"}`.
- **Expected:** 400.
- **Severity:** medium

## TC-WS-MEM-021 — PATCH role missing field → 400
- **Severity:** medium

## TC-WS-MEM-022 — Promote viewer to admin
- **Steps:** PATCH viewer to admin.
- **Expected:** 200; verify newly admin can PATCH workspace name.
- **Severity:** smoke

## TC-WS-MEM-023 — Demote admin to viewer
- **Steps:** PATCH admin to viewer.
- **Expected:** 200; demoted user now blocked from PATCH /:id (verify 403).
- **Severity:** smoke

## TC-WS-MEM-024 — Removing member also removes their pending invites? No
- **Steps:** Verify invite rows persist (independent table).
- **Severity:** low

## TC-WS-MEM-025 — Members list returns email-sorted or insertion-sorted (consistent)
- **Severity:** low

## TC-WS-MEM-026 — Member's projects accessible after role change to viewer
- **Steps:** Demote to viewer; viewer should still see projects.
- **Expected:** GET /projects in ws returns same items.
- **Severity:** medium

## TC-WS-MEM-027 — Member removed loses access to ws projects
- **Steps:** Remove member; member calls GET /workspaces/:id.
- **Expected:** 403.
- **Severity:** smoke

## TC-WS-MEM-028 — Owner role count is exactly 1
- **Steps:** Inspect workspace_members rows for ws.
- **Expected:** Exactly one row with role='owner'.
- **Severity:** high

## TC-WS-MEM-029 — Two simultaneous PATCH role updates → last write wins
- **Steps:** Race two PATCHes setting different roles.
- **Expected:** Both 200, final state matches one of them.
- **Severity:** medium

## TC-WS-MEM-030 — PATCH path with malformed userId → 400/404
- **Steps:** /:id/members/not-a-uuid.
- **Expected:** 400 / 404.
- **Severity:** medium
