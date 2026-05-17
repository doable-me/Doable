# Doable OOB Smoke Test Index

Step 9 verification suite for the Hetzner (and any other) install recipe.

## Run Command

```bash
DOABLE_BASE=https://<your-install> bash testcases/run.sh
```

## Test Cases

| TC ID | Area | What It Verifies | File |
|-------|------|-----------------|------|
| TC-H01 | Health | `/api/health` → 200, `status:healthy`, `database:up` | `oob/health.test.ts` |
| TC-H02 | Health | `/api/health/live` → 200, `status:alive` | `oob/health.test.ts` |
| TC-H03 | Health | `/api/health/ready` → 200, `status:ready` | `oob/health.test.ts` |
| TC-H04 | Health | Web root `/` → 200 | `oob/health.test.ts` |
| TC-SB01 | Bootstrap | First signup returns access token | `oob/signup-bootstrap.test.ts` |
| TC-SB02 | Bootstrap | First user has `isPlatformAdmin:true` (via `/api/setup/status`) | `oob/signup-bootstrap.test.ts` |
| TC-SB03 | Bootstrap | Second signup succeeds (open or pending) | `oob/signup-bootstrap.test.ts` |
| TC-SB04 | Bootstrap | Second user blocked from `/api/setup/status` (403/401) | `oob/signup-bootstrap.test.ts` |
| TC-AU01 | Auth | Login returns `accessToken` | `oob/auth.test.ts` |
| TC-AU02 | Auth | `/api/auth/me` succeeds with valid token | `oob/auth.test.ts` |
| TC-AU03 | Auth | `/api/auth/me` returns 401 without token | `oob/auth.test.ts` |
| TC-AU04 | Auth | Token refresh returns new `accessToken` | `oob/auth.test.ts` |
| TC-WZ01 | Wizard | `/api/setup/status` returns wizard contract shape | `oob/wizard.test.ts` |
| TC-WZ02 | Wizard | `POST /api/setup/workspace-name` → `{ok:true, name}` | `oob/wizard.test.ts` |
| TC-WZ03 | Wizard | `POST /api/setup/ai-provider` (anthropic) → `{ok:true}` | `oob/wizard.test.ts` |
| TC-WZ04 | Wizard | `POST /api/setup/ai-provider` (custom+baseUrl+model) → `{ok:true}` | `oob/wizard.test.ts` |
| TC-WZ05 | Wizard | `POST /api/setup/complete` seals wizard; status → `setupCompleted:true` | `oob/wizard.test.ts` |
| TC-AS01 | AI Seed | `MINIMAX_API_KEY` env → `ai_provider=custom` in `/setup/status` | `oob/ai-seeding.test.ts` |
| TC-AS02 | AI Seed | `MINIMAX_API_KEY` env → `ai_provider_base_url` contains `minimax.io` | `oob/ai-seeding.test.ts` |
| TC-WP01 | Workspace | `GET /api/workspaces` → 200, array | `oob/workspace-project.test.ts` |
| TC-WP02 | Workspace | `POST /api/workspaces` creates workspace | `oob/workspace-project.test.ts` |
| TC-WP03 | Project | `POST /api/projects` creates project | `oob/workspace-project.test.ts` |
| TC-WP04 | Project | `GET /api/projects/:id` returns created project | `oob/workspace-project.test.ts` |
| TC-WP05 | Project | `DELETE /api/projects/:id` removes project (cleanup) | `oob/workspace-project.test.ts` |
| TC-WS01 | WebSocket | WS `/ws` endpoint is reachable | `oob/websocket.test.ts` |
| TC-WS02 | WebSocket | WS `/ws` with valid token passes auth gate | `oob/websocket.test.ts` |
| TC-AC01 | AI Chat | `POST /api/chat/:projectId` returns non-404 | `oob/ai-chat.test.ts` |
| TC-AC02 | AI Chat | SSE stream starts correctly when provider configured | `oob/ai-chat.test.ts` |

**Total: 28 test cases**

## Output Format

```
PASS: 26  FAIL: 2  SKIP: 0
```

Exit code `0` = CI green. Exit code `1` = CI red.

## Evidence

All test artifacts saved under `testcases/evidence/<TC-ID>.{body,hdr,log}`.
