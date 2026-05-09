# zantaz Test Accounts (mirrored from staging on 2026-05-10)

All passwords: `TestPass123!`  ·  Tokens cached at `testcases/evidence/_tokens-zantaz.json`

| Email | User ID | Personal WS | Plan | Shared WS Role | Platform Admin |
|---|---|---|---|---|---|
| qa-owner@doable.test | d58e6d7c-915a-414f-ac3b-f2161c0b508d | 4bbd6afe-c396-4da6-add5-d71f73f51801 | enterprise | owner | YES |
| qa-admin@doable.test | ee0b7a40-01c0-46d4-a4b7-191a97b3e230 | a5a1aabc-1234-4111-9111-aaaaaaaaaaaa | enterprise | admin | no |
| qa-member@doable.test | ff9c6e4d-5081-4ed3-a46d-2f1ad046ec4c | e0eb30b8-5078-4180-bde9-de8dde600384 | enterprise | member | no |
| qa-viewer@doable.test | 881a1616-8747-4496-915c-fa93c820e67e | a5a1aabc-1234-4444-9444-bbbbbbbbbbbb | enterprise | viewer | no |
| qa-alice@doable.test | 798d2ac4-bd16-49ac-99c1-af545d1a0993 | a5a1aabc-1234-5555-9555-cccccccccccc | enterprise | member | no |
| qa-bob@doable.test | 6f65e62b-e225-4132-8fb9-759c81bd5ca4 | a5a1aabc-1234-6666-9666-dddddddddddd | enterprise | member | no |
| qa-charlie@doable.test | 807f3867-9273-4c5a-bce2-adc80da9bb11 | a5a1aabc-1234-7777-9777-eeeeeeeeeeee | enterprise | (not added) | no |

**Shared workspace:** `a5a1aabc-9999-0000-0000-000000000001` (slug `qa-shared`, owner=qa-owner)

## Endpoints
- API: https://zantaz-api.doable.me
- WS: wss://zantaz-ws.doable.me
- Web: https://zantaz.doable.me

## Stripe bypass
All `credit_balances` rows for qa-* users seeded with daily=100k, monthly=1M, rollover=1M, plan_type=enterprise. `STRIPE_SECRET_KEY` empty in zantaz .env (Stripe-dependent tests will be marked BLOCKED with stripe reason).
