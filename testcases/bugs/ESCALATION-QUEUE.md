# Escalation Queue — 2026-05-14

## Verifier Session Summary

**Session date:** 2026-05-14
**Verifier:** oh-my-claudecode:verifier agent
**Target:** https://dev-api.doable.me
**Tokens used:** owner-pro@doable.me (pre-generated 4h JWT)

---

## Bugs Verified This Session

| Bug ID | Title | Result | Evidence |
|--------|-------|--------|----------|
| BUG-WS-001 | Malformed UUID on /workspaces/:id returns 500 | CANNOT-REPRODUCE (already 400) | `curl .../workspaces/not-a-uuid` → `HTTP 400 {"error":"Invalid workspace id"}` |
| BUG-WS-002 | Test-corpus path mismatch /versions/:id/versions vs /projects/:id/versions | CONFIRMED (doc bug) | `/versions/$PRJ/versions` → 404; `/projects/$PRJ/versions` → 200 |
| BUG-WS-003 | GET /projects/shared returns 502 | SKIPPED — Opus fixing (API crash risk) | N/A |

---

## Escalated Bugs (Require Action)

### BUG-WS-002 — Test corpus path mismatch (doc fix needed)
**Severity:** low (documentation only, no runtime defect)
**Action required:** Update `testcases/18-versions/TC-VERSIONS-CRUD.md` to replace all references to `/versions/:projectId/versions` with `/projects/:projectId/versions`.
**Evidence:** Independently confirmed 2026-05-14 17:53 UTC with project `a9bcb1a9-20ea-4ad5-a4e3-1ed9662284ac` (owner-pro token).

---

## Cannot-Reproduce (Fixed or Never Present)

### BUG-WS-001 — Malformed UUID returns 500
The route `/workspaces/:id` now validates the UUID at the route boundary and returns `HTTP 400 {"error":"Invalid workspace id"}` for non-UUID values. Already fixed on dev as of 2026-05-14. Close this bug.

---

## Previously Verified Fixes (from prior session)

| Bug ID | Fix | Status |
|--------|-----|--------|
| BUG-001 | `/settings/ai` redirect | CONFIRMED FIXED |
| BUG-002 | `/settings/usage` redirect | CONFIRMED FIXED |
| BUG-003/008 | `/settings/billing` redirect | CONFIRMED FIXED |
| BUG-004 | `/help` index page | CONFIRMED FIXED |
| BUG-005 | favicon 404 eliminated | CONFIRMED FIXED |
| BUG-006/007/010 | Settings button validation + theme checkmark | PARTIAL (code-only) |
| BUG-009 | Usage page empty-state copy | PARTIAL (code-only) |
