# 14 — Context System, Workspace Templates & Platform Boundaries

## Overview

This document answers the fundamental architectural questions that determine how Doable actually works:

1. **Where does one-click deploy go?** What infrastructure hosts user apps?
2. **What context/instruction files** does Doable use to make the AI agent smart?
3. **How much does Copilot SDK provide?** What do we build on top?
4. **What about MCPs?** How are they configured per workspace/project?
5. **Pre-templated workspaces** — Can we ship opinionated starter kits with MCPs, instructions, knowledge, and memory pre-organized?

This is the **intelligence layer** of Doable — the system that makes the AI agent context-aware, project-specific, and progressively smarter.

---

## 1. Hosting & Deployment Architecture

### 1.1 Core Principle: Separation of Concerns

**Doable's backend** and **client-published sites** are completely separate stacks:

| Concern | Stack | Details |
|---------|-------|---------|
| **Doable Platform** (everything that runs Doable itself) | **Plain PostgreSQL** + our own servers | Auth, billing, workspaces, project metadata, AI, analytics — all PostgreSQL-backed |
| **Client Site Publishing** (the apps users build and publish) | **Provider-agnostic** | Default: our own web server (`*.doable.app`). Optional: Cloudflare Pages, Vercel, Netlify, AWS, and 10+ others via **Doable Deploy Adapter** |
| **Client Site Backend** (if the user's app needs a database/API) | **User's choice** | Users connect their own backend: Supabase, D1, Firebase, custom API, etc. Doable does not mandate this |
| **Source Control** | **GitHub** | User's own GitHub if they have one; Doable's common GitHub org when they don't |

**OpenNext is NOT applicable.** OpenNext is a Next.js-only tool. Doable generates React + Vite apps. Irrelevant.

### 1.2 Doable Platform Backend: Plain PostgreSQL

Doable itself runs on **plain PostgreSQL**. No Cloudflare services, no D1, no R2, no Workers for the platform.

| Service | Backed By |
|---------|-----------|
| **Auth** | PostgreSQL (our own auth service) |
| **Workspaces & Projects** | PostgreSQL |
| **Billing & Credits** | PostgreSQL + Stripe |
| **Version History** | PostgreSQL + Git (GitHub) |
| **Template Registry** | PostgreSQL |
| **Analytics** | PostgreSQL |
| **AI Sessions** | Copilot SDK + PostgreSQL for metadata |
| **File Storage** | Git (GitHub repos) |
| **Realtime (editor collaboration)** | WebSocket service on our own infra |

### 1.3 Client Site Publishing: Provider-Agnostic

Hosting is **provider-agnostic** via our **Doable Deploy Adapter** layer (no unified library exists, so we build it).

**Default experience is zero-config** — every project auto-gets `[project].doable.app` on **our own web server** (Nginx/Caddy, per-project directories, wildcard cert). No DNS setup, no hosting config. Identical to how Lovable provides `[project].lovable.app`.

| Feature | Description |
|---------|-------------|
| **Default URL** | `[project-name].doable.app` — auto-provisioned on our own server, instant, zero config |
| **Default hosting** | Our own web server with dedicated space per project (Free: capped, Pro: larger) |
| **SSL** | Wildcard cert on `*.doable.app` — automatic HTTPS (Let's Encrypt) |
| **Third-party providers** | Cloudflare Pages, Vercel, Netlify, AWS S3+CF, GitHub Pages, Firebase, Render, DigitalOcean, Azure, Fly.io, Surge.sh, custom SSH/SFTP |
| **Custom Domains** | Optional (Pro+) — DNS managed via Lexicon (60+ providers, no vendor lock-in) |
| **What gets deployed** | Vite production build output — static HTML/CSS/JS only |

### 1.4 Client-Side Backend: User's Choice

If the user's app needs a database, auth, storage, or API, **the user connects their own backend service**. Doable generates the integration code but does NOT host or manage the backend.

| User Wants | Doable Generates | User Connects |
|------------|-----------------|---------------|
| Database | SQL schema + CRUD hooks + client SDK code | Supabase, Cloudflare D1, PlanetScale, Neon, Firebase, etc. |
| Auth | Login/signup UI + auth hooks + protected routes | Supabase Auth, Clerk, Auth0, Firebase Auth, etc. |
| Storage | Upload UI + file management hooks | Supabase Storage, Cloudflare R2, AWS S3, etc. |
| Edge Functions | Function code + API routes | Supabase Edge Functions, Cloudflare Workers, Vercel Functions, etc. |
| Realtime | WebSocket/subscription hooks | Supabase Realtime, Pusher, Ably, etc. |

Doable provides **MCP connectors** and **shared connectors** to make connecting these services easy (see Section 4).

### 1.5 Source Control: GitHub

| Scenario | Git Backend |
|----------|------------|
| **User has GitHub account** | Project synced to user's own GitHub repo (they own the code) |
| **User does NOT have GitHub** | Project stored in Doable's common GitHub org (private repo per project) |
| **Export** | User can always export/transfer to their own GitHub at any time |

### 1.6 Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                      Doable Platform                           │
│                   (Our Infrastructure)                         │
│                                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐ │
│  │ Auth Service  │ │ Workspace    │ │ AI Agent (Copilot SDK) │ │
│  └──────────────┘ └──────────────┘ └────────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐ │
│  │ Billing      │ │ Build Service│ │ GitHub (source control)│ │
│  └──────────────┘ └──────────────┘ └────────────────────────┘ │
│                                                                │
│  ↕ Plain PostgreSQL (all platform data)                        │
│  ↕ Redis (caching, sessions)                                   │
└────────────────────────────────────────────────────────────────┘
                         │
                   Publish (static build output)
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│              Doable Deploy Adapter (provider-agnostic)           │
│                                                                │
│  Default: Doable Cloud (our web server, *.doable.app)          │
│  Optional: Cloudflare Pages | Vercel | Netlify | AWS S3+CF     │
│           GitHub Pages | Firebase | Render | DigitalOcean      │
│           Azure Static Web Apps | Fly.io | Surge | SSH/SFTP    │
└────────────────────────────────────────────────────────────────┘
                         │
              User's app may connect to:
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
       Supabase    Cloudflare D1   Firebase
       (or any backend the user chooses)
```

### 1.7 One-Click Deploy Flow

```
User clicks "Publish"
    │
    ▼
Vite production build (on our build service)
    │
    ▼
Doable Deploy Adapter
    ├─── Default: static output ──→ Our web server (/sites/[project]/)
    │   OR:    static output ──→ Connected third-party provider
    └─── Git commit ──→ GitHub (user's repo or Doable common org)
    │
    ▼
App live at [project].doable.app (or provider URL / custom domain)
```

If the user's app has connected backend services (Supabase, D1, etc.), those are already running independently — the publish only deploys the frontend.

---

## 2. Copilot SDK: What It Provides vs What We Build

### 2.1 What Copilot SDK Gives Us (Out of the Box)

| Capability | Status | Details |
|------------|--------|---------|
| **Model inference** | ✅ Provided | Send prompts → get streaming responses. Supports GPT-4.1, Claude, model routing via policies |
| **Tool calling** | ✅ Provided | Define typed tools with JSON schemas → agent auto-selects and invokes them |
| **MCP integration** | ✅ Provided | Native MCP client — connects to any MCP server for external tools/data |
| **Session management** | ✅ Provided | Multi-turn conversations, context maintenance, conversation compaction |
| **Agent execution loop** | ✅ Provided | Planning → tool calls → iteration → error remediation → file edits → command execution |
| **Streaming** | ✅ Provided | Real-time response streaming with token-by-token delivery |
| **Model routing** | ✅ Provided | Dynamic policy-based routing across providers (GitHub Models, OpenAI, Anthropic, Azure) |
| **BYOK** | ✅ Provided | Bring your own keys for different model providers |
| **Auth** | ✅ Provided | GitHub authentication for SDK access |

### 2.2 What We MUST Build on Top

| Capability | Effort | Details |
|------------|--------|---------|
| **Custom tools** | 🔧 Medium | All Doable-specific tools: `create_file`, `edit_file`, `run_build`, `deploy`, `create_db_table`, `query_db`, `manage_storage`, `read_preview`, `run_test`, `search_web`, `visual_edit`, etc. |
| **context system** | 🔧 High | The entire `.doable/` context file system (see Section 3). Reading, writing, injecting context files into prompts |
| **Editor UI** | 🔧 High | All UI: chat panel, code editor, visual editor, preview, file tree, history, etc. |
| **Build pipeline** | 🔧 High | Vite builds, hot reload, preview iframe, deployment to Cloudflare Pages |
| **Database orchestration** | 🔧 Medium | Generating schemas/migrations for user's chosen backend (Supabase, D1, etc.) |
| **Storage management** | 🔧 Low | Generating client code for user's chosen storage provider |
| **Auth system** | 🔧 High | Platform auth (login/register), built-app auth (per-project user systems) |
| **Billing/Credits** | 🔧 High | Credit system, Stripe billing, usage tracking, rate limiting |
| **Template system** | 🔧 High | Pre-configured workspace templates with MCPs, instructions, knowledge (see Section 5) |
| **Deployment engine** | 🔧 Medium | Cloudflare Pages API for static site publishing + GitHub API for source control |
| **Analytics** | 🔧 Medium | Built-in analytics collection and dashboard |
| **Version history** | 🔧 Medium | Git-like versioning with bookmarks, rollback, screenshot captures |
| **Collaboration** | 🔧 Medium | Multi-user editing, workspace management, roles |
| **Security scanning** | 🔧 Medium | Dependency scanning, secret detection, code pattern analysis |
| **Visual edits engine** | 🔧 High | Click-to-select, property panels, AST mutations, bidirectional sync |

### 2.3 Copilot SDK Boundary Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  COPILOT SDK HANDLES                     │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐ │
│  │ Model        │  │ Tool        │  │ MCP            │ │
│  │ Inference    │  │ Orchestration│  │ Client         │ │
│  │ + Routing    │  │ + Calling   │  │ + Discovery    │ │
│  └──────┬───────┘  └──────┬──────┘  └───────┬────────┘ │
│         │                 │                  │          │
│  ┌──────┴─────────────────┴──────────────────┴────────┐ │
│  │        Agent Execution Loop (Plan → Act → Fix)      │ │
│  └─────────────────────────────────────────────────────┘ │
│                          │                               │
│  ┌──────────────────┐ ┌──┴───────────┐ ┌─────────────┐ │
│  │ Session Mgmt     │ │ Streaming    │ │ Auth (GH)   │ │
│  └──────────────────┘ └──────────────┘ └─────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │
                    ═══════╪═══════  SDK BOUNDARY
                           │
┌──────────────────────────┴──────────────────────────────┐
│                    WE BUILD THIS                         │
│                                                         │
│  ┌───────────┐  ┌────────────┐  ┌─────────────────────┐│
│  │ Custom     │  │ Context    │  │ Template System     ││
│  │ Tools      │  │ System     │  │ (Workspaces,MCPs,   ││
│  │ (30+ tools)│  │ (.doable/) │  │  Instructions)      ││
│  └───────────┘  └────────────┘  └─────────────────────┘│
│                                                         │
│  ┌───────────┐  ┌────────────┐  ┌─────────────────────┐│
│  │ Editor UI │  │ Build/     │  │ Deployment Engine   ││
│  │ (Chat,Code│  │ Preview    │  │ (CF Pages + GitHub) ││
│  │ Visual)   │  │ Pipeline   │  │                     ││
│  └───────────┘  └────────────┘  └─────────────────────┘│
│                                                         │
│  ┌───────────┐  ┌────────────┐  ┌─────────────────────┐│
│  │ DB/Storage│  │ Auth/      │  │ Analytics /         ││
│  │ Mgmt      │  │ Billing    │  │ Security            ││
│  └───────────┘  └────────────┘  └─────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## 3. The `.doable/` Context File System

### 3.1 Why Context Files Matter

The AI agent is only as good as its context. Without project-specific instructions, the agent generates generic code. The `.doable/` directory is **the brain of each project** — it tells the agent who it is, what the project is about, what standards to follow, and what it has learned.

### 3.2 Complete File Taxonomy

Inspired by OpenClaw's workspace model (AGENTS.md, SOUL.md, IDENTITY.md, USER.md, TOOLS.md, BOOT.md, BOOTSTRAP.md, HEARTBEAT.md, MEMORY.md + `memory/` daily logs + `skills/` per-skill directories), Doable's context system extends and adapts these concepts for a full-stack application builder with enterprise white-label support.

Every Doable project contains a `.doable/` directory with these files:

```
.doable/
├── identity.md          # WHO the agent is for this project (≈ OpenClaw IDENTITY.md)
├── soul.md              # HOW the agent should behave — personality, tone, principles (≈ OpenClaw SOUL.md)
├── user.md              # WHO the current user/developer is — profile, role, preferences (≈ OpenClaw USER.md)
├── knowledge.md         # WHAT the project is about (business context, domain knowledge)
├── plan.md              # WHAT to build next (active plan from Plan Mode)
├── instructions.md      # Project-wide coding instructions (style, patterns, conventions) (≈ OpenClaw AGENTS.md)
├── agents.md            # Custom agent definitions for specialized tasks
├── tools.md             # Tool notes, custom tool configs, conventions (≈ OpenClaw TOOLS.md)
├── boot.md              # Startup checklist — runs at every session start (≈ OpenClaw BOOT.md)
├── bootstrap.md         # One-time workspace setup — runs once then self-deletes (≈ OpenClaw BOOTSTRAP.md)
├── heartbeat.md         # Periodic health/checklist to keep agent on track (≈ OpenClaw HEARTBEAT.md)
├── memory.md            # Curated persistent learned facts about this project (≈ OpenClaw MEMORY.md)
├── design-system.md     # Visual design constraints (colors, fonts, spacing, components)
├── api-reference.md     # External API docs and integration patterns
├── schema.md            # Database schema documentation (auto-generated)
├── architecture.md      # System architecture decisions and patterns
├── mcp.json             # MCP server configurations (see Section 4)
├── memory/              # Daily memory logs — auto-created (≈ OpenClaw memory/YYYY-MM-DD.md)
│   ├── 2025-01-15.md
│   ├── 2025-01-16.md
│   └── ...
├── skills/              # Per-skill directories with structured definitions (≈ OpenClaw skills/)
│   ├── add-page/
│   │   └── SKILL.md     # YAML frontmatter + instructions
│   ├── add-auth/
│   │   └── SKILL.md
│   ├── add-payments/
│   │   └── SKILL.md
│   └── ...
├── prompts/             # Reusable prompt templates
│   ├── create-page.md
│   ├── add-auth.md
│   ├── add-payment.md
│   ├── debug.md
│   └── ...
└── rules/               # Scoped rules (applied conditionally)
    ├── frontend.md      # Rules applied to *.tsx, *.css files
    ├── backend.md       # Rules applied to edge functions
    ├── testing.md       # Rules applied to *.test.ts files
    └── security.md      # Security-specific rules
```

### 3.2.1 OpenClaw Cross-Reference

| OpenClaw File | Doable Equivalent | Adaptation |
|---------------|-------------------|------------|
| **AGENTS.md** | `instructions.md` | OpenClaw uses AGENTS.md for global rules/constraints. Doable separates into `instructions.md` (coding rules) + `agents.md` (specialized agent definitions) |
| **SOUL.md** | `soul.md` | Direct mapping — personality, tone, decision framework |
| **IDENTITY.md** | `identity.md` | Direct mapping — agent name, role, expertise |
| **USER.md** | `user.md` | **NEW** — OpenClaw tracks user profile/addressing. Doable extends for enterprise: tracks developer role, enterprise permissions, API access level |
| **TOOLS.md** | `tools.md` | **NEW** — OpenClaw uses this for tool notes/conventions. Doable extends for enterprise: custom tool configs, enterprise CLI tools, API endpoint docs |
| **BOOT.md** | `boot.md` | **NEW** — Session startup checklist. In enterprise context: verify API connectivity, load latest schema, check permissions |
| **BOOTSTRAP.md** | `bootstrap.md` | **NEW** — One-time workspace setup. In enterprise context: initial enterprise system integration, API key setup, first schema sync |
| **HEARTBEAT.md** | `heartbeat.md` | **NEW** — Periodic checks. In enterprise context: verify module compatibility with parent system, check API health |
| **MEMORY.md** | `memory.md` | Direct mapping + daily logs in `memory/` directory |
| **memory/*.md** | `memory/YYYY-MM-DD.md` | **NEW** — Daily chronological logs with semantic search indexing |
| **skills/\*/SKILL.md** | `skills/*/SKILL.md` | Upgraded from flat `skills.md` — each skill gets its own directory with structured YAML frontmatter |
| **(no equivalent)** | `knowledge.md` | Doable-original — domain knowledge and business context |
| **(no equivalent)** | `plan.md` | Doable-original — Plan Mode active plan tracking |
| **(no equivalent)** | `design-system.md` | Doable-original — visual design constraints |
| **(no equivalent)** | `schema.md` | Doable-original — auto-generated database schema docs |
| **(no equivalent)** | `architecture.md` | Doable-original — system architecture decisions |
| **(no equivalent)** | `api-reference.md` | Doable-original — external API documentation |
| **(no equivalent)** | `prompts/` | Doable-original — reusable prompt templates |
| **(no equivalent)** | `rules/` | Doable-original — scoped rules by file type |

### 3.3 File Definitions

#### `identity.md` — WHO the agent is
```markdown
# Agent Identity

## Name
Doable AI Assistant for [Project Name]

## Role
Full-stack developer specializing in React/TypeScript/Tailwind
with expertise in [project-specific domain].

## Expertise
- E-commerce checkout flows
- Stripe payment integration
- Mobile-responsive design

## Working Style
- Always explain before making changes
- Prefer small, focused commits
- Test edge cases proactively
```

**Purpose**: Defines the agent's persona for this specific project. A SaaS project gets a different identity than a portfolio site. Referenced on every interaction.

#### `user.md` — WHO the current developer is *(NEW — from OpenClaw)*
```markdown
# Developer Profile

## Name
Jane Smith

## Role
Partner Developer @ Acme Corp

## Permissions
- Can create/edit modules in: checkout, inventory
- Cannot modify: core auth, billing system
- API access level: partner-tier

## Preferences
- Prefers detailed explanations
- Wants TypeScript strict mode always
- Timezone: UTC-5 (EST)

## Enterprise Context
- Organization: Acme Corp
- Team: Partner Integrations
- Assigned modules: inventory-dashboard, warehouse-sync
```

**Purpose**: Tells the agent who is currently working and what they're allowed to do. Essential in enterprise contexts where different developers have different access levels and module assignments. In standard (non-enterprise) projects, this is simpler — just user name and preferences.

#### `soul.md` — HOW the agent behaves
```markdown
# Agent Soul

## Principles
- Ship working code over perfect code
- Mobile-first, always
- Accessibility is not optional
- Every component should render in < 100ms

## Communication Style
- Be concise, technical, and actionable
- Show code diffs, not just descriptions
- Flag potential issues proactively
- Never say "let me know if you need anything"

## Decision Framework
When facing trade-offs:
1. User experience over developer convenience
2. Performance over features
3. Simplicity over cleverness
4. Convention over configuration

## Guardrails
- Never delete user data without explicit confirmation
- Never expose API keys in frontend code
- Always validate user input at system boundaries
- Never bypass RLS policies
```

**Purpose**: The agent's personality, values, and decision-making framework. Separate from identity because it governs behavior across all tasks.

#### `knowledge.md` — WHAT the project is about
```markdown
# Project Knowledge

## Business Context
This is a fitness tracking SaaS for personal trainers.
Users: trainers (admins) and their clients (members).

## Domain Terminology
- "Workout" = a structured exercise session
- "Program" = a multi-week training plan
- "Check-in" = a weekly progress submission

## User Personas
1. **Trainer**: Creates programs, monitors clients, tracks revenue
2. **Client**: Follows programs, logs workouts, submits check-ins

## Key Workflows
1. Trainer creates a program → assigns to client → client follows
2. Client logs workout → trainer reviews → gives feedback
3. Client submits check-in → trainer evaluates progress

## Business Rules
- Free plan: 3 clients max
- Pro plan: unlimited clients
- Programs have 4-12 week durations
```

**Purpose**: Domain knowledge that persists across ALL conversations and edits. The agent reads this before every response.

#### `plan.md` — WHAT to build next
```markdown
# Active Plan

## Current Sprint: Authentication + Onboarding

### Phase 1: Auth Setup ✅
- [x] Doable Cloud auth integration
- [x] Login/signup pages
- [x] Protected routes

### Phase 2: Onboarding Flow (IN PROGRESS)
- [ ] Trainer profile setup
- [ ] Client invite flow
- [ ] Welcome email integration

### Phase 3: Dashboard (NEXT)
- [ ] Trainer dashboard with client list
- [ ] Client dashboard with upcoming workouts
```

**Purpose**: Created and updated by Plan Mode. Persists across messages. Agent references this to understand current priorities and what has been completed.

#### `instructions.md` — Coding rules
```markdown
# Coding Instructions

## Stack
- React 18 + TypeScript 5.2+ (strict mode)
- Tailwind CSS 3.4+ (mobile-first)
- shadcn/ui for all UI components
- React Router v6 for routing

## File Conventions
- Max 300 lines per file (split into modules)
- Use `@/` path aliases everywhere
- Feature-based folder structure (not type-based)
- One component per file

## Component Patterns
- Functional components only (no class components)
- Use composition over inheritance
- Extract hooks for shared logic
- Props interfaces defined inline (not separate files)

## Naming
- PascalCase for components: `WorkoutCard.tsx`
- camelCase for hooks: `useWorkout.ts`
- kebab-case for routes: `/workout-list`
- SCREAMING_SNAKE for constants: `MAX_CLIENTS`

## Error Handling
- Use React Error Boundaries at page level
- Toast notifications for user-facing errors
- Console.error for developer-facing errors
- Never silently swallow errors
```

**Purpose**: The technical rulebook. Equivalent to `.cursorrules` or `copilot-instructions.md` but Doable-specific. Applied to every code generation and edit.

#### `agents.md` — Specialized agent definitions
```markdown
# Custom Agents

## Security Auditor
- Trigger: "audit security" or "security review"
- Role: Reviews code for vulnerabilities
- Tools: dependency scanner, secret scanner, code pattern scanner
- Output: Security report with severity ratings

## Performance Optimizer
- Trigger: "optimize performance" or "make it faster"
- Role: Identifies and fixes performance bottlenecks
- Tools: bundle analyzer, lighthouse audit, React profiler
- Output: Performance report with before/after metrics

## Database Architect
- Trigger: "design schema" or "plan database"
- Role: Designs normalized, performant database schemas
- Tools: schema generator, migration runner, ER diagram renderer
- Output: SQL migrations + visual schema diagram
```

**Purpose**: Defines specialized agent "modes" that users can invoke for specific tasks. Each agent has its own tools, behavior, and output format.

#### `tools.md` — Tool notes and custom tool configs *(NEW — from OpenClaw)*
```markdown
# Tool Configuration

## Enterprise CLI Tools
- `acme-cli deploy` — Deploy module to Acme staging environment
- `acme-cli validate` — Validate module against Acme's API contract
- `acme-cli sync-schema` — Pull latest database schema from Acme core

## Custom API Tools
- **Acme Inventory API**: `POST /api/v2/inventory/query` — query current stock
- **Acme Orders API**: `GET /api/v2/orders/{id}` — fetch order details
- Rate limit: 100 req/min per partner key

## Tool Conventions
- Always use the `acme-cli validate` tool before suggesting deployment
- Prefer API calls over direct database queries
- Log all external API calls for audit compliance

## MCP Tool Notes
- The `acme-inventory` MCP returns quantities in "units" not "pieces"
- The `acme-auth` MCP token expiry is 1 hour — refresh proactively
```

**Purpose**: Documents the tools available in this workspace — especially critical for enterprise workspaces where custom CLI tools and APIs are the primary interface to the parent system. The agent reads this to understand what tools exist and how to use them correctly.

#### `boot.md` — Session startup checklist *(NEW — from OpenClaw)*
```markdown
# Boot Checklist

## Every Session Start
1. Load latest schema from `schema.md` — check if upstream changed
2. Verify API connectivity to Acme endpoints
3. Check if any pending migrations need to run
4. Load today's memory log from `memory/`
5. Review `plan.md` for current sprint status

## Reminders
- Partner API key rotates monthly — check `ACME_API_KEY` validity
- Module tests must pass before any deployment suggestion
- Always greet the developer by name (from user.md)
```

**Purpose**: Runs at the beginning of every session. Ensures the agent starts in a known-good state. In enterprise contexts, this verifies connectivity to the parent system and loads fresh context.

#### `bootstrap.md` — One-time workspace setup *(NEW — from OpenClaw)*
```markdown
# Bootstrap (one-time setup)

## Initial Setup Steps
1. ✅ Connected to Acme API — verified partner credentials
2. ✅ Pulled initial schema from Acme core database
3. ✅ Generated type definitions from API OpenAPI spec
4. ✅ Created base module structure matching Acme conventions
5. ✅ Configured MCP servers for Acme internal services
6. ⬜ First module build + validation (awaiting developer)

## Post-Bootstrap
This file self-deletes after all steps complete.
The ongoing checklist moves to `boot.md`.
```

**Purpose**: Executes one-time setup when a workspace is first provisioned. Critical for enterprise onboarding — pulls schemas, generates types, configures MCPs, validates credentials. After completion, it self-deletes (like OpenClaw's BOOTSTRAP.md) and ongoing checks move to `boot.md`.

#### `heartbeat.md` — Periodic health checks *(NEW — from OpenClaw)*
```markdown
# Heartbeat Checklist

## Check Every 10 Interactions
- [ ] Module still compatible with Acme core API version?
- [ ] Any schema drift since last sync?
- [ ] Memory growing too large? Summarize + prune if > 50 entries
- [ ] Are all MCP connections healthy?
- [ ] Any new deprecation warnings from Acme API?

## Check Every Deploy
- [ ] All tests passing?
- [ ] No security vulnerabilities in new dependencies?
- [ ] Module size within Acme's 5MB bundle limit?
- [ ] API contract validation passes (`acme-cli validate`)?
```

**Purpose**: Periodic health/drift checks that run at intervals rather than every session. Prevents gradual drift — especially important when building modules against an enterprise system that may evolve independently.

#### `skills/` — Per-skill directories *(UPGRADED — from OpenClaw)*

Each skill gets its own directory with a `SKILL.md` file containing YAML frontmatter (like OpenClaw's `skills/*/SKILL.md`):

```
skills/
├── add-page/
│   └── SKILL.md
├── add-auth/
│   └── SKILL.md
├── add-payments/
│   └── SKILL.md
├── add-crud/
│   └── SKILL.md
├── deploy/
│   └── SKILL.md
└── acme-module/            # Enterprise-specific skill
    └── SKILL.md
```

Example `skills/add-page/SKILL.md`:
```markdown
---
name: add-page
description: Create a new page with routing, layout, and navigation integration
trigger: /add-page
requires:
  - name: pageName
    type: string
    description: Name of the new page
  - name: layout
    type: enum
    values: [sidebar, full, centered]
    description: Layout template to use
tools: [create_file, edit_file, run_build]
---

# Add Page Skill

## Steps
1. Create page component at `src/pages/{PageName}.tsx`
2. Add route to `src/App.tsx` router config
3. Add navigation link to sidebar/nav component
4. Create any required sub-components
5. Run build to verify no errors
```

**Purpose**: Slash-command-like capabilities the agent can invoke. Each skill is a structured multi-step operation. The YAML frontmatter enables validation and discoverability. Enterprise workspaces ship custom skills for enterprise-specific workflows (e.g., `acme-module` skill that scaffolds a module matching Acme's conventions).

#### `memory.md` — Learned project facts
```markdown
# Project Memory

## Learned Facts
- 2024-03-01: User prefers rounded corners (border-radius: 12px) over sharp
- 2024-03-02: The client list page needs pagination at 20 items
- 2024-03-03: Stripe is in test mode, API key is in secret `STRIPE_SECRET_KEY`
- 2024-03-04: User wants email notifications via Resend, not SendGrid

## Resolved Issues
- Fixed: Auth redirect loop was caused by missing middleware on /dashboard
- Fixed: Image upload was failing because R2 bucket had wrong CORS config

## User Preferences
- Always use toast notifications (not alert boxes)
- Prefer Lucide icons over Heroicons
- Use date-fns, not moment.js
```

**Purpose**: The agent's persistent memory for this project. Accumulated over time as the user works. Prevents the agent from repeating mistakes or asking the same questions twice.

#### `memory/` — Daily memory logs *(NEW — from OpenClaw)*

Auto-created daily files for chronological context:

```
memory/
├── 2025-01-15.md    # "User decided to use pagination..."
├── 2025-01-16.md    # "Resolved CORS issue with Acme API..."
├── 2025-01-17.md    # "Schema updated — new 'warehouses' table..."
└── ...
```

Each daily log captures:
```markdown
# 2025-01-16

## Session 1 (10:30 AM)
- Resolved CORS issue with Acme Inventory API
- Fix: Added `X-Partner-Token` header (was missing)
- User confirmed: always include partner token in API requests

## Session 2 (3:15 PM)
- Added warehouse location field to inventory module
- Schema change: `warehouses.location` column (type: geography)
- API: new endpoint `GET /api/v2/warehouses/nearby`
```

**Purpose**: Provides temporal context that `memory.md` alone can't capture. The agent loads today + yesterday's logs for recent context, and uses semantic search across older logs when resolving issues. Identical to OpenClaw's `memory/YYYY-MM-DD.md` pattern. In enterprise contexts, these logs also serve as an audit trail of what each developer built.

#### `design-system.md` — Visual constraints
```markdown
# Design System

## Colors
- Primary: #2563EB (blue-600)
- Secondary: #7C3AED (violet-600)
- Background: #FAFAFA
- Text: #111827

## Typography
- Headings: Inter, 700 weight
- Body: Inter, 400 weight
- Code: JetBrains Mono

## Spacing
- Base unit: 4px
- Component padding: 16px (p-4)
- Section gap: 32px (gap-8)

## Border Radius
- Buttons: 8px (rounded-lg)
- Cards: 12px (rounded-xl)
- Inputs: 8px (rounded-lg)

## Shadows
- Card: shadow-md
- Modal: shadow-xl
- Dropdown: shadow-lg
```

**Purpose**: Visual design rules extracted from the user's preferences. Applied whenever the agent generates UI code.

#### `schema.md` — Auto-generated database docs
Auto-generated and kept in sync with the actual database:
```markdown
# Database Schema

## Tables

### users
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| email | text | UNIQUE, NOT NULL |
| role | text | CHECK (role IN ('trainer', 'client')) |
| created_at | timestamptz | DEFAULT now() |

### workouts
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| trainer_id | uuid | FK → users(id) |
| title | text | NOT NULL |
| exercises | jsonb | NOT NULL |

## RLS Policies
- trainers can read/write their own workouts
- clients can read workouts assigned to them
```

#### `architecture.md` — System design decisions
```markdown
# Architecture Decisions

## Frontend
- SPA with client-side routing (React Router v6)
- No SSR needed (dashboard app, not content site)
- Code splitting per route via React.lazy()

## Backend
- All data access via edge functions (never direct DB from frontend)
- Auth tokens verified in every edge function
- Rate limiting on all public endpoints

## Data Flow
User Action → Frontend → Edge Function → Database → Response → UI Update
```

### 3.4 Context Injection Priority

When the agent processes a prompt, context files are injected in this order:

```
 1. boot.md            (session start only — startup checklist)
 2. identity.md        (always loaded — who am I?)
 3. soul.md            (always loaded — how should I behave?)
 4. user.md            (always loaded — who is the developer?)
 5. instructions.md    (always loaded — what coding rules apply?)
 6. knowledge.md       (always loaded — what is this project about?)
 7. plan.md            (always loaded — what am I building right now?)
 8. memory.md          (always loaded — curated learned facts)
 9. memory/today.md    (always loaded — today's log)
10. memory/yesterday.md(always loaded — yesterday's log)
11. tools.md           (loaded when using tools or APIs)
12. design-system.md   (loaded when generating UI code)
13. schema.md          (loaded when working with database)
14. architecture.md    (loaded when making structural decisions)
15. api-reference.md   (loaded when working with external APIs)
16. rules/frontend.md  (loaded when editing .tsx/.css files)
17. rules/backend.md   (loaded when editing edge functions)
18. agents.md          (loaded when invoking a specialized agent)
19. skills/*/SKILL.md  (loaded when user invokes a specific skill)
20. prompts/*.md       (loaded when matching a prompt template)
21. heartbeat.md       (loaded every N interactions for health checks)
```

Files 1-10 are **always in context** (boot.md only at session start, memory logs for today/yesterday). Files 11-21 are **conditionally loaded** based on the current task.

In enterprise workspaces, `tools.md` and `api-reference.md` are effectively always loaded since every interaction involves the enterprise system.

### 3.5 Context Token Budget

| Priority | Files | Est. Tokens | Loading |
|----------|-------|-------------|---------|
| **P0 — Always** | identity, soul, user, instructions, knowledge, plan, memory, today's log, yesterday's log | ~6,000-12,000 | Every prompt |
| **P0.5 — Session** | boot.md (start only), tools.md (enterprise: always) | ~500-1,500 | Session start / enterprise always |
| **P1 — Task** | design-system, schema, architecture, api-reference | ~2,000-4,000 | Based on task type |
| **P2 — Scoped** | rules/frontend, rules/backend, rules/testing | ~1,000-2,000 | Based on file being edited |
| **P3 — On-Demand** | agents, skills/*/SKILL.md, prompts, heartbeat | ~500-2,000 | When explicitly invoked or at intervals |
| **Total budget** | | ~10,000-20,000 | Max 20% of context window |

---

## 4. MCP Configuration

### 4.1 MCP in Doable

Doable uses MCP servers as **personal connectors** (build-time context) and **shared connectors** (app runtime capabilities). Both are configured at the workspace level and stored in the project's configuration.

### 4.2 MCP Configuration File

Each project has an MCP configuration in `.doable/mcp.json`:

```json
{
  "mcpServers": {
    "github": {
      "type": "shared",
      "provider": "doable",
      "enabled": true,
      "config": {
        "repo": "user/project",
        "branch": "main"
      }
    },
    "notion": {
      "type": "personal",
      "provider": "mcp-notion",
      "transport": "sse",
      "url": "https://mcp.notion.so/sse",
      "enabled": true
    },
    "linear": {
      "type": "personal",
      "provider": "mcp-linear",
      "transport": "sse",
      "url": "https://mcp.linear.app/sse",
      "enabled": true
    },
    "stripe": {
      "type": "shared",
      "provider": "doable-stripe",
      "enabled": true,
      "secrets": ["STRIPE_SECRET_KEY"]
    },
    "supabase-legacy": {
      "type": "personal",
      "provider": "mcp-supabase",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server"],
      "enabled": false
    },
    "custom-crm": {
      "type": "personal",
      "provider": "custom",
      "transport": "sse",
      "url": "https://crm.company.com/mcp",
      "plan": "business"
    }
  }
}
```

### 4.3 MCP Server Categories in Doable

| Category | Examples | Configured By | Available On |
|----------|---------|---------------|-------------|
| **Platform MCPs** (always available) | Doable Cloud, Doable AI | Automatic | All plans |
| **Shared Connectors** | Stripe, Shopify, ElevenLabs, Perplexity, Firecrawl, Slack | Workspace admin | All plans |
| **Pre-built Personal** | Notion, Linear, Jira/Confluence, Miro, n8n, Amplitude, Granola, Polar, Sanity | Individual user | All plans |
| **Custom MCP Servers** | Any SSE/STDIO MCP server | Individual user | Business/Enterprise |

### 4.4 MCP + Template Integration

When a workspace template includes MCP servers:
1. Template specifies which MCPs to pre-configure
2. On project creation, MCP configs are copied to `.doable/mcp.json`
3. User is prompted to authenticate personal connectors (one-time)
4. Shared connectors are auto-enabled if workspace has them configured
5. Custom MCPs require URL/command — template provides defaults, user overrides

---

## 5. Pre-Templated Workspaces — The Template System

### 5.1 What is a Workspace Template?

A workspace template is a **complete starter kit** that provisions:

| Component | Contents |
|-----------|----------|
| **Code scaffold** | File structure, boilerplate components, routing, layouts |
| **`.doable/` context files** | All 14+ context files pre-filled for the project type |
| **MCP servers** | Pre-configured connectors relevant to the project type |
| **Database schema** | Starting tables, RLS policies, seed data (for user's chosen backend) |
| **Design system** | Colors, typography, spacing, component variants |
| **Backend integration** | Pre-configured for a default backend (e.g., Supabase) — user can swap |
| **Knowledge base** | Domain-specific knowledge for the AI agent |
| **Memory** | Pre-learned facts about the project type |
| **Prompt templates** | Project-type-specific reusable prompts |

### 5.2 Template Categories

#### SaaS Starter
```
Template: saas-starter
─────────────────────────────────
Code:     Dashboard layout, settings page, landing page, pricing page
Auth:     Email + Google login, role-based access (admin/user)
Database: users, teams, subscriptions, invites
Payments: Stripe subscription with 3 tiers
MCPs:     Stripe, GitHub
Context:
  identity.md    → "SaaS application developer"
  soul.md        → "Ship fast, iterate, focus on activation metrics"
  knowledge.md   → SaaS domain terms, common patterns
  instructions.md→ Feature-flag architecture, API-first design
  design-system  → Professional dark theme, Inter font
  skills         → /add-pricing, /add-onboarding, /add-team-invite
  memory         → Common SaaS pitfalls pre-loaded
```

#### E-Commerce / Shopify Store
```
Template: ecommerce
─────────────────────────────────
Code:     Product catalog, cart, checkout, order history
Auth:     Email + guest checkout
Database: products, orders, carts, reviews, inventory
Payments: Stripe one-time + Shopify (if store connected)
MCPs:     Stripe, Shopify, Firecrawl (for product import)
Context:
  identity.md    → "E-commerce developer"
  soul.md        → "Conversion-first, fast checkout, trust signals"
  knowledge.md   → E-commerce terminology (SKU, variant, fulfillment)
  instructions.md→ Cart state management, inventory sync
  design-system  → Clean white theme, large product images
  skills         → /add-product, /add-cart, /add-checkout, /add-review
```

#### Content / Blog / CMS
```
Template: content-site
─────────────────────────────────
Code:     Blog layout, article pages, category pages, CMS admin
Auth:     Admin login only
Database: posts, categories, tags, media
MCPs:     Sanity (CMS), Firecrawl (content import)
Context:
  identity.md    → "Content site developer with SEO expertise"
  soul.md        → "SEO-first, fast load times, readability"
  knowledge.md   → Content strategy terms, SEO best practices
  instructions.md→ Markdown rendering, image optimization, meta tags
  design-system  → Readable typography, generous whitespace
  skills         → /add-post, /add-category, /add-search, /add-rss
```

#### Mobile-First App
```
Template: mobile-app
─────────────────────────────────
Code:     Bottom nav, swipe gestures, pull-to-refresh, offline shell
Auth:     Social login (Google + Apple)
Database: users, app_data, push_tokens
MCPs:     GitHub, Firebase (for push notifications)
Context:
  identity.md    → "Mobile-first web developer"
  soul.md        → "Touch-first, 60fps, offline-capable"
  knowledge.md   → Mobile UX patterns, safe areas, gestures
  instructions.md→ PWA manifest, service worker, touch targets
  design-system  → iOS-inspired, rounded corners, bottom sheets
  skills         → /add-push, /add-offline, /convert-pwa
```

#### Internal Tool / Admin Dashboard
```
Template: internal-tool
─────────────────────────────────
Code:     Data tables, forms, filters, charts, CRUD pages
Auth:     SSO / corporate login
Database: Dynamic based on user data model
MCPs:     Linear, Notion, n8n (workflow automation)
Context:
  identity.md    → "Internal tool builder"
  soul.md        → "Functional over beautiful, data density, keyboard-friendly"
  knowledge.md   → Internal tool patterns, admin UX
  instructions.md→ Table virtualization, bulk actions, export
  design-system  → Compact UI, data-dense tables, minimal color
  skills         → /add-table, /add-form, /add-chart, /add-export
```

#### Landing Page / Marketing Site
```
Template: landing-page
─────────────────────────────────
Code:     Hero, features, testimonials, pricing, CTA, footer
Auth:     None (or waitlist email capture)
Database: waitlist_emails (optional)
MCPs:     Firecrawl (competitive research)
Context:
  identity.md    → "Landing page specialist"
  soul.md        → "Conversion-focused, above-the-fold matters, social proof"
  knowledge.md   → Landing page best practices, CRO terminology
  instructions.md→ Animation timing, lazy loading, OG images
  design-system  → Bold hero, gradient accents, large typography
  skills         → /add-hero, /add-testimonials, /add-pricing, /add-waitlist
```

#### AI-Powered App
```
Template: ai-app
─────────────────────────────────
Code:     Chat interface, streaming responses, prompt management
Auth:     Email login
Database: users, conversations, messages, usage
MCPs:     Doable AI, Perplexity, ElevenLabs
Context:
  identity.md    → "AI application developer"
  soul.md        → "Streaming-first, graceful error handling, rate limiting"
  knowledge.md   → LLM concepts, token budgets, prompt engineering
  instructions.md→ Streaming UI patterns, retry logic, usage tracking
  design-system  → Chat-centric, monospace for code, syntax highlighting
  skills         → /add-chat, /add-rag, /add-voice, /add-image-gen
```

#### API / Backend Service
```
Template: api-service
─────────────────────────────────
Code:     Minimal frontend (API docs), edge functions, webhook handlers
Auth:     API key authentication
Database: Custom based on API design
MCPs:     GitHub, Linear
Context:
  identity.md    → "API architect"
  soul.md        → "RESTful conventions, versioning, rate limiting, docs"
  knowledge.md   → REST/GraphQL patterns, HTTP status codes
  instructions.md→ OpenAPI spec generation, error response format
  design-system  → Minimal (API documentation theme)
  skills         → /add-endpoint, /add-webhook, /add-rate-limit, /add-docs
```

### 5.3 Template Provisioning Flow

```
User selects template (e.g., "SaaS Starter")
    │
    ▼
1. Create project with template code scaffold
    │
    ▼
2. Copy all .doable/ context files from template registry
    │
    ▼
3. Pre-configure MCP servers in .doable/mcp.json
    │
    ▼
4. Prompt user to connect required personal MCPs
   (e.g., "Connect your Stripe account" → OAuth flow)
    │
    ▼
5. Run initial database migrations (create starting tables)
    │
    ▼
6. Generate initial build + preview
    │
    ▼
7. Agent greets user with template-specific onboarding:
   "Your SaaS starter is ready! You have a dashboard,
    auth, and Stripe billing. What would you like to
    customize first?"
```

### 5.4 Template Customization

Users can:
- **Start from template, diverge freely** — templates are starting points, not constraints
- **Save any project as a template** (Business+) — including all .doable/ files
- **Share templates in workspace** — team-wide templates for consistent project setup
- **Community templates** — browse and remix templates from the community gallery
- **Edit any context file** — full control over all .doable/ files at any time

### 5.5 Template Registry Architecture

```
┌─────────────────────────────────────────────────┐
│               Template Registry                  │
│                                                  │
│  ┌──────────────────┐  ┌─────────────────────┐  │
│  │  Official         │  │  Community          │  │
│  │  Templates        │  │  Templates          │  │
│  │  (Doable-curated) │  │  (User-submitted)   │  │
│  └────────┬──────────┘  └──────────┬──────────┘  │
│           │                        │             │
│  ┌────────┴────────────────────────┴──────────┐  │
│  │     Template Bundle                        │  │
│  │                                            │  │
│  │  • Code scaffold (compressed)              │  │
│  │  • .doable/ context files                  │  │
│  │  • .doable/mcp.json                        │  │
│  │  • Database migrations                     │  │
│  │  • package.json + dependencies             │  │
│  │  • README.md                               │  │
│  │  • Preview screenshot                      │  │
│  │  • Template metadata (category, tags)      │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────────────┐  ┌─────────────────────┐  │
│  │  Workspace        │  │  Enterprise         │  │
│  │  Templates        │  │  Design Systems     │  │
│  │  (Business+)      │  │  (Enterprise only)  │  │
│  └──────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 6. Context File Lifecycle

### 6.1 Auto-Generation

Some context files are **auto-generated** and kept in sync:

| File | Auto-Generated When | Updated When |
|------|--------------------|----|
| `schema.md` | Database tables created | Any migration runs |
| `plan.md` | Plan Mode used | Plan approved or modified |
| `memory.md` | Agent learns something new | Continuously during usage |
| `api-reference.md` | External API connected | API configuration changes |

### 6.2 User-Editable

All context files are fully editable by the user:
- Via **Project Settings → Context Files** UI
- Via **file tree** in Dev Mode (direct Markdown editing)
- Via **chat**: "Update my instructions to prefer dark mode"
- Via **Plan Mode**: agent can suggest updates to knowledge/instructions

### 6.3 Template vs Custom

| Aspect | Template-Provided | User-Modified |
|--------|-------------------|---------------|
| **Persistence** | Included at creation time | Survives across all edits |
| **Priority** | Base context | User edits override template defaults |
| **Reset** | Can "Reset to template defaults" action | N/A |
| **Sharing** | Shared when project saved as template | Included in template export |

---

## 7. Comparison: Lovable vs OpenClaw vs Doable

| Feature | Lovable.dev | OpenClaw | Doable (Our Vision) |
|---------|------------|----------|---------------------|
| **Context files** | `.lovable/knowledge.md`, `.lovable/plan.md` (2 files) | AGENTS.md, SOUL.md, IDENTITY.md, USER.md, TOOLS.md, BOOT.md, MEMORY.md (7+ files) | 20+ files in `.doable/` with full taxonomy covering both |
| **Session boot** | None | BOOT.md (every session), BOOTSTRAP.md (one-time) | `boot.md` + `bootstrap.md` — same pattern, extended for enterprise system checks |
| **Health checks** | None | HEARTBEAT.md (optional) | `heartbeat.md` — periodic drift detection for enterprise API compatibility |
| **Memory** | None (context resets each message) | MEMORY.md + `memory/YYYY-MM-DD.md` daily logs + semantic search | `memory.md` + `memory/YYYY-MM-DD.md` daily logs + semantic search across history |
| **Tool config** | Built-in tools only | TOOLS.md (guidance/notes) | `tools.md` — extended for enterprise CLI tools, custom APIs, MCP tool notes |
| **Skills** | None | `skills/*/SKILL.md` with YAML frontmatter | `skills/*/SKILL.md` — same pattern, includes enterprise-specific skills |
| **User profile** | None | USER.md (name, addressing) | `user.md` — extended for enterprise role, permissions, module assignments |
| **MCP servers** | Pre-built personal connectors, custom on Business+ | No native MCP | Full MCP support: pre-built + custom + enterprise MCPs per workspace |
| **Templates** | Code-only templates (Business+) | No templates (workspace files are manual) | Full context templates (code + all .doable/ files + MCPs + knowledge + memory) |
| **Agent specialization** | Single agent, 3 modes | Single agent per workspace (multi via bindings) | Custom agents via `agents.md`, specialized skills via `skills/` |
| **Scoped rules** | None | None | `rules/frontend.md`, `rules/backend.md`, `rules/testing.md` with file pattern matching |
| **Design system file** | Via custom knowledge (freeform) | None | Dedicated `design-system.md` with structured format |
| **Architecture docs** | None | None | Auto-maintained `architecture.md` |
| **Enterprise/white-label** | None | Self-hosted (single-tenant) | Full white-label: custom workspaces, role-based access, enterprise API integration (see Section 9) |
| **Module development** | Independent apps only | Independent (agent per workspace) | **Module-on-top-of-enterprise-system** — the core differentiator |

---

## 8. Implementation Priority

| Phase | What | Effort |
|-------|------|--------|
| **P0 — Foundation** | `knowledge.md`, `plan.md`, `instructions.md`, `memory.md`, `user.md` — the 5 essential context files | Medium |
| **P1 — Intelligence** | `identity.md`, `soul.md`, `tools.md`, `design-system.md`, `schema.md` — personality, tools, design awareness | Medium |
| **P1.5 — Session Lifecycle** | `boot.md`, `bootstrap.md`, `heartbeat.md`, `memory/` daily logs — session management and health | Medium |
| **P2 — Power User** | `agents.md`, `skills/*/SKILL.md`, `prompts/`, `rules/` — customization and specialization | High |
| **P3 — Enterprise Workspaces** | White-label instances, enterprise custom workspaces, role-based access, API/MCP pre-config (see Section 9) | **Critical** |
| **P4 — Templates** | Template registry, 8 official templates, provisioning flow, community gallery | High |
| **P5 — MCP** | MCP pre-configuration per template, personal connector OAuth flows, custom MCP support | Medium |
| **P6 — Architecture** | `architecture.md`, `api-reference.md` — auto-generated and maintained | Low |

> **Note**: P3 (Enterprise Workspaces) is flagged as **Critical** because it is Doable's core business differentiator. See Section 9 and PRD 15 for phased delivery.

---

## 9. Enterprise White-Label Workspaces

### 9.1 The Core Business Model

Doable's primary market is **enterprises who white-label Doable so their partners, resellers, and ecosystem developers can build modules on top of existing enterprise systems.**

This is fundamentally different from Lovable's model:

| | Lovable | Doable |
|---|---------|--------|
| **User builds** | Independent standalone apps | Modules attached to an existing enterprise system |
| **Database** | Each user creates own Supabase/third-party DB | Modules connect to the enterprise's existing database/APIs |
| **Context** | Generic — user configures from scratch | Pre-loaded — enterprise admin configures the workspace |
| **Target user** | Individual builders, small teams | Enterprise ecosystem: partners, resellers, integrators |
| **Revenue model** | Per-user SaaS subscription | Enterprise white-label license + per-seat/usage for ecosystem |

**The Problem Doable Solves**: Today, enterprises that want third-party developers to build extensions/modules on their platform must either (a) build an expensive developer portal + SDK from scratch, or (b) let developers use tools like Lovable which create disconnected standalone apps with their own databases — completely separate from the enterprise system. Doable gives enterprises a **pre-configured AI development environment** where every module is automatically connected to and built on top of the enterprise system.

### 9.2 Enterprise Custom Workspace Architecture

An enterprise customer gets a **white-labeled Doable instance** with custom workspaces pre-loaded with everything developers need to build modules on the enterprise system.

```
┌─────────────────────────────────────────────────────────────────┐
│                ACME CORP — White-Labeled Doable                  │
│                (acme.doable.app or devstudio.acme.com)          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              ENTERPRISE ADMIN CONSOLE                      │  │
│  │                                                            │  │
│  │  • Manage custom workspaces                                │  │
│  │  • Configure API access & permissions                      │  │
│  │  • Register internal MCPs, CLI tools, APIs                 │  │
│  │  • Set branding (logo, colors, domain)                     │  │
│  │  • Manage partner/reseller accounts                        │  │
│  │  • Review & approve built modules                          │  │
│  │  • Monitor usage, audit logs, security                     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│          ┌───────────────────┼───────────────────┐               │
│          ▼                   ▼                   ▼               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐      │
│  │ Workspace:   │  │ Workspace:   │  │ Workspace:       │      │
│  │ "Inventory   │  │ "Checkout    │  │ "Warehouse       │      │
│  │  Modules"    │  │  Extensions" │  │  Integrations"   │      │
│  │              │  │              │  │                   │      │
│  │ .doable/     │  │ .doable/     │  │ .doable/         │      │
│  │ ├ identity   │  │ ├ identity   │  │ ├ identity       │      │
│  │ ├ soul       │  │ ├ soul       │  │ ├ soul           │      │
│  │ ├ user       │  │ ├ user       │  │ ├ user           │      │
│  │ ├ knowledge  │  │ ├ knowledge  │  │ ├ knowledge      │      │
│  │ ├ tools      │  │ ├ tools      │  │ ├ tools          │      │
│  │ ├ schema     │  │ ├ schema     │  │ ├ schema         │      │
│  │ ├ api-ref    │  │ ├ api-ref    │  │ ├ api-ref        │      │
│  │ ├ mcp.json   │  │ ├ mcp.json   │  │ ├ mcp.json       │      │
│  │ ├ boot       │  │ ├ boot       │  │ ├ boot           │      │
│  │ ├ rules/     │  │ ├ rules/     │  │ ├ rules/         │      │
│  │ └ skills/    │  │ └ skills/    │  │ └ skills/        │      │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘      │
│         │                  │                    │                │
│         ▼                  ▼                    ▼                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Partner/Reseller Developers                             │   │
│  │  (get assigned to workspaces, build modules)             │   │
│  │                                                          │   │
│  │  Dev A → Inventory Modules → "Stock Alert Dashboard"     │   │
│  │  Dev B → Checkout Extensions → "Gift Card Module"        │   │
│  │  Dev C → Warehouse Integrations → "Shipping Tracker"     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│         All modules connect to:                                  │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ACME CORP ENTERPRISE SYSTEM                              │   │
│  │                                                           │   │
│  │  • Acme REST API (v2) — inventory, orders, users          │   │
│  │  • Acme PostgreSQL — shared database (module schemas)     │   │
│  │  • Acme Auth — SSO, partner tokens, permission scopes     │   │
│  │  • Acme Message Queue — event bus for module integration  │   │
│  │  • acme-cli — deployment, validation, schema sync tools   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 Enterprise Custom Workspace — `.doable/` Contents

When an enterprise admin creates a custom workspace, they pre-configure all context files so that crowdsourced developers can **immediately start building modules without understanding the full enterprise system**.

#### Example: Acme Corp "Inventory Modules" Workspace

```
.doable/
├── identity.md          # "You are an Acme Inventory Module Developer..."
├── soul.md              # "Build reliable, Acme-compliant inventory extensions..."
├── user.md              # Populated per-developer: name, role, permissions, assigned modules
├── knowledge.md         # Acme's inventory domain: SKUs, warehouses, stock levels, reorder points...
├── plan.md              # (per-project — managed by individual developer)
├── instructions.md      # Acme coding standards: TypeScript strict, Acme component library, API patterns
├── agents.md            # Acme-specific agents: "Module Validator", "API Contract Checker"
├── tools.md             # acme-cli commands, Acme API endpoints, rate limits, conventions
├── boot.md              # "Verify Acme API connectivity, pull latest schema, check permissions"
├── bootstrap.md         # "First-time: pull Acme types, generate API client, scaffold module structure"
├── heartbeat.md         # "Every 10 interactions: check API version compat, schema drift"
├── memory.md            # (per-project — managed by agent)
├── design-system.md     # Acme's UI kit: colors, fonts, component library, spacing rules
├── api-reference.md     # Full Acme API documentation — auto-synced from Acme's OpenAPI spec
├── schema.md            # Acme's shared database schema — tables this module can read/write
├── architecture.md      # Acme's module architecture: how modules plug into the core system
├── mcp.json             # Pre-configured MCPs:
│                        #   - acme-inventory-api (MCP wrapping Acme's Inventory REST API)
│                        #   - acme-auth (MCP for SSO/token management)
│                        #   - acme-db (MCP for direct database access with scoped permissions)
│                        #   - acme-events (MCP for publishing/subscribing to Acme event bus)
├── memory/              # Daily logs (per-project)
├── skills/
│   ├── acme-module-scaffold/
│   │   └── SKILL.md     # Create new module matching Acme's conventions
│   ├── acme-validate/
│   │   └── SKILL.md     # Run Acme's module validation suite
│   ├── acme-deploy-staging/
│   │   └── SKILL.md     # Deploy module to Acme's staging environment
│   ├── acme-sync-schema/
│   │   └── SKILL.md     # Pull latest schema from Acme core
│   └── add-inventory-widget/
│       └── SKILL.md     # Add pre-built Acme inventory UI widget
├── prompts/
│   ├── new-inventory-report.md
│   ├── add-stock-alert.md
│   └── integrate-warehouse-api.md
└── rules/
    ├── acme-api.md       # "All API calls must use acme-sdk client, never raw fetch"
    ├── acme-security.md  # "Never expose partner tokens in frontend code"
    └── acme-compat.md    # "Modules must support Acme API v2.x — do not use deprecated v1 endpoints"
```

### 9.4 Enterprise Custom MCPs

Enterprise customers register their internal services as MCP servers, making them available to all developers in the workspace:

```json
{
  "mcpServers": {
    "acme-inventory-api": {
      "type": "enterprise",
      "provider": "acme-internal",
      "transport": "sse",
      "url": "https://mcp.internal.acme.com/inventory",
      "description": "Acme Inventory API — query stock, update quantities, manage warehouses",
      "scopes": ["inventory:read", "inventory:write", "warehouse:read"],
      "rateLimit": "100/min",
      "authMethod": "partner-token"
    },
    "acme-auth": {
      "type": "enterprise",
      "provider": "acme-internal",
      "transport": "sse",
      "url": "https://mcp.internal.acme.com/auth",
      "description": "Acme SSO — validate tokens, check permissions, get user profiles",
      "scopes": ["auth:validate", "users:read"],
      "authMethod": "service-account"
    },
    "acme-db": {
      "type": "enterprise",
      "provider": "acme-internal",
      "transport": "sse",
      "url": "https://mcp.internal.acme.com/database",
      "description": "Scoped database access — read/write to module-owned tables only",
      "scopes": ["db:module-tables"],
      "authMethod": "partner-token"
    },
    "acme-events": {
      "type": "enterprise",
      "provider": "acme-internal",
      "transport": "sse",
      "url": "https://mcp.internal.acme.com/events",
      "description": "Acme Event Bus — publish/subscribe to system events",
      "scopes": ["events:publish", "events:subscribe"],
      "authMethod": "service-account"
    },
    "acme-cli": {
      "type": "enterprise",
      "provider": "acme-internal",
      "transport": "stdio",
      "command": "acme-cli",
      "args": ["--partner-mode"],
      "description": "Acme CLI — deploy, validate, sync-schema, run-tests",
      "installUri": "https://dev.acme.com/cli/install"
    }
  }
}
```

### 9.5 Enterprise CLI Tools

Enterprises can register CLI tools that developers use within Doable:

| CLI Tool | Purpose | How Agent Uses It |
|----------|---------|-------------------|
| `acme-cli deploy` | Deploy module to Acme staging/prod | Agent runs after build passes validation |
| `acme-cli validate` | Validate module against Acme's API contract | Agent runs before every deployment suggestion |
| `acme-cli sync-schema` | Pull latest schema from Acme core DB | Agent runs at session start (via `boot.md`) |
| `acme-cli test` | Run Acme's integration test suite | Agent runs after code changes |
| `acme-cli lint` | Lint module against Acme coding standards | Agent runs with code generation |

These are documented in `tools.md` and invoked by the agent as regular tool calls.

### 9.6 Developer Onboarding Flow (Enterprise)

```
Enterprise admin invites partner developer
    │
    ▼
Developer receives invite: "Build modules on Acme's platform"
    │
    ▼
Developer signs up → lands in Acme's white-labeled Doable
    │
    ▼
Assigned to workspace (e.g., "Inventory Modules")
    │
    ▼
Creates new project → bootstrap.md runs automatically:
  1. Pulls Acme's type definitions from OpenAPI spec
  2. Generates typed API client
  3. Scaffolds module structure matching Acme conventions
  4. Configures MCP connections with partner credentials
  5. Validates API connectivity
  6. Bootstrap complete → self-deletes
    │
    ▼
Agent greets developer:
  "Welcome to Acme Inventory Modules! You're set up to build
   inventory extensions on Acme's platform. Your API client is
   ready, and you can access 3 Acme APIs: Inventory, Auth, and
   Events. What module would you like to build?"
    │
    ▼
Developer starts building with natural language:
  "Create a stock alert dashboard that shows low-inventory items
   and lets warehouse managers set custom alert thresholds"
    │
    ▼
Agent builds module ON TOP of Acme's existing system:
  - Uses Acme's Inventory API (not a new database)
  - Uses Acme's Auth (not separate auth)
  - Follows Acme's UI kit (from design-system.md)
  - Deploys to Acme's staging (via acme-cli)
```

### 9.7 Enterprise Workspace Hierarchy

```
Enterprise (Acme Corp)
├── Admin Console (manage workspaces, users, APIs, billing)
├── Workspace: "Inventory Modules"
│   ├── .doable/ (enterprise-configured context files)
│   ├── Project: "Stock Alert Dashboard" (Dev A)
│   ├── Project: "Reorder Automation" (Dev B)
│   └── Project: "Inventory Analytics" (Dev C)
├── Workspace: "Checkout Extensions"
│   ├── .doable/ (different context files, different APIs)
│   ├── Project: "Gift Card Module" (Dev D)
│   └── Project: "Loyalty Points Module" (Dev E)
├── Workspace: "Warehouse Integrations"
│   ├── .doable/ (warehouse-specific APIs and schema)
│   └── Project: "Shipping Tracker" (Dev F)
└── Shared Context (inherited by all workspaces)
    ├── Acme API reference (global)
    ├── Acme design system (global)
    ├── Acme security rules (global)
    └── Acme coding standards (global)
```

Context inheritance:
- **Enterprise-level** → Shared context (API ref, design system, security rules) inherited by all workspaces
- **Workspace-level** → Workspace-specific `.doable/` files (domain knowledge, specific APIs, skills)
- **Project-level** → Individual project's `plan.md`, `memory.md`, `memory/` logs
- Lower levels can override higher levels (project instructions override workspace instructions)

### 9.8 White-Label Configuration

Enterprise customers configure their Doable instance:

| Setting | Example | Purpose |
|---------|---------|---------|
| **Custom domain** | `devstudio.acme.com` | Brand the platform |
| **Logo & colors** | Acme's logo, blue theme | Visual identity |
| **Landing page** | Custom onboarding page | First impression for partner devs |
| **SSO integration** | Acme's SAML/OIDC IdP | Single sign-on for partner devs |
| **Allowed MCPs** | Only Acme-approved MCPs | Security boundary |
| **Deployment targets** | Only Acme staging + Acme prod | Controlled deployments |
| **Module templates** | Acme's custom starter templates | Standardized module structure |
| **Review workflow** | Module review → admin approval → deploy | Quality gate |
| **Billing model** | Per-seat, per-usage, or unlimited (enterprise decides) | Flexible pricing |
| **API rate limits** | Custom limits per developer tier | Resource control |

### 9.9 Module Lifecycle in Enterprise Context

```
1. DEVELOP    Developer builds module using Doable AI
                → All code connects to enterprise APIs (not standalone DB)
                → Agent enforces enterprise rules (from rules/, instructions.md)
                          │
2. VALIDATE   acme-cli validate runs automatically
                → Checks API contract compliance
                → Checks security rules
                → Checks bundle size limits
                          │
3. REVIEW     Module submitted for enterprise admin review
                → Admin sees code, preview, validation results
                → Can request changes or approve
                          │
4. STAGE      acme-cli deploy --staging
                → Module deployed to enterprise staging env
                → Integration tests run against real (staging) data
                          │
5. APPROVE    Admin approves for production
                → Final security scan
                → Performance benchmarks
                          │
6. DEPLOY     acme-cli deploy --production
                → Module live in enterprise system
                → Monitoring and analytics active
                          │
7. MAINTAIN   Developer iterates based on feedback
                → Agent remembers via memory.md and memory/ logs
                → Enterprise admin can revoke/disable module
```

### 9.10 Enterprise vs Standard Doable Comparison

| Aspect | Standard Doable | Enterprise White-Label |
|--------|----------------|----------------------|
| **Who uses it** | Individual developers, small teams | Enterprise ecosystem: partners, resellers, integrators |
| **What gets built** | Independent standalone apps | Modules on top of enterprise system |
| **Database** | User's choice (Supabase, D1, etc.) | Enterprise's existing database (via MCPs/APIs) |
| **Auth** | Per-app auth (user configures) | Enterprise SSO (pre-configured) |
| **Deployment** | `*.doable.app` or third-party hosting | Enterprise's deployment pipeline (via CLI) |
| **Context files** | User configures from scratch (or template) | Enterprise admin pre-configures workspace |
| **MCPs** | User connects their own | Enterprise MCPs pre-registered in workspace |
| **Quality gates** | None (user deploys freely) | Validation → review → approval → deploy pipeline |
| **Billing** | Per-user Doable subscription | Enterprise license (enterprise controls partner billing) |
| **Branding** | Doable brand | Enterprise's brand (white-labeled) |
