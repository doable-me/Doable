# 12 — AI Awareness Implementation: Skills, Editor Copy, Rollout

> **Relationship to existing PRDs:**
> `08-ai-framework-awareness.md` defines the dynamic system-prompt design
> (`buildFrameworkPrompt(adapter, manifest)`, capability-gated tool
> availability, framework-aware envKeyMap). This doc is the **implementation
> deepening** of that design:
> 1. **Per-framework `defaults/` directory** for `.doable/knowledge.md` and
>    `.doable/instructions.md` content (separate from the in-prompt text).
> 2. **Per-framework skill files** at `services/api/src/ai/skills/<framework>/*.md`,
>    materialized into `.doable/skills/` per project. Lazy-loaded via
>    `read_file` so the system prompt stays small.
> 3. **Editor UI de-Vite'ing** — six concrete `apps/web/src/` files that
>    hardcode the word "Vite". `08` doesn't catch these.
> 4. **`packages/dovault/src/config-guard.ts` per-framework templates** —
>    today it hardcodes Vite/PostCSS/Tailwind; becomes
>    `lockedConfigs[frameworkId]`.
> 5. **Concrete 10-step rollout** with golden-file gates (vs `07`'s 5-phase
>    plan, which is the higher-level critical path).
>
> Read 08 first for the prompt-builder design; come here for skills, editor
> copy, and the rollout sequencing.
>
> Companion to `02-framework-abstraction.md`. PRD 02 makes the *executable
> code* framework-agnostic. This PRD + 08 makes the *AI agent* and *editor
> UI* framework-aware. Without these, even after PRD 02 lands, the agent
> will keep generating Vite-React because its system prompt tells it to.
>
> **Date:** 2026-05-02. Branch baseline: `main` @ `88de0b3`.
>
> **Scope:** per-framework skill files, context-default files, editor UI
> copy, dovault config-guard. Plus the 10-step rollout for how all of this
> lands without breaking existing Vite projects.

---

## 1. The "agent IS Vite" problem

PRD 02 abstracts 24 surfaces in `services/api/src/`. None of them are the
agent prompt. Audit (verified at `main` @ `88de0b3`):

| Surface | Today | Issue |
|---|---|---|
| `services/api/src/routes/chat/system-prompts.ts:61,85` | "The project is a Vite + React 19 + TypeScript app with Tailwind CSS v4 (using the @tailwindcss/vite plugin)." | Hardcoded into both visual-edit and agent prompts. |
| `system-prompts.ts:253-264` | "Use `import.meta.env.VITE_*` for client vars." Worked example for Supabase uses `VITE_SUPABASE_URL`. | Vite-only env conventions. |
| `system-prompts.ts:282` | "Use `HashRouter` because preview lives at `/preview/{projectId}/`." | Vite-base-path artifact; Next.js doesn't need this. |
| `system-prompts.ts:306-319` | Tailwind v4 via `@tailwindcss/vite`; no `tailwind.config.ts`; `@import "tailwindcss"`. | Tailwind v4 wiring is Vite-plugin specific. |
| `services/api/src/ai/context/defaults.ts:13,28,36,42,47,120` | Default `.doable/knowledge.md` and `instructions.md` seed React+Vite+Tailwind+shadcn. | Every new project gets the Vite worldview. |
| `services/api/src/ai/providers/copilot-tools.ts:5` | "Vite hot-reloads changes." | Tool description claims Vite. |
| `services/api/src/ai/tools/install-package.ts` | (per PRD 02 surface 3) Hardcoded `npm install --legacy-peer-deps`. | Already in 02 §5 surface 3. Mentioning here for cross-ref only. |

The problem is upstream of PRD 02. If the system prompt says "this is a Vite
project" and the agent generates `vite.config.ts` edits, those edits flow
through `lockedConfigFiles` checks that 02 already abstracts — but the *intent*
was wrong from the start.

---

## 2. Goals & non-goals

### Goals

1. **System prompts dispatched by `frameworkId`** — not a single hardcoded
   blob.
2. **Context defaults dispatched by `frameworkId`** — `.doable/knowledge.md`
   and `instructions.md` per framework.
