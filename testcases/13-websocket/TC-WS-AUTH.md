# TC-WS-AUTH — WebSocket authentication and connection lifecycle

WS endpoint: `wss://<env>-ws.doable.me/?token=<JWT>` (or `wss://ws.doable.me/?token=<JWT>` on prod).

Verified on env1 (zantaz) on 2026-05-10:
- `wss://zantaz-ws.doable.me/?token=$VALID` → `{"type":"connected","userId":"<uuid>","resumeToken":""}`
- `wss://zantaz-ws.doable.me/` (no token) → close 4001 "Missing token"
- `?token=` (empty) → 4001 (server treats as missing)
- `?token=abc` (garbage) → 4002 "Invalid token"
- forged HS256 / alg=none / wrong issuer → 4002
- second connect with same token → both accepted (no per-token uniqueness — by design)
- `{"type":"heartbeat"}` after connect → `{"type":"heartbeat_ack"}`
- malformed JSON frame → `{"type":"error","code":"PARSE_ERROR","message":"Invalid JSON"}` (connection stays open)
- HTTP `/health` → 200 with rooms count
- HTTP `/internal/broadcast` without/with-wrong `X-Internal-Secret` → 403
- HTTP `/internal/presence/<id>` → 200 (no secret enforced — see TC-WS-AUTH-037 finding)

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

## TC-WS-AUTH-037 — GET /internal/presence/:id requires X-Internal-Secret → 403 without it
- **Steps:** `curl -i https://<env>-ws.doable.me/internal/presence/<projectId>` (no secret header).
- **Expected:** 403 Forbidden. With matching `X-Internal-Secret`: 200 with `{users: [...]}`.
- **Notes:** Closed by BUG-EDITOR-002 fix in `services/ws/src/index.ts` — same gate as `/internal/broadcast` and `/internal/yjs/write`.
- **Severity:** high

## TC-WS-AUTH-037b — GET /internal/collab-active/:id requires X-Internal-Secret → 403 without it
- **Steps:** `curl -i https://<env>-ws.doable.me/internal/collab-active/<projectId>` (no secret header).
- **Expected:** 403 Forbidden. With matching `X-Internal-Secret`: 200 with `{active, users: <count>}`.
- **Notes:** Companion endpoint to /internal/presence; same leak class. Only legitimate caller is `services/api/src/ai/yjs-bridge.ts::isCollaborationActive`, which already sends the secret.
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
