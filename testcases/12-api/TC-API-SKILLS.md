# TC-API-SKILLS — /workspaces/:wid/skills + /rules HTTP coverage

Mounted at `/workspaces` (`services/api/src/routes.ts:101`). Source: `services/api/src/routes/skills.ts`.

Endpoints (verified in source):
- `GET    /workspaces/:wid/skills?projectId=`
- `GET    /workspaces/:wid/skills/manifest`
- `POST   /workspaces/:wid/skills`
- `PUT    /workspaces/:wid/skills/:id`
- `DELETE /workspaces/:wid/skills/:id`
- `GET    /workspaces/:wid/skills/:id/files`
- `GET    /workspaces/:wid/skills/:id/files/:path{.+}`
- `POST   /workspaces/:wid/skills/:id/files`
- `DELETE /workspaces/:wid/skills/:id/files/:path{.+}`
- `GET    /workspaces/:wid/rules`
- `POST   /workspaces/:wid/rules`
- `PUT    /workspaces/:wid/rules/:id`
- `DELETE /workspaces/:wid/rules/:id`

All routes require auth + workspace membership (any role suffices for read; write may require editor+ — verify in source).

---

## TC-API-SKILLS-001 — GET /skills 200 lists workspace skills
- **Pre:** Workspace has 3 skills (workspace-scoped).
- **Steps:** GET /workspaces/:wid/skills.
- **Expected:** 200 `{data:[3 skills]}`.
- **Severity:** smoke

## TC-API-SKILLS-002 — GET /skills?projectId= filters project-scoped
- **Pre:** 1 project-scoped + 2 workspace-scoped.
- **Steps:** GET with projectId.
- **Expected:** 200 with workspace + project-scoped (3 rows).
- **Severity:** high

## TC-API-SKILLS-003 — GET /skills 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-SKILLS-004 — GET /skills 403 non-member
- **Steps:** GET another workspace.
- **Expected:** 403 `{error:"Not a member of this workspace"}`.
- **Severity:** smoke

## TC-API-SKILLS-005 — GET /skills :wid not UUID → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-SKILLS-006 — GET /skills :wid SQL injection
- **Expected:** 400.
- **Severity:** smoke

## TC-API-SKILLS-007 — GET /skills/manifest 200
- **Expected:** 200 light-weight skill list (id, name, description, autoInvoke).
- **Severity:** smoke

## TC-API-SKILLS-008 — POST /skills create workspace-scoped 201
- **Steps:** POST `{scope:"workspace", skillName:"format-md", description:"", skillContent:"# rules\n", autoInvoke:true}`.
- **Expected:** 201 with id.
- **Severity:** smoke

## TC-API-SKILLS-009 — POST /skills create project-scoped 201
- **Steps:** scope:"project" + projectId.
- **Expected:** 201.
- **Severity:** smoke

## TC-API-SKILLS-010 — POST /skills project scope without projectId → 400
- **Steps:** scope:"project", no projectId.
- **Expected:** 400 `{error:"projectId is required for project-scoped skills"}`.
- **Severity:** high

## TC-API-SKILLS-011 — POST /skills workspace scope WITH projectId → 400
- **Steps:** scope:"workspace", projectId set.
- **Expected:** 400 `{error:"projectId must be omitted for non-project-scoped skills"}`.
- **Severity:** high

## TC-API-SKILLS-012 — POST /skills user scope persists user_id from auth, not body
- **Steps:** scope:"user", body has `userId: <other-user>`.
- **Expected:** 201; row's user_id = caller's id (body field ignored).
- **Severity:** smoke

## TC-API-SKILLS-013 — POST /skills invalid scope enum → 400
- **Steps:** scope:"galaxy".
- **Expected:** 400 enum mismatch.
- **Severity:** high

## TC-API-SKILLS-014 — POST /skills empty skillName → 400
- **Steps:** skillName "".
- **Expected:** 400 min(1).
- **Severity:** high

## TC-API-SKILLS-015 — POST /skills skillName 201+ chars → 400
- **Steps:** skillName 250 chars.
- **Expected:** 400 max(200).
- **Severity:** medium

## TC-API-SKILLS-016 — POST /skills skillName starts with hyphen → 400
- **Steps:** skillName "-bad".
- **Expected:** 400 (regex `^[a-zA-Z0-9]`).
- **Severity:** high

## TC-API-SKILLS-017 — POST /skills skillName starts with digit → 201
- **Steps:** skillName "1-skill".
- **Expected:** 201 (allowed).
- **Severity:** medium

