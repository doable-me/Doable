# Doable Monitor Log — E2E Test Session

**Generated:** 2026-04-09T12:37:36Z  
**Platform:** Windows 10 (local dev environment)  
**Branch:** main  

---

## 1. API Health Check
**Timestamp:** 2026-04-09T12:36:07Z  
**Endpoint:** `curl -s http://127.0.0.1:4000/health`  

```json
{
  "status": "healthy",
  "timestamp": "2026-04-09T12:36:07.651Z",
  "version": "0.1.0",
  "uptime": 5.54,
  "checks": {
    "database": { "status": "up", "latencyMs": 1 },
    "memory": {
      "rssBytes": 264155136,
      "heapUsedBytes": 66048064,
      "heapTotalBytes": 208642048
    },
    "devServers": { "active": 0 }
  }
}
```

**Result:** HEALTHY  
- Database: UP (1ms latency — excellent)  
- Memory: 264 MB RSS, 66 MB heap used / 208 MB total  
- API uptime was 5.5 seconds at time of check (recently restarted)  

---

## 2. WebSocket Server Status
**Timestamp:** 2026-04-09T12:36:07Z  
**Endpoint:** `curl -s http://127.0.0.1:4001/health`  

```json
{"status":"ok","rooms":0,"users":0}
```

**Result:** HEALTHY  
- No active rooms or connected users (idle state, expected for monitoring check)  

---

## 3. Active Dev Servers
**Source:** API health response — `checks.devServers.active`  

**Active dev servers: 0**  

No project dev servers are currently spawned. This is expected when no user has opened a project requiring a local dev server process. Dev servers are spawned on-demand when users interact with projects in the editor.

---

## 4. Database State
**Timestamp:** 2026-04-09T12:37:00Z  

Direct psql is not available in the shell path (Windows local dev). Node pg module query also failed (not installed in root context — api service uses its own node_modules via tsx). The API database health check (`SELECT 1`) confirmed the database is reachable and up.

