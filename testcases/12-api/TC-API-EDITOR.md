# TC-API-EDITOR — /editor (and project-files) route group

Mounted at `/` (`services/api/src/routes.ts:74,68`). Source: `services/api/src/routes/editor.ts` and `routes/project-files.ts` / `routes/project-files/`.

Endpoints (representative — verify in source):
- `GET    /editor/:projectId/files`
- `GET    /editor/:projectId/files/*path`
- `PUT    /editor/:projectId/files/*path`
- `POST   /editor/:projectId/files`
- `DELETE /editor/:projectId/files/*path`
- `POST   /editor/:projectId/save`
- `GET    /editor/:projectId/tree`
- `POST   /editor/:projectId/rename`
- `POST   /editor/:projectId/move`
- `GET    /direct-save/:projectId/files/*path` (filesystem-backed, no AI)
- `POST   /direct-save/:projectId/files/*path`
- `GET    /project-files/:projectId/list`

---

## TC-API-EDITOR-001 — GET /editor/:projectId/files 200
- **Steps:** GET as project owner.
- **Expected:** 200 file list.
- **Severity:** smoke

## TC-API-EDITOR-002 — GET unauth → 401
- **Expected:** 401.
- **Severity:** smoke

## TC-API-EDITOR-003 — GET other user's project → 404/403
- **Expected:** 404 or 403.
- **Severity:** smoke

## TC-API-EDITOR-004 — GET projectId not UUID → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-EDITOR-005 — GET single file by path 200
- **Steps:** GET `/editor/:id/files/src/App.tsx`.
- **Expected:** 200 with content.
- **Severity:** smoke

## TC-API-EDITOR-006 — GET file path traversal `../` → 400
- **Steps:** path `../../etc/passwd`.
- **Expected:** 400 invalid path.
- **Severity:** smoke

## TC-API-EDITOR-007 — GET file absolute path `/etc/passwd` → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-EDITOR-008 — GET file null-byte injection
- **Steps:** path `App.tsx%00.png`.
- **Expected:** 400.
- **Severity:** high

## TC-API-EDITOR-009 — GET file unicode normalization (homograph)
- **Steps:** path with combining characters `Apṕ.tsx`.
- **Expected:** 404 or 400.
- **Severity:** medium

## TC-API-EDITOR-010 — GET file CRLF in path → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-EDITOR-011 — GET very long path (4096 chars) → 400/414
- **Expected:** 400/414.
- **Severity:** medium

## TC-API-EDITOR-012 — GET file binary returned as base64 or octet-stream
- **Steps:** request a PNG asset.
- **Expected:** 200 with `Content-Type: image/png` or JSON wrapping base64. Document.
- **Severity:** medium

## TC-API-EDITOR-013 — PUT /editor/:id/files/path 200 update
- **Steps:** PUT new content.
- **Expected:** 200, file updated; build event emitted.
- **Severity:** smoke

## TC-API-EDITOR-014 — PUT non-existent file → 201 (creates) or 404
- **Expected:** Document; if upsert → 201.
- **Severity:** medium

## TC-API-EDITOR-015 — PUT on viewer role → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-EDITOR-016 — PUT 6 MB content → 413
- **Expected:** 413.
- **Severity:** high

## TC-API-EDITOR-017 — PUT content with NUL bytes
- **Steps:** body containing `\0`.
- **Expected:** 400 or stripped — record.
- **Severity:** medium

## TC-API-EDITOR-018 — POST /editor/:id/files create new file 201
- **Steps:** POST `{path:"src/new.tsx", content:"..."}`.
- **Expected:** 201.
- **Severity:** smoke

## TC-API-EDITOR-019 — POST file with path containing `..` → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-EDITOR-020 — POST file when path already exists → 409
- **Expected:** 409 or 200 idempotent. Record.
- **Severity:** medium

## TC-API-EDITOR-021 — DELETE /editor/:id/files/path 204
- **Expected:** 204.
- **Severity:** smoke

## TC-API-EDITOR-022 — DELETE protected file (e.g. package.json) → 400/403
- **Expected:** 400/403 if protected; record.
- **Severity:** medium

## TC-API-EDITOR-023 — POST /editor/:id/save 200 (commit save)
- **Expected:** 200.
- **Severity:** medium

## TC-API-EDITOR-024 — POST save on stopped project — still ok
- **Expected:** 200; saves to disk.
- **Severity:** medium

## TC-API-EDITOR-025 — GET /editor/:id/tree 200
- **Expected:** 200 nested tree.
- **Severity:** medium

