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

---

# Deep Functional Verification (031–050)

## TC-ADMIN-CHAT-031
**Title:** Messages count reflects actual messages sent by user
**Pre:** User "alice@test.com" sends exactly 5 messages in project "My App" chat
**Steps:**
1. Navigate to /admin/chat
2. Search for "alice@test.com"
3. Find the session for "My App"
4. Check Messages column
**Expected:** Messages column shows "5"; matches SELECT COUNT(*) FROM chat_messages WHERE session_id=...; not stale/cached count.
**Severity:** Critical

## TC-ADMIN-CHAT-032
**Title:** Mode badge matches actual mode used during session
**Pre:** User starts a chat session in "agent" mode in project "Widget Builder"
**Steps:**
1. Navigate to /admin/chat
2. Search for the user's email
3. Find the session for "Widget Builder"
4. Check Mode column badge
**Expected:** Mode badge shows "agent" (not "chat"); badge color/style differentiates from chat mode; value matches ai_sessions.mode in DB.
**Severity:** Critical

## TC-ADMIN-CHAT-033
**Title:** Last activity timestamp within 1 minute of actual last message
**Pre:** User "bob@test.com" sends a message at 14:32:05 UTC in project "Dashboard"
**Steps:**
1. Navigate to /admin/chat
2. Search for "bob@test.com"
3. Find the session for "Dashboard"
4. Note the "Last activity" column value
5. Compare against SELECT MAX(created_at) FROM chat_messages WHERE session_id=...
**Expected:** Last activity timestamp is within 60 seconds of the actual last message timestamp; not showing session creation time or a stale cached value.
**Severity:** Critical

## TC-ADMIN-CHAT-034
**Title:** Project name column matches actual project name
**Pre:** User creates project named "Expense Tracker v2" and starts a chat session
**Steps:**
1. Navigate to /admin/chat
2. Search for user's email
3. Check Project column for the session row
**Expected:** Project column shows "Expense Tracker v2" (exact name, not project ID or UUID); matches projects.name WHERE id=ai_sessions.project_id.
**Severity:** Critical

## TC-ADMIN-CHAT-035
**Title:** New session appears in admin list within 10 seconds
**Pre:** Admin has /admin/chat open in browser
**Steps:**
1. In a separate browser/tab, user "carol@test.com" opens project "Landing Page" and sends first chat message
2. Within 10 seconds, admin refreshes /admin/chat (or list auto-updates)
3. Search for "carol@test.com"
**Expected:** New session for "Landing Page" appears in the list; row shows correct user, project, mode, Messages=1, and recent Started timestamp; no manual cache clear or server restart needed.
**Severity:** Critical

## TC-ADMIN-CHAT-036
**Title:** Thread drawer shows all messages in chronological order
**Pre:** User "dave@test.com" has a session with 8 messages (4 user + 4 assistant) in project "Blog CMS"
**Steps:**
1. Navigate to /admin/chat
2. Search for "dave@test.com", find "Blog CMS" session
3. Click Open button to open thread drawer
4. Scroll through all messages in the drawer
**Expected:** Drawer (800px wide) displays all 8 messages in chronological order (oldest first); each message shows role label, content, and createdAt timestamp; message count in drawer header matches "8".
**Severity:** Critical

## TC-ADMIN-CHAT-037
**Title:** User messages show full content in thread drawer
**Pre:** User sent message "Please add a login page with email and password fields" in a session
**Steps:**
1. Navigate to /admin/chat, find the session
2. Click Open to open thread drawer
3. Locate the user message in the message list
**Expected:** User message displays full text "Please add a login page with email and password fields" with role="user" label; content is NOT truncated or summarized; displayName shows user's name/email.
**Severity:** Critical

## TC-ADMIN-CHAT-038
**Title:** Assistant messages show response text in thread drawer
**Pre:** AI assistant responded with a multi-paragraph explanation including code snippet in a session
**Steps:**
1. Navigate to /admin/chat, find the session
2. Click Open to open thread drawer
3. Locate the assistant message
**Expected:** Assistant message displays full response text with role="assistant" label; code snippets rendered or preserved; markdown formatting visible; response is not truncated to first N characters.
**Severity:** Critical

## TC-ADMIN-CHAT-039
**Title:** Tool calls display tool name, arguments, and result
**Pre:** During a chat session, AI made a tool call: tool="writeFile", args={"path":"index.html","content":"<h1>Hello</h1>"}, result="File written successfully"
**Steps:**
1. Navigate to /admin/chat, find the session
2. Click Open to open thread drawer
3. Locate the message with tool calls
4. Expand or inspect the tool call details
**Expected:** Tool call section shows: tool name "writeFile", arguments object with path and content keys, and result string "File written successfully"; each field is labeled and readable.
**Severity:** Critical

## TC-ADMIN-CHAT-040
**Title:** Thinking content hidden by default but expandable
**Pre:** AI session includes a message with thinkingContent (chain-of-thought reasoning)
**Steps:**
1. Navigate to /admin/chat, find the session
2. Click Open to open thread drawer
3. Locate the assistant message that has thinkingContent
4. Verify thinking section is collapsed/hidden
5. Click expand/toggle to reveal thinkingContent
**Expected:** ThinkingContent is NOT visible by default in the drawer; an expand toggle or "Show thinking" button exists; clicking it reveals the full chain-of-thought text; collapsing hides it again.
**Severity:** High

