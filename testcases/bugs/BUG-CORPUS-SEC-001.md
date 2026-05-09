# BUG-CORPUS-SEC-001 — Rate-limit bypass via client-supplied `X-Forwarded-For`

- **Severity:** high
- **Surface:** `POST /auth/forgot-password` (and likely all rate-limited routes)
- **Date:** 2026-05-10

## Repro

11 successive requests from the same machine, varying only `X-Forwarded-For: 1.2.3.<i>`:

```
for i in $(seq 1 11); do
  curl -sS -o /dev/null -w "%{http_code}\n" \
    -X POST -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 1.2.3.$i" \
    -d '{"email":"sweep'$i'@x.test"}' \
    https://zantaz-api.doable.me/auth/forgot-password
done
# all 11 → 200, none → 429
```

## Expected

The rate-limit key must NOT be derived from a client-controlled header. Behind Cloudflare Tunnel the inner-most XFF entry is attacker-controlled; the limiter should use the *outermost* trusted IP (the Cloudflare edge) or the connecting socket address, falling back to user id when authed.

A baseline (TC-SEC-RL-025) using NO XFF header showed 429 hit at the 4th same-IP request, confirming the limiter is functional — but trivially bypassable.

## Evidence

- TC-SEC-RL-001 row in CORPUS-11-13-14.md (200×11)
- TC-SEC-RL-025 row (429 by 4th when XFF not rotated)

## Remediation

`services/api/src/middleware/rate-limit.ts` should:
1. Use `c.req.raw.headers.get("cf-connecting-ip")` (set by Cloudflare) when present.
2. If trusting XFF, take the *first* entry in the chain ONLY when the connecting peer is in a trusted-proxy allowlist; otherwise use the socket address.
3. Add a per-account or per-email key for password-reset specifically so brute IP-rotation doesn't help an attacker enumerate.
