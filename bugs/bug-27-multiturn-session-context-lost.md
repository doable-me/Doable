# Bug 27 — Multi-turn conversation starts fresh session (context lost)

**Status:** ✅ RESOLVED (2026-04-13)
**Severity:** 🔴 High (breaks core workflow)
**Area:** `services/api/src/routes/chat/`, SDK session management
**Discovered:** 2026-04-13 E2E test

## Root Cause
`session-manager.ts` — `sql\`UPDATE...\`.catch(() => {})` was NOT awaited. The `copilot_session_id` wasn't reliably persisted to the database before the HTTP response completed. Next request queried DB, found no session ID, created a fresh session.

## Fix
Changed to `await sql\`UPDATE...\`` in `persistSessionToDb()` function.

## Verification
DB query confirms `copilot_session_id` persisted. After API restart, session resumed with same ID (`3380f961-...`), `messagesLength: 10` with `currentTokens: 16736`.
**Status:** Open

## Symptom

When sending a follow-up message in an existing chat conversation, the SDK starts a **new session** instead of resuming the previous one. All conversation context is lost.

Evidence from API logs:
```
SDK_EVENT hook.start {"hookType":"sessionStart","input":{"source":"new",...}}
SDK_EVENT session.usage_info {"currentTokens":7217,"messagesLength":2,...}
```

The previous session had 105 messages and 39K+ tokens. The new session started with just 2 messages (system + user prompt).

## Impact

- AI loses all context from previous turns (file structure knowledge, packages installed, component architecture)
- The AI has to re-read all project files to understand state, wasting tokens and time
- User experience: feels like talking to a different AI each message
- Cost impact: first turn used 530K tokens/$2.91 — context from that is thrown away

## Expected Behavior

The SDK should resume the existing session with full conversation history, so the AI remembers:
- What files it created
- What packages it installed
- What the user asked previously
- The overall architectural decisions made

## Reproduction

1. Open an existing project with chat history
2. Wait for the first build to complete
3. Send a follow-up message (e.g., "Add dark mode")
4. Check API logs: `source: "new"` and `messagesLength: 2` confirm fresh session

## Root Cause (Likely)

The chat route handler may not be passing the existing `sessionId` when calling `session.send()` or `session.sendAndWait()` for follow-up messages. The SDK needs the session ID to resume rather than create a new session.

Check `services/api/src/routes/chat/stream.ts` or similar — the session creation vs resumption logic.
