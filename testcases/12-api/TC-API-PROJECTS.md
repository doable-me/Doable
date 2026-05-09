# TC-API-PROJECTS — /projects route group HTTP coverage

Mounted at `/projects` (`services/api/src/routes.ts:75`). Source: `services/api/src/routes/projects.ts`. All routes require auth.

Endpoints (representative; verify against current source):
- `GET    /projects`                         — list user's projects
- `POST   /projects`                         — create
- `GET    /projects/:id`                     — fetch one
- `PUT    /projects/:id`                     — update name/desc
- `PATCH  /projects/:id`                     — partial update
- `DELETE /projects/:id`                     — soft delete
- `POST   /projects/:id/duplicate`           — clone
- `POST   /projects/:id/archive`
- `POST   /projects/:id/unarchive`
- `POST   /projects/:id/move`                — change folder
- `POST   /projects/:id/star` / `unstar`
- `GET    /projects/:id/files`
- `POST   /projects/:id/files`
- `GET    /projects/:id/preview-url`
- `POST   /projects/:id/start` / `stop` / `restart`
- `GET    /projects/:id/logs`
- `POST   /projects/:id/share`
- `GET    /projects/:id/collaborators`
- `POST   /projects/:id/collaborators`       — invite
- `DELETE /projects/:id/collaborators/:userId`

Standard error envelope: `{error,details?}`.

---

## TC-API-PROJECTS-001 — GET /projects 200 happy path
- **Pre:** User has 3 projects.
- **Steps:** `GET /projects` Bearer token.
- **Expected:** 200 `{data:[...3 projects]}`. Each row contains `id, workspaceId, name, framework, createdAt, updatedAt, archived, starred`.
- **Severity:** smoke

## TC-API-PROJECTS-002 — GET /projects empty list
- **Pre:** Fresh user.
- **Steps:** `GET /projects`.
- **Expected:** 200 `{data:[]}`.
- **Severity:** smoke

## TC-API-PROJECTS-003 — GET /projects 401 no auth
- **Steps:** No Authorization.
- **Expected:** 401.
- **Severity:** smoke

## TC-API-PROJECTS-004 — GET /projects 401 expired token
- **Steps:** Expired JWT.
- **Expected:** 401.
- **Severity:** smoke

## TC-API-PROJECTS-005 — GET /projects 401 alg=none token
- **Steps:** Forge `alg:none` JWT.
- **Expected:** 401.
- **Severity:** smoke

## TC-API-PROJECTS-006 — GET /projects 401 token from another env's signing key
- **Steps:** JWT signed by dev key, sent to staging.
- **Expected:** 401.
- **Severity:** smoke

## TC-API-PROJECTS-007 — GET /projects?archived=true returns only archived
- **Pre:** 2 archived, 1 active.
- **Steps:** `GET /projects?archived=true`.
- **Expected:** 200 `data.length === 2`.
- **Severity:** medium

## TC-API-PROJECTS-008 — GET /projects?archived=invalid → 400 or ignored
- **Steps:** `?archived=banana`.
- **Expected:** 400 (zod) or 200 ignoring filter — record.
- **Severity:** medium

## TC-API-PROJECTS-009 — GET /projects?folderId=<uuid>
- **Pre:** 2 projects in target folder.
- **Steps:** filter by folderId.
- **Expected:** 200, 2 rows.
- **Severity:** medium

## TC-API-PROJECTS-010 — GET /projects?folderId=not-a-uuid → 400
- **Steps:** Bad UUID.
- **Expected:** 400.
- **Severity:** high

## TC-API-PROJECTS-011 — GET /projects pagination cursor empty
- **Steps:** `?cursor=`.
- **Expected:** Treats as start; 200 first page.
- **Severity:** medium

## TC-API-PROJECTS-012 — GET /projects malformed cursor
- **Steps:** `?cursor=$$invalid$$`.
- **Expected:** 400.
- **Severity:** high

