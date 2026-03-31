# 15 — Development Phases: MVP to Enterprise Platform

## Overview

Doable's development is phased to deliver **user-onboardable value at every milestone** while building toward the core differentiator: **enterprise white-label workspaces where ecosystem developers build modules on top of existing enterprise systems**.

Each phase is designed so that:
1. **Each phase ships a usable product** — not just infrastructure
2. **Revenue can start flowing** from Phase 1 (individual users) and scale in Phase 3 (enterprise)
3. **The context system (PRD 14) is foundational** — built early because everything depends on it
4. **Enterprise features layer on top** of the standard product, not replace it

---

## Phase Map

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
Foundation   MVP         Growth      Enterprise   Scale       Ecosystem
(internal)   (public)    (retention) (core biz)   (expand)    (network)
```

---

## Phase 0 — Foundation (Internal Only)

**Goal**: Core infrastructure that everything else depends on. Not user-facing.

### 0.1 Platform Infrastructure
- [ ] PostgreSQL database setup (users, projects, workspaces, sessions)
- [ ] Auth service (email/password, GitHub OAuth)
- [ ] Redis for sessions and caching
- [ ] Basic API server (Node.js/Express or Hono)
- [ ] WebSocket service for real-time preview updates
- [ ] GitHub integration (create repos, commit, push, pull)

### 0.2 AI Agent Core
- [ ] Copilot SDK integration — model inference, tool calling, streaming
- [ ] Basic tool set: `create_file`, `edit_file`, `delete_file`, `read_file`, `list_files`
- [ ] Build tool: `run_build` (Vite production build)
- [ ] Agent execution loop: prompt → plan → execute tools → return result
- [ ] Session management: multi-turn conversations with context carry

### 0.3 Build Pipeline
- [ ] Vite project scaffold generator (React + TypeScript + Tailwind + shadcn/ui)
- [ ] In-browser build + hot reload (WebContainer or server-side build)
- [ ] Preview iframe with live updates
- [ ] Build error detection and reporting

### 0.4 Hosting — Doable Cloud (Default)
- [ ] Nginx/Caddy configuration for `*.doable.app` wildcard
- [ ] Let's Encrypt wildcard SSL certificate
- [ ] Per-project static file directories
- [ ] Publish flow: build output → copy to `/sites/[project]/`
- [ ] Auto-provision `[project-name].doable.app` subdomain

### 0.5 Multi-User Safety (CRITICAL — PRD 17)

> These are security and resource management requirements that MUST be in place before any public users. See [PRD 17](17-multi-user-infrastructure.md) for full specification.

- [ ] **Workspace authorization middleware** — every route that accesses a workspace-scoped resource (project, folder, session, deployment, analytics) verifies the authenticated user is a member of the owning workspace. Returns 403 otherwise.
- [ ] **Per-user AI session isolation** — AI sessions keyed by `projectId + userId + mode` (not just projectId). Two users on the same project get independent conversations, tool states, and history.
- [ ] **Dev server lifecycle management** — idle timeout (default 15 min), LRU eviction when approaching memory/port limits, configurable `MAX_DEV_SERVERS` cap, orphan detection on API restart.
- [ ] **Deploy mutex per project** — only one build/deploy runs per project at a time. Concurrent requests queued with UI feedback.
- [ ] **Atomic file writes** — write to temp file then rename to prevent partial writes/corruption.
- [ ] **Database query workspace filtering** — all `findById()` queries accept and filter by `workspaceId` as defense-in-depth.
- [ ] **Atomic subdomain generation** — use `INSERT ... ON CONFLICT` to prevent race conditions on subdomain claiming.
- [ ] **Global build concurrency limiter** — max 3 concurrent Vite builds across all projects (configurable).

### Deliverable
Internal development environment where a developer can chat with AI, generate a React app, preview it, and publish to `*.doable.app`. **Safe for multiple concurrent users** with proper isolation.

### Success Criteria
- AI generates a working React/TypeScript/Tailwind app from a prompt
- Preview renders correctly within 30 seconds
- Publish to `*.doable.app` works with zero config
- Multi-turn conversation maintains context
- Two users on the same project have independent AI sessions
- User A cannot access User B's project in a different workspace
- 50 concurrent projects run without exhausting server resources

---

## Phase 1 — MVP (Public Launch)

**Goal**: A Lovable-equivalent that individual users can sign up and build apps with. **This is the onboarding phase** — acquire users, prove the core loop works.

### 1.1 Editor UI
- [ ] Chat panel (left) + Code/Preview (right) split layout
- [ ] Chat with streaming AI responses
- [ ] File tree (read-only initially, then editable)
- [ ] Code editor with syntax highlighting (Monaco or CodeMirror)
- [ ] Preview panel with live hot-reload
- [ ] Responsive layout (desktop-first, tablet-aware)

### 1.2 Context System — Foundation (PRD 14 P0+P1)
- [ ] `.doable/` directory created with every project
- [ ] `knowledge.md` — user-editable project context (auto-injected into every prompt)
- [ ] `plan.md` — Plan Mode creates and updates this file
- [ ] `instructions.md` — coding rules (injected into every prompt)
- [ ] `memory.md` — agent writes learned facts, persists across sessions
- [ ] `identity.md` — agent persona per project
- [ ] `soul.md` — agent behavior/values per project
- [ ] `user.md` — current developer profile
- [ ] Context injection system: reads `.doable/` files → injects into Copilot SDK prompts
- [ ] UI: Context Files panel in project settings (view/edit all `.doable/` files)

### 1.3 AI Modes
- [ ] **Agent Mode** (default): autonomous code generation with tool calling
- [ ] **Plan Mode**: structured planning → user approval → execution
- [ ] **Chat Mode**: conversational Q&A without code changes
- [ ] Mode switching in chat UI

### 1.4 Project Management
- [ ] Dashboard: list projects, create new, delete, search
- [ ] Project creation: blank or from prompt ("Build me a...")
- [ ] Basic templates: 3 starters (blank, SaaS dashboard, landing page)
- [ ] GitHub sync: push project to user's GitHub (optional)

### 1.5 One-Click Publish
- [ ] "Publish" button → Vite build → deploy to `[project].doable.app`
- [ ] Build log visible in UI
- [ ] Published URL displayed after deploy
- [ ] Re-publish on subsequent clicks (overwrites)

### 1.6 Auth & Billing (Basic)
- [ ] User registration and login (email + GitHub)
- [ ] Free tier: 3 projects, limited AI messages/day
- [ ] Pro tier ($20/mo): unlimited projects, more AI messages, custom domains
- [ ] Stripe integration for subscription billing
- [ ] Credit/usage tracking

### 1.6b AI Usage Tracking — Foundation (PRD 20)
- [ ] **Token extraction from providers** — extract prompt/completion token counts from Copilot SDK and Anthropic responses ([PRD 20 Section 1](20-usage-token-cost-tracking.md))
- [ ] **`ai_usage_log` table** — per-request logging of tokens, cost, model, duration
- [ ] **`model_pricing` table** — model-to-cost mapping managed by platform admin
- [ ] **Credit consumption wiring** — call `consumeCredits()` from chat route with actual token metadata
- [ ] **Per-message usage display** — show token count and cost in chat message footer
- [ ] **SSE done event enrichment** — include usage metrics in the done event payload

### 1.7 Version History (Basic)
- [ ] Every AI edit creates a version checkpoint
- [ ] Version list in sidebar (timestamp + description)
- [ ] Rollback to any previous version

### 1.8 Multi-User Hardening (PRD 17)
- [ ] **Per-user rate limiting** — rate limits keyed by `userId` not IP. Plan-based limits (Free: 10 AI msgs/min, Pro: 30, Business: 60).
- [ ] **WebSocket file change notifications** — when AI or a user modifies a file, broadcast to all users viewing that project so their editors refresh.
- [ ] **Build concurrency queue** — in-memory semaphore limiting concurrent Vite builds across all projects.
- [ ] **Credit pre-flight checks** — verify credits available before starting expensive AI operations, deduct on completion.

### Deliverable
Public product where anyone can sign up, describe an app, watch it get built, edit it, and publish it to `*.doable.app`. Equivalent to Lovable's core experience. **Supports multiple concurrent users safely.**

### Success Criteria
- User can go from signup to published app in < 5 minutes
- Context files visibly improve AI quality vs no context
- 3 basic templates work end-to-end
- Billing functional (free tier + paid conversion)
- GitHub sync works for connected accounts
- 10+ concurrent users operate without interference or data leaks
- Per-user rate limits prevent abuse

### Revenue
- Individual Pro subscriptions ($20/mo)
- Usage-based AI credits (overage billing)

---

## Phase 2 — Growth (Retention & Power Users)

**Goal**: Keep users coming back. Add the features that make Doable sticky: visual editing, richer context, external integrations, team features.

### 2.1 Visual Editor
- [ ] Click-to-select elements in preview
- [ ] Property panel: edit text, colors, spacing, layout via UI
- [ ] Bidirectional sync: visual changes ↔ code changes
- [ ] Drag-and-drop component reordering
- [ ] AST-level mutations (not string replacement)

### 2.2 Context System — Advanced (PRD 14 P1.5+P2)
- [ ] `tools.md` — document available tools and custom tool configs
- [ ] `boot.md` — session startup checklist
- [ ] `bootstrap.md` — one-time project setup (self-deleting)
- [ ] `heartbeat.md` — periodic health checks
- [ ] `memory/` — daily memory logs (`memory/YYYY-MM-DD.md`)
- [ ] `design-system.md` — structured visual design rules
- [ ] `schema.md` — auto-generated database schema docs
- [ ] `agents.md` — custom specialized agent definitions
- [ ] `skills/*/SKILL.md` — per-skill structured definitions
- [ ] `prompts/` — reusable prompt templates
- [ ] `rules/` — scoped rules by file type (frontend, backend, testing, security)
- [ ] Semantic search across `memory/` daily logs
- [ ] Context injection improvements: conditional loading based on task type

### 2.3 Backend Integration (User-Choice)
- [ ] Supabase connector: database, auth, storage, edge functions
- [ ] AI generates Supabase integration code from prompts
- [ ] Schema designer UI → generates migration SQL
- [ ] Connection UI: "Connect your backend" → pick provider → enter credentials
- [ ] Additional connectors: Firebase, Neon, PlanetScale (based on demand)

### 2.4 MCP Support
- [ ] MCP configuration UI in project settings
- [ ] Pre-built shared connectors: Stripe, GitHub (beyond basic sync)
- [ ] Pre-built personal connectors: Notion, Linear
- [ ] Custom MCP server support (SSE/STDIO) — Business tier
- [ ] MCP tool discovery and invocation by the AI agent

### 2.5 Deployment — Provider-Agnostic (Doable Deploy Adapter)
- [ ] Deploy Adapter interface: `deploy(buildOutput, config) → DeployResult`
- [ ] Adapter: Vercel (Vercel API)
- [ ] Adapter: Netlify (Netlify API)
- [ ] Adapter: Cloudflare Pages (Wrangler API)
- [ ] Deploy target selection in publish UI
- [ ] Custom domains via Lexicon (Pro+)

### 2.6 Team Features (Basic)
- [ ] Workspaces: team/org container for projects
- [ ] Invite team members (email invite)
- [ ] Role-based access: Owner, Admin, Member, Viewer
- [ ] Team billing (per-seat pricing for Team tier)

### 2.7 Real-Time Collaborative Editing (PRD 17 Section 6) — CRITICAL FOR BUSINESS

> **Elevated from Phase 4 to Phase 2.** Businesses paying for team plans expect real-time collaboration. This is a core retention feature, not a nice-to-have.

- [ ] **Yjs CRDT integration** — conflict-free real-time document sync via Yjs
- [ ] **y-monaco binding** — multi-cursor editing in Monaco Editor with per-user undo/redo
- [ ] **y-websocket provider** — WebSocket transport for Yjs document sync and awareness
- [ ] **Presence system** — see who's online (avatar, name, color), which file they're editing, cursor position
- [ ] **AI activity indicators** — show when another user's AI session is generating code
- [ ] **File change broadcasts** — instant notification when AI or another user modifies files
- [ ] **Shared live preview** — all collaborators see the same preview, updated in real-time
- [ ] **Collaboration-aware file tree** — icons showing which files other users have open
- [ ] **Reconnection handling** — automatic resync when a user disconnects and reconnects
- [ ] **Server-side Yjs persistence** — Yjs document state persisted to filesystem on debounce

### 2.8 Multi-User Infrastructure Upgrades (PRD 17)
- [ ] **PostgreSQL Row-Level Security** — enable RLS on all tenant-scoped tables as defense-in-depth
- [ ] **Optimistic file concurrency** — file operations include `expectedVersion` to reject stale writes
- [ ] **Redis-based session storage** — move AI sessions and rate limit counters from in-memory to Redis
- [ ] **Redis-based rate limiting** — sliding window counters in Redis, shared across API instances
- [ ] **WebSocket room architecture** — per-project rooms with presence, file changes, and notifications
- [ ] **Per-member credit limits** — admins set max daily/monthly credits per workspace member
- [ ] **Credit usage dashboard** — per-user credit consumption visibility for workspace admins

### 2.8b Usage Dashboards — User & Project (PRD 20)
- [ ] **Daily aggregation table** — `ai_usage_daily` with automated rollup from `ai_usage_log` ([PRD 20 Section 2](20-usage-token-cost-tracking.md))
- [ ] **My Usage page** — user-facing dashboard showing personal token consumption, cost, and credit gauge
- [ ] **Per-project usage tab** — usage breakdown in Project Settings showing member contributions, mode split, and trend chart
- [ ] **Usage API routes** — `/usage/me`, `/usage/me/history`, `/usage/me/breakdown` endpoints

### 2.9 Template System
- [ ] Template registry (official templates stored in PostgreSQL)
- [ ] 8 official templates: SaaS, e-commerce, content/CMS, mobile-first, internal tool, landing page, AI app, API service
- [ ] Template provisioning: code scaffold + `.doable/` context files + MCP config
- [ ] Template-specific onboarding (agent greets with template context)
- [ ] "Save as template" (Business+)

### Deliverable
Full-featured app builder with visual editing, **real-time multi-user collaboration**, backend integrations, team collaboration, and a rich template library. Users stay because the AI is smarter (context system), the UX is richer (visual editor), and **teams can work together in real-time** on the same project.

### Success Criteria
- Visual editing works for 80% of common UI changes
- Context system measurably improves AI output quality
- Supabase integration end-to-end (DB + auth + storage)
- Templates reduce time-to-first-preview by 50%
- Team features support 5+ member teams
- **Real-time multi-cursor editing works with < 100ms keystroke propagation latency**
- **Presence system shows online users with < 500ms update latency**
- **25 concurrent editors per project without degradation**
- **50+ concurrent users across the platform with proper isolation and no resource exhaustion**

### Revenue
- Team tier ($50/seat/mo)
- Business tier ($100/seat/mo) — custom MCPs, save-as-template, **full real-time collaboration**
- Increased Pro retention from visual editor + templates

---

## Phase 3 — Enterprise (Core Business Differentiator)

**Goal**: Launch the white-label enterprise product. This is where Doable diverges from Lovable and becomes a **platform for platforms** — enterprises use Doable to let their ecosystem build on top of their systems.

> **This is Doable's primary revenue driver.** Phases 0-2 build the foundation and prove the product. Phase 3 is why Doable exists.

### 3.0 Multi-User Enterprise Hardening (PRD 17)
- [ ] **Shared AI chat** — team members see and contribute to the same AI conversation on a project
- [ ] **Optional file-level locks** — prevent concurrent edits to a file (enterprise feature)
- [ ] **Inline code comments** — leave comments on specific lines/selections for team review
- [ ] **Connection-level DB context** — set `SET LOCAL app.current_workspace_id` per request for RLS
- [ ] **Enterprise audit trail** — log every cross-boundary access attempt (successful or denied)
- [ ] **Per-workspace resource quotas** — max dev servers, max concurrent AI sessions, max storage per workspace

### 3.0b Workspace & Platform Admin Usage Dashboards (PRD 20)
- [ ] **Workspace admin usage dashboard** — per-member usage breakdown, per-project cost attribution, model distribution chart ([PRD 20 Section 5](20-usage-token-cost-tracking.md))
- [ ] **Per-member budget controls** — workspace admins set daily/monthly credit caps per member with hard/soft limits
- [ ] **Usage alerts** — in-app notifications when members hit 80%/100% of budget, cost spike detection
- [ ] **Platform admin usage dashboard** — system-wide token/cost/request metrics, workspace and user rankings, model cost breakdown ([PRD 20 Section 6](20-usage-token-cost-tracking.md))
- [ ] **Model pricing management** — platform admin UI to manage per-model token costs
- [ ] **Usage export** — CSV/JSON export for workspace admins and platform admins
- [ ] **Monthly aggregation table** — `ai_usage_monthly` for billing period summaries
- [ ] **Platform controls** — cost ceiling kill switch, per-workspace/user AI suspend, model disable

### 3.1 Enterprise Admin Console
- [ ] White-label configuration: custom domain, logo, colors, landing page
- [ ] Enterprise SSO integration (SAML, OIDC)
- [ ] Admin dashboard: manage workspaces, users, APIs, usage, billing
- [ ] Partner/developer account management (invite, assign workspace, set permissions)
- [ ] API key management: enterprise-level and per-partner keys
- [ ] Audit log: every action logged (who, what, when)

### 3.2 Enterprise Custom Workspaces
- [ ] Enterprise admin creates workspaces (e.g., "Inventory Modules")
- [ ] Pre-configure ALL `.doable/` context files per workspace:
  - `identity.md` — agent persona for this module domain
  - `soul.md` — enterprise behavior/compliance rules
  - `user.md` — auto-populated per developer (role, permissions, assignments)
  - `knowledge.md` — domain knowledge for this module area
  - `instructions.md` — enterprise coding standards
  - `tools.md` — enterprise CLI tools, API endpoints, conventions
  - `api-reference.md` — enterprise API documentation (auto-synced from OpenAPI spec)
  - `schema.md` — enterprise database schema (scoped to module's tables)
  - `architecture.md` — how modules integrate with the core system
  - `design-system.md` — enterprise UI kit
  - `boot.md` — "verify API connectivity, pull latest schema, check permissions"
  - `bootstrap.md` — one-time setup for new projects in this workspace
  - `heartbeat.md` — periodic compatibility checks
  - `rules/` — enterprise-specific rules (API compliance, security, compatibility)
  - `skills/` — enterprise-specific skills (module scaffold, validate, deploy)
- [ ] Context inheritance: enterprise-level → workspace-level → project-level
- [ ] Workspace-level MCP pre-configuration (enterprise MCPs)

### 3.3 Enterprise MCP Registration
- [ ] Enterprise admin registers internal services as MCP servers
- [ ] MCP types: `enterprise` (managed by admin, available to all workspace developers)
- [ ] Support for enterprise SSE and STDIO MCPs
- [ ] Scoped permissions per MCP (read-only vs read-write per resource)
- [ ] MCP health monitoring dashboard

### 3.4 Enterprise CLI Integration
- [ ] Enterprise admin registers CLI tools (e.g., `acme-cli`)
- [ ] CLI commands available as agent tools
- [ ] CLI tool documentation in `tools.md`
- [ ] CLI-driven deployment pipeline (deploy to enterprise staging/prod)
- [ ] CLI validation runs automatically before deployment suggestions

### 3.5 Module Lifecycle
- [ ] Module submission: developer submits completed module for review
- [ ] Admin review UI: code diff, preview, validation results, security scan
- [ ] Approval workflow: request changes → fix → re-submit → approve
- [ ] Staging deployment: `acme-cli deploy --staging`
- [ ] Production deployment: admin approval → `acme-cli deploy --production`
- [ ] Module monitoring: usage, errors, performance
- [ ] Module disable/revoke by admin

### 3.6 Enterprise Developer Onboarding
- [ ] Invite flow: enterprise admin invites partner developer by email
- [ ] Developer lands in white-labeled Doable (enterprise branding)
- [ ] Auto-assigned to workspace(s) based on invitation
- [ ] First project triggers `bootstrap.md`: pull types, generate API client, scaffold module
- [ ] Agent greets developer with enterprise-specific onboarding message
- [ ] Developer immediately starts building modules (zero config on their part)

### 3.7 Enterprise Billing
- [ ] Enterprise license pricing (custom per enterprise deal)
- [ ] Per-seat pricing option (enterprise controls partner billing)
- [ ] Usage-based pricing option (per AI message, per build, per deployment)
- [ ] Enterprise pays Doable; enterprise decides how/whether to bill partners
- [ ] Usage dashboards for enterprise admin

### Deliverable
Enterprise customers can white-label Doable, configure custom workspaces with their APIs/schemas/tools, invite ecosystem developers, and have modules built on top of their systems — all via an AI-powered development environment.

### Success Criteria
- Enterprise can go from contract signing to first developer building in < 1 week
- Partner developer creates first module in < 30 minutes (thanks to pre-configured context)
- Module validation catches 90% of API contract violations before human review
- Enterprise admin has full visibility into what's being built
- White-label branding is indistinguishable from a custom-built tool

### Revenue
- Enterprise license: $X,000-$XX,000/month per enterprise
- Per-seat fees: $50-200/seat/month for partner developers
- Usage tiers: based on AI messages, builds, deployments
- Custom pricing for large enterprise deals

---

## Phase 4 — Scale (Expand Capabilities)

**Goal**: Deepen the platform. More hosting providers, more backend options, more AI capabilities, mobile/native support. Make both individual AND enterprise users more powerful.

### 4.1 Hosting — Full Provider Ecosystem
- [ ] Deploy Adapters for: AWS S3+CloudFront, GitHub Pages, Firebase Hosting, Render, DigitalOcean App Platform, Azure Static Web Apps, Fly.io, Surge.sh, Custom SSH/SFTP
- [ ] One-click switch between hosting providers
- [ ] Staging/production environments per provider
- [ ] Deploy preview for pull requests

### 4.2 Advanced AI Capabilities
- [ ] Image-to-code: upload screenshot or mockup → generate matching UI
- [ ] Figma import: import Figma designs → generate pixel-perfect components
- [ ] Multi-model routing: auto-select best model for task type
- [ ] Agent memory search: semantic search across all `memory/` daily logs
- [ ] Agent self-improvement: agent suggests updates to `instructions.md` based on patterns
- [ ] Parallel tool execution: agent runs multiple tools simultaneously

### 4.3 Mobile / Native App Path
- [ ] PWA generation: service worker, manifest, offline support
- [ ] Capacitor integration: wrap web app → native iOS/Android
- [ ] Capacitor plugins: camera, push notifications, biometrics
- [ ] App Store metadata generation: screenshots, descriptions, keywords
- [ ] Mobile preview: device frames in preview panel

### 4.4 Advanced Collaboration
> Note: CRDT-based real-time editing, presence, shared AI chat, and comments have been **moved to Phase 2-3** (see PRD 17). The items below are Phase 4 extensions.

- [ ] Suggested changes (propose edits for team review, like GitHub PR suggestions)
- [ ] Git branching: feature branches per team member
- [ ] Pull request workflow within Doable
- [ ] Branch-based preview environments (preview per branch)
- [ ] Merge conflict resolution UI within the editor

### 4.5 Analytics & Security
- [ ] Built-in analytics: pageviews, events, user flows (for apps users build)
- [ ] Security scanning: dependency vulnerabilities, secret detection
- [ ] Performance auditing: Lighthouse integration
- [ ] Accessibility auditing: aXe integration

### 4.6 Enterprise Enhancements
- [ ] Multi-enterprise management (Doable manages multiple enterprise accounts)
- [ ] Enterprise template marketplace (enterprise shares templates with partners)
- [ ] Cross-module dependency tracking (module A depends on module B)
- [ ] Enterprise API versioning support (modules track which API version they target)
- [ ] Automated regression testing when enterprise API updates

### Deliverable
Comprehensive platform covering hosting, mobile, collaboration, security, and advanced enterprise features. Competitors can't easily replicate the depth.

### Success Criteria
- 10+ hosting providers supported
- Mobile app generation works end-to-end
- Real-time collaboration with < 200ms latency
- Enterprise API version upgrades flagged automatically

---

## Phase 5 — Ecosystem (Network Effects)

**Goal**: Build a self-sustaining ecosystem. Community templates, module marketplace, partner program, and open-source contributions create network effects.

### 5.1 Community Template Gallery
- [ ] Public template gallery: browse, search, filter
- [ ] Template ratings and reviews
- [ ] Template usage statistics
- [ ] "Remix" any public project/template
- [ ] Template creator profiles

### 5.2 Enterprise Module Marketplace
- [ ] Enterprise customers publish approved modules to a marketplace
- [ ] Other enterprises with similar needs can discover and install modules
- [ ] Module pricing: free, one-time, subscription (enterprise decides)
- [ ] Module ratings, reviews, compatibility tags
- [ ] Revenue sharing: module developer ↔ enterprise ↔ Doable

### 5.3 Partner Program
- [ ] Development agency partner program: agencies use Doable to build for clients
- [ ] Certified developer program: verified Doable/enterprise-skilled developers
- [ ] Partner portal: deal registration, commissions, co-marketing
- [ ] Enterprise referral program: partners refer enterprises to Doable

### 5.4 Plugin / Extension System
- [ ] Plugin API: third-party developers extend Doable itself
- [ ] Custom tools: register new tools the AI agent can use
- [ ] Custom UI panels: add panels to the editor
- [ ] Plugin marketplace

### 5.5 Open Source Components
- [ ] Open-source the Doable Deploy Adapter library
- [ ] Open-source the context file specification (`.doable/` format)
- [ ] Open-source starter templates
- [ ] Community contributions to official templates

### Deliverable
Self-sustaining ecosystem where templates, modules, and partnerships drive growth without linear effort from the Doable team.

### Success Criteria
- 100+ community templates
- 5+ enterprise module marketplace listings
- Partner agencies building on Doable
- Open-source components adopted by other tools

---

## Phase Timeline & Dependencies

```
Phase 0 ─── Foundation ──────────────────┐
  │                                       │
  ▼                                       │
Phase 1 ─── MVP (Public Launch) ─────────┤ Revenue starts
  │                                       │ (Individual Pro)
  ▼                                       │
Phase 2 ─── Growth ──────────────────────┤ Revenue grows
  │  Visual Editor, Templates,            │ (Team, Business)
  │  Backend Integration, Teams           │
  ▼                                       │
Phase 3 ─── Enterprise ─────────────────╗│ PRIMARY REVENUE
  │  White-label, Custom Workspaces,    ║│ (Enterprise licenses)
  │  MCPs, CLI, Module Lifecycle        ║│
  ▼                                     ║│
Phase 4 ─── Scale ──────────────────────╣│ Revenue deepens
  │  Mobile, Hosting Providers,         ║│ (More enterprise features)
  │  Advanced AI, Collaboration         ║│
  ▼                                     ║│
Phase 5 ─── Ecosystem ─────────────────╝│ Revenue compounds
     Marketplace, Partners, Community    │ (Network effects)
```

### Critical Path Dependencies

| Dependency | Required By | Notes |
|------------|------------|-------|
| Phase 0 (AI agent + build pipeline) | Phase 1 (MVP) | Can't ship without working AI |
| **Phase 0 (multi-user safety — PRD 17)** | **Phase 1 (MVP)** | **Cannot launch publicly without workspace auth, session isolation, and resource management** |
| Phase 1 (context system foundation) | Phase 2 (advanced context) | Advanced files build on the injection system |
| Phase 1 (auth + billing) | Phase 2 (teams) | Teams need role-based access |
| **Phase 1 (WebSocket infrastructure)** | **Phase 2 (real-time collaboration)** | **CRDT sync and presence require WebSocket rooms** |
| Phase 2 (MCP support) | Phase 3 (enterprise MCPs) | Enterprise MCPs need the MCP infrastructure |
| Phase 2 (templates) | Phase 3 (enterprise workspaces) | Enterprise workspaces are super-templates |
| Phase 2 (teams/workspaces) | Phase 3 (enterprise admin) | Enterprise admin extends team management |
| **Phase 2 (CRDT + presence)** | **Phase 3 (shared AI chat, file locks)** | **Enterprise collab features extend the base CRDT system** |
| **Phase 2 (Redis sessions + rate limits)** | **Phase 3 (enterprise scale)** | **Enterprise needs distributed state, not in-memory** |
| **Phase 1 (token extraction + ai_usage_log)** | **Phase 2 (user/project dashboards)** | **Dashboards need usage data to display** |
| **Phase 2 (daily aggregation + user dashboards)** | **Phase 3 (workspace/admin dashboards)** | **Admin dashboards query aggregated data from Phase 2** |
| Phase 3 (enterprise core) | Phase 4 (enterprise enhancements) | Enhancements need the base enterprise product |
| Phase 3 (enterprise core) | Phase 5 (module marketplace) | Marketplace needs the module lifecycle |

---

## PRD Cross-Reference by Phase

| Phase | PRDs Covered |
|-------|-------------|
| **Phase 0** | 05 (backend/database), 12 (architecture), **17 (multi-user safety — workspace auth, session isolation, resource management)** |
| **Phase 1** | 01 (AI engine), 02 (editor UI), 03 (project management), 04 (code generation), 06 (auth), 07 (deployment), 09 (versioning), 11 (billing), **14 (context system — P0+P1)**, **17 (per-user rate limiting, build queue, credit safety)**, **20 (token extraction, ai_usage_log, per-message costs)** |
| **Phase 2** | 02 (visual editor expansion), 05 (user-choice backends), 07 (deploy adapter), 08 (integrations/MCPs), **09 (real-time collaboration — CRDT, presence, multi-cursor)**, **14 (context system — P1.5+P2+templates)**, **17 (RLS, Redis sessions, optimistic concurrency, WebSocket rooms, credit limits)**, **20 (user dashboards, project usage tab, daily aggregation)** |
| **Phase 3** | 06 (enterprise SSO), 08 (enterprise MCPs), 10 (audit/security), 11 (enterprise billing), **14 (enterprise workspaces — Section 9)**, **17 (shared AI chat, file locks, comments, enterprise audit, resource quotas)**, **20 (workspace admin dashboard, platform admin dashboard, budget controls, model pricing, usage export)** |
| **Phase 4** | 07 (full hosting providers), 10 (analytics/security), 13 (mobile/native), **14 (context advanced features)**, **17 (suggested changes, branch previews)** |
| **Phase 5** | 03 (community templates), 08 (plugin system), 11 (marketplace billing) |

---

## MVP Feature Checklist (Phase 1 — Ship Criteria)

The absolute minimum to launch publicly:

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | User signup/login (email + GitHub) | ⬜ | |
| 2 | Dashboard: list/create/delete projects | ⬜ | |
| 3 | AI chat with streaming responses | ⬜ | |
| 4 | Agent Mode: autonomous code generation | ⬜ | |
| 5 | Plan Mode: structured planning | ⬜ | |
| 6 | File tree + code editor (read/write) | ⬜ | |
| 7 | Live preview with hot-reload | ⬜ | |
| 8 | `.doable/` context system (6 core files) | ⬜ | identity, soul, user, knowledge, instructions, memory |
| 9 | Context files UI (view/edit in settings) | ⬜ | |
| 10 | One-click publish to `*.doable.app` | ⬜ | |
| 11 | Version history + rollback | ⬜ | |
| 12 | GitHub sync (push to user's repo) | ⬜ | |
| 13 | 3 basic templates (blank, SaaS, landing) | ⬜ | |
| 14 | Free tier + Pro subscription via Stripe | ⬜ | |
| 15 | Plan.md auto-updated by Plan Mode | ⬜ | |
| 16 | Memory.md accumulates learned facts | ⬜ | |
| 17 | **Workspace auth middleware on all routes** | ⬜ | PRD 17 — CRITICAL security requirement |
| 18 | **Per-user AI session isolation** | ⬜ | PRD 17 — sessions keyed by projectId+userId+mode |
| 19 | **Dev server idle timeout + eviction** | ⬜ | PRD 17 — prevent resource exhaustion |
| 20 | **Per-project deploy mutex** | ⬜ | PRD 17 — prevent concurrent deploy races |
| 21 | **Per-user rate limiting** | ⬜ | PRD 17 — keyed by userId, plan-based limits |
| 22 | **DB queries filter by workspaceId** | ⬜ | PRD 17 — defense-in-depth on all findById queries |
