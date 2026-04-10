# Supabase Integration Analysis

**Date:** 2026-04-09
**Purpose:** Map the full Supabase integration flow and identify what could break during a real end-to-end test of building a Supabase-backed app via AI chat.

---

## 1. Architecture Overview

The Supabase integration spans 5 layers:

1. **Registry definition** — declares auth type, env key mappings, enhanced auth config
2. **Credential storage** — vault-bridge encrypts/decrypts credentials, maps to env vars
3. **AI tools** — `provision_supabase` tool + MCP preset with 18 Supabase-specific tools
4. **Dev server injection** — env vars injected into Vite child process at spawn time
5. **Frontend dialog** — provision/connect dialog rendered in the editor page

---

## 2. Supabase Connection Setup

### Two connection paths

**Path A: Enhanced Auth (OAuth)**
- User clicks "Sign in with Supabase" in the provision dialog or integrations panel
- OAuth flow against `https://api.supabase.com/v1/oauth/authorize` with PKCE (S256)
- Scopes: `["all"]`
- After OAuth callback, user picks a Supabase project from a resource list
- `services/api/src/integrations/enhanced-auth/supabase.ts:38-86` — `extractCredentials()` pulls anon + service_role keys via `/v1/projects/{ref}/api-keys`
- Stores TWO rows in `integration_connections`:
  - `integration_id="supabase"` — data-plane creds (url, apiKey, anonKey, serviceRoleKey)
  - `integration_id="supabase-mgmt"` — raw OAuth access_token for Management API
- File: `services/api/src/routes/integrations.ts` — `storeMgmtTokenSibling()` helper (fix from bug-23)

**Path B: Manual Entry**
- User pastes Project URL + API Key (service role or anon)
- Stores ONE row: `integration_id="supabase"` with `auth_type="custom_auth"`
- No `supabase-mgmt` row created — provisioning new projects is NOT available
- Data-plane tools (CRUD, file upload) work fine

### Provisioning (Create New Project)
- File: `services/api/src/routes/integrations/supabase/provision.ts`
- Route: `POST /api/integrations/supabase/provision` (SSE stream)
- Steps: createProject -> waitForActive (120s timeout, 3s poll) -> getApiKeys -> run pendingMigrations -> deploy pendingEdgeFunctions -> store credentials -> restart dev server
- Concurrency lock: one in-flight provision per user (in-memory Set)
- File: `services/api/src/integrations/supabase/provisioner.ts` — Management API wrappers

### Connect Existing Project
- Route: `POST /api/integrations/supabase/use-existing`
- File: `services/api/src/routes/integrations/supabase/provision.ts:175-278`
- Pulls API keys via enhanced-auth module, stores as project-scoped `supabase` connection
- Restarts dev server with userId to pick up new env vars

---

## 3. Environment Variable Injection

### Registry envKeyMap (developer-tools.ts:388-399)

```
client: { url: "VITE_SUPABASE_URL", anonKey: "VITE_SUPABASE_ANON_KEY" }
server: { serviceRoleKey: "SUPABASE_SERVICE_ROLE_KEY" }
runtimeHint: "Postgres DB + auth + storage (Supabase)."
```

### Vault-bridge resolution chain

1. `services/api/src/env/vault-bridge.ts:59-169` — `resolveVaultEnv()`:
   - Loads effective connections via `credentialVault.getEffective(workspaceId, projectId, userId)`
   - Dedupes by integration_id (highest priority scope wins: project > user > workspace)
   - Decrypts credentials, maps through envKeyMap
   - Enforces: client vars MUST start with `VITE_`, server vars MUST NOT start with `VITE_`
   - Returns `{ env: Record<string, string>, manifest: IntegrationEnvManifest[] }`

2. `services/api/src/env/resolve.ts:34-74` — `resolveProjectEnvVars()`:
   - Merges vault env UNDER user `env_vars` table (user vars override vault)
   - Requires `userId` to consult vault; without it, only env_vars table is used

3. `services/api/src/projects/dev-server.ts:200-216` — spawns Vite with vault env:
   - Calls `resolveProjectEnvVars(projectId, "development", undefined, opts?.userId)`
   - Spreads result into `child.env` alongside `process.env`

### Critical: env vars only resolve at dev server SPAWN time
- If the user connects Supabase AFTER the dev server is already running, the running Vite process does NOT have the new vars
- Both provision routes (`/provision` and `/use-existing`) explicitly restart the dev server with `{ userId }` to re-resolve
- The frontend also fires a restart via `POST /projects/:id/dev-server/restart` when the provision dialog closes

---

## 4. AI Tools for Supabase

