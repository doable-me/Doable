# TC-ADMIN-DASHBOARD — Platform Admin Dashboard Entry & Guard

Scope: `/admin` root page, navigation rendering, `platformAdminMiddleware` guard, redirects, top-level KPI cards, and deep-link behavior.

---

## TC-ADMIN-DASHBOARD-001
- Pre: User authenticated, `users.is_platform_admin = true`.
- Steps: Navigate to `/admin`.
- Expected: Page renders 200; sidebar shows: Projects, Audit, Trace, Chat, Dev Servers, Moderation, Runtime, Plan Limits, Feature Flags. No 403.
- Severity: P0

## TC-ADMIN-DASHBOARD-002
- Pre: Authenticated user with `is_platform_admin = false`.
- Steps: Visit `/admin`.
- Expected: HTTP 403 (or redirect to `/dashboard?error=forbidden`). Sidebar items not exposed. Body does not leak admin-only counts.
- Severity: P0

## TC-ADMIN-DASHBOARD-003
- Pre: Unauthenticated.
- Steps: GET `/admin`.
- Expected: Redirect to `/login?next=/admin`. After login, lands back on `/admin` only if still admin.
- Severity: P0

## TC-ADMIN-DASHBOARD-004
- Pre: Admin signed in.
- Steps: Hit `/api/admin/projects` directly with browser cookie.
- Expected: 200 with JSON list; CORS headers reflect same origin.
- Severity: P0

## TC-ADMIN-DASHBOARD-005
- Pre: Non-admin signed in.
- Steps: cURL `/api/admin/projects` with valid session cookie.
- Expected: 403 JSON `{ error: "platform_admin_required" }`. No row data leaks in body.
- Severity: P0

## TC-ADMIN-DASHBOARD-006
- Pre: Admin user.
- Steps: Toggle `is_platform_admin` to false on the same user via DB while session is open.
- Expected: Next navigation request to `/admin/*` returns 403. Active SSE/WS streams are closed.
- Severity: P1