3. **Per-framework skill files** — Next.js has its own server-actions skill,
   Nuxt has its own server-routes skill, etc. Skills layer in via the
   existing materializer.
4. **Editor UI copy de-Vite'd** — the six places `apps/web/src/` mentions
   Vite by name become framework-aware.
5. **`dovault/config-guard.ts` per-framework templates** — `vite.config.ts`
   templates stay for Vite; Next.js contributes `next.config.js`; Django
   contributes `settings.py` / `wsgi.py`.
6. **Vite remains the default and unchanged for existing projects.**

### Non-goals

- We do NOT deprecate Vite.
- We do NOT support framework conversion in v1.
- We do NOT introduce new prompt-engineering features (chain-of-thought
  control, tool-priority ordering, etc.) — out of scope.
- We do NOT change the AI model or provider configuration.

---

## 3. The framework-prompt registry

```ts
// services/api/src/ai/framework-prompts/index.ts (new)
export interface FrameworkPrompt {
  /** The "the project is …" intro paragraph. */
  systemIntro: string;
  /** Env-var conventions block. */
  envConventions: string;
  /** Routing / preview-path conventions block. */
  routing: string;
  /** Styling conventions block (Tailwind v4? styled-components? CSS modules?). */
  styling: string;
  /** File-shape and edit conventions block. */
  fileShape: string;
  /** Skill IDs to materialize for this framework. */
  skills: string[];
  /** Per-framework redactions for the UI. Pass-through to PRD 02 redactInUI. */
  redactInUI?: (s: string) => string;
}

export const FRAMEWORK_PROMPTS: Record<string, FrameworkPrompt> = {
  "vite-react":   viteReactPrompt,
  "nextjs-app":   nextjsAppPrompt,
  "nextjs-pages": nextjsPagesPrompt,
  "nuxt":         nuxtPrompt,
  "sveltekit":    sveltekitPrompt,
  "astro":        astroPrompt,
  "expo":         expoPrompt,
  "django":       djangoPrompt,    // stub — minimal day-one
  "fastapi":      fastapiPrompt,   // stub
  "hono":         honoPrompt,      // stub
};
```

`system-prompts.ts` becomes:

```ts
export function buildSystemPrompt(ctx: { framework: string; … }): string {
  const fw = FRAMEWORK_PROMPTS[ctx.framework] ?? FRAMEWORK_PROMPTS["vite-react"];
  return [
    fw.systemIntro,
    fw.envConventions,
    fw.routing,
    fw.styling,
    fw.fileShape,
    // (other framework-blind blocks: visual-edit, error-fix, …)
  ].join("\n\n");
}
```

### 3.1 Day-one prompt set

| Framework | Status | Lines (rough) | Notes |
|---|---|---|---|
| `vite-react` | **Frozen verbatim** | ~120 | Behavior unchanged. Tested via golden-file diff. |
| `nextjs-app` | **Hand-written** | ~140 | App Router. `process.env.X` server-only, `NEXT_PUBLIC_*` browser. Server actions / route handlers / RSC. No HashRouter (App Router is path-based). Tailwind v4 via `@tailwindcss/postcss`. |
| `nextjs-pages` | **Hand-written** | ~130 | Pages Router for users who explicitly opt in. `getServerSideProps` / `getStaticProps`. |
| `nuxt` | Hand-written | ~120 | `useRuntimeConfig()`, `server/api/*.ts`, `definePageMeta`, Tailwind v4 via Vite plugin (Nuxt uses Vite under the hood). |
| `sveltekit` | Hand-written | ~120 | `+page.server.ts`, `+server.ts`, `$env/static/private`. Tailwind v4 via Vite. |
| `astro` | Hand-written | ~110 | `.astro` files, `Astro.props`, partial hydration directives. |
| `expo` | Hand-written | ~100 | React Native; no DOM; `expo-router` file-based routing. |
| `django` | **Stub** | ~60 | Minimal: views/urls/templates pattern. Skill files carry the depth. |
| `fastapi` | Stub | ~60 | App + path-operations + Pydantic. |
| `hono` | Stub | ~50 | Routes + handlers; close to Express. |

