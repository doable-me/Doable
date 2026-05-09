# TC-ADMIN-AUDIT — Activity Events & Audit Drill-down

Scope: `/admin/audit` listing, filters, `/admin/audit/:sessionId` drill-down. Tables: `activity_events`, `admin_audit_log`. Event types: login, logout, workspace create, project delete, role change, plan change, billing event, integration connect/revoke, etc.

---

## TC-ADMIN-AUDIT-001
- Pre: Admin; activity_events seeded with 200 mixed events.
- Steps: GET `/admin/audit`.
- Expected: Table lists most recent events first; columns Event type, Actor, Target, Timestamp (relative + absolute), IP/UA. 50 per page.
- Severity: P0

## TC-ADMIN-AUDIT-002
- Pre: Non-admin.
- Steps: GET `/admin/audit`.
- Expected: 403; no rows.
- Severity: P0

## TC-ADMIN-AUDIT-003
- Pre: Admin.
- Steps: Filter event_type=login.
- Expected: Only login events shown; URL `?event_type=login`.
- Severity: P0

## TC-ADMIN-AUDIT-004
- Pre: Admin.
- Steps: Filter by actor email (partial "alice").
- Expected: Events whose actor email contains "alice" (case-insensitive).
- Severity: P0

## TC-ADMIN-AUDIT-005
- Pre: Admin.
- Steps: Filter by date range (last 24h).
- Expected: Only events within window; query uses created_at index.
- Severity: P0

## TC-ADMIN-AUDIT-006
- Pre: Admin.
- Steps: Combine event_type=project_delete + actor=bob + last 7d.
- Expected: All filters AND-applied; result count accurate.
- Severity: P1

## TC-ADMIN-AUDIT-007
- Pre: Admin; filter yields zero results.
- Steps: Apply filter.
- Expected: Empty state "No matching events"; "Clear filters" button.
- Severity: P2

## TC-ADMIN-AUDIT-008
- Pre: Admin.
- Steps: Click a `login` event.
- Expected: Drills to `/admin/audit/:eventId` showing payload JSON, IP, UA, geo (if enriched), session_id link.
- Severity: P0

## TC-ADMIN-AUDIT-009
- Pre: Admin.
- Steps: Click `logout` event.
- Expected: Detail shows session duration computed from matching login; no PII leaked beyond what user owns.
- Severity: P1

## TC-ADMIN-AUDIT-010
- Pre: Admin.
- Steps: Click `workspace_create` event detail.
- Expected: Payload contains workspace_id, slug, plan; click-through to workspace.
- Severity: P1

## TC-ADMIN-AUDIT-011
- Pre: Admin.
- Steps: Click `project_delete` event detail.
- Expected: Shows project_id (link still works for soft-deleted), name at time of deletion (snapshot), reason if provided.
- Severity: P1

## TC-ADMIN-AUDIT-012
- Pre: Admin.
- Steps: Click `role_change` event detail.
- Expected: from_role → to_role visible; target_user_id and changed_by_user_id distinct.
- Severity: P0

## TC-ADMIN-AUDIT-013
- Pre: Admin.
- Steps: Click `plan_change` event.
- Expected: from_plan, to_plan, effective_at, billing reference (if Stripe).
- Severity: P0

## TC-ADMIN-AUDIT-014
- Pre: Admin.
- Steps: Click `billing_event`.
- Expected: Stripe invoice id linked (admins see redacted last4 only); amount; currency; status.
- Severity: P0

## TC-ADMIN-AUDIT-015
- Pre: Admin.
- Steps: Click `integration_connect` event.
- Expected: provider name (e.g., google), scopes granted, connection_id; no OAuth tokens leaked into UI.
- Severity: P0

## TC-ADMIN-AUDIT-016
- Pre: Admin.
- Steps: Click `integration_revoke` event.
- Expected: Reason ("user", "expired", "admin"); revoked_at; downstream impact (workflows paused) listed.
- Severity: P1

## TC-ADMIN-AUDIT-017
- Pre: Admin.
- Steps: Filter event_type=integration_revoke + reason=admin.
- Expected: Only admin-initiated revocations.
- Severity: P2

## TC-ADMIN-AUDIT-018
- Pre: Admin viewing event with malformed JSON payload.
- Steps: Click event.
- Expected: Detail page shows "Payload corrupted" with raw bytes preview; no 500.
- Severity: P1

## TC-ADMIN-AUDIT-019
- Pre: Admin.
- Steps: Filter by IP address contains "192.168".
- Expected: Match works on indexed inet column or trigram on text repr.
- Severity: P2

