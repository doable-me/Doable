# BUG-R11-SEC-RLS-PROJECT-FILES-200 — Cross-tenant project /files returns 200 instead of 404

- **Severity**: P2 (high — tenant isolation leak)
- **Env**: dev (dev-api.doable.me)
- **Filed**: 2026-05-14 (R11 security smoke)
- **Status**: FIXED + R12 verified (2026-05-15) — cross-tenant project access returns 404; tenant isolation confirmed via live probe (tenant2 project `3779f840` returns 404 to tenant1 JWT)
- **Discovered by**: R11 Probe #6

## Repro
```bash
# Project 1312ccfa owned by qa-owner@doable.test; authenticated as uniquegodwin@gmail.com
curl -i -H "Authorization: Bearer <uniquegodwin-token>" \
  https://dev-api.doable.me/projects/1312ccfa-eef8-4ca7-9bfa-1befa0c27f9f/files
# → HTTP/1.1 200 OK
# → {"data":[]}
```

## Expected
`404 Not Found` — the caller has no membership in this project so its existence should not be confirmed. A 403 is also acceptable per some threat models but 404 is preferred to avoid leaking existence.

## Actual
`200 OK` with `{"data":[]}` — the route accepts the request, confirms the project exists, and returns an empty file list. This leaks project existence and membership state to arbitrary authenticated users.

## Impact
Any authenticated user can enumerate other tenants' projects by UUID and confirm their existence. If the project ever has files, the files list may be returned depending on the RLS implementation gap. At minimum this confirms project IDs across tenant boundaries.

## Root cause hypothesis
The `/projects/:id/files` route likely queries files filtered by project ID but does not first verify that the calling user is a member of that project. RLS policy on the `files` table may return empty-set (not error) when the user has no row-level access, resulting in a 200 with empty array instead of a 404.

## Recommendation
1. In the route handler for `GET /projects/:id/files`, add a membership check before querying files: verify the caller is a member/owner of project `:id`; if not, return 404.
2. Alternatively, enforce via RLS: a query to `projects` that returns no rows (because RLS filters them out) should be turned into a 404 at the route level.
3. Add a regression test: user A accessing user B's project `/files` → 404.