**Stubs are deliberate.** They tell the agent enough to start; the per-framework
skill files (§5) carry the rest, materialized into `.doable/skills/<framework>/`
where the agent reads them on demand. This keeps the system prompt short and
defers depth to lazy-loaded knowledge.

---

## 4. Per-framework context defaults

`services/api/src/ai/context/defaults.ts` becomes
`services/api/src/ai/context/defaults/` (a directory) with one file per
framework:

```
services/api/src/ai/context/defaults/
├── index.ts                 # registry — keyed lookup by framework_id
├── vite-react.ts            # current content, frozen
├── nextjs-app.ts            # new
├── nextjs-pages.ts
├── nuxt.ts
├── sveltekit.ts
├── astro.ts
├── expo.ts
└── _generic.ts              # fallback for unknown frameworkId
```

Each file exports:

```ts
export const defaults = {
  knowledgeMd: string,    // .doable/knowledge.md content
  instructionsMd: string, // .doable/instructions.md content
  initialFiles: Record<string, string>, // optional extra files (e.g. .doable/connector-allowlist.json)
};
```

`createProject()` (`services/api/src/projects/file-manager.ts:74`) reads
`defaults[project.frameworkId]` instead of the hardcoded import. Tests assert
that `vite-react` defaults are byte-identical to today's literal.

---

## 5. Per-framework skill files

The skills system already exists (`services/api/src/ai/skills-materializer.ts`).
Today skills are MCP-Apps-driven. We add a parallel category: framework
skills.

```
services/api/src/ai/skills/
├── shared/                       # framework-blind skills (already exist)
│   ├── error-fix.md
│   └── visual-edit.md
├── vite-react/                   # frozen — extracted from current prompts
│   ├── tailwind-v4-vite.md
│   └── hash-router.md
├── nextjs-app/                   # NEW
│   ├── server-actions.md
│   ├── route-handlers.md
│   ├── rsc-vs-client.md
│   ├── connector-fetch.md        # how to call /__doable/connector-proxy or process.env
│   ├── tailwind-v4-postcss.md
│   └── data-fetching.md
├── nuxt/
│   ├── server-routes.md
│   ├── runtime-config.md
│   ├── composables.md
│   └── connector-fetch.md
├── sveltekit/
│   ├── load-functions.md
│   ├── server-routes.md
│   ├── form-actions.md
│   └── connector-fetch.md
├── django/
│   ├── views-urls.md
│   ├── orm-basics.md
│   ├── connector-fetch.md
│   └── settings-and-env.md
├── fastapi/
│   ├── path-operations.md
│   ├── pydantic-models.md
│   ├── dependency-injection.md
│   └── connector-fetch.md
└── hono/
    ├── routing.md
    ├── middleware.md
    └── connector-fetch.md
```

The materializer (`skills-materializer.ts`) gains a step at project creation:
copy `services/api/src/ai/skills/<frameworkId>/` into
`/data/projects/{id}/.doable/skills/`. The agent's tool descriptions
reference these files; they're loaded on demand via `read_file`.

Each `connector-fetch.md` skill includes:

- For `connector-bridge-direct` frameworks: read `process.env.X`, call the
  third-party SDK directly, NEVER prefix server secrets with the browser
  prefix.
- For `connector-bridge-proxy` frameworks: call
  `fetch('/__doable/connector-proxy/<integration>/<action>', { method:'POST',
  body: JSON.stringify({props}), credentials: 'include' })`. Add the action
  to `.doable/connector-allowlist.json` before generating the call site.

---

## 6. Editor UI copy

Six places hardcode Vite in `apps/web/src/`. All become framework-aware via a
client-side `frameworkMeta` registry that mirrors the API's pack.

