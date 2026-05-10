# CORPUS-PARSED — Summary

**Run:** 2026-05-10T12:26:42Z · **Target:** https://zantaz-api.doable.me

**Total parseable:** 980 of 6001

| Result | Count |
|---|---:|
| PASS | 157 |
| INFO | 260 |
| AUTH_OK | 44 |
| AUTH_BLOCK | 12 |
| FAIL_5XX | 9 |
| MISMATCH | 498 |
| SKIP | 0 |
| FAIL | 0 |

## Failures (FAIL_5XX + first 30 MISMATCH)

| TC | METHOD | PATH | expected | got | note |
|---|---|---|---|---|---|
| TC-AUTH-LOGIN-003 | POST | `/auth/login` | 401 | 400 | expected 401 got 400 |
| TC-AUTH-LOGIN-010 | POST | `/auth/login` | 401 | 400 | expected 401 got 400 |
| TC-AUTH-LOGIN-012 | POST | `/auth/login` | 429 | 400 | expected 429 got 400 |
| TC-AUTH-LOGIN-040 | POST | `/auth/refresh` | 200 | 400 | expected 200 got 400 |
| TC-AUTH-ME-016 | GET | `/auth/me.` | 200 | 404 | expected 200 got 404 |
| TC-AUTH-ME-017 | GET | `/auth/me.` | 200 | 404 | expected 200 got 404 |
| TC-AUTH-ME-021 | OPTIONS | `/auth/me` | 200 | 204 | expected 200 got 204 |
| TC-AUTH-ME-024 | GET | `/auth/me?token=` | 401 | 200 | expected 401 got 200 |
| TC-AUTH-MISC-001 | OPTIONS | `/auth/login` | 200 | 204 | expected 200 got 204 |
| TC-AUTH-MISC-007 | POST | `/auth/login` | 413 | 400 | expected 413 got 400 |
| TC-AUTH-MISC-032 | POST | `/auth/login` | 200 | 400 | expected 200 got 400 |
| TC-AUTH-MISC-035 | POST | `/auth/login` | 401 | 400 | expected 401 got 400 |
| TC-AUTH-FORGOT-001 | POST | `/auth/forgot-password` | 200 | 429 | expected 200 got 429 |
| TC-AUTH-RESET-001 | POST | `/auth/reset-password` | 200 | 429 | expected 200 got 429 |
| TC-AUTH-RESET-012 | POST | `/auth/login` | 401 | 400 | expected 401 got 400 |
| TC-AUTH-RESET-013 | POST | `/auth/login` | 200 | 400 | expected 200 got 400 |
| TC-AUTH-REFRESH-002 | POST | `/auth/refresh` | 401 | 400 | expected 401 got 400 |
| TC-AUTH-REFRESH-003 | POST | `/auth/refresh` | 200 | 400 | expected 200 got 400 |
| TC-AUTH-REFRESH-011 | POST | `/auth/refresh` | 401 | 400 | expected 401 got 400 |
| TC-AUTH-REFRESH-014 | POST | `/auth/refresh` | 401 | 400 | expected 401 got 400 |
| TC-AUTH-REFRESH-017 | POST | `/auth/refresh` | 401 | 400 | expected 401 got 400 |
| TC-AUTH-REFRESH-018 | POST | `/auth/refresh` | 401 | 400 | expected 401 got 400 |
| TC-AUTH-REGISTER-001 | POST | `/auth/register` | 201 | 429 | expected 201 got 429 |
| TC-AUTH-REGISTER-002 | POST | `/auth/register` | 201 | 429 | expected 201 got 429 |
| TC-AUTH-REGISTER-003 | POST | `/auth/register` | 409 | 429 | expected 409 got 429 |
| TC-AUTH-REGISTER-004 | POST | `/auth/register` | 400 | 429 | expected 400 got 429 |
| TC-WS-CRUD-003 | GET | `/workspaces` | 401 | 200 | expected 401 got 200 |
| TC-WS-CRUD-005 | POST | `/workspaces` | 201 | 400 | expected 201 got 400 |
| TC-WS-CRUD-029 | GET | `/:id` | 200 | 404 | expected 200 got 404 |
| TC-WS-CRUD-033 | PATCH | `/:id` | 200 | 404 | expected 200 got 404 |
| TC-WS-CRUD-036 | PATCH | `/:id` | 200 | 404 | expected 200 got 404 |
| TC-WS-CRUD-037 | PATCH | `/:id` | 400 | 404 | expected 400 got 404 |
| TC-WS-CRUD-038 | PATCH | `/:id` | 200 | 404 | expected 200 got 404 |
| TC-WS-CRUD-039 | PATCH | `/:id` | 200 | 404 | expected 200 got 404 |
| TC-WS-CRUD-040 | PATCH | `/:id` | 200 | 404 | expected 200 got 404 |
| TC-WS-CRUD-042 | DELETE | `/:id` | 200 | 404 | expected 200 got 404 |
| TC-WS-CRUD-047 | POST | `/:id/transfer` | 200 | 404 | expected 200 got 404 |
| TC-WS-INV-001 | POST | `/:id/members/invite` | 201 | 404 | expected 201 got 404 |
| TC-WS-INV-023 | DELETE | `/:id/invites/:inviteId` | 200 | 404 | expected 200 got 404 |
| TC-WS-INV-027 | POST | `/workspaces/invite/accept` | 200 | 400 | expected 200 got 400 |
| TC-WS-INV-037 | POST | `/:id/invite-link` | 201 | 404 | expected 201 got 404 |
| TC-WS-INV-041 | DELETE | `/:id/invites/` | 200 | 308 | expected 200 got 308 |
| TC-WS-MEM-001 | GET | `/:id/members` | 200 | 404 | expected 200 got 404 |
| TC-WS-MEM-005 | DELETE | `/:id/members/:userId` | 200 | 404 | expected 200 got 404 |
| TC-WS-MEM-009 | DELETE | `/:id/members/` | 400 | 308 | expected 400 got 308 |
| TC-WS-MEM-010 | DELETE | `/:id/members/` | 400 | 308 | expected 400 got 308 |
| TC-WS-MEM-015 | PATCH | `/:id/members/:userId` | 200 | 404 | expected 200 got 404 |
| TC-WS-MEM-023 | PATCH | `/:id` | 200 | 404 | expected 200 got 404 |
| TC-WS-MEM-027 | GET | `/workspaces/:id.` | 403 | 400 | expected 403 got 400 |
| TC-WS-PLAN-006 | POST | `/projects` | 403 | 400 | expected 403 got 400 |

## CSV: testcases\99-runlog\env1\CORPUS-PARSED-RESULTS.csv
