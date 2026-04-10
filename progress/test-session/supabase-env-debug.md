# Supabase Env Var Injection Debug

## Root Cause

The Supabase credentials (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are NOT reaching the Vite dev server because multiple `startDevServer()` / `restartDevServer()` call sites omit the `userId` parameter. Without `userId`, `resolveProjectEnvVars()` skips the vault lookup entirely (line 56 of resolve.ts: `if (userId) { ... }`), so only user-managed `env_vars` table entries are returned -- which are empty for vault-backed integrations like Supabase.

## Scoping Analysis

**Workspace vs Project scoping is NOT the issue.** The `credentialVault.getEffective()` query (credential-vault.ts:71-81) includes `scope = 'workspace'` connections unconditionally -- it only requires `workspaceId`, not `projectId`. A workspace-scoped Supabase connection will be found as long as `userId` is provided.

**The `envKeyMap` is correctly defined** in developer-tools.ts:388-399:
- `client.url` -> `VITE_SUPABASE_URL`
- `client.anonKey` -> `VITE_SUPABASE_ANON_KEY`
- `server.serviceRoleKey` -> `SUPABASE_SERVICE_ROLE_KEY`

**The credential field names match** what the enhanced-auth Supabase provider stores (supabase.ts:72-74): `url`, `anonKey`, `serviceRoleKey`.

## Call Sites Missing userId (FIXED)

| File | Line | Call | Fix |
|------|------|------|-----|
| `ai/tools/install-package.ts` | 102 | `restartDevServer(ctx.projectId)` | Added `{ userId: ctx.userId }` -- ctx has userId |
| `ai/providers/copilot.ts` | 875 | `restartDevServer(projectId)` | Added `userId ? { userId } : undefined` -- function signature updated to accept userId |
| `ai/providers/copilot.ts` | 693 | `createDoableTools(projectId)` | Signature changed to `createDoableTools(projectId, userId?)` |
| `ai/providers/copilot.ts` | 1172 | `createDoableTools(projectId)` | Now passes `userId` through `createAllTools` |
| `routes/project-files.ts` | 183 | `startDevServer(projectId)` | Added `userId ? { userId } : undefined` from `c.get("userId")` |
| `routes/project-files.ts` | 235 | `startDevServer(projectId)` | Added `existingUserId ? { userId: existingUserId } : undefined` |
| `routes/project-files.ts` | 441 | `startDevServer(projectId)` | Added `uid ? { userId: uid } : undefined` from `c.get("userId")` |
| `routes/project-files.ts` | 475 | `startDevServer(projectId)` | Added `uid ? { userId: uid } : undefined` from `c.get("userId")` |

## Call Sites That Already Pass userId (No Change Needed)

| File | Line | Call |
|------|------|------|
| `routes/chat.ts` | 1015 | `startDevServer(projectId, { userId })` |
| `routes/integrations.ts` | 121 | `restartDevServer(projectId, userId ? { userId } : undefined)` |
| `routes/integrations/supabase/provision.ts` | 263 | `restartDevServer(body.projectId, { userId })` |
| `routes/integrations/supabase/provision.ts` | 471 | `restartDevServer(body.projectId, { userId })` |

## Call Sites Without Auth Context (Accepted)

| File | Line | Call | Reason |
|------|------|------|--------|
| `routes/preview-proxy.ts` | 47 | `startDevServer(projectId)` | Preview proxy is unauthenticated -- no userId available. This is a fallback auto-start when the dev server has died; the primary start comes from chat.ts which passes userId. |

## Verification

TypeScript compiles cleanly (no new errors in any modified file).
