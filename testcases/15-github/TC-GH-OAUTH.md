# TC-GH-OAUTH — GitHub OAuth flow for per-user repo token

Covers `/auth/github/repo/callback`: full OAuth roundtrip, state handling, scope validation, token storage in `github_user_tokens`.

---

## TC-GH-OAUTH-001
**Title:** Initial connect — redirect to GitHub authorize
**Pre:** Logged-in user, no existing GitHub connection
**Steps:**
1. Click "Connect GitHub" in settings
**Expected:** Redirect to `https://github.com/login/oauth/authorize?client_id=...&scope=repo&state=<csrf>&redirect_uri=...`. State stored in session.
**Severity:** Critical

## TC-GH-OAUTH-002
**Title:** Authorize and callback — happy path
**Pre:** Above, user accepts
**Steps:**
1. GitHub redirects to /auth/github/repo/callback?code=...&state=...
**Expected:** Server exchanges code for access_token; stores in github_user_tokens; user redirected back to settings with success toast.
**Severity:** Critical

## TC-GH-OAUTH-003
**Title:** State mismatch on callback
**Pre:** Pending OAuth flow with known state
**Steps:**
1. Manually navigate to /auth/github/repo/callback?code=foo&state=wrong
**Expected:** 400 "Invalid state"; no token saved. Audit logged as suspicious.
**Severity:** Critical

## TC-GH-OAUTH-004
**Title:** State expired (>10 min)
**Pre:** State stored 11 min ago
**Steps:**
1. Callback hit
**Expected:** 400 "State expired; please retry connect".
**Severity:** High

## TC-GH-OAUTH-005
**Title:** User denies authorization
**Pre:** OAuth dialog
**Steps:**
1. User clicks Cancel; GitHub redirects with `error=access_denied`
**Expected:** Server detects error param; UI shows "Connection cancelled"; no token stored.
**Severity:** High

## TC-GH-OAUTH-006
**Title:** GitHub returns code but token exchange 5xx
**Pre:** Mock GitHub /access_token to return 502
**Steps:**
1. Callback hit
**Expected:** Server retries with backoff (1-2 retries); on persistent failure shows error and prompts retry.
**Severity:** Medium

## TC-GH-OAUTH-007
**Title:** Token exchange returns insufficient scope
**Pre:** User authorized but GitHub honored only `read:user` (not `repo`)
**Steps:**
1. Callback hit
**Expected:** Server detects missing `repo` scope; rejects connection; user shown explanation and re-prompt.
**Severity:** High

## TC-GH-OAUTH-008
**Title:** Multiple connect attempts replace token
**Pre:** Existing token
**Steps:**
1. User reconnects (fresh OAuth)
**Expected:** Old token invalidated (best-effort); new token saved. One row per user.
**Severity:** Medium

## TC-GH-OAUTH-009
**Title:** Token stored encrypted at rest
**Pre:** github_user_tokens row
**Steps:**
1. Inspect DB row
**Expected:** Token column is ciphertext (e.g., AES-256-GCM); key from app secrets. Plain token never logged.
**Severity:** Critical

## TC-GH-OAUTH-010
**Title:** Token decrypt failure handled
**Pre:** Encryption key changed
**Steps:**
1. User attempts a github action
**Expected:** Server detects decrypt failure; prompts user to reconnect; no crash.
**Severity:** High

## TC-GH-OAUTH-011
**Title:** Disconnect flow
**Pre:** Connected
**Steps:**
1. Click Disconnect
2. Confirm
**Expected:** Row deleted; UI shows "Not connected"; tokens revoked via GitHub API best-effort.
**Severity:** High

## TC-GH-OAUTH-012
**Title:** Disconnect doesn't break existing project repo links (read-only mode)
**Pre:** Connected; project linked to repo
**Steps:**
1. Disconnect
**Expected:** Project shows "GitHub disconnected; reconnect to push/pull". Existing commits log preserved.
**Severity:** Medium

## TC-GH-OAUTH-013
**Title:** OAuth callback URL prefix-matched
**Pre:** Multi-env supabase trick (per memory)
**Steps:**
1. Configured callback `/auth/github/repo/callback`
**Expected:** Same path used across envs; env determined server-side from referrer/state, not URL.
**Severity:** High

## TC-GH-OAUTH-014
**Title:** Connect from /editor returns to /editor after callback
**Pre:** User initiated from project page
**Steps:**
1. Click Connect; complete OAuth
**Expected:** Redirected back to original page (return_to in state).
**Severity:** Medium

