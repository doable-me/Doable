# Doable OOB Smoke Tests

Single-command release-readiness check for any Doable install (local docker, remote docker, bare-metal).

## Quick Start

```bash
# Against a remote install
DOABLE_BASE=https://staging.doable.me bash testcases/run.sh

# Against local docker-compose
DOABLE_BASE=http://localhost:3001 bash testcases/run.sh

# With all options
DOABLE_BASE=https://your-install.example.com \
DOABLE_API_BASE=https://your-install-api.example.com \
DOABLE_TEST_EMAIL=admin@example.com \
DOABLE_TEST_PASSWORD=MySecurePass1! \
DOABLE_MINIMAX_KEY=sk-... \
bash testcases/run.sh
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DOABLE_BASE` | No (default: `http://localhost:3001`) | Base URL for API and web |
| `DOABLE_API_BASE` | No | Override API base if separate from web |
| `DOABLE_WS_BASE` | No | Override WebSocket base (auto-derived from API_BASE) |
| `DOABLE_WEB_BASE` | No | Override web frontend URL |
| `DOABLE_TEST_EMAIL` | No | Email for test owner account |
| `DOABLE_TEST_PASSWORD` | No | Password for test owner account |
| `DOABLE_MINIMAX_KEY` | No | MINIMAX_API_KEY to test env-seeding path |

## Test Coverage

### Health (TC-H01–H04)
- `TC-H01` — `/api/health` returns 200 with `status:healthy` and `database:up`
- `TC-H02` — `/api/health/live` returns 200 with `status:alive`
- `TC-H03` — `/api/health/ready` returns 200 with `status:ready`
- `TC-H04` — Web root `/` returns 200

### Signup Bootstrap (TC-SB01–SB04)
- `TC-SB01` — First user registration returns access token
- `TC-SB02` — First user can reach `/api/setup/status` confirming `isPlatformAdmin:true`
- `TC-SB03` — Second signup succeeds (or queues as pending)
- `TC-SB04` — Second user is blocked from `/api/setup/status` (403/401)

### Auth (TC-AU01–AU04)
- `TC-AU01` — `POST /api/auth/login` returns `accessToken`
- `TC-AU02` — `GET /api/auth/me` succeeds with valid token
- `TC-AU03` — `GET /api/auth/me` returns 401 without token
- `TC-AU04` — `POST /api/auth/refresh` returns new `accessToken`

### Setup Wizard (TC-WZ01–WZ05)
- `TC-WZ01` — `GET /api/setup/status` returns wizard contract shape
- `TC-WZ02` — `POST /api/setup/workspace-name` saves name and returns `{ok, name}`
- `TC-WZ03` — `POST /api/setup/ai-provider` with `provider:anthropic` returns `{ok:true}`
- `TC-WZ04` — `POST /api/setup/ai-provider` with `provider:custom` + baseUrl + model returns `{ok:true}`
- `TC-WZ05` — `POST /api/setup/complete` marks wizard done; status reflects `setupCompleted:true`

### AI Env Seeding (TC-AS01–AS02) — requires `DOABLE_MINIMAX_KEY`
- `TC-AS01` — `MINIMAX_API_KEY` seeded: `ai_provider=custom`, `ai_provider_key` configured
- `TC-AS02` — `MINIMAX_API_KEY` seeded: `ai_provider_base_url` points to `minimax.io`

### Workspace & Project (TC-WP01–WP05)
- `TC-WP01` — `GET /api/workspaces` returns 200 with array
- `TC-WP02` — `POST /api/workspaces` creates workspace
- `TC-WP03` — `POST /api/projects` creates project in workspace
- `TC-WP04` — `GET /api/projects/:id` returns created project
- `TC-WP05` — `DELETE /api/projects/:id` removes project (cleanup)

### WebSocket (TC-WS01–WS02)
- `TC-WS01` — WS handshake at `/ws` is reachable (connects or returns auth-gate response)
- `TC-WS02` — WS with valid token gets past auth gate

### AI Chat (TC-AC01–AC02)
- `TC-AC01` — `POST /api/chat/:projectId` returns non-404 (endpoint exists)
- `TC-AC02` — SSE stream starts correctly when provider is configured (requires `DOABLE_MINIMAX_KEY`)

## Evidence

Each test saves artifacts under `testcases/evidence/`:
- `<TC-ID>.body` — response body
- `<TC-ID>.hdr` — response headers (JSON)
- `<TC-ID>.log` — extra diagnostic info

## Exit Codes

- `0` — all tests passed
- `1` — one or more tests failed

## Notes

- Self-signed TLS certs are handled via `rejectUnauthorized: false`.
- Bootstrap tests (TC-SB01/SB02) are idempotent — they skip gracefully on installs that already have a user.
- The second test user (TC-SB03/SB04) is deleted after the test run.
- The AI chat test project is deleted after the test run.
- The first (owner) user is NOT deleted — it is required for all subsequent tests.
