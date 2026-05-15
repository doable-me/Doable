# R13 Matrix Delta Report

**Date**: 2026-05-15  
**Agent**: R13 matrix-retest (qa-tester / claude-sonnet-4-6)  
**Branch**: `fix/cors-disallowed-origin-short-circuit` (HEAD 699ce22f)  
**Dev API**: https://dev-api.doable.me  
**Test user**: `qa-r13-matrix-1778818770@doable.test` / `TestPass123!`  
**User ID**: `2fa24a4c-bda1-4030-a812-3ec24b24e93c`  
**Baseline**: R12-FINAL-REGRESSION.md (22/23 PASS, 0 P0/P1 open)

---

## Matrix Run Summary

| Metric | Value |
|--------|-------|
| Total assertions | 1194 |
| PASS | 440 |
| EXPECTED-401 | 276 |
| EXPECTED-403 | 115 |
| EXPECTED-400 | 243 |
| EXPECTED-404 | 105 |
| EXPECTED-405 | 0 |
| EXPECTED-429 | 0 |
| UNEXPECTED-STATUS | 13 |
| SERVER-5XX | 2 |
| NETWORK-FAIL | 0 |
| SKIPPED-NO-TOKEN | 0 |
| **Raw failures** | **15** |
| Duration | 57.6s |
| Concurrency | 6 |

---

## Trailing-Slash Assertions (PR #35 Regression)

The matrix harness does not include trailing-slash routes in ROUTES catalog
(by design — see comment in harness re BUG-R10-TRAILING-SLASH-AUTH-DROP).
Direct live probes performed instead:

| Path | Auth | Status | Result |
|------|------|--------|--------|
| GET /templates/ | qa-owner | 200 | PASS |
| GET /workspaces/ | qa-owner | 200 | PASS |
| GET /projects/ | qa-owner | 200 | PASS |

**Trailing-slash pass-rate: 3/3 — CONFIRMED LIVE**

---

## Rate-Limit Kill Switch

- Total 429 responses across 1194 assertions: **0**
- EXPECTED-429 classifications: **0**
- **Rate-limit kill switch: CONFIRMED OFF on dev**

---

## Failure Classification

### Distinct failure roots (15 raw assertions → 3 unique roots)

#### Root A — GET /admin/tools → 404 (7 assertions)
- **Classification**: P3 — harness expectation stale
- **Actual route**: `/admin/tools/modes` (GET returns 200 with tool catalog)
- **Bare `/admin/tools`**: intentionally returns 404 — no index handler registered
- **adminToolsRoutes** mounts handlers at `/tools/modes`, `/tools/modes/:mode` only
- **Verdict**: harness expectation `[200, 403]` should be `[404]` or route should be updated to `/admin/tools/modes`
- **Impact**: none — route works correctly at correct path

#### Root B — POST /auth/mfa/enroll/start with bad/junk/empty payloads → 200 (5 assertions)
- **Classification**: P3 — harness expectation wrong
- **Actual behaviour**: `/auth/mfa/enroll/start` takes no request body by design. It
  is a pure auth-gated action that generates a new TOTP secret. Any body sent is
  silently ignored. Returning 200 + `{secret, otpauthUrl}` is correct regardless
  of what body is sent.
- **Harness expected**: `[400, 401, 415, 422]` for empty/invalid/junk payloads
- **Verdict**: false positive — endpoint is correctly idempotent to request body.
  Harness should add `200` to `expect` for negative-payload probes on this route,
  or mark it `validBody: undefined` with a comment.
- **Impact**: none — MFA enroll works correctly

#### Root C — POST /workspaces as qa-member → 500 (2 assertions)
- **Classification**: P2 — real bug, unhandled unique constraint
- **See**: `testcases/bugs/BUG-R13-WORKSPACE-SLUG-500.md`
- **Repro**: two POST /workspaces requests with identical slug → second returns 500
  instead of 409. Confirmed live with sequential same-slug requests.
