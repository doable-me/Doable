# BUG-014: Tokens stored in localStorage — vulnerable to XSS exfiltration

**TC-ID:** TC-SEC-STORAGE-001  
**Severity:** medium  
**Date:** 2026-05-14  
**Environment:** dev (dev.doable.me)

## Steps to Reproduce

1. Log in at https://dev.doable.me/login
2. Open browser DevTools → Application → Local Storage → https://dev.doable.me
3. Observe stored keys

## Expected

Tokens should be stored in HttpOnly cookies (inaccessible to JavaScript) or at minimum in sessionStorage with short lifetime.

## Actual

```
localStorage keys present after login:
- doable_access_token  → full JWT access token
- doable_refresh_token → full JWT refresh token
- doable_auth_user     → JSON user object
```

Any XSS vulnerability anywhere on dev.doable.me would allow an attacker to exfiltrate both tokens via `localStorage.getItem('doable_access_token')`.

## Impact

- If XSS is found elsewhere in the app, full session takeover is possible.
- Access token lifetime is currently 4h (see BUG-011), extending the exfiltration window.
- Refresh token allows persistent session maintenance.

## Fix Suggestion

Migrate to HttpOnly, Secure, SameSite=Strict cookies for token storage. The API already supports cookie-less auth (Authorization header), but the web client would need to switch to cookie-based transport. Alternatively, keep in-memory only (not persisted to localStorage) and accept session loss on tab close.
