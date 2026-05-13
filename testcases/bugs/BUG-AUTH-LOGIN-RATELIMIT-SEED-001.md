# BUG-AUTH-LOGIN-RATELIMIT-SEED-001 — Bulk QA seeding hits 429 rate limit; backoff needed

**Severity:** low
**Status:** OPEN (workaround available)
**Target:** https://dev-api.doable.me/auth/login
**Found:** 2026-05-13 by Ralph R9 (QA account seeding)
**Workaround:** client-side backoff in seed script

## Summary
When `scripts/seed-qa-accounts.sh` attempts to log in multiple QA accounts in rapid succession (~5 accounts back-to-back), the login endpoint rate limiter blocks subsequent requests with `HTTP 429 Too Many Requests`. The first account (qa-owner) succeeds; subsequent accounts (qa-admin, qa-member, qa-viewer, qa-alice, qa-bob) all fail at the login stage. The rate limit appears to be per-IP per-minute and is too tight for bulk seeding from a single test runner.

## Reproduction
```bash
cd /root/doable  # or local dev
./scripts/seed-qa-accounts.sh
# Login attempt 1 (qa-owner): 200 OK
# Login attempt 2 (qa-admin): 429 Too Many Requests
# Login attempt 3 (qa-member): 429 Too Many Requests
# ...
```

## Expected
The seeding script should complete successfully, creating and logging in all 5 QA accounts within a few seconds. Alternatively, the rate limiter should have a bypass or exception for test runners / seed operations.

## Actual
```
qa-owner login: 200 ✓
qa-admin login: 429 Too Many Requests ✗
qa-member login: 429 Too Many Requests ✗
qa-viewer login: 429 Too Many Requests ✗
qa-alice login: 429 Too Many Requests ✗
qa-bob login: 429 Too Many Requests ✗

Seed script halts; QA accounts partially created (users exist, but logins not stored/verified).
```

## Root Cause (HYPOTHESIS)
The `/auth/login` endpoint uses a per-IP rate limiter (standard practice), likely with a threshold of **N requests per minute** where N is too small for bulk seeding (e.g., 3–5 per minute). When the seed script fires 5 login requests from the same IP within 10 seconds, requests 2–5 hit the limit.

**Suspected location:** `services/api/src/middleware/rateLimitMiddleware.ts` or `services/api/src/routes/auth.ts` with a config like:
```typescript
rateLimit({ windowMs: 60000, max: 3, keyGenerator: (req) => req.ip })
```

## Fix Proposal
Two options; **Option 1 preferred** (respects security intent):

**Option 1: Client-side backoff (recommended)**
- Update `scripts/seed-qa-accounts.sh` to insert a `sleep 12s` (or configurable `SEED_BACKOFF=12s` env var) between login attempts.
- This preserves the rate limit as a security feature while allowing legitimate seeding to proceed.
- Minimal code change; no server-side risk.

**Option 2: Server-side bypass (alternative)**
- Add a User-Agent check to the rate limiter: if User-Agent contains `doable-qa-seed/1.0`, skip the rate limit.
- Update seed script to set `User-Agent: doable-qa-seed/1.0`.
- Risk: less clean than backoff; requires server change and user-agent trust.

## Impact
- QA environment seeding is slow or manual on dev.
- Automated test runners that seed users will fail mid-stream.
- **Workaround:** already available (sleep between logins).
- **Severity:** low (not a blocker; human can retry or use backoff).

## Evidence
- `scripts/seed-qa-accounts.sh` output on dev 2026-05-13 showing 429 responses.
- Rate limiter configuration in codebase (needs investigation to confirm exact threshold).

## Recommended Next Step
Implement Option 1: add `SEED_BACKOFF=${SEED_BACKOFF:-12}` to seed script and `sleep $SEED_BACKOFF` between login attempts. Re-test and confirm all 5 accounts seed successfully.

## Filed by
Ralph R9 (QA seeding round)

## Filed date
2026-05-13
