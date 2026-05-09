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
