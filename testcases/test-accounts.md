# Test Accounts (staging.doable.me)

All passwords: `TestPass123!`

| Email | User ID | Purpose | Platform Admin |
|---|---|---|---|
| qa-owner@doable.test | d58e6d7c-915a-414f-ac3b-f2161c0b508d | Primary platform owner / first owner | YES (promoted via DB) |
| qa-admin@doable.test | ee0b7a40-01c0-46d4-a4b7-191a97b3e230 | Workspace admin role | no |
| qa-member@doable.test | ff9c6e4d-5081-4ed3-a46d-2f1ad046ec4c | Workspace member role | no |
| qa-viewer@doable.test | 881a1616-8747-4496-915c-fa93c820e67e | Workspace viewer role | no |
| qa-alice@doable.test | 798d2ac4-bd16-49ac-99c1-af545d1a0993 | Collaboration peer A | no |
| qa-bob@doable.test | 6f65e62b-e225-4132-8fb9-759c81bd5ca4 | Collaboration peer B | no |
| qa-charlie@doable.test | (TBD via DB direct, rate-limited on signup) | Collaboration peer C | no |

**Live discovery during signup:** `/auth/register` is rate-limited at 5 registrations per hour per IP. The 6th call returned `429 {"error":"Too many requests, please try again later."}`. This is by design (`registerRateLimiter` in services/api/src/routes/auth/helpers.ts:64) and is filed as TC-AUTH-RATE-001.

## Workspaces (auto-created by /auth/register)
Each user gets a personal workspace named `<displayName>'s workspace`, plan = `free`, slug derived from displayName.

## Stripe bypass strategy
`STRIPE_SECRET_KEY` is empty in staging .env. Plans/credits are bypassed by direct SQL:
- UPDATE workspaces SET plan='enterprise' WHERE owner_id='<user_id>';
- INSERT/UPSERT into credit_balances with high allowances.
- INSERT into subscriptions with status='active', plan='enterprise', stripe_customer_id='ws_test_<id>'.
