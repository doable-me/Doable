# TC-EDITOR-YJS — Yjs CRDT collaboration

The WS server holds an authoritative Y.Doc per project (room). Clients send `yjs:update` (base64 Y.update binary), `yjs:sync-request` (initial state pull). Server merges and rebroadcasts. AI-side internal endpoint `/internal/yjs/write` writes through the CRDT and rebroadcasts under userId `__ai__`.

`project_files.yjs_update bytea` may persist the encoded doc state for cold-start sync.

These tests verify CRDT correctness, conflict resolution semantics ("last-write-wins per char position via Yjs"), large updates, malformed payloads, and the AI-write path.

---

## TC-YJS-001 — Single client connects, joins room, syncs initial state
- **Steps:** open WS with valid JWT, send `room:join projectId`. Then send `yjs:sync-request {filePath}`.
- **Expected:** receive `yjs:sync-response` with base64 doc state. Decoded, length > 0 if file content seeded.
- **Severity:** smoke

## TC-YJS-002 — Sync-request without filePath (full doc fallback)
- **Steps:** send `yjs:sync-request` without filePath.
- **Expected:** receive sync-response with full doc state (no filePath in response).
- **Severity:** medium

## TC-YJS-003 — Sync-request before room:join → silently dropped
- **Steps:** send sync-request as first message.
- **Expected:** no response (state.projectId is null guard).
- **Severity:** low

## TC-YJS-004 — Apply local update broadcasts to other clients
- **Steps:** client A and B both joined; A sends `yjs:update` containing insertion of "hi".
- **Expected:** B receives `yjs:update` with same data; B's local Y.Doc applies → text reads "hi".
- **Severity:** smoke

## TC-YJS-005 — Sender is excluded from rebroadcast
- **Steps:** A sends update; observe A's inbox.
- **Expected:** A does NOT receive its own broadcast (excludeUserId in `room.broadcast`).
- **Severity:** medium

## TC-YJS-006 — Concurrent inserts at same position merge correctly
- **Steps:** A and B simultaneously insert at position 5: A inserts "AAA", B inserts "BBB".
- **Expected:** all clients converge to identical state with both inserts present (e.g. "AAABBB" or "BBBAAA"; Yjs guarantees same order on all peers).
- **Severity:** high

## TC-YJS-007 — Concurrent inserts at different positions merge
- **Steps:** A inserts at line 10, B inserts at line 100.
- **Expected:** both inserts reflected on all clients.
- **Severity:** high

## TC-YJS-008 — Concurrent delete + insert overlapping range
- **Steps:** A deletes chars 5-10, B inserts "X" at position 7.
- **Expected:** Yjs convergence rule applied; document final text is identical on all clients.
- **Severity:** high

## TC-YJS-009 — Two-tab same user — both tabs see each other's edits
- **Steps:** open same project in 2 tabs of same browser (same userId).
- **Expected:** edits in tab1 appear in tab2 (rebroadcast since excludeUserId is per userId — tab2 with same userId is also excluded — file as design issue).
- **Severity:** high

## TC-YJS-010 — Two-tab same user — race fix verification
- **Notes:** code excludes by userId, so a second connection of same user does NOT receive the update. Document this — UI must apply locally.
- **Severity:** high

## TC-YJS-011 — Update with empty data string
- **Steps:** send `yjs:update {data:""}`.
- **Expected:** server logs error or no-op; no crash; span records exception if `applyYjsUpdate` throws.
- **Severity:** medium

## TC-YJS-012 — Update with malformed base64
- **Steps:** data="not!base64".
- **Expected:** `Buffer.from(...,"base64")` decodes loosely; if invalid Y update bytes, applyYjsUpdate throws → caught and logged. No broadcast.
- **Severity:** medium

## TC-YJS-013 — Update with truncated Y update bytes
- **Steps:** valid Y update truncated to first 5 bytes.
- **Expected:** apply throws; caught.
- **Severity:** medium

## TC-YJS-014 — Update with garbage random bytes
- **Severity:** medium

## TC-YJS-015 — Update >10MB (binary blob)
- **Steps:** craft an enormous Y update via heavy local edits.
- **Expected:** server processes or hits ws message size limit; response sane; no OOM.
- **Severity:** high

## TC-YJS-016 — Update for non-existent filePath (passes filePath but file doesn't exist)
- **Severity:** medium

## TC-YJS-017 — Sync-request for filePath that doesn't exist
- **Expected:** response with empty/initial state for that path; no crash.
- **Severity:** medium

## TC-YJS-018 — Sync-response received before any updates pushed
- **Severity:** low

## TC-YJS-019 — Late joiner receives full state via sync-request
- **Steps:** A joins, makes 100 edits. B joins later, sends sync-request.
- **Expected:** B's local doc converges to same content as A.
- **Severity:** high