### Built-in tool: `provision_supabase`
- File: `services/api/src/ai/providers/copilot.ts:1055-1080`
- Does NOT actually contact Supabase — returns a tagged `_sseHint: "provision_supabase_required"` payload
- SSE pipe in `chat.ts` forwards this as an event to the frontend
- Frontend opens `SupabaseProvisionDialog` (rendered in `page.tsx:5664-5693`)
- After dialog closes with `done=true`, frontend sends follow-up message nudging AI to continue

### MCP Preset: Official Supabase MCP Server
- File: `services/api/src/mcp/presets/supabase.ts`
- Spawns `npx -y @supabase/mcp-server-supabase@latest` via stdio
- Requires BOTH a `projectRef` (from `supabase` data row) AND an `access_token` (from `supabase-mgmt` OAuth row)
- Builder scans `context.allConnections` to stitch the two rows together

**Read-only tools (always available when MCP preset mounts):**
- `mcp_supabase_list_tables`, `mcp_supabase_list_extensions`, `mcp_supabase_list_migrations`
- `mcp_supabase_execute_sql`, `mcp_supabase_get_logs`, `mcp_supabase_get_advisors`
- `mcp_supabase_get_project_url`, `mcp_supabase_get_anon_key`
- `mcp_supabase_generate_typescript_types`
- `mcp_supabase_list_edge_functions`, `mcp_supabase_list_branches`, `mcp_supabase_search_docs`

**Write tools (require `metadata.mcp_writes_enabled === true`):**
- `mcp_supabase_apply_migration`, `mcp_supabase_deploy_edge_function`
- `mcp_supabase_create_branch`, `mcp_supabase_delete_branch`, `mcp_supabase_merge_branch`
- `mcp_supabase_reset_branch`, `mcp_supabase_rebase_branch`

### Activepieces-backed native tools
- From `@activepieces/piece-supabase`: `upload-file`, `create_row`, `update_row`, `upsert_row`, `delete_rows`, `search_rows`, `custom_api_call`
- These use the `supabase` data-plane connection credentials (url + apiKey)

### System Prompt Integration
- File: `services/api/src/integrations/prompt-manifest.ts:57-119`
- Builds `<connected-integrations>` block injected into AI system prompt
- Lists env var NAMES (never values), tool names, runtime hints
- Includes MCP tool names from `SUPABASE_MCP_FULL_TOOL_NAMES`
- Explicit rule: "NEVER ask the user for API keys, URLs, or tokens for these services"

### Supabase Client Guard in System Prompt
- File: `services/api/src/routes/chat.ts:1132-1138`
- Critical rule in system prompt telling the AI to guard `createClient()`:
  ```ts
  const url = import.meta.env.VITE_SUPABASE_URL ?? "";
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
  export const supabase = url ? createClient(url, key) : null;
  ```
- Without this guard, `createClient(undefined, undefined)` throws and white-screens the preview

---

## 5. Known Bugs (Fixed)

### Bug 16 — Supabase provision dialog never renders (FIXED)
- File: `bugs/bug-16-supabase-provision-dialog-never-rendered.md`
- Root cause: 4 distinct issues — dead-code trap (chat-panel.tsx not imported), SDK result-shape mismatch, iterator grace-period race, dialog verification methodology
- Fix: wired dialog into page.tsx, added `extractSseHintPayload()` helper, emit on `onToolStart` not `onToolEnd`

### Bug 23 — Supabase mgmt token not dual-stored (FIXED)
- File: `bugs/bug-23-supabase-mgmt-token-not-dual-stored.md`
- Root cause: enhanced-auth completion handler only wrote `supabase` data row, never wrote `supabase-mgmt` sibling
- Fix: `storeMgmtTokenSibling()` helper writes sibling row after main store()
- Also added inline "Sign in with Supabase" button in provision dialog

---

## 6. Potential Breakage Points During Real User Test

### HIGH RISK

