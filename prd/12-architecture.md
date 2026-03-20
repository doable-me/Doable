# 12 — Architecture, Modularity & Performance Benchmarks

## Overview

Doable is designed from the ground up with **modular architecture** and **benchmark performance** as core priorities. Unlike monolithic AI builders, every major system is a discrete, independently deployable module. No single file should ever become bloated — the codebase should exemplify the same clean, modular patterns it generates for users.

---

## 1. Architecture Principles

### 1.1 Core Principles
| Principle | Description |
|-----------|-------------|
| **AI-first codebase** | Code is written by AI — tech choices optimize for AI generation quality, not human DX |
| **Modular by default** | Every feature is a discrete module with clear boundaries |
| **No monoliths** | No single large file; every file has a focused responsibility |
| **Performance-first** | Every operation benchmarked; regressions caught in CI |
| **Raw SQL, no ORM** | AI writes better SQL than ORM APIs — zero abstraction layers |
| **Tier 0 minimal** | Build for 3 users first, scale infrastructure only when needed |
| **Backend: Copilot SDK + PostgreSQL** | AI via Copilot SDK, data via our own Postgres |
| **Clean interfaces** | Modules communicate via well-defined APIs/events |
| **Lazy loading** | Load modules on demand, not upfront |
| **Code splitting** | Automatic per-route and per-feature splitting |

### 1.2 Module Boundaries
Each module should be:
- Independently testable
- Independently deployable (where applicable)
- Max ~300 lines per file (hard guideline)
- Single responsibility
- Well-typed interfaces (TypeScript)

---

## 2. Platform Architecture

