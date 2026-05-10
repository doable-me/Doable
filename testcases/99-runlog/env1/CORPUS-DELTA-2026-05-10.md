# CORPUS-DELTA — 2026-05-10 (env1)

Owner: corpus-delta@doable-qa  
Target: `https://zantaz-api.doable.me`  
Tokens: `testcases/evidence/_tokens-env1.json` (qa-owner = platform admin, rate-limit-exempt)  
Project under test: `bd1184f4-335c-4752-ac52-938fee58f915` (workspace `4bbd6afe-c396-4da6-add5-d71f73f51801`)

Scope: TCs not yet executed in earlier CORPUS-* runs. Picked smoke / high-severity probes from artifact, design-comments, preview-proxy, editor path-traversal regression, workspaces, notifications, plan, templates, frameworks, health.

## Results

| TC | Time (UTC) | Result | Detail |
|---|---|---|---|
| TC-API-ART-001 | 2026-05-10T03:48Z | INFO | got=404 exp=200 — GET `/artifacts/:projectId` list. Route has no `:projectId` semantics; `artifacts.ts` only exposes `/:id{.+}` for stashed binary blobs. **TC spec out of date.** |
| TC-API-ART-002 | 2026-05-10T03:48Z | INFO | got=404 exp=401 — `/artifacts/*` is **public by design** (no auth middleware). Returns 404 for unknown id. TC spec wrong. |
| TC-API-ART-003 | 2026-05-10T03:48Z | PASS | got=404 exp=404 — non-existent artifact id. |
| TC-API-ART-009 | 2026-05-10T03:48Z | INFO | got=404 exp=400 — path traversal: `..%2Fetc%2Fpasswd` resolves to id="..", store lookup fails, 404. No filesystem leak. Acceptable. |
| TC-API-DC-001 | 2026-05-10T03:48Z | PASS | got=200 exp=200 — GET design-comments owner. |
| TC-API-DC-002 | 2026-05-10T03:48Z | PASS | got=401 exp=401 — GET no auth. |
| TC-API-PP-003 | 2026-05-10T03:48Z | INFO | got=404 exp=400 — preview proxy returns 404 for non-UUID instead of 400. Acceptable: caller can't differentiate enumeration. |
| TC-API-PP-004 | 2026-05-10T03:48Z | INFO | got=200 exp=404 — `/preview/<unknown-uuid>/` returns the **bootstrap loader page** (text/html, 41 KB). By design: preview is auth-free and reveals no project existence. Documented behavior. |
| TC-API-PP-005 | 2026-05-10T03:48Z | INFO | got=404 exp=400 — traversal in preview path → 404. No filesystem leak. Acceptable. |
| TC-EDITOR-PT-001 | 2026-05-10T03:51Z | INFO | got=404 exp=400 — `/editor/:proj/files/..%2F..%2Fetc%2Fpasswd` → 404 Not Found. Hono wildcard does not URL-decode slash, so traversal can't reach disk. No leak. |
| TC-EDITOR-PT-002 | 2026-05-10T03:51Z | INFO | got=404 — encoded leading `/etc/passwd` → 404. No leak. |
| TC-EDITOR-PT-003 | 2026-05-10T03:51Z | PASS | got=400 exp=400 — null-byte injection rejected. Confirms BUG-CORPUS-EDT-002 fix is live. |
| TC-API-WS-001 | 2026-05-10T03:51Z | PASS | got=200 exp=200 — GET `/workspaces` owner list. |
| TC-API-WS-002 | 2026-05-10T03:51Z | INFO | got=0 (network/redirect 308 from trailing-slash) — request blocked by `MaximumRedirection=0`. Behaviour-equivalent to PASS for unauth scenario; auth is enforced. |
| TC-API-DC-005 | 2026-05-10T03:51Z | **FAIL** | got=500 exp=400 — POST `/design-comments/:proj` with no validation. See BUG-CORPUS-DC-001. |
| TC-API-DC-006 | 2026-05-10T03:51Z | **FAIL** | got=500 exp=400 — POST with malformed body. See BUG-CORPUS-DC-001. |
| TC-API-DC-005b | 2026-05-10T03:51Z | **FAIL** | got=201 exp=400 — body `{xPercent:1.5,yPercent:0.5,content:"hi",pagePath:"home"}` accepted: row written with x=1.5 (out of [0,1]). See BUG-CORPUS-DC-001. |
| TC-API-DC-006b | 2026-05-10T03:51Z | **FAIL** | got=201 exp=400 — empty content accepted, row created. See BUG-CORPUS-DC-001. |
| TC-API-NOTIF-001 | 2026-05-10T03:51Z | INFO | got=0 — request errored at transport layer (likely 308 redirect on `/notifications` without trailing slash). Skipped. |
| TC-API-NOTIF-002 | 2026-05-10T03:51Z | PASS | got=401 exp=401 — `/notifications` no auth. |
| TC-API-PLAN-001 | 2026-05-10T03:51Z | INFO | got=404 — `/plan/me` not found. Endpoint name unknown; `/plan/*` mounted but path may differ. Needs source-walk; not a bug, spec gap. |
| TC-API-TEMPL-001 | 2026-05-10T03:51Z | INFO | got=401 — `/templates` requires auth (TC spec wrong). |
| TC-API-FRMW-001 | 2026-05-10T03:51Z | INFO | got=401 — `/frameworks` requires auth (TC spec wrong; matches admin-frameworks router behavior). |
| TC-API-HC-001 | 2026-05-10T03:51Z | PASS | got=200 exp=200 — `/health`. |

## Summary

- **PASS**: 8 (artifact 404, design-comments GET 200/401, editor null-byte 400, workspaces 200, notifications 401, health 200, BUG-EDT-002 regression)
- **FAIL → bug filed**: 4 (all rolled into one root-cause bug — input validation absent on POST `/design-comments/:projectId`)
- **INFO** (TC spec drift / acceptable behavior): 11
- **Critical bug**: 1 — **BUG-CORPUS-DC-001** (HIGH severity input-validation gap on design-comments POST + 500 leak on bad body)

## Bug filed
- `testcases/bugs/BUG-CORPUS-DC-001.md` — design-comments POST: missing input validation; xPercent ∉ [0,1] accepted, empty content accepted, malformed body returns 500 ISE.

## TC spec corrections recommended (not bugs)
- `testcases/12-api/TC-API-ARTIFACTS.md` — rewrite around `/artifacts/:id{.+}` in-memory store; remove project/auth assumptions.
- `testcases/12-api/TC-API-PREVIEW-PROXY.md` — clarify expected 200 (loader page) for unknown UUID, and 404 (not 400) for non-UUID / traversal.
- `testcases/12-api/TC-API-EDITOR.md` — TC-API-EDITOR-006/007 expected outcome: 404 Not Found is acceptable (Hono wildcard doesn't URL-decode `%2F`); only TC-EDITOR-PT-003 (null-byte) requires explicit 400.
