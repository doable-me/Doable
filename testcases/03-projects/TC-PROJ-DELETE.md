# TC-PROJ-DELETE — Project deletion (hard) and soft-delete behavior

Endpoint: `DELETE /projects/:id` performs hard delete (DB row + filesystem + thumbnail + dev server stopped). Permission: workspace `owner` or `admin` only.

If the project schema includes `deleted_at` (soft delete column), test soft-delete pathways and restore semantics.

---

## TC-PROJ-DELETE-001 — Owner deletes project — happy path
- **Pre:** workspace owner; project exists; project has at least 5 files.
- **Steps:** `DELETE /projects/:id`.
- **Expected:** 200 `{data:{id,deleted:true}}`. GET /projects/:id → 404. Project files removed from disk (verify via SSH that `<projects-root>/<id>` is gone within ~10s). Thumbnail removed.
- **Severity:** smoke

## TC-PROJ-DELETE-002 — Admin deletes project
- **Pre:** workspace admin role.
- **Expected:** 200.
- **Severity:** smoke

## TC-PROJ-DELETE-003 — Member cannot delete → 403
- **Pre:** workspace member role.
- **Expected:** 403 `error:"Only workspace owners and admins can delete projects"`.
- **Severity:** high

## TC-PROJ-DELETE-004 — Editor (collab role) cannot delete → 403
- **Pre:** project_collaborator with role=editor; not workspace member.
- **Expected:** 403.
- **Severity:** high

## TC-PROJ-DELETE-005 — Viewer (collab role) cannot delete → 403
- **Expected:** 403.
- **Severity:** high

## TC-PROJ-DELETE-006 — Non-member, non-collab → 404
- **Expected:** 404 (project not found / no access).
- **Severity:** smoke

## TC-PROJ-DELETE-007 — Project not found → 404
- **Steps:** DELETE /projects/<random uuid>.
- **Expected:** 404.
- **Severity:** smoke

## TC-PROJ-DELETE-008 — Already-deleted project → 404
- **Pre:** project deleted moments ago.
- **Expected:** 404.
- **Severity:** medium

## TC-PROJ-DELETE-009 — Delete project that has dev server running
- **Pre:** dev server live for the project (open editor first).
- **Expected:** 200; dev server stopped within 5s (race with timeout); subsequent connection attempts fail.
- **Severity:** high

## TC-PROJ-DELETE-010 — Delete project with collaborators removes their access
- **Pre:** 3 project_collaborators rows.
- **Expected:** 200; collaborator rows cascade-deleted; users no longer see project in /projects/shared.
- **Severity:** high

## TC-PROJ-DELETE-011 — AI usage daily/monthly rows merged into NULL bucket
- **Pre:** project has 5 ai_usage_daily rows.
- **Steps:** delete project.
- **Expected:** Pre-existing NULL-project usage row totals incremented; project rows gone; no unique-index violation.
- **Severity:** high

## TC-PROJ-DELETE-012 — AI usage_log gets project_id NULL'd, not deleted
- **Pre:** ai_usage_log has rows for this project.
- **Expected:** rows still exist with project_id IS NULL.
- **Severity:** medium

## TC-PROJ-DELETE-013 — github_commits + github_connections cascaded
- **Pre:** project linked to GitHub.
- **Expected:** github_connections row deleted; github_commits joined deletes succeed.
- **Severity:** medium

## TC-PROJ-DELETE-014 — Project deletion succeeds even if usage cleanup throws
- **Pre:** simulate usage table read failure.
- **Expected:** delete still completes (try/catch wraps usage cleanup).
- **Severity:** medium

## TC-PROJ-DELETE-015 — Filesystem cleanup runs in background, slow operation does not block response
- **Steps:** measure response latency.
- **Expected:** API responds in <2s even if rm of 100k files would take longer; rm completes async.
- **Severity:** medium

## TC-PROJ-DELETE-016 — Concurrent deletes — second returns 404
- **Steps:** two parallel DELETEs.
- **Expected:** one returns 200, the other returns 404.
- **Severity:** medium

## TC-PROJ-DELETE-017 — Project versions deleted/cleaned with project
- **Pre:** project has version snapshots (DB rows / git commits in project dir).
- **Expected:** project_versions and version_bookmarks rows cascaded; git dir removed with project dir.
- **Severity:** high

## TC-PROJ-DELETE-018 — Stars cascaded
- **Pre:** project starred by 3 users.
- **Expected:** project_stars rows removed; users see one fewer star.
- **Severity:** medium

## TC-PROJ-DELETE-019 — Project_views entries cascaded
- **Expected:** project_views rows for project removed (or cascade).
- **Severity:** low

## TC-PROJ-DELETE-020 — share_visits rows cascaded
- **Pre:** project has share visits.
- **Expected:** share_visits rows removed.
- **Severity:** low

## TC-PROJ-DELETE-021 — Unauthenticated DELETE → 401
- **Expected:** 401.
- **Severity:** smoke

## TC-PROJ-DELETE-022 — Malformed UUID → 404
- **Steps:** DELETE /projects/abc.
- **Expected:** 404.
- **Severity:** low

## TC-PROJ-DELETE-023 — Soft delete: setting deleted_at via admin tool excludes from list
- **Pre:** internal tool sets `deleted_at = now()`.
- **Steps:** GET /projects.
- **Expected:** project not in list.
- **Severity:** high

## TC-PROJ-DELETE-024 — Soft-deleted project blocks edits (PATCH → 404)
- **Expected:** 404.
- **Severity:** high

## TC-PROJ-DELETE-025 — Soft-deleted project blocks file reads (GET /editor → 404)
- **Expected:** 404.
- **Severity:** high

## TC-PROJ-DELETE-026 — Restore soft-deleted project (admin endpoint or DB clear)
- **Steps:** clear deleted_at.
- **Expected:** project re-appears in list and editing works.
- **Severity:** high

## TC-PROJ-DELETE-027 — Hard delete after soft delete cleans everything
- **Steps:** soft delete, then DELETE.
- **Expected:** 200 (or 404 if soft-deleted projects are hidden from access check). Document.
- **Severity:** medium

## TC-PROJ-DELETE-028 — Star count refresh after delete
- **Pre:** 5 stars on project.
- **Expected:** after delete, those users' starred lists shrink by 1.
- **Severity:** low

## TC-PROJ-DELETE-029 — Plan limit decremented by delete (slot freed)
- **Pre:** workspace at limit (3/3 free).
- **Steps:** delete one project, then create a new one.
- **Expected:** new project creates with 201.
- **Severity:** high

## TC-PROJ-DELETE-030 — Platform admin can delete any project
- **Pre:** non-member, `is_platform_admin=true`.
- **Expected:** 200; bypass check confirmed.
- **Severity:** medium

## TC-PROJ-DELETE-031 — Two-step delete: archive then purge (if implemented)
- **Steps:** PATCH visibility/status to "archived" (if supported) then DELETE.
- **Expected:** Document spec; some plans archive before purge.
- **Severity:** low
