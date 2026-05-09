# TC-AI-CHAT-SEND — Send chat messages

Covers POST `/chat/:sessionId/messages` and `/chat/sessions/:id/messages` flows: request validation, persistence into `ai_messages`, streaming SSE start/heartbeat/done, abort/retry, concurrency, idempotency, and rate limiting.

## TC-AI-CHAT-SEND-001 — Send first message in agent mode (smoke)
- **Pre:** authenticated as qa-owner; project exists; credits ≥1; session created via POST /chat/sessions
- **Steps:** POST `/chat/:sessionId/messages` body `{content:"hello", mode:"agent"}`
- **Expected:** HTTP 200 with `Content-Type: text/event-stream`; user message row inserted in `ai_messages`; assistant row appended after stream completion; 1 credit deducted in `credit_transactions`; `ai_usage_log` row written
- **Severity:** smoke

## TC-AI-CHAT-SEND-002 — Send first message in plan mode (smoke)
- **Pre:** authenticated; session in plan mode; credits ≥1
- **Steps:** POST message with `mode:"plan"`
- **Expected:** SSE stream emits plan markdown without tool execution; `ai_messages.metadata.mode = "plan"`; credit deducted
- **Severity:** smoke

## TC-AI-CHAT-SEND-003 — Send first message in chat mode (smoke)
- **Pre:** authenticated; session in chat mode; credits ≥1
- **Steps:** POST `{content:"explain monads", mode:"chat"}`
- **Expected:** SSE stream completes with assistant text only; no tool events emitted; metadata mode persisted as "chat"
- **Severity:** smoke

## TC-AI-CHAT-SEND-004 — Empty content rejected
- **Pre:** authenticated session
- **Steps:** POST `{content:"", mode:"agent"}`
- **Expected:** HTTP 400 with validation error; nothing inserted in `ai_messages`; credits unchanged
- **Severity:** high

## TC-AI-CHAT-SEND-005 — Whitespace-only content rejected
- **Steps:** POST `{content:"   \n\t  "}`
- **Expected:** HTTP 400; no DB writes
- **Severity:** medium

## TC-AI-CHAT-SEND-006 — Content exceeding max length truncated/rejected
- **Steps:** POST 200,001-char content
- **Expected:** HTTP 413 or 400 with maxLength error; no credit deducted
- **Severity:** high

## TC-AI-CHAT-SEND-007 — Missing mode defaults to agent
- **Steps:** POST without `mode` field
- **Expected:** Stream proceeds in agent mode; assistant row metadata.mode = "agent"
- **Severity:** medium

## TC-AI-CHAT-SEND-008 — Invalid mode rejected
- **Steps:** POST `{mode:"foobar"}`
- **Expected:** HTTP 400 with enum validation message
- **Severity:** medium

## TC-AI-CHAT-SEND-009 — Missing sessionId param
- **Steps:** POST `/chat//messages`
- **Expected:** HTTP 404 routing error
- **Severity:** low

## TC-AI-CHAT-SEND-010 — Non-existent sessionId
- **Steps:** POST `/chat/00000000-0000-0000-0000-000000000000/messages`
- **Expected:** HTTP 404; no DB writes
- **Severity:** high

## TC-AI-CHAT-SEND-011 — Cross-tenant sessionId access blocked
- **Pre:** session belongs to other workspace
- **Steps:** POST as user without membership
- **Expected:** HTTP 403/404; no message inserted; audit log records denied attempt
- **Severity:** critical

## TC-AI-CHAT-SEND-012 — Unauthenticated request rejected
- **Steps:** POST without cookie/JWT
- **Expected:** HTTP 401; no DB writes
- **Severity:** critical

## TC-AI-CHAT-SEND-013 — Expired session token
- **Pre:** auth token TTL elapsed
- **Steps:** POST with stale cookie
- **Expected:** HTTP 401; refresh prompt on client
- **Severity:** high

## TC-AI-CHAT-SEND-014 — SSE Content-Type set correctly
- **Steps:** Inspect response headers
- **Expected:** `Content-Type: text/event-stream`; `Cache-Control: no-cache, no-transform`; `Connection: keep-alive`
- **Severity:** high

## TC-AI-CHAT-SEND-015 — SSE event sequence start → delta → tool_start → tool_end → done
- **Pre:** prompt that triggers a tool call (e.g. "list project files")
- **Steps:** consume stream
- **Expected:** Events emitted in order: `session_start`, multiple `delta`, `tool_start`, `tool_end`, `done`; no `error`
- **Severity:** smoke

