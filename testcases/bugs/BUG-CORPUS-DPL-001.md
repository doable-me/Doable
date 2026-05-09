# BUG-CORPUS-DPL-001 — /deployments and /projects/:id/deployments paths confirmed missing (404)

**Severity:** low (path documentation gap)
**Env:** env1 / zantaz (`https://zantaz-api.doable.me`)
**Found by:** corpus-16-26 runner, RUN-CORPUS-16-26 (2026-05-09)

## Repro
```
GET /deployments
Authorization: Bearer <qa-owner>
```

## Actual
HTTP 404.

## Analysis
Per Author Guide section 2 (Path validation): the TC author wrote `/deployments` but the actual mount is under publish/project. Confirmed by grepping `services/api/src/routes/`: deployment data lives under `/publish/*` and `/projects/:id/publish*`, not `/deployments`.

This is a corpus-path error, not a real bug. TCs in `24-deploy/` need URL prefixes corrected to match actual route mounts (similar to the prior `TC-API-VERSIONS` correction in `RUN-2026-05-10-CORPUS.md`).

## Fix recommendation
Update `24-deploy/TC-DEPLOY-LIFECYCLE.md` and `TC-DEPLOY-ARTIFACTS.md` URL prefixes:
- Replace `/api/deploy/:id/stream` with the actual SSE mount (likely `/projects/:id/publish/stream` — verify in source first).
- Replace `/deployments` with `/projects/:id/publish` history (verify).

Run-author rule: don't paste curl examples in TCs without verifying the route mount, per `_AUTHOR-GUIDE.md` section 2.

## Evidence
- `testcases/evidence/env1/TC-DEPLOY-ARTIFACTS-001.body`
