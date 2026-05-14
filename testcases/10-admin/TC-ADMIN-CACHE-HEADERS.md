# TC-ADMIN-CACHE-HEADERS — admin responses must not be cached and must not embed in iframes

**Tied to:** BUG-ADMIN-010 (Cache-Control: no-store missing; X-Frame-Options SAMEORIGIN too permissive)
**Severity:** Medium (security — cache poisoning + clickjacking on admin)
**Surface:** `/admin/*` (API), `/admin` web shell (Next.js middleware already covers this — see BUG-ADMIN-009)

## Why
Admin responses contain user lists, project lists, feature flags, plan limits and other
platform-wide data. If a shared proxy or browser caches a response, a subsequent admin
on the same machine — or worse, a non-admin behind the same proxy — can see stale or
unauthorised data. Embedding the admin response inside an iframe permits clickjacking
on internal admin shells.

## Setup
- qa-owner promoted to `is_platform_admin = true`
- qa-member remains non-admin
- API at `https://dev-api.doable.me`

## Cases

### TC-ADMIN-CACHE-HEADERS-001 — list endpoints carry no-store
- Request: `GET /admin/users` with admin bearer
- Expect headers:
  - `cache-control: no-store, private`
  - `x-frame-options: DENY`
  - `referrer-policy: same-origin`
  - `pragma: no-cache`
- Status: 200

### TC-ADMIN-CACHE-HEADERS-002 — detail endpoints carry no-store
- `GET /admin/projects/<uuid>` → headers above, body matches project detail.

### TC-ADMIN-CACHE-HEADERS-003 — feature flag PATCH carries no-store
- `PATCH /admin/features/ai_chat {enabled:true}` → headers above + 200.

### TC-ADMIN-CACHE-HEADERS-004 — non-admin paths unchanged
- `GET /workspaces` with member bearer → no `cache-control: no-store, private`
  (regression guard: the admin override must not leak into non-admin routes).

### TC-ADMIN-CACHE-HEADERS-005 — 401 unauth responses still carry no-store
- `GET /admin/users` with no Authorization → 401 AND `cache-control: no-store, private`
  (so error responses with hints about admin existence are not cached either).

### TC-ADMIN-CACHE-HEADERS-006 — 403 forbidden responses still carry no-store
- `GET /admin/users` with non-admin bearer → 403 AND `cache-control: no-store, private`.

## Repro commands
```bash
ADMIN_TOK=...   # from /auth/login as qa-owner (after DB promotion)
MEMBER_TOK=...  # from /auth/login as qa-member

# 001 + 005 + 006
curl -sS -I -H "Authorization: Bearer $ADMIN_TOK"  https://dev-api.doable.me/admin/users    | grep -i 'cache-control\|x-frame\|referrer\|pragma'
curl -sS -I                                         https://dev-api.doable.me/admin/users    | grep -i 'cache-control'
curl -sS -I -H "Authorization: Bearer $MEMBER_TOK"  https://dev-api.doable.me/admin/users    | grep -i 'cache-control'

# 002
curl -sS -I -H "Authorization: Bearer $ADMIN_TOK" "https://dev-api.doable.me/admin/projects/<uuid>" | grep -i 'cache-control'

# 004 — must NOT print cache-control: no-store
curl -sS -I -H "Authorization: Bearer $MEMBER_TOK"  https://dev-api.doable.me/workspaces | grep -i 'cache-control' || echo 'OK — no admin cache header on /workspaces'
```

## Expected after fix
All `/admin/*` responses (success, 401, 403) carry `Cache-Control: no-store, private`,
`X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Pragma: no-cache`.
Non-admin paths are unaffected.
