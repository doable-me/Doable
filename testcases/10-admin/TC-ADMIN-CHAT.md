# TC-ADMIN-CHAT — Browse All AI Sessions

Scope: `/admin/chat` lists all `ai_sessions` across users; per-session drill into messages and tool events. Tables: `ai_sessions`, `chat_traces`.

---

## TC-ADMIN-CHAT-001
- Pre: Admin; ai_sessions populated.
- Steps: GET `/admin/chat`.
- Expected: List of sessions with columns: User, Project, Started, Last activity, Messages count, Cost (USD), Status.
- Severity: P0

## TC-ADMIN-CHAT-002
- Pre: Non-admin.
- Steps: GET `/admin/chat`.
- Expected: 403.
- Severity: P0

## TC-ADMIN-CHAT-003
- Pre: Admin.
- Steps: Filter by user email.
- Expected: Sessions for that user only.
- Severity: P0

## TC-ADMIN-CHAT-004
- Pre: Admin.
- Steps: Filter by project_id.
- Expected: Sessions for that project only.
- Severity: P1

## TC-ADMIN-CHAT-005
- Pre: Admin.
- Steps: Filter by date range.
- Expected: Honored.
- Severity: P1

## TC-ADMIN-CHAT-006
- Pre: Admin.
- Steps: Sort by Cost DESC.
- Expected: Most expensive sessions first.
- Severity: P1

## TC-ADMIN-CHAT-007
- Pre: Admin.
- Steps: Click a session.
- Expected: Drills into `/admin/chat/:sessionId` showing messages timeline, tool calls, model/version used, total cost, retry events.
- Severity: P0

## TC-ADMIN-CHAT-008
- Pre: Admin viewing session detail.
- Steps: Verify content redaction.
- Expected: Sensitive fields like API keys, OAuth tokens, private project content marked redacted; admins see metadata only OR have explicit "View content" gated by reason.
- Severity: P0

## TC-ADMIN-CHAT-009
- Pre: Admin viewing session.
- Steps: Click "View full content" button.
- Expected: Modal asks for reason; on submit, admin_audit_log records `chat_content_view` with reason; content unredacted.
- Severity: P0

## TC-ADMIN-CHAT-010
- Pre: Admin.
- Steps: Search free text in messages.
- Expected: Full-text or trigram search; matches highlighted; rate-limited.
- Severity: P1

## TC-ADMIN-CHAT-011
- Pre: Admin viewing session with stream=in_progress.
- Expected: Session shown as live; "in progress" badge; refresh to see updates.
- Severity: P2

## TC-ADMIN-CHAT-012
- Pre: Admin.
- Steps: Click "Cancel session" (if exposed).
- Expected: Confirmation; on accept, session marked aborted; user notified; audit row.
- Severity: P1

## TC-ADMIN-CHAT-013
- Pre: Admin.
- Steps: Filter by model=claude-opus-4-7.
- Expected: Only sessions using that model.
- Severity: P2

## TC-ADMIN-CHAT-014
- Pre: Admin.
- Steps: Filter by status=error.
- Expected: Sessions that ended with error; error message visible in detail.
- Severity: P1

## TC-ADMIN-CHAT-015
- Pre: Admin.
- Steps: Compute cost summary for filtered range.
- Expected: Totals match sum of session costs; currency=USD; precision 2 decimals.
- Severity: P2

## TC-ADMIN-CHAT-016
- Pre: Admin.
- Steps: Inspect chat_traces linkage.
- Expected: Each session links to chat_traces; click "View OTel trace" jumps to /admin/trace/:traceId.
- Severity: P1

## TC-ADMIN-CHAT-017
- Pre: Admin browses session whose user has been deleted.
- Expected: User column "(deleted)"; session metadata still visible.
- Severity: P1

## TC-ADMIN-CHAT-018
- Pre: Admin.
- Steps: Pagination with 10k sessions.
- Expected: Pages quickly; index on (user_id, started_at) used.
- Severity: P1

## TC-ADMIN-CHAT-019
- Pre: Admin.
- Steps: Try DELETE /admin/chat/:id.
- Expected: Either 405 or admin-with-reason flow; deletes leave audit trail.
- Severity: P1

## TC-ADMIN-CHAT-020
- Pre: Admin.
- Steps: Detail page shows tool_use events list.
- Expected: Each tool call has name, args (redacted if sensitive), result_status, duration_ms.
- Severity: P1

## TC-ADMIN-CHAT-021
- Pre: Admin.
- Steps: Click message → "Mark for review".
- Expected: Adds to moderation/review queue (if integrated).
- Severity: P2

## TC-ADMIN-CHAT-022
- Pre: Admin.
- Steps: Filter by has_tool_error=true.
- Expected: Only sessions where tools failed.
- Severity: P2

## TC-ADMIN-CHAT-023
- Pre: Admin.
- Steps: Verify cost computation precision.
- Expected: Tokens × price/token rounded to 6 decimals internally; displayed 2 decimals.
- Severity: P2

## TC-ADMIN-CHAT-024
- Pre: Admin viewing session.
- Steps: Inspect HTML for XSS via user prompt.
- Expected: All content escaped; `<script>` rendered literally.
- Severity: P0

## TC-ADMIN-CHAT-025
- Pre: Admin.
- Steps: Try cross-tenant access by editing session_id in URL.
- Expected: Admin can view all (intentional). Non-admin attempting same: 403.
- Severity: P0

## TC-ADMIN-CHAT-026
- Pre: Admin.
- Steps: Inspect rate limit on `/admin/chat/search?q=...`.
- Expected: Throttled to N req/min per admin; 429 beyond.
- Severity: P2

## TC-ADMIN-CHAT-027
- Pre: Admin views session that was migrated from old schema.
- Expected: Backwards compatible read; missing optional fields shown as "—".
- Severity: P3

## TC-ADMIN-CHAT-028
- Pre: Admin views session with very long messages (>200KB).
- Expected: Lazy load; truncation with "View full" button.
- Severity: P2

## TC-ADMIN-CHAT-029
- Pre: Admin.
- Steps: Export session detail as JSON.
- Expected: JSON download includes redaction; full content requires "View full" reason.
- Severity: P2

## TC-ADMIN-CHAT-030
- Pre: Admin views per-day total spend chart on `/admin/chat`.
- Expected: Line chart of cost by day for filtered range.
- Severity: P3