### 2.1 High-Level System Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                        DOABLE PLATFORM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  NODE.JS LAYER (TypeScript)                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Next.js 15  │  │  Hono API    │  │  Hono WebSocket      │  │
│  │  (Frontend   │  │  Gateway     │  │  Gateway             │  │
│  │  + SSR)      │  │  :4000       │  │  (Realtime)          │  │
│  │  :3000       │  │              │  │  :4001               │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│  ┌──────┴─────────────────┴──────────────────────┴───────────┐  │
│  │          Node.js Services (Hono + raw SQL)                 │  │
│  │                                                           │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │  │
│  │  │ Project  │ │  Auth    │ │ Deploy   │ │  Preview     │ │  │
│  │  │ Manager  │ │ Service  │ │ Pipeline │ │  Engine      │ │  │
│  │  │(raw SQL) │ │(argon2,  │ │(Vite     │ │  (Vite HMR)  │ │  │
│  │  │          │ │ jose)    │ │ builds)  │ │              │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │  │
│  │  │ Version  │ │ Billing  │ │ Integr.  │ │  Enterprise  │ │  │
│  │  │ Control  │ │ Engine   │ │ Hub      │ │  Admin       │ │  │
│  │  │(simple-  │ │(Stripe)  │ │(MCP      │ │  Service     │ │  │
│  │  │ git)     │ │          │ │ client)  │ │              │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  PYTHON LAYER (FastAPI)      │ REST / gRPC                      │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │          Python Services (FastAPI + uvicorn)               │  │
│  │          :8000                                            │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │  │
│  │  │ AI       │ │ Code     │ │ Semantic │ │  Security    │ │  │
│  │  │ Engine   │ │ Analyzer │ │ Search   │ │  Scanner     │ │  │
│  │  │(Copilot  │ │(tree-    │ │(pgvector │ │  (AST        │ │  │
│  │  │ SDK)     │ │ sitter)  │ │embeddings│ │  patterns)   │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  DATA LAYER (Self-Hosted)    │                                  │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │PostgreSQL│  │  Redis   │  │  MinIO   │  │ Copilot  │  │  │
│  │  │ 16+      │  │  7+      │  │ (S3-     │  │  SDK     │  │  │
│  │  │ +pgvector│  │ +BullMQ  │  │ compat)  │  │ (ext.)   │  │  │
│  │  │ +pg_trgm │  │ +pub/sub │  │          │  │          │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Module Inventory

| Module | Responsibility | Key Dependencies |
|--------|---------------|-----------------|
| **web-app** | React SPA: dashboard, editor, settings | React, Vite, TailwindCSS |
| **api-gateway** | REST API routing, auth middleware, rate limiting | Express/Fastify, JWT |
| **ws-gateway** | WebSocket connections for realtime preview, collaboration | ws/Socket.io |
| **ai-engine** | Copilot SDK integration, prompt processing, code generation | Copilot SDK |
| **project-manager** | CRUD projects, metadata, folders, stars, search | PostgreSQL |
| **auth-service** | Platform auth, OAuth, SSO, 2FA, sessions | PostgreSQL, bcrypt, TOTP |
| **deployment-pipeline** | Build, publish, environment management | Vite, Docker |
| **preview-engine** | Sandboxed Vite dev server per project, hot reload | Vite, iframe sandboxing |
| **version-control** | History, bookmarks, rollback, git integration | PostgreSQL, git |
| **user-management** | Workspaces, teams, roles, permissions | PostgreSQL |
| **billing-engine** | Credits, subscriptions, invoices, Stripe integration | Stripe, PostgreSQL |
| **cloud-infra** | Edge function runtime, database provisioning, storage | Docker, PostgreSQL |
| **analytics-engine** | Real-time analytics collection and querying | PostgreSQL, Redis |
| **file-storage** | S3-compatible object storage management | MinIO/S3 |
| **integration-hub** | Connector management, MCP servers, API proxying | PostgreSQL |
| **security-scanner** | Dependency scanning, secret detection, compliance | npm audit, custom |

---

## 3. Frontend Architecture (Web App)

### 3.1 Module Structure (Next.js App Router)
```
app/                            # Next.js App Router
├── (marketing)/                # SSR/SSG — public pages
│   ├── page.tsx                # Landing page
│   ├── pricing/page.tsx
│   ├── templates/page.tsx
│   └── layout.tsx
│
├── (auth)/                     # Auth pages
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   └── layout.tsx
│
├── (dashboard)/                # RSC — server-rendered dashboard
│   ├── page.tsx                # Project grid
│   ├── settings/page.tsx
│   ├── billing/page.tsx
│   └── layout.tsx
│
├── (editor)/                   # "use client" — full SPA editor
│   ├── [projectId]/
│   │   └── page.tsx            # Editor workspace (client component)
│   └── layout.tsx
│
├── (enterprise)/               # Enterprise admin console
│   ├── admin/page.tsx
│   ├── workspaces/page.tsx
│   └── layout.tsx
│
└── api/                        # Next.js API routes (lightweight, proxies to Hono)
    └── [...proxy]/route.ts     # Catch-all proxy to Hono API :4000

modules/                        # Feature modules (shared between pages)
├── dashboard/
│   ├── components/
│   ├── hooks/
│   └── api/
│
├── editor/                     # "use client" — interactive editor
│   ├── chat/                   # Chat panel, message history, streaming
│   ├── preview/                # Live preview, iframe management
│   ├── code-editor/            # Monaco editor, file tabs
│   ├── visual-editor/          # Visual editing overlay
│   ├── sidebar/                # Left sidebar (pages, files, history)
│   ├── toolbar/                # Top toolbar actions
│   └── context-files/          # .doable/ context file editor panel
│
├── auth/
│   ├── components/
│   ├── hooks/
│   └── api/
│
├── settings/
│   ├── project/
│   ├── workspace/
│   └── account/
│
├── billing/
│   ├── components/
│   └── hooks/
│
├── analytics/
│   ├── components/
│   └── hooks/
│
├── integrations/               # MCP connector management
│   ├── components/
│   └── hooks/
│
├── enterprise/                 # Enterprise admin modules
│   ├── workspace-manager/
│   ├── partner-management/
│   ├── module-lifecycle/
│   └── white-label/
│
└── community/
    ├── components/
    └── hooks/

shared/                         # Shared utilities
├── components/                 # shadcn/ui base components
├── hooks/                      # useAuth, useApi, useWebSocket
├── lib/                        # Utility functions
├── types/                      # Shared TypeScript types
└── api/                        # Hono API client (typed)
```

### 3.2 Module Rules
| Rule | Description |
|------|-------------|
| **Self-contained** | Each module has its own components, hooks, API calls |
| **No cross-import** | Modules only import from `shared/` or their own directory |
| **Lazy loaded** | Each module loaded on demand via `React.lazy()` |
| **Max file size** | ~300 lines per file |
| **Barrel exports** | Each module has `index.ts` for public API |

---

## 4. Backend Architecture

### 4.1 Service Structure
```
services/
├── api-gateway/                    # Node.js + Hono
│   ├── src/
│   │   ├── routes/                 # Hono route handlers grouped by domain
│   │   ├── middleware/             # Auth, rate limiting, CORS, validation
│   │   ├── validators/            # Zod request validation schemas
│   │   └── index.ts               # Hono app entrypoint
│   └── package.json
│
├── ws-gateway/                     # Node.js + Hono WebSocket
│   ├── src/
│   │   ├── handlers/              # WebSocket message handlers
│   │   ├── rooms/                 # Preview rooms, editor rooms
│   │   └── index.ts
│   └── package.json
│
├── project-manager/                # Node.js + raw SQL
│   ├── src/
│   │   ├── queries/               # Raw SQL query functions
│   │   ├── services/              # Business logic
│   │   └── index.ts
│   └── package.json
│
├── auth-service/                   # Node.js + jose + argon2
│   ├── src/
│   │   ├── strategies/            # OAuth, email, SSO, SAML/OIDC (enterprise)
│   │   ├── middleware/
│   │   ├── services/
│   │   └── index.ts
│   └── package.json
│
├── deployment-pipeline/            # Node.js + Vite
│   ├── src/
│   │   ├── builders/              # Vite build orchestration
│   │   ├── adapters/              # Doable Deploy Adapter implementations
│   │   │   ├── doable-cloud.ts    # Default: our Nginx/Caddy web server
│   │   │   ├── cloudflare.ts      # Cloudflare Pages (Wrangler API)
│   │   │   ├── vercel.ts          # Vercel API
│   │   │   ├── netlify.ts         # Netlify API
│   │   │   └── ...                # 10+ more adapters
│   │   ├── environments/          # Test/Live management
│   │   └── index.ts
│   └── package.json
│
├── preview-engine/                 # Node.js + Vite
│   ├── src/
│   │   ├── sandbox/               # Isolated Vite dev server per project
│   │   ├── hot-reload/            # HMR management
│   │   └── index.ts
│   └── package.json
│
├── version-control/                # Node.js + simple-git
│   ├── src/
│   │   ├── git/                   # Git operations (commit, push, diff)
│   │   ├── history/               # Version snapshots, bookmarks
│   │   └── index.ts
│   └── package.json
│
├── billing-engine/                 # Node.js + Stripe SDK
│   ├── src/
│   │   ├── credits/               # Credit tracking, consumption
│   │   ├── subscriptions/         # Plan management
│   │   ├── stripe/                # Stripe webhook handlers, checkout
│   │   ├── enterprise/            # Enterprise billing, per-seat licensing
│   │   └── index.ts
│   └── package.json
│
├── analytics-engine/               # Node.js + BullMQ
│   ├── src/
│   │   ├── collectors/            # Data ingestion (HTTP + WebSocket events)
│   │   ├── aggregators/           # BullMQ workers for aggregation
│   │   ├── queries/               # Raw SQL analytics queries
│   │   └── index.ts
│   └── package.json
│
├── integration-hub/                # Node.js + MCP client
│   ├── src/
│   │   ├── mcp/                   # MCP client management, discovery
│   │   ├── connectors/            # Pre-built connector configs
│   │   ├── enterprise-mcp/        # Enterprise MCP registration
│   │   └── index.ts
│   └── package.json
│
├── enterprise-admin/               # Node.js + raw SQL
│   ├── src/
│   │   ├── workspaces/            # Custom workspace provisioning
│   │   ├── white-label/           # Branding, custom domains, SSO
│   │   ├── partners/              # Partner/developer management
│   │   ├── module-lifecycle/      # Submit, review, approve, deploy
│   │   └── index.ts
│   └── package.json
│
└── file-storage/                   # Node.js + MinIO SDK
    ├── src/
    │   ├── uploads/               # File upload handling
    │   ├── artifacts/             # Build artifacts management
    │   └── index.ts
    └── package.json

python-services/
├── ai-engine/                      # Python + FastAPI
│   ├── agents/                    # Agent mode, plan mode orchestration
│   ├── generators/                # Code generation strategies
│   ├── context/                   # .doable/ context file reading + prompt assembly
│   ├── prompts/                   # System prompt templates
│   ├── tools/                     # Custom tool definitions for Copilot SDK
│   └── main.py                    # FastAPI app entrypoint
│
├── code-analyzer/                  # Python + tree-sitter
│   ├── parsers/                   # Language-specific AST parsers
│   ├── analyzers/                 # Code quality, complexity, patterns
│   ├── refactoring/               # Refactoring suggestions
│   └── main.py
│
├── semantic-search/                # Python + pgvector + sentence-transformers
│   ├── embeddings/                # Embedding generation (self-hosted model)
│   ├── indexer/                   # Index memory/ logs, code files
│   ├── search/                    # Vector similarity search
│   └── main.py
│
├── security-scanner/               # Python + tree-sitter
│   ├── scanners/                  # Dependency, secret, pattern scanners
│   ├── rules/                     # Custom security rule definitions
│   └── main.py
│
├── schema-processor/               # Python + sqlparse
│   ├── parsers/                   # SQL schema parsing
│   ├── generators/                # Migration generation
│   ├── inference/                 # Schema inference from code
│   └── main.py
│
├── requirements.txt               # Shared Python dependencies
├── pyproject.toml                 # Python project config
└── Dockerfile                     # Python services container
```

### 4.2 Inter-Service Communication
| Pattern | Usage | Technology |
|---------|-------|-----------|
| **REST** | Synchronous Node ↔ Python, Node ↔ Node | Hono (Node), FastAPI (Python) |
| **BullMQ Jobs** | Async tasks: builds, deploys, analytics, security scans | BullMQ on Redis |
| **WebSocket** | Realtime preview, collaboration, AI streaming | Hono WebSocket + Redis pub/sub |
| **SSE** | AI token streaming to frontend | Hono SSE response |
| **PostgreSQL LISTEN/NOTIFY** | Lightweight event bus between services | Native PostgreSQL |

---

## 5. Database Schema (PostgreSQL)

### 5.1 Core Tables
```sql
-- Platform tables (our PostgreSQL)
users
workspaces
workspace_members
projects
project_versions
project_files
project_knowledge
project_bookmarks
project_folders
project_stars
connectors
secrets
analytics_events
billing_subscriptions
billing_credits
billing_invoices
billing_credit_transactions
security_findings
```

### 5.2 Database Principles
| Principle | Description |
|-----------|-------------|
| **Normalized** | Proper normalization, no data duplication |
| **Indexed** | Indexes on all query paths |
| **Partitioned** | Large tables partitioned by workspace/date |
| **Pooled** | Connection pooling for all services |
| **Migrated** | All schema changes via migration files |
| **Read replicas** | For analytics and read-heavy queries |

---

## 6. Performance Benchmarks

### 6.1 Frontend Benchmarks
| Metric | Target | Measurement |
|--------|--------|-------------|
| **Initial load (dashboard)** | < 1.5s FCP | Lighthouse |
| **Editor load** | < 2s TTI | Lighthouse |
| **Chat message render** | < 50ms | Performance.now() |
| **File tree render** | < 100ms | Performance.now() |
| **Monaco editor init** | < 500ms | Performance.now() |
| **Visual edit selection** | < 50ms | Performance.now() |
| **Route transition** | < 200ms | Navigation timing |
| **Bundle size (main)** | < 200KB gzipped | Build output |
| **Bundle size (per module)** | < 50KB gzipped | Build output |

### 6.2 Backend Benchmarks
| Metric | Target | Measurement |
|--------|--------|-------------|
| **API response (simple)** | < 50ms p95 | APM |
| **API response (complex)** | < 200ms p95 | APM |
| **Database query (indexed)** | < 10ms p95 | Query logging |
| **Database query (complex)** | < 100ms p95 | Query logging |
| **Edge function cold start** | < 200ms | Function metrics |
| **Edge function warm** | < 50ms | Function metrics |
| **File upload (5MB)** | < 2s | E2E test |
| **WebSocket latency** | < 50ms | Ping/pong |
| **Build (Vite production)** | < 10s | CI timing |

### 6.3 AI Engine Benchmarks
| Metric | Target | Measurement |
|--------|--------|-------------|
| **Time to first token** | < 1s | Stream timing |
| **Simple generation** | < 15s | E2E |
| **Complex generation** | < 120s | E2E |
| **Preview update after edit** | < 500ms | Performance.now() |
| **Save visual edit** | < 1s | Performance.now() |
| **Save code edit** | < 1s (20% faster than baseline) | Performance.now() |

### 6.4 Deployment Benchmarks
| Metric | Target | Measurement |
|--------|--------|-------------|
| **Publish to live** | < 60s | E2E |
| **SSL provisioning** | < 5min | Monitoring |
| **DNS propagation check** | < 30s | Health check |
| **CDN cache invalidation** | < 10s | CDN metrics |

---

## 7. Performance Monitoring

### 7.1 CI/CD Performance Gates
- All benchmarks tested in CI
- Performance regression blocks merge
- Weekly performance reports
- Lighthouse CI for frontend metrics

### 7.2 Production Monitoring
| Tool | Purpose |
|------|---------|
| **APM** | API latency, error rates, throughput |
| **Real User Monitoring** | Client-side performance |
| **Database monitoring** | Query performance, connection pool |
| **Edge function metrics** | Execution time, memory, errors |
| **CDN analytics** | Cache hit rates, latency |
| **Uptime monitoring** | 99.9% SLA tracking |

### 7.3 Alerting
- P95 latency > 2x target: warning
- P99 latency > 3x target: critical
- Error rate > 1%: warning
- Error rate > 5%: critical
- Uptime < 99.9%: critical

---

## 8. Technology Stack (Definitive)

### 8.0 Guiding Principles

**1. Self-Hostable.** Doable must be 100% self-hostable with zero third-party cloud dependencies. Our customers/users connect their own third-party services (Supabase, Firebase, etc.), but Doable itself runs entirely on infrastructure we control.

**2. AI-First Codebase.** This code is written and maintained by AI (Copilot/Claude), not human developers. Every technology choice optimizes for what AI generates best:

| AI-First Rule | Consequence |
|---------------|-------------|
| **AI writes better SQL than ORM code** | No ORM. Raw SQL via `postgres` package (tagged template literals). |
| **AI knows standard libraries deeply** | Prefer built-in Node.js/Python APIs over niche packages. |
| **AI struggles with version-specific ORM APIs** | No Drizzle, no Prisma, no Sequelize. Just SQL. |
| **AI generates perfect `.sql` migration files** | Migrations are plain SQL, not ORM-specific formats. |
| **Fewer abstractions = fewer AI hallucinations** | Minimal wrapper layers. Direct function calls, not framework magic. |
| **AI reads flat code better than deeply nested** | Prefer explicit code over clever abstractions. No "smart" base classes. |
| **AI can debug raw SQL instantly** | No ORM-generated query to decode. What you write is what runs. |

**3. Tier 0 First.** Build for 3 users, not 3000. See Section 8.10 for progressive scaling.

### 8.1 Three Runtimes, Three Purposes

```
┌─────────────────────────────────────────────────────────────────┐
│ RUNTIME 1: Node.js (TypeScript)                                 │
│ Purpose: Frontend, API layer, real-time, build pipeline         │
│                                                                 │
│  • Next.js 15+ (App Router) — frontend, SSR, dashboard, editor │
│  • Hono — API gateway (ultra-fast, portable to CF Workers/Bun)  │
│  • Vite — build pipeline for user projects                      │
│  • WebSocket — real-time preview, collaboration                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ RUNTIME 2: Python 3.12+                                         │
│ Purpose: AI processing, code analysis, semantic search          │
│                                                                 │
│  • FastAPI — AI processing API, async, high-performance         │
│  • Copilot SDK bridge — orchestrates AI model calls             │
│  • Code analysis — AST parsing, security scanning, schema gen   │
│  • Semantic search — pgvector embeddings for memory/ logs       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ RUNTIME 3: PostgreSQL 16+                                       │
│ Purpose: Single source of truth for all platform data           │
│                                                                 │
│  • pgvector — semantic search (AI memory, code search)          │
│  • pg_trgm — fuzzy text search (file search, project search)    │
│  • LISTEN/NOTIFY — lightweight event bus between services       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Frontend Stack

| Technology | Version | Why This |
|-----------|---------|----------|
| **Next.js** | 15+ (App Router) | SSR for landing/marketing pages, RSC for dashboard performance, Server Actions reduce API boilerplate, static export for CF Pages deployment. The editor uses `"use client"` for full interactivity. |
| **TypeScript** | 5.5+ (strict) | Type safety across the entire codebase. `strict: true`, no `any`. |
| **Tailwind CSS** | 4+ | Utility-first, tree-shakeable, zero runtime, fastest styling approach. |
| **shadcn/ui** | latest | Radix primitives + Tailwind. Copy-paste components — no dependency lock-in. We own every component. |
| **Monaco Editor** | latest | VS Code's editor engine. Syntax highlighting, IntelliSense, multi-file support. |
| **Zustand** | latest | Client state management. Minimal, fast, no boilerplate. For editor state, UI state, selection state. |
| **TanStack Query** | 5+ | Server state caching, deduplication, background refetching. For API data (projects, versions, analytics). |
| **Lucide React** | latest | Tree-shakeable icon library. Only ships icons actually used. |
| **next-themes** | latest | Dark/light mode with system preference detection. |

**Why Next.js over Vite SPA?**
- Landing pages need SSR/SSG for SEO and fast FCP
- React Server Components reduce client bundle (dashboard pages load fast)
- Server Actions handle simple mutations without a dedicated API endpoint
- Static export (`next export`) produces CF Pages-compatible static files
- The editor workspace is `"use client"` — it's still a rich SPA where it needs to be
- One framework instead of separate Vite SPA + marketing site

### 8.3 Backend API Stack

| Technology | Version | Why This |
|-----------|---------|----------|
| **Hono** | 4+ | Ultra-fast web framework built on Web Standards (Request/Response). **Portable**: same code runs on Node.js, Bun, Cloudflare Workers, Deno. 3-10x faster than Express. TypeScript-first. |
| **postgres (porsager/postgres)** | latest | Fastest PostgreSQL client for Node.js. Tagged template literals = raw SQL with automatic parameterization. Zero ORM overhead. AI writes perfect SQL every time. |
| **Zod** | 3+ | Schema validation for all API inputs. Shared between frontend (forms) and backend (API validation). Generates TypeScript types from schemas. |
| **BullMQ** | latest | Redis-based job queue. **Tier 1+ only** — not used at launch. Synchronous `await` handles builds at Tier 0. |
| **simple-git** | latest | Git operations (commit, push, pull, diff) without system Git dependency. For GitHub sync and version history. |
| **jose** | latest | JWT creation/verification. No native dependencies, works everywhere. |
| **argon2** | latest | Password hashing. Faster and more secure than bcrypt. |
| **nanoid** | latest | Compact, URL-safe unique IDs. Faster than UUID. |

**Why Hono over Fastify/Express?**
- **Portability**: Hono runs anywhere — if we ever want part of the API on CF Workers, the code moves unchanged
- **Performance**: Built on Web Standard APIs, near-zero overhead
- **TypeScript-first**: Full type inference for routes, middleware, validators
- **Middleware ecosystem**: CORS, compress, logger, rate-limiter — all built-in
- **Size**: ~14KB. No bloat.

### 8.4 Python Services Stack

| Technology | Version | Why This |
|-----------|---------|----------|
| **FastAPI** | 0.110+ | Async API framework. Auto-generates OpenAPI docs. Native async/await for I/O-bound AI workloads. |
| **uvicorn** | latest | ASGI server. High-performance, production-ready. |
| **Pydantic** | 2+ | Data validation. Shared schemas with the Copilot SDK bridge. |
| **tree-sitter** | latest | Multi-language AST parsing. For code analysis, security scanning, refactoring. |
| **pgvector (psycopg)** | latest | Vector similarity search for semantic memory search across `memory/` daily logs. |
| **sentence-transformers** | latest | Generate embeddings for code and text. Self-hosted, no API calls. |
| **ruff** | latest | Extremely fast Python linter/formatter (for our own Python code quality). |

**What Python handles (and Node.js doesn't):**
| Task | Why Python |
|------|-----------|
| Semantic search / embeddings | sentence-transformers, pgvector — mature Python ecosystem |
| AST parsing (multi-language) | tree-sitter Python bindings are the most mature |
| Code security scanning | Pattern analysis, taint tracking — better libs in Python |
| Schema inference / migration generation | Complex SQL parsing — Python has superior tooling |
| AI orchestration bridge | Copilot SDK calls routed through a Python coordinator when complex analysis is needed before/after model calls |

**What Node.js handles (and Python doesn't):**
| Task | Why Node.js |
|------|-----------|
| HTTP API serving | Hono is faster than FastAPI for simple request/response |
| WebSocket / real-time | Native event-loop model — built for I/O concurrency |
| Build pipeline (Vite) | Vite is Node.js native. User project builds must run in Node. |
| Git operations | simple-git is Node.js native |
| Frontend SSR | Next.js runs on Node.js |

### 8.5 AI Stack

| Technology | Purpose | Notes |
|-----------|---------|-------|
| **Copilot SDK** | Model inference, tool calling, MCP client, streaming, session management | The AI backbone. We don't train or serve models. |
| **MCP (Model Context Protocol)** | Connect to external data/tools (enterprise APIs, databases, services) | Native in Copilot SDK. We build MCP servers for enterprise integrations. |
| **pgvector** | Vector storage for semantic search (memory files, code search) | Self-hosted within PostgreSQL — no Pinecone/Weaviate dependency. |
| **sentence-transformers** | Generate embeddings locally | Self-hosted model, no OpenAI embedding API dependency. |

### 8.6 Data Layer

| Technology | Version | Purpose | Notes |
|-----------|---------|---------|-------|
| **PostgreSQL** | 16+ | All platform data | Self-hosted. With pgvector, pg_trgm extensions. |
| **Redis** | 7+ | Cache, sessions, job queue, pub/sub | **Tier 1+ only.** Not used at launch. JWT sessions + in-memory Map + PG LISTEN/NOTIFY at Tier 0. |
| **MinIO** | latest | S3-compatible object storage | **Tier 2+ only.** Not used at launch. Local filesystem at Tier 0. |
| **Git (GitHub)** | — | Source control for user projects | GitHub API for repos. User's own GitHub or Doable org. GitHub is the ONE external dependency (user-facing, not platform-infra). |

**Why MinIO (later)?** When we reach 500+ users, local filesystem won't cut it. MinIO is a drop-in S3-compatible replacement that runs anywhere. But at Tier 0, files go to `/data/uploads/` on the local filesystem.

### 8.7 Real-Time Stack

| Technology | Purpose | Notes |
|-----------|---------|-------|
| **Hono WebSocket** | WebSocket connections in the API layer | Native Hono support, no separate library. |
| **Redis Pub/Sub** | Multi-node WebSocket coordination | **Tier 1+ only.** At Tier 0, single process — no multi-node coordination needed. When multiple instances: Redis syncs messages across nodes. |
| **Server-Sent Events (SSE)** | AI streaming responses | Lighter than WebSocket for one-way streaming (AI token stream). |

### 8.8 Build & Dev Tools

| Technology | Purpose | Notes |
|-----------|---------|-------|
| **Turborepo** | Monorepo task orchestration | Parallel builds, caching, dependency-aware task execution. |
| **pnpm** | Package management | Fastest, most disk-efficient. Strict dependency resolution prevents phantom deps. |
| **Vite** | User project builds | Not for Doable itself (that's Next.js). For building user-created React apps. |
| **Vitest** | Testing (Node.js services + frontend) | Fast, Vite-native, compatible with Jest API. |
| **pytest** | Testing (Python services) | Standard Python testing. |
| **Docker** | Containerization | Every service has a Dockerfile. |
| **Docker Compose** | Local dev + single-machine deployment | One command to run the entire platform. |
| **GitHub Actions** | CI/CD | Build, test, lint, deploy. |

### 8.9 Self-Hosted Monitoring (Tier 3+ — Not Needed Now)

> **At Tier 0**: Use `pino` JSON logs + `pg_stat_statements`. That's sufficient for 1-100 users. Add monitoring when you can't manually check logs anymore.

| Technology | Purpose | Notes |
|-----------|---------|-------|
| **Prometheus** | Metrics collection | Self-hosted. Scrapes Node.js + Python + PostgreSQL metrics. |
| **Grafana** | Dashboards & alerting | Self-hosted. Visualizes Prometheus + Loki data. |
| **Loki** | Log aggregation | Self-hosted. Lightweight alternative to Elasticsearch. |
| **OpenTelemetry** | Distributed tracing | Self-hosted collector. Traces requests across Node.js ↔ Python ↔ PostgreSQL. |
| **pg_stat_statements** | PostgreSQL query performance | Built into PostgreSQL. No external dependency. |

All monitoring is self-hosted. No Datadog, no New Relic, no Sentry Cloud. Full control over observability data.

### 8.10 Progressive Infrastructure — Start Minimal, Scale When Needed

The full stack described above is the **target architecture**. You do NOT deploy all of it on day one. Infrastructure grows with user count.

#### Tier 0 — Launch (1-10 users)

**2 processes + 1 database. That's it.**

```
┌─────────────────────────────────────────────────────────────┐
│          SINGLE VPS ($20-40/mo — 2 CPU, 4GB RAM)           │
│                                                              │
│  ┌────────────────────────────┐  ┌────────────────────────┐ │
│  │ Node.js process            │  │ Python process         │ │
│  │                            │  │                        │ │
│  │ • Next.js (frontend+SSR)   │  │ • FastAPI (AI engine)  │ │
│  │ • Hono API (embedded)      │  │ • Copilot SDK bridge   │ │
│  │ • WebSocket (embedded)     │  │ • Basic code analysis  │ │
│  │ • Vite builds (in-process) │  │                        │ │
│  │                            │  │ :8000                  │ │
│  │ :3000 (web) / :4000 (api)  │  │                        │ │
│  └────────────┬───────────────┘  └───────────┬────────────┘ │
│               │                               │              │
│               └───────────┬───────────────────┘              │
│                           │                                  │
│               ┌───────────▼────────────┐                     │
│               │ PostgreSQL 16          │                     │
│               │ +pgvector +pg_trgm     │                     │
│               │ :5432                  │                     │
│               └────────────────────────┘                     │
│                                                              │
│  Caddy (reverse proxy + auto TLS) :80/:443                  │
└─────────────────────────────────────────────────────────────┘
```

**What's replaced / eliminated:**

| Full Stack Component | Tier 0 Replacement | Why It's Fine |
|---------------------|-------------------|---------------|
| **Redis** | In-memory Map (rate limiting), JWT (sessions), PostgreSQL `LISTEN/NOTIFY` (pub/sub) | 3 users aren't going to DDoS you. JWT is stateless. PG LISTEN/NOTIFY is free. |
| **MinIO** | Local filesystem (`/data/uploads/`) | 3 users won't produce terabytes of files. Filesystem is simplest. |
| **BullMQ** | Synchronous in-process execution | 3 users won't have competing build jobs. Just await the build. |
| **Separate WS gateway** | WebSocket handler embedded in Hono | One server, one port. No coordination needed. |
| **sentence-transformers** | PostgreSQL `pg_trgm` fuzzy search | Good enough for memory search. Exact semantic search can wait. |
| **Prometheus / Grafana / Loki** | `pino` JSON logs + `pg_stat_statements` | Check logs manually. You have 3 users. |
| **Nginx** | **Caddy** | Auto-TLS (Let's Encrypt), zero config. No nginx.conf to manage. |
| **Docker / Kubernetes** | Direct process management (systemd or PM2) | Simpler. Or use Docker Compose if you prefer — but not required. |

**Setup:**
```bash
# On a fresh VPS (Ubuntu 22+)
# 1. Install PostgreSQL 16 + extensions
sudo apt install postgresql-16 postgresql-16-pgvector

# 2. Install Node.js 22 + pnpm
curl -fsSL https://fnm.vercel.app/install | bash && fnm install 22
corepack enable && corepack prepare pnpm@latest --activate

# 3. Install Python 3.12 + uv
sudo apt install python3.12 python3.12-venv
pip install uv

# 4. Install Caddy (reverse proxy)
sudo apt install caddy

# 5. Clone, install, migrate, start
git clone ... && cd doable
pnpm install
cd python && uv pip install -r requirements.txt && cd ..
pnpm db:migrate
pnpm start:tier0   # Starts Node + Python, no Redis/MinIO needed
```

**VPS requirements**: 2 CPU, 4GB RAM, 40GB SSD. ~$20-40/month (Hetzner, DigitalOcean, etc.).

#### Tier 1 — Growth (10-100 users)

**Add Redis. That's the only infrastructure change.**

```
   Same VPS (upgrade to 4 CPU, 8GB RAM, ~$40-60/mo)
   │
   ├── Node.js (Next.js + Hono + WS)
   ├── Python (FastAPI)
   ├── PostgreSQL                        ← still here
   ├── Redis ← NEW (sessions, caching, pub/sub)
   └── Caddy
```

| What Changes | Why Now |
|-------------|---------|
| **Add Redis** | With 50+ concurrent users, in-memory Maps don't survive server restarts. Redis gives persistent sessions, shared cache, and pub/sub if you later add a second Node process. |
| **Move sessions to Redis** | JWT is fine but Redis sessions give you instant revocation (important when you have paying customers). |
| **Add BullMQ** | With 50+ users, build jobs start competing. Queue them. BullMQ uses the same Redis — no new infra. |
| **Keep local filesystem** | Still fine. You don't have enough files to justify MinIO. |

**Migration effort**: ~2 hours. Install Redis, update session config, add BullMQ workers.

#### Tier 2 — Scale (100-1,000 users)

**Add MinIO + separate the WebSocket gateway + add monitoring.**

```
   VPS or small cluster (8 CPU, 16GB RAM, ~$80-150/mo)
   │
   ├── Node.js (Next.js + Hono API)
   ├── Node.js (WS gateway)              ← split out
   ├── Python (FastAPI)
   ├── PostgreSQL (with read replica)     ← add replica
   ├── Redis (BullMQ + sessions + pub/sub)
   ├── MinIO                              ← NEW
   ├── Prometheus + Grafana               ← NEW
   └── Caddy / Nginx
```

| What Changes | Why Now |
|-------------|---------|
| **Add MinIO** | 500+ projects with file uploads, build artifacts, template bundles = too much for local filesystem. S3-compatible API means zero code change. |
| **Split WS gateway** | With 200+ concurrent WebSocket connections, give it its own process + Redis pub/sub for multi-node. |
| **PostgreSQL read replica** | Analytics queries shouldn't slow down the editor. Read replica handles dashboards/reports. |
| **Add monitoring** | At 500+ users, you can't rely on logs. Prometheus metrics + Grafana dashboards show you what's slow. |
| **Add sentence-transformers** | Now semantic search over 1000+ memory files actually matters. Download the model, index existing content. |

#### Tier 3 — Enterprise (1,000+ users / enterprise white-label)

**Full architecture as designed in sections 8.1-8.9.**

```
   Kubernetes cluster or multi-VPS
   │
   ├── Next.js (2+ replicas behind load balancer)
   ├── Hono API (2+ replicas)
   ├── WS gateway (2+ replicas + sticky sessions)
   ├── Python services (2+ replicas)
   ├── PostgreSQL (primary + 2 read replicas + connection pooling via PgBouncer)
   ├── Redis cluster (HA)
   ├── MinIO cluster (HA)
   ├── BullMQ workers (scaled by job type)
   ├── Prometheus + Grafana + Loki + OpenTelemetry
   └── Nginx / Caddy (or cloud load balancer)
```

#### Progressive Scaling Summary

| Trigger | Action | Effort |
|---------|--------|--------|
| **Launch** | Just PostgreSQL + Node + Python + Caddy | Already done |
| **First 50 users** | Add Redis | 2 hours |
| **100 users** | Add BullMQ (uses existing Redis) | 1 hour |
| **200 users** | Split WS gateway | 4 hours |
| **500 users** | Add MinIO, migrate files from filesystem | 1 day |
| **500 users** | Add Prometheus + Grafana | Half day |
| **1,000 users** | Add PostgreSQL read replica | Half day |
| **1,000 users** | Add sentence-transformers / semantic search | 1 day |
| **Enterprise** | Kubernetes, multi-replica, PgBouncer, full monitoring | 1-2 weeks |

The code is written to support all tiers from day one. Each tier is a configuration change + adding a Docker container — NOT a rewrite.

**How the code handles this**: Every service checks for Redis availability at startup. If Redis is not configured, it falls back to in-memory (Tier 0). If MinIO is not configured, it uses local filesystem. The `INFRA_TIER` env var controls which features activate. No `if/else` sprawl — just dependency injection at the adapter level.

```typescript
// Example: Session storage adapter
const sessionStore =
  process.env.REDIS_URL
    ? new RedisSessionStore(process.env.REDIS_URL)   // Tier 1+
    : new MemorySessionStore();                       // Tier 0

// Example: File storage adapter
const fileStore =
  process.env.MINIO_ENDPOINT
    ? new MinIOFileStore(process.env.MINIO_ENDPOINT)  // Tier 2+
    : new LocalFileStore('/data/uploads');             // Tier 0-1

// Example: Job processing
const jobProcessor =
  process.env.REDIS_URL
    ? new BullMQProcessor(process.env.REDIS_URL)      // Tier 1+
    : new SyncProcessor();                             // Tier 0 (just await)
```

### 8.11 Deployment Modes

Doable supports two deployment modes for the platform itself:

#### Mode A: Fully Self-Hosted (Primary)

Everything runs on your own infrastructure. Single machine or cluster.

```
┌─────────────────────────────────────────────────────────────┐
│                YOUR INFRASTRUCTURE                           │
│                (VPS, bare metal, or private cloud)           │
│                                                              │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │ Next.js       │  │ Hono API      │  │ Python         │  │
│  │ (Frontend+SSR)│  │ (Gateway)     │  │ (AI Services)  │  │
│  │ :3000         │  │ :4000         │  │ :8000          │  │
│  └───────────────┘  └───────────────┘  └────────────────┘  │
│                                                              │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │ PostgreSQL    │  │ Redis         │  │ MinIO          │  │
│  │ :5432         │  │ :6379         │  │ :9000          │  │
│  └───────────────┘  └───────────────┘  └────────────────┘  │
│                                                              │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │ Nginx/Caddy   │  │ Prometheus    │  │ Grafana        │  │
│  │ (reverse      │  │ (metrics)     │  │ (dashboards)   │  │
│  │  proxy + TLS) │  │               │  │                │  │
│  └───────────────┘  └───────────────┘  └────────────────┘  │
│                                                              │
│  Deployment: Docker Compose (single machine)                 │
│              Kubernetes (cluster / enterprise scale)          │
└─────────────────────────────────────────────────────────────┘
```

**Full stack requirements**: 4+ CPU cores, 16GB+ RAM, 100GB+ SSD.
**Start command**: `docker compose up -d`

#### Mode B: Hybrid with Cloudflare Pages (Optional)

Frontend on CF Pages for global edge performance. Backend still self-hosted.

```
┌──────────────────────────────────┐
│  CLOUDFLARE PAGES                │
│  (Edge — global CDN)             │
│                                  │
│  Next.js static export           │
│  + CF Workers (edge API routes)  │
│  doable.app                      │
└───────────────┬──────────────────┘
                │ API calls
                ▼
┌──────────────────────────────────┐
│  YOUR INFRASTRUCTURE             │
│                                  │
│  Hono API + Python Services      │
│  PostgreSQL + Redis + MinIO      │
│  api.doable.app                  │
└──────────────────────────────────┘
```

**How it works**:
- `next build && next export` → static HTML/JS/CSS → deploy to CF Pages
- Editor's interactive parts work as client-side React (`"use client"`)
- API calls go to `api.doable.app` (your self-hosted backend)
- Hono's portability means some lightweight API routes could also run as CF Workers if needed
- Backend (PostgreSQL, Redis, Python, MinIO) is always self-hosted — CF can't run these

**When to use Mode B**: When you want global edge performance for the frontend but don't want to manage a web server for static assets.

### 8.11 What We Do NOT Use (and Why)

| Technology | Why NOT |
|-----------|---------|
| **AWS / GCP / Azure services** | Third-party cloud lock-in. We self-host everything. |
| **Vercel** | Next.js deployment lock-in. We self-host Next.js or use CF Pages. |
| **Supabase (for Doable itself)** | We use plain PostgreSQL. Supabase is for our CUSTOMERS' apps. |
| **Firebase** | Proprietary cloud. Not self-hostable. |
| **Prisma** | ORM. AI writes better raw SQL than any ORM API. Zero abstraction is the AI-friendly choice. |
| **Drizzle** | ORM. Same reason as Prisma — AI writes SQL, not ORM APIs. Less training data = worse AI output. |
| **Sequelize** | ORM. Same. |
| **Express** | Legacy. Hono is faster, more portable, TypeScript-first. |
| **tRPC** | Adds coupling between frontend/backend. Hono + Zod gives type safety without tRPC's tight coupling. Fine for small apps, overkill for a platform. |
| **Elasticsearch** | Heavy. PostgreSQL full-text search + pg_trgm + pgvector covers our search needs. |
| **MongoDB** | We use PostgreSQL for everything. No need for a document store. |
| **RabbitMQ** | Heavy. When we need a job queue (Tier 1+), BullMQ on Redis is simpler. |
| **Datadog / New Relic / Sentry Cloud** | SaaS monitoring. We self-host Prometheus + Grafana + Loki + OpenTelemetry. |
| **Pinecone / Weaviate** | Vector DB as a service. We use pgvector inside PostgreSQL. |
| **Bun (for now)** | Faster than Node.js, but ecosystem compatibility gaps. Node.js 22+ is stable. Hono works on both — we can switch to Bun later for perf gains without code changes. |

### 8.12 Generated Project Stack (What Users' Apps Use)

This is what Doable generates for users. NOT what Doable itself runs on.

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18+, TypeScript, Vite |
| **Styling** | Tailwind CSS |
| **Components** | shadcn/ui (Radix) |
| **Icons** | Lucide React |
| **Routing** | React Router v6 |
| **Testing** | Vitest |
| **Backend** | User's choice (Supabase, Firebase, D1, Neon, custom, etc.) |
| **Auth** | User's choice (Supabase Auth, Clerk, Auth0, Firebase Auth, etc.) |
| **Deployment** | `*.doable.app` (default) or any provider via Doable Deploy Adapter |

---

## 9. Scalability Design

### 9.1 Horizontal Scaling Strategy
| Component | Scaling Method |
|-----------|---------------|
| **Web App** | CDN + static hosting |
| **API Gateway** | Multiple instances behind load balancer |
| **AI Engine** | Queue-based with worker pool scaling |
| **Preview Engine** | Per-project sandboxed containers |
| **Database** | Connection pooling + read replicas |
| **Edge Functions** | Auto-scaling serverless containers |
| **WebSocket** | Sticky sessions + Redis pub/sub for multi-node |

### 9.2 Resource Isolation

> **Full specification**: See [PRD 17 — Multi-User Infrastructure](17-multi-user-infrastructure.md) for complete isolation, concurrency, and resource management requirements.

| Level | Isolation | Enforcement |
|-------|-----------|-------------|
| **Workspace** | Data isolation — no cross-workspace access | Workspace auth middleware + DB query filtering + RLS (Phase 2) |
| **User** | AI sessions, rate limits, undo stacks | Sessions keyed by `projectId + userId + mode` |
| **Project** | Preview sandbox, file system, deploy pipeline | Per-project dev server, deploy mutex, file locking |
| **Edge Function** | Container isolation | Sandboxed execution |
| **Database (user project)** | Schema or database-level isolation | RLS policies |

### 9.3 Concurrency Controls

| Resource | Control | Description |
|----------|---------|-------------|
| **AI Sessions** | Per-user isolation | Each user gets independent AI state per project per mode |
| **Dev Servers** | Shared per-project, LRU eviction | One Vite process per project, idle timeout, max cap |
| **Builds/Deploys** | Per-project mutex | One build at a time per project, global concurrency limit |
| **File Writes** | Atomic writes (Phase 0), optimistic concurrency (Phase 2), CRDT (Phase 2+) | Progressive strategy matching team size |
| **WebSocket Connections** | Per-user and per-project caps | Prevent connection exhaustion |
| **Rate Limits** | Per-user sliding window | Plan-based limits, keyed by userId |
| **Credits** | Transactional deduction with row lock | `FOR UPDATE` prevents race conditions |

### 9.4 Real-Time Collaboration Architecture

> See [PRD 17 Section 6](17-multi-user-infrastructure.md#6-real-time-collaborative-editing) for full specification.

| Component | Technology | Phase |
|-----------|-----------|-------|
| **CRDT Engine** | Yjs | Phase 2 |
| **Editor Binding** | y-monaco | Phase 2 |
| **Transport** | y-websocket | Phase 2 |
| **Presence** | Yjs Awareness protocol | Phase 2 |
| **Persistence** | y-leveldb or custom flush-to-filesystem | Phase 2 |

**Key design decision**: Real-time collaborative editing (multi-cursor, presence, CRDT) is a **Phase 2 priority** — not Phase 4. Businesses paying for team plans expect this as a core feature.

---

## 10. Development Practices

### 10.0 Local Development Setup

#### Prerequisites (One-Time Install)

| Tool | Install | Why |
|------|---------|-----|
| **Docker Desktop** | `winget install Docker.DockerDesktop` / `brew install --cask docker` | Runs PostgreSQL, Redis, MinIO in containers. No installing databases manually. |
| **Node.js 22+** | `fnm install 22` or `nvm install 22` | Runs Next.js, Hono, all TypeScript services |
| **pnpm 9+** | `corepack enable && corepack prepare pnpm@latest --activate` | Package manager (ships with Node.js via corepack) |
| **Python 3.12+** | `pyenv install 3.12` or system Python | Runs FastAPI AI services |
| **uv** | `pip install uv` | Fast Python package installer (10-100x faster than pip) |

That's it. **5 tools, all standard, all cross-platform.**

#### Step-by-Step: Zero to Running

```bash
# 1. Clone
git clone https://github.com/doable/doable.git && cd doable

# 2. Copy environment variables
cp .env.example .env

# 3. Start infrastructure (just PostgreSQL — that's all you need for Tier 0!)
cd infra && docker compose up -d && cd ..

# 4. Install Node.js dependencies (all services + frontend)
pnpm install

# 5. Run database migrations
pnpm db:migrate

# 6. Install Python dependencies
cd python && uv pip install -r requirements.txt && cd ..

# 7. Start everything
pnpm dev
```

**`pnpm dev`** runs ALL services in parallel via Turborepo:

```
┌─────────────────────────────────────────────────────────────┐
│  pnpm dev  (Turborepo runs all in parallel)                 │
│                                                             │
│  ✓ Next.js 15        → http://localhost:3000  (frontend)    │
│  ✓ Hono API          → http://localhost:4000  (REST API)    │
│  ✓ Hono WebSocket    → ws://localhost:4001    (realtime)    │
│  ✓ FastAPI           → http://localhost:8000  (AI services) │
│                                                             │
│  Docker containers (already running):                       │
│  ✓ PostgreSQL 16     → localhost:5432                       │
│                                                             │
│  Not running (not needed at Tier 0 — add later):            │
│  ○ Redis 7           → docker compose --profile tier1 up -d │
│  ○ MinIO             → docker compose --profile tier2 up -d │
│  ○ Prometheus/Grafana → docker compose --profile full up -d │
└─────────────────────────────────────────────────────────────┘
```

**Total setup time: ~3 minutes** (mostly waiting for `docker pull` and `pnpm install`).

#### What About Each Component?

| Component | Local Dev Experience | Friction? |
|-----------|---------------------|-----------|
| **Next.js** | `next dev` — instant hot reload, RSC + client components | None. Standard. |
| **Hono API** | `tsx watch src/index.ts` — instant restart on change | None. Just Node.js. |
| **Hono WebSocket** | Embedded in Hono at Tier 0 — no separate process | None. |
| **FastAPI** | `uvicorn main:app --reload` — instant reload | None. Standard Python. |
| **PostgreSQL 16** | Docker container with pgvector + pg_trgm pre-installed | None. One `docker compose up`. Image: `pgvector/pgvector:pg16`. |
| **Redis** | **Not needed at Tier 0.** Code falls back to in-memory. `docker compose --profile tier1 up -d` when ready. | None — optional. |
| **MinIO** | **Not needed at Tier 0.** Files stored on local filesystem. `docker compose --profile tier2 up -d` when ready. | None — optional. |
| **Drizzle ORM** | `pnpm db:migrate` + `pnpm db:studio` (visual DB browser) | None. Drizzle Studio is built-in. |
| **BullMQ** | **Not needed at Tier 0.** Builds run synchronously (just `await`). Enabled when Redis is added. | None — optional. |
| **sentence-transformers** | **Not needed at Tier 0.** Uses `pg_trgm` fuzzy search instead. | None — optional. |
| **tree-sitter** | `pip install tree-sitter` — pure Python, no native build tools needed | None. |
| **Monaco Editor** | NPM package, loaded in browser | None. |
| **Prometheus/Grafana/Loki** | **NOT required.** `docker compose --profile full up` when ready. | None — skipped by default. |
| **Nginx/Caddy** | **NOT required for dev.** Next.js dev server handles routing. | None — skipped in dev by default. |

#### The `docker-compose.dev.yml` (Progressive — Matches Infrastructure Tiers)

```yaml
# infra/docker-compose.dev.yml
# Default: only PostgreSQL (Tier 0). Use --profile to add services.

services:
  # ─── ALWAYS ON (Tier 0) ────────────────────────────────────
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: doable_dev
      POSTGRES_USER: doable
      POSTGRES_PASSWORD: doable_dev
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init-extensions.sql:/docker-entrypoint-initdb.d/init.sql

  # ─── TIER 1 (add with: --profile tier1) ────────────────────
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    profiles: ["tier1", "tier2", "full"]

  # ─── TIER 2 (add with: --profile tier2) ────────────────────
  minio:
    image: minio/minio:latest
    ports: ["9000:9000", "9001:9001"]
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: doable
      MINIO_ROOT_PASSWORD: doable_dev
    volumes:
      - miniodata:/data
    profiles: ["tier2", "full"]

  # ─── TIER 3 (add with: --profile full) ─────────────────────
  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]
    profiles: ["full"]

  grafana:
    image: grafana/grafana:latest
    ports: ["3001:3000"]
    profiles: ["full"]

