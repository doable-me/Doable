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
