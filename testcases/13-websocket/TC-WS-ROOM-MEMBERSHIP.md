# TC-WS-ROOM-MEMBERSHIP — `room:join` must enforce workspace membership (regression for BUG-CORPUS-WS-001)

**Source:** `services/ws/src/message-handler.ts` — `checkProjectMembership()`
**Bug:** `testcases/bugs/BUG-CORPUS-WS-001.md`
**Date authored:** 2026-05-10
**Severity:** high

After the fix, `room:join` performs a `projects ⨝ workspace_members` check
before adding the user to the in-memory room. Non-members get
`{type:"error",code:"FORBIDDEN_ROOM"}` and are NOT added to the room (no
member list, presence, or chat history is leaked).

## Pre-requisites

- Two test users in `test-accounts.md`. Use Alice (member of workspace W1
  containing project P1) and Mallory (NOT a member of W1, has her own
  workspace W2 / project P2).
- WS endpoint: `wss://zantaz-ws.doable.me/?token=<JWT>` (or local
  `ws://127.0.0.1:4001/?token=...`).

## TC-WS-ROOM-MEMBERSHIP-001 — Non-member cannot join arbitrary projectId

**Steps:**

1. Mint Alice's JWT and a random UUID Alice has never seen
   (`11111111-1111-1111-1111-111111111111`).
2. Connect WS as Alice.
3. Send: `{"type":"room:join","projectId":"11111111-1111-1111-1111-111111111111"}`.

**Expected (post-fix):**
- Server replies with `{type:"error",code:"FORBIDDEN_ROOM",message:"Not authorized to join this room"}`.
- NO `room:joined` payload is sent.
- The connection stays open (so a subsequent legitimate `room:join` works).
- Server-side: the client state's `projectId` remains `null`; the room is
  not registered in `RoomManager`.

**Pre-fix evidence:** server replied with full `room:joined` + member list
(see `testcases/evidence/env1/TC-WS-ROOMS-INVALID.body`).

## TC-WS-ROOM-MEMBERSHIP-002 — Mallory cannot join Alice's project

Same as 001 but with `projectId = P1` (a real project Alice owns and
Mallory has no access to).

**Expected:** `FORBIDDEN_ROOM`, no presence leakage. Verifies the check
is workspace-scoped, not just "project exists".

## TC-WS-ROOM-MEMBERSHIP-003 — Member CAN join own project

Sanity / no-regression. Alice joins P1 with `room:join`.

**Expected:** `{type:"room:joined",projectId:"<P1>",members:[...]}` within
~50ms (per BUG-WSI-001 latency budget).

## TC-WS-ROOM-MEMBERSHIP-004 — Soft-deleted project rejected

Alice joins a project she once owned but which has `deleted_at IS NOT NULL`.

**Expected:** `FORBIDDEN_ROOM`. Soft-deleted projects do not match the
`projects p ... WHERE p.deleted_at IS NULL` clause.

## TC-WS-ROOM-MEMBERSHIP-005 — Malformed UUID rejected

Send `{"type":"room:join","projectId":"not-a-uuid"}`.

**Expected:** `FORBIDDEN_ROOM` (the `::uuid` cast in the membership query
throws inside `checkProjectMembership`, which fails closed and returns
`forbidden`). The connection stays open. NO uncaught exception escapes.

## TC-WS-ROOM-MEMBERSHIP-006 — `roomId` alias is also gated

Send `{"type":"room:join","roomId":"<P1-of-foreign-workspace>"}`.

**Expected:** The dotted/`roomId` alias normalisation in `index.ts`
rewrites `roomId` → `projectId`; the membership check still applies.
`FORBIDDEN_ROOM` for non-members.

## TC-WS-ROOM-MEMBERSHIP-007 — Previous-room state preserved on rejection

1. Alice joins P1 successfully (`room:joined` received).
2. Alice sends a second `room:join` for a foreign UUID.

**Expected:** `FORBIDDEN_ROOM`. Critically, Alice is STILL a member of P1
afterwards — the rejection path must not call `oldRoom.leave()`. Verify
by sending `heartbeat` and observing P1 is still pinged in `RoomManager`.

## Retest commands

```
pnpm --filter @doable/ws type-check
# Connect via wscat or scripts/ws-probe.ts and run the suite
```

## Notes

- The WS service has no `@doable/db` dep; the membership query uses raw
  `sql` in `services/ws/src/db.ts`. When `DATABASE_URL` is unset, the
  proxy `sql` throws — `checkProjectMembership` catches and returns
  `forbidden` (fail-closed).
- Cross-tenant Yjs writes via `/internal/yjs/write` are NOT covered by
  this TC — that surface uses the internal-secret guard, not the user
  token. See follow-up in BUG-CORPUS-WS-001 §Impact.
