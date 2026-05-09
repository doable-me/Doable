# TC-API-DIRECT-SAVE — /direct-save route group

Mounted at `/` (`services/api/src/routes.ts:70`). Source: `services/api/src/direct-save/index.ts`. AST-based visual edit saves; filesystem-backed; no AI; **no auth** (per source comment).

Endpoints (representative):
- `GET    /direct-save/:projectId/files/*path`
- `POST   /direct-save/:projectId/files/*path`            — apply visual edit operation
- `POST   /direct-save/:projectId/preview-edit`           — dry run

---

## TC-API-DS-001 — GET 200 read file
- **Expected:** 200 with content.
- **Severity:** smoke

## TC-API-DS-002 — GET no auth allowed (filesystem-backed)
- **Expected:** 200 even without Authorization.
- **Severity:** smoke

## TC-API-DS-003 — Path traversal `../etc/passwd` → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-DS-004 — Path absolute `/etc/passwd` → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-DS-005 — Project does not exist → 404
- **Expected:** 404.
- **Severity:** medium

## TC-API-DS-006 — POST apply edit operation 200
- **Steps:** POST `{operation:"setText", selector, value}`.
- **Expected:** 200 with patched file.
- **Severity:** smoke

## TC-API-DS-007 — POST invalid operation → 400
- **Steps:** operation "destroyAll".
- **Expected:** 400.
- **Severity:** high

## TC-API-DS-008 — POST AST parse failure on broken file → 422
- **Expected:** 422 with parser error.
- **Severity:** high

## TC-API-DS-009 — POST when file is not JSX/TSX → 400
- **Steps:** path "src/styles.css".
- **Expected:** 400 only JSX-AST supported here.
- **Severity:** medium

## TC-API-DS-010 — POST 5MB body → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-DS-011 — POST preview-edit 200 (dry run, no write)
- **Expected:** 200 with diff; file untouched on disk.
- **Severity:** smoke

## TC-API-DS-012 — POST preview-edit invalid selector → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-DS-013 — Concurrent direct-save on same file (race)
- **Steps:** Two POSTs simultaneously.
- **Expected:** Both 200 with last-writer-wins; document.
- **Severity:** high

## TC-API-DS-014 — Cross-tenant: different user's projectId
- **Steps:** POST another user's file (no auth).
- **Expected:** 200 — confirm intentional (live preview model). If sensitive, document.
- **Severity:** smoke

## TC-API-DS-015 — Wrong method PATCH → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-DS-016 — Wrong content-type for POST → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-DS-017 — Header CRLF → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-DS-018 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-DS-019 — Path SQL injection on :projectId → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-DS-020 — Long path 4000 chars → 414/400
- **Expected:** 414/400.
- **Severity:** medium

## TC-API-DS-021 — Server error returns JSON
- **Expected:** 500 JSON.
- **Severity:** medium
