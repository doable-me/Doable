# BUG-015: Access token not cleared from localStorage on logout

**TC-ID:** TC-AUTH-LOGOUT-005 / TC-SEC-STORAGE-002  
**Severity:** medium  
**Date:** 2026-05-14  
**Environment:** dev (dev.doable.me)

## Steps to Reproduce

1. Log in at https://dev.doable.me/login
2. Note `doable_access_token` value in localStorage
3. Click logout (via UI or call POST /auth/logout)
4. Inspect localStorage immediately after logout

## Expected

All auth-related localStorage keys cleared on logout:
- `doable_access_token` — removed
- `doable_refresh_token` — removed
- `doable_auth_user` — removed

## Actual

After logout:
- `doable_access_token` — **STILL PRESENT** in localStorage
- `doable_refresh_token` — removed
- `doable_auth_user` — removed

The access token remains in localStorage and remains valid on the API until its natural expiry (currently 4h per BUG-011).

## Impact

- On shared/public computers, the next user can extract the access token from localStorage after the previous user "logs out".
- Combined with BUG-011 (4h lifetime), the window is significant.
- Any browser extension or XSS can exfiltrate the token post-logout.

## Fix Suggestion

In the client-side logout handler, explicitly call `localStorage.removeItem('doable_access_token')` alongside the existing removal of refresh token and auth user. All three keys should be cleared atomically.
