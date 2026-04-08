# Bug 4 — Unmapped SDK event `session.custom_agents_updated`

**Severity:** 🟢 Low (noisy warn, no functional impact)
**Area:** `services/api/src/routes/chat.ts` `mapEventToSSE`
**Discovered:** 2026-04-08 test run
**Status:** Open

## Symptom

On every chat run, the API logs:

```
[mapEventToSSE] unhandled event type: session.custom_agents_updated
[Chat] Unmapped SDK event: "session.custom_agents_updated" for <projectId>
```

The event is hit by `mapEventToSSE`'s default/warn branch. It is **not** forwarded to the client as an SSE frame — it's silently swallowed after the log.

## Impact

- Functional: none observed. The run completes successfully; the client never needed this event.
- Operational: log noise. On a server handling many chat sessions, this line repeats per-session and makes real warnings harder to spot.
- Future: if the client ever *does* need custom-agents update notifications, the event is already being dropped on the floor.

## Fix

Pick one of:

### Explicit drop (lowest effort)

Add an explicit case in `mapEventToSSE` that returns `null` without logging:

```ts
case "session.custom_agents_updated":
  // intentionally not forwarded — client has no use for this yet
  return null;
```

### Forward it

If the frontend should know when custom agents change (e.g. to refresh a tools list), map it to a client-facing event:

```ts
case "session.custom_agents_updated":
  return {
    type: "custom_agents_updated",
    data: evtData,
  };
```

### Whitelist

If there are several known-safe-to-drop events, build an explicit deny-list and downgrade the "unmapped" log to a single per-process warning instead of per-event.

## Reproduction

Observed on every run of the audit test (2026-04-08, project `db9a5d1c-7164-47df-8402-17910ffabe75`). Deterministic.
