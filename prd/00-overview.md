# Doable — Product Requirements Document (PRD)

## Executive Summary

**Doable** is a full-stack AI-powered application builder that enables users to create, deploy, and manage web applications through natural language prompts, visual editing, and direct code manipulation. It is a feature-complete alternative to Lovable.dev, designed from the ground up with **modular architecture** and **benchmark performance** as core priorities.

### AI-First Development Principle

> **This codebase is written and maintained by AI (Copilot/Claude), not human developers.** Every technology choice optimizes for what AI generates best — maximum training data coverage, minimal abstraction layers, zero proprietary API surfaces.

### Backend Strategy — Tier 0 (Current)

This is what we build NOW. Simple. Minimal. AI-friendly.

- **Frontend** — Next.js 15 (App Router, RSC, Server Actions) — SSR for marketing, `"use client"` for editor
- **API Layer** — Hono (ultra-fast, TypeScript-first, portable to CF Workers/Bun if needed)
- **Python Layer** — FastAPI (AI processing, code analysis, security scanning)
- **AI Engine** — Copilot SDK (model inference, tool calling, MCP, streaming)
- **Database** — PostgreSQL 16+ (self-hosted) with pgvector + pg_trgm. **Raw SQL via `postgres` (porsager/postgres)** — no ORM
- **Sessions** — JWT (jose) — stateless, no session store needed
- **File Storage** — Local filesystem (`/data/uploads/`) — no object storage needed yet
- **Builds** — Synchronous in-process (Vite) — no job queue needed yet
- **WebSocket** — Embedded in Hono — no separate gateway needed yet
- **Doable Cloud** — Our own web server hosting client sites at `*.doable.app` (default, zero-config)
- **Hosting: Provider-agnostic** — Users can also deploy to Cloudflare Pages, Vercel, Netlify, AWS, etc. via **Doable Deploy Adapter**
- **DNS: Provider-agnostic** — Custom domains via **Lexicon** (60+ DNS providers)
- **GitHub** — Source control: user's own GitHub repo, or Doable's common GitHub org for users without one
- **User-app backends** — User's choice: Supabase, Cloudflare D1, Firebase, Neon, etc. Doable generates integration code but does not host/manage these
- **Monorepo** — Turborepo + pnpm, three languages: TypeScript (Node.js), Python, SQL
- **Deployment** — Single VPS ($20-40/mo), 2 CPU, 4GB RAM. Docker Compose or direct process management.

> **Zero third-party cloud dependencies for Doable itself.** Our customers connect their own third-party services (Supabase, Firebase, etc.), but Doable runs entirely on infrastructure we control.

### Why No ORM? (AI-First Reasoning)

AI writes perfect SQL. AI writes mediocre ORM code. The math is simple:

| Factor | Raw SQL (`postgres` pkg) | ORM (Drizzle/Prisma) |
|--------|--------------------------|---------------------|
| **AI training data** | Billions of SQL examples | Limited ORM-specific examples |
| **Abstraction** | Zero — what you write is what runs | ORM API → SQL translation layer |
| **Debugging** | See exact SQL | ORM-generated SQL is opaque |
| **Dependencies** | 1 package (`postgres`) | ORM + codegen + CLI + migration tool |
| **Type safety** | TypeScript generics on query results | ORM schema → type generation |
| **Migration files** | Plain `.sql` files (AI writes these perfectly) | ORM-specific migration format |
| **Performance** | Zero overhead | Query builder overhead |

```typescript
// This is what AI writes best — pure SQL, parameterized, type-safe:
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!);

const projects = await sql<Project[]>`
  SELECT id, name, created_at FROM projects
  WHERE workspace_id = ${workspaceId}
  ORDER BY updated_at DESC
  LIMIT ${limit}
`;
```

### Future Infrastructure Strategy (Not Needed Now)

These components are designed in [PRD 12 Section 8.10](12-architecture.md) as progressive scaling tiers. They are NOT part of the current build and will be added only when user count demands them:

