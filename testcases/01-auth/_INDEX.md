# 01-auth — Test case index

| File | Cases | Coverage |
|---|---|---|
| TC-AUTH-REGISTER.md | 60 | Account registration: validation, duplicates, password complexity, displayName XSS, rate limit, Argon2 storage, auto-workspace |
| TC-AUTH-LOGIN.md | 40 | Login flows: happy path, wrong creds, enumeration, rate limit, OAuth-only accounts, token shape |
| TC-AUTH-REFRESH-LOGOUT.md | 35 | Refresh rotation, replay protection, logout idempotence, post-reset invalidation, race conditions |
| TC-AUTH-ME-JWT.md | 40 | /auth/me, JWT validation, alg=none, key confusion, kid/jku, header smuggling |
| TC-AUTH-PASSWORD-RESET.md | 43 | Forgot/reset: token issue/use/expiry/reuse, complexity drift, refresh-token revoke on reset |
| TC-AUTH-OAUTH.md | 40 | GitHub & Google OAuth, state CSRF, returnTo open-redirect, account merge, Copilot/Repo callbacks |
| TC-AUTH-RATE-LIMIT.md | 20 | Per-endpoint limits, XFF rotation, key=unknown, concurrent burst, xray instrumentation |
| TC-AUTH-MISC.md | 40 | CORS, content types, headers, browser storage, host header forging, prototype pollution |

Total: ~318 test cases.
