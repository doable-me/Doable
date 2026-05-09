# TC-BILLING-CREDITS — Credit balances (daily, monthly, rollover)

Covers credit balance read endpoints, daily/monthly counters, rollover for topup, manual grants, audit, breakdown by user/workspace.

## TC-BILLING-CREDITS-001 — GET /billing/balance returns full balance (smoke)
- **Steps:** GET /billing/balance
- **Expected:** {dailyRemaining, dailyMax, monthlyRemaining, monthlyMax, topupRemaining, planUnlimited}
- **Severity:** smoke

## TC-BILLING-CREDITS-002 — Free user balance shape correct
- **Expected:** dailyMax=5; monthlyMax=plan default; topup=0
- **Severity:** smoke

## TC-BILLING-CREDITS-003 — Pro user balance shape
- **Severity:** high

## TC-BILLING-CREDITS-004 — Enterprise balance shape (planUnlimited=true)
- **Expected:** remaining null/Infinity; UI shows "Unlimited"
- **Severity:** high

## TC-BILLING-CREDITS-005 — Balance after one chat decremented
- **Severity:** smoke

## TC-BILLING-CREDITS-006 — Daily reset at UTC midnight reflected
- **Severity:** medium

## TC-BILLING-CREDITS-007 — Monthly reset at month boundary reflected
- **Severity:** medium

## TC-BILLING-CREDITS-008 — Topup pool persists across resets
- **Severity:** high

## TC-BILLING-CREDITS-009 — Topup decremented only after daily+monthly exhausted
- **Severity:** high

## TC-BILLING-CREDITS-010 — Decrement order: daily → monthly → topup
- **Severity:** medium

## TC-BILLING-CREDITS-011 — Manual grant by admin reflected
- **Steps:** POST /billing/grant {userId, amount:50}
- **Expected:** topupRemaining +=50
- **Severity:** medium

## TC-BILLING-CREDITS-012 — Grant requires admin role
- **Severity:** high

## TC-BILLING-CREDITS-013 — Grant cannot exceed configured cap per call
- **Severity:** medium

## TC-BILLING-CREDITS-014 — Negative grant rejected
- **Severity:** medium

## TC-BILLING-CREDITS-015 — Revoke grant via /billing/revoke
- **Severity:** medium

## TC-BILLING-CREDITS-016 — Balance breakdown per user (admin)
- **Steps:** GET /billing/balance?userId=
- **Severity:** medium

## TC-BILLING-CREDITS-017 — Balance breakdown per workspace (admin)
- **Severity:** medium

## TC-BILLING-CREDITS-018 — Balance API rate limited
- **Severity:** low

## TC-BILLING-CREDITS-019 — Concurrent decrement consistent
- **Pre:** balance=10
- **Steps:** 10 parallel sends
- **Expected:** final balance=0; no negatives; ledger sums to -10
- **Severity:** critical

## TC-BILLING-CREDITS-020 — Ledger entries sum to current balance
- **Steps:** SELECT SUM(amount) FROM credit_transactions vs balance row
- **Severity:** high

## TC-BILLING-CREDITS-021 — Ledger entry types: chat_message, topup, grant, refund, reset, expire
- **Severity:** medium

## TC-BILLING-CREDITS-022 — Reset transaction recorded at boundaries
- **Severity:** low

## TC-BILLING-CREDITS-023 — Expire transaction recorded for expiring topup
- **Pre:** topup with TTL
- **Severity:** medium

## TC-BILLING-CREDITS-024 — Topup TTL configurable per topup
- **Severity:** low

## TC-BILLING-CREDITS-025 — Balance rounding integer (no decimals)
- **Severity:** low

## TC-BILLING-CREDITS-026 — Balance returns 0 immediately after exhaust
- **Severity:** high

## TC-BILLING-CREDITS-027 — Balance API supports If-None-Match etag
- **Severity:** low

## TC-BILLING-CREDITS-028 — Balance widget polls SSE not interval
- **Severity:** low

## TC-BILLING-CREDITS-029 — Balance widget shows time-to-reset
- **Severity:** low

## TC-BILLING-CREDITS-030 — Get usage history paginated
- **Steps:** GET /billing/usage?limit=50
- **Severity:** medium

## TC-BILLING-CREDITS-031 — Usage history filter by date range
- **Severity:** medium

## TC-BILLING-CREDITS-032 — Usage history filter by user
- **Severity:** medium

## TC-BILLING-CREDITS-033 — Usage history group by day
- **Severity:** medium

## TC-BILLING-CREDITS-034 — Usage history export CSV
- **Severity:** low

## TC-BILLING-CREDITS-035 — Daily/monthly counters table indexed
- **Steps:** EXPLAIN query
- **Severity:** low

## TC-BILLING-CREDITS-036 — Counters survive db restart
- **Severity:** medium

## TC-BILLING-CREDITS-037 — Reset job runs idempotently
- **Pre:** invoke twice
- **Severity:** medium

## TC-BILLING-CREDITS-038 — Reset job records single row even if late
- **Severity:** low

## TC-BILLING-CREDITS-039 — Per-user override visible in balance
- **Severity:** medium

## TC-BILLING-CREDITS-040 — Workspace pool shared (when configured)
- **Severity:** high

## TC-BILLING-CREDITS-041 — Workspace pool exhaust blocks all members
- **Severity:** high

## TC-BILLING-CREDITS-042 — Owner top-up restores members
- **Severity:** high

## TC-BILLING-CREDITS-043 — Time travel test: clock skew handled
- **Severity:** low

## TC-BILLING-CREDITS-044 — Cron job logs success
- **Severity:** low

## TC-BILLING-CREDITS-045 — Failed reset job alerted
- **Severity:** medium
