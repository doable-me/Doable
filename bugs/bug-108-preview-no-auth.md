# BUG-108: Preview Proxy Has No Authentication

**Severity:** HIGH SECURITY
**Status:** Open
**Found:** 2026-04-09 (E2E API testing)
**Component:** services/api/src/routes/preview-proxy.ts

## Summary

The preview proxy at `/preview/:projectId/*` serves project previews without any authentication. Anyone who knows (or guesses) a project UUID can view the live preview.

## Evidence

```bash
# No auth header — still returns 200 with full page content
curl -o /dev/null -w "HTTP_STATUS:%{http_code} SIZE:%{size_download}" \
  "http://127.0.0.1:4000/preview/$PROJECT_ID/"
# HTTP_STATUS:200 SIZE:25367
```

## Impact

- All project previews are publicly accessible
- Combined with BUG-101 (unauthorized file write), an attacker could inject content and view it
- Leaks project source code via Vite dev server's built-in source serving

## Fix

Add auth middleware to the preview proxy route. Allow unauthenticated access only for published/public projects.
