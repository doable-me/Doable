# TC-THUMB-QUEUE — Thumbnail Job Queue & Concurrency

Scope: Job queue depth, concurrency caps, priority, fairness, DLQ.

---

## TC-THUMB-QUEUE-001
- Pre: 10 publishes simultaneously.
- Expected: Jobs enqueued; processed up to MAX_THUMB_CONCURRENCY; rest waiting.
- Severity: P1

## TC-THUMB-QUEUE-002
- Pre: MAX_THUMB_CONCURRENCY=3.
- Expected: 3 active workers; queue drains in order.
- Severity: P1

## TC-THUMB-QUEUE-003
- Pre: Job priority.
- Expected: User-requested re-render higher priority than auto-on-publish.
- Severity: P2

## TC-THUMB-QUEUE-004
- Pre: Per-user fairness.
- Expected: One user's many publishes don't starve others; round-robin per user.
- Severity: P2

## TC-THUMB-QUEUE-005
- Pre: Server restart.
- Expected: In-flight jobs persisted; resumed on restart; no duplicate completion.
- Severity: P1

## TC-THUMB-QUEUE-006
- Pre: Queue overflow.
- Expected: Backpressure to publish flow; user gets "thumbnail will generate later" notice.
- Severity: P2

## TC-THUMB-QUEUE-007
- Pre: Job DLQ after 3 retries.
- Expected: Moved to dead-letter; admin can inspect cause; user notified to re-publish.
- Severity: P2

## TC-THUMB-QUEUE-008
- Pre: Admin retries DLQ entry.
- Expected: Re-enqueued normally.
- Severity: P2

## TC-THUMB-QUEUE-009
- Pre: Cancel queued job.
- Expected: User can cancel via project settings if "pending"; cannot cancel "generating".
- Severity: P3

## TC-THUMB-QUEUE-010
- Pre: Job timeout setting.
- Expected: Configurable per platform_config; default 30s.
- Severity: P2

## TC-THUMB-QUEUE-011
- Pre: Job lock prevents duplicate workers.
- Expected: Postgres advisory lock per job_id; second worker skips.
- Severity: P1

## TC-THUMB-QUEUE-012
- Pre: Worker crash mid-job.
- Expected: Lock released after timeout; another worker picks up; max retries respected.
- Severity: P1

## TC-THUMB-QUEUE-013
- Pre: Queue metrics emitted.
- Expected: queue_depth, queue_age_p95, success_rate, fail_rate metrics.
- Severity: P2

## TC-THUMB-QUEUE-014
- Pre: Alert when queue stalls.
- Expected: If no progress >5 min and depth >10, admin alert.
- Severity: P2

## TC-THUMB-QUEUE-015
- Pre: Queue scoped per env.
- Expected: dev / staging / prod each have isolated queues.
- Severity: P1

## TC-THUMB-QUEUE-016
- Pre: Queue cancellation when project deleted.
- Expected: Pending jobs cancelled; no orphan thumbnails.
- Severity: P1

## TC-THUMB-QUEUE-017
- Pre: Reorder priority via admin tool.
- Expected: Admin can boost specific job to top.
- Severity: P3

## TC-THUMB-QUEUE-018
- Pre: Queue empty.
- Expected: Workers idle; no hot-loop; CPU low.
- Severity: P2

## TC-THUMB-QUEUE-019
- Pre: Mass re-render (admin operation).
- Expected: Throttled to avoid overload; progress reported.
- Severity: P2

## TC-THUMB-QUEUE-020
- Pre: Per-project rate limit.
- Expected: One project can't queue >5 thumbnails/min; throttled.
- Severity: P2
