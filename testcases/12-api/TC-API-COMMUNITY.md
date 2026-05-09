# TC-API-COMMUNITY — /community route group

Mounted at `/community` (`services/api/src/routes.ts:96`). Source: `services/api/src/routes/community.ts`.

Endpoints (representative):
- `GET    /community/feed`
- `GET    /community/posts`
- `GET    /community/posts/:id`
- `POST   /community/posts`
- `PUT    /community/posts/:id`
- `DELETE /community/posts/:id`
- `POST   /community/posts/:id/like`
- `DELETE /community/posts/:id/like`
- `POST   /community/posts/:id/comments`
- `DELETE /community/comments/:id`
- `POST   /community/posts/:id/report`
- `GET    /community/leaderboard`
- `GET    /community/featured`

---

## TC-API-COMM-001 — GET /community/feed 200
- **Expected:** 200 latest posts.
- **Severity:** smoke

## TC-API-COMM-002 — GET /community/feed without auth (public)
- **Expected:** 200 if public; 401 otherwise. Record.
- **Severity:** medium

## TC-API-COMM-003 — GET /community/posts pagination cursor
- **Expected:** 200.
- **Severity:** medium

## TC-API-COMM-004 — GET /community/posts/:id 404
- **Expected:** 404 for missing.
- **Severity:** medium

## TC-API-COMM-005 — POST /community/posts 201
- **Steps:** POST `{title,content}`.
- **Expected:** 201.
- **Severity:** smoke

## TC-API-COMM-006 — POST post 401
- **Expected:** 401.
- **Severity:** smoke

## TC-API-COMM-007 — POST post empty title → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-COMM-008 — POST post 1MB content → 413/400
- **Expected:** 413/400.
- **Severity:** medium

## TC-API-COMM-009 — POST post HTML/script in content
- **Steps:** content `<script>alert(1)</script>`.
- **Expected:** Stored sanitized; rendered escaped.
- **Severity:** smoke

## TC-API-COMM-010 — PUT post by author 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-COMM-011 — PUT post by other → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-COMM-012 — DELETE post by author 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-COMM-013 — DELETE post by mod 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-COMM-014 — POST like 200
- **Expected:** 200; like count incremented.
- **Severity:** medium

## TC-API-COMM-015 — POST like twice idempotent
- **Expected:** 200 still 1 like.
- **Severity:** medium

## TC-API-COMM-016 — DELETE like 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-COMM-017 — POST comment 201
- **Expected:** 201.
- **Severity:** medium

## TC-API-COMM-018 — POST comment max length → 400
- **Steps:** content > 5KB.
- **Expected:** 400.
- **Severity:** medium

## TC-API-COMM-019 — DELETE comment by author 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-COMM-020 — POST report 200
- **Steps:** POST `{reason:"spam"}`.
- **Expected:** 200.
- **Severity:** medium

## TC-API-COMM-021 — POST report invalid reason → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-COMM-022 — Rate limit POST /posts (e.g. 5/hr)
- **Expected:** 429 after threshold.
- **Severity:** high

## TC-API-COMM-023 — GET /community/leaderboard 200
- **Expected:** 200 ordered list.
- **Severity:** low

## TC-API-COMM-024 — GET /community/featured 200
- **Expected:** 200.
- **Severity:** low

## TC-API-COMM-025 — Path SQL injection on :id
- **Expected:** 400.
- **Severity:** smoke

## TC-API-COMM-026 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-COMM-027 — Header CRLF injection
- **Expected:** 400.
- **Severity:** medium

## TC-API-COMM-028 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-COMM-029 — Idempotency-Key on POST /posts
- **Expected:** Single post.
- **Severity:** medium

## TC-API-COMM-030 — Filter combination (tag × language × sort) matrix
- **Expected:** Correct subsets.
- **Severity:** medium
