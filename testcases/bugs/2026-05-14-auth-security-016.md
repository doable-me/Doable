# BUG-016: Content-Security-Policy allows unsafe-eval and unsafe-inline

**TC-ID:** TC-SEC-HEADERS-003  
**Severity:** medium  
**Date:** 2026-05-14  
**Environment:** dev (dev.doable.me)

## Steps to Reproduce

1. Navigate to https://dev.doable.me/login
2. Inspect response headers for `Content-Security-Policy`

## Expected

CSP should restrict script execution to known-safe sources without `unsafe-eval` or `unsafe-inline`:
```
content-security-policy: default-src 'self'; script-src 'self'; ...
```

## Actual

CSP header present but includes:
```
script-src 'self' 'unsafe-eval' 'unsafe-inline' ...
```

Both `unsafe-eval` (enables `eval()`, `new Function()`) and `unsafe-inline` (enables inline `<script>` tags and event handlers) are permitted.

## Impact

- `unsafe-eval` negates XSS protection: any XSS finding that can inject a string can call `eval()` to execute arbitrary code.
- `unsafe-inline` allows inline script injection without needing a separate script file.
- CSP is effectively neutered as an XSS mitigation layer.
- Monaco Editor (used in the app) requires `unsafe-eval` for its worker — this is a known tension, but the CSP scope should be narrowed to only the editor route.

## Fix Suggestion

- For non-editor routes (/login, /settings, /dashboard): enforce strict CSP without `unsafe-eval`.
- For editor route (/editor/*): apply `unsafe-eval` scoped to that path only via route-level CSP headers.
- Replace `unsafe-inline` with nonce-based or hash-based script allowlisting.
