# TC-SEC-XFF-BYPASS — Rate-limit bypass via X-Forwarded-For rotation (regression for BUG-CORPUS-SEC-001)

**Source:** `services/api/src/middleware/rate-limit.ts` — `getTrustedClientIp()`
**Bug:** `testcases/bugs/BUG-CORPUS-SEC-001.md`
**Date authored:** 2026-05-10
**Severity:** high

The rate limiter must NOT key on client-supplied headers. After the fix it
prefers `cf-connecting-ip` (Cloudflare Tunnel sets this), then `x-real-ip`,
then the connecting socket address. Raw `x-forwarded-for` is no longer
trusted — rotating it in the client cannot evade the limiter.

## Pre-requisites

- API server running locally OR a deployed env that's NOT behind Cloudflare
  (so we can hit `:4000` directly and observe socket-IP behaviour).
- For the env1 (zantaz) repro path, hit `https://zantaz-api.doable.me/...`.
- `RATE_LIMIT_MAX` is enforced for `/auth/*` regardless of the global toggle
  (per-route limiters in `routes/auth/helpers.ts`).

## TC-SEC-XFF-BYPASS-001 — Rotated XFF must NOT bypass forgot-password limiter

**Steps:**

```bash
for i in $(seq 1 11); do
  curl -sS -o /dev/null -w "%{http_code}\n" \
    -X POST -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 1.2.3.$i" \
    -d '{"email":"sweep'$i'@x.test"}' \
    https://zantaz-api.doable.me/auth/forgot-password
done
```

**Expected (post-fix):**
- Limit on `forgotPasswordRateLimiter` is `max=3` per hour.
- Requests 1-3 → 200, requests 4-11 → 429.
- The XFF header is ignored for keying; the limiter buckets all 11 under
  the SAME trusted source (cf-connecting-ip if behind Tunnel, else socket
  address).

**Pre-fix evidence:** all 11 returned 200 (TC-SEC-RL-001 in
`testcases/99-runlog/env1/CORPUS-11-13-14.md`).

**Severity:** high

## TC-SEC-XFF-BYPASS-002 — Rotated X-Forwarded-For must NOT bypass login limiter

```bash
for i in $(seq 1 12); do
  curl -sS -o /dev/null -w "%{http_code}\n" \
    -X POST -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 9.9.9.$i" \
    -d '{"email":"x'$i'@x.test","password":"wrong"}' \
    https://zantaz-api.doable.me/auth/login
done
```

**Expected:** With `loginRateLimiter` at max=10 per 15 min, requests
1-10 → 401, 11-12 → 429. XFF rotation has no effect.

## TC-SEC-XFF-BYPASS-003 — Multi-value XFF chain must NOT bypass

```bash
curl -X POST -H "X-Forwarded-For: 1.1.1.1, 2.2.2.2, 3.3.3.3" \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.test"}' \
  https://zantaz-api.doable.me/auth/forgot-password
```

**Expected:** XFF entirely ignored; counter increments under
cf-connecting-ip (or socket address), not any value parsed from XFF.

## TC-SEC-XFF-BYPASS-004 — `cf-connecting-ip` is the trusted source behind Tunnel

When Cloudflare Tunnel is the path, `cf-connecting-ip` is set to the real
client IP and overwrites whatever the client sent in XFF. The limiter
must use this value.

**Steps:** Two separate machines (A, B) each hit `/auth/forgot-password`
3× over a short window, with no XFF set.

**Expected:** Each of A's 4th and B's 4th requests → 429 independently.
A's traffic does not consume B's quota.

## TC-SEC-XFF-BYPASS-005 — Spoofed `cf-connecting-ip` from outside Tunnel

If the API is exposed via Cloudflare Tunnel, an attacker cannot reach the
process directly (Tunnel terminates at 127.0.0.1). For non-Tunnel envs,
the operator should not honour `cf-connecting-ip` from the public
internet. This TC documents the deployment requirement; the implementation
already prefers `cf-connecting-ip` only because all production traffic
flows through Tunnel.

**Severity:** medium (operator/deployment guidance)

## Retest commands

```
pnpm --filter @doable/api type-check
# then re-run TC-SEC-XFF-BYPASS-001 against env1
```

## Notes

- A per-account/per-email key for `/auth/forgot-password` (so an attacker
  rotating IPs across a botnet still can't sweep emails) is a follow-up
  hardening — out of scope for this fix.
- See also `TC-SEC-RATELIMIT.md` for the broader corpus.
