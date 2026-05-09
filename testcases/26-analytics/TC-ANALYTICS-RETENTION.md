# TC-ANALYTICS-RETENTION — Retention & Aggregation

Scope: analytics_daily_stats aggregation, retention purge, recompute, opt-out delete.

---

## TC-ANALYTICS-RETENTION-001
- Pre: Cron job nightly at 02:00 UTC.
- Steps: Verify execution.
- Expected: Aggregates yesterday's analytics_events into analytics_daily_stats; success log.
- Severity: P0

## TC-ANALYTICS-RETENTION-002
- Pre: Aggregate row schema.
- Expected: (date, scope, event_type, count, distinct_users, sum_value).
- Severity: P0

## TC-ANALYTICS-RETENTION-003
- Pre: Aggregate idempotency.
- Steps: Run twice for same date.
- Expected: Upsert; counts identical.
- Severity: P1

## TC-ANALYTICS-RETENTION-004
- Pre: Aggregate skipped opt-out users.
- Expected: count excludes their events.
- Severity: P0

## TC-ANALYTICS-RETENTION-005
- Pre: Retention policy: raw events 365d.
- Expected: Older events purged; daily stats remain.
- Severity: P1

## TC-ANALYTICS-RETENTION-006
- Pre: Retention policy: page_views 365d.
- Expected: Older purged; aggregates kept indefinitely.
- Severity: P1

## TC-ANALYTICS-RETENTION-007
- Pre: Daily stats retention.
- Expected: Indefinite or 5y; configurable.
- Severity: P2

## TC-ANALYTICS-RETENTION-008
- Pre: User exercises right to deletion.
- Expected: All raw rows for user deleted/anonymized; daily stats updated to subtract their counts.
- Severity: P0

## TC-ANALYTICS-RETENTION-009
- Pre: Workspace deletion.
- Expected: Workspace-scoped events anonymized; aggregates remain.
- Severity: P1

## TC-ANALYTICS-RETENTION-010
- Pre: Aggregation job failure.
- Expected: Retried with backoff; admin alerted; lock released.
- Severity: P1

## TC-ANALYTICS-RETENTION-011
- Pre: Aggregation job lock prevents overlap.
- Expected: Distributed advisory lock; second instance noop.
- Severity: P1

## TC-ANALYTICS-RETENTION-012
- Pre: Recompute via admin endpoint.
- Expected: /admin/analytics/recompute?date=YYYY-MM-DD recomputes one day; admin only.
- Severity: P2

## TC-ANALYTICS-RETENTION-013
- Pre: Recompute range.
- Expected: /admin/analytics/recompute?from=&to= covers multi-day; runs in background.
- Severity: P2

## TC-ANALYTICS-RETENTION-014
- Pre: Aggregation correctness invariants.
- Expected: Sum of count across event_types = total raw events for date.
- Severity: P0

## TC-ANALYTICS-RETENTION-015
- Pre: Aggregation distinct_users uses HyperLogLog or distinct count.
- Expected: Reasonable accuracy; cross-day sums use HLL union if applicable.
- Severity: P2

## TC-ANALYTICS-RETENTION-016
- Pre: Verify partition strategy for analytics_events.
- Expected: Partitioned by month; old partitions detached for retention.
- Severity: P1

## TC-ANALYTICS-RETENTION-017
- Pre: Detached partition export.
- Expected: Optional cold archive (S3-compatible) — content here is open-source-only or not used.
- Severity: P3

## TC-ANALYTICS-RETENTION-018
- Pre: Aggregation respects timezone.
- Expected: All aggregation in UTC date boundaries; dashboard converts to user TZ.
- Severity: P1

## TC-ANALYTICS-RETENTION-019
- Pre: Aggregation row constraints.
- Expected: Unique (date, scope, event_type); no duplicates.
- Severity: P0

## TC-ANALYTICS-RETENTION-020
- Pre: Backfill missing days.
- Expected: Detection job spots gaps; runs aggregate; admin notified if gap >2d.
- Severity: P2
