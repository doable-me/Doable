# 00 — Framework-Agnostic Doable: Master Plan

> **Top-level synthesis** of the framework-agnostic + connector-bridge +
> cross-platform-sandbox initiative. Read this first; it ties the existing
> PRDs (02–06) to three new ones (07–09) and lays out the rollout.
>
> **Date:** 2026-05-02. **Branch baseline:** `main` @ `88de0b3`.
>
> **Sources:**
> - Existing devframeworkPRD: `02-framework-abstraction.md`,
>   `03-build-event-protocol.md`, `04-redaction-and-filters.md`,
>   `05-live-build-ui.md`, `06-runtime-and-publish.md`.
> - Discovery briefs: `_discovery/01-vite-flow.md`,
>   `_discovery/02-runtime-infra.md`, `_discovery/03-streaming.md`.
> - **Existing implementation/AI PRDs (read first for the critical path):**
>   - `07-implementation-plan.md` — 5-phase critical-path plan (foundation →
>     13 HIGH-priority surfaces → AI awareness → Next.js → cross-platform
>     sandbox → runtime supervisor); concrete TypeScript code samples
>   - `08-ai-framework-awareness.md` — dynamic system-prompt design with
>     `buildFrameworkPrompt()` + integration manifest + capability-gated tools
> - **New companion PRDs (deeper design behind 07/08):**
>   - `10-connector-bridge.md` — adds the *static-kind* answer (proxy +
>     deny-default allowlist) that 07's "switch to Next.js" doesn't cover
>   - `11-cross-platform-sandbox.md` — deep design behind 07 §4: per-OS
>     detection, bundling, opt-in tier (Apple Container, gVisor, nsjail),
>     test matrix, honest gaps. Picks bubblewrap as primary non-systemd
>     Linux fallback with nsjail documented as the upgrade path
>   - `12-ai-awareness-rollout.md` — implementation deepening of 08:
>     per-framework skill files, editor UI de-Vite'ing, dovault config-guard,
>     10-step rollout
> - Memory: `project_sandbox_architecture.md`,
>   `project_native_integrations.md`, `project_provider_bridge_status.md`.

---

## 1. The three problems this initiative solves

### Problem 1 — "Doable only ships Vite-React"

**The agent IS Vite.** `services/api/src/routes/chat/system-prompts.ts:61,85`
literally tells every chat session "the project is a Vite + React 19 +
TypeScript app with Tailwind CSS v4." `services/api/src/ai/context/defaults.ts`
seeds React+Vite+Tailwind+shadcn into every new project's `.doable/knowledge.md`.
PRD 02 covers the executable plumbing (24 hardcoded surfaces in `services/api`)
but **does not cover the agent prompt**, the editor copy, or `dovault`'s
config-guard — which means even if PRD 02 lands cleanly, the agent will keep
generating Vite code.

→ Owned jointly by `08-ai-framework-awareness.md` (dynamic prompt builder)
and **`12-ai-awareness-rollout.md`** (skills + editor copy + rollout).

### Problem 2 — "Generated apps can't reach connected connectors or databases"

The user's claim was half-right. Audit findings (`07-connector-bridge.md` §2):

- Doable has hundreds of integrations via Activepieces
  (`services/api/src/integrations/registry/*.ts`).
- The credential vault (`services/api/src/env/resolve.ts:34-74`) injects them
  into the dev server's `process.env` at spawn time — but the
  `vault-bridge.ts:111-140` enforces a strict split: `client.*` mappings *must*
  be `VITE_`-prefixed (only browser-safe values like `VITE_SUPABASE_URL`),
  `server.*` mappings *cannot* be `VITE_`-prefixed. Any violation is dropped.
- **Browser-only Vite apps cannot use server-only credentials.** GitHub PAT,
  Postgres password, Stripe secret, Slack OAuth token, Notion, Gmail —
  unreachable.
- **No project-side proxy exists.** Grep confirms: zero `/projects/:id/proxy`
  routes, zero project-scoped connector forwarders.
