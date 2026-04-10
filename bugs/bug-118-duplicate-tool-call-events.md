# BUG-118: Duplicate Tool Call Events in Chat UI (2-3x per action)

**Severity:** HIGH (UX — confusing for users)
**Status:** FIXED (2026-04-09)
**Found:** 2026-04-09 (Chrome E2E testing + code analysis)
**Component:** services/api/src/routes/chat.ts (SSE emission), apps/web/src/modules/editor/hooks/use-chat.ts

## Summary
Every AI tool call (e.g., "Scanning project structure", "Running command") appears 2-3x in the chat UI. During a single build session, users see a cluttered wall of duplicate actions.

## Evidence (Chrome screenshots)
- "Scanning project structure" appears 3 times for 1 actual tool call
- "Report Intent" appears 2 times
- "Running command" appears 2-3 times

## Root Cause (from code analysis)
Three independent channels emit `tool_call` SSE events:
1. **toolProgress.onToolStart** (RPC hooks) — chat.ts:1219-1241
2. **onToolEvent** (custom event emitter) — chat.ts:1532-1541
3. **mapEventToSSE** processing `tool.execution_start` — chat.ts:3682-3709

Each writes to `stream.writeSSE()` independently without dedup. The frontend accumulates all of them.

## Fix
Keep only ONE canonical emission channel (recommend: toolProgress.onToolStart since it's the RPC hook with guaranteed delivery). Remove or guard the other two to not emit `tool_call` events when the RPC hook is active.
