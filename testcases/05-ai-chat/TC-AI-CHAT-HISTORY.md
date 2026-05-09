# TC-AI-CHAT-HISTORY — Chat history, pagination, delete, export

Covers GET /chat/sessions, GET /chat/:id/messages, pagination, delete session, export session, message editing, search.

## TC-AI-CHAT-HISTORY-001 — List sessions returns recent sessions (smoke)
- **Steps:** GET /chat/sessions
- **Expected:** 200; array sorted by updated_at desc; includes title, mode, lastMessagePreview
- **Severity:** smoke

## TC-AI-CHAT-HISTORY-002 — List sessions paginated by cursor
- **Pre:** 100 sessions
- **Steps:** GET /chat/sessions?limit=20
- **Expected:** 20 returned + nextCursor token; subsequent calls advance
- **Severity:** high

## TC-AI-CHAT-HISTORY-003 — List sessions filter by projectId
- **Steps:** ?projectId=p1
- **Expected:** only project-bound sessions
- **Severity:** medium

## TC-AI-CHAT-HISTORY-004 — List sessions filter by mode
- **Steps:** ?mode=plan
- **Expected:** only plan sessions
- **Severity:** medium

## TC-AI-CHAT-HISTORY-005 — Cross-tenant sessions hidden
- **Steps:** call as user not in workspace
- **Expected:** empty array (or only own)
- **Severity:** critical

## TC-AI-CHAT-HISTORY-006 — Get messages of session
- **Steps:** GET /chat/:id/messages?limit=50
- **Expected:** ordered ascending by created_at; cursor for older
- **Severity:** smoke

## TC-AI-CHAT-HISTORY-007 — Pagination older messages
- **Steps:** beforeCursor=
- **Expected:** older N returned; works to first message
- **Severity:** high

## TC-AI-CHAT-HISTORY-008 — Pagination at start returns nextCursor=null
- **Steps:** request beyond first
- **Expected:** empty + null cursor
- **Severity:** low

## TC-AI-CHAT-HISTORY-009 — Message contains role, content, ts, metadata
- **Steps:** inspect a row
- **Expected:** schema includes role, content, createdAt, metadata{mode,toolCalls?,attachments?}
- **Severity:** medium

## TC-AI-CHAT-HISTORY-010 — Tool call entries included as structured objects
- **Expected:** assistant message has toolCalls array with name, args, result
- **Severity:** medium

## TC-AI-CHAT-HISTORY-011 — Aborted assistant messages tagged
- **Expected:** metadata.status=aborted
- **Severity:** medium

## TC-AI-CHAT-HISTORY-012 — Edit user message via PATCH
- **Steps:** PATCH /chat/messages/:id with new content
- **Expected:** original archived; new revision visible; superseded message marked
- **Severity:** high

## TC-AI-CHAT-HISTORY-013 — Edit message after assistant replied creates branch (if supported)
- **Expected:** spec-defined behavior: branch tree or strict superseding; consistent
- **Severity:** medium

## TC-AI-CHAT-HISTORY-014 — Delete single message
- **Steps:** DELETE /chat/messages/:id
- **Expected:** soft-delete; subsequent fetches exclude unless ?includeDeleted=true (admin)
- **Severity:** medium

## TC-AI-CHAT-HISTORY-015 — Delete message cascades to assistant reply (per spec)
- **Expected:** matches product spec; documented
- **Severity:** medium

## TC-AI-CHAT-HISTORY-016 — Delete entire session
- **Steps:** DELETE /chat/sessions/:id
- **Expected:** 204; sessions list excludes; messages soft-deleted; attachments retained per policy
- **Severity:** smoke

## TC-AI-CHAT-HISTORY-017 — Delete session cross-tenant denied
- **Steps:** delete as foreign user
- **Expected:** 403/404
- **Severity:** critical

## TC-AI-CHAT-HISTORY-018 — Delete session emits realtime event
- **Steps:** WS subscriber observes
- **Expected:** session.deleted event for workspace
- **Severity:** low

## TC-AI-CHAT-HISTORY-019 — Restore deleted session within retention window
- **Steps:** POST /chat/sessions/:id/restore
- **Expected:** session returns; messages back; outside window 410
- **Severity:** medium

## TC-AI-CHAT-HISTORY-020 — Hard delete after retention window
- **Pre:** retention=30d
- **Expected:** purged from DB and storage; not restorable
- **Severity:** medium

