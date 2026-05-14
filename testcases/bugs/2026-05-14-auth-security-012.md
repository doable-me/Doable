# BUG-012: CORS — access-control-allow-credentials: true returned for non-allowed origins

**TC-ID:** TC-SEC-CORS-001 / TC-AUTH-MISC-007  
**Severity:** medium  
**Date:** 2026-05-14  
**Environment:** dev (dev-api.doable.me)

## Steps to Reproduce

1. Send OPTIONS preflight to any /auth/* endpoint with `Origin: https://evil.example` and `Access-Control-Request-Method: POST`
2. Inspect response headers

## Expected

For disallowed origins:
- No `access-control-allow-origin` header (or `null`)
- No `access-control-allow-credentials` header

## Actual

```
HTTP/2 200
access-control-allow-credentials: true
(no access-control-allow-origin header for evil.example)
```

`access-control-allow-credentials: true` is returned unconditionally even when the origin is not in the allow-list and `access-control-allow-origin` is absent.

## Impact

- Browsers will not complete the cross-origin request (ACAO is absent), so real CSRF is not possible via XHR/fetch from evil origins.
- However, the unconditional `credentials: true` header is misleading and could confuse security scanners. It also violates the principle of minimal disclosure.
- If a future code change accidentally adds a wildcard ACAO, the credentials flag would immediately create a critical vulnerability.

## Fix Suggestion

Only emit `access-control-allow-credentials: true` when the request origin is in the allow-list and `access-control-allow-origin` is being set to that specific origin.
