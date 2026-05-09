# TC-PROJ-COLLAB — Project collaborators (add/list/remove, role enforcement)

Endpoints:
- `GET /projects/:id/collaborators`
- `DELETE /projects/:id/collaborators/:userId`
- Roles in `project_collaborators.role`: `owner`, `admin`, `editor`, `viewer` (mirroring workspace roles).
- Auto-join: when project is `public`, GET /projects/:id triggers `INSERT ... role='editor' ON CONFLICT DO NOTHING`.

Roles hierarchy (from WORKSPACE_ROLES): viewer < member < admin < owner. Project endpoints use `isRoleAtLeast` against project access role (workspace role takes priority).

---

## TC-PROJ-COLLAB-001 — List collaborators (workspace member call)
- **Pre:** project has 2 collaborators.
- **Steps:** `GET /projects/:id/collaborators`.
- **Expected:** 200; data length 2 with `user_id`, `role`, `added_at`, `email`, `display_name`, `avatar_url` per row, ordered by `added_at ASC`.
- **Severity:** smoke

## TC-PROJ-COLLAB-002 — List collaborators (project_collaborator call)
- **Pre:** caller is a non-workspace-member but has collab row.
- **Expected:** 200, list returned.
- **Severity:** medium

## TC-PROJ-COLLAB-003 — List collaborators — non-member, non-collab → 404
- **Expected:** 404 `error:"Project not found"`.
- **Severity:** high

## TC-PROJ-COLLAB-004 — Empty collaborator list returned cleanly
- **Pre:** project has zero collaborators.
- **Expected:** 200 `data:[]`.
- **Severity:** smoke

## TC-PROJ-COLLAB-005 — Auto-join on public project creates `editor` collab
- **Pre:** project visibility=public; user not in workspace, not in collab.
- **Steps:** any GET /projects/:id (or /collaborators).
- **Expected:** collab row created `role='editor'`. Subsequent /collaborators shows them.
- **Severity:** high

## TC-PROJ-COLLAB-006 — Auto-join idempotent (ON CONFLICT DO NOTHING)
- **Steps:** GET /projects/:id 5 times.
- **Expected:** still single collab row.
- **Severity:** medium

## TC-PROJ-COLLAB-007 — Auto-join skipped for private project → 404
- **Pre:** private project; user has no membership/collab.
- **Expected:** 404.
- **Severity:** high

## TC-PROJ-COLLAB-008 — Remove collaborator — owner of workspace
- **Pre:** workspace owner; project has collab user X.
- **Steps:** `DELETE /projects/:id/collaborators/<X>`.
- **Expected:** 200 `data:{removed:true}`. List no longer contains X.
- **Severity:** smoke

## TC-PROJ-COLLAB-009 — Remove collaborator — workspace admin
- **Expected:** 200.
- **Severity:** smoke

## TC-PROJ-COLLAB-010 — Remove collaborator — workspace member
- **Pre:** caller is workspace member only (member > 0 → wsRole truthy → passes check).
- **Expected:** 200 (per code: any wsRole permits removal).
- **Severity:** medium

## TC-PROJ-COLLAB-011 — Remove collaborator — caller is non-workspace-member but is collab → 403
- **Expected:** 403 `error:"Only the project owner can remove collaborators"`.
- **Severity:** high

## TC-PROJ-COLLAB-012 — Remove non-existent collaborator → 404
- **Steps:** target user has no collab row.
- **Expected:** 404 `error:"Collaborator not found"`.
- **Severity:** medium

## TC-PROJ-COLLAB-013 — Remove yourself (the workspace member removes own collab) → 404 if no collab row
- **Pre:** user is workspace member (no collab row).
- **Expected:** 404.
- **Severity:** low

## TC-PROJ-COLLAB-014 — Remove with malformed UUID for userId → 404
- **Steps:** DELETE /projects/:id/collaborators/notuuid.
- **Expected:** 404 from `result.count===0` (or 500 if pg rejects). Document actual.
- **Severity:** low

## TC-PROJ-COLLAB-015 — Remove on a project user has no access to → 404
- **Expected:** 404 `error:"Project not found"`.
- **Severity:** high

