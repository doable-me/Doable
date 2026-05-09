# TC-COMMENTS-REALTIME — Real-time Broadcast over WebSocket

Scope: Live comment events (create, edit, delete, resolve, reaction) broadcast to project members via WS.

---

## TC-COMMENTS-REALTIME-001
- Pre: Two members A and B on same project; both connected via WS.
- Steps: A creates comment.
- Expected: B's UI shows new comment within 200ms; no reload.
- Severity: P0

## TC-COMMENTS-REALTIME-002
- Pre: Member A edits comment.
- Expected: B sees updated body; "edited" indicator.
- Severity: P1

## TC-COMMENTS-REALTIME-003
- Pre: A deletes comment.
- Expected: B's comment list removes/strikes-through.
- Severity: P1

## TC-COMMENTS-REALTIME-004
- Pre: A resolves.
- Expected: B's UI moves comment to resolved section.
- Severity: P1

## TC-COMMENTS-REALTIME-005
- Pre: A reacts.
- Expected: B sees reaction count update.
- Severity: P2

## TC-COMMENTS-REALTIME-006
- Pre: B is offline (disconnected).
- Steps: A makes 5 comments.
- Expected: When B reconnects, fetches missed via REST cursor; UI converges.
- Severity: P0

## TC-COMMENTS-REALTIME-007
- Pre: WS auth.
- Expected: Subscribe to project requires membership; unauthorized 401/403.
- Severity: P0

## TC-COMMENTS-REALTIME-008
- Pre: Cross-project leakage.
- Expected: Members of project X can't subscribe to project Y events.
- Severity: P0

## TC-COMMENTS-REALTIME-009
- Pre: WS message format.
- Expected: { type: "design_comment.create" | ".edit" | ".delete" | ".resolve" | ".reaction", payload }.
- Severity: P2

## TC-COMMENTS-REALTIME-010
- Pre: WS broadcast batches multiple events.
- Expected: Burst of edits batches in one frame.
- Severity: P2

## TC-COMMENTS-REALTIME-011
- Pre: Order preservation.
- Expected: Events strictly monotonic per project_id; sequence_id provided.
- Severity: P1

## TC-COMMENTS-REALTIME-012
- Pre: Reconnect with last_seen sequence_id.
- Expected: Server replays missed events.
- Severity: P1

## TC-COMMENTS-REALTIME-013
- Pre: WS server restart mid-collaboration.
- Expected: Reconnect; state converges; no duplicate UI rows.
- Severity: P1

## TC-COMMENTS-REALTIME-014
- Pre: User A and B on different API workers.
- Expected: Pubsub forwards events; both receive.
- Severity: P1

## TC-COMMENTS-REALTIME-015
- Pre: WS bound 127.0.0.1.
- Expected: Verified.
- Severity: P0

## TC-COMMENTS-REALTIME-016
- Pre: Slow client backpressure.
- Expected: Server queues per-client buffer up to limit; drops/disconnects on overflow with warning.
- Severity: P1

## TC-COMMENTS-REALTIME-017
- Pre: Heartbeat ping/pong.
- Expected: Periodic; idle disconnect after timeout.
- Severity: P2

## TC-COMMENTS-REALTIME-018
- Pre: Member loses workspace membership while subscribed.
- Expected: Server detects and disconnects; client receives 4001/4003 close code.
- Severity: P0

## TC-COMMENTS-REALTIME-019
- Pre: Mass concurrent users (100) on same project.
- Expected: Broadcast scales; per-event latency <500ms p95.
- Severity: P2

## TC-COMMENTS-REALTIME-020
- Pre: Comment events also written to activity_events.
- Expected: WS broadcast and DB write both occur; transactional or eventual.
- Severity: P1

## TC-COMMENTS-REALTIME-021
- Pre: Yjs CRDT update for comment text inline editing.
- Expected: Yjs awareness used for cursors; comment edits via REST not Yjs (depending on design).
- Severity: P2

## TC-COMMENTS-REALTIME-022
- Pre: Spam protection: many comments rapid-fire.
- Expected: Rate-limit 30/min; 429 returned.
- Severity: P1

## TC-COMMENTS-REALTIME-023
- Pre: Verify WS payload doesn't include unauthorized fields (e.g., other members' emails).
- Expected: Author id only; resolve emails via separate auth'd endpoint.
- Severity: P1

## TC-COMMENTS-REALTIME-024
- Pre: WS reconnect storm after server restart.
- Expected: Backoff prevents thundering herd.
- Severity: P1

## TC-COMMENTS-REALTIME-025
- Pre: WS connection per project vs per user.
- Expected: Multiplexed; one connection per user, channels per project.
- Severity: P2

## TC-COMMENTS-REALTIME-026
- Pre: Comment events and team-chat events isolated.
- Expected: Different channels; mistakes don't cross-leak.
- Severity: P0

## TC-COMMENTS-REALTIME-027
- Pre: Verify all events show OTel trace_id.
- Expected: Linkable from admin trace.
- Severity: P2

## TC-COMMENTS-REALTIME-028
- Pre: Verify rate limits per WS connection.
- Expected: 60 outbound msgs/min/connection; abuse triggers disconnect.
- Severity: P1

## TC-COMMENTS-REALTIME-029
- Pre: Two tabs of same user receive same events.
- Expected: Idempotent UI rendering; no duplicate.
- Severity: P2

## TC-COMMENTS-REALTIME-030
- Pre: WS event TTL.
- Expected: Server holds replay buffer for N minutes; older requires REST.
- Severity: P2
