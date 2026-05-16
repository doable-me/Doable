# Doable API Contract

## Authentication & Session

### POST /auth/logout — Idempotent, anon-accessible

The logout endpoint returns **HTTP 200** even when called without an Authorization header or valid refresh token. This is intentional — logout is idempotent by design. Users who have already logged out (or never logged in) should not receive a 401 error; instead, the operation succeeds as a no-op.

**Route definition:** `services/api/src/routes/auth/core.ts:155`

**Behavior:**
- Without refresh token: 200 `{"message":"Logged out successfully"}`
- With valid refresh token: 200 + revokes the token from `refresh_tokens` table
- No Authorization header required

**Rationale:** Access tokens are stateless JWTs that expire naturally. Refresh tokens are revoked server-side. Requiring auth on logout breaks cleanup flows where a session has already expired. SDKs that call `logout()` as a cleanup action should not fail if the session is already gone.

**Related TC:** `TC-AUTH-LOGOUT-002, -003, -004` (test suite archived; see git history)

---

## URL Conventions

### Trailing slashes — API paths should NOT end with /

When calling API routes, **omit trailing slashes.** For example:
- ✓ `GET /projects/abc123/files`
- ✗ `GET /projects/abc123/files/`

**Why:** The server issues a **308 Permanent Redirect** from `/foo/` → `/foo`, which is correct HTTP behavior. However, some HTTP clients (including Cloudflare Tunnel in certain configurations) drop the `Authorization` header during a 308 redirect, causing the followed request to return 401 instead of reaching the handler.

**Evidence:** `BUG-R10-TRAILING-SLASH-AUTH-DROP-001`

**Workaround:** Strip trailing slashes client-side or document in SDK that authenticated calls must use non-trailing-slash paths.

**Related TC:** `TC-AUTH-LOGOUT-007` (test verifies no trailing slash in logout path; test suite archived, see git history)

---

## Status Codes

### 200 OK
Successful operation (with or without side effects).

### 400 Bad Request
Request validation failed (e.g., invalid JSON, missing required fields, malformed input).

### 401 Unauthorized
Missing or invalid Authorization header, or stateless JWT verification failed.

### 409 Conflict
Resource already exists (e.g., duplicate email on registration).

### 500 Internal Server Error
Unhandled exception. Error messages in development mode may contain diagnostic info; production hides implementation details.