## TC-ADMIN-CHAT-041
**Title:** Password in user message is auto-redacted
**Pre:** User sent message containing "my password is SuperSecret123!" in a chat session
**Steps:**
1. Navigate to /admin/chat, find the session
2. Click Open to open thread drawer
3. Locate the user message that originally contained "my password is SuperSecret123!"
**Expected:** Message content shows "my password is [REDACTED]" or similar redaction marker; the literal password "SuperSecret123!" is NOT visible anywhere in the drawer; redaction applied server-side before response to admin API.
**Severity:** Critical

## TC-ADMIN-CHAT-042
**Title:** JWT token in AI response is auto-redacted
**Pre:** AI response includes a JWT like "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
**Steps:**
1. Navigate to /admin/chat, find the session
2. Click Open to open thread drawer
3. Locate the assistant message containing the JWT
**Expected:** JWT is replaced with [REDACTED] or [JWT REDACTED]; the full "eyJ..." token is NOT visible; surrounding non-sensitive text remains intact and readable.
**Severity:** Critical

## TC-ADMIN-CHAT-043
**Title:** API key (sk-xxx) in tool result is auto-redacted
**Pre:** A tool call result contains "API key: sk-proj-abc123def456ghi789jkl012mno345"
**Steps:**
1. Navigate to /admin/chat, find the session
2. Click Open to open thread drawer
3. Locate the tool call result that originally contained the API key
**Expected:** Tool result shows "API key: [REDACTED]" or "[API_KEY REDACTED]"; the "sk-proj-..." string is NOT visible; other non-sensitive parts of the tool result remain visible.
**Severity:** Critical

## TC-ADMIN-CHAT-044
**Title:** Database connection string (postgres://...) is auto-redacted
**Pre:** Chat message contains "DATABASE_URL=postgres://admin:s3cret@db.example.com:5432/mydb"
**Steps:**
1. Navigate to /admin/chat, find the session
2. Click Open to open thread drawer
3. Locate the message containing the DB connection string
**Expected:** Connection string is redacted: shows "DATABASE_URL=[REDACTED]" or "postgres://[REDACTED]"; credentials (admin:s3cret) and host are NOT visible; redaction covers the full URI including embedded password.
**Severity:** Critical

## TC-ADMIN-CHAT-045
**Title:** Non-sensitive content is NOT over-redacted
**Pre:** User message contains only normal text: "Can you add a button that says 'Submit' with a blue background? The hex color should be #3B82F6."
**Steps:**
1. Navigate to /admin/chat, find the session
2. Click Open to open thread drawer
3. Locate the user message with normal content
**Expected:** Message displays full original text including "Submit", "blue background", and "#3B82F6"; the hex color code "#3B82F6" is NOT redacted (it's a CSS color, not a secret); no false-positive redaction on normal English text or short hex values.
**Severity:** Critical

## TC-ADMIN-CHAT-046
**Title:** Opening thread drawer creates audit entry with admin email
**Pre:** Admin "admin@doable.me" is logged in; session exists for user "eve@test.com"
**Steps:**
1. Navigate to /admin/chat
2. Find session for "eve@test.com"
3. Click Open to open thread drawer (messages load)
4. Query: SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 1
**Expected:** New row in admin_audit_log with: admin_email="admin@doable.me" (or admin user ID), action="view_chat_session" (or similar), target_id=session UUID, created_at within last 30 seconds.
**Severity:** Critical

## TC-ADMIN-CHAT-047
**Title:** Audit entry includes session_id of viewed thread
**Pre:** Admin opens thread drawer for session with ID "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
**Steps:**
1. Navigate to /admin/chat
2. Open thread drawer for the target session
3. Query admin_audit_log for latest entry
**Expected:** Audit log entry contains session_id or resource_id field matching "a1b2c3d4-e5f6-7890-abcd-ef1234567890"; the entry unambiguously identifies WHICH session the admin viewed.
**Severity:** Critical

## TC-ADMIN-CHAT-048
**Title:** Second admin viewing same thread creates separate audit entry
**Pre:** Admin A ("admin-a@doable.me") already viewed session X; Admin B ("admin-b@doable.me") now views same session X
**Steps:**
1. Admin B navigates to /admin/chat
2. Admin B opens thread drawer for session X
3. Query: SELECT * FROM admin_audit_log WHERE resource_id='session-X-id' ORDER BY created_at
**Expected:** Two distinct audit log entries exist: one for Admin A and one for Admin B; each has different admin_email/user_id and different created_at timestamps; both reference the same session_id.
**Severity:** High

## TC-ADMIN-CHAT-049
**Title:** Audit entry visible in /admin/audit/actions
**Pre:** Admin opened a chat thread drawer (audit entry was created per TC-046)
**Steps:**
1. Navigate to /admin/audit/actions (or /admin/audit)
2. Search or filter for action type "view_chat_session"
3. Find the entry created by the thread view
**Expected:** Audit entry appears in the admin audit UI with: admin identity, action description, session reference, and timestamp; entry is visible without needing direct DB query; consistent with data from admin_audit_log table.
**Severity:** High

## TC-ADMIN-CHAT-050
**Title:** Closing drawer without loading messages does NOT create audit entry
**Pre:** Admin is on /admin/chat; a session row is visible
**Steps:**
1. Note current max(created_at) from admin_audit_log
2. Click Open on a session row
3. Immediately close the drawer before messages API response returns (or if drawer has a confirmation step before loading)
4. Query admin_audit_log for entries after the noted timestamp
**Expected:** No new audit entry created for this session; audit is triggered only when messages are actually fetched/viewed, not on drawer open intent alone; prevents audit noise from accidental clicks.
**Severity:** High
