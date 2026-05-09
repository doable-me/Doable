# TC-AUTH-OAUTH — GitHub & Google OAuth, Copilot/Repo flows

API endpoints (all GET):
- `/auth/github`, `/auth/github/callback`
- `/auth/google`, `/auth/google/callback`
- `/auth/github/copilot`, `/auth/github/copilot/callback`
- `/auth/github/repo/callback`

Source: `services/api/src/routes/auth/oauth.ts`.
State is `base64url(JSON({type, nonce[, returnTo|workspaceId]}))`.

## TC-AUTH-OAUTH-001 — GET /auth/github redirects to GitHub
- **Steps:** GET /auth/github (no follow).
- **Expected:** 302 to `https://github.com/login/oauth/authorize?...&state=<base64url>`.
- **Severity:** smoke

## TC-AUTH-OAUTH-002 — State param is base64url JSON with `type:"github"` and `nonce`
- **Steps:** Decode state from redirect URL.
- **Expected:** Object has `type:"github"` and a UUID-like `nonce`.
- **Severity:** smoke

## TC-AUTH-OAUTH-003 — GET /auth/github with `?returnTo=/dashboard`
- **Steps:** GET /auth/github?returnTo=/dashboard.
- **Expected:** State payload contains `returnTo:"/dashboard"`.
- **Severity:** medium

## TC-AUTH-OAUTH-004 — `returnTo=//evil.example` rejected
- **Steps:** GET /auth/github?returnTo=//evil.example.
- **Expected:** State omits `returnTo` (per `safeReturnTo` rule rejecting `//`).
- **Severity:** high

## TC-AUTH-OAUTH-005 — `returnTo=https://evil.example` rejected
- **Steps:** GET /auth/github?returnTo=https://evil.example.
- **Expected:** State omits `returnTo`.
- **Severity:** high

## TC-AUTH-OAUTH-006 — `returnTo=` length > 512 rejected
- **Steps:** Pass 600-char path.
- **Expected:** Omitted.
- **Severity:** medium

## TC-AUTH-OAUTH-007 — /auth/github/callback without code → redirect login?error=missing_code
- **Steps:** GET /auth/github/callback?state=<valid>.
- **Expected:** 302 to `${FRONTEND_URL}/login?error=missing_code`.
- **Severity:** high

## TC-AUTH-OAUTH-008 — Callback with invalid state (not base64url JSON) → invalid_state
- **Steps:** GET /auth/github/callback?code=xxx&state=junk.
- **Expected:** 302 to `/login?error=invalid_state`.
- **Severity:** smoke

## TC-AUTH-OAUTH-009 — Callback with missing nonce in state → invalid_state
- **Steps:** Encode state `{type:"github"}` and pass.
- **Expected:** 302 to `/login?error=invalid_state`.
- **Severity:** high

## TC-AUTH-OAUTH-010 — Callback with type=google but route=github → invalid_state
- **Steps:** Encode state with `type:"google"`.
- **Expected:** 302 to `/login?error=invalid_state`.
- **Severity:** high

## TC-AUTH-OAUTH-011 — Callback returnTo poisoning blocked
- **Steps:** Encode state with `returnTo:"//evil.example"` and a valid nonce/type. Use any code.
- **Expected:** Final redirect drops returnTo (sanitizer applied again before redirect).
- **Severity:** high

## TC-AUTH-OAUTH-012 — Callback returnTo `/safe/path` honoured
- **Steps:** State `{type:"github",nonce:"x",returnTo:"/safe/path"}` (valid GH code in test).
- **Expected:** Final redirect `${FRONTEND_URL}/auth/callback#accessToken=...&refreshToken=...&returnTo=/safe/path`.
- **Severity:** medium

## TC-AUTH-OAUTH-013 — Tokens delivered via URL fragment, NOT query string
- **Steps:** Inspect Location header on successful callback.
- **Expected:** URL contains `#accessToken=...` (after `#`), not `?accessToken=...`.
- **Severity:** smoke

## TC-AUTH-OAUTH-014 — GitHub user with no email → no_email
- **Pre:** Mock GH response with `email: null`.
- **Steps:** Trigger callback.
- **Expected:** 302 to `/login?error=no_email`.
- **Severity:** high

## TC-AUTH-OAUTH-015 — GitHub callback creates new user record
- **Pre:** Email not in `users`.
- **Steps:** Complete callback.
- **Expected:** Row inserted via `createOrUpdateOAuthUser`. `github_id` populated. Auto workspace created.
- **Severity:** smoke

## TC-AUTH-OAUTH-016 — GitHub callback updates existing user (account linking)
- **Pre:** Email already exists with no `github_id`.
- **Steps:** Complete callback.
- **Expected:** Row updated to add `github_id` and refresh `avatar_url`.
- **Severity:** high

## TC-AUTH-OAUTH-017 — GitHub callback with HTML in `name` is sanitized
- **Pre:** Mock GH name `<script>alert(1)</script>Bob`.
- **Steps:** Complete.
- **Expected:** `display_name = "Bob"` (per `stripHtmlTags`).
- **Severity:** high

## TC-AUTH-OAUTH-018 — GET /auth/google redirects with valid state
- **Steps:** GET /auth/google.
- **Expected:** 302 with state `type:"google"`.
- **Severity:** smoke

## TC-AUTH-OAUTH-019 — Google callback type mismatch
- **Steps:** Encode `{type:"github",nonce:"x"}` to /auth/google/callback.
- **Expected:** 302 to `/login?error=invalid_state`.
- **Severity:** high

## TC-AUTH-OAUTH-020 — Google callback success creates user
- **Pre:** New email.
- **Steps:** Complete.
- **Expected:** Row inserted with `google_id`. Auto workspace created.
- **Severity:** smoke