## TC-AI-CHAT-HISTORY-021 — Export session JSON
- **Steps:** GET /chat/sessions/:id/export?format=json
- **Expected:** 200; JSON with session, messages, attachments metadata
- **Severity:** smoke

## TC-AI-CHAT-HISTORY-022 — Export session markdown
- **Steps:** ?format=markdown
- **Expected:** human-readable .md with role headers
- **Severity:** medium

## TC-AI-CHAT-HISTORY-023 — Export attaches file references not bodies
- **Expected:** export references attachment ids; option includeAttachments=true bundles zip
- **Severity:** medium

## TC-AI-CHAT-HISTORY-024 — Export zip includes pdf/csv files
- **Steps:** ?format=zip&includeAttachments=true
- **Expected:** zip with chat.json + attachments folder
- **Severity:** medium

## TC-AI-CHAT-HISTORY-025 — Export rate limited
- **Pre:** 5 export/min cap
- **Expected:** 429 after cap
- **Severity:** low

## TC-AI-CHAT-HISTORY-026 — Search across sessions
- **Steps:** GET /chat/search?q=login
- **Expected:** results with snippet + sessionId; ranked
- **Severity:** medium

## TC-AI-CHAT-HISTORY-027 — Search scope limited to workspace
- **Steps:** search includes only workspace data
- **Severity:** critical

## TC-AI-CHAT-HISTORY-028 — Search performance < 1s for 10k messages
- **Severity:** medium

## TC-AI-CHAT-HISTORY-029 — Sessions list sorted toggle (recent vs name)
- **Steps:** ?sort=name
- **Expected:** alphabetical
- **Severity:** low

## TC-AI-CHAT-HISTORY-030 — Pin session
- **Steps:** POST /chat/sessions/:id/pin
- **Expected:** pinned flag; sorted top
- **Severity:** low

## TC-AI-CHAT-HISTORY-031 — Rename session
- **Steps:** PATCH /chat/sessions/:id {title:"X"}
- **Expected:** updated; visible in list
- **Severity:** smoke

## TC-AI-CHAT-HISTORY-032 — Auto-title generated from first message
- **Pre:** title not set
- **Steps:** send first message
- **Expected:** title derived from content; saved on session
- **Severity:** medium

## TC-AI-CHAT-HISTORY-033 — Auto-title not regenerated on subsequent messages
- **Severity:** low

## TC-AI-CHAT-HISTORY-034 — Title length capped
- **Steps:** PATCH title length 1000
- **Expected:** truncated to maxLength (e.g. 200)
- **Severity:** low

## TC-AI-CHAT-HISTORY-035 — XSS in title escaped
- **Steps:** title `<script>`
- **Expected:** rendered escaped
- **Severity:** critical

## TC-AI-CHAT-HISTORY-036 — Move session to different project
- **Steps:** PATCH {projectId:"p2"}
- **Expected:** moved; appears in new project
- **Severity:** medium

## TC-AI-CHAT-HISTORY-037 — Sessions list highlights active stream
- **Steps:** open editor while another tab streaming
- **Expected:** indicator on session
- **Severity:** low

## TC-AI-CHAT-HISTORY-038 — Bulk delete sessions
- **Steps:** POST /chat/sessions/bulk-delete with ids
- **Expected:** all deleted; partial failures reported
- **Severity:** medium

## TC-AI-CHAT-HISTORY-039 — Concurrent rename last-write-wins
- **Steps:** two PATCHes simultaneously
- **Expected:** server resolves deterministically; client sees final
- **Severity:** low

## TC-AI-CHAT-HISTORY-040 — History export includes mode and tokenUsage
- **Severity:** medium

## TC-AI-CHAT-HISTORY-041 — History export does not include env var values
- **Severity:** critical

## TC-AI-CHAT-HISTORY-042 — Empty session export valid
- **Pre:** no messages
- **Expected:** valid JSON with empty messages array
- **Severity:** low

## TC-AI-CHAT-HISTORY-043 — Pagination boundary off-by-one
- **Pre:** exactly 50 messages, limit 50
- **Expected:** all returned; nextCursor null
- **Severity:** medium

## TC-AI-CHAT-HISTORY-044 — Stream message visible to history immediately on done
- **Steps:** finish stream; refresh
- **Expected:** present
- **Severity:** smoke

## TC-AI-CHAT-HISTORY-045 — In-flight message tagged status=streaming during fetch
- **Severity:** low
