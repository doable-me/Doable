# TC-PROJ-UPDATE — Project update / settings save

Endpoints: `PATCH /projects/:id`, `PUT /projects/:id` (alias). Settings savable: `name` (1..100), `description` (max 500), `status` ∈ {creating,draft,published,error}, `visibility` ∈ {public,private}, `folderId` (uuid|null).

Authorization: caller must have project access AND role ≥ `member` (viewers blocked with 403). Owners/admins of workspace bypass.

---

## TC-PROJ-UPDATE-001 — Owner updates name
- **Steps:** `PATCH /projects/:id` body `{"name":"New Name"}`.
- **Expected:** 200; persisted name updated; updated_at advances.
- **Severity:** smoke

## TC-PROJ-UPDATE-002 — Admin updates name
- **Pre:** user has admin role on workspace.
- **Expected:** 200.
- **Severity:** smoke

## TC-PROJ-UPDATE-003 — Member updates name
- **Pre:** user has member role.
- **Expected:** 200 (member ≥ member).
- **Severity:** smoke

## TC-PROJ-UPDATE-004 — Viewer cannot update name → 403
- **Pre:** user has viewer role.
- **Expected:** 403 `error:"Viewers cannot edit projects"`.
- **Severity:** high

## TC-PROJ-UPDATE-005 — Non-member cannot update → 404
- **Pre:** user is not a workspace member, project is private.
- **Expected:** 404 (no project access).
- **Severity:** high

## TC-PROJ-UPDATE-006 — Auto-join on public project then can update (since auto-join role is editor)
- **Pre:** project visibility=public; user has no prior collaborator row.
- **Steps:** any GET first (or single PATCH). Auto-join creates `editor` collab.
- **Expected:** PATCH succeeds (editor ≥ member).
- **Severity:** high

## TC-PROJ-UPDATE-007 — PUT /:id behaves identically to PATCH /:id
- **Steps:** PUT body `{"name":"X"}`.
- **Expected:** 200, same shape as PATCH.
- **Severity:** smoke

## TC-PROJ-UPDATE-008 — Update name to empty string → 400
- **Steps:** body `{"name":""}`.
- **Expected:** 400 `details.name`.
- **Severity:** medium

## TC-PROJ-UPDATE-009 — Update name to 100 chars (boundary) accepted
- **Expected:** 200.
- **Severity:** medium

## TC-PROJ-UPDATE-010 — Update name to 101 chars rejected
- **Expected:** 400.
- **Severity:** medium

## TC-PROJ-UPDATE-011 — Update name to unicode/emoji
- **Steps:** body `{"name":"🌟 Stardust ✨"}`.
- **Expected:** 200; persisted exactly.
- **Severity:** low

## TC-PROJ-UPDATE-012 — Update description to 500 chars (boundary) accepted
- **Expected:** 200.
- **Severity:** low

## TC-PROJ-UPDATE-013 — Update description to 501 chars rejected
- **Expected:** 400 `details.description`.
- **Severity:** low

## TC-PROJ-UPDATE-014 — Update description to empty string accepted
- **Steps:** body `{"description":""}`.
- **Expected:** 200; description saved as empty string.
- **Severity:** low

## TC-PROJ-UPDATE-015 — Update description to null
- **Steps:** body `{"description":null}`.
- **Expected:** zod schema doesn't accept null (only string|undefined) → 400.
- **Severity:** low

## TC-PROJ-UPDATE-016 — Update status from draft → published
- **Pre:** project is draft.
- **Expected:** 200; `status:"published"`.
- **Severity:** smoke

## TC-PROJ-UPDATE-017 — Update status from published → draft (unpublish)
- **Expected:** 200.
- **Severity:** medium

## TC-PROJ-UPDATE-018 — Update status from creating → draft
- **Expected:** 200; verifies legal transition.
- **Severity:** medium

## TC-PROJ-UPDATE-019 — Update status from draft → creating (illegal but no guard)
- **Expected:** Document — schema allows; behavior should be 200 unless guarded.
- **Severity:** low

## TC-PROJ-UPDATE-020 — Update status to "archived" (not in enum) → 400
- **Steps:** body `{"status":"archived"}`.
- **Expected:** 400.
- **Severity:** medium

