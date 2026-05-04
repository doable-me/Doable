# Implementation Plan — Phased Rollout

## Current State Assessment

**Already built (can be reused):**
- ✅ `CONNECTOR_BRIDGE_SNIPPET` — postMessage token delivery to preview iframes
- ✅ `window.__doable.callConnector()` — basic proxy call function
- ✅ `POST /projects/:id/connector-proxy-token` — JWT issuance endpoint
- ✅ `runAction()` — full Activepieces execution engine with vault + OAuth refresh
- ✅ `credentialVault` — encrypted credential storage + scoped retrieval
- ✅ `resolveVaultEnv()` — env var resolution with client/server split
- ✅ Integration registry — 200+ integration definitions with action schemas
- ✅ Rate limiting infrastructure — KV store + sliding window middleware
- ✅ Xray/tracing — request-level instrumentation

**Needs to be built:**
- ❌ `/__doable/connector-proxy/:integration/:action` route handler (the actual execution endpoint)
- ❌ `@doable/sdk` package (client SDK with React hooks)
- ❌ `@doable/sdk/server` entry point (for Next.js server-side)
- ❌ Project API keys (for deployed apps)
- ❌ AI framework prompts update (teach AI to use SDK)
- ❌ SDK auto-injection into scaffold templates
- ❌ Discovery endpoint (`GET /__doable/connector-proxy/available`)
- ❌ Audit logging for proxy calls
- ❌ Per-project rate limiting on proxy
- ❌ Webhook relay (Phase 3)

---

## Phase 1: Proxy Route + Basic SDK (Preview Mode)

**Goal:** Generated apps can call integrations during preview via `@doable/sdk`.

### Tasks

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 1.1 | Create connector-proxy route handler | `services/api/src/routes/connector-proxy.ts` | Medium |
| 1.2 | Wire route into preview-proxy (intercept `/__doable/connector-proxy/*`) | `services/api/src/routes/preview-proxy/proxy-handler.ts` | Small |
| 1.3 | Create `@doable/sdk` package scaffold | `packages/doable-sdk/` | Small |
| 1.4 | Implement core `createDoableClient()` + `integrations.run()` | `packages/doable-sdk/src/index.ts` | Medium |
| 1.5 | Implement React hooks (`useIntegration`, `useIntegrationQuery`) | `packages/doable-sdk/src/react.ts` | Medium |
| 1.6 | Add `@doable/sdk` to Vite scaffold template dependencies | `services/api/src/frameworks/adapters/vite-react.ts` | Small |
| 1.7 | Add `@doable/sdk` to Next.js scaffold template dependencies | `services/api/src/frameworks/adapters/nextjs-app.ts` | Small |
| 1.8 | Discovery endpoint — `GET /__doable/connector-proxy/available` | `services/api/src/routes/connector-proxy.ts` | Small |
| 1.9 | Rate limiting on proxy route (per-project, per-integration) | Same file | Small |
| 1.10 | Integration tests (mock vault, verify auth + execution) | `services/api/src/__tests__/connector-proxy.test.ts` | Medium |

### Acceptance Criteria
- [ ] Vite app in preview can call `doable.integrations.run("slack", "send_channel_message", {...})` and it works
- [ ] Next.js app in preview can do the same from both client and server
- [ ] 401 returned for expired/missing token
- [ ] 403 returned for disconnected integration
- [ ] 429 returned when rate limit exceeded
- [ ] Works on both Windows (dev) and Linux (server)

---

## Phase 2: Deployed Apps Support (API Keys)

**Goal:** Published apps can call integrations without the editor being open.

### Tasks

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 2.1 | `project_api_keys` table migration | `services/api/src/db/migrations/0XX_project_api_keys.sql` | Small |
| 2.2 | API key generation endpoint | `services/api/src/routes/projects/api-keys.ts` | Medium |
| 2.3 | API key validation in connector-proxy | `services/api/src/routes/connector-proxy.ts` | Small |
| 2.4 | Implement `@doable/sdk/server` entry point | `packages/doable-sdk/src/server.ts` | Small |
| 2.5 | Auto-inject `DOABLE_PROJECT_KEY` + `DOABLE_PROJECT_ID` at deploy time | `services/api/src/deploy/pipeline.ts` | Medium |
| 2.6 | Key management UI (generate, revoke, show once) | `apps/web/src/` (settings page) | Medium |
| 2.7 | Separate rate limits for client vs server keys | `services/api/src/routes/connector-proxy.ts` | Small |
| 2.8 | Audit log table + endpoint | Migration + route | Medium |

### Acceptance Criteria
- [ ] Deployed Vite app can call integrations using `VITE_DOABLE_PROJECT_KEY`
- [ ] Deployed Next.js app can call integrations from Server Actions using `DOABLE_PROJECT_KEY`
- [ ] API key shown once at creation, stored as hash only
- [ ] Key rotation works (old key immediately invalid)
- [ ] Server keys have 2x rate limits vs client keys
- [ ] Audit log accessible in workspace settings

---

## Phase 3: AI Integration + Polish

