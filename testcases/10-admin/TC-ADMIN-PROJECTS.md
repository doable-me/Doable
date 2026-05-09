# TC-ADMIN-PROJECTS — Platform-wide Projects List

Scope: `/admin/projects`. Lists every project in the platform with search, filter, sort, pagination. Admin can drill into project details.

---

## TC-ADMIN-PROJECTS-001
- Pre: Admin; seeded 50 projects across 5 workspaces.
- Steps: GET `/admin/projects`.
- Expected: Table renders with columns: Name, Owner email, Workspace, Created, Last activity, Status, Actions. Default sort: Last activity DESC.
- Severity: P0

## TC-ADMIN-PROJECTS-002
- Pre: Non-admin.
- Steps: GET `/admin/projects`.
- Expected: 403. No project rows leaked even partially.
- Severity: P0

## TC-ADMIN-PROJECTS-003
- Pre: Admin; >1000 projects.
- Steps: Visit `/admin/projects`.
- Expected: Initial query LIMIT 50; pagination footer shows page count; query uses indexed columns; no full table scan.
- Severity: P0

## TC-ADMIN-PROJECTS-004
- Pre: Admin.
- Steps: Type "Acme" in search box.
- Expected: After 250ms debounce, list filters to projects whose name OR owner email OR workspace contains "Acme" (case-insensitive). Result count shown.
- Severity: P0

## TC-ADMIN-PROJECTS-005
- Pre: Admin.
- Steps: Search "ACME" (uppercase).
- Expected: Same results as "acme" (ILIKE / lowercased trigram).
- Severity: P0

## TC-ADMIN-PROJECTS-006
- Pre: Admin.
- Steps: Search with Unicode "café".
- Expected: Match works on accented characters; no encoding error.
- Severity: P1

## TC-ADMIN-PROJECTS-007
- Pre: Admin.
- Steps: Search "%" or "_" (SQL wildcards).
- Expected: Treated as literal characters; no SQL injection; no error.
- Severity: P0

## TC-ADMIN-PROJECTS-008
- Pre: Admin.
- Steps: Search "' OR 1=1 --".
- Expected: No injection; results empty or literal-only matches; admin_audit_log notes attempted suspicious search.
- Severity: P0

## TC-ADMIN-PROJECTS-009
- Pre: Admin.
- Steps: Click "Status" column header.
- Expected: Sort toggles ASC. Click again → DESC. Active sort indicator visible.
- Severity: P1

## TC-ADMIN-PROJECTS-010
- Pre: Admin.
- Steps: Sort by every column (Name, Owner, Workspace, Created, Last activity, Status).
- Expected: Each column sorts correctly both directions; URL reflects `?sort=col&dir=asc`.
- Severity: P1