## TC-PROJ-UPDATE-021 — Update visibility to "public"
- **Pre:** project is private.
- **Expected:** 200; visibility now public; subsequent unauth viewers can auto-join.
- **Severity:** smoke

## TC-PROJ-UPDATE-022 — Update visibility to "private"
- **Pre:** project is public; an editor collab was auto-joined.
- **Expected:** 200; visibility=private. Auto-joined collab still has access.
- **Severity:** medium

## TC-PROJ-UPDATE-023 — Update visibility to invalid value → 400
- **Steps:** body `{"visibility":"unlisted"}`.
- **Expected:** 400.
- **Severity:** medium

## TC-PROJ-UPDATE-024 — Update folderId to existing folder
- **Expected:** 200; `folder_id` updated.
- **Severity:** smoke

## TC-PROJ-UPDATE-025 — Update folderId to null (move out of folder)
- **Steps:** body `{"folderId":null}`.
- **Expected:** 200; `folder_id` cleared.
- **Severity:** smoke

## TC-PROJ-UPDATE-026 — Update folderId to malformed UUID → 400
- **Expected:** 400.
- **Severity:** medium

## TC-PROJ-UPDATE-027 — Update folderId to non-existent UUID
- **Expected:** Document — likely 200 with broken FK or 500. File bug if no validation.
- **Severity:** medium

## TC-PROJ-UPDATE-028 — Update folderId to a folder in different workspace
- **Expected:** Document; should reject (file bug if it allows).
- **Severity:** high

## TC-PROJ-UPDATE-029 — Multiple fields in single PATCH
- **Steps:** body `{"name":"X","description":"Y","visibility":"public"}`.
- **Expected:** 200; all 3 saved atomically.
- **Severity:** smoke

## TC-PROJ-UPDATE-030 — Empty body `{}` → 200 no-op
- **Expected:** 200; nothing changed.
- **Severity:** low

## TC-PROJ-UPDATE-031 — Unknown fields in body silently ignored
- **Steps:** body `{"name":"X","mysteryField":42}`.
- **Expected:** 200; mysteryField not persisted.
- **Severity:** low

## TC-PROJ-UPDATE-032 — Project not found → 404
- **Steps:** PATCH /projects/<random-uuid>.
- **Expected:** 404 `error:"Project not found"`.
- **Severity:** smoke

## TC-PROJ-UPDATE-033 — Malformed UUID in path → 404 or 400
- **Steps:** PATCH /projects/notuuid.
- **Expected:** 404 (since findById returns null on invalid UUID parse error caught).
- **Severity:** low

## TC-PROJ-UPDATE-034 — Non-JSON body → 400
- **Expected:** 400 (json parse fails).
- **Severity:** medium

## TC-PROJ-UPDATE-035 — Concurrent updates last-write-wins
- **Steps:** issue 5 parallel PATCH requests changing name.
- **Expected:** all 200; final value matches one of the requests; no data corruption.
- **Severity:** medium

## TC-PROJ-UPDATE-036 — updated_at advances after each PATCH
- **Expected:** monotonically increasing.
- **Severity:** medium

## TC-PROJ-UPDATE-037 — Update slug — schema does NOT include slug → silently ignored
- **Steps:** body `{"slug":"new-slug"}`.
- **Expected:** 200; slug unchanged. File feature gap if slug edits are expected.
- **Severity:** medium

## TC-PROJ-UPDATE-038 — Update workspace_id — schema does NOT include → silently ignored
- **Expected:** workspace_id unchanged.
- **Severity:** high (security: cannot escape workspace via update)

## TC-PROJ-UPDATE-039 — Move project across workspace via PATCH attempt → no transfer
- **Steps:** body `{"workspaceId":<other>}`.
- **Expected:** workspace_id remains original.
- **Severity:** high

## TC-PROJ-UPDATE-040 — Status update by viewer → 403 (consistent with PATCH guard)
- **Expected:** 403.
- **Severity:** medium

## TC-PROJ-UPDATE-041 — Soft-deleted project → PATCH → 404 or 200?
- **Pre:** `deleted_at` set on project.
- **Expected:** Document. Spec implies deleted projects are inaccessible — should 404.
- **Severity:** high

## TC-PROJ-UPDATE-042 — Platform admin can edit any project
- **Pre:** non-member but `is_platform_admin=true`.
- **Expected:** 200 (admin bypass).
- **Severity:** medium
