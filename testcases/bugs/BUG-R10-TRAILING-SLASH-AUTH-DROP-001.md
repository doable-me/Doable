# BUG-R10-TRAILING-SLASH-AUTH-DROP-001 — Trailing-slash 308 redirect drops Authorization header

- **Severity**: P2 (footgun for API consumers, not a security hole)
- **Env**: dev (dev-api.doable.me)
- **Filed**: 2026-05-14 (Ralph R10)
- **Status**: OPEN (matrix updated to use no-trailing-slash path; underlying redirect behavior unchanged)
- **Discovered by**: scripts/r10-api-matrix.ts (templates route, qa-owner role)

## Repro
```bash
TOKEN=<valid qa-owner JWT>

# Without slash → 200 with templates list
curl -H "Authorization: Bearer $TOKEN" https://dev-api.doable.me/templates -w "\nHTTP=%{http_code}\n"
# HTTP=200

# With trailing slash → 308 redirect
curl -H "Authorization: Bearer $TOKEN" https://dev-api.doable.me/templates/ -w "\nHTTP=%{http_code}\n"
# HTTP=308

# Node fetch follows the 308 by default but Cloudflare Tunnel / the 308 location
# loses the Authorization header along the way → the followed request returns 401.
```

## Why this matters
- A naive client using `fetch('/templates/')` (trailing slash) with a bearer token will see 401 on Node 18+ — confusing for SDK authors who don't know slashes are normalized.
- Some API clients DO preserve auth across same-origin redirects (browsers usually do), so behavior is inconsistent across runtimes.

## Recommended fix (out of R10 scope)
EITHER:
- Make Hono / Cloudflare Tunnel canonicalize internally instead of issuing 308 (skip the round-trip).
- OR have the auth middleware run AFTER trailing-slash canonicalization so the followed request hits the same handler with auth intact.
- Document the convention in API.md so SDK authors know to drop trailing slashes.

## R10 mitigation (already applied)
- scripts/r10-api-matrix.ts: changed `/templates/` → `/templates` (no slash) and noted the gotcha in a comment.

## Related
- This is the same shape as countless old REST API footguns. Cf. https://www.rfc-editor.org/rfc/rfc7231#section-7.4.1 (some redirects strip headers, especially with HTTP/2 push).