| File:line | Today | After |
|---|---|---|
| `apps/web/src/app/editor/[projectId]/page.tsx:6833-6845` | "VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY" + "the running Vite instance" | Use `frameworkMeta.envExample("supabase")` and `frameworkMeta.runtimeName` |
| `modules/editor/preview/preview-panel.tsx:28-30,102` | "Vite HMR pushes updates" | "HMR pushes updates" (drop the brand) |
| `modules/editor/visual-edit/use-visual-edit.ts:306` | "Vite HMR will auto-refresh" | "HMR will auto-refresh" |
| `modules/editor/hooks/use-chat-lifecycle.ts:307` | `VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY` | `frameworkMeta.envForIntegration("supabase")` (returns the right prefix per framework) |
| `modules/dashboard/components/import-github-project-dialog.tsx:170` | "If it's not already a Vite project, adapt it so the preview works (add vite.config…)" | "Detect the framework from package.json/file shape; if unsupported, suggest a port to a supported framework." |
| `modules/editor/preview/injected-scripts.ts:192-226` (matches `/__vite/`) | Vite WebSocket sniffer | Move to `framework-adapters/<id>/preview-sniffer.ts` per framework; default impl uses framework's HMR endpoint. |

A new `apps/web/src/lib/framework-meta.ts` wraps the API's framework registry
for the client. Loaded once per project and cached in the editor store.

---

## 7. dovault config-guard per-framework

`packages/dovault/src/config-guard.ts:14-64` hardcodes templates for
`vite.config.ts`, `postcss.config.js`, `tailwind.config.ts`. Becomes:

```ts
// packages/dovault/src/config-guard.ts
export interface ConfigTemplateSet {
  templates: Record<string, string>;   // filename → safe-template content
  variants: Record<string, string[]>;  // canonical → variants to delete
}

export function getConfigTemplates(frameworkId: string): ConfigTemplateSet {
  return CONFIG_TEMPLATE_SETS[frameworkId] ?? CONFIG_TEMPLATE_SETS["_default"];
}
```

The `Vault.lockConfigs(projectPath)` call site
(`services/api/src/projects/file-manager.ts`, see PRD 02 surface 11) passes
`frameworkId` from the project row.

Day-one template sets:

