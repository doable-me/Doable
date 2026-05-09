# Doable End-to-End Test Catalogue

**Total: 5,689 test cases across 178 markdown files**, executed against `https://staging.doable.me`.

| Area | Folder | Files | Approx cases |
|------|--------|-------|--------------|
| Authentication & sessions | [01-auth/](01-auth/) | 8 | ~318 |
| Workspaces (CRUD, members, invites, plans) | [02-workspace/](02-workspace/) | 6 | ~236 |
| Projects (create/list/update/delete/collab) | [03-projects/](03-projects/) | 6 | ~293 |
| Editor (Monaco, file ops, Yjs, presence) | [04-editor/](04-editor/) | 4 | ~230 |
| AI chat (modes, credits, tools, attachments) | [05-ai-chat/](05-ai-chat/) | 8 | ~355 |
| Billing (plans, credits, top-up, webhook, portal) | [06-billing/](06-billing/) | 5 | ~220 |
| Integrations marketplace | [07-integrations/](07-integrations/) | 5 | ~215 |
| Publishing (subdomain, custom domain, deploy, preview) | [08-publish/](08-publish/) | 7 | ~235 |
| Marketplace (listings, install, reviews, moderation) | [09-marketplace/](09-marketplace/) | 6 | ~197 |
| Admin / platform ops | [10-admin/](10-admin/) | 11 | ~362 |
| Security (RLS, JWT, CSRF, injection, headers) | [11-security/](11-security/) | 7 | ~323 |
| API surface coverage | [12-api/](12-api/) | many | (partial — agent timed out) |
| WebSocket (auth, rooms, reconnect, messages) | [13-websocket/](13-websocket/) | 4 | ~185 |
| MCP connectors | [14-mcp/](14-mcp/) | 4 | ~175 |
| GitHub (OAuth, push/pull, import, webhook) | [15-github/](15-github/) | 7 | ~190 |
| Templates | [16-templates/](16-templates/) | 5 | ~115 |
| Folders (CRUD, nesting) | [17-folders/](17-folders/) | 1 | 65 |
| Versions (snapshot, restore, undo) | [18-versions/](18-versions/) | 1 | 76 |
| Skills (Copilot rules) | [19-skills/](19-skills/) | (partial) | — |
| Design comments (anchored, real-time, mentions) | [20-design-comments/](20-design-comments/) | 5 | ~140 |
| Team chat | [21-team-chat/](21-team-chat/) | (partial) | — |
| Notifications | [22-notifications/](22-notifications/) | 3 | ~100 |
| Thumbnails (Puppeteer queue) | [23-thumbnails/](23-thumbnails/) | 2 | ~65 |
| Deploy (lifecycle, rollback, artifacts) | [24-deploy/](24-deploy/) | 3 | ~92 |
| Runtime (Vite dev servers, systemd, capacity) | [25-runtime/](25-runtime/) | 3 | ~105 |
| Analytics (events, page views, retention) | [26-analytics/](26-analytics/) | 4 | ~105 |

## Run log + findings
- [99-runlog/RUNLOG.md](99-runlog/RUNLOG.md) — chronological live-test results with UTC timestamps and evidence pointers.
- [99-runlog/FINDINGS.md](99-runlog/FINDINGS.md) — summary of bugs found, severity, and links to the source files.
- [test-accounts.md](test-accounts.md) — QA test users (passwords, IDs, platform admin status).

## Test case format
Each case is `TC-{AREA}-{SUBAREA}-NNN` with **Pre / Steps / Expected / Severity** sections. Severity tiers: `smoke` (gates everything), `high`, `medium`, `low`, `edge`.

## Live tests
Lived tests were executed via `evidence/runner.sh` (curl-based shell helper) and Chrome MCP for UI flows. Per-test response bodies and headers are saved under `evidence/<TC-ID>.body` and `<TC-ID>.hdr`.
