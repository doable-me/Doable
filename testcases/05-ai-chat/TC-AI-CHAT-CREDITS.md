# TC-AI-CHAT-CREDITS — Credit deduction, gating, and refunds

Covers `services/api/src/middleware/credits.ts` enforcement, `credit_balances`, `credit_transactions`, `credit_usage_log`, daily/monthly counters, plan-driven quotas, and 429 surfacing on exhaustion.

## TC-AI-CHAT-CREDITS-001 — One credit deducted per agent message (smoke)
- **Pre:** balance.daily=5
- **Steps:** send 1 message
- **Expected:** balance.daily=4; one row in `credit_transactions` with type=`chat_message`, amount=-1
- **Severity:** smoke

## TC-AI-CHAT-CREDITS-002 — One credit deducted per plan message
- **Steps:** send plan-mode message
- **Expected:** -1; transaction.metadata.mode="plan"
- **Severity:** high

## TC-AI-CHAT-CREDITS-003 — One credit deducted per chat message
- **Steps:** send chat-mode message
- **Expected:** -1
- **Severity:** high

## TC-AI-CHAT-CREDITS-004 — Free plan default daily quota = 5
- **Pre:** new free user, balance reset
- **Steps:** GET /billing/balance
- **Expected:** daily=5, monthly=null or default monthly cap per config
- **Severity:** smoke

## TC-AI-CHAT-CREDITS-005 — Pro plan daily quota larger than free
- **Pre:** pro plan
- **Expected:** daily ≥ configured pro quota (e.g. 100)
- **Severity:** high

## TC-AI-CHAT-CREDITS-006 — Business plan quota
- **Pre:** business plan
- **Expected:** quota matches plan config
- **Severity:** medium

## TC-AI-CHAT-CREDITS-007 — Enterprise plan unlimited (sentinel)
- **Pre:** enterprise
- **Steps:** send 100 messages
- **Expected:** all succeed; no 429; balance shows `unlimited:true`
- **Severity:** high

## TC-AI-CHAT-CREDITS-008 — Boundary: balance=1 send succeeds
- **Pre:** daily=1
- **Steps:** send message
- **Expected:** 200; daily=0
- **Severity:** high

## TC-AI-CHAT-CREDITS-009 — Boundary: balance=0 send rejected
- **Pre:** daily=0; monthly=0
- **Steps:** send
- **Expected:** HTTP 429 with body `{error:"insufficient_credits", retryAfter:<sec until reset>}`
- **Severity:** smoke

## TC-AI-CHAT-CREDITS-010 — 429 includes resetAt
- **Steps:** parse 429 body
- **Expected:** `resetAt` ISO timestamp; matches next UTC midnight (daily) or month boundary
- **Severity:** medium

## TC-AI-CHAT-CREDITS-011 — Daily counter resets at UTC midnight
- **Pre:** daily=0 at 23:59
- **Steps:** wait to 00:01 UTC; send message
- **Expected:** daily reset to plan default; deduct 1; succeed
- **Severity:** medium

## TC-AI-CHAT-CREDITS-012 — Monthly counter resets at month boundary
- **Pre:** monthly=0 at month end
- **Steps:** cross to next month; send
- **Expected:** monthly resets per plan
- **Severity:** medium

## TC-AI-CHAT-CREDITS-013 — Daily exhausted but monthly remaining → 429 with daily reason
- **Pre:** daily=0, monthly>0
- **Steps:** send
- **Expected:** 429 reason=`daily_exceeded`; resetAt=tomorrow
- **Severity:** high

## TC-AI-CHAT-CREDITS-014 — Monthly exhausted but daily remaining → 429
- **Pre:** monthly=0, daily>0
- **Steps:** send
- **Expected:** 429 reason=`monthly_exceeded`
- **Severity:** high

## TC-AI-CHAT-CREDITS-015 — Topup adds to monthly bucket (not daily)
- **Pre:** topup +50
- **Expected:** balance.monthly increased; daily unchanged
- **Severity:** high

