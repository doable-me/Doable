# TC-SEC-CORS-ACAC-DROP — Strip `Access-Control-Allow-Credentials` when origin is disallowed (BUG-012)

## Goal

When a cross-origin request arrives from an origin that is NOT on the CORS allowlist, the API must not emit `Access-Control-Allow-Credentials: true` in the response. The credentials flag without a matching `Access-Control-Allow-Origin` is misleading, violates the principle of minimal disclosure, and would become an exploitable misconfiguration the moment a future change accidentally widens ACAO.

## Pre-conditions

- API reachable at `https://<env>-api.doable.me` (or `http://127.0.0.1:4000` locally).
- The deployment has `CORS_ORIGINS` set to a single-level allowlist that does NOT include `https://evil.example`.

## Steps

### Case A — OPTIONS preflight from disallowed origin

```bash
curl -sS -i -X OPTIONS \
  -H 'Origin: https://evil.example' \
  -H 'Access-Control-Request-Method: GET' \
  https://dev-api.doable.me/auth/me
```

**Expected**
- Status: `204 No Content`
- `Access-Control-Allow-Origin` header: **absent**
- `Access-Control-Allow-Credentials` header: **absent**

### Case B — Actual GET from disallowed origin

```bash
TOK=...  # any valid bearer
curl -sS -i -X GET \
  -H 'Origin: https://evil.example' \
  -H "Authorization: Bearer $TOK" \
  https://dev-api.doable.me/auth/me
```

**Expected**
- Status: `200 OK`
- `Access-Control-Allow-Origin` header: **absent**
- `Access-Control-Allow-Credentials` header: **absent**

### Case C — OPTIONS preflight from allowed origin

```bash
curl -sS -i -X OPTIONS \
  -H 'Origin: https://dev.doable.me' \
  -H 'Access-Control-Request-Method: GET' \
  https://dev-api.doable.me/auth/me
```

**Expected**
- Status: `204 No Content`
- `Access-Control-Allow-Origin: https://dev.doable.me`
- `Access-Control-Allow-Credentials: true`

## Failure mode (regression)

If a future change reverts the BUG-012 fix in `services/api/src/index.ts`, Case A and Case B will leak `Access-Control-Allow-Credentials: true` while ACAO is absent. Both cases must reject the credentials header for this TC to pass.

## Linked bugs

- BUG-012 (testcases/bugs/2026-05-14-auth-security-012.md)
