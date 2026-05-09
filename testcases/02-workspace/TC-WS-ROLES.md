# TC-WS-ROLES — Role enforcement matrix

`requireRole` middleware: hierarchy owner > admin > member > viewer.
Source: `services/api/src/middleware/workspace-role.ts`.

Each test verifies a single (role, action) combination.

## TC-WS-ROLE-001 — Anonymous (no JWT) → 401 on any /:id endpoint
- **Steps:** GET /workspaces/<id>/members no auth.
- **Expected:** 401 (authMiddleware).
- **Severity:** smoke

## TC-WS-ROLE-002 — Logged-in non-member → 403
- **Steps:** GET /workspaces/<id> with token of unrelated user.
- **Expected:** 403 `Not a member of this workspace`.
- **Severity:** smoke

## TC-WS-ROLE-003 — Viewer can GET /:id
- **Severity:** smoke

## TC-WS-ROLE-004 — Viewer cannot PATCH /:id
- **Expected:** 403.
- **Severity:** smoke

## TC-WS-ROLE-005 — Viewer cannot DELETE /:id
- **Severity:** smoke

## TC-WS-ROLE-006 — Viewer cannot invite
- **Severity:** smoke

## TC-WS-ROLE-007 — Viewer cannot create invite link
- **Severity:** smoke

## TC-WS-ROLE-008 — Viewer cannot remove member
- **Severity:** smoke

## TC-WS-ROLE-009 — Viewer cannot change roles
- **Severity:** smoke

## TC-WS-ROLE-010 — Viewer can GET /:id/members
- **Severity:** smoke

## TC-WS-ROLE-011 — Viewer cannot GET /:id/invites (admin+)
- **Severity:** medium

## TC-WS-ROLE-012 — Member can GET /:id (viewer+)
- **Severity:** smoke

## TC-WS-ROLE-013 — Member cannot PATCH /:id
- **Severity:** smoke

## TC-WS-ROLE-014 — Member cannot DELETE /:id
- **Severity:** smoke

## TC-WS-ROLE-015 — Member cannot invite
- **Severity:** smoke

## TC-WS-ROLE-016 — Member cannot remove member
- **Severity:** smoke

## TC-WS-ROLE-017 — Admin can PATCH /:id
- **Severity:** smoke

## TC-WS-ROLE-018 — Admin can invite
- **Severity:** smoke

## TC-WS-ROLE-019 — Admin can revoke invite
- **Severity:** smoke

## TC-WS-ROLE-020 — Admin can remove non-admin
- **Severity:** smoke

## TC-WS-ROLE-021 — Admin cannot remove admin
- **Severity:** smoke

## TC-WS-ROLE-022 — Admin cannot change member roles (owner+)
- **Severity:** smoke

## TC-WS-ROLE-023 — Admin cannot DELETE workspace (owner+)
- **Severity:** smoke

## TC-WS-ROLE-024 — Admin cannot transfer ownership
- **Severity:** smoke

## TC-WS-ROLE-025 — Owner can PATCH /:id
- **Severity:** smoke

## TC-WS-ROLE-026 — Owner can DELETE /:id
- **Severity:** smoke

## TC-WS-ROLE-027 — Owner can invite
- **Severity:** smoke

## TC-WS-ROLE-028 — Owner can change member roles
- **Severity:** smoke

## TC-WS-ROLE-029 — Owner can transfer ownership
- **Severity:** smoke

## TC-WS-ROLE-030 — Owner cannot change own role (400)
- **Severity:** high

## TC-WS-ROLE-031 — Owner cannot remove self via DELETE /members/:userId (400)
- **Severity:** high

## TC-WS-ROLE-032 — Platform admin (`is_platform_admin=true`) but non-member → 403
- **Pre:** Caller is platform admin but not a workspace member.
- **Steps:** GET /workspaces/<id>.
- **Expected:** 403 (workspace role check is independent of platform admin flag).
- **Severity:** high

## TC-WS-ROLE-033 — Platform admin via `/admin/...` endpoints can read any workspace
- **Note:** Cross-reference admin endpoints; document that platform admin bypass exists only on /admin routes.
- **Severity:** high

## TC-WS-ROLE-034 — Workspace ID mismatch in path → 400 / 403 / 404
- **Steps:** PATCH /workspaces//members/<x> (empty id).
- **Expected:** 400 from middleware `Workspace ID required` or 404.
- **Severity:** medium

## TC-WS-ROLE-035 — Casing of role string from DB
- **Steps:** Manually set workspace_members.role to 'OWNER' (uppercase).
- **Expected:** ROLE_HIERARCHY indexOf returns -1; user blocked. Document — role values must be lowercase.
- **Severity:** medium

## TC-WS-ROLE-036 — Member role not in WORKSPACE_ROLES (legacy `editor`) → blocked
- **Steps:** Manually set role to non-enum value.
- **Expected:** 403.
- **Severity:** medium

## TC-WS-ROLE-037 — Leave own membership (member role)
- **Note:** No /leave route exists today; document.
- **Severity:** medium

## TC-WS-ROLE-038 — Owner deletes ws while admins are mid-action
- **Steps:** Owner DELETEs while admin holds a PATCH in flight.
- **Expected:** PATCH may 200 then row gone, or 404. Should not corrupt.
- **Severity:** medium

## TC-WS-ROLE-039 — Multi-workspace user: each role independent
- **Pre:** User is admin in ws1 and viewer in ws2.
- **Steps:** Verify ws1 admin actions succeed and ws2 admin actions fail.
- **Severity:** smoke

## TC-WS-ROLE-040 — Role middleware rejects when authMiddleware not run first
- **Note:** Internal sanity — would only show if route mis-wired.
- **Severity:** low
