# Authentication Flow Code Analysis

**Date:** 2026-04-09
**Scope:** Full auth flow -- backend endpoints, frontend hooks/providers, JWT handling, OAuth callbacks

---

## CRITICAL Issues

### C1. Tokens Passed in URL Query Parameters During OAuth Callback

**Files:** `services/api/src/routes/auth.ts` (lines 304-305, 341-342), `apps/web/src/app/auth/callback/page.tsx` (lines 27-28)

The OAuth callback flow redirects the user to the frontend with `accessToken` and `refreshToken` in the URL query string:

```ts
// auth.ts line 304-305 (GitHub callback)
const params = new URLSearchParams({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
return c.redirect(`${FRONTEND_URL}/auth/callback?${params.toString()}`);
```

Tokens in URLs are logged by browsers in history, proxies, CDNs, Cloudflare access logs, and server access logs. The refresh token is long-lived (7 days) and its exposure is especially dangerous. These tokens will remain in `window.location.search` and browser history until explicitly cleared.

**The callback page never clears the URL.** After storing tokens it calls `router.replace("/dashboard")` which removes them from the visible URL bar, but they remain in browser history.

**Recommendation:** Use a short-lived authorization code pattern instead of passing raw tokens. Alternatively, use `window.history.replaceState` immediately to strip tokens from the URL before any processing, and set tokens via a secure HTTP-only cookie or use a fragment (`#`) instead of query params.

---

### C2. No Rate Limiting on Authentication Endpoints

**File:** `services/api/src/routes/auth.ts` -- all endpoints

The rate limiter middleware exists at `services/api/src/middleware/rate-limit.ts` but is NOT applied to any auth route. The `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, and `/auth/refresh` endpoints have zero throttling.

This enables:
- Brute-force password attacks against `/auth/login`
- Credential stuffing
- Email bombing via `/auth/forgot-password`
- Refresh token enumeration via `/auth/refresh`

**Recommendation:** Apply `rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 })` (or similar) to `/auth/login`, `/auth/register`, `/auth/forgot-password`, and `/auth/reset-password`. Consider a stricter limit on login (e.g. 5 attempts per 15 minutes per IP).

---

### C3. Hardcoded Fallback JWT Secret in Production

**Files:** `services/api/src/lib/jwt.ts` (line 17), `services/api/src/middleware/auth.ts` (line 19-20)

Both files contain:

```ts
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-dev-secret-change-me"
);
```

If `JWT_SECRET` is not set in the environment (or is accidentally unset during deploy), the server silently uses a well-known hardcoded secret. Any attacker can forge valid JWTs. There is no startup check that validates `JWT_SECRET` is set and has sufficient entropy.

**Recommendation:** Throw a fatal error at startup if `JWT_SECRET` is missing or is the fallback value. Add a length/entropy check.

---

### C4. Duplicate JWT Signing Functions -- Potential Secret Drift

**Files:** `services/api/src/lib/jwt.ts` (lines 24-35, 40-48) AND `services/api/src/middleware/auth.ts` (lines 99-112, 117-127)

Both files define `signAccessToken` and `signRefreshToken` with identical logic. The `auth.ts` routes import from `lib/jwt.ts` (line 10), while the middleware file also exports its own copies. If someone edits one but not the other (e.g., changing expiry or adding claims), tokens signed by one module could fail verification by the other. The middleware's `signAccessToken` also reads `JWT_ACCESS_TOKEN_EXPIRES_IN` from env, while `lib/jwt.ts` hardcodes `"15m"` -- these could diverge if the env var is set.

**Wait -- correction:** Looking more carefully, `lib/jwt.ts` line 33 also reads `process.env.JWT_ACCESS_TOKEN_EXPIRES_IN ?? "15m"`. So they are currently identical. But having two copies is a maintenance trap.

**Recommendation:** Delete the duplicate `signAccessToken`/`signRefreshToken`/`verifyToken` from `middleware/auth.ts` and import them from `lib/jwt.ts`. Keep the middleware file focused on the Hono middleware only.

---

## HIGH Issues

### H1. hashToken Uses Base64 Truncation, Not a Cryptographic Hash

**File:** `services/api/src/routes/auth.ts` (lines 43-45)

```ts
function hashToken(token: string): string {
  return Buffer.from(token).toString("base64url").slice(0, 64);
}
```

This is NOT a hash function -- it is base64 encoding with truncation. Base64 is trivially reversible. If an attacker gains read access to the `refresh_tokens` table, they can decode every stored `token_hash` back to the original JWT refresh token. This defeats the entire purpose of hashing stored tokens.

Contrast with the password reset flow (line 228) which correctly uses `createHash("sha256")`.

**Recommendation:** Replace with `createHash("sha256").update(token).digest("hex")` to match the reset token pattern. This will require a one-time migration to re-hash existing stored refresh tokens (or simply delete them all, forcing re-login).

---

### H2. OAuth State Parameter Not Validated (CSRF Attack Vector)

**Files:** `services/api/src/routes/auth.ts` (lines 287-289, 292-309, 313-315, 318-347)

The GitHub and Google login flows generate a `state` parameter using `crypto.randomUUID()`, but that value is never stored server-side and never verified on callback:

```ts
// Line 288 -- state is generated but never stored
authRoutes.get("/github", (c) => {
  return c.redirect(getGitHubAuthUrl(crypto.randomUUID()));
});

