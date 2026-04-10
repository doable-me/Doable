# BUG-101: Unauthorized File Write — Any User Can Write to Any Project

**Severity:** CRITICAL SECURITY
**Status:** FIXED (2026-04-09)
**Found:** 2026-04-09 (E2E API testing)
**Component:** services/api/src/routes/project-files.ts

## Summary

Any authenticated user can write files to any project, regardless of ownership or membership. The file write endpoint (`PUT /projects/:id/files/:path`) does not validate project ownership.

## Repro Steps

1. Register User A, create workspace, create project P1
2. Register User B (completely separate)
3. As User B, `PUT /projects/<P1_ID>/files/hack.txt` with content `{"content":"unauthorized write"}`
4. Request succeeds with 200, file is written to P1's directory

## Evidence

```bash
# User B (not a member of P1's workspace):
curl -X PUT "http://127.0.0.1:4000/projects/$P1_ID/files/hack.txt" \
  -H "Authorization: Bearer $USER_B_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"unauthorized write"}'
# Response: {"data":{"path":"hack.txt","size":18,"updatedAt":"..."}}

# Verify as User A (owner):
curl "http://127.0.0.1:4000/projects/$P1_ID/files/hack.txt" \
  -H "Authorization: Bearer $USER_A_TOKEN"
# Response: {"data":{"path":"hack.txt","content":"unauthorized write"}}
```

Note: `GET /projects/:id` correctly returns 404 for User B — only file write bypasses auth.

## Root Cause

The file write endpoint likely either:
- Doesn't check project ownership at all
- Only validates the auth token (user is logged in) but not project membership
- Has a different middleware chain than the project GET endpoint

## Impact

- Any authenticated user can overwrite any file in any project
- Could be used to inject malicious code into other users' projects
- Could destroy user work by overwriting files
- If combined with the preview proxy (which has no auth), could serve malicious content

## Fix

Add project ownership/membership validation to ALL file operation endpoints (PUT, DELETE) in `project-files.ts`, matching the validation used by `GET /projects/:id`.
