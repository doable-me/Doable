# BUG-R10-PROJECT-FILES-EMPTY-200-001 — GET /projects/:id/files returns 200 `{data:[]}` for non-existent projects

- **Severity**: P3 (soft info-leak; not a real RLS data leak)
- **Env**: dev (dev-api.doable.me)
- **Filed**: 2026-05-14 (Ralph R10)
- **Status**: OPEN
- **Discovered by**: scripts/r10-api-matrix.ts (RLS negative probe, qa-owner)

## Repro
```bash
TOKEN=<qa-owner JWT>
curl -H "Authorization: Bearer $TOKEN" \
  https://dev-api.doable.me/projects/22222222-2222-2222-2222-222222222222/files \
  -w "\nHTTP=%{http_code}\n"

# Actual:
HTTP/2 200
{"data":[]}
```

## Expected
- 404 Not Found (project doesn't exist)
- OR 403 Forbidden (project exists but caller has no access)
- The current 200-with-empty-list is technically the worst of both — leaks "this UUID slot is unused or you can't access it" via the success code

## Why this is low-priority
- No real data is exposed (empty list).
- An attacker probing project UUIDs gets the same 200-empty whether the project exists-but-empty or doesn't-exist — so they cannot distinguish.
- Many list endpoints choose the 200-empty-list pattern over 404 for ergonomic reasons (UI doesn't need a separate "no project" path).

## Recommended fix (out of R10 scope)
EITHER:
- Add an existence check: 404 if project row doesn't exist for caller's workspace.
- OR explicitly document this as 200-empty behavior in TC-API-EDITOR.md so harnesses stop flagging it.

## Related
- Workspace-level RLS appears intact: the empty list IS the correct RLS-filtered result for a non-member.
- This is the RLS implementation working as designed; the gap is the HTTP-level contract.
