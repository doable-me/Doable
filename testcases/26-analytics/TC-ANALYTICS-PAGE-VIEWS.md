# TC-ANALYTICS-PAGE-VIEWS — page_views Logging

Scope: Page view tracking on every (dashboard) page; `page_views` table; bot filtering; URL sanitization.

---

## TC-ANALYTICS-PAGE-VIEWS-001
- Pre: Authenticated user.
- Steps: Navigate to /dashboard.
- Expected: page_views row inserted with path=/dashboard, user_id, session_id, referrer, ua, ts.
- Severity: P0

## TC-ANALYTICS-PAGE-VIEWS-002
- Pre: User opted out.
- Expected: No row.
- Severity: P0

## TC-ANALYTICS-PAGE-VIEWS-003
- Pre: User Do-Not-Track header.
- Expected: No row.
- Severity: P1

## TC-ANALYTICS-PAGE-VIEWS-004
- Pre: SPA navigation (Next.js Link).
- Expected: pushState fires page_view; no double count for hash changes.
- Severity: P1

## TC-ANALYTICS-PAGE-VIEWS-005
- Pre: Bot user agent (e.g., Googlebot).
- Expected: Filtered; no row.
- Severity: P1

## TC-ANALYTICS-PAGE-VIEWS-006
- Pre: URL with query containing token.
- Expected: Sensitive params (token, code, key) stripped before storing.
- Severity: P0

## TC-ANALYTICS-PAGE-VIEWS-007
- Pre: URL with project_id in path.
- Expected: Path stored as `/projects/:id` (templated) or full id; consistent.
- Severity: P1

## TC-ANALYTICS-PAGE-VIEWS-008
- Pre: Referrer is sensitive (other tenant URL).
- Expected: Referrer-Policy header limits cross-origin leakage; stored only origin.
- Severity: P1

## TC-ANALYTICS-PAGE-VIEWS-009
- Pre: User reloads page 10x rapidly.
- Expected: Throttled; minimum interval N seconds before new page_view per (user, path).
- Severity: P2

## TC-ANALYTICS-PAGE-VIEWS-010
- Pre: User navigates very fast.
- Expected: Pages still recorded but in batched insert.
- Severity: P2

## TC-ANALYTICS-PAGE-VIEWS-011
- Pre: Public page (e.g., /login).
- Expected: page_views recorded with anonymous session_id; user_id null.
- Severity: P2

## TC-ANALYTICS-PAGE-VIEWS-012
- Pre: page_views index by (user_id, ts) and (path, ts).
- Expected: Used in /usage queries.
- Severity: P1

## TC-ANALYTICS-PAGE-VIEWS-013
- Pre: page_views retention.
- Expected: 365d; aggregated to analytics_daily_stats; raw purged after.
- Severity: P1

## TC-ANALYTICS-PAGE-VIEWS-014
- Pre: User journey reconstruct from session_id.
- Expected: All page_views in same session ordered chronologically.
- Severity: P2

## TC-ANALYTICS-PAGE-VIEWS-015
- Pre: Timer-based "time on page".
- Expected: duration_ms recorded on next navigation; bounded at 30 min.
- Severity: P2

## TC-ANALYTICS-PAGE-VIEWS-016
- Pre: Browser closes without next navigation.
- Expected: beacon API used to send last duration; or duration null acceptable.
- Severity: P3

## TC-ANALYTICS-PAGE-VIEWS-017
- Pre: User in iframe.
- Expected: page_view recorded for parent page only.
- Severity: P3

## TC-ANALYTICS-PAGE-VIEWS-018
- Pre: page_views ingestion endpoint behind auth.
- Expected: /api/analytics/page-view requires session for non-public pages.
- Severity: P1

## TC-ANALYTICS-PAGE-VIEWS-019
- Pre: Verify CSRF protection.
- Expected: SameSite cookie + token; cross-site POST blocked.
- Severity: P0

## TC-ANALYTICS-PAGE-VIEWS-020
- Pre: Verify GDPR delete cascades.
- Expected: User deletion anonymizes page_views.user_id.
- Severity: P0

## TC-ANALYTICS-PAGE-VIEWS-021
- Pre: page_views from admin pages excluded from user analytics.
- Expected: /admin/* paths NOT in user-visible /usage.
- Severity: P2

## TC-ANALYTICS-PAGE-VIEWS-022
- Pre: page_views aggregate to analytics_daily_stats per path.
- Expected: Top 10 paths visible in /admin or workspace owner view.
- Severity: P2

## TC-ANALYTICS-PAGE-VIEWS-023
- Pre: Verify cross-environment leakage.
- Expected: Staging events don't end up in prod analytics; env tagged.
- Severity: P0

## TC-ANALYTICS-PAGE-VIEWS-024
- Pre: page_views rate-limit per session.
- Expected: 100 page_views/min cap; beyond drops with warning log.
- Severity: P2

## TC-ANALYTICS-PAGE-VIEWS-025
- Pre: User in private/incognito.
- Expected: page_views still record but session_id ephemeral; no cross-incognito tracking.
- Severity: P2
