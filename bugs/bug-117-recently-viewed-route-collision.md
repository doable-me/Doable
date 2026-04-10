# BUG-117: /projects/recently-viewed Crashes with UUID Parse Error

**Severity:** CRITICAL (Dashboard completely broken for all users)
**Status:** FIXED (in this session)
**Found:** 2026-04-09 (Chrome E2E testing)
**Component:** services/api/src/routes/project-files.ts middleware

## Summary
The dashboard crashes on load with "ApiError: Internal Server Error" because the `projectFileRoutes` middleware at `/projects/:id/*` intercepts `/projects/recently-viewed`, parsing "recently-viewed" as a UUID and crashing PostgreSQL.

## Root Cause
`projectFileRoutes` is mounted at `/` (root) in index.ts (line 224), BEFORE `projectRoutes` at `/projects` (line 231). The middleware at line 51 and 91 uses pattern `/projects/:id/*` which matches `/projects/recently-viewed` in Hono. The SQL query `WHERE p.id = 'recently-viewed'` fails with "invalid input syntax for type uuid".

## Evidence
- Network: `GET /projects/recently-viewed?page=1&pageSize=12` → HTTP 500
- Response: `{"error":"Internal Server Error","message":"invalid input syntax for type uuid: \"recently-viewed\""}`
- Console: 8x repeated "Failed to fetch recently viewed" errors
- **The error appeared immediately on dashboard load, making the app completely unusable**

## Fix Applied
Added `UUID_RE` regex check at the start of both middleware functions in project-files.ts:
```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// In each middleware:
if (!UUID_RE.test(projectId)) { await next(); return; }
```
