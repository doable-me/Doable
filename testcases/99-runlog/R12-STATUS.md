# R12 Bug Inventory — Retest Status Report

**Date**: 2026-05-15  
**Agent**: R12 QA retest (claude-sonnet-4-6)  
**Branch at test time**: `fix/cors-disallowed-origin-short-circuit`  
**Dev API**: https://dev-api.doable.me  
**Auth**: fresh registration `qa-r12-1778816909@doable.test` (TestPass123!)

---

## Summary

| Total | ZAPPED | DEPLOY-PENDING | STILL-OPEN | WONTFIX-DOCUMENTED | REGRESSED |
|-------|--------|----------------|------------|--------------------|-----------|
| 11    | 7      | 0              | 3          | 1                  | 0         |

**STILL-OPEN bugs needing code work: 3**  
**DEPLOY-PENDING: 0** (all fix branches merged to main and deployed on dev)  
**ZAPPED: 7**

---

## Bug Table

| bugId | severity | repro path | live HTTP result | classification | next action |
|-------|----------|------------|-----------------|----------------|-------------|
| BUG-R10-AUTH-LOGOUT-ANON-200-001 | P3 | `POST /auth/logout` (no token) | `200 {"message":"Logged out successfully"}` | WONTFIX-DOCUMENTED | Rationale stands — idempotent logout is intentional product decision. Update harness expected set to include 200. |
| BUG-R10-AUTH-PASSWORD-RESET-404-001 | P0 | `POST /auth/password-reset` anon | `200 {"message":"If an account with that email exists..."}` | ZAPPED | Fix `6e09ec5` merged to main and live on dev. No further action. |
| BUG-R10-AUTH-REGISTER-DUP-500-001 | P0 | `POST /auth/register` duplicate email | `409 {"error":"An account with this email already exists"}` | ZAPPED | Fix `80988c35` merged to main and live. No DB constraint name leaked. |
| BUG-R10-MFA-ENROLL-500-DOABLE-KEK-001 | P0 | `POST /auth/mfa/enroll/start` (authed) | `200 {secret, otpauthUrl, ...}` | ZAPPED | Fix `6e019a8` merged to main; DOABLE_KEK now set on dev. |
| BUG-R10-PROJECT-FILES-EMPTY-200-001 | P3 | `GET /projects/22222222-2222-.../files` (non-existent UUID) | `404 {"error":"Project not found"}` | ZAPPED | Dev now returns 404 for non-existent project UUIDs. Better than the 200+empty reported in R10. |
| BUG-R10-TRAILING-SLASH-AUTH-DROP-001 | P2 | `GET /templates/` (trailing slash, no -L) → raw redirect | `308` (no -L); `200` (with -L following) | STILL-OPEN | 308 redirect still issued. Auth header still drops on redirect in non-browser clients. Underlying Hono behavior unchanged. Workaround (drop trailing slash in clients) still required. |
| BUG-R11-DEPLOY-GAP-R10-FIXES-001 | P1 | All 4 previously undeployed fixes verified live | password-reset 200 ✓, MFA enroll 200 ✓, versions 400 (not 500) ✓, PDF fix deployed ✓ | ZAPPED | All branches now merged to main and live on dev. Deploy gap closed. |
| BUG-R11-PDF-ATTACHMENT-IGNORED-001 | P1 | `POST /projects/:id/chat` with PDF attachment | Not fully retested (full PDF probe requires 45s+ SSE stream + scaffolded project) | STILL-OPEN | Fix branch `fix/r11-pdf-attachment-prompt-and-persist` (commit `fecc8c1`) is merged to main per `git log`. Session_id + workspace_id persistence fix is deployed. However full end-to-end verification (AI generates app from PDF content) was not re-run in this round — requires dedicated 60s+ PDF probe. Mark as DEPLOY-PENDING-VERIFICATION pending that re-run. |
| BUG-R11-SEC-BAD-SIG-200 | NOT A BUG | `GET /auth/me` with random signature | `401 {"error":"Invalid token"}` | WONTFIX-DOCUMENTED | Confirmed closed/false-positive. Real tamper (random sig) correctly returns 401. base64url non-canonical padding explained in bug file. JWT verification is sound. |
| BUG-R11-SEC-RLS-PROJECT-FILES-200 | P2 | `GET /projects/1312ccfa-.../files` as cross-tenant user | `404 {"error":"Project not found"}` | ZAPPED | Cross-tenant project access now returns 404 (not 200+empty). Tenant isolation is enforced at route level. |
| BUG-R11-VERSIONS-EACCES-500-001 | P2 | `POST /projects/:id/versions` with `projectPath:"/"` | `400 {"error":"Project not scaffolded"}` | ZAPPED | Fix `6f5d70a` merged to main. Server-side path derivation prevents filesystem escape. `projectPath` from client is ignored. No EACCES, no `/boot/lost+found` leak. |

---

## Detailed Evidence

### ZAPPED bugs

**BUG-R10-AUTH-PASSWORD-RESET-404-001**
- Was: `401` anon / `404` authed
- Now: `200 {"message":"If an account with that email exists, a reset link has been sent."}` both anon and authed
- Fix commit: `6e09ec5` (branch `fix/password-reset-public-access`, merged to main `4f36528d`)