- **No per-project database.** Doable doesn't host DBs; Supabase via the user's
  own account is the only path.

The fix is not "expose more `VITE_*`" — that would leak credentials. The fix
is **server-side framework support**: once a project can run Next.js / Hono /
FastAPI / etc., it has a backend that can call connectors using server-only
credentials, and the user's prompt "use Slack" stops requiring chat-time
intervention.

→ Process-kind owned by `07-implementation-plan.md` Phase 3; static-kind
owned by **`10-connector-bridge.md`** (consumed-by `06-runtime-and-publish.md`).

### Problem 3 — "We can't execute user code on the host machine"

PRD 06 §8 covers production sandbox tightening on Linux/systemd. It does not
cover:

- **Windows** — current `dovault/backends/windows.ts` only does Win32 Job
  Objects (resource limits, no FS isolation, no registry isolation).
- **macOS** — current `direct.ts` falls through with **no isolation at all**
  on macOS.
- **Linux without systemd cgroup delegation** — falls through to `direct.ts`.

Constraint from the user: **no GPU, low CPU/RAM, no VT-x required** as the
primary path. So Hyper-V / WSL2 / Apple Hypervisor / KVM are fallbacks at
most.

The candidates that meet the constraint:

- **Windows** — `psroot` (local project at `C:\Users\gj\Documents\workspace\Psroot`):
  AppContainer + Job Objects + optional BindFilter/Server Silos. No VT-x, no
  admin, kernel-enforced FS+registry+named-object isolation, network mode
  gating built in.
- **Linux** — bubblewrap (unprivileged user namespaces, ~30 ms cold start)
  for distros without systemd cgroup delegation. Pair with landlock + seccomp.
- **macOS** — `sandbox-exec` (Seatbelt) as today's primary; Apple's
  `container` CLI as opt-in for macOS 15+ Apple Silicon; Lima as self-host
  fallback.

→ Sketched in `07-implementation-plan.md` §4; deep design in
**`11-cross-platform-sandbox.md`** (priorities harmonized; bubblewrap chosen
as primary non-systemd Linux fallback over nsjail; Apple Container + gVisor
as opt-in tiers).

---

## 2. How all the PRDs compose

```
                          ┌──────────────────────────────────┐
                          │  00-framework-agnostic-plan.md   │  ← this doc
                          └─────────┬────────────────────────┘
                                    │
        ┌───────────────────────────┼─────────────────────────────────┐
        ▼                           ▼                                 ▼
   ┌──────────┐         ┌──────────────────────┐          ┌──────────────────┐
   │ existing │         │ 07-implementation-   │          │ 08-ai-framework- │
   │ 02–06    │ ──used─▶│ plan.md (5 phases,   │ ──used─▶ │ awareness.md     │
   │ PRDs     │   by    │ critical path)       │   by     │ (prompt builder) │
   └──────────┘         └──────────┬───────────┘          └──────────┬───────┘
                                   │                                 │
                                   │ deep design                     │ deep design
                                   ▼                                 ▼
                       ┌────────────────────┐              ┌──────────────────┐
   ┌──────────────┐    │ 11-cross-platform- │              │ 12-ai-awareness- │
   │ 10-connector-│    │ sandbox.md         │              │ rollout.md       │
   │ bridge.md    │    │ (per-OS detection, │              │ (skill files,    │
   │ (static-kind │    │ bundling, opt-in   │              │ editor copy,     │
   │ proxy + DB   │    │ tier, gaps,        │              │ dovault config-  │
   │ tier ladder) │    │ bubblewrap-vs-     │              │ guard, rollout)  │
   └──────────────┘    │ nsjail decision)   │              └──────────────────┘
                       └────────────────────┘
```

- **02 (FrameworkAdapter contract)** stays the foundation. 10 adds a
  `connector-bridge` capability flag; 12 adds AI-side skill files keyed
  on `framework_id`.
- **06 (RuntimeAdapter)** is consumed by 07 Phase 5 (process-kind systemd
  template) and 10 (server-side credential injection for `process` apps).
