# BUG-120: AI Auto-Continue Gets Stuck in Infinite Read Loop

**Severity:** CRITICAL (UX — user waits forever, wastes credits)
**Status:** FIXED (2026-04-09)
**Found:** 2026-04-09 (Chrome E2E testing)
**Component:** services/api/src/routes/chat.ts (auto-continue logic), apps/web/src/modules/editor/hooks/use-chat.ts

## Summary
When building a Supabase task manager app, the AI created ~13 files successfully but then entered an infinite loop of reading the same files (useTasks.ts, storage.ts, supabase.ts) repeatedly without making any edits. The session ran for 10+ minutes with no progress after the initial file creation phase (~5 min mark).

## Evidence
- Timer: 633s+ (over 10 minutes) with no new file writes
- Same 3 files being re-read in cycle: useTasks.ts, storage.ts, supabase.ts
- Chat text frozen at "database.database." since ~60s mark
- Preview never cleared the "Building your app..." overlay
- Files were created (supabase.ts, task.ts, storage.ts, TaskFilter, EmptyState, App.tsx, index.css) but the build errors weren't resolved

## Root Cause (from code analysis)
The auto-continue loop in the chat system has no max-retry counter. When the AI encounters unfixable errors (e.g., Supabase env vars not set, import resolution failures), it keeps reading → trying to fix → reading again indefinitely.

From editor code analysis: "Auto-fix loop has no max-retry counter; infinite on unfixable errors."

## Impact
- User waits 10+ minutes with no way to know the AI is stuck
- Credits consumed for zero-value read operations
- No timeout or circuit breaker

## Fix
1. Add max-retry counter to auto-continue (suggest: 3 retries max)
2. After max retries, show error to user with specific build errors
3. Consider showing preview even during builds (remove blocking overlay)