## TC-API-PROJECTS-013 — GET /projects cursor beyond end
- **Steps:** Cursor for past last row.
- **Expected:** 200 `{data:[],nextCursor:null}`.
- **Severity:** medium

## TC-API-PROJECTS-014 — GET /projects?limit=10000 capped
- **Steps:** Huge limit.
- **Expected:** 200 with limit capped (e.g. 100); document cap.
- **Severity:** medium

## TC-API-PROJECTS-015 — GET /projects?limit=-1 → 400
- **Steps:** Negative.
- **Expected:** 400.
- **Severity:** high

## TC-API-PROJECTS-016 — POST /projects 201 happy path
- **Steps:** POST `{name:"My Site", framework:"vite-react", workspaceId:"<wid>"}`.
- **Expected:** 201; row created.
- **Severity:** smoke

## TC-API-PROJECTS-017 — POST /projects missing name → 400
- **Steps:** POST `{framework:"vite-react"}`.
- **Expected:** 400 details.name.
- **Severity:** smoke

## TC-API-PROJECTS-018 — POST /projects empty name → 400
- **Steps:** name = "".
- **Expected:** 400 min(1).
- **Severity:** high

## TC-API-PROJECTS-019 — POST /projects 256-char name → 400
- **Steps:** name 300 chars.
- **Expected:** 400 max length.
- **Severity:** medium

## TC-API-PROJECTS-020 — POST /projects unicode name 200
- **Steps:** name `"プロジェクト 🚀"`.
- **Expected:** 201; name persisted as UTF-8.
- **Severity:** medium

## TC-API-PROJECTS-021 — POST /projects framework not in enum → 400
- **Steps:** `framework:"cobol"`.
- **Expected:** 400 enum mismatch.
- **Severity:** smoke

## TC-API-PROJECTS-022 — POST /projects framework disabled in workspace
- **Pre:** Admin disabled `next-app`.
- **Steps:** POST with that framework.
- **Expected:** 403 or 400 `{error:"Framework not enabled"}`.
- **Severity:** high

## TC-API-PROJECTS-023 — POST /projects user not in workspace → 403
- **Steps:** POST with `workspaceId` user is not a member of.
- **Expected:** 403.
- **Severity:** smoke

## TC-API-PROJECTS-024 — POST /projects exceeds workspace project limit → 403/422
- **Pre:** Plan limit reached.
- **Steps:** POST one more.
- **Expected:** 403 or 422 `{error:"Project limit reached"}`.
- **Severity:** high

## TC-API-PROJECTS-025 — POST /projects malformed JSON → 400
- **Steps:** Body `{name:no quotes}`.
- **Expected:** 400.
- **Severity:** high

## TC-API-PROJECTS-026 — POST /projects 1.5 MB body → 413
- **Steps:** Pad description with 1.5 MB string.
- **Expected:** 413 or 400.
- **Severity:** high

## TC-API-PROJECTS-027 — POST /projects nested object beyond depth 32
- **Steps:** Deeply nested unknown field.
- **Expected:** 400 or stripped.
- **Severity:** medium

## TC-API-PROJECTS-028 — POST /projects array length 10000
- **Steps:** Field with 10000-item array.
- **Expected:** 400 zod max.
- **Severity:** medium

## TC-API-PROJECTS-029 — POST /projects extra `id` field ignored
- **Steps:** Body `{name:"x", framework:"vite-react", id:"deadbeef"}`.
- **Expected:** 201 with server-assigned UUID, not user's.
- **Severity:** smoke

## TC-API-PROJECTS-030 — POST /projects wrong Content-Type → 415/400
- **Steps:** Form-encoded body.
- **Expected:** 415 or 400.
- **Severity:** medium

## TC-API-PROJECTS-031 — GET /projects/:id 200
- **Steps:** GET with valid UUID owned by user.
- **Expected:** 200 project.
- **Severity:** smoke

