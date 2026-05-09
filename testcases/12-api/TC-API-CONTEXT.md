# TC-API-CONTEXT — /projects/:id/context + /workspaces/:wid/context

Mounted at `/projects/:id/context` and `/workspaces/:wid/context` (`services/api/src/routes.ts:85,110`). Source: `services/api/src/routes/context.ts`.

Endpoints (representative):
- `GET    /projects/:id/context`
- `PUT    /projects/:id/context`
- `POST   /projects/:id/context/files`            — attach files (RAG ingest)
- `DELETE /projects/:id/context/files/:fid`
- `GET    /projects/:id/context/skills`           — context_skills attachment
- `POST   /projects/:id/context/skills`           — link skill
- `DELETE /projects/:id/context/skills/:sid`
- `GET    /projects/:id/context/skill-files`      — context_skill_files
- `POST   /projects/:id/context/skill-files`
- `DELETE /projects/:id/context/skill-files/:sfid`
- `GET    /workspaces/:wid/context`               — workspace-level rules

---

## TC-API-CTX-001 — GET /projects/:id/context 200
- **Expected:** 200 current context.
- **Severity:** smoke

## TC-API-CTX-002 — GET 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-CTX-003 — GET other project → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-CTX-004 — PUT /context 200
- **Steps:** PUT `{instructions:"...", model:"claude-..."}`.
- **Expected:** 200.
- **Severity:** smoke

## TC-API-CTX-005 — PUT instructions 1MB → 413/400
- **Expected:** 413/400.
- **Severity:** medium

## TC-API-CTX-006 — POST /context/files 201
- **Steps:** Upload file for RAG.
- **Expected:** 201.
- **Severity:** medium

## TC-API-CTX-007 — POST /context/files type not allowed → 400
- **Steps:** file type ".exe".
- **Expected:** 400.
- **Severity:** high

## TC-API-CTX-008 — POST /context/files exceeds quota → 422
- **Expected:** 422.
- **Severity:** medium

## TC-API-CTX-009 — DELETE /context/files/:fid 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-CTX-010 — GET /context/skills 200
- **Expected:** 200 list.
- **Severity:** smoke

## TC-API-CTX-011 — POST /context/skills link skill 200
- **Steps:** POST `{skillId}`.
- **Expected:** 200.
- **Severity:** medium

## TC-API-CTX-012 — POST link skill from another workspace → 400/403
- **Expected:** 400/403.
- **Severity:** high

## TC-API-CTX-013 — POST link skill duplicate → 409 or idempotent
- **Expected:** 409 or 200.
- **Severity:** medium

## TC-API-CTX-014 — DELETE link 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-CTX-015 — GET /context/skill-files 200
- **Expected:** 200 list.
- **Severity:** medium

## TC-API-CTX-016 — POST /context/skill-files link 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-CTX-017 — POST link non-existent skill file → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-CTX-018 — DELETE link 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-CTX-019 — GET /workspaces/:wid/context 200
- **Expected:** 200 workspace rules + skills.
- **Severity:** smoke

## TC-API-CTX-020 — Path SQL injection
- **Expected:** 400.
- **Severity:** smoke

## TC-API-CTX-021 — Wrong method PATCH on /context/files → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-CTX-022 — Body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-CTX-023 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-CTX-024 — Header CRLF → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-CTX-025 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-CTX-026 — Idempotency-Key on POST /context/skills
- **Expected:** Single link.
- **Severity:** medium

## TC-API-CTX-027 — Pagination cursor edges
- **Expected:** Empty/end correct.
- **Severity:** medium

## TC-API-CTX-028 — Server error returns JSON
- **Expected:** 500 JSON.
- **Severity:** medium
