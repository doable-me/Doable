# Collaboration Issue Research

## Date: 2026-04-02

## Symptom
When sharing a project link with a collaborator, neither user can see the other's
mouse movement or cursor. All collaborative editing features (cursors, visual edit
cursors, Yjs CRDT sync) appear non-functional.

---

## Finding 1: Both users resolve to the same userId (ROOT CAUSE of broken collab)

**Evidence from WS server logs** — every single `room:join` in the log is the
same user:

```
userId=7a83181f-6d5d-4fb9-ac8c-77d642b6475b  displayName=uniquegodwin
```

No other userId appears anywhere. Both browser sessions (the owner and the
"collaborator") are authenticated with the same account.

**Why this breaks everything:**

The `Room` class stores members in a `Map<string, RoomMember>` keyed by userId
(`services/ws/src/rooms/room.ts:178`):

```ts
this.members.set(userId, member);
```

When the second connection joins with the same userId, it **overwrites** the
first connection's WebSocket reference. The room now has `size === 1`.

All broadcasts exclude the sender by userId (`room.ts:297-304`):

```ts
broadcast(message, excludeUserId?) {
  for (const [userId, member] of this.members) {
    if (userId === excludeUserId) continue;  // ← skips the ONLY member
    member.ws.send(data);
  }
}
```

Since the sender's userId is the only member, broadcasts reach **nobody**.

The WS health endpoint confirms this — `roomSize=1` on every broadcast:

```
broadcast projectId=8eabadd1... type=ai:message-sent roomSize=1 exclude=7a83181f...
```

**Fix required:** Two separate user accounts to test collaboration, OR the Room
needs to support multiple connections per userId (keyed by a connection ID instead).

---

## Finding 2: room:join storm — hundreds of rapid joins

The WS server logs show the same user joining rooms hundreds of times with no
pause:

```
[ws] room:join userId=7a83181f... projectId=8eabadd1...
[ws] room:join userId=7a83181f... projectId=8eabadd1...
[ws] room:join userId=7a83181f... projectId=32dfc4e7...
[ws] room:join userId=7a83181f... projectId=8eabadd1...
[ws] room:join userId=7a83181f... projectId=8eabadd1...
[ws] room:join userId=7a83181f... projectId=32dfc4e7...
  ... (repeats 100+ times)
```

### Root cause: React StrictMode + dev mode on production server

**Confirmed:** The web app runs in dev mode on the production server:

```
next dev --turbopack --hostname 127.0.0.1
```

And `reactStrictMode: true` is set in `apps/web/next.config.ts:4`.

React StrictMode in development mode intentionally double-invokes effects (mount →
unmount → remount) to surface bugs. Combined with the WebSocket lifecycle, this
creates **orphaned WebSocket connections** that cascade into repeated reconnects.

### Detailed trace of the orphan cascade

The WebSocket hook (`apps/web/src/modules/collaboration/hooks/use-websocket.ts`):

```ts
// Line 19-52: connect creates a WebSocket and stores it in wsRef
const connect = useCallback(() => {
  const ws = new WebSocket(...);
  ws.onopen = () => { setConnectionState("connected"); ... };
  ws.onclose = () => {
    setConnectionState("reconnecting");
    reconnectTimeoutRef.current = setTimeout(connect, delay);  // ← key line
  };
  wsRef.current = ws;
}, []);

// Line 54-60: effect calls connect() on mount, closes on cleanup
useEffect(() => {
  connect();
  return () => {
    clearTimeout(reconnectTimeoutRef.current);
    wsRef.current?.close();
  };
}, [connect]);
```

**StrictMode lifecycle:**

| Step | What happens | Result |
|------|-------------|--------|
| 1 | Effect mounts → `connect()` → creates **ws1** | ws1 in wsRef |
| 2 | StrictMode cleanup → `wsRef.current.close()` | ws1 starts closing |
| 3 | Effect remounts → `connect()` → creates **ws2** | ws2 in wsRef, ws1 closing |
| 4 | ws1.onclose fires (async, after cleanup) | Schedules `setTimeout(connect, 1s)` |
| 5 | ws2.onopen fires → connectionState = "connected" | room:join sent |
| 6 | Timeout from step 4 fires → `connect()` → creates **ws3** | ws3 in wsRef, **ws2 orphaned** |
| 7 | ws3.onopen → connectionState = "connected" | another room:join |
| 8 | ws2 eventually closes (network timeout) | ws2.onclose schedules another connect() |
| 9 | ... cycle repeats | Orphan cascade grows |

