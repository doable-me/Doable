# BUG-111: File Tree Operations (Create, Rename) Missing Auth Headers

**Severity:** CRITICAL
**Status:** FIXED (2026-04-09)
**Found:** 2026-04-09 (Code analysis)
**Component:** apps/web/src/modules/editor/sidebar/file-tree.tsx:416-434, 484-503

## Summary

`createFileViaApi` and the rename flow in the FileTree component make `fetch()` calls without `Authorization` headers. These will 401 in production. Create and rename silently fail, file tree refreshes showing stale state.

## Impact

- Creating files from the "+" button silently fails
- Renaming files silently fails (old file stays, new file never created)
- Users think operations succeeded because the tree refreshes

## Fix

Add `Authorization: Bearer ${token}` header to all fetch calls in file-tree.tsx. Use the auth hook's `fetchWithAuth` or similar wrapper.
