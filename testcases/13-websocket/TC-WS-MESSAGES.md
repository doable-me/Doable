# TC-WS-MESSAGES — WebSocket message types and payload edge cases

Covers: presence, chat, awareness, ai:typing, visual-edit:*, design-comment:*, plus malformed/oversized payloads.

---

## TC-WS-MSG-PRES-001 — `presence:update` with cursor data updates room
- **Severity:** smoke

## TC-WS-MSG-PRES-002 — `presence:update` without projectId state → ignored
- **Severity:** low

## TC-WS-MSG-PRES-003 — `presence:update` payload too large (>1MB) — server stable
- **Severity:** medium

## TC-WS-MSG-CURSOR-001 — `cursor:move` rebroadcast excludes sender by userId
- **Severity:** smoke

## TC-WS-MSG-CURSOR-002 — `cursor:move` flood rate-limited at 50ms per userId
- **Severity:** high

## TC-WS-MSG-CURSOR-003 — `cursor:move` with negative line/column accepted (no validation)
- **Severity:** low

## TC-WS-MSG-CURSOR-004 — `cursor:move` with extremely large line numbers (10^9) — no overflow
- **Severity:** low

## TC-WS-MSG-CURSOR-005 — `cursor:move` filePath field included in broadcast
- **Severity:** smoke

## TC-WS-MSG-AWARE-001 — `awareness:file_open` updates user's currentFile
- **Severity:** smoke

## TC-WS-MSG-AWARE-002 — `awareness:file_close` clears
- **Severity:** smoke

## TC-WS-MSG-AWARE-003 — `awareness:selection` broadcasts selection range
- **Severity:** medium

## TC-WS-MSG-AWARE-004 — `awareness:file_open` with empty filePath — accepted (no validation)
- **Severity:** low

## TC-WS-MSG-CHAT-001 — `chat:send` broadcasts to entire room including sender
- **Severity:** smoke

## TC-WS-MSG-CHAT-002 — `chat:send` persisted via API team-chat internal endpoint
- **Severity:** high

## TC-WS-MSG-CHAT-003 — `chat:send` failure to persist logs error but still broadcasts
- **Severity:** medium

## TC-WS-MSG-CHAT-004 — `chat:send` with mentions array
- **Severity:** medium

## TC-WS-MSG-CHAT-005 — `chat:send` with parentId (thread reply)
- **Severity:** medium

## TC-WS-MSG-CHAT-006 — `chat:send` with very long content (>10k chars)
- **Severity:** medium

## TC-WS-MSG-CHAT-007 — `chat:send` with HTML content sanitized on render
- **Severity:** high

## TC-WS-MSG-CHAT-008 — `chat:send` with XSS attempt (`<script>alert(1)</script>`) sanitized
- **Severity:** high

## TC-WS-MSG-CHAT-009 — `chat:send` with markdown rendered in receiver UI
- **Severity:** low

## TC-WS-MSG-CHAT-010 — `chat:send` includes UUID, timestamp, displayName
- **Severity:** smoke

## TC-WS-MSG-CHAT-011 — `chat:typing true/false` broadcast to room
- **Severity:** medium

## TC-WS-MSG-AITYPE-001 — `ai:typing` broadcast excluding sender
- **Severity:** medium

## TC-WS-MSG-AITYPE-002 — `ai:typing` shows isTyping toggle in UI
- **Severity:** low

## TC-WS-MSG-VE-SELECT-001 — `visual-edit:select` succeeds when no conflict
- **Severity:** smoke

## TC-WS-MSG-VE-SELECT-002 — Conflict: another user editing same selector → error response
- **Steps:** B already selected; A tries same.
- **Expected:** A receives `{type:"error",code:"VISUAL_EDIT_CONFLICT",message:"<otherName> is already editing this element"}`.
- **Severity:** high

## TC-WS-MSG-VE-SELECT-003 — Conflict resolution: A selects, B selects different → both succeed
- **Severity:** medium

## TC-WS-MSG-VE-DESELECT-001 — Deselect releases selection
- **Severity:** smoke

## TC-WS-MSG-VE-STYLE-001 — `visual-edit:style-change` broadcast (excluding self)
- **Severity:** smoke

## TC-WS-MSG-VE-TEXT-001 — `visual-edit:text-change` broadcast
- **Severity:** smoke

## TC-WS-MSG-VE-CURSOR-001 — `visual-edit:cursor-move` rate-limited at 50ms per user
- **Severity:** high

## TC-WS-MSG-VE-PREVIEW-001 — `visual-edit:preview-refresh` broadcast to others
- **Severity:** medium

## TC-WS-MSG-DESIGN-001 — `design-comment:add` broadcasts to room incl sender
- **Severity:** smoke

## TC-WS-MSG-DESIGN-002 — `design-comment:add` persisted via API design-comments internal
- **Severity:** high

## TC-WS-MSG-DESIGN-003 — `design-comment:resolve` broadcasts resolved event
- **Severity:** smoke

## TC-WS-MSG-DESIGN-004 — `design-comment:unresolve` broadcasts
- **Severity:** medium

## TC-WS-MSG-DESIGN-005 — `design-comment:delete` broadcasts
- **Severity:** medium

## TC-WS-MSG-DESIGN-006 — Comment with xPercent/yPercent for image-positioned comment
- **Severity:** medium

## TC-WS-MSG-DESIGN-007 — Comment with selector (DOM CSS selector)
- **Severity:** medium

## TC-WS-MSG-DESIGN-008 — Threaded reply (parentId set)
- **Severity:** medium

## TC-WS-MSG-DESIGN-009 — Comment with markdown content
- **Severity:** low

## TC-WS-MSG-DESIGN-010 — Comment with @mentions
- **Severity:** low

## TC-WS-MSG-MALFORMED-001 — Send invalid JSON → server replies error PARSE_ERROR
- **Severity:** medium

## TC-WS-MSG-MALFORMED-002 — Send valid JSON without `type` field → silently ignored
- **Severity:** low

## TC-WS-MSG-MALFORMED-003 — Send unknown `type` → no-op (default switch)
- **Severity:** low

## TC-WS-MSG-MALFORMED-004 — Send `type` as non-string → handled gracefully
- **Severity:** low

## TC-WS-MSG-MALFORMED-005 — Send circular JSON (impossible in transport) — N/A
- **Severity:** low

## TC-WS-MSG-MALFORMED-006 — Send 100MB payload — server enforces ws message size limit
- **Severity:** medium

## TC-WS-MSG-MALFORMED-007 — Send Buffer/binary frame instead of text — handled gracefully
- **Severity:** medium

## TC-WS-MSG-MALFORMED-008 — Rapid-fire 10000 messages/sec — server applies backpressure or drops
- **Severity:** medium

## TC-WS-MSG-MALFORMED-009 — Message with NUL bytes in strings — preserved
- **Severity:** low

## TC-WS-MSG-MALFORMED-010 — Message with deeply nested JSON (depth 100) — handled
- **Severity:** low
