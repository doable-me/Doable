# BUG-WSI-001 — room.join sends no presence/snapshot ack within 5s

## Environment
- <env>: wss://<env>-ws.doable.me, https://<env>-api.doable.me
- 2026-05-10 ~18:58Z
- Token: qa-owner JWT (24h, fresh)

## Reproduction
```js
const w = new WebSocket('wss://<env>-ws.doable.me/?token=' + ownerJwt);
w.on('open', () => w.send(JSON.stringify({type:'room.join', roomId:'r:<env>'})));
w.on('message', m => console.log(m.toString()));
// Wait 5s
```

## Observed
- Server sends `{"type":"connected","userId":"...","resumeToken":""}` immediately on open.
- After `room.join`, NO `room.joined` / `presence` / snapshot frame arrives within 5 s.
- Connection stays open; heartbeat works fine (`{type:heartbeat}` → `{type:heartbeat_ack}`).

## Expected (per TC-WS-ROOMS-001 / TC-WS-MESSAGES corpus)
After `room.join`, server should emit a presence snapshot or `room.joined` ack so the client knows it is a member of the room before broadcasting.

## Severity
medium — collaboration UX cannot show "you joined room" until first peer publishes; clients may misjudge the timing of when they're considered in-room.

## Notes
heartbeat works (PASS), so socket is alive. Likely server simply does not emit a join ack — only broadcasts subsequent presence updates. Verify expected behavior in `services/ws/src` and update corpus or fix server accordingly.

## Evidence
`testcases/evidence/<env>/TC-WS-ROOMS.log`
