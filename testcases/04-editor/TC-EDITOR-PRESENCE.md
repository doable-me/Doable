# TC-EDITOR-PRESENCE — Presence indicators (cursor, selection, file open)

WS messages relevant:
- `presence:update` — sets presence blob {userId, displayName, cursor, selection}
- `awareness:file_open` / `awareness:file_close` — track which file user is viewing
- `awareness:selection` — broadcast selection range
- `cursor:move` — broadcast cursor position with rate limit (≥50ms between cursor:moves per user)

Server keeps in-memory rooms. `getPresenceUsers` returns current snapshot. REST fallback at `GET /internal/presence/<projectId>`.

---

## TC-PRES-001 — Single user joins → presence list contains self
- **Steps:** WS connect, room:join.
- **Expected:** server sends `room:joined {members}` containing self.
- **Severity:** smoke

## TC-PRES-002 — Two users join → both see each other in members
- **Severity:** smoke

## TC-PRES-003 — User leaves → other peer sees presence-out broadcast
- **Severity:** high

## TC-PRES-004 — Presence update broadcasts cursor position
- **Steps:** A sends `presence:update {data:{cursor:{file,line,col}}}`.
- **Expected:** B receives update.
- **Severity:** smoke

## TC-PRES-005 — Display name shown matches JWT's display_name claim
- **Severity:** medium

## TC-PRES-006 — Display name falls back to email prefix when not in JWT
- **Severity:** medium

## TC-PRES-007 — User color deterministic by userId (`userColor`)
- **Steps:** same userId across sessions.
- **Expected:** same color hex.
- **Severity:** medium

## TC-PRES-008 — User color stable across reconnects
- **Severity:** medium

## TC-PRES-009 — User colors distinct (collision-resistant) for 10 random userIds
- **Severity:** low

## TC-PRES-010 — Cursor move broadcasts to room, excluding sender
- **Severity:** smoke

## TC-PRES-011 — Cursor move includes filePath, line, column
- **Severity:** smoke

## TC-PRES-012 — Cursor move rate-limited at server: ≥50ms gap
- **Steps:** flood `cursor:move` 100/s.
- **Expected:** server rebroadcasts at most one per 50ms per userId.
- **Severity:** high

## TC-PRES-013 — Cursor move per user independent (rate-limit not global)
- **Severity:** medium

## TC-PRES-014 — Awareness:file_open updates user's currentFile
- **Steps:** A sends file_open "src/index.ts".
- **Expected:** room presence shows A on that file.
- **Severity:** medium

## TC-PRES-015 — Awareness:file_close clears user's currentFile
- **Severity:** medium

## TC-PRES-016 — Awareness:selection broadcasts selection range
- **Severity:** medium

## TC-PRES-017 — Selection cleared when user types or deselects
- **Severity:** low

## TC-PRES-018 — Multi-tab same userId — both tabs counted? Or deduped?
- **Steps:** open 2 WS connections same JWT; observe `members`.
- **Expected:** Document — current code uses `room.join` with userId; need to check whether duplicate joins create dup members.
- **Severity:** high

## TC-PRES-019 — Multi-tab same user — leaves on one tab don't kick the other
- **Severity:** high

## TC-PRES-020 — Disconnect → presence cleaned up after grace period
- **Notes:** Room.onEmpty triggers grace; verify ghost cursor disappears.
- **Severity:** high

## TC-PRES-021 — Ghost cursors: abrupt close (kill connection) → presence eventually purged
- **Severity:** high

## TC-PRES-022 — Heartbeat keeps presence alive
- **Steps:** send heartbeat every 25s.
- **Expected:** room.heartbeat invoked; presence not GC'd.
- **Severity:** medium

## TC-PRES-023 — No heartbeat for >60s → presence removed
- **Severity:** high

## TC-PRES-024 — REST fallback returns same presence list as WS broadcasts
- **Steps:** `GET /internal/presence/:projectId`.
- **Expected:** users array matches in-memory.
- **Severity:** medium

## TC-PRES-025 — REST fallback for empty room → []
- **Severity:** low

## TC-PRES-026 — REST fallback for unknown projectId → []
- **Severity:** low

## TC-PRES-027 — Presence persists during yjs:sync-request (no race)
- **Severity:** medium

## TC-PRES-028 — Switching files preserves presence membership
- **Severity:** medium

## TC-PRES-029 — Cursor move includes userColor on broadcast
- **Severity:** smoke

## TC-PRES-030 — Cursor move filtered when project mismatches state.projectId
- **Severity:** low

## TC-PRES-031 — `room:join` with new projectId leaves previous room
- **Steps:** join project A, then join project B.
- **Expected:** A's presence list no longer contains caller; B's includes caller.
- **Severity:** high

## TC-PRES-032 — Presence broadcasts filtered by room
- **Steps:** A is in projectA; B is in projectB; A sends cursor move.
- **Expected:** B does NOT receive A's cursor.
- **Severity:** high

## TC-PRES-033 — User name with emoji, RTL, unicode preserved in presence
- **Severity:** low

## TC-PRES-034 — Selection range valid for empty file (line 1 col 1)
- **Severity:** low

## TC-PRES-035 — Selection multi-line range broadcasts correctly
- **Severity:** medium

## TC-PRES-036 — Stress: 20 concurrent users in one room — all see each other
- **Severity:** medium

## TC-PRES-037 — Stress: 100 cursor moves / sec across 20 users — server stable
- **Severity:** medium

## TC-PRES-038 — Reconnect resends `room:join` and replays presence
- **Severity:** high

## TC-PRES-039 — `connected` event sent before any room:joined
- **Steps:** observe connection sequence.
- **Expected:** first `connected {userId,resumeToken}` then later `room:joined`.
- **Severity:** medium

## TC-PRES-040 — `room:leave` removes from members list
- **Severity:** medium
