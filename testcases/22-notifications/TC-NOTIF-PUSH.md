# TC-NOTIF-PUSH — Real-time Push via WebSocket

Scope: WS broadcast of new notifications without page reload; reconnect; ordering; batch.

---

## TC-NOTIF-PUSH-001
- Pre: User connected via WS to /ws/notifications.
- Steps: Another user mentions them.
- Expected: WS message delivered with payload mirroring the notification row; UI badge increments.
- Severity: P0

## TC-NOTIF-PUSH-002
- Pre: User offline (WS disconnected).
- Expected: Notification persisted; on next connect, backfill via REST; no missed.
- Severity: P0

## TC-NOTIF-PUSH-003
- Pre: User connects from 2 devices.
- Expected: Both receive notification.
- Severity: P1

## TC-NOTIF-PUSH-004
- Pre: WS auth.
- Expected: Connection requires session/token; unauthenticated 401.
- Severity: P0

## TC-NOTIF-PUSH-005
- Pre: Cross-user spoof attempt.
- Expected: Cannot subscribe to other user's stream; server filters by authenticated user_id.
- Severity: P0

## TC-NOTIF-PUSH-006
- Pre: Many notifications burst.
- Expected: Batched in single WS frame; client UI throttles re-render.
- Severity: P1

## TC-NOTIF-PUSH-007
- Pre: WS server restart.
- Expected: Clients auto-reconnect with backoff; missed notifications backfilled via REST cursor.
- Severity: P0

## TC-NOTIF-PUSH-008
- Pre: WS bound 127.0.0.1.
- Expected: Verified; no public exposure.
- Severity: P0

## TC-NOTIF-PUSH-009
- Pre: Server-sent ping/pong.
- Expected: Idle connection kept alive with periodic ping; client responds with pong.
- Severity: P2

## TC-NOTIF-PUSH-010
- Pre: Connection idle >5 min without traffic.
- Expected: Server sends ping; if no pong, drops connection; client reconnects.
- Severity: P2

## TC-NOTIF-PUSH-011
- Pre: User marks read on device A.
- Expected: WS broadcasts read_state to device B; badge updates without action.
- Severity: P1

## TC-NOTIF-PUSH-012
- Pre: User deletes on device A.
- Expected: Device B removes from list via WS event.
- Severity: P1

## TC-NOTIF-PUSH-013
- Pre: Mention triggered by another user.
- Expected: Notification row created; WS push immediate.
- Severity: P0

## TC-NOTIF-PUSH-014
- Pre: Build complete event.
- Expected: notifications row + WS push when deploy succeeds.
- Severity: P0

## TC-NOTIF-PUSH-015
- Pre: Build failed event.
- Expected: notifications row + WS push with severity and link to logs.
- Severity: P0

## TC-NOTIF-PUSH-016
- Pre: Member invite event.
- Expected: Invited user gets notification + email (per settings).
- Severity: P0

## TC-NOTIF-PUSH-017
- Pre: Plan downgrade event.
- Expected: All workspace members notified; severity=high; banner shown next visit.
- Severity: P0

## TC-NOTIF-PUSH-018
- Pre: Plan upgrade.
- Expected: Optional notification "Welcome to Pro".
- Severity: P2

## TC-NOTIF-PUSH-019
- Pre: Comment reply.
- Expected: Notification to original commenter and any thread participants.
- Severity: P1

## TC-NOTIF-PUSH-020
- Pre: Comment resolved.
- Expected: Notification to participants; mark as low severity.
- Severity: P2

## TC-NOTIF-PUSH-021
- Pre: User-self action does not notify self.
- Expected: When user replies to own comment, no notification to self.
- Severity: P1

## TC-NOTIF-PUSH-022
- Pre: WS message format.
- Expected: JSON with type, payload, timestamp; schema versioned.
- Severity: P2

## TC-NOTIF-PUSH-023
- Pre: WS rate limit per user.
- Expected: Server limits WS connect attempts per minute; 429 / drop on abuse.
- Severity: P1

## TC-NOTIF-PUSH-024
- Pre: WS payload size.
- Expected: Capped at 64KB; large notifications truncated with "view more".
- Severity: P2

## TC-NOTIF-PUSH-025
- Pre: WS scaling.
- Expected: Multi-instance pubsub or broadcast (Redis or in-memory KV); user reaches own server consistently or gets pubsub from any.
- Severity: P1

## TC-NOTIF-PUSH-026
- Pre: WS during /admin/runtime restart.
- Expected: Connections drop briefly; auto-reconnect.
- Severity: P1

## TC-NOTIF-PUSH-027
- Pre: User on slow network.
- Expected: Backpressure handled; no overflow.
- Severity: P2

## TC-NOTIF-PUSH-028
- Pre: Verify ordering.
- Expected: Notifications arrive in DB-insert order to client; sequence_id per user.
- Severity: P2

## TC-NOTIF-PUSH-029
- Pre: User connects with stale cursor.
- Expected: Replays missed events; converges to live.
- Severity: P1

## TC-NOTIF-PUSH-030
- Pre: WS broadcast under MCP apps overlay.
- Expected: Doable WS works alongside MCP apps integrations; no port conflict.
- Severity: P2