volumes:
  pgdata:
  miniodata:
```

```sql
-- init-extensions.sql (runs once on first postgres start)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Usage by tier:**
```bash
# Tier 0 (3 users — just PostgreSQL)
docker compose up -d

# Tier 1 (50 users — add Redis)
docker compose --profile tier1 up -d

# Tier 2 (500 users — add MinIO)
docker compose --profile tier2 up -d

# Full stack (1000+ users — everything)
docker compose --profile full up -d
```

**Key design decision**: App services (Next.js, Hono, FastAPI) run **natively on the host** during development — NOT in Docker. This gives you instant hot-reload, debugger support, and zero container overhead. Only the infrastructure services run in Docker because they're stateful and tedious to install natively. And at Tier 0, that means **only PostgreSQL** runs in Docker.

#### Partial Development (Work on Just One Piece)

You don't always need the entire stack running:

| What You're Working On | What To Run |
|------------------------|-------------|
| **Frontend only** (UI, components, styling) | `docker compose up -d` + `pnpm dev --filter=web` |
| **API only** (routes, middleware, business logic) | `docker compose up -d` + `pnpm dev --filter=api-gateway` |
| **AI engine only** (prompts, context, code gen) | `docker compose up -d` + `cd python && uvicorn ai_engine.main:app --reload` |
| **Database work** (schema, migrations) | `docker compose up -d` + `pnpm db:studio` |
| **Full stack** (everything) | `docker compose up -d` + `pnpm dev` |