## TC-GH-OAUTH-015
**Title:** Anonymous user blocked from initiating OAuth
**Pre:** Logged out
**Steps:**
1. Hit /auth/github/repo/start
**Expected:** 401; redirected to login.
**Severity:** High

## TC-GH-OAUTH-016
**Title:** OAuth scope minimal (`repo` only, not full org access)
**Pre:** Authorize URL inspected
**Steps:**
1. Click Connect
**Expected:** Scope query string is `repo` (or `public_repo` if user opts in). Not `admin:repo_hook` unless explicitly needed for webhooks.
**Severity:** Critical

## TC-GH-OAUTH-017
**Title:** Token rate limit awareness
**Pre:** GitHub API responses include rate-limit headers
**Steps:**
1. Make many calls
**Expected:** Server reads x-ratelimit-remaining; throttles when low; surfaces error if exceeded.
**Severity:** Medium

## TC-GH-OAUTH-018
**Title:** GitHub username + avatar fetched on connect
**Pre:** Just connected
**Steps:**
1. Inspect settings page
**Expected:** Shows "@github-username" and avatar; cached server-side.
**Severity:** Low

## TC-GH-OAUTH-019
**Title:** Token introspection on app startup
**Pre:** Server restart
**Steps:**
1. After restart, user visits page using gh
**Expected:** Tokens still valid (no required redo); just a /user check confirms.
**Severity:** Low

## TC-GH-OAUTH-020
**Title:** Token revoked from GitHub side
**Pre:** User went to github.com and revoked
**Steps:**
1. User triggers a push from doable
**Expected:** Server gets 401 from GitHub; surfaces "GitHub token revoked, reconnect"; row marked invalid.
**Severity:** High

## TC-GH-OAUTH-021
**Title:** Connect from mobile/Safari (PKCE if applicable)
**Pre:** Mobile
**Steps:**
1. Click Connect; complete on mobile
**Expected:** Same flow works; no mobile-specific bug.
**Severity:** Medium

## TC-GH-OAUTH-022
**Title:** OAuth state cookie SameSite=Lax
**Pre:** Inspect cookie
**Steps:**
1. After Connect click
**Expected:** State cookie is HttpOnly, Secure, SameSite=Lax (so the redirect from GitHub still carries it).
**Severity:** High

## TC-GH-OAUTH-023
**Title:** Concurrent OAuth flows in same session
**Pre:** User opens Connect in two tabs
**Steps:**
1. Complete second; first becomes stale
**Expected:** Second succeeds; first errors with state mismatch (acceptable).
**Severity:** Low

## TC-GH-OAUTH-024
**Title:** OAuth error param `redirect_uri_mismatch` handled
**Pre:** Misconfigured app
**Steps:**
1. Callback with error
**Expected:** Surfaces explicit message; admins notified via metric.
**Severity:** Medium

## TC-GH-OAUTH-025
**Title:** Disconnect button confirms
**Pre:** Connected
**Steps:**
1. Click Disconnect
**Expected:** Confirmation modal warns project repo links won't push/pull until reconnect.
**Severity:** Low

## TC-GH-OAUTH-026
**Title:** OAuth client_id env present
**Pre:** Server start
**Steps:**
1. Start without GITHUB_OAUTH_CLIENT_ID set
**Expected:** Connect button disabled with "GitHub integration not configured" message; admin sees clear log.
**Severity:** High

## TC-GH-OAUTH-027
**Title:** OAuth callback CSRF protection (state HMAC)
**Pre:** Custom-built malicious link
**Steps:**
1. Try with forged state
**Expected:** State HMAC mismatch → 400.
**Severity:** Critical

## TC-GH-OAUTH-028
**Title:** Token refresh (if scope grants it) — none for classic OAuth tokens
**Pre:** N/A
**Steps:**
1. Inspect logic
**Expected:** No refresh token flow needed for classic tokens; document this. Future: GitHub Apps with refresh.
**Severity:** Low

## TC-GH-OAUTH-029
**Title:** GitHub App vs OAuth — current implementation note
**Pre:** N/A
**Steps:**
1. Inspect /auth/github/repo/start
**Expected:** Clear in code/docs which model used; if OAuth App, fine-grained PAT-like behavior.
**Severity:** Low

## TC-GH-OAUTH-030
**Title:** Audit log entry on connect/disconnect
**Pre:** N/A
**Steps:**
1. Connect; disconnect
**Expected:** Two audit events: `github_connected`, `github_disconnected` with actor, ts, ip.
**Severity:** Medium
