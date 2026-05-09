# TC-API-GITHUB — /github route group

Mounted at `/` (`services/api/src/routes.ts:88`). Source: `services/api/src/routes/github.ts` (and `routes/github/`).

Endpoints (representative):
- `GET    /github/install-url`                   — start GitHub App install
- `GET    /github/callback`                      — install callback
- `POST   /github/disconnect`
- `GET    /github/repos`                         — list connected repos
- `POST   /github/projects/:id/connect`          — link project to repo
- `POST   /github/projects/:id/disconnect`
- `POST   /github/projects/:id/push`             — sync local → remote
- `POST   /github/projects/:id/pull`
- `GET    /github/projects/:id/status`
- `POST   /github/projects/:id/branch`           — create branch
- `POST   /github/webhook`                       — webhook (no auth, signature)
- `GET    /github/oauth/start`
- `GET    /github/oauth/callback`

---

## TC-API-GITHUB-001 — GET /github/install-url 200
- **Steps:** Auth.
- **Expected:** 200 `{url:"https://github.com/apps/..."}` with state.
- **Severity:** smoke

## TC-API-GITHUB-002 — GET install-url 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-GITHUB-003 — GET /github/callback?installation_id=X&state=Y 302
- **Steps:** Match state.
- **Expected:** 302 to dashboard.
- **Severity:** smoke

## TC-API-GITHUB-004 — GET callback state mismatch → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-GITHUB-005 — GET callback missing installation_id → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-GITHUB-006 — POST /github/disconnect 200
- **Expected:** 200; installation revoked locally.
- **Severity:** medium

## TC-API-GITHUB-007 — GET /github/repos 200
- **Expected:** 200 list.
- **Severity:** smoke

## TC-API-GITHUB-008 — GET /github/repos token expired → 401 from upstream
- **Expected:** 502 or 401; record.
- **Severity:** medium

## TC-API-GITHUB-009 — POST /github/projects/:id/connect 200
- **Steps:** POST `{repoFullName:"owner/repo"}`.
- **Expected:** 200.
- **Severity:** smoke

## TC-API-GITHUB-010 — POST connect repo not in installation → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-GITHUB-011 — POST connect malformed repo name → 400
- **Steps:** repoFullName "no-slash".
- **Expected:** 400.
- **Severity:** high

## TC-API-GITHUB-012 — POST disconnect 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-GITHUB-013 — POST /push 202
- **Expected:** 202; commit pushed; SSE on /status.
- **Severity:** smoke

## TC-API-GITHUB-014 — POST push merge conflict → 409
- **Pre:** Remote diverged.
- **Expected:** 409 with conflict info.
- **Severity:** high

## TC-API-GITHUB-015 — POST pull 200
- **Expected:** 200.
- **Severity:** smoke

## TC-API-GITHUB-016 — POST pull conflict → 409
- **Expected:** 409.
- **Severity:** high

## TC-API-GITHUB-017 — GET /status 200
- **Expected:** 200 `{branch, ahead, behind, dirty}`.
- **Severity:** smoke

## TC-API-GITHUB-018 — POST /branch 201
- **Steps:** POST `{name:"feat/x", from:"main"}`.
- **Expected:** 201.
- **Severity:** medium

## TC-API-GITHUB-019 — POST branch invalid name → 400
- **Steps:** `name:"feat with space"`.
- **Expected:** 400.
- **Severity:** high

## TC-API-GITHUB-020 — POST branch already exists → 409
- **Expected:** 409.
- **Severity:** medium

## TC-API-GITHUB-021 — POST /github/webhook valid signature 200
- **Expected:** 200.
- **Severity:** smoke

## TC-API-GITHUB-022 — POST webhook missing X-Hub-Signature-256 → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-GITHUB-023 — POST webhook bad signature → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-GITHUB-024 — POST webhook replay (delivery_id repeated)
- **Expected:** 200 idempotent.
- **Severity:** high

## TC-API-GITHUB-025 — POST webhook unknown event type
- **Expected:** 200 ignored.
- **Severity:** medium

## TC-API-GITHUB-026 — POST webhook 5MB payload
- **Expected:** 413 or 200; document.
- **Severity:** medium

## TC-API-GITHUB-027 — GET /oauth/start 302 to GitHub
- **Expected:** 302.
- **Severity:** smoke

## TC-API-GITHUB-028 — GET /oauth/callback state mismatch → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-GITHUB-029 — GET /oauth/callback missing code → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-GITHUB-030 — Path SQL injection on :id
- **Expected:** 400.
- **Severity:** smoke

## TC-API-GITHUB-031 — Wrong method PUT on /push → 405/404
- **Expected:** 405/404.
- **Severity:** low

## TC-API-GITHUB-032 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-GITHUB-033 — Header CRLF injection on X-GitHub-Event
- **Expected:** 400.
- **Severity:** smoke

## TC-API-GITHUB-034 — Server error during push → 500 JSON
- **Pre:** Force git error.
- **Expected:** 500 JSON.
- **Severity:** high

## TC-API-GITHUB-035 — Connect across workspaces
- **Steps:** Try linking a repo from WS A to project in WS B.
- **Expected:** 403.
- **Severity:** high

## TC-API-GITHUB-036 — Disconnect when not connected → 409/200
- **Expected:** 200 idempotent or 409. Record.
- **Severity:** medium

## TC-API-GITHUB-037 — Pagination on /repos cursor
- **Expected:** 200 with cursor.
- **Severity:** medium

## TC-API-GITHUB-038 — Filter ?visibility=private/public
- **Expected:** 200 filtered.
- **Severity:** medium

## TC-API-GITHUB-039 — Webhook signature timing-safe comparison
- **Steps:** Vary signature byte by byte.
- **Expected:** Constant-time validation; no timing leak (advisory).
- **Severity:** medium

## TC-API-GITHUB-040 — Idempotency-Key on POST connect
- **Expected:** Single connection.
- **Severity:** medium