## TC-AI-CHAT-SEND-016 — SSE heartbeat keeps stream alive
- **Pre:** long-running tool (~30s)
- **Steps:** monitor stream
- **Expected:** heartbeat/comment lines every ≤15s; stream not closed by upstream proxy
- **Severity:** medium

## TC-AI-CHAT-SEND-017 — SSE final `done` payload contains usage and message id
- **Steps:** parse final event
- **Expected:** `done` event JSON has `messageId`, `creditsUsed:1`, `tokenUsage` totals
- **Severity:** high

## TC-AI-CHAT-SEND-018 — Client abort closes stream cleanly
- **Steps:** AbortController.abort() at 1s
- **Expected:** server logs cancel; partial assistant message stored with `status:"aborted"`; credit refund OR not deducted (per policy)
- **Severity:** high

## TC-AI-CHAT-SEND-019 — Network drop mid-stream
- **Steps:** kill TCP connection at 50% completion
- **Expected:** server detects disconnect; partial message persisted with truncated flag; no zombie generation continues beyond grace period
- **Severity:** high

## TC-AI-CHAT-SEND-020 — Retry on streaming abort uses idempotency key
- **Pre:** original request had `Idempotency-Key: k1`; aborted at 50%
- **Steps:** repost with same key
- **Expected:** server resumes or returns prior partial; no duplicate user message; credits not double-charged
- **Severity:** high

## TC-AI-CHAT-SEND-021 — Repeat send without idempotency key creates new turn
- **Steps:** POST same content twice without key
- **Expected:** two distinct user message rows; two credit deductions
- **Severity:** medium

## TC-AI-CHAT-SEND-022 — Concurrent sends in same session serialized
- **Steps:** parallel POST x3 to same sessionId
- **Expected:** processed sequentially OR returns 409 for in-flight; conversation order preserved by `created_at`
- **Severity:** high

## TC-AI-CHAT-SEND-023 — Concurrent sends across two sessions parallelized
- **Steps:** POST to sessionA and sessionB simultaneously
- **Expected:** both stream concurrently; no cross-talk in events; both credit-deducted
- **Severity:** medium

## TC-AI-CHAT-SEND-024 — Send with attachments array
- **Pre:** uploaded attachment id `att_123`
- **Steps:** POST `{content:"summarize", attachments:["att_123"]}`
- **Expected:** assistant references doc; `ai_messages.attachments` jsonb populated
- **Severity:** high

## TC-AI-CHAT-SEND-025 — Send with invalid attachment id
- **Steps:** POST with `attachments:["bogus"]`
- **Expected:** HTTP 400; error references unknown attachment; no credit deduction
- **Severity:** medium

## TC-AI-CHAT-SEND-026 — Send with attachment owned by another user
- **Steps:** reference foreign attachment id
- **Expected:** HTTP 403; access denied
- **Severity:** critical

## TC-AI-CHAT-SEND-027 — Streaming response saved on backend close
- **Pre:** server restart mid-stream simulated
- **Steps:** kill -HUP api process during stream
- **Expected:** in-flight assistant row finalized as truncated on next boot recovery; client receives error event
- **Severity:** medium

## TC-AI-CHAT-SEND-028 — Send when session locked by another agent
- **Pre:** session marked `locked=true` by background agent
- **Steps:** POST a message
- **Expected:** HTTP 423 or queued; client sees informative error
- **Severity:** medium

## TC-AI-CHAT-SEND-029 — Send to deleted session
- **Pre:** session soft-deleted
- **Steps:** POST message
- **Expected:** HTTP 410 Gone or 404
- **Severity:** medium

## TC-AI-CHAT-SEND-030 — Send to archived session
- **Pre:** session archived
- **Steps:** POST message
- **Expected:** HTTP 200 (unarchive on send) OR 409 with explicit error per product spec
- **Severity:** low

## TC-AI-CHAT-SEND-031 — Rate limit per user (free plan)
- **Pre:** free plan; 30 messages in last minute
- **Steps:** POST 31st message
- **Expected:** HTTP 429 with `Retry-After`; no credit deducted
- **Severity:** high

## TC-AI-CHAT-SEND-032 — Rate limit per workspace bypassed for owner-of-many
- **Steps:** spam from owner across 5 sessions
- **Expected:** workspace-wide cap applies; 429 once cap hit
- **Severity:** medium

