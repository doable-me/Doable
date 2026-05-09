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