- **07** is the master implementation plan; **08** is the prompt-builder
  design. 10/11/12 are the deep-design backings for the parts 07/08 sketch.
- **All three** plug into `11`: the sandbox profile is per-`runtime_kind`
  AND per-OS, replacing today's "Linux/systemd or nothing".

- **02 (FrameworkAdapter contract)** stays the foundation. 07 adds a
  `ConnectorBridgeAdapter` capability flag; 09 adds AI-side skill files keyed
  on `framework_id`.
- **06 (RuntimeAdapter)** consumes 07: a `process` runtime declares which
  connectors it can reach; the launcher writes server-only credentials into
  `/etc/doable/apps/{slug}.env`.
- **All three** plug into `08`: the sandbox profile is per-`runtime_kind` AND
  per-OS, replacing today's "Linux/systemd or nothing".

---

## 3. The thin spec for each NEW PRD

(Existing `07-implementation-plan.md` and `08-ai-framework-awareness.md` are
already self-contained — read them directly. Below are the three NEW
companion PRDs that add depth where 07/08 leave gaps.)

### 3.1 `10-connector-bridge.md` — Server-side connector access for generated apps

**Goal:** A generated app, regardless of framework, can call any connector
(Slack, GitHub, Stripe, Postgres, Supabase, …) using the project's vaulted
credentials, without the app code ever seeing the raw secret.

**Two complementary mechanisms.** Pick by framework capability:

| Mechanism | When | Surface |
|---|---|---|
| **Direct env injection** | `runtime_kind = "process"` (Next.js, Nuxt, Django, Hono, FastAPI) — there's a server runtime to receive secrets | `EnvironmentFile=/etc/doable/apps/{slug}.env` written by the publish pipeline. Server-only mappings (`server.*` in `vault-bridge.ts:111-140`) flow in unchanged. Browser-only mappings (`VITE_*`/`NEXT_PUBLIC_*`/`PUBLIC_*` per framework) keep their existing browser-leak path. |
| **Connector-Bridge proxy** | `runtime_kind = "static"` (Vite/Astro/SvelteKit static) — no server, but the user wants e.g. `fetch('/api/slack/post-message')` to work | Doable's API exposes `POST /projects/:id/connector-proxy/:integration/:action` scoped to the project's vaulted creds. Generated SPA calls it with a project-scoped JWT (issued at preview load, short TTL). The proxy is the *only* place the secret lives; the SPA never sees it. |

**Why not skip the proxy and just inject `VITE_*` for everything?** Because
that ships the secret to the browser. The vault-bridge `client/server` split
exists for a reason. The proxy preserves the split for static apps.

**Trust boundary additions:**

- The proxy validates the project-scoped JWT and rate-limits per project +
  per (integration, action).
- Per-project egress allow-list (PRD 06 §13 open issue) is now load-bearing —
  the runtime's `IPAddressAllow` lists the connector hosts the project
  declared.
- Audit log: every proxy call increments a counter and (in prod) writes a row
  to `connector_audit`.

**Per-framework env-name conventions:**

| Framework family | Browser env prefix | Server env source |
|---|---|---|
| Vite (current) | `VITE_*` | n/a (static, uses proxy) |
| Next.js App Router | `NEXT_PUBLIC_*` | runtime `process.env` |
| Nuxt | `NUXT_PUBLIC_*` | `useRuntimeConfig()` |
| SvelteKit | `PUBLIC_*` | `$env/static/private` |
| Astro | `PUBLIC_*` | `import.meta.env` (server) |
| Django | n/a | `os.environ` / `settings.py` |
| FastAPI | n/a | `os.environ` |
| Hono / Express | n/a | `process.env` |

The `vault-bridge.ts` allowlist regex (`apps/web/src/env/...` and
`services/api/src/env/vault-bridge.ts:111-140`) gains a `framework_id`-keyed
prefix table. Today it's `VITE_` only.