## TC-AI-CHAT-CREDITS-016 — Topup credits never expire (rollover)
- **Pre:** topup credits present
- **Steps:** wait month boundary
- **Expected:** topup pool retained; only base monthly resets
- **Severity:** high

## TC-AI-CHAT-CREDITS-017 — Failed message rolls back deduction
- **Pre:** balance=1; force provider error
- **Steps:** send
- **Expected:** SSE error; transaction shows -1 then +1 refund; final balance=1
- **Severity:** high

## TC-AI-CHAT-CREDITS-018 — Aborted stream prorates or refunds (per policy)
- **Steps:** abort at 50%
- **Expected:** policy A: full refund; policy B: charged. Verify configured behavior matches spec; transaction trail consistent
- **Severity:** medium

## TC-AI-CHAT-CREDITS-019 — Tool-only message (no LLM completion) still costs 1
- **Steps:** trigger tool that completes without LLM
- **Expected:** -1 deducted
- **Severity:** medium

## TC-AI-CHAT-CREDITS-020 — Race: two concurrent sends decrement atomically
- **Pre:** balance=1; fire 2 sends
- **Expected:** only one succeeds; other gets 429; final balance=0; no negative balance
- **Severity:** critical

## TC-AI-CHAT-CREDITS-021 — Race across 5 concurrent sends with balance=3
- **Steps:** fire 5
- **Expected:** exactly 3 succeed, 2 receive 429; balance=0
- **Severity:** critical

## TC-AI-CHAT-CREDITS-022 — Negative balance impossible (DB constraint)
- **Steps:** attempt manual UPDATE balance=-1
- **Expected:** CHECK constraint violation
- **Severity:** high

## TC-AI-CHAT-CREDITS-023 — Credit usage logged with provider/model/tokens
- **Steps:** inspect `credit_usage_log` after send
- **Expected:** row with provider, model, prompt_tokens, completion_tokens, total_tokens, cost_units
- **Severity:** medium

## TC-AI-CHAT-CREDITS-024 — Daily and monthly aggregates updated
- **Steps:** send; query `ai_usage_daily` and `ai_usage_monthly`
- **Expected:** counts incremented for current day/month
- **Severity:** medium

## TC-AI-CHAT-CREDITS-025 — Per-user override increases quota
- **Pre:** admin sets user.dailyOverride=20
- **Steps:** GET balance
- **Expected:** daily=20
- **Severity:** medium

## TC-AI-CHAT-CREDITS-026 — Per-user override decreases below plan default
- **Pre:** override=2 on pro plan
- **Steps:** send 3
- **Expected:** 3rd gets 429; override respected
- **Severity:** medium

## TC-AI-CHAT-CREDITS-027 — Workspace owner sees consumption per member
- **Steps:** GET /billing/usage?breakdown=user
- **Expected:** array with per-user counts
- **Severity:** medium

## TC-AI-CHAT-CREDITS-028 — UI shows balance widget
- **Steps:** open editor sidebar
- **Expected:** widget shows daily/monthly/topup; tooltip explains each
- **Severity:** smoke

## TC-AI-CHAT-CREDITS-029 — Balance widget updates after each message
- **Steps:** send msg; observe widget
- **Expected:** decrement reflects within 1s of `done` event
- **Severity:** smoke

## TC-AI-CHAT-CREDITS-030 — Insufficient credit toast on 429
- **Steps:** send when balance=0
- **Expected:** toast "Out of credits — top up or upgrade" with CTAs
- **Severity:** smoke

## TC-AI-CHAT-CREDITS-031 — 429 retry-after honored by client
- **Steps:** capture 429; client schedule
- **Expected:** retry button enables at resetAt
- **Severity:** low

## TC-AI-CHAT-CREDITS-032 — Plan downgrade adjusts quota next cycle
- **Pre:** pro→free at month end
- **Steps:** wait reset
- **Expected:** new daily=5; existing topup retained
- **Severity:** medium

## TC-AI-CHAT-CREDITS-033 — Plan upgrade applies immediately
- **Pre:** free→pro at 14:00
- **Steps:** GET balance
- **Expected:** daily upgraded to pro level immediately
- **Severity:** high

