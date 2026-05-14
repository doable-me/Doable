# BUG-018: Rate-limited responses (429) do not include Retry-After header

**TC-ID:** TC-AUTH-RATE-LIMIT-012 / TC-SEC-RATELIMIT-008  
**Severity:** low  
**Date:** 2026-05-14  
**Environment:** dev (dev-api.doable.me)

## Steps to Reproduce

1. Exceed login rate limit (10 requests in 15 min) to trigger 429
2. Inspect 429 response headers

## Expected

```
HTTP/2 429
retry-after: 900
x-ratelimit-limit: 10
x-ratelimit-remaining: 0
x-ratelimit-reset: <epoch>
```

## Actual

```
HTTP/2 429
content-type: application/json

{"error":"Too many requests, please try again later"}
```

No `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, or `X-RateLimit-Reset` headers are present.

## Impact

- Clients (mobile apps, SDK integrations) cannot implement proper backoff — they must guess when to retry.
- Automated clients will hammer the endpoint repeatedly until the window resets, wasting resources.
- RFC 6585 Section 4 recommends including `Retry-After` with 429 responses.

## Fix Suggestion

In the rate limiter middleware (services/api/src/middleware/rate-limit.ts), add `Retry-After` header to the 429 response with the number of seconds until the window resets. Also add standard `X-RateLimit-*` headers for observability.
