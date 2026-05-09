# TC-WS-ROOMS — Room join/leave, isolation, cleanup, heartbeat

Client messages relevant:
- `room:join {projectId}`
- `room:leave`
- `heartbeat`

Server side:
- `RoomManager.getOrCreate(projectId)` returns Room.
- `room.join(ws, userId, displayName, ...)` adds to room and returns `members` snapshot.
- `room.leave(userId, ws)` removes; if empty, `onEmpty` callback fires for GC.
- Cross-room broadcast IS impossible — broadcast scoped per Room.

---

## TC-WS-ROOM-001 — Join a room with valid projectId
- **Steps:** WS connect; send `{type:"room:join",projectId:"<uuid>"}`.
- **Expected:** receive `{type:"room:joined",projectId,members:[{userId,displayName,color,...}]}`.
- **Severity:** smoke

## TC-WS-ROOM-002 — Members include self with correct color and displayName
- **Severity:** smoke

## TC-WS-ROOM-003 — Two users join same room — second sees both members
- **Severity:** smoke

## TC-WS-ROOM-004 — First user receives presence broadcast when second joins
- **Severity:** high

## TC-WS-ROOM-005 — Join then re-join different projectId leaves old room
- **Steps:** join A, then join B (without explicit leave).
- **Expected:** A's members list excludes caller; B's includes.
- **Severity:** high

## TC-WS-ROOM-006 — Explicit room:leave removes from room
- **Severity:** smoke

## TC-WS-ROOM-007 — Leave when not in any room → no error
- **Severity:** low

## TC-WS-ROOM-008 — Disconnect mid-session leaves room
- **Severity:** smoke

## TC-WS-ROOM-009 — Last user disconnect triggers room GC after grace
- **Severity:** high

## TC-WS-ROOM-010 — Room GC cancelled if user reconnects within grace
- **Severity:** high

## TC-WS-ROOM-011 — Cross-room isolation: project A's broadcast not visible in project B
- **Severity:** high

## TC-WS-ROOM-012 — Cross-room isolation: yjs:update for A's project not delivered to B's clients
- **Severity:** high

## TC-WS-ROOM-013 — Cross-room isolation: presence for A not visible in B
- **Severity:** high

## TC-WS-ROOM-014 — Cross-room isolation: chat:send for A not delivered to B
- **Severity:** high

## TC-WS-ROOM-015 — `chat:history` fetched on join (from API team-chat internal)
- **Steps:** join room.
- **Expected:** receive `{type:"chat:history",messages:[...]}` within 2s.
- **Severity:** high

## TC-WS-ROOM-016 — Chat history empty for new project → still receives empty array
- **Severity:** medium

## TC-WS-ROOM-017 — Chat history limited to 50 messages
- **Severity:** medium

## TC-WS-ROOM-018 — Multi-tab same user — both tabs join → see each other or single member?
- **Notes:** room.join keyed by userId; second join may overwrite. Verify members list size.
- **Severity:** high

## TC-WS-ROOM-019 — Multi-tab same user — both tabs receive broadcasts (or just one)
- **Severity:** high

## TC-WS-ROOM-020 — Multi-tab same user — leaving one tab does NOT remove user if other tab still in
- **Severity:** high

## TC-WS-ROOM-021 — Heartbeat keeps user from being GC'd
- **Severity:** medium

## TC-WS-ROOM-022 — Missed heartbeats >threshold → user removed from room
- **Severity:** high

## TC-WS-ROOM-023 — Heartbeat received before room:join → no-op (no projectId)
- **Severity:** low

## TC-WS-ROOM-024 — Heartbeat ack response received within 100ms
- **Severity:** medium

## TC-WS-ROOM-025 — Reconnect: client sends room:join again after WS reconnect
- **Severity:** smoke

## TC-WS-ROOM-026 — Reconnect within 5s — room state preserved
- **Severity:** medium

## TC-WS-ROOM-027 — Reconnect after 60s — room may have been GC'd; re-creates room
- **Severity:** medium

## TC-WS-ROOM-028 — Concurrent joins (10 clients in 100ms) — all see each other
- **Severity:** medium

## TC-WS-ROOM-029 — Members order deterministic (e.g. sorted by joinTime or userId)
- **Severity:** low

## TC-WS-ROOM-030 — Room with 50+ users — broadcast latency <1s
- **Severity:** medium

## TC-WS-ROOM-031 — Room with 100+ users — server stable
- **Severity:** medium

## TC-WS-ROOM-032 — Send malformed JSON → server replies `{type:"error",code:"PARSE_ERROR",message:"Invalid JSON"}`
- **Severity:** medium

## TC-WS-ROOM-033 — Send unknown message type → silently ignored (default switch case = no-op)
- **Severity:** low

## TC-WS-ROOM-034 — Send message with wrong projectId from state → ignored (state.projectId is source of truth)
- **Severity:** medium

## TC-WS-ROOM-035 — Server emits OTel spans per recv message (`ws.recv.<type>`)
- **Severity:** low

## TC-WS-ROOM-036 — Span attribute `ws.message.type` set
- **Severity:** low

## TC-WS-ROOM-037 — Span attribute `user_id` and `project_id` populated
- **Severity:** low

## TC-WS-ROOM-038 — Async message handler (yjs:sync-request) ends span asynchronously
- **Severity:** low

## TC-WS-ROOM-039 — Throwing message handler records exception on span
- **Severity:** low

## TC-WS-ROOM-040 — Disconnect span includes `ws.close_code` and reason
- **Severity:** low

## TC-WS-ROOM-041 — `connected` server message sent before any `room:joined`
- **Severity:** medium

## TC-WS-ROOM-042 — Server tolerates rapid join/leave loop without leaks
- **Severity:** medium

## TC-WS-ROOM-043 — Room state isolation: editing in room A doesn't show changes in room B
- **Severity:** high

## TC-WS-ROOM-044 — Server health endpoint reports correct room count
- **Severity:** medium

## TC-WS-ROOM-045 — `users` count in /health matches sum of all room sizes
- **Severity:** medium

## TC-WS-ROOM-046 — Room with malformed projectId (non-UUID) — accepted (room id is just a string)
- **Severity:** low

## TC-WS-ROOM-047 — Joining 1000 rooms from one client (rotating projectId)
- **Severity:** low

## TC-WS-ROOM-048 — Server rejects WS upgrade to non-/ paths if any (verify)
- **Severity:** low

## TC-WS-ROOM-049 — Server denies internal POST without secret on each path
- **Severity:** high

## TC-WS-ROOM-050 — Internal POST CORS allows API origin
- **Severity:** medium