**Goal:** AI automatically generates correct SDK usage code. Full production readiness.

### Tasks

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 3.1 | Update Vite framework prompt with SDK usage instructions | `services/api/src/ai/framework-prompts/vite-react.ts` | Small |
| 3.2 | Update Next.js framework prompt with SDK usage instructions | `services/api/src/ai/framework-prompts/nextjs-app.ts` | Small |
| 3.3 | Extend integration manifest in system prompt to include action summaries | `services/api/src/env/vault-bridge.ts` | Medium |
| 3.4 | Add `list_integration_actions` AI tool for on-demand discovery | `services/api/src/integrations/tool-bridge.ts` | Small |
| 3.5 | Graceful UI for disconnected integrations (`IntegrationSetupPrompt`) | `packages/doable-sdk/src/react.ts` | Small |
| 3.6 | TypeScript type generation for action props (nice-to-have) | `scripts/generate-integration-types.ts` | Large |
| 3.7 | Webhook relay infrastructure | `services/api/src/routes/webhook-relay.ts` | Large |
| 3.8 | Webhook relay UI (configure which webhooks to forward) | `apps/web/src/` | Medium |
| 3.9 | End-to-end test: user says "send Slack message" → AI generates → app works | Manual QA | Small |

### Acceptance Criteria
- [ ] AI generates `@doable/sdk` code (not raw fetch) when user asks for integration features
- [ ] AI correctly uses Server Actions for Next.js, event handlers for Vite
- [ ] AI tells user when an integration isn't connected
- [ ] Webhook relay delivers external webhooks to dev server during preview
- [ ] Full integration test passes: connect Slack → generate app → preview → message sent

---

## Phase 4: Scale & Observability (Future)

| Task | Purpose |
|------|---------|
| Response caching | Cache GET-like integration calls (e.g., list_channels) for 30s |
| Batch API | Allow multiple integration calls in one request |
| Usage billing metrics | Track calls per workspace for future pricing |
| Global rate limiting | Cross-instance rate limiting via Redis |
| Action allowlisting | Workspace admins restrict which actions apps can call |
| SDK auto-update | Notify users when SDK needs update |

---

## File Structure (Final State)

```
packages/
└── doable-sdk/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts          # createDoableClient, types
    │   ├── react.ts          # useIntegration, useIntegrationQuery
    │   ├── server.ts         # createServerClient (Next.js server-side)
    │   ├── token-manager.ts  # PostMessage token handling (internal)
    │   └── types.ts          # Shared TypeScript interfaces
    └── dist/                  # Built output

services/api/src/
├── routes/
│   ├── connector-proxy.ts         # NEW: Main proxy route handler
│   ├── preview-proxy/
│   │   └── proxy-handler.ts       # MODIFIED: Intercept /__doable/connector-proxy
│   └── projects/
│       └── api-keys.ts            # NEW: API key CRUD endpoints
├── db/migrations/
│   └── 0XX_project_api_keys.sql   # NEW: API keys table
├── ai/framework-prompts/
│   ├── vite-react.ts              # MODIFIED: Add SDK instructions
│   └── nextjs-app.ts              # MODIFIED: Add SDK instructions
└── env/
    └── vault-bridge.ts            # MODIFIED: Extended manifest format
```

---

## Migration Path for Existing Projects

1. **Existing projects continue to work** — `window.__doable.callConnector` is backward-compatible
2. **New scaffolds** include `@doable/sdk` by default
3. **Existing projects** can opt-in by running `pnpm add @doable/sdk` (or AI adds it when requested)
4. **No breaking changes** to the connector-bridge injection

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Activepieces action execution is slow (>2s) | Medium | Medium | Add timeout (10s default), return partial results, add caching for idempotent actions |
| OAuth token refresh race condition | Low | High | Existing `ensureTokenFresh` with mutex; add retry in SDK |
| Proxy becomes single point of failure | Medium | High | Health check endpoint; circuit breaker pattern; graceful degradation in SDK |
| AI generates wrong action names | Medium | Low | Runtime validation returns helpful error; AI has action list in prompt |
| Rate limits too aggressive for real apps | Medium | Medium | Start generous, tighten based on data; per-workspace override |
| API key leaked in public repo | Medium | High | Key rotation UI; scan alerts; client keys are low-privilege |

---

## Dependencies

```
Phase 1 depends on: nothing (all prerequisites exist)
Phase 2 depends on: Phase 1 (proxy route must exist before API keys auth it)
Phase 3 depends on: Phase 1 (SDK must exist before AI generates code using it)
Phase 3 depends on: Phase 2 (deployed app support needed for webhook relay)
Phase 4 depends on: Phases 1-3 complete + production usage data
```

## Definition of Done

The feature is complete when:
1. A user can say "build me an app that posts to Slack when a button is clicked"
2. The AI generates a working app using `@doable/sdk`
3. The app works in preview (no additional setup beyond connecting Slack)
4. The app works after deployment (API key auto-provisioned)
5. Credentials never appear in DevTools, source code, or network logs
6. Rate limiting prevents abuse
7. Audit trail shows all integration calls
