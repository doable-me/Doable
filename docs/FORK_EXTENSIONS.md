# Fork extensions index

Tracks **thin hooks** into upstream-touched files for the Doable_v1 fork.
Full design: [`FULLSTACK_RUNTIME.md`](./FULLSTACK_RUNTIME.md).

When you add a registration call in a file that upstream also owns, list it here so merges stay reviewable.

## Overlay roots (prefer these — low conflict)

| Path | Purpose |
|------|---------|
| `packages/doable-runtime/` | `@doable/runtime` SDK for generated apps |
| `services/api/src/app-runtime/` | Server: CRUD, workflows, bus, hooks, scheduler |
| `services/api/src/ai/skills/_ext/` | Fork system skills (full-stack teaching) |
| `services/api/src/mcp/builtin/runtime/` | `builtin:runtime` MCP tools |
| `docs/FULLSTACK_RUNTIME.md` | Spec |

## Upstream file hooks

| File | Hook | Status |
|------|------|--------|
| `services/api/src/ai/system-skills.ts` | Scan `_ext/` after `_system/` | Done |
| `services/api/src/projects/link-sdk.ts` | Link `@doable/runtime` | Done |
| `services/api/src/routes.ts` | Mount `appRuntimeRoutes` when flag on | Done |
| `services/api/src/index.ts` | `startAppRuntime()` scheduler boot | Done |
| `services/api/src/mcp/builtin/index.ts` | Register `builtin:runtime` | Done |
| `services/api/src/routes/chat/send-handler.ts` | `ensureRuntimeConnectorForProject` | Done |
| `services/api/src/routes/projects/list-routes.ts` | Same on project create | Done |
| `services/api/src/routes/app-data.ts` | `emitCdcIfMutation` after DML | Done |
| `services/api/src/data-worker/pool.ts` | Skip idle sweep when `isProjectPinned` | Done |
| `services/api/src/routes/app-auth.ts` | Admin `/__doable/auth/users` CRUD | Done |
| `services/api/src/sandbox/profiles/index.ts` | `app-workflow` profile | Done |
| `services/api/src/ai/framework-prompts/index.ts` | Backend contract snippet | Done |
| `services/api/src/security/scanner-patterns.ts` | Express + raw `db.query` patterns | Done |
| `services/api/src/services/caddy-domains.ts` | Carve `/__doable/*` + `/hooks/*` | Done |
| `services/api/src/runtime/caddy-admin.ts` | Process apps: `/hooks/*` carve-out | Done |
| `services/api/package.json` | `@doable/runtime` workspace dep | Done |
| `.env.example` | `DOABLE_APP_RUNTIME_ENABLED` documented (default ON; `=0` to disable) | Done |
| `services/api/src/app-runtime/enforce.ts` | Hard-reject `db.query` / Express in create_file/edit_file | Done |
| `services/api/src/ai/providers/copilot-tools.ts` | Call `runtimeWriteGuardError` before write | Done |
| `services/api/src/ai/app-db-prompt.ts` | Runtime prompt variant by default | Done |
| `services/api/src/ai/skills/_system/inbuilt-database/SKILL.md` | Named queries primary; auth-only `@doable/data` | Done |

## Feature flags

| Env | Default | Meaning |
|-----|---------|---------|
| `DOABLE_APP_RUNTIME_ENABLED` | ON unless `0` (same as `DOABLE_APP_DB_ENABLED`) | Master switch for app runtime + named-query write gate |

## Merge policy

1. Put logic in overlay roots.
2. Upstream files: import + single register call only.
3. Update this table in the same PR as the hook.