| Framework | Locked configs |
|---|---|
| `vite-react` | `vite.config.ts`, `postcss.config.js`, `tailwind.config.ts` (today's set, unchanged) |
| `nextjs-app` | `next.config.js`, `next.config.mjs`, `next.config.ts`, `postcss.config.js`, `tailwind.config.ts` |
| `nuxt` | `nuxt.config.ts` |
| `sveltekit` | `svelte.config.js`, `vite.config.ts` |
| `astro` | `astro.config.mjs`, `astro.config.ts` |
| `django` | `settings.py`, `wsgi.py`, `asgi.py`, `manage.py` |
| `fastapi` | `main.py` (entry point) only — minimal lock |
| `hono` | `tsconfig.json` only — minimal lock |

PRD 02 §10.2 (open issue) "AI build duplication" interacts here: the
locked-configs list is also consumed by the AI's `write_file` tool. After this
PRD lands, the tool reads the framework-keyed list.

---

## 8. Rollout phases (concrete steps)

This is the framework-agnostic-init detail of the master plan §4. Each row
is a PR.

| # | Step | PR scope | Risk | Test gate |
|---|---|---|---|---|
| 1 | Add `FRAMEWORK_PROMPTS` registry, ship only `vite-react` (frozen) | `services/api/src/ai/framework-prompts/{index,vite-react}.ts`, `system-prompts.ts` dispatch | Low | Golden-file diff against today's prompt = byte-identical |
| 2 | Add `defaults/` directory, ship only `vite-react` | `services/api/src/ai/context/defaults/{index,vite-react}.ts`, callsite in `file-manager.ts` | Low | Golden-file diff |
| 3 | Add `skills/<framework>/` materializer step, ship only `vite-react/` | `services/api/src/ai/skills-materializer.ts`, `skills/vite-react/` | Low | Existing project create scaffolds the same files plus 2 new skill files (`tailwind-v4-vite.md`, `hash-router.md`) — additive |
| 4 | Add `frameworkMeta` client registry, swap 6 editor copy sites | `apps/web/src/lib/framework-meta.ts`, 6 files in `apps/web/src/` | Low | Visual diff + Storybook |
| 5 | Refactor `dovault/config-guard.ts` to per-framework template sets | `packages/dovault/src/config-guard.ts`, `services/api/src/projects/file-manager.ts` | Low | Existing Vite locks behave identically |
| 6 | Land `nextjs-app` prompt + defaults + skills + adapter (PRD 02 ground done) | `framework-prompts/nextjs-app.ts`, `defaults/nextjs-app.ts`, `skills/nextjs-app/*`, `packages/framework/src/adapters/nextjs-app.ts` | Medium | Internal beta: create one Next.js project end-to-end, ship a real feature, deploy |
| 7 | Add framework picker UI behind feature flag | `apps/web/src/components/templates/framework-picker.tsx` (new), `apps/web/src/modules/dashboard/components/new-project-dialog.tsx` | Medium | Manual QA on staging |
| 8 | Land `nuxt`, `sveltekit`, `astro` adapters + prompts (lower-risk follow-on) | per-framework files | Medium | Each gets one real project before flag drop |
| 9 | Drop the picker feature flag — Next.js + Nuxt + SvelteKit + Astro publicly available | flag removal | Medium | Watch error rates for 7 days |
| 10 | (Later) `django`, `fastapi`, `hono` adapters | per-framework files | Lower priority | Owned by separate PRD |

**Vite-React behavior is invariant through steps 1–5.** That's the testable
property — after each PR, every existing project should look and behave
identically. This is the rollback story: any of steps 1–5 can be reverted
independently without affecting users.

---

## 9. Cross-PRD dependencies

| Depends on | Provides for |
|---|---|
| **PRD 02** must land first | This PRD references `frameworkId` everywhere; PRD 02 introduces the column. |
| **PRD 06** Phase 2 (process-kind) | Step 6 (Next.js end-to-end) requires the `node-standalone` runtime. |
| **PRD 07** connector bridge | The `connector-fetch.md` skill files reference the proxy endpoint and per-framework env conventions. |
| **PRD 08** sandbox backends | The `dovault/config-guard.ts` per-framework templates are read by every backend; the templates themselves don't change per OS, only the lockdown enforcement does. |

---

## 10. Success criteria

- A user creating a Next.js project on `myapp.doable.me` can (a) ask the AI
  "make me a dashboard that lists my Stripe customers" and (b) actually see
  the dashboard render with real Stripe data — without ever pasting an API
  key into a `VITE_*` env var.
- An existing Vite-React project produces byte-identical generated code
  pre/post all the changes in this PRD (verified by replaying a fixed
  prompt corpus against the new prompt registry with `framework_id =
  'vite-react'`).
- The system prompt for any registered framework is ≤ 200 lines (skills carry
  depth).
- New framework adoption (Nuxt/SvelteKit/Astro/Django) requires only:
  `framework-prompts/<id>.ts`, `defaults/<id>.ts`, `skills/<id>/*.md`,
  `packages/framework/src/adapters/<id>.ts`. Zero edits to `system-prompts.ts`,
  `file-manager.ts`, `config-guard.ts`, or any UI file.

---

## 11. Open issues

1. **System prompt drift between languages.** Will Django's prompt have its
   own visual-edit / error-fix sections, or will those framework-blind
   sections be language-blind too? (Visual edit on Django doesn't make sense
   — it's HTML templates; we'd need a server-side renderer hook.)
   Recommendation: ship Django without visual-edit (capability flag absent
   per PRD 02 §10.1).
2. **Skill file freshness.** Frameworks update fast. Who owns refreshing
   `nextjs-app/server-actions.md` when Next.js 16 changes the API?
   Recommendation: per-PRD skill update cadence; auto-checked by a CI lint
   that diffs against the framework's latest docs once a month.
3. **Multi-framework projects.** Someone wants Next.js + a Python FastAPI
   sidecar. Out of scope for v1; one project = one framework.
4. **Prompt size budget.** With 7 frameworks × ~120 lines each, plus shared
   blocks, the prompt file approaches 1500 lines. Consider lazy-loading
   per-framework prompts only when a project of that framework is active
   (which is exactly what the registry dispatch already does).
5. **Existing user education.** Users are used to Vite. Adding a framework
   picker doesn't help them understand when to pick Next.js. Ship a one-line
   recommendation: "If your app needs a backend (database, auth, server
   functions), choose Next.js. If it's purely UI, choose Vite-React."