## TC-API-SKILLS-018 — POST /skills skillName disallowed char `@` → 400
- **Steps:** skillName "skill@one".
- **Expected:** 400.
- **Severity:** high

## TC-API-SKILLS-019 — POST /skills skillName with space (allowed)
- **Steps:** skillName "format md docs".
- **Expected:** 201.
- **Severity:** low

## TC-API-SKILLS-020 — POST /skills empty content → 400
- **Steps:** skillContent "".
- **Expected:** 400 min(1).
- **Severity:** high

## TC-API-SKILLS-021 — POST /skills 1MB content
- **Steps:** content padded to 1 MB.
- **Expected:** 201 (no explicit cap on parent content) or 413 if body cap. Record.
- **Severity:** medium

## TC-API-SKILLS-022 — POST /skills missing skillName → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-SKILLS-023 — POST /skills description default ""
- **Steps:** Omit description.
- **Expected:** 201; description "".
- **Severity:** low

## TC-API-SKILLS-024 — POST /skills description max 500 → 400 over
- **Steps:** description 501 chars.
- **Expected:** 400.
- **Severity:** medium

## TC-API-SKILLS-025 — POST /skills 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-SKILLS-026 — POST /skills 403 non-member
- **Expected:** 403.
- **Severity:** smoke

## TC-API-SKILLS-027 — POST /skills wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-SKILLS-028 — POST /skills malformed JSON → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-SKILLS-029 — POST /skills body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-SKILLS-030 — POST /skills extra unknown field stripped/ignored
- **Steps:** body with `is_admin:true`.
- **Expected:** 201; no privilege escalation.
- **Severity:** smoke

## TC-API-SKILLS-031 — POST /skills duplicate name in same workspace+scope
- **Steps:** Create two with same name.
- **Expected:** 409 if unique constraint, otherwise 201 (record).
- **Severity:** high

## TC-API-SKILLS-032 — PUT /skills/:id 200
- **Steps:** PUT `{description:"updated"}`.
- **Expected:** 200.
- **Severity:** smoke

## TC-API-SKILLS-033 — PUT /skills/:id 404 not found
- **Expected:** 404.
- **Severity:** smoke

## TC-API-SKILLS-034 — PUT /skills/:id cross-workspace → 404
- **Steps:** PUT skill from another workspace.
- **Expected:** 404 (per `getSkillForWorkspace` check).
- **Severity:** smoke

## TC-API-SKILLS-035 — PUT /skills/:id user-scoped owned by another → 403
- **Steps:** Other user's user-scoped skill.
- **Expected:** 403 `{error:"Cannot edit another user's personal skill"}`.
- **Severity:** smoke

## TC-API-SKILLS-036 — PUT /skills/:id update content 200
- **Expected:** 200; rows updated_at advances.
- **Severity:** smoke

## TC-API-SKILLS-037 — PUT /skills/:id with no fields → 200 no-op or 400
- **Expected:** 200 noop or 400 (record).
- **Severity:** medium

## TC-API-SKILLS-038 — PUT /skills/:id description over max → 400
- **Steps:** description 501 chars.
- **Expected:** 400.
- **Severity:** medium

## TC-API-SKILLS-039 — PUT /skills/:id autoInvoke toggling
- **Expected:** 200; autoInvoke flips.
- **Severity:** medium

## TC-API-SKILLS-040 — DELETE /skills/:id 200
- **Expected:** 200 `{data:{id,deleted:true}}`.
- **Severity:** smoke

## TC-API-SKILLS-041 — DELETE /skills/:id idempotent / 404 second time
- **Expected:** 404 second.
- **Severity:** medium

## TC-API-SKILLS-042 — DELETE /skills/:id user-scoped not owner → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-SKILLS-043 — DELETE cascade removes companion files
- **Pre:** Skill with files.
- **Steps:** DELETE.
- **Expected:** Files no longer queryable; cascade.
- **Severity:** high

## TC-API-SKILLS-044 — DELETE cascade removes context_skill_files links
- **Pre:** Skill linked to a project's context.
- **Expected:** Linkage removed; chat won't include it.
- **Severity:** high

## TC-API-SKILLS-045 — GET /skills/:id/files 200
- **Expected:** 200 list of file metadata (id, file_path, size, updated_at).
- **Severity:** smoke

## TC-API-SKILLS-046 — GET /skills/:id/files cross-workspace 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-SKILLS-047 — GET /skills/:id/files/:path 200
- **Steps:** path "config.json".
- **Expected:** 200 with content.
- **Severity:** smoke

