# 06-billing — Test Case Index

| File | Area | Cases |
|---|---|---|
| TC-BILLING-PLANS.md | Plans, limits, upgrade/downgrade, cancel | 50 |
| TC-BILLING-CREDITS.md | Credit balances, daily/monthly, rollover, ledger | 45 |
| TC-BILLING-TOPUP.md | Topup packages, purchase, refund, promo codes | 40 |
| TC-BILLING-WEBHOOK.md | Stripe webhook events, signature, idempotency, bypass | 45 |
| TC-BILLING-PORTAL.md | Stripe portal, invoices, plan limits panel | 40 |

**Total:** 220 cases

## Notes
- Stripe is bypassed in staging (STRIPE_SECRET_KEY="") — tests must verify graceful skip
- Credit semantics shared with 05-ai-chat/TC-AI-CHAT-CREDITS.md
- Audit log assertions cross-reference 10-admin