#### Windows-Specific Notes

| Concern | Solution |
|---------|----------|
| Docker Desktop on Windows | WSL2 backend (default since 2024). Works perfectly. |
| Python on Windows | `pyenv-win` or official installer. `uv` works on Windows. |
| File watching (hot-reload) | WSL2 file system is faster than Windows mounts. Recommend cloning the repo inside WSL2 (`/home/user/doable`) for best performance. Or use Windows with `--poll` flag if needed. |
| Path separators | All code uses Node.js `path` module / Python `pathlib` — handles both `\` and `/`. |

### 10.1 Code Standards
| Standard | Description |
|----------|-------------|
| **Max file size** | ~300 lines |
| **Max function** | ~50 lines |
| **TypeScript strict** | `strict: true` everywhere |
| **No `any`** | Explicit types required |
| **Lint** | ESLint + Prettier |
| **Test coverage** | > 80% for critical paths |
| **PR reviews** | Required for all changes |
| **Performance tests** | Required for hotpath changes |

### 10.2 Monorepo Structure
```
doable/
├── apps/
│   ├── web/                 # Next.js 15 (App Router) — main frontend
│   ├── landing/             # (merged into web via route groups)
│   └── docs/                # Documentation site (Next.js or Starlight)
│
├── services/                # Node.js (TypeScript + Hono + Drizzle)
│   ├── api-gateway/         # Hono REST API
│   ├── ws-gateway/          # Hono WebSocket
│   ├── project-manager/
│   ├── auth-service/
│   ├── deployment-pipeline/
│   ├── preview-engine/
│   ├── version-control/
│   ├── billing-engine/
│   ├── analytics-engine/
│   ├── integration-hub/
│   ├── enterprise-admin/
│   └── file-storage/
│
├── python/                  # Python (FastAPI + uvicorn)
│   ├── ai-engine/
│   ├── code-analyzer/
│   ├── semantic-search/
│   ├── security-scanner/
│   ├── schema-processor/
│   ├── requirements.txt
│   ├── pyproject.toml
│   └── Dockerfile
│
├── packages/                # Shared TypeScript packages
│   ├── ui/                  # shadcn/ui components (shared between apps)
│   ├── types/               # Shared TypeScript types (API contracts, domain models)
│   ├── db/                  # Drizzle schema + migrations (shared between services)
│   ├── utils/               # Shared utilities (validation, formatting, etc.)
│   ├── sdk/                 # Doable SDK (for generated user apps)
│   ├── deploy-adapter/      # Doable Deploy Adapter library (12+ hosting providers)
│   └── config/              # Shared config (ESLint, TypeScript, Tailwind, etc.)
│
├── templates/               # Workspace templates
│   ├── react-starter/
│   ├── saas-starter/
│   ├── ecommerce/
│   ├── content-site/
│   ├── mobile-app/
│   ├── internal-tool/
│   ├── landing-page/
│   ├── ai-app/
│   └── api-service/
│
├── infra/
│   ├── docker/
│   │   ├── Dockerfile.web        # Next.js frontend
│   │   ├── Dockerfile.api        # Hono API gateway
│   │   ├── Dockerfile.ws         # WebSocket gateway
│   │   ├── Dockerfile.python     # Python services
│   │   └── Dockerfile.services   # Node.js services (multi-stage)
│   ├── docker-compose.yml        # Full stack: all services + PostgreSQL + Redis + MinIO
│   ├── docker-compose.dev.yml    # Development overrides (hot-reload, debug ports)
│   ├── kubernetes/               # K8s manifests for production scale
│   ├── monitoring/               # Prometheus + Grafana + Loki configs
│   └── nginx/                    # Nginx/Caddy reverse proxy configs
│
├── tools/
│   ├── generators/          # Code generators (new service scaffold, new module)
│   └── scripts/             # Build/deploy/migrate scripts
│
├── .github/
│   └── workflows/           # GitHub Actions CI/CD pipelines
│
├── package.json             # Root workspace config
├── turbo.json               # Turborepo config
├── pnpm-workspace.yaml      # pnpm workspace
├── .env.example             # Environment variables template
└── README.md
```

### 10.3 Key Monorepo Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Monorepo tool** | Turborepo | Simpler than Nx, fast caching, dependency-aware task execution |
| **Package manager** | pnpm | Fastest install, strictest resolution (no phantom deps), disk-efficient |
| **TypeScript** | Project references + `composite: true` | Incremental builds, fast type-checking across packages |
| **Shared DB** | `packages/db` | Raw SQL query helpers + TypeScript types + `.sql` migration files — shared between all Node.js services |
| **Shared types** | `packages/types` | API contracts shared between frontend and backend — no drift |
| **Python isolation** | Separate `python/` directory | Python has its own dependency management (pyproject.toml). Not managed by pnpm. Docker builds separately. |
