# BUG-115: AI create_file Tool Silently Overwrites Existing Files

**Severity:** HIGH
**Status:** Open
**Found:** 2026-04-09 (Code analysis)
**Component:** services/api/src/ai/providers/copilot.ts:713-724

## Summary

The Copilot SDK `create_file` tool calls `writeFile()` directly without checking if the file already exists. The standalone `tools/create-file.ts` properly checks and rejects, but the SDK tool path does not. The AI can accidentally destroy existing project files.

Additionally, the SDK `edit_file` tool (line 727-755) does full file replacement instead of search-replace, and bypasses the Yjs CRDT bridge — collaborator edits can be silently lost.

## Fix

Add existence check to the SDK `create_file` tool. Route `edit_file` through the Yjs bridge when collaborators are active.
