# BUG-105: OAuth Tokens Exposed in URL Query Parameters

**Severity:** CRITICAL SECURITY
**Status:** Open
**Found:** 2026-04-09 (Code analysis)
**Component:** services/api/src/routes/auth.ts:304-305,341-342

## Summary

OAuth callback redirects pass access and refresh tokens as URL query parameters:
```
/auth/callback?accessToken=eyJ...&refreshToken=eyJ...
```

Tokens in URLs are logged in browser history, proxy logs, CDN logs, and Cloudflare access logs. The callback page never clears the URL from browser history.

## Root Cause

```ts
// auth.ts line 304-305
const params = new URLSearchParams({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
return c.redirect(`${FRONTEND_URL}/auth/callback?${params.toString()}`);
```

## Fix

Use a short-lived authorization code pattern, pass via URL fragment (`#`) instead of query params, or use `window.history.replaceState` to strip tokens immediately.
