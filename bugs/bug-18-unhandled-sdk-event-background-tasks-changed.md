# Bug 18 — `[mapEventToSSE] unhandled event type: session.background_tasks_changed`

**Severity:** 🟢 Low (log noise; new SDK event type the mapper doesn't know about)
**Area:** `services/api/src/routes/chat.ts` — `mapEventToSSE()` helper (same surface as bug-04 `session.custom_agents_updated`)
**Discovered:** 2026-04-09 round-2 E2E
**Status:** Open
**Related:** bug-04 (same class, different event name)

## Symptom

```
[mapEventToSSE] unhandled event type: session.background_tasks_changed
```

Logged repeatedly during active streaming. Copilot SDK v0.1.32 (or a slightly newer patch) emits this event when the session's background task list updates (e.g. a long-running powershell tool starts in the background).

## Impact

- Log noise during every turn that triggers a background task (plan-mode builds, long install_package runs).
- No functional bug — the event just has no SSE mapping, so the default path logs the warning.

## Fix

Add `session.background_tasks_changed` to the `mapEventToSSE()` ignore list (or route it to an SSE `status` frame if we want the frontend to show a "Background: …" indicator).

Recommended: start with silent ignore. Later, if users want visibility into background tasks, pipe it to a new SSE `background_task_update` frame consumed by `use-chat.ts`.

## Acceptance

1. `grep "session.background_tasks_changed" services/api/src/routes/chat.ts` shows it in the ignore list.
2. No more warning lines in API logs during multi-tool streams.