## TC-ADMIN-PROJECTS-011
- Pre: Admin; zero projects in DB.
- Steps: Visit `/admin/projects`.
- Expected: Empty state copy: "No projects yet" with no CTA suggesting admin create one (admins don't create user projects).
- Severity: P2

## TC-ADMIN-PROJECTS-012
- Pre: Admin.
- Steps: Filter by Workspace dropdown.
- Expected: List restricts to that workspace; URL `?workspace_id=...`. Clear filter restores full list.
- Severity: P1

## TC-ADMIN-PROJECTS-013
- Pre: Admin.
- Steps: Filter by Status=archived.
- Expected: Only archived projects shown; archived projects styled with muted color.
- Severity: P2

## TC-ADMIN-PROJECTS-014
- Pre: Admin.
- Steps: Filter by Status=deleted.
- Expected: Soft-deleted projects shown with strikethrough; can be restored from row action.
- Severity: P1

## TC-ADMIN-PROJECTS-015
- Pre: Admin.
- Steps: Filter by Created in last 7 days.
- Expected: Date filter active; query uses `created_at > now() - interval '7 days'`.
- Severity: P2

## TC-ADMIN-PROJECTS-016
- Pre: Admin.
- Steps: Combine search + workspace filter + sort + page=3.
- Expected: All four params honored simultaneously; URL persists state; reload preserves.
- Severity: P1

## TC-ADMIN-PROJECTS-017
- Pre: Admin; 200 projects matching filter.
- Steps: Click page 4.
- Expected: Page 4 loads with offset 150; row 151 visible; "Showing 151-200 of 200" label.
- Severity: P1

## TC-ADMIN-PROJECTS-018
- Pre: Admin.
- Steps: Click last page when only 47 results exist (page size 50).
- Expected: Single page, no pagination UI; "Showing 1-47 of 47".
- Severity: P2

## TC-ADMIN-PROJECTS-019
- Pre: Admin.
- Steps: Manually set `?page=999` for 47-result list.
- Expected: Clamp to last valid page; or show "No results on this page" with link back to page 1; never 500.
- Severity: P2

## TC-ADMIN-PROJECTS-020
- Pre: Admin.
- Steps: Click project row.
- Expected: Drills to `/admin/projects/:id` showing full metadata: members, files count, build artifacts, recent audit, dovault state.
- Severity: P0

## TC-ADMIN-PROJECTS-021
- Pre: Admin viewing project detail.
- Steps: Click "Open as user" button.
- Expected: Opens `/editor/:projectId` in new tab using impersonation OR read-only view; admin_audit_log records access.
- Severity: P1

## TC-ADMIN-PROJECTS-022
- Pre: Admin viewing project detail.
- Steps: Click "Soft delete".
- Expected: Confirmation dialog naming project and owner; on confirm, project flagged deleted_at; audit row written; user receives notification (if enabled).
- Severity: P0

## TC-ADMIN-PROJECTS-023
- Pre: Admin viewing soft-deleted project.
- Steps: Click "Restore".
- Expected: deleted_at cleared; project visible to user; audit row.
- Severity: P1

## TC-ADMIN-PROJECTS-024
- Pre: Admin; project has live published URL.
- Steps: View project detail.
- Expected: Published subdomain shown clickable; HTTP status badge (200/403/down) probed.
- Severity: P2

## TC-ADMIN-PROJECTS-025
- Pre: Admin.
- Steps: Export current filtered view to CSV.
- Expected: CSV downloads with same columns; UTF-8 BOM; filename `projects-YYYY-MM-DD.csv`; contains only filtered rows.
- Severity: P2

## TC-ADMIN-PROJECTS-026
- Pre: Admin.
- Steps: CSV export when zero rows match.
- Expected: Header-only file; toast "No rows to export" optional.
- Severity: P3

## TC-ADMIN-PROJECTS-027
- Pre: Admin in 1M context window scrolling list.
- Steps: Scroll to row 5000 in virtualized list.
- Expected: Virtualization keeps DOM nodes <200; scroll smooth; no memory leak after 60s.
- Severity: P2

## TC-ADMIN-PROJECTS-028
- Pre: Admin.
- Steps: Right-click row → "Copy ID".
- Expected: Clipboard receives project UUID; toast confirms.
- Severity: P3

## TC-ADMIN-PROJECTS-029
- Pre: Admin.
- Steps: Click owner email link.
- Expected: Navigates to `/admin/users/:userId` (if user detail page exists) or opens mailto.
- Severity: P3

## TC-ADMIN-PROJECTS-030
- Pre: Admin; project owner deleted.
- Steps: View list.
- Expected: Owner column shows "(deleted user)"; no broken link or null pointer.
- Severity: P1

## TC-ADMIN-PROJECTS-031
- Pre: Admin.
- Steps: Search returns >50 results, then refine search to <50.
- Expected: Page resets to 1 automatically when filter changes; no "page out of range" error.
- Severity: P2

## TC-ADMIN-PROJECTS-032
- Pre: Admin; query takes >3s due to load.
- Steps: Run a wide search.
- Expected: Loading skeleton shown; abort previous request when new query typed; no race conditions.
- Severity: P1

## TC-ADMIN-PROJECTS-033
- Pre: Admin.
- Steps: Set page size selector to 100.
- Expected: 100 rows per page; preference persisted in localStorage; URL `?per=100`.
- Severity: P2

## TC-ADMIN-PROJECTS-034
- Pre: Admin.
- Steps: Visit project detail of project with 0 files.
- Expected: "No files" empty state; build artifact panel shows "Never deployed".
- Severity: P3

## TC-ADMIN-PROJECTS-035
- Pre: Admin; project has 50k files.
- Steps: View project detail.
- Expected: File count shown; file tree paginates / lazy-loads; no OOM on browser.
- Severity: P2

## TC-ADMIN-PROJECTS-036
- Pre: Admin.
- Steps: Click "View activity" on a project row.
- Expected: Navigates to `/admin/audit?project_id=:id` filtered to that project; activity_events scoped properly.
- Severity: P1

## TC-ADMIN-PROJECTS-037
- Pre: Admin.
- Steps: Use keyboard arrows to navigate rows; Enter to drill.
- Expected: Roving tabindex; focused row highlighted; Enter activates drill.
- Severity: P3

## TC-ADMIN-PROJECTS-038
- Pre: Admin tries to edit project name from detail page (if allowed).
- Expected: Either disabled (admin shouldn't edit user content) OR allowed with mandatory reason field stored in audit.
- Severity: P1

## TC-ADMIN-PROJECTS-039
- Pre: Admin; row has long name >120 chars.
- Steps: View list.
- Expected: Truncated with ellipsis + tooltip on hover showing full name. Layout doesn't break.
- Severity: P3

## TC-ADMIN-PROJECTS-040
- Pre: Admin.
- Steps: Tamper request to set `?per=1000000`.
- Expected: Server clamps to max 200; warning header `X-Param-Clamped: true`.
- Severity: P1

---

# Deep Functional Verification (041–060)

These tests verify that **actual rendered data** in the admin Projects table matches the real database state. Every assertion checks visible cell content — not just HTTP 200 or page loads.

---

## TC-ADMIN-PROJECTS-041
**Title:** Project row shows correct owner email matching database
**Pre:** Admin logged in; user "alice@test.com" owns project "My Todo App" (`SELECT u.email FROM users u JOIN projects p ON p.owner_id = u.id WHERE p.name = 'My Todo App'` returns "alice@test.com").
**Steps:**
1. Navigate to `/admin/projects`
2. Search for "My Todo App"
3. Read the Owner column cell for the matching row
**Expected:** Owner column shows "alice@test.com"; matches the DB query result exactly; not "(unknown)", empty, or a user ID.
**Severity:** Critical

## TC-ADMIN-PROJECTS-042
**Title:** Framework badge matches the framework the project was created with
**Pre:** Admin logged in; project "React Dashboard" was created with framework `react` (`SELECT framework FROM projects WHERE name = 'React Dashboard'` returns "react").
**Steps:**
1. Navigate to `/admin/projects`
2. Search for "React Dashboard"
3. Read the Framework column cell
**Expected:** Framework column shows "react" (or a badge labeled "React"); matches the DB value. Not "unknown", blank, or a different framework.
**Severity:** Critical

## TC-ADMIN-PROJECTS-043
**Title:** Status badge reflects actual runtime state from dev server
**Pre:** Admin logged in; project "Live API" has a running dev server (`SELECT listen_addr FROM dev_servers WHERE project_id = (SELECT id FROM projects WHERE name = 'Live API') AND stopped_at IS NULL` returns a non-null address).
**Steps:**
1. Navigate to `/admin/projects`
2. Search for "Live API"
3. Read the Status badge column
**Expected:** Status badge shows "running" with a green-tinted background. Not "draft" or "stopped". Badge state matches whether `dev_servers` has an active (non-stopped) entry.
**Severity:** Critical

## TC-ADMIN-PROJECTS-044
**Title:** Messages count in row matches real database count
**Pre:** Admin logged in; project "Chatbot" has exactly 37 chat messages (`SELECT COUNT(*) FROM messages WHERE project_id = (SELECT id FROM projects WHERE name = 'Chatbot')` returns 37).
**Steps:**
1. Navigate to `/admin/projects`
2. Search for "Chatbot"
3. Read the messages count column cell
**Expected:** Messages column shows "37". Not "0", blank, or a stale cached value. Matches the live DB count.
**Severity:** Critical

## TC-ADMIN-PROJECTS-045
**Title:** Updated timestamp reflects actual last modification time
**Pre:** Admin logged in; project "Portfolio" was last updated 3 hours ago (`SELECT updated_at FROM projects WHERE name = 'Portfolio'` returns a timestamp ~3h before now).
**Steps:**
1. Navigate to `/admin/projects`
2. Search for "Portfolio"
3. Read the updated (relative time) column cell
**Expected:** Updated column shows "3 hours ago" (or close approximation like "3h ago"). Not "just now", a future date, or the created_at time if different.
**Severity:** High

## TC-ADMIN-PROJECTS-046
**Title:** Running project shows green "running" status badge
**Pre:** Admin logged in; project "Server App" has an active dev server (started, not stopped).
**Steps:**
1. Start the dev server for "Server App" via API or editor
2. Navigate to `/admin/projects`
3. Search for "Server App"
4. Inspect the Status badge element's CSS
**Expected:** Badge text is "running"; badge has green background color (e.g., `bg-green-*` or equivalent); distinguishable from other states.
**Severity:** Critical

## TC-ADMIN-PROJECTS-047
**Title:** Stopped project shows gray status badge
**Pre:** Admin logged in; project "Old Blog" has no active dev server and is not published (`visibility != 'published'`, no running dev server).
**Steps:**
1. Ensure "Old Blog" dev server is stopped
2. Navigate to `/admin/projects`
3. Search for "Old Blog"
4. Inspect the Status badge
**Expected:** Badge text is "draft" or "stopped"; badge has gray/neutral background color; not green or blue.
**Severity:** High

## TC-ADMIN-PROJECTS-048
**Title:** Published project shows blue "published" status badge
**Pre:** Admin logged in; project "Landing Page" has `visibility = 'published'` in DB.
**Steps:**
1. Publish project "Landing Page" (set visibility to published)
2. Navigate to `/admin/projects`
3. Search for "Landing Page"
4. Inspect the Status badge
**Expected:** Badge text is "published"; badge has blue background color; reflects the `visibility` column in DB.
**Severity:** Critical

## TC-ADMIN-PROJECTS-049
**Title:** Draft project shows yellow/amber status badge
**Pre:** Admin logged in; project "WIP Prototype" has `visibility = 'draft'` and no active dev server.
**Steps:**
1. Ensure "WIP Prototype" is draft with no running server
2. Navigate to `/admin/projects`
3. Search for "WIP Prototype"
4. Inspect the Status badge
**Expected:** Badge text is "draft"; badge has yellow or amber background color; visually distinct from running (green) and published (blue).
**Severity:** High

## TC-ADMIN-PROJECTS-050
**Title:** Errored dev server shows red status badge
**Pre:** Admin logged in; project "Crash Test" has a dev server entry with a non-zero `exit_code` or `error` field set.
**Steps:**
1. Trigger or simulate a dev server crash for "Crash Test" (server exits with error)
2. Navigate to `/admin/projects`
3. Search for "Crash Test"
4. Inspect the Status badge
**Expected:** Badge text is "errored" or "error"; badge has red background color; clearly signals failure state to admin.
**Severity:** Critical

## TC-ADMIN-PROJECTS-051
**Title:** Click project name navigates to editor with that project's files
**Pre:** Admin logged in; project "My Todo App" exists with known files (e.g., `index.html`, `style.css`).
**Steps:**
1. Navigate to `/admin/projects`
2. Search for "My Todo App"
3. Click the project name link in the Name column
**Expected:** Browser navigates to `/projects/<project-id>` (the editor view); editor loads with the file tree showing "My Todo App"'s actual files; not a 404 or different project's files.
**Severity:** Critical

## TC-ADMIN-PROJECTS-052
**Title:** Click owner email navigates to user detail in admin
**Pre:** Admin logged in; project owned by "bob@test.com" visible in list.
**Steps:**
1. Navigate to `/admin/projects`
2. Find a row with owner "bob@test.com"
3. Click the owner email link
**Expected:** Browser navigates to `/admin/users/<user-id>` showing Bob's user detail page; the email on the detail page matches "bob@test.com"; not a dead link or 404.
**Severity:** High

## TC-ADMIN-PROJECTS-053
**Title:** Sessions count links to filtered chat sessions for that project
**Pre:** Admin logged in; project "Chatbot" has 5 chat sessions visible in admin.
**Steps:**
1. Navigate to `/admin/projects`
2. Search for "Chatbot"
3. Click the sessions count number (e.g., "5")
**Expected:** Navigates to chat sessions admin view filtered by project ID; shows exactly 5 sessions; each session belongs to project "Chatbot" (verify project name in session rows).
**Severity:** High

## TC-ADMIN-PROJECTS-054
**Title:** Messages count matches chat admin totals for same project
**Pre:** Admin logged in; project "Chatbot" shows "37" in messages column.
**Steps:**
1. Navigate to `/admin/projects`, note messages count for "Chatbot" (e.g., 37)
2. Navigate to `/admin/chat` or equivalent chat admin
3. Filter by project "Chatbot"
4. Count total messages shown
**Expected:** Chat admin total messages for "Chatbot" equals 37; both views pull from the same source of truth; no discrepancy.
**Severity:** High

## TC-ADMIN-PROJECTS-055
**Title:** listenAddr column shows actual port from active dev server
**Pre:** Admin logged in; project "Live API" has a running dev server on port 38421 (`SELECT listen_addr FROM dev_servers WHERE project_id = ... AND stopped_at IS NULL` returns "127.0.0.1:38421").
**Steps:**
1. Start dev server for "Live API"
2. Navigate to `/admin/projects`
3. Search for "Live API"
4. Read the listenAddr column cell
**Expected:** listenAddr shows "127.0.0.1:38421" (or `:38421`); matches the actual port the dev server bound to; not empty, "N/A", or a stale port from a previous run.
**Severity:** Critical

## TC-ADMIN-PROJECTS-056
**Title:** Create new project → appears in admin list within 5 seconds
**Pre:** Admin logged in; admin projects page open.
**Steps:**
1. In a second tab, create a new project named "Fresh Project 2025" via the editor UI
2. Wait 5 seconds
3. In the admin tab, refresh `/admin/projects`
4. Search for "Fresh Project 2025"
**Expected:** "Fresh Project 2025" appears in the list with correct owner email, "draft" status badge, 0 messages, 0 sessions, and a recent "updated" timestamp ("just now" or "< 1 min ago"). No stale cache hiding the new row.
**Severity:** Critical

## TC-ADMIN-PROJECTS-057
**Title:** Delete project → admin shows strikethrough and "deleted" badge
**Pre:** Admin logged in; project "Disposable App" exists and is visible in admin list.
**Steps:**
1. Soft-delete project "Disposable App" (via admin action or API `DELETE /admin/projects/<id>`)
2. Refresh `/admin/projects`
3. Search for "Disposable App"
**Expected:** "Disposable App" row still visible (soft-deleted); project name has strikethrough text decoration (`line-through`); status badge shows "deleted" with a distinct color (e.g., red or gray); row is visually distinguishable from active projects.
**Severity:** Critical

## TC-ADMIN-PROJECTS-058
**Title:** Publish project → admin status changes to "published" badge
**Pre:** Admin logged in; project "Launch Ready" exists with status "draft".
**Steps:**
1. Verify "Launch Ready" shows "draft" badge in admin list
2. Publish "Launch Ready" via editor UI or API (`PATCH /projects/<id>` with `visibility: 'published'`)
3. Refresh `/admin/projects`
4. Search for "Launch Ready"
**Expected:** Status badge changes from "draft" (yellow) to "published" (blue); transition is immediate on refresh; no stale "draft" badge.
**Severity:** Critical

## TC-ADMIN-PROJECTS-059
**Title:** Start dev server → admin shows "running" with listen address
**Pre:** Admin logged in; project "Dev Test" exists with no running server (status "draft").
**Steps:**
1. Verify "Dev Test" shows "draft" badge and empty listenAddr in admin list
2. Start dev server for "Dev Test" via editor preview
3. Wait for server to bind (5–10 seconds)
4. Refresh `/admin/projects`
5. Search for "Dev Test"
**Expected:** Status badge changes to "running" (green); listenAddr column now shows the bound address (e.g., "127.0.0.1:XXXXX"); both fields populated; not still showing "draft" with empty address.
**Severity:** Critical

## TC-ADMIN-PROJECTS-060
**Title:** Send AI message → admin messages count increments in real time
**Pre:** Admin logged in; project "AI Chat App" currently shows messages count = N in admin list.
**Steps:**
1. Note current messages count N for "AI Chat App" in admin list
2. In a second tab, open "AI Chat App" editor and send one AI chat message
3. Wait for AI response to complete
4. Refresh `/admin/projects` in admin tab
5. Search for "AI Chat App"
**Expected:** Messages column now shows N+2 (user message + AI response) or at minimum N+1 (user message); count incremented from the previously observed value; not stale at N.
**Severity:** Critical
