# BUG-WS-002 — Test-corpus path mismatch: /versions/:projectId/versions vs /projects/:projectId/versions

**Severity:** documentation / low (not a runtime defect)
**Filed by:** workspace-shard executor
**Date:** 2026-05-10
**Test:** TC-VERSIONS-LIST-001 against https://zantaz-api.doable.me

## Summary
Test corpus `testcases/18-versions/TC-VERSIONS-CRUD.md` documents endpoints under `/versions/:projectId/...`. Production zantaz API mounts the route under `/projects/:projectId/versions`. `/versions/:projectId/versions` returns 404.

## Repro
```
TOK=<qa-owner>
PRJ=<owned project id>
curl -i -H "Authorization: Bearer $TOK" \
  https://zantaz-api.doable.me/versions/$PRJ/versions
# HTTP 404 {"error":"Not Found","path":"/versions/<id>/versions"}

curl -i -H "Authorization: Bearer $TOK" \
  https://zantaz-api.doable.me/projects/$PRJ/versions
# HTTP 200 {"data":{...}}
```

## Resolution
Either:
1. Update `testcases/18-versions/TC-VERSIONS-CRUD.md` to reflect the actual mount point (`/projects/:projectId/versions`), or
2. Add a route alias under `/versions/:projectId/...` if the test corpus is the source of truth.

## Cross-user note
Verified that `/projects/:id/versions` for a project the caller does NOT own returns **404** (TC-VERSIONS-LIST-cross, qa-member token). Note 18-versions/TC-VERSIONS-LIST-011 flagged this as a "gap" — currently the API hides instead of leaking, which is acceptable but should be documented as 404 vs 403.