**Database options for generated apps:** the PRD enumerates four tiers in
priority order. Doable does **not** become a managed-DB provider. We expose
*adapters* the framework adapter declares it supports:

1. **External Postgres / MySQL** via the existing connector vault (user supplies
   `DATABASE_URL`).
2. **Supabase** via the existing `services/api/src/integrations/supabase/`
   provisioner (user's own Supabase project).
3. **SQLite** for `process` apps — file lives under `/data/projects/{id}/.doable/data.sqlite`,
   excluded from `listIgnore`, NOT redacted, backed up with the project.
4. **Doable-Cloud Postgres** (future) — per-project schema on a shared cluster.
   PRD-out-of-scope; flagged for a follow-up.

### 3.2 `11-cross-platform-sandbox.md` — Backends for dovault

**Goal:** every supported OS has a primary sandbox path that doesn't require
VT-x, doesn't require admin, doesn't require a GPU, and provides at least
*real FS isolation*. Today's `direct.ts` macOS fallthrough is unacceptable for
production multi-tenant.

**New `ResourceBackend` implementations** (all plug into the existing
`packages/dovault/src/backends/types.ts` interface — no structural change to
`Vault`):

| Backend | OS | Priority | Mechanism | Replaces |
|---|---|---|---|---|
| `psroot.ts` | win32 | **70** | AppContainer + Job Objects via the local Psroot CLI / lib | `windows.ts` (drops to 60) |
| `bubblewrap.ts` | linux | 65 | Unprivileged user-namespace + mount + landlock | n/a (new fallback when systemd unavailable) |
| `sandbox-exec.ts` | darwin | 50 | Generated SBPL profile (deprecated API but ships with macOS) | `direct.ts` on macOS only |
| `apple-container.ts` | darwin (15+, Apple Silicon) | 45 (opt-in) | Apple Containerization Framework | n/a — opt-in fallback |
| `nsjail.ts` | linux | 60 (opt-in) | Google-built namespace jail with rich seccomp DSL | n/a — opt-in upgrade for hardened multi-tenant |
| `gvisor.ts` | linux | 40 (opt-in) | User-space syscall interception | n/a — opt-in hardening |

(Priorities harmonized with `07-implementation-plan.md` §4 — Psroot=70,
systemd=80, sandbox-exec=50, direct=0. Within an OS, higher = preferred.)

**Honest limits** (08 expands these, not glossed over):

- Psroot's "Docker-style containers" framing is marketing. Standard tier is a
  process sandbox, not a namespace container. **Still the right primary on
  Windows**, but don't pitch it as VM-grade.
- `sandbox-exec` is officially deprecated since macOS 10.15. We use it because
  there's no public replacement on Intel/older macOS. Apple's `container` CLI
  is the migration path for macOS 15+/Apple Silicon.
- Node Permission Model (`process-jail.ts`) is `--experimental-permission` —
  defense-in-depth, not a primary boundary. The OS backend is always the wall.

**Per-(OS × runtime-kind × framework-family) profile matrix** is in 08 §3 — a
big table that determines the exact `dovault` flags for every legitimate
combination. PRD 06 §8 supplies the production *intent* (lockConfigs, block
child process, resource limits); 08 supplies the *mechanism* per OS.

### 3.3 `12-ai-awareness-rollout.md` — Implementation deepening of `08-ai-framework-awareness.md`

**Goal:** when `projects.framework_id` changes from `vite-react` to anything
else, the agent generates correct code for that framework. Today it can't —
the system prompt is hardcoded to Vite + React + Tailwind v4.

**Three layers to change:**

1. **System prompts**, keyed on framework. `services/api/src/routes/chat/system-prompts.ts:61,85,253-264,282,306-319`
   currently hardcodes:
   - "Vite + React 19 + TypeScript + Tailwind v4 (using @tailwindcss/vite plugin)"
   - `import.meta.env.VITE_*` for client vars
   - `HashRouter` (because preview is at `/preview/{id}/`)
   - Tailwind v4 via `@tailwindcss/vite` (no `tailwind.config.ts`)

   Replace with `loadFrameworkPrompt(frameworkId)` that returns the
   framework-shaped equivalent. PRD 09 ships seven prompts on day-one:
   `vite-react`, `nextjs-app`, `nextjs-pages`, `nuxt`, `sveltekit`,
   `astro`, `expo`. Plus a generic "the project is a `<frameworkId>` app, see
   skill files" stub for adapters without a hand-written prompt.

2. **Context defaults**, keyed on framework. `services/api/src/ai/context/defaults.ts`
   today writes a Vite-shaped `.doable/knowledge.md` and `instructions.md` on
   project creation. Replace with framework-keyed defaults loaded from
   `services/api/src/ai/context/defaults/<frameworkId>.ts`.

3. **Skill files**, keyed on framework. The MCP-Apps skills system already
   materializes skills per project (`services/api/src/ai/skills-materializer.ts`).
   Add framework-specific skills:
   - `nextjs-app/server-actions.md` — when to use server actions vs route handlers
   - `nextjs-app/connector-fetch.md` — how to call the connector-bridge proxy or
     read `process.env` for server-only secrets
   - `nuxt/server-routes.md` — `server/api/...` shape
   - `django/views-and-urls.md` — minimal Django skill
   - etc.

   Skills are a smaller blast radius than system prompts (they're added to the
   tool description, not the system message), so they're the right place for
   per-framework idiosyncrasies that don't deserve full prompt real estate.

**Editor UI copy.** Six places hardcode "Vite" in `apps/web/src/`:

- `app/editor/[projectId]/page.tsx:6833-6845` (toast + chat copy)
- `modules/editor/preview/preview-panel.tsx:28-30,102` (HMR comments)
- `modules/editor/visual-edit/use-visual-edit.ts:306` (HMR refresh)
- `modules/editor/hooks/use-chat-lifecycle.ts:307` (Supabase env names)
- `modules/dashboard/components/import-github-project-dialog.tsx:170` (import
  prompt)
- `apps/web/src/lib/preview/...` (where the HMR sniffer lives)

→ All become `framework`-aware via the same registry the API uses (a thin
client mirror or a fetched `frameworkMeta` payload).

**`dovault/config-guard.ts:14-64`** hardcodes Vite/PostCSS/Tailwind config
templates. Becomes `lockedConfigs[frameworkId]` — the Vite adapter contributes
its existing templates; Next.js contributes `next.config.js`; Django
contributes `settings.py` / `wsgi.py` / `asgi.py`.

---

## 4. Phased rollout

**The canonical phased rollout lives in `07-implementation-plan.md` §"Phase 0"
through §"Phase 5".** That document has week-by-week budgets, file-counts per
phase, validation gates, and a critical-path diagram. Read it directly.

The new docs slot into 07's phases as follows:

| 07 Phase | New PRDs that supply detail |
|---|---|
| Phase 0 (Foundation: registry + types + vite-react extraction) | n/a — fully owned by 07 |
| Phase 1 (Abstract 13 HIGH surfaces) | n/a — fully owned by 07 |
| Phase 2 (AI framework awareness) | **08** for the prompt-builder design + **12** for skill files / editor copy / dovault config-guard |
| Phase 3 (Next.js adapter) | **08** §3 for Next.js system prompt; **10** §4 for Next.js direct env injection (`process.env`); **12** for the `nextjs-app/*.md` skill files |
| Phase 4 (Cross-platform sandboxing) | **11** for per-OS detection, bundling, opt-in tier (Apple Container, gVisor, nsjail), test matrix, honest gaps |
| Phase 5 (Runtime supervisor) | `06-runtime-and-publish.md` (the long-lived process model); **10** §5 for the connector-proxy mounted at `/__doable/connector-proxy/*` for static apps |

**The one-line invariant for the whole rollout:** existing Vite-React
projects produce byte-identical generated code through Phase 1 + Phase 2
(verified by replaying a frozen prompt corpus with `framework_id =
'vite-react'`).

---

## 5. What this plan deliberately does NOT do

- **No auto-conversion of existing Vite projects to Next.js.** PRD 02 §6.5
  reserves the seam; we don't implement.
- **No managed Doable Postgres.** Per §3.1 tier 4 — flagged for a future PRD.
- **No GPU-accelerated runtimes.** PRD 06's `node-standalone` and friends are
  CPU-only.
- **No mobile (Expo) end-to-end.** The adapter exists in PRD 02 §8.5 but the
  build farm + signing infrastructure is a separate PRD.
- **No multi-region.** Single-VPS topology is preserved; Cloudflare Tunnel
  remains the only external entry.
- **No edge / lambda runtime kinds.** PRD 06 §2.3 keeps these as future export
  adapters, not supervised runtime kinds.

---

## 6. Open issues this plan inherits / surfaces

Carried from existing PRDs:

- **02 §10.1** — visual edit on non-Vite frameworks. We ship Next.js without
  click-to-edit on day one.
- **02 §10.6** — per-framework env-var policy (`spawn-time` vs `live-reload`).
  07 closes this for spawn-time; live-reload is deferred.
- **06 §13.3** — egress allow-list. 07's connector-bridge surfaces the
  declarative shape, but the IPAddressAllow wiring is deferred to 06's
  follow-up.
- **06 §13.6** — non-systemd dev hosts. 08 closes this with bubblewrap.

New:

- **DNS rebinding on the connector-bridge proxy.** Open Design's BYOK proxy
  has the same gap (string-match on hostname only, no `dns.lookup` re-check).
  07 §6 must specify the re-check.
- **Audit-log retention for connector-proxy calls.** Per-project rate counters
  live in memory; the audit row goes to Postgres. Retention TBD.
- **Generated-app secrets at runtime restart.** PRD 06 §10 already documents
  spawn-time-only resolution. 07 inherits the rule.

---

## 7. Cross-references

- **PRD 02** — interface contract for `FrameworkAdapter`. Day-one consumers in
  this plan: `vite-react`, `nextjs-app`, `nuxt`, `sveltekit`, `astro`, `django`,
  `hono`, `fastapi`, `expo`.
- **PRD 06** — runtime kinds. The `process` kind is what makes 10's direct env
  injection viable. 11 specifies the sandbox flags 06 §8 leaves abstract.
- **PRD 07** — 5-phase critical-path implementation plan; concrete TypeScript
  code samples; week-by-week budgets. **Start here for sequencing.**
- **PRD 08** — `buildFrameworkPrompt(adapter, manifest)` design;
  capability-gated tools (`run_server_command`, `run_database_migration`);
  framework-aware envKeyMap. **Start here for the agent prompt redesign.**
- **PRD 10** — adds the static-kind connector-bridge proxy + per-project
  deny-default `.doable/connector-allowlist.json` + DB tier ladder.
- **PRD 11** — concrete `ResourceBackend` implementations including the local
  Psroot integration; bubblewrap chosen as primary non-systemd Linux fallback;
  Apple Container + gVisor + nsjail as opt-in tiers.
- **PRD 12** — per-framework skill files (`services/api/src/ai/skills/<framework>/`),
  per-framework `.doable/knowledge.md` defaults, six editor-UI files to
  de-Vite, dovault config-guard per-framework templates, 10-step rollout.

---

## Appendix — Why we don't just "use a VM"

The user explicitly excluded VT-x as a requirement. A 1-1 mapping of
"VM per project" via Hyper-V / WSL2 / Apple Hypervisor / KVM would give
the strongest isolation, but:

- Locks out laptop users without VT-x enabled (BIOS-disabled by IT, older
  hardware, some VPS plans).
- Costs ~200–800 MB RAM per VM at idle — incompatible with the ~100-app
  capacity model in PRD 06 §11.
- Cold-start budget incompatible with PRD 06 §4.3's "<2 s wake".

VM-based sandboxes (Apple `container`, Windows Sandbox, Lima) are listed in
08 as **opt-in fallback / hardening** profiles. They're not the primary path.