## TC-API-EDITOR-026 — GET tree with `?max-depth=2`
- **Expected:** 200; nested levels capped.
- **Severity:** low

## TC-API-EDITOR-027 — POST /editor/:id/rename 200
- **Steps:** rename `App.tsx` → `Main.tsx`.
- **Expected:** 200.
- **Severity:** medium

## TC-API-EDITOR-028 — POST rename to existing name → 409
- **Expected:** 409.
- **Severity:** medium

## TC-API-EDITOR-029 — POST rename across folders 200
- **Steps:** include directory change.
- **Expected:** 200.
- **Severity:** medium

## TC-API-EDITOR-030 — POST /editor/:id/move 200
- **Steps:** move file to subfolder.
- **Expected:** 200.
- **Severity:** medium

## TC-API-EDITOR-031 — DIRECT-SAVE GET file 200
- **Steps:** GET `/direct-save/:projectId/files/src/App.tsx`.
- **Expected:** 200; no auth (per source, filesystem-backed).
- **Severity:** smoke

## TC-API-EDITOR-032 — DIRECT-SAVE auth optional
- **Steps:** Send token vs no token.
- **Expected:** Both 200 — direct-save bypasses auth.
- **Severity:** smoke

## TC-API-EDITOR-033 — DIRECT-SAVE path traversal blocked
- **Steps:** GET `/direct-save/:id/files/../../etc/passwd`.
- **Expected:** 400.
- **Severity:** smoke

## TC-API-EDITOR-034 — DIRECT-SAVE other project access (cross-tenant)
- **Steps:** GET file in another user's projectId.
- **Expected:** 200 if no auth (filesystem-backed) — confirm this is expected for live preview only and not exposing secrets.
- **Severity:** smoke

## TC-API-EDITOR-035 — DIRECT-SAVE POST overwrite 200
- **Expected:** 200.
- **Severity:** smoke

## TC-API-EDITOR-036 — DIRECT-SAVE POST extremely large file → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-EDITOR-037 — Wrong method PATCH on /editor/:id/files → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-EDITOR-038 — Header injection on `If-Match`
- **Steps:** CRLF in header.
- **Expected:** 400.
- **Severity:** medium

## TC-API-EDITOR-039 — Idempotency-Key on POST file
- **Expected:** Same response twice; one row created.
- **Severity:** medium

## TC-API-EDITOR-040 — CORS preflight on /editor/:id/files
- **Expected:** 204 with allow.
- **Severity:** medium

## TC-API-EDITOR-041 — Concurrent PUT on same file (last-writer-wins or 409)
- **Steps:** Two PUTs ms apart, different content.
- **Expected:** Both 200, last-write wins, OR 409 if If-Match used. Document.
- **Severity:** high

## TC-API-EDITOR-042 — File extension restrictions (e.g. `.env`)
- **Steps:** POST file `.env` with secrets.
- **Expected:** 400 if restricted; or 200 — record.
- **Severity:** high

## TC-API-EDITOR-043 — Invalid UTF-8 sequence in content
- **Steps:** Raw bytes 0xC3 0x28.
- **Expected:** 400 or substituted.
- **Severity:** medium

## TC-API-EDITOR-044 — File path with leading slash
- **Steps:** path `/src/x.tsx`.
- **Expected:** 400 or normalised.
- **Severity:** medium

## TC-API-EDITOR-045 — File path with `\` (Windows)
- **Steps:** path `src\\x.tsx`.
- **Expected:** 400 (only forward slash) or normalised.
- **Severity:** medium

## TC-API-EDITOR-046 — Listing very large project (5000 files)
- **Pre:** Project with 5000 files.
- **Steps:** GET /tree.
- **Expected:** 200 within reasonable timeout (< 5s).
- **Severity:** medium

## TC-API-EDITOR-047 — DELETE non-existent → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-EDITOR-048 — Read-only after archive
- **Pre:** Project archived.
- **Steps:** PUT file.
- **Expected:** 403 read-only.
- **Severity:** medium

## TC-API-EDITOR-049 — Save while project at git rebase (lock) → 409
- **Pre:** git operation in progress.
- **Steps:** POST /save.
- **Expected:** 409 lock conflict.
- **Severity:** medium

## TC-API-EDITOR-050 — Server error returns JSON envelope
- **Pre:** Force fs error.
- **Steps:** PUT.
- **Expected:** 500 JSON.
- **Severity:** medium
