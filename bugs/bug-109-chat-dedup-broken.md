# BUG-109: Chat Collaboration Dedup Broken — Double Messages

**Severity:** CRITICAL
**Status:** Open
**Found:** 2026-04-09 (Code analysis)
**Component:** apps/web/src/modules/editor/hooks/use-chat.ts:163,188-189; services/api/src/routes/chat.ts:1505

## Summary

Frontend generates `broadcastMsgId` using `generateId()` → `msg_<timestamp>_<random>`. Server generates `messageId` using `crypto.randomUUID()`. The WS dedup check compares server's UUID against client's `msg_xxx` — **they never match**.

## Impact

When collaborating, the user who sent a message receives their own broadcast back and sees:
1. Duplicate user message
2. Duplicate assistant placeholder
3. Double messages in chat

## Fix

Either:
- Send `broadcastMsgId` to server and use it as broadcast `messageId`
- Dedup by `userId` instead of `messageId`