## TC-ADMIN-AUDIT-020
- Pre: Admin.
- Steps: Filter by user agent contains "Chrome".
- Expected: Filter works case-insensitively.
- Severity: P3

## TC-ADMIN-AUDIT-021
- Pre: Admin; >100k events.
- Steps: Open `/admin/audit`.
- Expected: Page TTFB <2s; query uses event_type + created_at composite index.
- Severity: P1

## TC-ADMIN-AUDIT-022
- Pre: Admin.
- Steps: Export filtered events to CSV.
- Expected: CSV contains all matched events; payloads JSON-stringified in single column; max 100k rows otherwise paged.
- Severity: P2

## TC-ADMIN-AUDIT-023
- Pre: Admin tries to delete an audit row.
- Expected: No delete UI exposed. DB DELETE blocked by RLS or trigger; attempt logged as security_finding.
- Severity: P0

## TC-ADMIN-AUDIT-024
- Pre: Admin views audit during retention boundary.
- Steps: Browse events older than 365 days.
- Expected: Either accessible or "Retained N days" notice; aged events purged per retention policy without leaving dangling references.
- Severity: P1

## TC-ADMIN-AUDIT-025
- Pre: Admin views `/admin/audit/:sessionId` for a session that spans login → multiple actions → logout.
- Expected: Timeline view showing all events for that session ordered chronologically; deltas in seconds.
- Severity: P1

## TC-ADMIN-AUDIT-026
- Pre: Admin.
- Steps: Click "View user history" from event detail.
- Expected: Drill to filtered audit `?actor_id=...` showing all that user's events.
- Severity: P2

## TC-ADMIN-AUDIT-027
- Pre: Admin views event of impersonation_start.
- Expected: Severity badge "high"; payload shows impersonator and target; cross-link to impersonation_end if exists.
- Severity: P0

## TC-ADMIN-AUDIT-028
- Pre: Admin.
- Steps: Run search with very long text (10k chars).
- Expected: Server truncates or rejects with 400; no DOS vector.
- Severity: P1

## TC-ADMIN-AUDIT-029
- Pre: Admin viewing event `password_reset_request`.
- Expected: Email shown but token NOT shown; only token hash if necessary.
- Severity: P0

## TC-ADMIN-AUDIT-030
- Pre: Admin viewing event `mfa_disabled`.
- Expected: Highlighted with red/warning color; reason captured; admin-initiated vs user-initiated distinguishable.
- Severity: P0

## TC-ADMIN-AUDIT-031
- Pre: Admin.
- Steps: Inspect SSE/WS for new audit events.
- Expected: New events stream into top of list as they arrive (live tail toggle); throttle 1 event/sec UI update.
- Severity: P2

## TC-ADMIN-AUDIT-032
- Pre: Admin in live tail mode; 1000 events/min storm.
- Expected: UI buffers and shows "+N new events" pill rather than re-rendering each.
- Severity: P2

## TC-ADMIN-AUDIT-033
- Pre: Admin.
- Steps: Sort by Timestamp ASC.
- Expected: Oldest first; combined with filters works.
- Severity: P3

## TC-ADMIN-AUDIT-034
- Pre: Admin.
- Steps: Visit `/admin/audit/INVALID-UUID`.
- Expected: 404 page with link back; no 500.
- Severity: P2

## TC-ADMIN-AUDIT-035
- Pre: Admin.
- Steps: Visit `/admin/audit/:id` for event in different env (id mismatch).
- Expected: 404; no leakage.
- Severity: P0

## TC-ADMIN-AUDIT-036
- Pre: Admin.
- Steps: Filter by session_id directly.
- Expected: Only events with matching session.
- Severity: P2

## TC-ADMIN-AUDIT-037
- Pre: Admin.
- Steps: Click event with target_type=workspace and target_id missing (workspace deleted).
- Expected: Inline note "(deleted)"; no broken link.
- Severity: P2

## TC-ADMIN-AUDIT-038
- Pre: Admin.
- Steps: Examine HTML of detail page for XSS via payload field containing `<script>`.
- Expected: All payload fields escaped; rendered as text; CSP blocks inline scripts.
- Severity: P0

## TC-ADMIN-AUDIT-039
- Pre: Admin.
- Steps: Filter by resource (workspace, project, user) type.
- Expected: Resource-type tabs at top; counts shown per type.
- Severity: P2

