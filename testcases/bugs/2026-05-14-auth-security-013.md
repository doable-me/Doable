# BUG-013: Auth endpoints return no Cache-Control header — responses may be cached by intermediaries

**TC-ID:** TC-AUTH-MISC-012  
**Severity:** low  
**Date:** 2026-05-14  
**Environment:** dev (dev-api.doable.me)

## Steps to Reproduce

1. POST /auth/login with valid credentials
2. Inspect response headers for Cache-Control, Pragma, Expires

## Expected

```
cache-control: no-store
pragma: no-cache
```

## Actual

No `Cache-Control` header is returned on /auth/login, /auth/refresh, or /auth/me responses.

## Impact

- Auth responses containing tokens or user data could be cached by proxies or CDN edge nodes if misconfigured.
- Cloudflare Tunnel (current setup) does not cache POST responses by default, so immediate risk is low.
- Best practice per RFC 6749 Section 5.1 mandates `Cache-Control: no-store` on token responses.

## Fix Suggestion

Add `Cache-Control: no-store` and `Pragma: no-cache` headers to all /auth/* responses, particularly /auth/login, /auth/refresh, and /auth/me.