## TC-API-SKILLS-048 — GET file path traversal `../foo` → 400
- **Expected:** 400 `{error:"Invalid file path"}`.
- **Severity:** smoke

## TC-API-SKILLS-049 — GET file `SKILL.md` → 400 (reserved)
- **Expected:** 400.
- **Severity:** smoke

## TC-API-SKILLS-050 — GET file with `..` mid-path → 400
- **Steps:** path "a/../b".
- **Expected:** 400.
- **Severity:** smoke

## TC-API-SKILLS-051 — GET file path with disallowed chars → 400
- **Steps:** path "a b.md" (space).
- **Expected:** 400 (regex requires `[a-zA-Z0-9._-]`).
- **Severity:** high

## TC-API-SKILLS-052 — GET file path empty → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-SKILLS-053 — GET file 513-char path → 400
- **Expected:** 400 max 512.
- **Severity:** medium

## TC-API-SKILLS-054 — GET file URL-encoded slashes
- **Steps:** path "sub%2Ffile.json" → decodes to "sub/file.json".
- **Expected:** 200/404 valid path; not 400.
- **Severity:** medium

## TC-API-SKILLS-055 — GET file null-byte injection → 400
- **Steps:** path "a%00.md".
- **Expected:** 400.
- **Severity:** smoke

## TC-API-SKILLS-056 — POST /skills/:id/files 201
- **Steps:** POST `{filePath:"config.json", content:"{}"}`.
- **Expected:** 201.
- **Severity:** smoke

## TC-API-SKILLS-057 — POST file invalid path (with `..`) → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-SKILLS-058 — POST file content > 2 MB → 400 (zod max)
- **Steps:** content 2.5 MB.
- **Expected:** 400.
- **Severity:** high

## TC-API-SKILLS-059 — POST file `SKILL.md` reserved → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-SKILLS-060 — POST file empty path → 400
- **Expected:** 400 min(1).
- **Severity:** high

## TC-API-SKILLS-061 — POST file path 513 chars → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-SKILLS-062 — POST file overwrites existing (upsert) 201
- **Expected:** 201 with new content.
- **Severity:** smoke

## TC-API-SKILLS-063 — POST file when caller is not owner of user-scoped skill → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-SKILLS-064 — POST file in skill from other workspace → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-SKILLS-065 — DELETE file 200
- **Expected:** 200 `{data:{skillId,file_path,deleted:true}}`.
- **Severity:** smoke

## TC-API-SKILLS-066 — DELETE file path traversal → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-SKILLS-067 — DELETE file not found → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-SKILLS-068 — DELETE file by non-owner of user skill → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-SKILLS-069 — GET /rules 200
- **Expected:** 200 list.
- **Severity:** smoke

## TC-API-SKILLS-070 — POST /rules 201 (workspace scope)
- **Steps:** POST `{scope:"workspace", ruleName:"prefer-async", content:"...", filePatterns:["**/*.ts"]}`.
- **Expected:** 201.
- **Severity:** smoke

## TC-API-SKILLS-071 — POST /rules invalid scope → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-SKILLS-072 — POST /rules ruleName empty → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-SKILLS-073 — POST /rules content empty → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-SKILLS-074 — POST /rules filePatterns empty default
- **Steps:** Omit filePatterns.
- **Expected:** 201; defaults to [].
- **Severity:** low

## TC-API-SKILLS-075 — POST /rules project scope without projectId
- **Expected:** 400.
- **Severity:** high

## TC-API-SKILLS-076 — POST /rules large filePatterns array (10000)
- **Expected:** 400 max array length.
- **Severity:** medium

## TC-API-SKILLS-077 — PUT /rules/:id 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-SKILLS-078 — DELETE /rules/:id 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-SKILLS-079 — Path SQL injection on /skills/:id and /rules/:id
- **Expected:** 400.
- **Severity:** smoke

## TC-API-SKILLS-080 — Wrong method PATCH /skills → 405/404
- **Expected:** 405/404.
- **Severity:** low

## TC-API-SKILLS-081 — Idempotency-Key on POST /skills
- **Expected:** Same row returned twice.
- **Severity:** medium

## TC-API-SKILLS-082 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-SKILLS-083 — Header CRLF injection
- **Expected:** 400.
- **Severity:** medium

## TC-API-SKILLS-084 — Server error returns JSON envelope
- **Pre:** Force DB error.
- **Expected:** 500 JSON.
- **Severity:** high

## TC-API-SKILLS-085 — Filter combo (scope × projectId × autoInvoke)
- **Expected:** Correct subsets.
- **Severity:** medium
