# BUG-104: XSS via displayName — Script Tags Stored Unsanitized

**Severity:** HIGH SECURITY
**Status:** FIXED (2026-04-09)
**Found:** 2026-04-09 (E2E API testing)
**Component:** services/api/src/routes/auth.ts (register endpoint)

## Summary

The registration endpoint accepts `<script>alert(1)</script>` as a valid displayName and stores it in the database. If rendered without escaping in the frontend (e.g., in collaborator presence, workspace members list, team chat), this executes arbitrary JavaScript.

## Repro Steps

1. Register with `displayName: "<script>alert(1)</script>"`
2. Registration succeeds, displayName stored as-is
3. Any page rendering this user's name could execute the script

## Evidence

```json
POST /auth/register: {"email":"xss_test@test.com","password":"TestPass123!","displayName":"<script>alert(1)</script>"}
Response: {"user":{"displayName":"<script>alert(1)</script>",...}}
```

## Fix

Sanitize displayName on input (strip HTML tags) or ensure all rendering uses proper escaping. React's JSX auto-escapes by default, but `dangerouslySetInnerHTML` or non-React rendering paths would be vulnerable.