## TC-ADMIN-AUDIT-040
- Pre: Admin.
- Steps: Check column "Severity" coloring.
- Expected: high=red, medium=amber, low=gray, info=blue. Color-blind safe icons supplement.
- Severity: P3

## TC-ADMIN-AUDIT-041
- Pre: Admin admin_audit_log entry self-referencing (admin views audit page).
- Expected: A `view_audit` event optionally inserted (configurable). If enabled, no infinite loop generating events.
- Severity: P2

---

# Deep Functional Verification (042–055)

## TC-ADMIN-AUDIT-042
**Title:** Sessions total stat card matches actual database count
**Pre:** Admin logged in; 150 total chat sessions exist in database (verified via `SELECT COUNT(*) FROM chat_sessions`).
**Steps:**
1. Navigate to /admin/audit
2. Read the "Sessions" stat card total value
3. Run `SELECT COUNT(*) FROM chat_sessions` against the database
**Expected:** Stat card total shows 150; matches the database count exactly; value is not cached/stale (refresh page and count still matches after inserting one more session).
**Severity:** Critical

## TC-ADMIN-AUDIT-043
**Title:** Sessions 24h count matches sessions created in last day
**Pre:** Admin logged in; 12 chat sessions created within the last 24 hours; 138 older sessions exist.
**Steps:**
1. Navigate to /admin/audit
2. Read the "Sessions" stat card 24h sub-value
3. Run `SELECT COUNT(*) FROM chat_sessions WHERE created_at >= NOW() - INTERVAL '24 hours'`
**Expected:** 24h sub-value shows 12; matches the database query result; does not include sessions from 25 hours ago.
**Severity:** Critical

## TC-ADMIN-AUDIT-044
**Title:** Messages 7-day rolling stat card matches actual message count
**Pre:** Admin logged in; 487 messages sent in the last 7 days; 2000+ older messages exist.
**Steps:**
1. Navigate to /admin/audit
2. Read the "Messages (7d)" stat card value
3. Run `SELECT COUNT(*) FROM chat_messages WHERE created_at >= NOW() - INTERVAL '7 days'`
**Expected:** Stat card shows 487; matches the database query exactly; boundary messages at exactly 7 days ago are included or excluded consistently with the query.
**Severity:** Critical

## TC-ADMIN-AUDIT-045
**Title:** Distinct users count matches unique user IDs in sessions
**Pre:** Admin logged in; 23 distinct users have chat sessions; some users have multiple sessions.
**Steps:**
1. Navigate to /admin/audit
2. Read the "Distinct users" stat card value
3. Run `SELECT COUNT(DISTINCT user_id) FROM chat_sessions`
**Expected:** Stat card shows 23; matches database count; users with zero messages but an open session are still counted.
**Severity:** Critical

## TC-ADMIN-AUDIT-046
**Title:** Search by "Message contains" finds exact substring in user message content
**Pre:** Admin logged in; one session contains the user message "How do I deploy to production server?"; no other session contains "deploy to production".
**Steps:**
1. Navigate to /admin/audit
2. Enter "deploy to production" in the "Message contains" search field
3. Submit the search form
**Expected:** Exactly one result returned; the result row's "Last excerpt" column shows a snippet containing "deploy to production"; clicking the row shows the full message "How do I deploy to production server?".
**Severity:** Critical

## TC-ADMIN-AUDIT-047
**Title:** Search by Project ID returns only sessions for that project
**Pre:** Admin logged in; Project A (ID `aaa-111`) has 5 chat sessions; Project B (ID `bbb-222`) has 8 sessions.
**Steps:**
1. Navigate to /admin/audit
2. Enter `aaa-111` in the "Project ID" field
3. Submit the search form
4. Count the returned rows
**Expected:** Exactly 5 results returned; every row's "Workspace/Project" column references project `aaa-111`; no rows for project `bbb-222` appear.
**Severity:** Critical

## TC-ADMIN-AUDIT-048
**Title:** Date range filter excludes sessions outside the specified range
**Pre:** Admin logged in; 3 sessions created on May 1, 4 sessions on May 5, 2 sessions on May 10.
**Steps:**
1. Navigate to /admin/audit
2. Set "From" to May 4 00:00 and "To" to May 6 23:59
3. Submit the search form
**Expected:** Exactly 4 results returned (only May 5 sessions); May 1 and May 10 sessions are excluded; boundary sessions at exactly May 4 00:00 are included.
**Severity:** Critical