The critical bug is in **step 4**: `ws.onclose` fires AFTER the cleanup has
already run. The cleanup clears `reconnectTimeoutRef.current`, but that was set
before cleanup ran (it's still null at that point). The orphaned connection's
`onclose` handler then sets a NEW timeout that the cleanup never clears.

Each orphaned WebSocket eventually closes (server-side idle timeout, network
drop), which triggers its `onclose` handler, which creates yet another
WebSocket — perpetuating the cycle.

### Why this also causes the room:join flood

Each new WebSocket connection triggers:
1. `ws.onopen` → `setConnectionState("connected")` → React re-render
2. `useProjectRoom` effect depends on `connectionState` — runs when it
   becomes "connected"
3. Effect sends `room:join`

With multiple WebSocket connections opening in parallel (one legitimate, plus
orphans), the server receives many `room:join` messages.

### Additional amplifier: two open project tabs

The logs show alternating joins for two project IDs:
- `8eabadd1-64c4-4a17-83db-d651e1b0cbb5`
- `32dfc4e7-12a2-4e00-88b1-12330b4fa5da`

Each open tab has its own `CollaborationProvider` → `useWebSocket` → `useProjectRoom`
chain. Both experience the orphan cascade independently, doubling the join volume.

---

## Finding 3: Cloudflare Tunnel — working but with intermittent errors

Cloudflare Tunnel is active and correctly configured:

```yaml
# /etc/cloudflared/config.yml
ingress:
  - hostname: ws.doable.me
    service: http://localhost:4001    # ← correct
  - hostname: api.doable.me
    service: http://localhost:4000    # ← correct
  - hostname: doable.me
    service: http://localhost:3000    # ← correct
```

However, cloudflared logs show intermittent `Unable to reach the origin service`
errors for `api.doable.me`, suggesting the API server may occasionally be
unreachable. These are for the preview proxy (type=ws for Vite HMR), not the
main WebSocket server. The WS server on port 4001 appears stable.

---

## Finding 4: Env vars are correct

```
NEXT_PUBLIC_WS_URL=wss://ws.doable.me   ← correct, baked into Next.js build
WS_PORT=4001                             ← correct
WS_HOST=127.0.0.1                        ← correct per security policy
WS_INTERNAL_URL=http://127.0.0.1:4001    ← correct for API→WS internal calls
```

---

## Finding 5: `send` and `subscribe` are referentially stable (NOT a cause)

Both functions in `use-websocket.ts` use `useCallback(fn, [])` with empty
dependency arrays, making them stable across re-renders. They use refs
internally (`wsRef`, `handlersRef`, `queueRef`) so they always access current
state without needing to be recreated. This means the `useProjectRoom` effect
dependency on `[send, subscribe]` does NOT contribute to the re-run cycle.

---

## Finding 6: No collaboration code changed in recent commits

The last commit to touch any file under `services/ws/` or
`apps/web/src/modules/collaboration/` was `0628720` (server setup). The recent
commits (`abde9e1`, `1706a8a`, `b5b97bb`) only modified:
- `services/api/src/routes/chat.ts` (AI streaming)
- `services/api/src/ai/providers/copilot.ts` (engine pool key fix)
- `apps/web/src/modules/editor/hooks/use-chat.ts` (chat history loading)
- `apps/web/src/modules/editor/hooks/use-editor-store.ts` (+toolCallDetails field)
- `apps/web/src/modules/editor/chat/chat-message.tsx` (tool summary UI)

None of these files interact with WebSocket, presence, cursors, or Yjs.

---

## Summary

| Issue | Severity | Category |
|-------|----------|----------|
| Same userId for both users → broadcasts reach nobody | **CRITICAL** | User error / architectural limitation |
| React StrictMode + dev mode → orphaned WebSocket cascade → room:join storm | **HIGH** | Dev/prod parity bug |
| Web app running `next dev` on production server | **HIGH** | Deployment configuration |
| No collaboration code changes in recent commits | Info | Rules out code regression |
| Cloudflare Tunnel + env vars working correctly | Info | Rules out infrastructure |

## Recommended investigations (not yet done)

1. Test with two different user accounts to confirm collaboration works once
   the same-userId problem is resolved.
2. Quantify the orphan cascade — add connection-level logging to the WS server
   (log new WS connections with a unique ID) to measure how many concurrent
   connections exist per user.
3. Evaluate running `next build && next start` on the production server to
   eliminate StrictMode double-mount and improve performance.
4. Consider whether the Room should support multiple connections per userId
   (e.g., keyed by `${userId}:${connectionId}`) so that the same user in
   two browser tabs still works correctly.
5. Fix the orphaned WebSocket issue in `use-websocket.ts` — track a
   "disposed" flag that prevents the `onclose` handler from scheduling
   reconnects after the effect cleanup has run.
