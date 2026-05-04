# Secure Integrations for Generated Apps — Architecture Overview

## Problem Statement

Doable has 200+ integrations (Slack, Stripe, GitHub, OpenAI, etc.) but they're only usable via AI chat tools. Generated Vite and Next.js apps cannot call these integrations at runtime — the only exception is Supabase (which uses direct env-var injection via `envKeyMap`).

This means a user who says "build me an app that posts to Slack when a form is submitted" gets an app that **looks right** but cannot actually call Slack at runtime without manual developer setup.

## Current State

### What exists today

| Capability | AI Chat | Generated App (Vite) | Generated App (Next.js) |
|---|---|---|---|
| Supabase (client SDK) | ✅ via MCP tools | ✅ via `VITE_SUPABASE_*` env vars | ✅ via `NEXT_PUBLIC_SUPABASE_*` |
| Stripe (publishable key) | ✅ via tools | ✅ via `VITE_STRIPE_PUBLISHABLE_KEY` | ✅ via env |
| Stripe (server-side charges) | ✅ via tools | ❌ no server runtime | ⚠️ possible via API routes but no credential access |
| Slack / Gmail / 190+ others | ✅ via Activepieces tools | ❌ | ❌ |

### What partially exists (connector-proxy)

A **connector-proxy** system is already scaffolded:

1. `CONNECTOR_BRIDGE_SNIPPET` injected into preview iframes
2. `window.__doable.callConnector(integration, action, props)` global function
3. JWT token delivery via `postMessage` from editor host
4. Route: `/__doable/connector-proxy/:integration/:action`
5. Token issuance: `POST /projects/:id/connector-proxy-token`

**Current limitations of the connector-proxy:**
- Only works during **preview** (editor must be open to deliver token via postMessage)
- Does NOT work for **published/deployed** apps (no editor parent to deliver token)
- No SDK abstraction layer — raw `window.__doable.callConnector` is framework-coupled
- No permission model beyond "project has the integration connected"
- No rate limiting on the proxy endpoint
- No audit logging
- AI doesn't know to generate code using the connector-proxy pattern

## Solution: Universal Secure Integration Proxy

Extend the existing connector-proxy into a **full integration runtime** that works across:
- Preview mode (dev server in editor)
- Published mode (deployed static/SSR apps)
- Both Vite (client-only SPA) and Next.js (with server components/API routes)

### Core Principle

> **Credentials never leave the Doable API server.**
> Generated apps call a proxy that decrypts vault credentials, executes the integration action, and returns sanitized results.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER (untrusted)                          │
│                                                                     │
│  ┌──────────────────────┐        ┌──────────────────────────────┐  │
│  │  Vite SPA            │        │  Next.js App                  │  │
│  │                      │        │                               │  │
│  │  import { useInteg } │        │  // Client Component          │  │
│  │    from "@doable/sdk" │        │  import { useIntegration }    │  │
│  │                      │        │    from "@doable/sdk/react"    │  │
│  │  // calls proxy via  │        │                               │  │
│  │  // fetch()          │        │  // Server Action / API Route │  │
│  │                      │        │  import { integrations }      │  │
│  │                      │        │    from "@doable/sdk/server"   │  │
│  └──────────┬───────────┘        └────────────┬──────────────────┘  │
│             │                                  │                     │
└─────────────┼──────────────────────────────────┼─────────────────────┘
              │ fetch (Bearer token)             │ fetch (project API key)
              ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     DOABLE API SERVER (trusted)                       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Integration Proxy Route                                     │   │
│  │  POST /__doable/connector-proxy/:integration/:action         │   │
│  │                                                              │   │
│  │  1. Validate auth (JWT or API key)                           │   │
│  │  2. Resolve project → workspace → userId                    │   │
│  │  3. Check: integration connected for this project?          │   │
│  │  4. Rate limit (per-project, per-integration)               │   │
│  │  5. Decrypt credentials from vault                          │   │
│  │  6. Execute action via runAction() (Activepieces runner)    │   │
│  │  7. Sanitize output (strip internal metadata)               │   │
│  │  8. Audit log                                               │   │
│  │  9. Return JSON result                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Credential Vault + Activepieces Runner (existing)           │   │
│  │  - OAuth token refresh                                       │   │
│  │  - API key decryption                                        │   │
│  │  - Action execution with HTTP tracing                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
                    External APIs (Slack, Stripe, etc.)
```

## Documents in this PRD

| # | File | Contents |
|---|------|----------|
| 00 | `00-overview.md` | This document — problem, current state, high-level architecture |
| 01 | `01-proxy-route.md` | Proxy route specification (auth, routing, execution, error handling) |
| 02 | `02-client-sdk.md` | Client SDK design (`@doable/sdk`) for both Vite and Next.js |
| 03 | `03-security-model.md` | Token lifecycle, scoping, rate limiting, audit, threat model |
| 04 | `04-nextjs-integration.md` | Next.js-specific patterns (Server Actions, API Routes, RSC) |
| 05 | `05-ai-generation.md` | How AI generates code that uses integrations correctly |
| 06 | `06-implementation-plan.md` | Phased rollout, migration path, effort estimates |

## Key Design Decisions

1. **Reuse existing connector-proxy path** — `/__doable/connector-proxy/` already exists and is injected; extend it rather than creating a new system.

2. **Dual auth modes** — JWT (short-lived, for preview) + Project API Key (long-lived, for deployed apps).

3. **Framework-agnostic SDK** — One `@doable/sdk` package with framework-specific entry points (`/react`, `/server`, `/next`).

4. **Same execution engine** — AI tools and app SDK both call `runAction()`. One runner, one credential system, one audit trail.

5. **Permission = connection existence** — If the integration is connected in the vault for that project's workspace, the app can call it. No additional per-action permission model (too complex, no user value).

6. **Next.js server-side has first-class support** — Server Actions and API Routes can call integrations directly with a server-only API key (never exposed to browser).
