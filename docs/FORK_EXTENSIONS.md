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
| *(none yet)* | — | Phase 0 not started |

## Feature flags

| Env | Default | Meaning |
|-----|---------|---------|
| `DOABLE_APP_RUNTIME_ENABLED` | `0` (until Phase 2+) | Master switch for app runtime |

## Merge policy

1. Put logic in overlay roots.
2. Upstream files: import + single register call only.
3. Update this table in the same PR as the hook.
