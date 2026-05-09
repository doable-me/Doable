# TC-PROJ-MISC — Stars, duplicate, move, share-stats, view tracking, connector-settings, thumbnails

Endpoints:
- `POST /projects/:id/star` — toggle star.
- `POST /projects/:id/duplicate` — clone project (member+ required).
- `POST /projects/:id/move` — move to folder (any role with project access).
- `POST /projects/:id/view` — record a view.
- `GET /projects/:id/share-stats` — workspace members only.
- `GET /projects/:id/connector-settings`, `PUT /projects/:id/connector-settings` — editor+ required.
- `POST /projects/:id/connector-proxy-token` — issues 15-min JWT.

---

## TC-PROJ-STAR-001 — Toggle star — first call stars
- **Pre:** project not starred.
- **Steps:** `POST /projects/:id/star`.
- **Expected:** 200 `{data:{projectId,starred:true}}`.
- **Severity:** smoke

## TC-PROJ-STAR-002 — Toggle star — second call unstars
- **Expected:** `starred:false`.
- **Severity:** smoke

## TC-PROJ-STAR-003 — Toggle star idempotent under concurrent calls
- **Steps:** fire 5 parallel star toggles.
- **Expected:** end state deterministic; no DB error.
- **Severity:** medium

## TC-PROJ-STAR-004 — Star reflects in /projects list `starred` flag
- **Severity:** smoke

## TC-PROJ-STAR-005 — Star on inaccessible project → 404
- **Severity:** high

## TC-PROJ-STAR-006 — Star count visible in project metadata (if surfaced)
- **Severity:** low

## TC-PROJ-DUP-001 — Duplicate project — owner
- **Steps:** `POST /projects/:id/duplicate`.
- **Expected:** 201; new project with name suffix " (Copy)" and unique slug `<orig>-copy-<ts>`.
- **Severity:** smoke

## TC-PROJ-DUP-002 — Duplicate project — viewer → 403
- **Pre:** caller is viewer (project_collaborators).
- **Expected:** 403 `error:"Viewers cannot duplicate projects"`.
- **Severity:** high

## TC-PROJ-DUP-003 — Duplicate project — member
- **Expected:** 201.
- **Severity:** smoke

## TC-PROJ-DUP-004 — Duplicate respects plan limit
- **Pre:** workspace at limit.
- **Expected:** Document — current code does NOT re-check plan limit on duplicate. File potential bug.
- **Severity:** high

## TC-PROJ-DUP-005 — Duplicate carries description, template_id, folder_id
- **Expected:** new project's columns match origin.
- **Severity:** medium

## TC-PROJ-DUP-006 — Duplicate does not copy collaborators
- **Expected:** collab list empty on new project (only workspace inherits access).
- **Severity:** medium

## TC-PROJ-DUP-007 — Duplicate does not copy stars
- **Expected:** new project not starred for any user.
- **Severity:** low

## TC-PROJ-DUP-008 — Duplicate copies project files (template seed only or full clone?)
- **Notes:** code re-uses templateId on create → only re-seeds. File gap if expected to clone all current files.
- **Severity:** high

## TC-PROJ-DUP-009 — Duplicate of project with no template_id → blank scaffold
- **Severity:** medium

## TC-PROJ-DUP-010 — Duplicate timestamp suffix avoids slug collision
- **Steps:** duplicate same project 3 times in rapid succession.
- **Expected:** all 201 with unique slugs.
- **Severity:** medium

## TC-PROJ-DUP-011 — Duplicate of public project — visibility on duplicate?
- **Expected:** Document. Probably defaults to private (DB default).
- **Severity:** low

## TC-PROJ-MOVE-001 — Move project to existing folder
- **Steps:** `POST /projects/:id/move` body `{"folderId":<f>}`.
- **Expected:** 200; project's `folder_id` set.
- **Severity:** smoke

## TC-PROJ-MOVE-002 — Move project to root (folderId=null)
- **Steps:** body `{"folderId":null}`.
- **Expected:** 200; folder_id NULL.
- **Severity:** smoke

## TC-PROJ-MOVE-003 — Move with folderId malformed → 400
- **Expected:** 400.
- **Severity:** medium

## TC-PROJ-MOVE-004 — Move with non-existent folderId
- **Expected:** Document — likely 200 with broken FK.
- **Severity:** medium

## TC-PROJ-MOVE-005 — Move with folderId in different workspace
- **Expected:** Document; ideally rejected.
- **Severity:** high

## TC-PROJ-MOVE-006 — Move missing folderId field → 400
- **Steps:** body `{}`.
- **Expected:** 400 (folderId required).
- **Severity:** medium

## TC-PROJ-MOVE-007 — Move on inaccessible project → 404
- **Severity:** high

## TC-PROJ-MOVE-008 — Move ignores role check (any access role allowed in current code)
- **Expected:** Document — viewer should not be allowed to move; file gap.
- **Severity:** high

## TC-PROJ-VIEW-001 — Record view (workspace member)
- **Steps:** `POST /projects/:id/view`.
- **Expected:** 200 `{ok:true}`; project shows in `/recently-viewed`.
- **Severity:** smoke

## TC-PROJ-VIEW-002 — Record view (public project, non-workspace member)
- **Pre:** project visibility=public; user not in workspace.
- **Steps:** POST view; auto-join creates editor collab; recordVisit triggered.
- **Expected:** 200; share_visits row recorded; user appears in `/projects/shared`.
- **Severity:** high