**6.1. Frontend dev-server restart does NOT pass userId**
- File: `services/api/src/routes/project-files.ts:457-475`
- The `POST /projects/:id/dev-server/restart` route called from the frontend (`page.tsx:5679`) does NOT extract or pass `userId` to `startDevServer()`
- Without `userId`, `resolveProjectEnvVars()` skips the vault lookup entirely (line 56-57 of `resolve.ts`)
- Result: the restarted Vite process has NO vault-backed env vars — `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are undefined
- **However**: the backend provision routes (`/provision` and `/use-existing`) ALSO restart with `{ userId }` before returning, so there's a race between backend restart (with userId, correct) and frontend restart (without userId, wrong)
- If the frontend restart fires AFTER the backend restart, it would kill the correctly-configured server and replace it with one missing env vars
- Mitigation: the backend restart happens synchronously before the SSE `[DONE]` frame, while the frontend fires the restart in `onClose` after the dialog dismisses. The 2s setTimeout before `sendMessage` helps but the restart itself fires immediately.

**6.2. `mcp_writes_enabled` is never set by default**
- File: `services/api/src/mcp/presets/supabase.ts:106-108`
- Both `provision` and `use-existing` flows store credentials with NO `mcp_writes_enabled` in metadata
- Result: MCP server runs in `--read-only` mode — `apply_migration` and `deploy_edge_function` MCP tools are blocked
- The AI can still create tables via the Management API's `/database/query` endpoint (used by `runMigration` in the provision flow), but only DURING provisioning (with pendingMigrations)
- After provisioning, the AI has NO MCP write tools available. It can only use the Activepieces `create_row`/`update_row`/`search_rows` tools for data operations, but cannot alter schema
- **Impact**: The AI cannot create tables, alter schema, or deploy edge functions after initial provisioning unless `mcp_writes_enabled` is manually toggled

**6.3. OAuth token expiry — no automatic refresh for supabase-mgmt**
- File: `services/api/src/integrations/oauth2.ts:306-361` — token refresh logic exists
- But `supabase-mgmt` uses `auth_type="oauth2"` while the refresh logic requires the integration to be in the registry with `oauth2Config.tokenUrl`
- The `supabase-mgmt` integration ID is NOT in the registry (`developer-tools.ts` only has `supabase`, not `supabase-mgmt`)
- Result: if the OAuth access_token expires, the MCP server will fail silently, provisioning will return 412, and the user must re-authenticate
- Supabase OAuth tokens typically expire in 1 hour

**6.4. install_package restarts dev server WITHOUT userId**
- File: `services/api/src/ai/tools/install-package.ts:102`
- `restartDevServer(ctx.projectId)` — no `{ userId }` passed
- Also in `copilot.ts:875` — same issue
- If the AI installs `@supabase/supabase-js` and the dev server restarts, vault-backed env vars are lost
- The comment at line 138-142 explicitly acknowledges this but argues the Vite restart "picks up the vault env via the normal startDevServer path" — this is INCORRECT since no userId is passed

### MEDIUM RISK

**6.5. `@supabase/mcp-server-supabase` is fetched via `npx -y ... @latest`**
- File: `services/api/src/mcp/presets/supabase.ts:167-168`
- Every chat turn that has Supabase connected will `npx` the latest version
- First run downloads ~10-20MB; subsequent runs use npx cache
- On slow networks or cold servers, this adds latency to the first chat turn
- Version changes could break tool names (though the tool list is hardcoded)

**6.6. Double restart race condition**
- The provision route restarts the dev server (backend, line 469-472 of provision.ts)
- Then the frontend onClose handler ALSO fires a restart (line 5679 of page.tsx)
- `restartDevServer()` calls `stopDevServer()` then `startDevServer()` — if two restarts overlap, the second stop kills the first start's Vite process mid-boot
- The in-flight guard (`startingServers` Map at dev-server.ts:46) prevents duplicate starts but NOT a stop-during-start scenario

**6.7. Provision timeout on slow Supabase project creation**
- File: `services/api/src/integrations/supabase/provisioner.ts:92`
- `waitForActive` has a 120s timeout with 3s polling
- Supabase project creation can take 60-120s for the first project in a new org
- If it times out, the SSE stream emits an error but the Supabase project still exists (orphaned)
- The user has no way to attach the orphaned project short of re-running the dialog

### LOW RISK

**6.8. `createClient` guard depends on AI compliance**
- The system prompt tells the AI to guard with `url ? createClient(url, key) : null`
- If the AI ignores this (LLM non-determinism), `createClient(undefined)` throws
- White screen in preview — recoverable only by the AI fixing the code

**6.9. Provisioner never auto-deletes orphaned projects**
- By design: "Never delete a Supabase project automatically"
- But if provisioning fails mid-stream, the user ends up with a Supabase project that has no Doable credential row
- They must clean up via the Supabase dashboard manually

---

## 7. End-to-End Flow Map

```
User sends prompt: "Build a CRM that stores contacts in Supabase"
                |
                v
  [chat.ts] System prompt includes <connected-integrations> block
  (if Supabase already connected, AI sees VITE_SUPABASE_URL etc.)
                |
                v
  [copilot.ts] AI decides: "Need Supabase" -> calls provision_supabase tool
  (or request_integration if no connection exists at all)
                |
                v
  [chat.ts] onToolStart fires -> emits SSE: provision_supabase_required
                |
                v
  [page.tsx] setSupabaseProvisionRequest({name, reason})
  -> renders <SupabaseProvisionDialog>
                |
                v
  User picks: "Connect existing" or "Create new"
                |
    +-----------+-----------+
    |                       |
    v                       v
  POST /use-existing     POST /provision (SSE)
  (instant)              (60-120s wait)
    |                       |
    v                       v
  credentialVault.store()  createProject -> waitForActive
  (supabase row)          -> getApiKeys -> runMigrations
                          -> deployEdgeFunctions -> store()
    |                       |
    v                       v
  restartDevServer         restartDevServer
  (with userId)            (with userId)
    |                       |
    +----------+------------+
               |
               v
  Dialog auto-closes (done=true)
               |
               v
  [page.tsx] onClose handler:
    1. Fires POST /dev-server/restart (WITHOUT userId -- BUG)
    2. After 2s, sends follow-up message to AI
               |
               v
  [chat.ts] AI receives: "Supabase provisioning complete..."
  AI now sees VITE_SUPABASE_URL in <connected-integrations>
               |
               v
  AI writes code:
    - src/lib/supabase.ts (createClient with guard)
    - src/components/ContactForm.tsx (uses supabase client)
    - Calls install_package for @supabase/supabase-js
               |
               v
  [install_package] npm install -> restartDevServer (WITHOUT userId -- BUG)
               |
               v
  Vite dev server restarts WITHOUT vault env vars
  -> VITE_SUPABASE_URL is undefined in import.meta.env
  -> createClient guard kicks in -> supabase = null
  -> App renders "Connecting to database..." placeholder
  -> User sees a non-functional app