## TC-API-PROJECTS-032 — GET /projects/:id not-a-uuid → 400
- **Steps:** id="abc".
- **Expected:** 400 invalid UUID.
- **Severity:** high

## TC-API-PROJECTS-033 — GET /projects/:id non-existent UUID → 404
- **Steps:** Random UUID.
- **Expected:** 404.
- **Severity:** smoke

## TC-API-PROJECTS-034 — GET /projects/:id another user's project → 404
- **Pre:** Owned by user B.
- **Steps:** User A GETs.
- **Expected:** 404 (not 403 — don't leak existence).
- **Severity:** smoke

## TC-API-PROJECTS-035 — GET /projects/:id SQL injection in path
- **Steps:** id=`1' OR '1=1`.
- **Expected:** 400 invalid UUID; SQL never executed.
- **Severity:** smoke

## TC-API-PROJECTS-036 — GET /projects/:id UUID with extra suffix
- **Steps:** `<uuid>/extra`.
- **Expected:** 404 (no matching route) or routed to nested resource.
- **Severity:** medium

## TC-API-PROJECTS-037 — GET /projects/:id Unicode UUID
- **Steps:** Non-ASCII UUID-like string.
- **Expected:** 400.
- **Severity:** medium

## TC-API-PROJECTS-038 — PUT /projects/:id 200 update
- **Steps:** PUT `{name:"Renamed"}`.
- **Expected:** 200 updated row; updatedAt advanced.
- **Severity:** smoke

## TC-API-PROJECTS-039 — PUT /projects/:id by non-member → 403
- **Steps:** PUT another user's project.
- **Expected:** 403 or 404.
- **Severity:** smoke

## TC-API-PROJECTS-040 — PUT /projects/:id with read-only role → 403
- **Pre:** User role `viewer`.
- **Steps:** PUT.
- **Expected:** 403.
- **Severity:** high

## TC-API-PROJECTS-041 — PUT /projects/:id changing workspaceId ignored
- **Steps:** PUT `{workspaceId:"<other>"}`.
- **Expected:** 400 or silently ignored. Verify project not migrated.
- **Severity:** smoke

## TC-API-PROJECTS-042 — PATCH /projects/:id partial 200
- **Steps:** PATCH `{description:"new"}`.
- **Expected:** 200; name unchanged.
- **Severity:** medium

## TC-API-PROJECTS-043 — DELETE /projects/:id 204
- **Steps:** DELETE.
- **Expected:** 204 (or 200 with `{deleted:true}`).
- **Severity:** smoke

## TC-API-PROJECTS-044 — DELETE /projects/:id idempotent (already deleted)
- **Steps:** DELETE twice.
- **Expected:** Second 404 (or 204 if soft-delete idempotent). Record.
- **Severity:** medium

## TC-API-PROJECTS-045 — DELETE /projects/:id by viewer → 403
- **Steps:** Viewer DELETEs.
- **Expected:** 403.
- **Severity:** high

## TC-API-PROJECTS-046 — POST /projects/:id/duplicate 201
- **Steps:** Duplicate.
- **Expected:** 201 with new project; files cloned.
- **Severity:** high

## TC-API-PROJECTS-047 — POST /projects/:id/duplicate when over plan limit → 403
- **Pre:** At plan project cap.
- **Steps:** Duplicate.
- **Expected:** 403/422.
- **Severity:** high

## TC-API-PROJECTS-048 — POST /projects/:id/duplicate non-existent → 404
- **Steps:** Random UUID.
- **Expected:** 404.
- **Severity:** medium

## TC-API-PROJECTS-049 — POST /projects/:id/archive 200
- **Steps:** Archive.
- **Expected:** 200 `{archived:true}`.
- **Severity:** medium

## TC-API-PROJECTS-050 — POST /projects/:id/archive when already archived → 200/409
- **Steps:** Archive twice.
- **Expected:** 200 idempotent, or 409. Record.
- **Severity:** low

## TC-API-PROJECTS-051 — POST /projects/:id/unarchive 200
- **Pre:** Archived.
- **Steps:** Unarchive.
- **Expected:** 200 `{archived:false}`.
- **Severity:** medium

## TC-API-PROJECTS-052 — POST /projects/:id/move 200
- **Steps:** POST `{folderId}`.
- **Expected:** 200; folder_id updated.
- **Severity:** medium

## TC-API-PROJECTS-053 — POST /projects/:id/move folder in different workspace → 400/403
- **Steps:** Folder belongs to other workspace.
- **Expected:** 400 or 403.
- **Severity:** high

## TC-API-PROJECTS-054 — POST /projects/:id/star 200
- **Steps:** Star.
- **Expected:** 200; row appears in starred list.
- **Severity:** low

## TC-API-PROJECTS-055 — POST /projects/:id/unstar 200
- **Steps:** Unstar.
- **Expected:** 200.
- **Severity:** low

## TC-API-PROJECTS-056 — POST /projects/:id/star idempotent
- **Steps:** Star twice.
- **Expected:** 200 both times.
- **Severity:** low

## TC-API-PROJECTS-057 — GET /projects/:id/files 200
- **Steps:** List files.
- **Expected:** 200 `{data:[{path,size,...}]}`.
- **Severity:** smoke

## TC-API-PROJECTS-058 — GET /projects/:id/files when project not started 200/404
- **Steps:** GET on never-started project.
- **Expected:** 200 with empty list, or 404. Record.
- **Severity:** medium

## TC-API-PROJECTS-059 — POST /projects/:id/files create file 201
- **Steps:** POST `{path:"src/new.tsx", content:"..."}`.
- **Expected:** 201.
- **Severity:** high

## TC-API-PROJECTS-060 — POST /projects/:id/files path traversal `../etc/passwd` → 400
- **Steps:** path with ../.
- **Expected:** 400 `{error:"Invalid path"}`.
- **Severity:** smoke

## TC-API-PROJECTS-061 — POST /projects/:id/files absolute path `/etc/passwd` → 400
- **Steps:** path starts with `/`.
- **Expected:** 400.
- **Severity:** smoke

## TC-API-PROJECTS-062 — POST /projects/:id/files large file (>5 MB) → 413
- **Steps:** content 6 MB.
- **Expected:** 413 or 400.
- **Severity:** high

## TC-API-PROJECTS-063 — POST /projects/:id/files binary content allowed?
- **Steps:** content is base64 bytes; record.
- **Expected:** 201 if allowed, 400 if text-only.
- **Severity:** medium

## TC-API-PROJECTS-064 — GET /projects/:id/preview-url 200
- **Pre:** Project has dev server running.
- **Steps:** GET preview URL.
- **Expected:** 200 `{url:"https://<projectId>.staging.doable.me"}`.
- **Severity:** smoke

## TC-API-PROJECTS-065 — GET /projects/:id/preview-url when stopped → 200 or 503
- **Steps:** GET while stopped.
- **Expected:** 200 with URL still resolved (Caddy may serve maintenance), or 503.
- **Severity:** medium

## TC-API-PROJECTS-066 — POST /projects/:id/start 202
- **Steps:** Start dev server.
- **Expected:** 202; subsequent /status shows running.
- **Severity:** smoke

## TC-API-PROJECTS-067 — POST /projects/:id/start while already running → 200/409
- **Steps:** Start twice.
- **Expected:** 200 idempotent or 409.
- **Severity:** medium

## TC-API-PROJECTS-068 — POST /projects/:id/stop 200
- **Steps:** Stop.
- **Expected:** 200.
- **Severity:** smoke

## TC-API-PROJECTS-069 — POST /projects/:id/restart 200
- **Steps:** Restart.
- **Expected:** 200; PID rotates.
- **Severity:** medium

## TC-API-PROJECTS-070 — GET /projects/:id/logs 200 with text/event-stream
- **Steps:** GET /logs.
- **Expected:** 200; `Content-Type: text/event-stream`.
- **Severity:** medium

## TC-API-PROJECTS-071 — GET /projects/:id/logs auth failure → 401
- **Steps:** No token.
- **Expected:** 401.
- **Severity:** smoke

## TC-API-PROJECTS-072 — POST /projects/:id/share 200
- **Steps:** POST `{visibility:"public"}`.
- **Expected:** 200 share link.
- **Severity:** medium

## TC-API-PROJECTS-073 — POST /projects/:id/share invalid visibility → 400
- **Steps:** `visibility:"galaxy"`.
- **Expected:** 400.
- **Severity:** high

## TC-API-PROJECTS-074 — GET /projects/:id/collaborators 200
- **Steps:** GET.
- **Expected:** 200 `{data:[{userId,role,...}]}`.
- **Severity:** medium

## TC-API-PROJECTS-075 — POST /projects/:id/collaborators add user 201
- **Steps:** POST `{email:"qa-other@doable.test", role:"editor"}`.
- **Expected:** 201; user receives invite.
- **Severity:** high

## TC-API-PROJECTS-076 — POST collaborators invalid role → 400
- **Steps:** role:"god".
- **Expected:** 400.
- **Severity:** high

## TC-API-PROJECTS-077 — POST collaborators by viewer → 403
- **Steps:** Viewer adds.
- **Expected:** 403.
- **Severity:** high

## TC-API-PROJECTS-078 — POST collaborators duplicate → 409
- **Steps:** Add same user twice.
- **Expected:** 409 conflict.
- **Severity:** medium

## TC-API-PROJECTS-079 — DELETE collaborator 204
- **Steps:** DELETE existing collaborator.
- **Expected:** 204.
- **Severity:** medium

## TC-API-PROJECTS-080 — DELETE collaborator self-removal allowed
- **Steps:** Editor removes themselves.
- **Expected:** 204.
- **Severity:** medium

## TC-API-PROJECTS-081 — DELETE owner → 400/403
- **Steps:** Try to remove owner.
- **Expected:** 400 or 403 cannot remove owner.
- **Severity:** smoke

## TC-API-PROJECTS-082 — Wrong method PATCH on /projects → 404/405
- **Steps:** PATCH /projects (no id).
- **Expected:** 404 or 405.
- **Severity:** low

## TC-API-PROJECTS-083 — Excessive query params on GET /projects (50+)
- **Steps:** Many filters.
- **Expected:** 200, ignores unknown.
- **Severity:** low

## TC-API-PROJECTS-084 — POST /projects with description Unicode emoji
- **Steps:** description "🎨🔥🚀".
- **Expected:** 201; persisted.
- **Severity:** low

## TC-API-PROJECTS-085 — POST /projects when DB is read-only → 500
- **Pre:** Read-only DB.
- **Steps:** POST.
- **Expected:** 500 JSON error envelope.
- **Severity:** medium

## TC-API-PROJECTS-086 — Idempotency-Key on POST /projects
- **Steps:** Two POSTs same `Idempotency-Key`.
- **Expected:** Same response both times — only one row created. If unsupported, document.
- **Severity:** medium

## TC-API-PROJECTS-087 — CORS preflight on /projects
- **Steps:** OPTIONS /projects from staging.doable.me.
- **Expected:** 204 with allow headers.
- **Severity:** smoke

## TC-API-PROJECTS-088 — CORS from disallowed origin
- **Steps:** OPTIONS from evil.com.
- **Expected:** No allow header / 403.
- **Severity:** smoke

## TC-API-PROJECTS-089 — Header injection via X-Project-Id custom header
- **Steps:** Header with CRLF.
- **Expected:** 400 or sanitized.
- **Severity:** medium

## TC-API-PROJECTS-090 — Filter combination matrix (3 filters × 3 values)
- **Steps:** Combinations of `archived` × `folderId` × `starred`.
- **Expected:** Each yields correct subset; 9 cases pass.
- **Severity:** medium