## TC-YJS-020 — Disconnect mid-edit — pending updates don't get applied
- **Severity:** medium

## TC-YJS-021 — Reconnect after offline edits — local updates flushed and reconciled
- **Steps:** A goes offline (disable network), edits 5 lines, reconnects.
- **Expected:** edits delivered; B sees them; A converges.
- **Severity:** high

## TC-YJS-022 — Three-way concurrent edits converge
- **Steps:** A, B, C make different edits at same time.
- **Expected:** all three converge to identical state.
- **Severity:** high

## TC-YJS-023 — Yjs persistence: server doc persists across WS server restart
- **Steps:** edits made → restart WS server → new client joins → state intact.
- **Expected:** Document — depends on persistence backend. If `project_files.yjs_update` writes happen, state survives. Otherwise lost.
- **Severity:** high

## TC-YJS-024 — Multi-file in single project (per-file Y.Doc)
- **Steps:** edit file A and file B simultaneously.
- **Expected:** updates with `filePath` route to correct sub-doc; cross-talk impossible.
- **Severity:** high

## TC-YJS-025 — Awareness/presence cursor moves not mixed into Y updates
- **Severity:** medium

## TC-YJS-026 — Internal AI write through CRDT broadcasts under userId="__ai__"
- **Steps:** API hits `/internal/yjs/write` with `{operation:"write",content,filePath}`.
- **Expected:** WS sees broadcast `yjs:update` with `userId:"__ai__"`; clients apply.
- **Severity:** high

## TC-YJS-027 — Internal AI write requires INTERNAL_SECRET
- **Steps:** POST without header.
- **Expected:** 403.
- **Severity:** high

## TC-YJS-028 — AI write when room is empty → handled:false (API writes directly to DB)
- **Steps:** no clients in room.
- **Expected:** response `{handled:false}`.
- **Severity:** high

## TC-YJS-029 — AI edit (find/replace) operation
- **Steps:** POST `{operation:"edit",oldString:"foo",newString:"bar",filePath}`.
- **Expected:** edit applied through CRDT; broadcast.
- **Severity:** high

## TC-YJS-030 — AI edit with replaceAll=true
- **Severity:** medium

## TC-YJS-031 — AI edit when oldString not present in file → result.success=false
- **Severity:** medium

## TC-YJS-032 — AI write without filePath → 400 invalid operation
- **Severity:** low

## TC-YJS-033 — AI write with content undefined and operation=write → 400
- **Severity:** low

## TC-YJS-034 — Update broadcast to room with 50 clients fan-out
- **Steps:** stress test.
- **Expected:** all 50 receive within 200ms.
- **Severity:** medium

## TC-YJS-035 — Heavy throughput: 100 updates/sec sustained
- **Severity:** medium

## TC-YJS-036 — Update message larger than ws default buffer (16MB) rejected
- **Severity:** medium

## TC-YJS-037 — Two clients editing different files simultaneously — no interference
- **Severity:** high

## TC-YJS-038 — Yjs update with malicious payload attempting to inject JS
- **Notes:** Y updates are binary; payload should be sanitised on render.
- **Severity:** high

## TC-YJS-039 — Joining same room after `room:leave` re-syncs state
- **Severity:** medium

## TC-YJS-040 — Update applied even when local clock skew is large (Yjs uses lamport-like clocks, not wall-clock)
- **Severity:** low

## TC-YJS-041 — File rename via CRDT or via REST? Document.
- **Severity:** medium

## TC-YJS-042 — Delete file while peer is editing — peer sees error or graceful close
- **Severity:** high

## TC-YJS-043 — Conflict between AI edit (`__ai__`) and human edit — same line both edited
- **Steps:** AI writes "v1" at line 5, human types "v2" at line 5 within 100ms.
- **Expected:** convergence on both clients; final state contains merged Y representation.
- **Severity:** high

## TC-YJS-044 — Undo/redo via Yjs UndoManager — local-only or shared?
- **Severity:** medium

## TC-YJS-045 — Tab-close mid-broadcast — no client crash
- **Severity:** low

## TC-YJS-046 — Idle 5min then send update — connection still alive (heartbeat)
- **Severity:** medium

## TC-YJS-047 — Update arrives before sync-response on same connection
- **Severity:** medium

## TC-YJS-048 — Sync-response is base64; verify decoded bytes round-trip Y.applyUpdate
- **Severity:** smoke

## TC-YJS-049 — Network blip during update — single message loss handled (Yjs is missing-update tolerant)
- **Severity:** medium

## TC-YJS-050 — Cross-room broadcast isolation: project A's update never seen in project B
- **Steps:** clients in two rooms; send update in A.
- **Expected:** B receives nothing.
- **Severity:** high