## TC-ADMIN-AUDIT-049
**Title:** Combined filters return correct intersection of results
**Pre:** Admin logged in; User X has 3 sessions across 2 projects; one session in Project A contains "budget report" in messages; the other two do not.
**Steps:**
1. Navigate to /admin/audit
2. Enter User X's ID in "User ID"
3. Enter Project A's ID in "Project ID"
4. Enter "budget report" in "Message contains"
5. Submit the search form
**Expected:** Exactly 1 result returned; it belongs to User X, in Project A, and contains "budget report"; all three filters are AND-applied.
**Severity:** Critical

## TC-ADMIN-AUDIT-050
**Title:** Admin restarts runtime → action logged with correct actor, resource, and details JSON
**Pre:** Admin logged in; admin_audit_log table accessible; project `proj-999` has a running dev server.
**Steps:**
1. Admin navigates to project `proj-999` admin view and clicks "Restart Runtime"
2. Wait for restart confirmation
3. Query `/admin/audit/actions?resource_type=project&resource_id=proj-999&action=restart_runtime` (or check /admin/audit/actions page)
**Expected:** One new entry in admin_audit_log with: actor_id = admin's user ID, actor_email = admin's email, action = "restart_runtime", resource_type = "project", resource_id = "proj-999", details JSON contains `{"previous_state":"running","new_state":"restarting"}`, client_ip and user_agent are populated (not null).
**Severity:** Critical

## TC-ADMIN-AUDIT-051
**Title:** Admin views chat thread → action logged in audit trail
**Pre:** Admin logged in; chat session `sess-abc` exists with messages.
**Steps:**
1. Admin navigates to /admin/audit and clicks on session `sess-abc` to drill into detail
2. Query `/admin/audit/actions?action=view_conversation&resource_id=sess-abc`
**Expected:** One new entry in admin_audit_log with: action = "view_conversation" (or equivalent), resource_type = "chat_session", resource_id = "sess-abc", actor_id = admin's ID, timestamp within last 60 seconds.
**Severity:** High

## TC-ADMIN-AUDIT-052
**Title:** Admin changes feature flag → action logged with old and new values
**Pre:** Admin logged in; feature flag `enable_ai_chat` is currently `true`.
**Steps:**
1. Admin navigates to feature flags / settings and toggles `enable_ai_chat` to `false`
2. Wait for save confirmation
3. Query `/admin/audit/actions?action=update_feature_flag`
**Expected:** One new entry with: action = "update_feature_flag", details JSON contains `{"flag":"enable_ai_chat","old_value":true,"new_value":false}`, actor fields populated, timestamp accurate.
**Severity:** Critical

## TC-ADMIN-AUDIT-053
**Title:** Admin impersonates user → action logged with reason field
**Pre:** Admin logged in; user `user-456` exists; impersonation feature enabled.
**Steps:**
1. Admin navigates to user management and clicks "Impersonate" on user `user-456`
2. Admin enters reason "Investigating reported bug #789"
3. Admin confirms impersonation
4. Query `/admin/audit/actions?action=impersonate_user&target_user_id=user-456`
**Expected:** One new entry with: action = "impersonate_user", target_user_id = "user-456", details JSON contains `{"reason":"Investigating reported bug #789"}`, actor_id = admin's ID (not the impersonated user), actor_role = "admin".
**Severity:** Critical

## TC-ADMIN-AUDIT-054
**Title:** Drill "When" timestamp → detail page shows full conversation messages
**Pre:** Admin logged in; session `sess-xyz` has 8 messages (4 user, 4 assistant) with known content.
**Steps:**
1. Navigate to /admin/audit
2. Locate the row for session `sess-xyz`
3. Click the "When" timestamp link to open the detail/drill-down page
4. Count the messages displayed on the detail page
**Expected:** Detail page loads showing all 8 messages in chronological order; each message shows role (user/assistant), full content (not truncated), and timestamp; user messages and assistant messages are visually distinct.
**Severity:** Critical

## TC-ADMIN-AUDIT-055
**Title:** View user history shows all sessions for that user across all projects
**Pre:** Admin logged in; User Y has 6 chat sessions spread across 3 different projects.
**Steps:**
1. Navigate to /admin/audit
2. Locate any row for User Y
3. Click User Y's name/link to view their full session history
4. Count the listed sessions and note which projects they belong to
**Expected:** All 6 sessions are listed; sessions span all 3 projects (not filtered to just the project from the clicked row); each session shows project name, message count, and last activity timestamp; results are sorted by most recent first.
**Severity:** Critical
