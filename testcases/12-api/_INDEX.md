# 12-api — HTTP-level test cases (per route group)

Base URL under test: `https://staging-api.doable.me`
Standard error envelope: `{"error":"<msg>"}` or `{"error":"<msg>","details":{...}}`.
Auth: `Authorization: Bearer <jwt>` unless noted.

Each file enumerates one route group's HTTP semantics (status, headers, content-type, validation, idempotency, edge cases).

| File | Mount | Source | Approx cases |
|---|---|---|---|
| TC-API-HEALTH.md           | `/health`              | `routes/health.ts`              | 32 |
| TC-API-AUTH.md             | `/auth`                | `routes/auth/`                  | 64 |
| TC-API-PROJECTS.md         | `/projects`            | `routes/projects.ts`            | 90 |
| TC-API-WORKSPACES.md       | `/workspaces`          | `routes/workspaces.ts`          | 62 |
| TC-API-FOLDERS.md          | `/folders`             | `routes/folders.ts`             | 28 |
| TC-API-EDITOR.md           | `/editor`, `/direct-save` | `routes/editor.ts`, `direct-save/` | 50 |
| TC-API-CHAT.md             | `/chat`                | `routes/chat/`                  | 54 |
| TC-API-BILLING.md          | `/billing`             | `routes/billing.ts`             | 40 |
| TC-API-DEPLOY.md           | `/deploy`, `/domains`  | `routes/deploy.ts`, `custom-domains.ts` | 42 |
| TC-API-TEMPLATES.md        | `/templates`           | `routes/templates.ts`           | 30 |
| TC-API-VERSIONS.md         | `/projects/:id/versions` | `routes/versions.ts`           | 24 |
| TC-API-GITHUB.md           | `/github`              | `routes/github.ts`              | 40 |
| TC-API-ADMIN.md            | `/admin`               | `routes/admin.ts`, `admin/`     | 53 |
| TC-API-COMMUNITY.md        | `/community`           | `routes/community.ts`           | 30 |
| TC-API-CONNECTORS.md       | `/workspaces/:wid/connectors`, `/mcp/oauth/callback` | `routes/connectors.ts` | 36 |
| TC-API-INTEGRATIONS.md     | `/integrations`        | `routes/integrations.ts`        | 41 |
| TC-API-SKILLS.md           | `/workspaces/:wid/skills`, `/rules` | `routes/skills.ts` | 85 |
| TC-API-ENVIRONMENTS.md     | `/workspaces/:wid/environments`, env-vars | `routes/environments.ts`, `env-vars.ts` | 40 |
| TC-API-MARKETPLACE.md      | `/marketplace`         | `routes/marketplace*.ts`        | 43 |
| TC-API-TEAM-CHAT.md        | `/team-chat`           | `routes/team-chat.ts`           | 45 |
| TC-API-DESIGN-COMMENTS.md  | `/design-comments`     | `routes/design-comments.ts`     | 25 |
| TC-API-PROVIDER.md         | `/ai/provider-catalog`, `/workspaces/:wid/ai-settings` | `routes/provider-catalog.ts`, `provider-bridge.ts`, `ai-settings*.ts` | 70 |
| TC-API-PREVIEW-PROXY.md    | `/preview/:projectId/*` | `routes/preview-proxy.ts`      | 23 |
| TC-API-CONNECTOR-PROXY.md  | `/__doable/connector-proxy/:i/:a` | `routes/connector-proxy.ts` | 27 |
| TC-API-CONTEXT.md          | `/projects/:id/context`, `/workspaces/:wid/context` | `routes/context.ts` | 28 |
| TC-API-RUNTIME.md          | `/projects/:id/runtime`, `/workspaces/:wid/runtime/active` | `routes/runtime.ts` | 29 |
| TC-API-BUILD-STREAM.md     | `/projects/:id/build-events` | `routes/build-stream.ts`  | 15 |
| TC-API-THUMBNAILS.md       | `/thumbnails`          | `routes/thumbnails.ts`          | 18 |
| TC-API-ANALYTICS.md        | `/analytics`           | `routes/analytics.ts`           | 23 |
| TC-API-INTERNAL.md         | `/internal`            | `routes/internal.ts`            | 15 |
| TC-API-PLAN.md             | `/plan`                | `routes/plan.ts`                | 14 |
| TC-API-ARTIFACTS.md        | `/artifacts`           | `routes/artifacts.ts`           | 15 |
| TC-API-DIRECT-SAVE.md      | `/direct-save`         | `direct-save/`                  | 21 |
| TC-API-FRAMEWORKS.md       | `/frameworks`          | `routes/admin-frameworks.ts`    | 8  |
| TC-API-USAGE.md            | `/workspaces/:wid/usage` | `routes/usage.ts`             | 15 |
| TC-API-SECURITY.md         | `/projects/:id/security` | `routes/security.ts`          | 21 |

## Severity legend

- **smoke** — must pass before any deploy
- **high** — should pass before each release
- **medium** — important, run weekly
- **low** — nice-to-have, run before major release

## Running these manually

Most cases are runnable with `curl` against `https://staging-api.doable.me`. Save responses to `evidence/<TC-id>.json` per RUNLOG conventions.

```bash
# example
curl -i \
  -H "Authorization: Bearer $TOKEN" \
  https://staging-api.doable.me/projects \
  | tee evidence/TC-API-PROJECTS-001.txt
```

## What's NOT covered here

- WebSocket-level coverage → see `13-websocket/`
- Behavioural / business-logic flows → see `01-auth/`, `03-projects/`, etc.
- MCP host coverage → see `14-mcp/`
- Skill business logic → see `19-skills/`
- Team chat business logic + WS → see `21-team-chat/`