## TC-ADMIN-DASHBOARD-007
- Pre: Admin user with no audit events yet.
- Steps: Visit `/admin`.
- Expected: KPI cards render zero counts (Projects, Active Sessions, Today's Events, Open Findings). No "undefined" or "NaN" strings.
- Severity: P1

## TC-ADMIN-DASHBOARD-008
- Pre: Admin; database returns >100k projects.
- Steps: Open `/admin`.
- Expected: KPI count formatted with thousands separator (e.g., `127,431`). Page TTFB <1.5s using cached count query.
- Severity: P2

## TC-ADMIN-DASHBOARD-009
- Pre: Admin.
- Steps: Open `/admin` in two tabs simultaneously.
- Expected: Both render independently; no race; counts identical or off by no more than 1 due to live data.
- Severity: P2

## TC-ADMIN-DASHBOARD-010
- Pre: Admin; KPI query times out (>5s).
- Steps: Visit `/admin`.
- Expected: Cards show skeleton fallback then "Unavailable" pill; page itself remains usable; no 500.
- Severity: P1

## TC-ADMIN-DASHBOARD-011
- Pre: Admin.
- Steps: Inspect HTML returned for `/admin`.
- Expected: No raw email addresses or secrets in HTML; admin actions gated behind XHR with CSRF token in header.
- Severity: P0

## TC-ADMIN-DASHBOARD-012
- Pre: Admin.
- Steps: Try GET `/admin/.env` and `/admin/../etc/passwd`.
- Expected: 404 / 400. Path traversal not honored. Logged to security_findings.
- Severity: P0

## TC-ADMIN-DASHBOARD-013
- Pre: Admin.
- Steps: Click each sidebar link in order.
- Expected: Active state highlights current page; URL updates without full reload (Next.js Link). No console errors.
- Severity: P2

## TC-ADMIN-DASHBOARD-014
- Pre: Admin on mobile (375px viewport).
- Steps: Open `/admin`.
- Expected: Sidebar collapses into hamburger; cards stack vertically; no horizontal scroll.
- Severity: P2

## TC-ADMIN-DASHBOARD-015
- Pre: Admin in dark mode.
- Steps: Visit `/admin`.
- Expected: All cards/icons render with proper contrast (WCAG AA). No light-mode flash of unstyled content.
- Severity: P2

## TC-ADMIN-DASHBOARD-016
- Pre: Admin.
- Steps: Press Tab repeatedly from page top.
- Expected: Tab order traverses Skip-link → Sidebar → Main content → KPI cards → Footer. Each interactive element shows focus ring.
- Severity: P2

## TC-ADMIN-DASHBOARD-017
- Pre: Admin.
- Steps: Visit `/admin` while platform_config has `admin_dashboard_enabled=false`.
- Expected: Page returns 503 with maintenance copy "Admin temporarily disabled". No 500.
- Severity: P1

## TC-ADMIN-DASHBOARD-018
- Pre: Admin signed in over Cloudflare Tunnel.
- Steps: Open `/admin`.
- Expected: All XHRs go through `<env>-api.doable.me` (single-level subdomain). No mixed-content warning.
- Severity: P0

## TC-ADMIN-DASHBOARD-019
- Pre: Admin.
- Steps: Sign out, then Back-button to `/admin`.
- Expected: Page does NOT show cached admin data. Redirect to `/login`.
- Severity: P0

## TC-ADMIN-DASHBOARD-020
- Pre: Admin; chat feature flag disabled.
- Steps: Visit `/admin`.
- Expected: "Chat" sidebar entry hidden (feature-flag aware). Direct `/admin/chat` returns 404 or feature-disabled banner.
- Severity: P1

## TC-ADMIN-DASHBOARD-021
- Pre: Admin.
- Steps: Open browser devtools, examine `Set-Cookie` on admin endpoints.
- Expected: HttpOnly, Secure, SameSite=Lax/Strict. No admin-only secrets in cookies.
- Severity: P0

## TC-ADMIN-DASHBOARD-022
- Pre: Admin with locale=fr.
- Steps: Visit `/admin`.
- Expected: Strings localize where translations exist; missing keys fall back to English (no `[missing.key]` artifacts).
- Severity: P3

## TC-ADMIN-DASHBOARD-023
- Pre: Admin; corrupt session cookie.
- Steps: Tamper cookie payload, reload `/admin`.
- Expected: 401 redirect to login. No 500 or stack trace leaked.
- Severity: P0

## TC-ADMIN-DASHBOARD-024
- Pre: Admin; database read-replica lag 30s.
- Steps: Make a workspace then immediately visit `/admin`.
- Expected: Counts reflect within 30s; UI shows "as of HH:MM" timestamp on cards.
- Severity: P3

## TC-ADMIN-DASHBOARD-025
- Pre: Admin signed in.
- Steps: Verify response headers on `/admin`.
- Expected: `Cache-Control: no-store, private`; `X-Frame-Options: DENY`; `Referrer-Policy: same-origin`; CSP forbids inline script except nonced.
- Severity: P0

## TC-ADMIN-DASHBOARD-026
- Pre: Admin.
- Steps: Open `/admin?debug=1` (legacy debug param).
- Expected: Debug param is ignored in production; no extra info leaked. In dev only, optional debug pane shown.
- Severity: P1

## TC-ADMIN-DASHBOARD-027
- Pre: Two admins.
- Steps: Both visit `/admin` and click "Refresh" simultaneously.
- Expected: No deadlock; both succeed; admin_audit_log records both views (if view-logging enabled).
- Severity: P2

## TC-ADMIN-DASHBOARD-028
- Pre: Admin.
- Steps: View Source on `/admin`.
- Expected: No commented-out secrets, no TODO with sensitive data, no internal hostnames not already public.
- Severity: P1

## TC-ADMIN-DASHBOARD-029
- Pre: Admin.
- Steps: Bookmark `/admin/projects?q=foo&page=3` and revisit.
- Expected: Filter and page state restored from query string. Search input pre-filled.
- Severity: P2

## TC-ADMIN-DASHBOARD-030
- Pre: Admin with extreme browser zoom 400%.
- Steps: Visit `/admin`.
- Expected: Layout reflows without overlap; sidebar accessible via menu button.
- Severity: P3

## TC-ADMIN-DASHBOARD-031
- Pre: Admin; SSE stream to `/api/admin/events` open.
- Steps: Throttle network offline 10s then back online.
- Expected: Stream auto-reconnects with exponential backoff; missed events backfill via cursor.
- Severity: P1

## TC-ADMIN-DASHBOARD-032
- Pre: Admin; impersonation feature flag exposed.
- Steps: Click "Impersonate user" on a target row.
- Expected: Confirmation modal warns of audit logging; on accept, banner pinned showing "Acting as <name>"; admin_audit_log writes `impersonation_start` event with target_user_id.
- Severity: P0

## TC-ADMIN-DASHBOARD-033
- Pre: Admin currently impersonating.
- Steps: Click "Stop impersonating".
- Expected: Returns to admin self; admin_audit_log writes `impersonation_end`; banner removed; cookies cleared.
- Severity: P0

## TC-ADMIN-DASHBOARD-034
- Pre: Non-admin attempts to call `/api/admin/impersonate`.
- Expected: 403; security_findings row inserted with severity=high; no token issued.
- Severity: P0

## TC-ADMIN-DASHBOARD-035
- Pre: Admin.
- Steps: Trigger an XSS payload in profile name `<img src=x onerror=alert(1)>` and view in admin lists.
- Expected: Rendered as text; no script execution; CSP blocks inline if attempted.
- Severity: P0

---

## TC-ADMIN-DASHBOARD-036
**Title:** Users & AI tab — user row shows correct email, role, and plan matching database
**Pre:** Admin logged in; user "dana@test.com" exists in DB with role="editor", plan="pro", AI source="anthropic", model="claude-sonnet-4-20250514", daily_credits=100, monthly_credits=3000, rollover_credits=50
**Steps:**
1. Navigate to /admin → Users & AI tab
2. Find user row for "dana@test.com"
**Expected:** Row displays display_name, email "dana@test.com", role "editor", plan "pro", AI source "anthropic", model "claude-sonnet-4-20250514", daily credits 100, monthly credits 3000, rollover credits 50. All values match the `users` and `user_ai_config` tables in the database. No field shows "undefined", "null", or empty.
**Severity:** Critical

## TC-ADMIN-DASHBOARD-037
**Title:** Users & AI tab — change role updates DB and UI immediately
**Pre:** Admin logged in; user "dana@test.com" currently has role="editor"
**Steps:**
1. Navigate to /admin → Users & AI tab
2. Find user "dana@test.com"
3. Click the role action → select "admin"
4. Confirm the change
5. Query DB: `SELECT role FROM users WHERE email = 'dana@test.com'`
**Expected:** UI updates the role column to "admin" without page refresh; DB query returns role="admin"; change is reflected if another admin views the same page; audit log records the role change with admin's identity and timestamp.
**Severity:** Critical

## TC-ADMIN-DASHBOARD-038
**Title:** Users & AI tab — credit allocation updates user's visible balance
**Pre:** Admin logged in; user "dana@test.com" has daily_credits=100
**Steps:**
1. Navigate to /admin → Users & AI tab
2. Find user "dana@test.com"
3. Click allocate AI → set daily_credits to 250
4. Confirm
5. Switch to user "dana@test.com" account and check credit balance
**Expected:** Admin UI shows daily_credits updated to 250; DB `user_ai_config.daily_credits` = 250; user "dana@test.com" sees 250 daily credits in their settings/usage page; the change takes effect immediately for the user's next AI request.
**Severity:** Critical

## TC-ADMIN-DASHBOARD-039
**Title:** Thumbnails tab — table shows recent thumbnail generations with correct project names
**Pre:** Admin logged in; at least 3 thumbnail generations have occurred in the last hour for projects "My Portfolio", "Todo App", "Landing Page"
**Steps:**
1. Navigate to /admin → Thumbnails tab
2. Inspect the log table
**Expected:** Table shows rows for "My Portfolio", "Todo App", "Landing Page" with columns: project_name, status, error (empty if success), duration (in ms/s), triggered_by (user email or "system"), timestamp. Project names match `projects.name` in DB. Table auto-refreshes every 3 seconds.
**Severity:** Critical

## TC-ADMIN-DASHBOARD-040
**Title:** Thumbnails tab — status reflects actual generation outcome (success vs error)
**Pre:** Admin logged in; one thumbnail succeeded ("Todo App") and one failed ("Broken Project" — e.g., Puppeteer timeout)
**Steps:**
1. Navigate to /admin → Thumbnails tab
2. Find rows for "Todo App" and "Broken Project"
**Expected:** "Todo App" row shows status "success" with duration > 0 and empty error field. "Broken Project" row shows status "error" with a non-empty error message (e.g., "TimeoutError: Navigation timeout") and the duration reflects how long it ran before failing. Status badges use distinct colors (green for success, red for error).
**Severity:** Critical

## TC-ADMIN-DASHBOARD-041
**Title:** Thumbnails tab — "Generate Missing" button triggers generation and new entries appear
**Pre:** Admin logged in; 2 projects exist with no thumbnails ("New Site A", "New Site B")
**Steps:**
1. Navigate to /admin → Thumbnails tab
2. Note current row count
3. Click "Generate Missing" button
4. Wait up to 30 seconds for table to update (auto-refreshes every 3s)
**Expected:** Button triggers POST to thumbnail generation endpoint; new rows appear in the table for "New Site A" and "New Site B" within 30 seconds; rows show status "in_progress" then transition to "success" or "error"; row count increases by 2. Button is disabled while generation is in progress to prevent duplicate triggers.
**Severity:** Critical

## TC-ADMIN-DASHBOARD-042
**Title:** Sessions tab — pool metrics show actual memory values
**Pre:** Admin logged in; Copilot engine pool is running with at least 1 active engine
**Steps:**
1. Navigate to /admin → Sessions tab
2. Inspect the pool metrics section
**Expected:** Pool size shows a number ≥ 1; max engines shows configured limit (e.g., 5 or 10); RSS memory shows a value in MB (e.g., "128 MB"), not zero or "N/A"; heap used shows a value in MB less than RSS; external memory shows a value ≥ 0. All values are formatted with units and are non-negative.
**Severity:** Critical

## TC-ADMIN-DASHBOARD-043
**Title:** Sessions tab — engine count matches running instances
**Pre:** Admin logged in; 3 Copilot engine instances are running (verified via process list or API)
**Steps:**
1. Navigate to /admin → Sessions tab
2. Check pool size metric
3. Count per-engine rows in the session tracking table
**Expected:** Pool size metric shows "3"; the per-engine session table lists exactly 3 engine entries; each engine shows an ID, creation time, and current session count. Adding a new engine (via load) increments the count on next refresh.
**Severity:** Critical

## TC-ADMIN-DASHBOARD-044
**Title:** Sessions tab — RSS and heap values are non-zero and reasonable
**Pre:** Admin logged in; at least 1 engine running with active sessions
**Steps:**
1. Navigate to /admin → Sessions tab
2. Read RSS memory, heap used, and external memory values
**Expected:** RSS > heap used (RSS includes non-heap allocations); heap used > 0 (engine has loaded code); values are within reasonable range (RSS < 2 GB per engine for normal operation); external memory ≥ 0. Values update on page refresh or auto-refresh cycle.
**Severity:** Critical

## TC-ADMIN-DASHBOARD-045
**Title:** Feature Flags tab — toggle switch reflects actual flag state in DB
**Pre:** Admin logged in; feature flag "enable_ai_chat" is set to `true` in `feature_flags` table; flag "enable_marketplace" is set to `false`
**Steps:**
1. Navigate to /admin → Feature Flags tab
2. Find "enable_ai_chat" and "enable_marketplace" rows
**Expected:** "enable_ai_chat" toggle is in the ON position; "enable_marketplace" toggle is in the OFF position. States match the `enabled` column in the `feature_flags` table. Each flag row also shows min_plan badge (e.g., "pro") and min_role badge (e.g., "editor") matching DB values.
**Severity:** Critical

## TC-ADMIN-DASHBOARD-046
**Title:** Feature Flags tab — toggling flag changes behavior immediately
**Pre:** Admin logged in; feature flag "enable_marketplace" is OFF; a regular user is logged in simultaneously
**Steps:**
1. Navigate to /admin → Feature Flags tab
2. Toggle "enable_marketplace" from OFF to ON
3. Confirm the change
4. Switch to regular user session and navigate to /marketplace
5. Toggle "enable_marketplace" back to OFF
6. Regular user refreshes /marketplace
**Expected:** After toggling ON: DB `feature_flags.enabled` = true for "enable_marketplace"; regular user can access /marketplace and sees content. After toggling OFF: DB shows false; regular user gets a "feature not available" message or is redirected. Changes take effect without requiring server restart.
**Severity:** Critical

## TC-ADMIN-DASHBOARD-047
**Title:** Feature Flags tab — min_plan badge correctly gates feature access
**Pre:** Admin logged in; feature flag "enable_ai_chat" has min_plan="pro"; user "free_user@test.com" is on plan="free"; user "pro_user@test.com" is on plan="pro"
**Steps:**
1. Navigate to /admin → Feature Flags tab
2. Verify "enable_ai_chat" shows min_plan badge "pro"
3. Change min_plan to "free" via the editable dropdown
4. Switch to "free_user@test.com" and access AI chat
5. Admin changes min_plan back to "pro"
6. "free_user@test.com" tries AI chat again
**Expected:** With min_plan="pro": free user cannot access AI chat (gated); pro user can. After changing to min_plan="free": free user can now access AI chat. After reverting to "pro": free user is gated again. The min_plan badge updates in the UI and DB immediately on dropdown change.
**Severity:** Critical

## TC-ADMIN-DASHBOARD-048
**Title:** KPI cards show non-zero values for active platform
**Pre:** Admin logged in; platform has ≥ 5 projects, ≥ 3 active users, ≥ 10 audit events today
**Steps:**
1. Navigate to /admin dashboard root
2. Inspect all KPI cards (Projects, Active Sessions, Today's Events, Open Findings, etc.)
**Expected:** All KPI cards display non-zero numeric values; no card shows "0" when the DB has data; no card shows "undefined", "NaN", "null", or loading spinner indefinitely. Values match aggregated counts from respective DB tables (e.g., Projects count = `SELECT count(*) FROM projects`).
**Severity:** Critical

## TC-ADMIN-DASHBOARD-049
**Title:** All 8 tabs load with real data — no empty states on active platform
**Pre:** Admin logged in; platform has active users, feature flags, AI config, thumbnail logs, sessions, integrations, plans, and email config
**Steps:**
1. Navigate to /admin
2. Click through each of the 8 tabs: Feature Flags, Users & AI, Integrations, Plans, AI Tools, Thumbnails, Sessions, Email
3. Verify each tab renders data
**Expected:** Each tab loads within 3 seconds; no tab shows "No data" or empty table when underlying data exists; Feature Flags shows ≥ 1 flag row; Users & AI shows ≥ 1 user row; Thumbnails shows ≥ 1 log entry; Sessions shows pool metrics. No JavaScript errors in console. Tab switching does not cause stale data from previous tab to display.
**Severity:** Critical

## TC-ADMIN-DASHBOARD-050
**Title:** Bulk user operation applies change to all selected users
**Pre:** Admin logged in; 3 users exist: "user1@test.com" (plan=free), "user2@test.com" (plan=free), "user3@test.com" (plan=free)
**Steps:**
1. Navigate to /admin → Users & AI tab
2. Select users "user1@test.com", "user2@test.com", "user3@test.com" using checkboxes
3. Choose bulk action "Change plan → pro"
4. Confirm the bulk operation
5. Query DB: `SELECT email, plan FROM users WHERE email IN ('user1@test.com', 'user2@test.com', 'user3@test.com')`
**Expected:** All 3 users' plan column updates to "pro" in both UI and DB; each row in the table reflects "pro" without page refresh; audit log records 3 separate plan change entries (one per user) with admin identity and timestamp; operation completes atomically — if one fails, all roll back.