## TC-AI-CHAT-CREDITS-034 — Subscription canceled but period active retains pro quota
- **Pre:** subscription cancel_at_period_end=true
- **Expected:** pro quota until period_end; thereafter free
- **Severity:** high

## TC-AI-CHAT-CREDITS-035 — Past-due subscription gates messages
- **Pre:** subscription.status=past_due
- **Steps:** send
- **Expected:** HTTP 402 with billing_required; no deduction
- **Severity:** high

## TC-AI-CHAT-CREDITS-036 — Stripe bypass mode treats all paid plans as available
- **Pre:** STRIPE_SECRET_KEY=""
- **Steps:** /billing/upgrade pro
- **Expected:** plan switched without Stripe call; subscription row marked synthetic
- **Severity:** medium

## TC-AI-CHAT-CREDITS-037 — BYOK provider does not deduct credits (config)
- **Pre:** workspace BYOK Anthropic key set; policy "free for byok"
- **Steps:** send
- **Expected:** 0 credits deducted; usage_log marks `byok=true`
- **Severity:** medium

## TC-AI-CHAT-CREDITS-038 — BYOK still logs token usage
- **Steps:** inspect usage_log
- **Expected:** tokens recorded; cost_units=0
- **Severity:** low

## TC-AI-CHAT-CREDITS-039 — Multi-tool chain charges once per user message
- **Pre:** message triggers 5 tool calls
- **Expected:** 1 credit deducted, not 5
- **Severity:** high

## TC-AI-CHAT-CREDITS-040 — Cost variant by model (configurable)
- **Pre:** sonnet=1, opus=5 (config)
- **Steps:** send opus message
- **Expected:** -5
- **Severity:** medium

## TC-AI-CHAT-CREDITS-041 — Insufficient for higher model falls back
- **Pre:** balance=2 needs opus(5)
- **Steps:** send
- **Expected:** 429 OR auto-fallback to cheaper model with notice; behavior matches spec
- **Severity:** medium

## TC-AI-CHAT-CREDITS-042 — Negative cost (refund) recorded as positive transaction amount
- **Steps:** trigger refund
- **Expected:** transaction amount=+1, type=`refund`, ref=originalTxnId
- **Severity:** medium

## TC-AI-CHAT-CREDITS-043 — Owner can grant credits to member
- **Steps:** admin POST /billing/grant {userId, amount:10}
- **Expected:** member's topup +=10; transaction type=grant
- **Severity:** medium

## TC-AI-CHAT-CREDITS-044 — Grant audited
- **Steps:** inspect audit
- **Expected:** entry by:adminId, target:userId, amount
- **Severity:** medium

## TC-AI-CHAT-CREDITS-045 — Grant cannot make negative balance
- **Steps:** grant -1000
- **Expected:** HTTP 400 (negative not allowed) OR results in 0 floor
- **Severity:** medium

## TC-AI-CHAT-CREDITS-046 — UI shows quota progress ring
- **Steps:** observe widget
- **Expected:** ring fills 0→100% as quota consumed; color shifts at 80%
- **Severity:** low

## TC-AI-CHAT-CREDITS-047 — Daily reset preserves topup
- **Steps:** topup 50; consume 30; cross day
- **Expected:** topup remaining=20; daily reset
- **Severity:** medium

## TC-AI-CHAT-CREDITS-048 — Insufficient on attachments-heavy message
- **Pre:** balance=1; large attachment doubles cost
- **Steps:** send
- **Expected:** rejected with 429 if cost>balance; UI explains
- **Severity:** medium

## TC-AI-CHAT-CREDITS-049 — Free user pulled into enterprise workspace inherits unlimited
- **Pre:** invite free user to enterprise workspace
- **Steps:** send in that workspace
- **Expected:** unlimited applies for that workspace; user's personal workspace still free
- **Severity:** high

## TC-AI-CHAT-CREDITS-050 — Per-workspace quota overrides plan
- **Pre:** workspace dailyOverride=200
- **Steps:** all members share pool
- **Expected:** pool decremented across users; 429 once shared pool empty
- **Severity:** medium
