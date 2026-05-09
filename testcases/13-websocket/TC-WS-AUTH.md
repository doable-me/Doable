# TC-WS-AUTH — WebSocket authentication and connection lifecycle

WS endpoint: `wss://staging-ws.doable.me/?token=<JWT>`.

JWT verification:
- Algorithm: as configured (likely HS256).
- Issuer: `JWT_ISSUER` env (default `doable`).
- Required claims: `sub`, `email`. Optional: `display_name`.
- Secret: `JWT_SECRET`.
- Token must be passed in URL query `?token=<jwt>`. Cookies and headers NOT supported by current WS server (verify).

Close codes:
- 4001 — missing token
- 4002 — invalid token

---

## TC-WS-AUTH-001 — Connect with valid JWT in query
- **Steps:** open `wss://staging-ws.doable.me/?token=<valid>`.
- **Expected:** connection accepted; server sends `{type:"connected",userId,resumeToken:""}`.
- **Severity:** smoke

## TC-WS-AUTH-002 — Connect without token → close 4001 "Missing token"
- **Steps:** open `wss://staging-ws.doable.me/`.
- **Expected:** close code 4001; reason "Missing token".
- **Severity:** smoke

## TC-WS-AUTH-003 — Empty token → close 4001
- **Steps:** `?token=`.
- **Expected:** falsy → 4001.
- **Severity:** medium

## TC-WS-AUTH-004 — Token with whitespace `?token=%20` → close 4002 (invalid jwt)
- **Severity:** low

## TC-WS-AUTH-005 — Garbage token "abc" → close 4002 "Invalid token"
- **Expected:** 4002.
- **Severity:** smoke

## TC-WS-AUTH-006 — Expired JWT (exp in past) → 4002
- **Severity:** high

## TC-WS-AUTH-007 — JWT signed with wrong secret → 4002
- **Severity:** high

## TC-WS-AUTH-008 — JWT signed with `none` algorithm → 4002 (jose rejects)
- **Severity:** high

## TC-WS-AUTH-009 — JWT with wrong issuer → 4002
- **Severity:** medium

## TC-WS-AUTH-010 — JWT missing `sub` claim → 4002 (verifyToken returns null)
- **Severity:** medium

## TC-WS-AUTH-011 — JWT missing `email` claim → 4002
- **Severity:** medium

## TC-WS-AUTH-012 — JWT with `display_name` populates state.displayName
- **Severity:** medium

## TC-WS-AUTH-013 — JWT without display_name falls back to email prefix (split @)
- **Severity:** medium

## TC-WS-AUTH-014 — Cookie-based auth NOT supported (token only via query)
- **Steps:** send Cookie header with JWT only.
- **Expected:** 4001 missing token (current code reads only `?token`).
- **Severity:** high

## TC-WS-AUTH-015 — Authorization header NOT supported
- **Severity:** medium

## TC-WS-AUTH-016 — Multiple `?token=` query params → first wins (per URL parsing)
- **Severity:** low

## TC-WS-AUTH-017 — Token URL-encoded
- **Severity:** medium

## TC-WS-AUTH-018 — Token containing `&` truncated by URL parsing → 4002
- **Severity:** medium

## TC-WS-AUTH-019 — Token >8KB length (large URL) — server rejects URL parse?
- **Severity:** medium

## TC-WS-AUTH-020 — Token from a different environment (prod token on staging) → 4002 (issuer mismatch or secret mismatch)
- **Severity:** high

## TC-WS-AUTH-021 — Connect twice with same token → both accepted (no per-token uniqueness)
- **Severity:** medium

## TC-WS-AUTH-022 — Token revoked / user deleted → still accepted (no DB check; JWT-only)
- **Notes:** document trust model — no online revocation.
- **Severity:** high

## TC-WS-AUTH-023 — Connection has long-running OTel span; spans end on close
- **Severity:** low

## TC-WS-AUTH-024 — Span includes `user_id` and `ws.display_name`
- **Severity:** low

## TC-WS-AUTH-025 — Per-message child spans hang off connection span
- **Severity:** low

## TC-WS-AUTH-026 — Disconnect: close handler triggers room.leave when in room
- **Severity:** smoke

## TC-WS-AUTH-027 — Disconnect: close clears `lastCursorMove[userId]`
- **Severity:** medium

## TC-WS-AUTH-028 — Disconnect: triggers room GC when room empty
- **Severity:** high

## TC-WS-AUTH-029 — Error event closes connection cleanly
- **Severity:** medium

## TC-WS-AUTH-030 — Heartbeat-ack: server replies to client heartbeat
- **Steps:** send `{type:"heartbeat"}` after joining a room.
- **Expected:** receive `{type:"heartbeat_ack"}`.
- **Severity:** smoke

## TC-WS-AUTH-031 — Server-side rooms tick every 30s (background)
- **Severity:** low

## TC-WS-AUTH-032 — Connect to /health (HTTP GET) returns 200 with rooms count
- **Severity:** smoke

## TC-WS-AUTH-033 — POST /internal/broadcast requires X-Internal-Secret
- **Steps:** POST without header.
- **Expected:** 403.
- **Severity:** high

## TC-WS-AUTH-034 — POST /internal/broadcast wrong secret → 403
- **Severity:** high

## TC-WS-AUTH-035 — POST /internal/broadcast valid → message broadcast to room
- **Severity:** high

## TC-WS-AUTH-036 — POST /internal/yjs/write requires secret
- **Severity:** high

## TC-WS-AUTH-037 — GET /internal/presence/:id no secret check (verify)
- **Notes:** code shows no secret check on /internal/presence and /internal/collab-active. File security gap if exposed.
- **Severity:** high

## TC-WS-AUTH-038 — TLS upgrade required on production hostname (no plaintext ws://)
- **Severity:** high

## TC-WS-AUTH-039 — Invalid HTTP path → 404 from HTTP layer
- **Severity:** low

## TC-WS-AUTH-040 — CORS preflight (OPTIONS) returns 204 with allow headers
- **Severity:** medium

## TC-WS-AUTH-041 — Connect from disallowed origin (Origin header) — verify CORS for ws upgrade
- **Severity:** medium

## TC-WS-AUTH-042 — Bind only to 127.0.0.1 in production env
- **Notes:** WS_HOST=127.0.0.1; verify with ss -tlnp on staging server.
- **Severity:** high

## TC-WS-AUTH-043 — Tunnel exposure via Cloudflare only (no direct port reachable)
- **Severity:** high

## TC-WS-AUTH-044 — Disconnect during room:join race — graceful handling
- **Severity:** medium

## TC-WS-AUTH-045 — Send message before authenticated → connection already closed (auth happens on connection)
- **Severity:** low
