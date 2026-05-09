# 26-analytics — Test Case Index

Analytics events, page_views, /usage dashboard, opt-out, aggregation, retention.

| File | Focus | Cases |
|---|---|---|
| TC-ANALYTICS-EVENTS.md | analytics_events insertion + opt-out | 30 |
| TC-ANALYTICS-PAGE-VIEWS.md | page_views logging + sanitization | 25 |
| TC-ANALYTICS-DASHBOARD.md | /usage rendering + charts + export | 30 |
| TC-ANALYTICS-RETENTION.md | analytics_daily_stats aggregate + purge | 20 |

Cross-cutting:
- analytics_settings.opted_out=true halts all analytics for a user.
- All ingestion endpoints behind session auth + CSRF + DNT respect.
- PII never stored in metadata (no raw email/password).
- Aggregations idempotent and recomputable per-day by admin.
- GDPR right-to-erasure cascades to anonymize user_id everywhere.
