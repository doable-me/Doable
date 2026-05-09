# TC-API-CONNECTOR-PROXY — connector-bridge proxy

Mounted at `/` (`services/api/src/routes.ts:61`). Source: `services/api/src/routes/connector-proxy.ts`.

Endpoint:
- `POST /__doable/connector-proxy/:integration/:action`

Auth: JWT-protected, allowlist-gated, audited. Lets static-kind generated apps reach connected integrations server-side without ever holding the raw secret.

---

## TC-API-CP-001 — POST 200 happy path
- **Pre:** Integration "stripe" connected; action "list-customers" allowlisted.
- **Steps:** POST with valid JWT and JSON body.
- **Expected:** 200 with upstream response.
- **Severity:** smoke

## TC-API-CP-002 — POST 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-CP-003 — POST malformed JWT → 401
- **Expected:** 401.
- **Severity:** smoke

## TC-API-CP-004 — POST JWT signed by another env → 401
- **Expected:** 401.
- **Severity:** smoke

## TC-API-CP-005 — POST integration not connected → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-CP-006 — POST action not in allowlist → 403
- **Steps:** action "delete-all-customers" (not allowlisted).
- **Expected:** 403.
- **Severity:** smoke

## TC-API-CP-007 — POST action with SQLi in path → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-CP-008 — POST action 256 chars → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-CP-009 — POST integration name not in catalog → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-CP-010 — POST upstream 401 (key revoked) → 502/401
- **Expected:** 502 mirroring upstream auth failure.
- **Severity:** high

## TC-API-CP-011 — POST upstream timeout → 504
- **Expected:** 504.
- **Severity:** high

## TC-API-CP-012 — POST upstream 5xx → 502
- **Expected:** 502 with redacted body.
- **Severity:** high

## TC-API-CP-013 — POST request body validated against action schema
- **Steps:** Missing required field for action.
- **Expected:** 400 with details.
- **Severity:** high

## TC-API-CP-014 — POST extra unknown fields stripped
- **Expected:** 200; unknown ignored.
- **Severity:** medium

## TC-API-CP-015 — POST body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-CP-016 — POST attempts to leak raw secret in upstream URL → 400
- **Steps:** Body containing `${apiKey}` template.
- **Expected:** 400; secrets never accept templating from client.
- **Severity:** smoke

## TC-API-CP-017 — Audit row written for every call
- **Steps:** After call, query audit.
- **Expected:** Row with userId, action, integration, status.
- **Severity:** smoke

## TC-API-CP-018 — Rate limit per user (>60/min) → 429
- **Expected:** 429.
- **Severity:** high

## TC-API-CP-019 — Cross-tenant: user from WS A using WS B's connection
- **Steps:** Try referencing another workspace's integration.
- **Expected:** 403/404.
- **Severity:** smoke

## TC-API-CP-020 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-CP-021 — Header CRLF on Authorization → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-CP-022 — Wrong method GET on this path → 405/404
- **Expected:** 405/404.
- **Severity:** low

## TC-API-CP-023 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** medium

## TC-API-CP-024 — Idempotency-Key on POST → upstream gets it forwarded?
- **Expected:** Document forwarded vs not.
- **Severity:** medium

## TC-API-CP-025 — Server error returns JSON
- **Expected:** 500 JSON.
- **Severity:** medium

## TC-API-CP-026 — Long :integration name → 414/400
- **Expected:** 414/400.
- **Severity:** low

## TC-API-CP-027 — Concurrent calls per project capped
- **Expected:** 429 after threshold.
- **Severity:** medium
