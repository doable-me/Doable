# BUG-CORPUS-WS-001 — WS `room:join` accepts arbitrary roomId without ACL check

- **Severity:** high
- **Surface:** `wss://zantaz-ws.doable.me/?token=<JWT>`
- **Date:** 2026-05-10
- **Discovered while running:** TC-SEC-RLS-035 / TC-WS-ROOMS join

## Repro

1. Connect WS as `qa-alice` (token in evidence/_tokens-env1.json).
2. Send: `{"type":"room:join","roomId":"11111111-1111-1111-1111-111111111111"}` (a roomId Alice has no relationship with).
3. Server responds with full `room:joined` payload including member list, and the connection is *not* closed.

## Observed

```
{"type":"room:joined","projectId":"11111111-1111-1111-1111-111111111111",
 "members":[{"userId":"798d2ac4-bd16-49ac-99c1-af545d1a0993","displayName":"qa-alice",...}]}
```

Same behaviour with `roomId=00000000-0000-0000-0000-000000000000` (logged as TC-WS-ROOMS-INVALID.body).

## Expected

Per TC-SEC-RLS-035: WS server MUST verify the user is a member of the workspace owning the project, OR the project's collaboration-active flag is true and an invite link covers them. Failure → close 4403 (or similar) and not echo presence/cursor data to non-members.

## Impact

- Cross-tenant presence / cursor / awareness leakage.
- Yjs CRDT writes via `/internal/yjs/write` may flow to a doc the user shouldn't influence (needs follow-up on whether subsequent y-message ops succeed; presence-only confirms today).
- Enables a probe-the-namespace attack against project IDs.

## Remediation

In WS server's `handleRoomJoin`, before emitting `room:joined`, call API or local DB to confirm the user is a member of the workspace owning `projectId` (or holds a collab share). Otherwise emit `{type:"error",code:"FORBIDDEN"}` and `ws.close(4403)`.

## Evidence

- `testcases/evidence/env1/TC-SEC-RLS-035-random.body`
- `testcases/evidence/env1/TC-WS-ROOMS-INVALID.body`
