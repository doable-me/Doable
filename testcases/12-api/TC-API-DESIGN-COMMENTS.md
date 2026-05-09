# TC-API-DESIGN-COMMENTS — /design-comments

Mounted at `/design-comments` (`services/api/src/routes.ts:112`). Source: `services/api/src/routes/design-comments.ts`.

Endpoints (representative):
- `GET    /design-comments/:projectId`
- `POST   /design-comments/:projectId`        — create comment with x/y anchor
- `PUT    /design-comments/:cid`
- `DELETE /design-comments/:cid`
- `POST   /design-comments/:cid/resolve`
- `POST   /design-comments/:cid/reopen`
- `POST   /design-comments/:cid/replies`
- `DELETE /design-comments/replies/:rid`

---

## TC-API-DC-001 — GET 200 by project member
- **Expected:** 200 list.
- **Severity:** smoke

## TC-API-DC-002 — GET 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-DC-003 — GET other project → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-DC-004 — POST create 201
- **Steps:** POST `{x:0.5, y:0.5, text, page:"home"}`.
- **Expected:** 201.
- **Severity:** smoke

## TC-API-DC-005 — POST x outside [0,1] → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-DC-006 — POST text empty → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-DC-007 — POST text 5KB → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-DC-008 — POST attachments URL malformed → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-DC-009 — POST attachments SSRF localhost → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-DC-010 — PUT comment by author 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-DC-011 — PUT comment by other → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-DC-012 — DELETE comment 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-DC-013 — POST resolve 200
- **Expected:** 200; status=resolved.
- **Severity:** medium

## TC-API-DC-014 — POST reopen 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-DC-015 — POST reply 201
- **Expected:** 201.
- **Severity:** medium

## TC-API-DC-016 — DELETE reply 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-DC-017 — Path SQL injection on :cid / :rid / :projectId
- **Expected:** 400.
- **Severity:** smoke

## TC-API-DC-018 — Wrong method PATCH → 405/404
- **Expected:** 405/404.
- **Severity:** low

## TC-API-DC-019 — Body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-DC-020 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-DC-021 — Header CRLF → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-DC-022 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-DC-023 — Pagination cursor edges
- **Expected:** Empty/end correct.
- **Severity:** medium

## TC-API-DC-024 — Filter (status × page × resolvedBy) matrix
- **Expected:** Correct subsets.
- **Severity:** medium

## TC-API-DC-025 — Mention notifications fanout via WS
- **Expected:** Mentioned users get notification.
- **Severity:** medium
