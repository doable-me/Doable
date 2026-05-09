# TC-ANALYTICS-DASHBOARD — User-Facing /usage Page

Scope: Dashboard `/usage` rendering for users showing their own analytics; per-workspace metrics; opt-out toggle; export.

---

## TC-ANALYTICS-DASHBOARD-001
- Pre: Authenticated user with activity.
- Steps: GET `/usage`.
- Expected: Charts: AI messages this month, projects active, deploys this month, credits used vs cap, daily activity sparkline.
- Severity: P0

## TC-ANALYTICS-DASHBOARD-002
- Pre: Unauthenticated.
- Expected: Redirect to /login.
- Severity: P0

## TC-ANALYTICS-DASHBOARD-003
- Pre: User opted out.
- Expected: Page shows "Analytics disabled" with toggle to re-enable.
- Severity: P1

## TC-ANALYTICS-DASHBOARD-004
- Pre: User toggles opt-out=true.
- Steps: Toggle.
- Expected: analytics_settings row updated; future events not tracked; existing data NOT deleted (separate flow).
- Severity: P0

## TC-ANALYTICS-DASHBOARD-005
- Pre: User clicks "Delete my analytics".
- Expected: Confirmation; on confirm, user's events deleted/anonymized; aggregations recomputed.
- Severity: P0

## TC-ANALYTICS-DASHBOARD-006
- Pre: New user with zero events.
- Expected: Empty state friendly copy; no broken charts.
- Severity: P2

## TC-ANALYTICS-DASHBOARD-007
- Pre: User on free plan; usage near cap.
- Expected: Progress bar shows ratio; upgrade CTA.
- Severity: P1

## TC-ANALYTICS-DASHBOARD-008
- Pre: User over cap.
- Expected: Red banner; some features disabled until next billing cycle or upgrade.
- Severity: P1

## TC-ANALYTICS-DASHBOARD-009
- Pre: Workspace owner views workspace-level analytics.
- Expected: Aggregated members' usage; per-member breakdown for the same workspace only.
- Severity: P1

## TC-ANALYTICS-DASHBOARD-010
- Pre: Non-owner workspace member.
- Expected: Sees only personal usage; not workspace aggregate (unless role permits).
- Severity: P0

## TC-ANALYTICS-DASHBOARD-011
- Pre: Date range picker.
- Expected: Default last 30 days; can switch 7d / 30d / 90d / custom.
- Severity: P2

## TC-ANALYTICS-DASHBOARD-012
- Pre: Custom date range invalid (end < start).
- Expected: Validation; cannot apply.
- Severity: P3

## TC-ANALYTICS-DASHBOARD-013
- Pre: Export to CSV.
- Expected: Download button; CSV with daily rows; filename includes date range.
- Severity: P2

## TC-ANALYTICS-DASHBOARD-014
- Pre: Charts rendered server-side or client-side.
- Expected: SSR-friendly placeholders; CLS minimized; no layout shift.
- Severity: P2

## TC-ANALYTICS-DASHBOARD-015
- Pre: Charts accessible.
- Expected: Each chart has aria-label and tabular fallback (skip link).
- Severity: P2

## TC-ANALYTICS-DASHBOARD-016
- Pre: Real-time vs aggregated.
- Expected: Today's data marked "live (preliminary)"; older days marked "final".
- Severity: P2

## TC-ANALYTICS-DASHBOARD-017
- Pre: Page view firing.
- Expected: Each load of /usage emits page_view event (analytics_events) unless opted out.
- Severity: P1

## TC-ANALYTICS-DASHBOARD-018
- Pre: Page view scope.
- Expected: page_views table or analytics_events with type=page_view; URL stored without query strings containing PII.
- Severity: P0

## TC-ANALYTICS-DASHBOARD-019
- Pre: Verify user can't see another user's usage.
- Expected: Direct access /usage?user_id=other → 403.
- Severity: P0

## TC-ANALYTICS-DASHBOARD-020
- Pre: Currency formatting.
- Expected: Costs in USD with locale-appropriate separators.
- Severity: P3

## TC-ANALYTICS-DASHBOARD-021
- Pre: Time zone display.
- Expected: Times in user's TZ; UTC stored backend.
- Severity: P2

## TC-ANALYTICS-DASHBOARD-022
- Pre: Chart hover tooltip.
- Expected: Shows date + value; not clipped.
- Severity: P3

## TC-ANALYTICS-DASHBOARD-023
- Pre: Chart with single data point.
- Expected: Renders point; no degenerate axis errors.
- Severity: P3

## TC-ANALYTICS-DASHBOARD-024
- Pre: Chart with very large numbers.
- Expected: Y-axis abbreviated (k/M/B).
- Severity: P3

## TC-ANALYTICS-DASHBOARD-025
- Pre: Chart with negative numbers (none expected).
- Expected: Defensive — clamps at zero or shows error to admin.
- Severity: P3

## TC-ANALYTICS-DASHBOARD-026
- Pre: User reload after long idle.
- Expected: Data refresh; cached values invalidated periodically.
- Severity: P2

## TC-ANALYTICS-DASHBOARD-027
- Pre: User views period spanning DST change.
- Expected: Day count correct; no off-by-one.
- Severity: P3

## TC-ANALYTICS-DASHBOARD-028
- Pre: User clicks event-type breakdown.
- Expected: Drill into per-event chart.
- Severity: P2

## TC-ANALYTICS-DASHBOARD-029
- Pre: API errors when fetching analytics.
- Expected: UI shows "Could not load" with retry; no crash.
- Severity: P1

## TC-ANALYTICS-DASHBOARD-030
- Pre: Workspace upgrade reflected.
- Expected: Cap updates immediately on /usage; no stale.
- Severity: P1
