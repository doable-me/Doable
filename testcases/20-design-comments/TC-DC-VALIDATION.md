# TC-DC-VALIDATION — design-comments POST rejects bad input with 400, never 500

Source: BUG-CORPUS-DC-001 (env1, 2026-05-10).
Helper under test: `services/api/src/routes/design-comments.ts` →
`CreateCommentSchema` (Zod) + `safeParseCommentBody()` shared between the
auth-protected POST and the internal POST endpoint.

Routes covered:
- `POST /design-comments/:projectId`           (auth-protected)
- `POST /design-comments/:projectId/internal`  (WS bridge, requires
  `x-internal-secret`)

All malicious / malformed bodies must respond `400 {"error": "Invalid input", "issues": [...]}`.
The `comments.create(...)` call is wrapped in try/catch so any unexpected
DB error produces `500 {"error": "Failed to persist comment"}` instead of
the unhandled-exception 500-with-stack-trace path.

---

## TC-DC-VAL-001 — `xPercent = 1.5` → 400 (out of [0,1])

- **Setup:** owner token from `_tokens-env1.json`.
- **Steps:**
  ```bash
  curl -sS -o - -w "\nHTTP=%{http_code}\n" \
    -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
    -d '{"xPercent":1.5,"yPercent":0.5,"content":"hi","pagePath":"home"}' \
    https://<env>-api.doable.me/design-comments/$PROJECT_ID
  ```
- **Expected:** `HTTP=400`, body `{"error":"Invalid input","issues":[…]}`,
  with at least one issue whose `path = ["xPercent"]` and `code = "too_big"`.
- **Severity:** high (data-integrity — off-canvas pins).

## TC-DC-VAL-002 — `yPercent = -0.1` → 400 (out of [0,1])

- **Steps:** body `{"xPercent":0.5,"yPercent":-0.1,"content":"hi"}`.
- **Expected:** `HTTP=400`, issue path `["yPercent"]`, code `too_small`.
- **Severity:** high

## TC-DC-VAL-003 — Empty `content` (after trim) → 400

- **Steps:** body `{"xPercent":0.5,"yPercent":0.5,"content":"   ","pagePath":"home"}`.
- **Expected:** `HTTP=400`, issue path `["content"]`. The schema applies
  `.trim().min(1)` so whitespace-only content is rejected.
- **Severity:** high (junk rows).

## TC-DC-VAL-004 — Missing `content` field → 400 (was 500)

- **Steps:** body `{"xPercent":0.5,"yPercent":0.5}`.
- **Expected:** `HTTP=400`, issue path `["content"]`, code `invalid_type`.
- **Severity:** high (server-error leak — original BUG-CORPUS-DC-001 repro).

## TC-DC-VAL-005 — Empty body `{}` → 400 (was 500)

- **Steps:** body `{}`.
- **Expected:** `HTTP=400` with multiple issues for the missing required
  fields (`xPercent`, `yPercent`, `content`).
- **Severity:** high (was the headline 500 ISE leak).

## TC-DC-VAL-006 — Malformed JSON → 400 (was 500)

- **Steps:** body `not json at all`, `Content-Type: application/json`.
- **Expected:** `HTTP=400`, body `{"error":"Invalid JSON body"}`. Confirms
  the explicit `try { c.req.json() } catch { return 400 }` guard.
- **Severity:** medium

## TC-DC-VAL-007 — Oversized `content` (> 4096 chars) → 400

- **Steps:** body with `content = "a".repeat(5000)`.
- **Expected:** `HTTP=400`, issue path `["content"]`, code `too_big`.
- **Severity:** low (defensive; prevents DOS-amplifier rows).

## TC-DC-VAL-008 — Invalid `parentId` UUID → 400

- **Steps:** body `{"xPercent":0.5,"yPercent":0.5,"content":"reply","parentId":"not-a-uuid"}`.
- **Expected:** `HTTP=400`, issue path `["parentId"]`, code `invalid_string`.
- **Severity:** medium

## TC-DC-VAL-009 — Bad `userColor` format → 400

- **Steps:** body `{"xPercent":0.5,"yPercent":0.5,"content":"hi","userColor":"red"}`.
- **Expected:** `HTTP=400`, issue path `["userColor"]`, code `invalid_string`.
- **Severity:** low

## TC-DC-VAL-010 — Happy path still returns 201

- **Steps:** body `{"xPercent":0.5,"yPercent":0.5,"content":"valid comment","pagePath":"index.html"}`.
- **Expected:** `HTTP=201`, body `{"data": { id: <uuid>, x_percent: 0.5, ... }}`.
  Confirms the validator did not break the working path.
- **Severity:** high (regression guard against over-rejection).

## TC-DC-VAL-011 — Internal POST: missing `userId` → 400

- **Steps:**
  ```bash
  curl -sS -o - -w "\nHTTP=%{http_code}\n" \
    -X POST -H "x-internal-secret: $INTERNAL_SECRET" -H "Content-Type: application/json" \
    -d '{"xPercent":0.5,"yPercent":0.5,"content":"from ws"}' \
    https://<env>-api.doable.me/design-comments/$PROJECT_ID/internal
  ```
- **Expected:** `HTTP=400`, body `{"error":"userId is required"}`.
  Internal endpoint enforces userId after schema validation (it's
  optional in the shared schema because the auth-protected endpoint
  populates it from the JWT).
- **Severity:** medium

## TC-DC-VAL-012 — Internal POST: bad secret → 403

- **Steps:** `x-internal-secret: wrong-secret`, body as 011.
- **Expected:** `HTTP=403`, body `{"error":"Forbidden"}`. Validates the
  secret check still runs BEFORE the validator, so we don't leak schema
  errors to unauthorized callers.
- **Severity:** medium