| Component | When Needed | Current Replacement |
|-----------|-------------|-------------------|
| **Redis** | 50+ users | JWT sessions, in-memory Maps, PostgreSQL `LISTEN/NOTIFY` |
| **BullMQ** | 50+ users | Synchronous `await` (no competing jobs with 3 users) |
| **MinIO** | 500+ users | Local filesystem |
| **Separate WS gateway** | 200+ users | WebSocket embedded in Hono |
| **sentence-transformers** | 500+ users | `pg_trgm` fuzzy search |
| **Prometheus / Grafana / Loki** | 500+ users | `pino` JSON logs + `pg_stat_statements` |
| **Kubernetes** | 1000+ users | Single VPS with Docker Compose or systemd |
| **PostgreSQL read replicas** | 1000+ users | Single PostgreSQL instance |

---

## Document Index

| # | Document | Scope |
|---|----------|-------|
| 00 | [overview.md](00-overview.md) | This file — executive summary, vision, glossary |
| 01 | [ai-engine.md](01-ai-engine.md) | AI chat, agent mode, plan mode, prompt system, debugging |
| 02 | [editor-ui.md](02-editor-ui.md) | Editor layout, panels, visual editor, code editor, preview |
| 03 | [project-management.md](03-project-management.md) | Project CRUD, dashboard, folders, search, templates |
| 04 | [code-generation.md](04-code-generation.md) | Generated tech stack, file structure, component library |
| 05 | [backend-database.md](05-backend-database.md) | Backend services, database, storage, edge functions, realtime |
| 06 | [auth-user-management.md](06-auth-user-management.md) | Platform auth, built-app auth, OAuth, SSO, roles |
| 07 | [deployment-hosting.md](07-deployment-hosting.md) | Cloud hosting, environments, custom domains, publishing |
| 08 | [integrations.md](08-integrations.md) | GitHub, Stripe, Figma, Shopify, MCP connectors, APIs |
| 09 | [collaboration-versioning.md](09-collaboration-versioning.md) | Workspaces, teams, version history, rollback, bookmarks |
| 10 | [analytics-security.md](10-analytics-security.md) | Built-in analytics, security scanning, secrets management |
| 11 | [pricing-billing.md](11-pricing-billing.md) | Credit system, plans, billing, subscriptions |
| 12 | [architecture.md](12-architecture.md) | Modular architecture, tech stack, performance benchmarks |
| 13 | [mobile-native.md](13-mobile-native.md) | Mobile/native app path, PWA, Capacitor, App Store strategy |
| 14 | [context-system-templates.md](14-context-system-templates.md) | `.doable/` context files (20+ files, OpenClaw-inspired), workspace templates, MCPs, enterprise white-label workspaces, Copilot SDK boundaries, hosting architecture |
| 15 | [development-phases.md](15-development-phases.md) | MVP → Enterprise development phases, Phase 0-5 roadmap, ship criteria, dependency map |
| 16 | [copilot-sdk-core.md](16-copilot-sdk-core.md) | Copilot SDK as the core engine, custom tools, authentication |
| 17 | [multi-user-infrastructure.md](17-multi-user-infrastructure.md) | Multi-user concurrency, tenant isolation, workspace authorization, AI session isolation, dev server lifecycle, build/deploy concurrency, CRDT real-time collaboration, rate limiting, resource management |
| 18 | [sandbox-isolation.md](18-sandbox-isolation.md) | Code sandbox security, execution isolation |
| 19 | [native-integrations-engine.md](19-native-integrations-engine.md) | Native integration capabilities, provider ecosystem |
| 20 | [usage-token-cost-tracking.md](20-usage-token-cost-tracking.md) | AI usage tracking, token extraction, cost estimation, per-user/project/workspace/admin dashboards, budget controls, usage alerts |

---

## Product Vision

Doable democratizes software development by allowing anyone — from non-technical founders to experienced developers — to build production-ready full-stack web applications through conversation with AI. Users describe what they want in natural language, and Doable generates clean, maintainable React/TypeScript code with a fully managed backend.

**Doable's core differentiator**: Unlike Lovable and other AI builders where each user creates independent standalone apps with separate databases, Doable's primary market is **enterprises who white-label Doable so their ecosystem developers (partners, resellers, integrators) can build modules on top of existing enterprise systems**. The enterprise pre-configures custom workspaces with their APIs, schemas, MCPs, CLI tools, and coding standards — crowdsourced developers jump in and build immediately, with every module connecting to the enterprise's existing infrastructure.