## TC-PROJ-VIEW-003 — Record view (private, no access) → 404
- **Severity:** high

## TC-PROJ-VIEW-004 — Repeated views update last-view timestamp
- **Severity:** medium

## TC-PROJ-VIEW-005 — Different users counted independently
- **Severity:** medium

## TC-PROJ-SHARE-STATS-001 — Workspace owner gets share stats
- **Steps:** `GET /projects/:id/share-stats`.
- **Expected:** 200 with stats object (visit count, unique users, etc.).
- **Severity:** smoke

## TC-PROJ-SHARE-STATS-002 — Non-workspace member → 403
- **Expected:** 403 `error:"Access denied"`.
- **Severity:** high

## TC-PROJ-SHARE-STATS-003 — Project not found → 404
- **Severity:** medium

## TC-PROJ-SHARE-STATS-004 — Stats accurate for 0 visits
- **Expected:** zeros.
- **Severity:** low

## TC-PROJ-SHARE-STATS-005 — Stats include unique visitor count separate from total visits
- **Expected:** unique <= total.
- **Severity:** medium

## TC-PROJ-CONN-001 — GET connector-settings as workspace member
- **Steps:** `GET /projects/:id/connector-settings`.
- **Expected:** 200 `data:{rateLimitPerMinute:null}` for fresh project.
- **Severity:** smoke

## TC-PROJ-CONN-002 — PUT connector-settings as editor
- **Pre:** caller is collab editor or workspace member+.
- **Steps:** PUT body `{"rateLimitPerMinute":60}`.
- **Expected:** 200 `data.rateLimitPerMinute===60`. Subsequent GET returns 60.
- **Severity:** smoke

## TC-PROJ-CONN-003 — PUT as viewer → 403
- **Pre:** caller is collab viewer.
- **Expected:** 403 `error:"Insufficient permissions"`.
- **Severity:** high

## TC-PROJ-CONN-004 — PUT with rateLimit=0
- **Steps:** body `{"rateLimitPerMinute":0}`.
- **Expected:** 200 (zero allowed; zod min 0).
- **Severity:** medium

## TC-PROJ-CONN-005 — PUT with rateLimit=10000 (boundary)
- **Expected:** 200.
- **Severity:** low

## TC-PROJ-CONN-006 — PUT with rateLimit=10001 → 400
- **Expected:** 400 `details.rateLimitPerMinute`.
- **Severity:** low

## TC-PROJ-CONN-007 — PUT with rateLimit=null clears
- **Expected:** 200; subsequent GET returns null.
- **Severity:** medium

## TC-PROJ-CONN-008 — PUT with non-integer (3.5) → 400
- **Expected:** 400.
- **Severity:** low

## TC-PROJ-CONN-009 — PUT with negative number → 400
- **Expected:** 400.
- **Severity:** low

## TC-PROJ-CONN-010 — PUT non-JSON body → 400
- **Expected:** 400 `error:"Invalid JSON"`.
- **Severity:** medium

## TC-PROJ-CONN-011 — PUT inaccessible project → 404
- **Severity:** high

## TC-PROJ-PROXY-TOKEN-001 — Issue connector-proxy token
- **Steps:** `POST /projects/:id/connector-proxy-token`.
- **Expected:** 200 `data:{token:"<jwt>",expiresIn:900}`. Token decodes to {projectId, workspaceId, userId, kind:"connector-proxy"} with 15-min exp.
- **Severity:** smoke

## TC-PROJ-PROXY-TOKEN-002 — Token rejected for inaccessible project → 404
- **Severity:** high

## TC-PROJ-PROXY-TOKEN-003 — Token unique per call
- **Expected:** 5 calls produce 5 distinct tokens.
- **Severity:** low

## TC-PROJ-PROXY-TOKEN-004 — Token verifies against PROJECT_JWT_SECRET
- **Severity:** medium

## TC-PROJ-PROXY-TOKEN-005 — Token rejected by API after 16 minutes (expiry)
- **Severity:** medium

## TC-PROJ-THUMB-001 — Thumbnail generated after first publish
- **Pre:** publish project.
- **Expected:** GET thumbnail returns 200 image; file at thumb path exists.
- **Severity:** medium

## TC-PROJ-THUMB-002 — Thumbnail removed on project delete
- **Severity:** medium

## TC-PROJ-THUMB-003 — Thumbnail regenerated on file changes (debounced)
- **Severity:** low

## TC-PROJ-THUMB-004 — Thumbnail file size sane (<200KB)
- **Severity:** low

## TC-PROJ-VIS-001 — Visibility public — anonymous (no auth) GET → 401
- **Notes:** all /projects routes require auth.
- **Expected:** 401.
- **Severity:** smoke

## TC-PROJ-VIS-002 — Visibility public — authed non-member GET → 200 + auto-join
- **Severity:** high

## TC-PROJ-VIS-003 — Visibility private — non-member GET → 404
- **Severity:** high

## TC-PROJ-VIS-004 — Toggling visibility public → private removes future auto-joins
- **Severity:** medium

## TC-PROJ-VIS-005 — Existing auto-joined editor retains access after visibility flips to private
- **Expected:** Document. Spec: collab row persists; user keeps access.
- **Severity:** medium
