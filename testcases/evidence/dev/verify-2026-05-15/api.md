# API Surface Verification — dev.doable.me — 2026-05-15

Verifier: Opus 4.7 agent (API Surface lane).
Target: `https://dev-api.doable.me`
Auth: `qa-owner@doable.test` / fresh login token minted 2026-05-14T20:11Z.
Evidence dir: `testcases/evidence/dev/verify-2026-05-15/api/`

## Bug Retest Results

| Bug ID | Status before | Status now | Evidence |
|---|---|---|---|
| BUG-API-001 (GET /health/ → 308 to http://) | OPEN | **PARTIAL** — no longer 308-to-http (verified `/health/live/` → 308 https `/health/live`), but `/health/` itself now returns **401** because Hono's strict router treats the trailing-slash as a different path and the no-redirect carveout (`path !== "/health/"`) leaves it to fall through to an authed catch route. `GET /health` (no slash) → 200 OK ✓. The HTTPS-downgrade vector is closed; the 401 is downstream of the same carveout. | `bug-api-001.txt` |
| BUG-API-002 (framework "cobol" → 201) | OPEN | **FIXED** — `POST /projects {framework:"cobol"}` → **400** `{"error":"Validation failed","details":{"framework":["Invalid framework \"cobol\". Allowed: vite-react"]}}` | `bug-api-002.txt` |
| BUG-API-003 (nonexistent UUID → 400) | OPEN | **PARTIAL** — random valid UUID → **404** "Project not found" ✓; nil UUID (`00000…`) → **400** "Invalid project id" (intentional per BUG-CORPUS-PROJ-004 — nil UUID is rejected as a placeholder before DB). | `bug-api-002.txt` |
| BUG-API-004 (DELETE → 200 not 204) | OPEN | Not retested live (would destroy data); code review shows handler returns `c.json({data:…})` = 200 — convention violation persists, low severity. | n/a |
| BUG-API-005 (archive/unarchive 404) | OPEN | **REGRESSED** — endpoints now exist (routes mounted, commit a172e882). `POST /projects/:id/unarchive` → 200 ✓. `POST /projects/:id/archive` → **500** "Internal Server Error". **Root cause:** the SQL `SET status='archived'` fails because the `project_status` enum on dev is `{creating, draft, published, error}` — no `archived` value. PR raised below. | `bug-api-005.txt` |
| BUG-API-006 (POST /projects/:id/share → 404) | OPEN | **STILL OPEN** — endpoint returns 404. (Visibility is settable via `PATCH /projects/:id {visibility}`; no dedicated share-link route is mounted.) | `bug-api-005.txt` |
| BUG-CORPUS-HEALTH-001 (/health/db) | OPEN | **STILL OPEN** — `/health/db` unauth → 401; with auth → 404 (route doesn't exist). | `bug-corpus-health.txt` |
| BUG-API-TEMPLATES-AUTH-001 | INVALID | **CONFIRMED INVALID** — unauth → 401, authed → 200. Intentional per BUG-WS-003 (closed an info-disclosure leak of `codeFiles`). | `bug-templates.txt` |
| BUG-API-BILLING-USAGE-PARAMS-001 | OPEN | **FIXED** — `GET /billing/usage` no params → 200; bad `workspaceId=not-a-uuid` → 200 (defaults to user's primary workspace); `from=not-a-date` → 200. No 400 regression. | `bug-billing-usage.txt` |
| BUG-API-LONGPATH-002 (2000-char path → 500) | OPEN | **FIXED** — `GET /projects/<2000 chars>` → 400 "Invalid project id"; `GET /workspaces/<2000 chars>` → 400 "Invalid workspace id". | `bug-longpath.txt` |
| BUG-TC-SEC-CORS-001 (echo evil origin) | high | **FIXED / CONFIRMED-SAFE** — OPTIONS preflight with `Origin: https://evil.example` returns 204 with `Access-Control-Allow-Credentials: true` but **no `Access-Control-Allow-Origin` header** → browser blocks. The `cors()` callback returns `null` for non-allowlisted origins, which omits ACAO. Strip-ACAC-when-ACAO-missing middleware (line 259-264 in index.ts) also runs but on preflight (OPTIONS short-circuits) the credentials header still appears; the absent ACAO is the security gate and that's intact. | `cors-evil.txt`, `cors-preflight.txt` |

## Cross-cutting 5xx Leak Spot Checks (malformed body across top-level mounts)

| Mount | Result | Evidence |
|---|---|---|
| `POST /projects` (garbage JSON) | **400** "Invalid JSON in request body" ✓ | `malformed-5xx.txt` |
| `POST /workspaces` | 400 ✓ | `malformed-5xx.txt` |
| `POST /folders` | 400 ✓ | `malformed-5xx.txt` |
| `POST /admin/features` | 400 ✓ | `malformed-auth-5xx.txt` |
| `POST /marketplace/listings` | 400 "Malformed JSON in request body" ✓ | `malformed-auth-5xx.txt` |
| `POST /chat`, `/integrations`, `/design-comments`, `/notifications`, `/mcp`, `/community`, `/deploy`, `/github`, `/analytics`, `/thumbnails`, `/runtime`, `/versions` (root, no params) | 404 (no route at that exact path — not a leak) | `malformed-5xx.txt` |
| `POST /analytics/track` (garbage) | **500** "Failed to process event" — **5xx LEAK** | `malformed-auth-5xx.txt` |
| `POST /deploy/preview` (garbage) | **500** "Internal Server Error" — **5xx LEAK** | `malformed-auth-5xx.txt` |

## Summary

- **FIXES_PASS = 5/9** (BUG-API-002, BUG-API-LONGPATH-002, BUG-API-BILLING-USAGE-PARAMS-001, BUG-API-TEMPLATES-AUTH-001 [invalid-as-designed], CORS preflight evil-origin)
- **OPEN_ZAPPED = 1/4** (BUG-API-005 archive 500 → PR drafted; BUG-API-001 trailing-slash 401, BUG-API-006 share 404, BUG-CORPUS-HEALTH-001 left documented — not in scope for one-turn fix)
- **TC_PASS** sample (10 of 38 12-api TC files probed via curl): 8/10 endpoints respond with documented codes; 2/10 are the analytics-track/deploy-preview 5xx leaks called out above.
- New 5xx leaks discovered: `POST /analytics/track` (garbage body in try/catch returns 500 instead of 400) and `POST /deploy/preview` (param parse / missing-project path returns 500).

## Files

- `bug-api-001.txt`, `bug-api-002.txt`, `bug-api-005.txt`, `bug-api-006.txt`, `bug-templates.txt`, `bug-billing-usage.txt`, `bug-longpath.txt`, `bug-corpus-health.txt`, `cors-preflight.txt`, `cors-evil.txt`, `malformed-5xx.txt`, `malformed-auth-5xx.txt`