**BUG-R10-AUTH-REGISTER-DUP-500-001**
- Was: `500 {"error":"Internal Server Error","message":"duplicate key value violates unique constraint \"users_email_key\""}`
- Now: `409 {"error":"An account with this email already exists"}`
- Fix commit: `80988c35` (merged to main directly)

**BUG-R10-MFA-ENROLL-500-DOABLE-KEK-001**
- Was: `500 {"error":"Internal Server Error","message":"[envelope-crypto] DOABLE_KEK is not set..."}`
- Now: `200 {secret, otpauthUrl, issuer, accountName}`
- Fix commit: `6e019a8` (branch `fix/setup-server-doable-kek`, merged to main `c8ffd1aa`)

**BUG-R10-PROJECT-FILES-EMPTY-200-001**
- Was: `200 {"data":[]}`
- Now: `404 {"error":"Project not found"}` for non-existent UUIDs
- No dedicated fix branch found; likely addressed as part of RLS/route hardening in current branch

**BUG-R11-DEPLOY-GAP-R10-FIXES-001**
- Was: 4 fixes shipped on origin but not deployed to dev
- Now: All 4 verified live (password-reset 200, MFA enroll 200, versions 400-not-500, PDF fix deployed)

**BUG-R11-SEC-RLS-PROJECT-FILES-200**
- Was: `200 {"data":[]}` for cross-tenant project UUID
- Now: `404 {"error":"Project not found"}`
- Tenant isolation enforced

**BUG-R11-VERSIONS-EACCES-500-001**
- Was: `500 {"error":"Failed to create version","message":"EACCES: permission denied, scandir '/boot/lost+found'"}`
- Now: `400 {"error":"Project not scaffolded"}` — server derives projectPath, client-supplied `/` is ignored
- Fix commit: `6f5d70a0` (branch `fix/r11-versions-projectpath-server-derived`, merged to main `ea76d024`)

### STILL-OPEN bugs requiring code work

**BUG-R10-TRAILING-SLASH-AUTH-DROP-001** (P2)
- Status: Unchanged. `GET /templates/` still returns `308`. Authorization header still dropped on redirect in curl/Node fetch without explicit redirect-with-auth handling.
- No fix branch exists for the underlying Hono trailing-slash behavior.
- Recommended action: Add Hono middleware to canonicalize trailing slashes internally (no 308 round-trip), or document the behavior as a known API contract limitation in API.md.

**BUG-R11-PDF-ATTACHMENT-IGNORED-001** (P1)
- Code fix `fecc8c1` (session_id + workspace_id persistence, treat docs as build brief) is merged to main and deployed.
- Full end-to-end verification NOT run in this round: requires ~60s SSE stream with a large PDF, scaffolded project, and inspection of generated App.tsx for PDF-derived content.
- The original failure symptoms (response_chars=0, empty chat history, session_id="") may be resolved by the deployed fix, but cannot be classified ZAPPED without running the full PDF probe.
- Recommended action: Run `scripts/r11-pdf-attach-test.ts` against dev and confirm `pdf_text_detected_in_prompt: true` AND App.tsx contains SRS-derived content.

**BUG-R11-SEC-BAD-SIG-200** is WONTFIX-DOCUMENTED (not a code defect).

### WONTFIX-DOCUMENTED

**BUG-R10-AUTH-LOGOUT-ANON-200-001** (P3)
- Rationale verified: logout without auth returning 200 is intentional idempotent behavior. No data leaked. Breaking SDKs that clean up expired sessions is not desirable.
- Action: Update test harness expectation to accept 200 for anon `POST /auth/logout`.

**BUG-R11-SEC-BAD-SIG-200** (NOT A BUG)
- Confirmed: tampered JWT (random signature) returns `401 {"error":"Invalid token"}`.
- The original report was a base64url non-canonical padding false positive — last-char flip `E→F` produces identical decoded bytes.
- No action needed.

---

## Branch/Merge State at Test Time

| Fix branch | Merged to main | Deployed on dev |
|-----------|----------------|-----------------|
| `fix/password-reset-public-access` | YES (`4f36528d`) | YES (200 verified) |
| `fix/register-duplicate-email-409` | YES (`80988c35`) | YES (409 verified) |
| `fix/setup-server-doable-kek` | YES (`c8ffd1aa`) | YES (MFA 200 verified) |
| `fix/r11-versions-projectpath-server-derived` | YES (`ea76d024`) | YES (400 not 500 verified) |
| `fix/r11-pdf-attachment-prompt-and-persist` | YES (`852beea7`) | YES (code deployed; E2E not re-run) |
| `fix/cors-disallowed-origin-short-circuit` | NO (current branch, 1 commit ahead of main) | Pending merge |

---

## Cleanup

- No tmux sessions created (all probes via direct curl from Bash tool)
- Fresh test user `qa-r12-1778816909@doable.test` and project `a3ec1927-3686-4cc3-9526-ccd01c9767fc` left on dev (benign, no sensitive data)
- No production systems touched