## TC-AI-CHAT-SEND-033 — XSS in content stored escaped
- **Steps:** POST `{content:"<script>alert(1)</script>"}`
- **Expected:** stored verbatim; rendered escaped in UI; no DOM execution in chat panel
- **Severity:** critical

## TC-AI-CHAT-SEND-034 — SQL injection in content harmless
- **Steps:** POST `{content:"'; DROP TABLE ai_messages;--"}`
- **Expected:** stored as text; no SQL impact (parameterized query)
- **Severity:** critical

## TC-AI-CHAT-SEND-035 — Unicode emoji content preserved
- **Steps:** POST content with multi-byte emoji + RTL marker
- **Expected:** stored byte-identical; rendered correctly; token count includes them
- **Severity:** low

## TC-AI-CHAT-SEND-036 — Server returns clientMessageId echo
- **Steps:** POST with `clientMessageId:"c1"`
- **Expected:** SSE `session_start` event echoes `clientMessageId`; stored on user row
- **Severity:** medium

## TC-AI-CHAT-SEND-037 — Send when api process can't reach Copilot CLI
- **Pre:** Copilot CLI binary missing/timeout
- **Steps:** POST agent message
- **Expected:** HTTP 502 or SSE `error` event; user message rolled back; credit refunded
- **Severity:** high

## TC-AI-CHAT-SEND-038 — Send when DB write fails after credit deduction
- **Pre:** simulate insert error after credits.deduct()
- **Steps:** POST message; observe transaction
- **Expected:** credit deduction rolled back via outbox/compensation; no orphan deduction
- **Severity:** high

## TC-AI-CHAT-SEND-039 — Long prompt exceeding model context window
- **Steps:** POST 500k tokens
- **Expected:** HTTP 400 OR provider error surfaced cleanly; no infinite loop
- **Severity:** medium

## TC-AI-CHAT-SEND-040 — Send returns x-request-id correlation header
- **Steps:** read response header
- **Expected:** `x-request-id` populated and matches log correlation
- **Severity:** medium

## TC-AI-CHAT-SEND-041 — Trailing newline preserved in content
- **Steps:** POST content ending with `\n\n`
- **Expected:** stored exactly; markdown render unchanged
- **Severity:** low

## TC-AI-CHAT-SEND-042 — Content with markdown code fences
- **Steps:** POST triple-fenced code block
- **Expected:** stored verbatim; assistant response references fenced code unchanged
- **Severity:** low

## TC-AI-CHAT-SEND-043 — Send disables when project credit-locked
- **Pre:** workspace billing past_due
- **Steps:** POST message
- **Expected:** HTTP 402 with `billing_required` reason
- **Severity:** high

## TC-AI-CHAT-SEND-044 — Idempotency-Key replay returns prior result
- **Steps:** POST same key twice; second after first completes
- **Expected:** second returns cached final SSE in JSON form OR replays stored final; no duplicate row
- **Severity:** high

## TC-AI-CHAT-SEND-045 — Send while WS layer is down still works (HTTP only)
- **Pre:** WS server stopped
- **Steps:** POST message via REST
- **Expected:** SSE stream still works; client warned no realtime presence
- **Severity:** medium

## TC-AI-CHAT-SEND-046 — Validate Content-Length on chunked POSTs
- **Steps:** POST with mismatched length
- **Expected:** HTTP 400 or 411
- **Severity:** low

## TC-AI-CHAT-SEND-047 — CORS preflight allowed for chat origin
- **Steps:** OPTIONS to /chat/:id/messages from web origin
- **Expected:** 204 with permitted methods/headers
- **Severity:** medium

## TC-AI-CHAT-SEND-048 — CSRF token enforced if cookie auth
- **Steps:** POST without CSRF header
- **Expected:** HTTP 403; with valid token, 200
- **Severity:** high

## TC-AI-CHAT-SEND-049 — Audit log entry written
- **Steps:** POST message; query audit log
- **Expected:** row in `audit_log` (or `ai_usage_log`) with userId, sessionId, ts
- **Severity:** medium

## TC-AI-CHAT-SEND-050 — User edit then resend produces new turn
- **Steps:** PATCH last user message, then POST resend
- **Expected:** old turn marked superseded; new turn streams; both visible in history with edit indicator
- **Severity:** medium