## TC-PROJ-COLLAB-016 — Project access by collab role: viewer can read but not edit
- **Pre:** user has project_collaborators role='viewer'.
- **Steps:** GET /projects/:id ✓, PATCH /projects/:id ✗.
- **Expected:** GET 200, PATCH 403.
- **Severity:** high

## TC-PROJ-COLLAB-017 — Project access by collab role: editor can edit
- **Pre:** role='editor'.
- **Steps:** PATCH /projects/:id body `{"name":"X"}`.
- **Expected:** 200 (editor ≥ member).
- **Severity:** high

## TC-PROJ-COLLAB-018 — Project access by collab role: admin can edit + manage settings
- **Pre:** role='admin'.
- **Expected:** PATCH 200; PUT /:id/connector-settings 200 (admin ≥ editor).
- **Severity:** medium

## TC-PROJ-COLLAB-019 — Project access by collab role: owner has full access
- **Pre:** role='owner'.
- **Expected:** PATCH, DELETE, settings all permitted (assuming owner role on collab also blocks DELETE since DELETE checks `access.role` against owner/admin and gets 'owner'; should allow).
- **Severity:** medium

## TC-PROJ-COLLAB-020 — Workspace role wins over collab role
- **Pre:** user is workspace owner AND has project_collaborators role='viewer'.
- **Expected:** access.role==='owner' (workspace wins). Confirms `requireProjectAccess` priority.
- **Severity:** high

## TC-PROJ-COLLAB-021 — Add collaborator (if endpoint exists, e.g. POST /:id/collaborators)
- **Notes:** verify whether such endpoint exists. If yes, run all the role/email lookup tests.
- **Severity:** smoke

## TC-PROJ-COLLAB-022 — Add collaborator with non-existent email → 404
- **Severity:** medium

## TC-PROJ-COLLAB-023 — Add collaborator who is already a workspace member → noop or 409
- **Severity:** low

## TC-PROJ-COLLAB-024 — Add collaborator — invalid role value → 400
- **Severity:** medium

## TC-PROJ-COLLAB-025 — Update collaborator role (PATCH if exists) — owner change role of editor → admin
- **Severity:** medium

## TC-PROJ-COLLAB-026 — Cannot grant role above own — admin trying to set someone to owner
- **Severity:** high

## TC-PROJ-COLLAB-027 — Removing the last owner collaborator does NOT orphan project (workspace owner still controls)
- **Severity:** high

## TC-PROJ-COLLAB-028 — Collaborator email lookup case-insensitive
- **Severity:** low

## TC-PROJ-COLLAB-029 — added_at timestamp recorded on insert
- **Steps:** auto-join then list.
- **Expected:** collab row has populated `added_at`.
- **Severity:** medium

## TC-PROJ-COLLAB-030 — Collaborator with deleted user account
- **Pre:** user gets soft-deleted in users table.
- **Expected:** GET /collaborators still returns row but joined fields may be NULL or filtered. Document.
- **Severity:** low

## TC-PROJ-COLLAB-031 — Project transfer between workspaces preserves/clears collaborators
- **Notes:** if project transfer endpoint exists. If not, scope: file gap.
- **Severity:** medium

## TC-PROJ-COLLAB-032 — Project transfer to workspace user is NOT member of → 403
- **Severity:** high

## TC-PROJ-COLLAB-033 — Project transfer changes workspace_id, keeps slug uniqueness in destination
- **Severity:** high

## TC-PROJ-COLLAB-034 — Multi-tab same user listed once in collab list (unique by user_id)
- **Severity:** low

## TC-PROJ-COLLAB-035 — Collaborator pagination if list grows large (>1000)
- **Severity:** low

## TC-PROJ-COLLAB-036 — DELETE collab cascade — when project deleted, collab rows go too
- **See:** TC-PROJ-DELETE-010.
- **Severity:** high

## TC-PROJ-COLLAB-037 — Invitation flow (if invite tokens exist) — pending invite resolves to collab on accept
- **Severity:** medium

## TC-PROJ-COLLAB-038 — Stale invite (>7d) → expired
- **Severity:** low

## TC-PROJ-COLLAB-039 — Invite to email matching existing user → auto-accept
- **Severity:** low

## TC-PROJ-COLLAB-040 — Revoke pending invite — admin action
- **Severity:** low