```

---

## 8. Key File Index

| Area | File | Lines |
|------|------|-------|
| Registry definition | `services/api/src/integrations/registry/developer-tools.ts` | 349-400 |
| Enhanced auth module | `services/api/src/integrations/enhanced-auth/supabase.ts` | 1-106 |
| Provisioner (create project) | `services/api/src/integrations/supabase/provisioner.ts` | 1-170 |
| Migration runner | `services/api/src/integrations/supabase/migrate.ts` | 1-77 |
| Edge function deployer | `services/api/src/integrations/supabase/edge-functions.ts` | 1-128 |
| Provision routes | `services/api/src/routes/integrations/supabase/provision.ts` | 1-491 |
| Vault-bridge (env mapping) | `services/api/src/env/vault-bridge.ts` | 1-170 |
| Env resolver | `services/api/src/env/resolve.ts` | 1-122 |
| Dev server (Vite spawn) | `services/api/src/projects/dev-server.ts` | 200-233 |
| MCP preset (Supabase server) | `services/api/src/mcp/presets/supabase.ts` | 1-204 |
| Preset registry | `services/api/src/mcp/presets/index.ts` | 1-78 |
| Prompt manifest | `services/api/src/integrations/prompt-manifest.ts` | 1-119 |
| AI tool: provision_supabase | `services/api/src/ai/providers/copilot.ts` | 1047-1080 |
| AI tool: request_integration | `services/api/src/ai/providers/copilot.ts` | 1082-1120 |
| Chat SSE forwarding | `services/api/src/routes/chat.ts` | 1225-1291 |
| System prompt guard | `services/api/src/routes/chat.ts` | 1132-1138 |
| Frontend dialog | `apps/web/src/modules/integrations/supabase-provision-dialog.tsx` | 1-745 |
| Editor page wiring | `apps/web/src/app/editor/[projectId]/page.tsx` | 5664-5693 |
| Dev server restart route | `services/api/src/routes/project-files.ts` | 455-475 |
| install_package restart | `services/api/src/ai/tools/install-package.ts` | 99-103 |
| Bug 16 (dialog never renders) | `bugs/bug-16-supabase-provision-dialog-never-rendered.md` | Fixed |
| Bug 23 (mgmt token missing) | `bugs/bug-23-supabase-mgmt-token-not-dual-stored.md` | Fixed |

---

## 9. Recommended Pre-Test Fixes

1. **Fix dev-server restart route to pass userId** (`project-files.ts:457-475`) — extract userId from auth middleware and pass to `startDevServer(projectId, { userId })`
2. **Fix install_package to pass userId** (`install-package.ts:102` and `copilot.ts:875`) — thread userId from the chat context into the tool handler
3. **Consider enabling `mcp_writes_enabled` by default** for provisioner-created projects, or add a UI toggle in the provision dialog so the AI can create tables after initial setup
4. **Remove the redundant frontend restart** in `page.tsx:5679` since the backend already restarts with userId — or at minimum make it pass userId via the API