- **Root cause**: workspace creation handler does not catch PostgreSQL error code
  `23505` (unique_violation on `workspaces_slug_key`).
- **Impact**: P2 — user sees opaque 500 on slug collision instead of actionable 409

#### Root D — DELETE /admin/email/config → 200 (1 assertion)
- **Classification**: P3 — harness wrong-verb probe fired against a real DELETE route
- **Actual behaviour**: `DELETE /admin/email/config` is a legitimate registered
  handler (deactivates DB email config, falls back to env vars). Returns 200 `{"success":true}`.
- **Harness classified it** as "wrong-verb" probe expecting `[400,401,403,404,405,415,422]`
  because only `GET /admin/email/config` is in the ROUTES catalog.
- **Verdict**: false positive — harness should add DELETE to the catalog for this route
- **Impact**: none — admin email config DELETE works correctly; it did deactivate the
  email config on dev (benign, no config was active: `GET /admin/email/config → {"data":null}`)

---

## New Bugs Filed

| Bug ID | Severity | Route | Description |
|--------|----------|-------|-------------|
| BUG-R13-WORKSPACE-SLUG-500 | P2 | POST /workspaces | Duplicate slug returns 500 instead of 409 |

**New P0 bugs**: 0  
**New P1 bugs**: 0  
**New P2 bugs**: 1  
**New P3 carry-overs**: 3 (harness expectation gaps)

---

## P3 Carry-Over Items (Harness Fixes Needed)

| Item | Fix Required |
|------|-------------|
| GET /admin/tools → expect [404] | Route is /admin/tools/modes — update ROUTES catalog path |
| POST /auth/mfa/enroll/start negative payloads → expect [200,...] | Endpoint ignores body by design — add 200 to expect for all payload classes |
| DELETE /admin/email/config in ROUTES | Add as legitimate DELETE route to catalog |

---

## Regression vs R12 Baseline

| Category | R12 | R13 | Delta |
|----------|-----|-----|-------|
| P0 open | 0 | 0 | 0 |
| P1 open | 0 | 0 | 0 |
| P2 open | 0 | 1 | +1 (BUG-R13-WORKSPACE-SLUG-500) |
| Trailing-slash 200 | PASS | PASS | no regression |
| Rate-limit OFF | PASS | PASS | no regression |
| Security headers | 8/9 | 8/9 | no regression |
| CORS evil-origin blocked | PASS | (not re-run, no regression evidence) | — |

**No P0/P1 regressions introduced by R12 deploy.**  
**One new P2 (slug-collision 500) — pre-existing code gap, not introduced by R12.**

---

## Security Posture

- CORS evil-origin: not re-triggered in this run (matrix does not include CORS probes)
- JWT fake token: matrix EXPECTED-401 count 276 — all anon assertions on auth-gated
  routes returned 401 as expected, no auth bypass observed
- RLS cross-tenant: 12 rls-group assertions all returned EXPECTED-404/403/400
- No 200 on any anon probe of auth-gated route

---

## Summary

- **Total assertions run**: 1194
- **Raw failures**: 15
- **Distinct failure roots**: 4 (3 P3 harness gaps + 1 P2 real bug)
- **New P0/P1 bugs**: 0
- **New P2 bugs**: 1 — BUG-R13-WORKSPACE-SLUG-500
- **New P3 carry-overs**: 3 harness expectation gaps
- **Trailing-slash pass-rate**: 3/3 PASS
- **Rate-limit 429 count**: 0 (kill switch confirmed)
- **Regressions vs R12 baseline**: 0

## Cleanup

- tmux session: none created (matrix run via PowerShell directly)
- Test user `qa-r13-matrix-1778818770@doable.test` left on dev (benign)
- Duplicate-slug test workspace created on dev (benign, slug `r13-dup-slug-test`)
- No production systems touched