## TC-AUTH-OAUTH-021 — Google callback DB unavailable → fallback synthetic user
- **Pre:** DB outage simulated.
- **Steps:** Complete.
- **Expected:** Tokens issued with `userId = "google-<sub>"`. Document — this allows login but fallback user has limited DB-backed features.
- **Severity:** medium

## TC-AUTH-OAUTH-022 — Google callback HTML in name sanitized
- **Steps:** Mock name `<img src=x onerror=alert(1)>Anna`.
- **Expected:** `display_name = "Anna"`.
- **Severity:** high

## TC-AUTH-OAUTH-023 — OAuth re-login does not create duplicate user
- **Pre:** User created via Google previously.
- **Steps:** Complete Google callback again.
- **Expected:** Same user id; no new row.
- **Severity:** smoke

## TC-AUTH-OAUTH-024 — Account merge: Google email matches existing password user
- **Pre:** Email registered with password.
- **Steps:** Sign in with Google using same email.
- **Expected:** 302 success; same user id; `google_id` added to existing row.
- **Severity:** smoke

## TC-AUTH-OAUTH-025 — Account merge: GitHub email matches existing Google user
- **Pre:** Same email signed up via Google.
- **Steps:** Sign in via GitHub.
- **Expected:** Same user; both `google_id` and `github_id` set.
- **Severity:** high

## TC-AUTH-OAUTH-026 — OAuth callback issues 7d refresh token
- **Steps:** Inspect refresh token claims.
- **Expected:** `exp - iat ≈ 604800`.
- **Severity:** medium

## TC-AUTH-OAUTH-027 — Unknown OAuth code rejected by provider
- **Steps:** Send fake `code` to /auth/github/callback.
- **Expected:** 302 to `/login?error=oauth_failed` (catch in oauth.ts:76).
- **Severity:** high

## TC-AUTH-OAUTH-028 — OAuth state CSRF via fixed nonce attack
- **Steps:** Capture victim's state then craft a callback with a different code but same state.
- **Expected:** Server has no nonce store; mostly relies on attacker not knowing the code. Document — true CSRF defence requires nonce binding to a session cookie. File finding: nonce in state is unbound.
- **Severity:** high

## TC-AUTH-OAUTH-029 — OAuth state from another env tunnel doesn't authenticate
- **Steps:** Capture a staging state and replay on prod /auth/github/callback.
- **Expected:** State decodes the same shape; the actual `code` exchanged is provider-validated against the redirect URI. Cross-env replay fails because GH compares redirect_uri.
- **Severity:** medium

## TC-AUTH-OAUTH-030 — OAuth callback with extra query params (e.g., `?error=access_denied`)
- **Steps:** GET /auth/github/callback?error=access_denied&state=<valid>.
- **Expected:** 302 with `error=missing_code` (no `code` provided).
- **Severity:** medium

## TC-AUTH-OAUTH-031 — Copilot callback requires workspaceId in state
- **Steps:** GET /auth/github/copilot/callback?code=x&state=<no workspaceId>.
- **Expected:** Redirects to `/ai-settings/callback?githubToken=...&githubLogin=...&githubId=...` (no workspaceId), but later UI rejects without ws.
- **Severity:** medium

## TC-AUTH-OAUTH-032 — Copilot callback invalid state → invalid_state
- **Steps:** State = junk.
- **Expected:** 302 to `/ai-settings?error=invalid_state`.
- **Severity:** high

## TC-AUTH-OAUTH-033 — Copilot callback missing code → missing_code
- **Steps:** No code.
- **Expected:** 302 to `/ai-settings?error=missing_code`.
- **Severity:** high

## TC-AUTH-OAUTH-034 — Copilot callback exchanges code, redirects with token in QUERY (not fragment)
- **Steps:** Inspect.
- **Expected:** URL contains `?githubToken=...` — note discrepancy vs core OAuth (uses fragment). File ergonomic finding (token in query may end up in Referer/server logs).
- **Severity:** high

## TC-AUTH-OAUTH-035 — Repo callback persists token to DB when userId in state
- **Pre:** state has valid `userId`.
- **Steps:** Complete repo callback.
- **Expected:** Row in `github_user_tokens` with scopes `repo,read:user`.
- **Severity:** high

## TC-AUTH-OAUTH-036 — Repo callback skips DB store when no userId
- **Steps:** state has no userId.
- **Expected:** No DB write; redirect with token in URL.
- **Severity:** medium

## TC-AUTH-OAUTH-037 — Repo callback returnUrl honoured
- **Pre:** state.returnUrl = `https://staging.doable.me/projects/abc`.
- **Steps:** Complete.
- **Expected:** Final redirect to that URL with `?githubToken=...`. Note: returnUrl is not validated as same-origin — file finding for open redirect via crafted state.
- **Severity:** high

## TC-AUTH-OAUTH-038 — Repo callback with no returnUrl falls back to /editor/<projectId>
- **Pre:** state.projectId set, returnUrl empty.
- **Steps:** Complete.
- **Expected:** Redirect `${FRONTEND_URL}/editor/<projectId>?githubConnected=true&githubToken=...`.
- **Severity:** medium

## TC-AUTH-OAUTH-039 — Repo callback failure after exchange
- **Pre:** GH token exchange succeeds but DB upsert fails.
- **Steps:** Complete.
- **Expected:** 302 with `error=github_oauth_failed`.
- **Severity:** medium

## TC-AUTH-OAUTH-040 — OAuth state not validated against issuing browser session
- **Steps:** Two browsers: Browser A fetches /auth/github, Browser B uses A's state on /auth/github/callback.
- **Expected:** B successfully signs in (no session-binding) → finding. Document and file as TC-SEC-CSRF-005.
- **Severity:** high
