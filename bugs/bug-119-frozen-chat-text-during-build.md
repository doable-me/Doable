# BUG-119: Chat Text Freezes During Build While Tool Calls Continue

**Severity:** HIGH (UX — users can't see AI progress text)
**Status:** FIXED (2026-04-09)
**Found:** 2026-04-09 (Chrome E2E testing)
**Component:** apps/web/src/modules/editor/hooks/use-chat.ts, SSE text event handling

## Summary
During a Supabase task manager build, the AI's text response freezes at "Let me start by checking the project structure and setting up the database.database." (note the repeated "database." — truncation artifact). The streaming dots continue animating but no new text appears, even as tool calls (creating files, running commands) continue for 5+ minutes.

## Evidence
- Text froze at ~60s mark and never updated through 500s+ of build time
- Tool call cards (file creation, package install) kept appearing normally
- The text stream and tool call stream appear desynced

## Likely Cause
The Copilot SDK emits text tokens and tool call events through different channels. When tool calls are executing (which block the LLM from producing more text), the text stream goes silent. But the UI should show intermediate text between tool calls — the AI's planning/explanation text. This text may be:
1. Buffered but never flushed when tool calls interrupt
2. Lost during the mapEventToSSE processing
3. Received but not appended to the UI message due to React state batching

## Impact
Users have no idea what the AI is doing — they only see tool call names but no context about why. The initial plan text ("I'll build a full task manager...") stays frozen.