### Core Value Propositions
1. **Conversational Development** — Build apps by chatting with AI
2. **Visual + Code Duality** — Switch between Figma-like visual editing and VS Code-like code editing
3. **Full-Stack Generation** — Frontend, backend, auth, database, payments — all from prompts
4. **Zero Infrastructure** — Managed cloud hosting with one-click deploy
5. **Code Ownership** — Full export, GitHub sync, no lock-in
6. **Modular & Performant** — Built with benchmark performance from day one
7. **Enterprise White-Label** — Enterprises white-label Doable with custom workspaces, APIs, and module lifecycle
8. **Module-on-System** — Developers build modules on top of enterprise systems, not disconnected standalone apps

---

## Target Users

| Persona | Description | Key Needs |
|---------|-------------|-----------|
| **Non-technical Founder** | Wants to build MVP without hiring devs | Natural language → working app |
| **Solo Developer** | Wants to accelerate development | AI pair programming, quick scaffolding |
| **Designer** | Has Figma designs, wants working code | Design-to-code, visual editing |
| **Agency / Freelancer** | Builds apps for clients quickly | Templates, white-label, rapid prototyping |
| **Enterprise System Owner** | Has existing enterprise system, wants ecosystem developers to build modules on it | White-label Doable, custom workspaces, pre-configured APIs/MCPs/CLI, module lifecycle |
| **Enterprise Partner/Reseller** | Assigned to build modules on enterprise platform | Pre-configured workspace, zero-config start, AI-guided development on enterprise APIs |
| **Student / Learner** | Exploring app development | Free tier, educational pricing |

---

## Glossary

| Term | Definition |
|------|------------|
| **Agent Mode** | Default AI mode that autonomously generates, debugs, and iterates on code |
| **Plan Mode** | AI reasoning mode that creates structured plans before coding |
| **Visual Edits** | Figma-like direct manipulation of UI elements in the preview |
| **Dev Mode** | In-app code editor for reading and writing project source files |
| **Edge Functions** | Serverless backend functions (JS/TS) for API logic, webhooks, etc. |
| **Connector** | An integration point (shared or personal) linking external services |
| **Workspace** | A team/org container holding multiple projects |
| **Credit** | Unit of AI usage consumed by prompts and generations |
| **Knowledge** | Custom project context (branding, conventions) persisted across edits |
| **Remix** | Copying/forking an existing public project as a template |

---

## Competitive Landscape

| Feature | Doable | Lovable | Bolt.new | Replit | V0 |
|---------|--------|---------|----------|--------|-----|
| AI Chat + Agent | ✅ | ✅ | ✅ | ✅ | ✅ |
| Visual Editor | ✅ | ✅ | ❌ | ❌ | ✅ |
| Code Editor | ✅ | ✅ | ✅ | ✅ | ❌ |
| Full Backend | ✅ | ✅ | ❌ | ✅ | ❌ |
| GitHub Sync | ✅ | ✅ | ❌ | ✅ | ❌ |
| One-Click Deploy | ✅ | ✅ | ✅ | ✅ | ❌ |
| Stripe Integration | ✅ | ✅ | ❌ | ❌ | ❌ |
| Figma Import | ✅ | ✅ | ❌ | ❌ | ❌ |
| Team Collaboration | ✅ | ✅ | ❌ | ✅ | ❌ |
| Modular Architecture | ✅ | ❌ | ❌ | ✅ | ❌ |
| Benchmark Performance | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to first working preview | < 30 seconds |
| AI error reduction rate | > 90% vs naive generation |
| Build time (Vite production) | < 10 seconds for typical project |
| Preview hot-reload latency | < 500ms |
| Edge function cold start | < 200ms |
| Agent processing (max per request) | Up to 15 minutes |
| Visual edit save time | < 1 second |
| Code editor file switch | < 100ms |
| Dashboard project load | < 500ms |
| Publish to live | < 60 seconds |