**API-side DB status:** Connected (1ms query latency)  
**Direct row counts:** Not queryable without auth token (all /api/* endpoints require Authorization header)  

To get counts, a valid JWT would be needed:  
- `GET /workspaces` — lists user workspaces  
- `GET /projects` — lists projects  

---

## 5. Integration Registry Status
**Timestamp:** 2026-04-09T12:37:00Z  

The `GET /integrations/registry` endpoint requires Authorization. However, the registry source code reveals:

**Total integrations in registry:**  
- **Generated (auto-scraped from Activepieces pieces):** 505 integrations  
- **Hand-curated category files:** communication, productivity, developer-tools, ai-ml, crm-marketing-social, finance-ecommerce  
- **Curated overrides:** registry.ts (highest priority)  

**Registry composition:**  
```
REGISTRY = GENERATED_REGISTRY (505)
         + COMMUNICATION_INTEGRATIONS
         + PRODUCTIVITY_INTEGRATIONS
         + DEVELOPER_TOOLS_INTEGRATIONS
         + AI_ML_INTEGRATIONS
         + CRM_MARKETING_SOCIAL_INTEGRATIONS
         + FINANCE_ECOMMERCE_INTEGRATIONS
         + CURATED_REGISTRY  (highest priority, last-wins merge)
```

Generated registry was last updated: **2026-03-31T07:45:20.854Z**  

**Integration sub-routes present:**  
- `/routes/integrations/supabase/` — Supabase provisioning  

---

## 6. AI Provider Status
**Timestamp:** 2026-04-09T12:37:00Z  

**Configured providers (from services/api/.env):**  
| Provider | Status |
|----------|--------|
| ANTHROPIC_API_KEY | SET (value redacted) |
| OPENAI_API_KEY | SET (value redacted) |
| GitHub Copilot | COPILOT_CLI_PATH and COPILOT_CLI_URL not set — auto-detection only |
| COPILOT_DEFAULT_MODEL | Not set (empty) |

**CRITICAL WARNING — ENCRYPTION_KEY not set in .env:**  
`ENCRYPTION_KEY` is missing from `services/api/.env`. This means:  
- The `aiSettingsQueries` module receives `undefined` as the encryption key  
- `pgp_sym_encrypt(value, NULL)` silently produces NULL  
- All BYOK provider API keys stored via the UI are silently lost  
- AI chat with BYOK providers fails with "API key is required"  
- See **BUG-102** for details  

**Note:** The credential vault (`integrations/credential-vault.ts`) has a fallback `"doable-dev-encryption-key"` but the ai-settings route does NOT — this is the inconsistency.

**Provider discovery service:** Implemented in `services/api/src/ai/provider-discovery.ts` — handles OpenAI, Azure, and Anthropic provider types with latency tracking and model discovery.

---

## 7. Supabase Environment Variables
**Timestamp:** 2026-04-09T12:37:00Z  
**Source:** `services/api/.env`  

**No SUPABASE_* variables found in services/api/.env.**  

Supabase integration in this codebase operates differently:  
- Users connect their own Supabase projects via the integration OAuth/Enhanced Auth flow  
- Credentials are stored in the integration credential vault (encrypted in the database)  
- The API has a dedicated provisioning route at `/integrations/supabase/provision`  
- OAuth app config for Supabase is handled through the enhanced-auth module  
- Google OAuth for integrations: `GOOGLE_INTEGRATIONS_CLIENT_ID` is set (for Google Workspace integrations)  

---

## 8. MCP Connector Status
**Timestamp:** 2026-04-09T12:37:00Z  

MCP (Model Context Protocol) connector system is fully implemented:  

**Architecture:**  
- `ConnectorManager` — lazy connect, pooling, reconnection, eviction (30-min idle timeout, max 50 connections)  
- Supports stdio and SSE transports (`McpClient`, `createTransport`)  
- Per-scope resolution: workspace + project + user connectors merged  
- Connectors stored in database via `connectorQueries`  

**Currently active MCP connections:** 0 (no active sessions)  

**MCP tools available:** Determined at runtime when connectors are loaded — not statically configured  

---

## 9. Recent Errors / Open Bugs
**Timestamp:** 2026-04-09T12:37:36Z  

The `bugs/` directory contains **16 new bug reports** (bug-101 through bug-116) filed on 2026-04-09, all currently untracked in git. These represent findings from the current E2E test session:

### CRITICAL SECURITY BUGS:
| Bug | Component | Description |
|-----|-----------|-------------|
| BUG-101 | project-files route | Any user can write files to any project (no ownership check) |
| BUG-103 | auth route | Refresh token rotation broken — old tokens remain valid |
| BUG-104 | auth route | XSS via unsanitized displayName |
| BUG-105 | auth/OAuth | OAuth tokens leaked in URL |
| BUG-106 | auth route | No rate limiting on auth endpoints |
| BUG-107 | lib/jwt.ts | Hardcoded fallback JWT secret `"fallback-dev-secret-change-me"` |
| BUG-108 | preview-proxy | Preview proxy has no authentication |
| BUG-111 | project-files route | File tree endpoints also lack auth |
| BUG-114 | OAuth | OAuth state parameter not validated (CSRF risk) |

### CRITICAL FUNCTIONAL BUGS:
| Bug | Component | Description |
|-----|-----------|-------------|
| BUG-102 | ai-settings | ENCRYPTION_KEY missing — BYOK keys silently not stored |
| BUG-109 | chat/use-chat | Chat collaboration dedup broken — double messages |
| BUG-110 | editor | Dual state management causing editor conflicts |
| BUG-112 | deploy route | Deploy has no concurrency guard — race conditions |
| BUG-113 | versions route | Rollback rebuilds unnecessarily |
| BUG-115 | project-files | Create file can overwrite existing files |
| BUG-116 | workspaces | Workspace auto-creation inconsistencies |

---

## 10. Git Status
**Timestamp:** 2026-04-09T12:37:36Z  

**Branch:** main  
**Modified (tracked):**  
- `.claude/settings.local.json` — Claude Code config changes  
- `packages/shared/tsconfig.tsbuildinfo` — TypeScript build cache  

**Untracked files (notable):**  
- `bugs/bug-101` through `bug-116` — 16 new bug reports from today's E2E session  
- `progress/test-session/` — this monitoring directory  
- `progress/2026-04-08-ai-settings-dual-source-fix.md`  
- `progress/2026-04-08-test-flow-map.md`  
- `progress/test-db-query.js`  
- Multiple `progress/.10turn_log_*` files from prior test turns  

**Recent commits (last 10):**  
```
fd46a7b Merge branch 'worktree-agent-ac750b1e'
12dc808 Merge branch 'worktree-agent-ad2b247e'
e08a79a Merge branch 'worktree-agent-aabb836e'
740c0d0 Merge branch 'worktree-agent-a12ecad7'
8f064f8 Merge branch 'worktree-agent-a4035bbf'
6f37b84 fix: add missing Authorization headers to file tree API calls
870671f fix(auth): sanitize displayName to prevent XSS and add rate limiting to auth routes
826bd9e fix(auth): use SHA-256 for refresh token hashing, add atomic rotation, consolidate JWT logic
79300b4 fix: auto-create personal workspace on registration and OAuth sign-up
c324db9 fix(api): add project access authorization to file operation endpoints
```

Note: The 5 most recent commits are all worktree-agent merges — automated agent branches merged into main. The fixes before those address auth hardening: Authorization header fixes, XSS sanitization, rate limiting, and SHA-256 refresh token hashing.

---

## Summary

| Check | Status | Notes |
|-------|--------|-------|
| API Health | HEALTHY | DB up, 1ms latency |
| WebSocket | HEALTHY | 0 rooms, 0 users (idle) |
| Active Dev Servers | 0 | No active projects |
| Database | CONNECTED | Cannot query counts without auth |
| Integrations | 505+ available | Last generated 2026-03-31 |
| ANTHROPIC_API_KEY | SET | Provider available |
| OPENAI_API_KEY | SET | Provider available |
| ENCRYPTION_KEY | MISSING | CRITICAL — BYOK keys broken |
| SUPABASE_* vars | NOT SET | Expected — user-level OAuth |
| MCP Connectors | 0 active | Lazy-loaded on demand |
| Open Bugs | 16 new | Mix of security and functional |

**Overall assessment:** Services are running and healthy. Core functionality (API, WS, DB) is operational. The main concerns are the 16 open bugs filed today, particularly the critical security issues (BUG-101 unauthorized write, BUG-103 token rotation, BUG-107 JWT fallback, BUG-108 unauth preview) and the functional regression from ENCRYPTION_KEY missing (BUG-102).