// Line 292-309 -- callback never checks state
authRoutes.get("/github/callback", async (c) => {
  const code = c.req.query("code");
  // state is completely ignored
```

This makes the OAuth login flow vulnerable to CSRF attacks. An attacker can initiate an OAuth flow with their own account and trick a victim into completing it, linking the attacker's GitHub/Google account to the victim's session.

**Recommendation:** Store the `state` in a signed cookie (or server-side session) before the redirect, then verify it matches on callback before processing the code exchange.

---

### H3. Google OAuth DB-Failure Fallback Creates Phantom User IDs

**File:** `services/api/src/routes/auth.ts` (lines 324-338)

```ts
} catch (dbErr) {
  console.warn("[OAuth] DB unavailable, issuing token from Google profile:", dbErr);
  userId = `google-${googleUser.sub}`;
  email = googleUser.email;
}
```

When the DB is down during Google OAuth, the code mints a JWT with a synthetic user ID `google-<sub>`. This ID does not exist in any database table. Any API endpoint that does a DB lookup on `userId` (which is most of them) will return "user not found" or fail silently. If the DB comes back, the user has a valid JWT that refers to a non-existent user, but a real user with a different UUID may already exist for the same Google account. This creates a split-identity problem.

The GitHub callback (lines 292-309) does NOT have this fallback, so the two providers handle DB failures inconsistently.

**Recommendation:** Remove the DB-failure fallback. If the DB is down, return an error to the user ("Service temporarily unavailable, please try again"). Creating phantom tokens that will fail everywhere else is worse than showing an error.

---

### H4. /auth/me Fallback Response Missing isPlatformAdmin and platformRole

**File:** `services/api/src/routes/auth.ts` (lines 197-209)

When the DB is unavailable, the `/auth/me` endpoint returns a fallback user object:

```ts
return c.json({
  user: {
    id: userId,
    email: userEmail,
    displayName: userEmail.split("@")[0],
    avatarUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
});
```

This object is missing `isPlatformAdmin` and `platformRole` fields that `sanitizeUser()` normally provides (line 54-55). The frontend `AuthUser` interface expects these fields. While the frontend defaults them via `toAuthUser()`, a platform admin falling back to this path would lose their admin status silently.

**Recommendation:** Add `isPlatformAdmin: false` and `platformRole: "member"` to the fallback response for consistency.

---

### H5. Refresh Token Race Condition -- Concurrent Requests Can Invalidate Each Other

**Files:** `apps/web/src/lib/api.ts` (lines 55-93, 112-125), `services/api/src/routes/auth.ts` (lines 149-168)

The refresh flow is:
1. Frontend calls `/auth/refresh` with the old refresh token
2. Server deletes the old token hash from DB (line 160)
3. Server issues new tokens (line 164)
4. Frontend stores new tokens (line 84)

The frontend deduplication via `refreshPromise` (lines 114-118) prevents concurrent refresh calls from the SAME tab. However:

- **Multiple browser tabs** each have their own JS context. Tab A and Tab B can both read the same refresh token from localStorage and simultaneously call `/auth/refresh`. Tab A succeeds and deletes the old token. Tab B's request arrives and fails because the token hash is already deleted. Tab B then calls `clearTokens()` (line 87), nuking the NEW tokens that Tab A just stored. Both tabs are now logged out.

- **The 13-minute proactive refresh interval** (auth-provider.tsx line 157) and **the 401-retry refresh** (api.ts lines 112-125) can overlap if the proactive refresh fires just as a 401 retry happens.

**Recommendation:** Use a cross-tab lock (e.g., `BroadcastChannel` or `navigator.locks.request()`) to coordinate refresh. Alternatively, use a `localStorage` event listener to detect when tokens change and abort in-flight refresh calls.

---

### H6. reset-password Does Not Validate Password Complexity

**File:** `services/api/src/routes/auth.ts` (lines 37-39)

```ts
const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8).max(128),
});
```

The reset password schema only validates min/max length. The registration schema (line 27) requires uppercase, lowercase, and a number via regex. A user resetting their password can set a weak password like `aaaaaaaa` that would have been rejected during registration.

**Recommendation:** Apply the same password regex to `resetPasswordSchema`:
```ts
password: z.string().min(8).max(128)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Must contain uppercase, lowercase, and a number"),
```

---

## MEDIUM Issues

### M1. Demo Mode Creates Fake Tokens Stored in localStorage

**File:** `apps/web/src/providers/auth-provider.tsx` (lines 187-196)

```ts
const loginAsDemo = useCallback(() => {
  storeTokens({
    accessToken: "demo-token",
    refreshToken: "demo-refresh-token",
    expiresIn: 86400,
  });
  setUser(DEMO_USER);
  storeUser(DEMO_USER);
}, []);
```

The string `"demo-token"` is stored in localStorage. When any API call is made, `apiFetch` sends this as a `Bearer demo-token` header. The backend will reject it with a 401 (invalid JWT), which triggers the refresh flow, which also fails, which calls `clearTokens()`, logging the demo user out.

If demo mode is intended to work with real API calls, it needs a server-side demo token mechanism. If it's frontend-only, the `apiFetch` function needs to skip API calls when in demo mode to avoid the 401 cascade.

---

### M2. OAuth Callback Page Does Not Store isPlatformAdmin/platformRole

**File:** `apps/web/src/app/auth/callback/page.tsx` (lines 56-65)

```ts
const user = {
  id: res.user.id,
  email: res.user.email,
  displayName: res.user.displayName ?? res.user.email.split("@")[0] ?? res.user.email,
  avatarUrl: res.user.avatarUrl,
};
localStorage.setItem("doable_auth_user", JSON.stringify(user));
```

The callback page stores a user object that is missing `isPlatformAdmin` and `platformRole`. This means a platform admin who logs in via OAuth will not see admin UI until the `AuthProvider` runs its next `/auth/me` call (which happens on mount, but after the initial localStorage read). There's a brief flash where admin features are hidden.

**Recommendation:** Include `isPlatformAdmin` and `platformRole` in the stored user object, matching what `toAuthUser()` in the auth provider expects.

---

### M3. JWT Fallback in Callback Uses atob() Without URL-Safe Base64 Handling

**File:** `apps/web/src/app/auth/callback/page.tsx` (lines 72-74)

```ts
const jwtBody = accessToken.split(".")[1];
if (!jwtBody) throw new Error("Invalid JWT");
const payload = JSON.parse(atob(jwtBody));
```

JWTs use base64url encoding (with `-` and `_` instead of `+` and `/`). The `atob()` function handles standard base64 only. On most modern browsers this works because they're lenient, but it can fail in strict environments. Missing padding (`=`) can also cause issues.

**Recommendation:** Use a proper base64url decode:
```ts
const decoded = atob(jwtBody.replace(/-/g, '+').replace(/_/g, '/'));
```

---

### M4. Register Endpoint Leaks Email Existence

**File:** `services/api/src/routes/auth.ts` (lines 121-122)

```ts
const existing = await auth.findUserByEmail(email);
if (existing) return c.json({ error: "An account with this email already exists" }, 409);
```

This tells an attacker whether a specific email is registered. The `/auth/forgot-password` endpoint correctly avoids this (line 217), but the register endpoint does not.

**Recommendation:** This is a common tradeoff -- most apps do reveal email existence on registration for UX reasons. However, if email enumeration is a concern, consider returning a generic "check your email" response and sending a verification email regardless.

---

### M5. Refresh Token Stored in localStorage (Not httpOnly Cookie)

**Files:** `apps/web/src/lib/api.ts` (lines 15-38)

Both access and refresh tokens are stored in `localStorage`. This makes them accessible to any JavaScript running on the page, including XSS attacks. The refresh token has a 7-day lifetime, making it a high-value target.

**Recommendation:** Store the refresh token in an httpOnly, secure, sameSite cookie instead. The access token can remain in memory (not localStorage) since it's short-lived. This is a significant architectural change but is the industry best practice.

---

### M6. issueTokens Silently Swallows DB Errors

**File:** `services/api/src/routes/auth.ts` (lines 65-71)

```ts
try {
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await auth.storeRefreshToken({ userId, tokenHash, expiresAt });
} catch {
  // DB unavailable -- tokens still work for stateless JWT validation
}
```

If the DB is down and the refresh token hash is never stored, the refresh token will fail on its next use (because `findRefreshToken` will return nothing). The user gets logged in successfully but cannot refresh their session. This creates a confusing UX where the user appears logged in for 15 minutes and then gets silently logged out with no explanation.

**Recommendation:** At minimum, log a warning. Consider returning a header or response field indicating degraded mode so the frontend can warn the user.

---

### M7. No Account Lockout After Failed Login Attempts

**File:** `services/api/src/routes/auth.ts` (lines 131-146)

The login endpoint has no mechanism to lock accounts after repeated failed attempts. Combined with the absence of rate limiting (C2), this means unlimited password guessing per account.

**Recommendation:** Track failed login attempts per email in the DB (or in-memory). Lock the account for a progressive backoff period after N failures (e.g., 5 failures = 5 min lockout, 10 failures = 30 min lockout). Send an email notification to the account owner.

---

### M8. ensureWorkspace Has a Race Condition on Concurrent Logins

**File:** `services/api/src/routes/auth.ts` (lines 79-111)

```ts
const existing = await workspaces.listByUser(userId);
if (existing.length > 0) return;
// ... create workspace
```

If two requests hit `/auth/me` concurrently for a brand-new user (e.g., OAuth callback + immediate API call), both will see `existing.length === 0` and both will try to create a workspace. The slug uniqueness check (line 95-98) will catch this IF both generate the same slug, but if timing varies slightly, duplicate workspaces could be created.

**Recommendation:** Use a DB unique constraint on `(owner_id)` for personal workspaces, or use an INSERT ... ON CONFLICT DO NOTHING pattern.

---

## LOW Issues

### L1. Password Validation Mismatch Between Frontend and Backend

**Files:** `apps/web/src/app/(auth)/signup/page.tsx` (lines 31-39), `services/api/src/routes/auth.ts` (line 27)

The frontend shows a special character criterion (`/[^a-zA-Z0-9]/.test(password)`) and allows a "strength score >= 2" (which could pass without a special character). But the backend requires uppercase + lowercase + number via regex and does NOT require a special character.

The frontend shows 5 criteria including "Special character" but the backend doesn't enforce it. The frontend enforces `strength.score >= 2` which can pass with just length + mixed case (no number), but the backend regex requires a number.

A user could see all frontend checks pass but get a backend rejection, or vice versa.

**Recommendation:** Align frontend validation criteria exactly with backend Zod schema. Show the backend's actual requirements (uppercase, lowercase, number, 8+ chars) and validate identically on both sides.

---

### L2. OAuth Copilot Callback Passes GitHub Token in URL

**File:** `services/api/src/routes/auth.ts` (lines 379-385)

```ts
const params = new URLSearchParams({
  githubToken,
  githubLogin: ghUser.login,
  githubId: String(ghUser.id),
});
return c.redirect(`${FRONTEND_URL}/ai-settings/callback?${params.toString()}`);
```

The raw GitHub access token is passed in the URL query string. This token grants API access to the user's GitHub account and will be logged in browser history, proxy logs, and Cloudflare access logs.

**Recommendation:** Use a temporary server-side code or encrypted token transfer instead of passing the raw GitHub token in the URL.

---

### L3. Inconsistent User Object Between OAuth Callback and AuthProvider

**Files:** `apps/web/src/app/auth/callback/page.tsx` (lines 56-65 vs 73-80), `apps/web/src/providers/auth-provider.tsx` (lines 89-105)

The callback page writes a user object to localStorage with 4 fields (id, email, displayName, avatarUrl). The AuthProvider's `toAuthUser()` function expects 6 fields (adding isPlatformAdmin, platformRole). When the AuthProvider reads from localStorage on mount, it gets the incomplete object from the callback page. `toAuthUser()` handles this via defaults (`?? false`, `?? "member"`), but the incomplete object is still stored, so subsequent reads before `/auth/me` completes will lack these fields.

---

### L4. No CORS Configuration Visible on Auth Routes

**File:** `services/api/src/index.ts`

The auth routes don't have visible CORS configuration in the analyzed files. If CORS is misconfigured (e.g., `Access-Control-Allow-Origin: *` with credentials), it could allow any origin to make authenticated requests.

**Recommendation:** Verify CORS is restricted to the specific frontend origin (`NEXT_PUBLIC_APP_URL`) with credentials mode.

---

### L5. OAuth Error Handling Shows Raw Error Parameters

**File:** `apps/web/src/app/(auth)/login/page.tsx` (lines 59-66)

```ts
setError(
  OAUTH_ERROR_MESSAGES[errorParam] ??
    `Authentication error: ${errorParam}`
);
```

If an unknown error parameter is passed (e.g., `?error=<script>alert(1)</script>`), the raw value is rendered in the UI. React escapes HTML by default so this is not an XSS vulnerability, but it can display confusing or misleading messages to users.

**Recommendation:** Fall back to a generic message for unrecognized error codes instead of displaying the raw parameter value.

---

### L6. Logout Does Not Clear the Proactive Refresh Interval Properly

**Files:** `apps/web/src/providers/auth-provider.tsx` (lines 152-161, 177-185)

The proactive refresh `setInterval` (line 157) is tied to the `user` state via the effect's dependency. When `logout` sets `user` to `null`, the cleanup function runs and clears the interval. This is correct. However, there's a gap: if a refresh call is already in-flight when logout happens, the refresh could complete and re-store tokens after logout clears them.

**Recommendation:** Add an `AbortController` or a `loggedOut` ref that the refresh call checks before storing new tokens.

---

### L7. GitHub Repo Callback Accepts userId from State Parameter

**File:** `services/api/src/routes/auth.ts` (lines 395-448)

```ts
userId = decoded.userId ?? "";
// ...
if (userId) {
  const ghDb = githubQueries(sql);
  await ghDb.upsertUserToken({
    userId,
    // ...
  });
}
```

The `userId` comes from the `state` parameter, which was originally set by the frontend. An attacker could craft a malicious `state` parameter with a different user's ID to associate their GitHub token with another user's account. The state parameter is base64-encoded but not signed or encrypted.

**Recommendation:** Either validate the `userId` from state against the authenticated user's JWT, or remove `userId` from the state parameter entirely and extract it from the authenticated session.

---

### L8. refreshAccessToken Clears All Tokens on Network Errors

**File:** `apps/web/src/lib/api.ts` (lines 86-88)

```ts
} catch {
  clearTokens();
  return null;
}
```

If the refresh request fails due to a transient network error (not a 401), the code clears all tokens, forcing re-login. This is overly aggressive -- the user's refresh token may still be valid.

**Recommendation:** Only clear tokens on definitive rejection (4xx status codes). For network errors, leave tokens intact and retry later.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| CRITICAL | 4 | Token exposure in URLs, no rate limiting, hardcoded JWT secret, duplicate signing code |
| HIGH | 6 | Weak token hashing, no CSRF protection on OAuth, phantom user IDs, cross-tab race conditions |
| MEDIUM | 8 | Demo mode issues, missing fields, XSS surface, silent DB failures, no account lockout |
| LOW | 8 | Validation mismatches, error display, aggressive token clearing, unsigned state params |

The most urgent items to address are **C1** (tokens in URLs), **C2** (rate limiting), **C3** (JWT secret validation), and **H1** (refresh token hashing).
