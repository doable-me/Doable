# TC-ANALYTICS-EVENTS — analytics_events Insertion

Scope: `analytics_events` table — event types, schema, deduplication, opt-out.

---

## TC-ANALYTICS-EVENTS-001
- Pre: User performs action (e.g., create project).
- Expected: analytics_events row written with event_type='project_create', user_id, workspace_id, project_id, timestamp, metadata jsonb.
- Severity: P0

## TC-ANALYTICS-EVENTS-002
- Pre: User opts out via analytics_settings.opted_out=true.
- Steps: Perform tracked action.
- Expected: No analytics_events row written for that user; technical/security events still recorded (login, etc.).
- Severity: P0

## TC-ANALYTICS-EVENTS-003
- Pre: Anonymous (logged-out) action.
- Expected: Event recorded with anonymous session id; user_id null; respects do-not-track header if set.
- Severity: P1

## TC-ANALYTICS-EVENTS-004
- Pre: Browser sends DNT=1.
- Expected: No analytics_events row.
- Severity: P1

## TC-ANALYTICS-EVENTS-005
- Pre: Event types enumerated.
- Expected: Documented set: page_view, project_create, project_open, file_save, ai_message_sent, publish_clicked, member_invite, billing_view, etc. All match a controlled vocabulary.
- Severity: P1

## TC-ANALYTICS-EVENTS-006
- Pre: Unknown event_type submitted.
- Expected: 400 reject; not silently inserted.
- Severity: P1

## TC-ANALYTICS-EVENTS-007
- Pre: Event metadata exceeds 16KB.
- Expected: Rejected or truncated; never crashes.
- Severity: P1

## TC-ANALYTICS-EVENTS-008
- Pre: Burst 1k events/sec from one user.
- Expected: Rate limited; spike absorbed by buffered batch insert.
- Severity: P1

## TC-ANALYTICS-EVENTS-009
- Pre: Event from forged user_id.
- Expected: Server uses session-derived user_id, ignores client-supplied; security_finding if mismatch.
- Severity: P0

## TC-ANALYTICS-EVENTS-010
- Pre: Schema columns indexed (event_type, created_at, user_id).
- Expected: Index used in /usage queries; no full scan.
- Severity: P1

## TC-ANALYTICS-EVENTS-011
- Pre: Event PII content.
- Expected: No raw email or password ever in metadata; user_id is FK only.
- Severity: P0

## TC-ANALYTICS-EVENTS-012
- Pre: Event written from API and from web both.
- Expected: Single canonical insert path (api endpoint /api/analytics/events); web posts to it.
- Severity: P1

## TC-ANALYTICS-EVENTS-013
- Pre: Event deduplication via idempotency_key.
- Expected: Same key replayed → no second row.
- Severity: P1

## TC-ANALYTICS-EVENTS-014
- Pre: Event timestamps validation.
- Expected: Server overrides client-supplied timestamp; uses server clock.
- Severity: P1

## TC-ANALYTICS-EVENTS-015
- Pre: Event from server-side action (e.g., scheduled job).
- Expected: Recorded with actor='system'; user_id null.
- Severity: P2

## TC-ANALYTICS-EVENTS-016
- Pre: Sample-rate per event type.
- Expected: High-volume events (page_view) sampled; sample rate documented in metadata.
- Severity: P2

## TC-ANALYTICS-EVENTS-017
- Pre: Verify retention policy.
- Expected: Raw events older than retention (e.g., 365d) purged; aggregations remain.
- Severity: P1

## TC-ANALYTICS-EVENTS-018
- Pre: Aggregation job runs daily.
- Expected: analytics_daily_stats row per (date, event_type, scope).
- Severity: P0

## TC-ANALYTICS-EVENTS-019
- Pre: Aggregation idempotent.
- Expected: Re-running for same date overwrites or upserts; no duplicates.
- Severity: P1

## TC-ANALYTICS-EVENTS-020
- Pre: Aggregation correctness check.
- Expected: Sum of analytics_daily_stats for a day = count of analytics_events for that day.
- Severity: P0

## TC-ANALYTICS-EVENTS-021
- Pre: Aggregation skipped for opt-out users.
- Expected: Their events excluded; opt-out documented.
- Severity: P0

## TC-ANALYTICS-EVENTS-022
- Pre: On-demand aggregate via admin trigger.
- Expected: /admin/analytics/recompute?date=YYYY-MM-DD; admin only; audited.
- Severity: P2

## TC-ANALYTICS-EVENTS-023
- Pre: Event schema migration.
- Expected: New event_type added; backwards compatible read; old events still queryable.
- Severity: P2

## TC-ANALYTICS-EVENTS-024
- Pre: Event writes during DB partition rotate.
- Expected: No data loss; new rows go to current partition.
- Severity: P1

## TC-ANALYTICS-EVENTS-025
- Pre: Cross-region analytics ingestion.
- Expected: Single source of truth — single DB; no edge buffering that could lose data.
- Severity: P2

## TC-ANALYTICS-EVENTS-026
- Pre: Event with invalid jsonb metadata.
- Expected: Validation error 400; not stored.
- Severity: P1

## TC-ANALYTICS-EVENTS-027
- Pre: Verify GDPR right to erasure.
- Expected: Deleting user clears analytics_events.user_id (anonymizes) without breaking aggregates.
- Severity: P0

## TC-ANALYTICS-EVENTS-028
- Pre: Tracing → event correlation.
- Expected: Each event contains optional trace_id linking to OTel trace.
- Severity: P2

## TC-ANALYTICS-EVENTS-029
- Pre: Analytics ingestion endpoint behind auth.
- Expected: /api/analytics/events requires session; cross-origin blocked.
- Severity: P0

## TC-ANALYTICS-EVENTS-030
- Pre: Verify clock skew tolerance.
- Expected: created_at server-stamped; client clock irrelevant.
- Severity: P2
