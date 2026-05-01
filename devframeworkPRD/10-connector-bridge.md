# 10 — Connector Bridge for Generated Apps

> **Relationship to existing PRDs:**
> `07-implementation-plan.md` §"Connector Accessibility Summary" + Phase 3
> covers the *process-kind* answer ("switch to Next.js, server creds become
> accessible via `process.env`"). This doc adds:
> 1. The **static-kind answer** (Vite/Astro static still need connector
>    access — same-origin proxy with project-scoped JWT, deny-default
>    `.doable/connector-allowlist.json`).
> 2. The **per-framework env-prefix table** beyond the `VITE_`/`NEXT_PUBLIC_`
>    pair already in `08-ai-framework-awareness.md` §2.4 — adds `NUXT_PUBLIC_`,
>    `PUBLIC_`, `EXPO_PUBLIC_`, etc.
> 3. The **DB tier ladder** (external Postgres / Supabase / SQLite /
>    future-managed).
>
> Read 07 + 08 first; come here for the static-kind proxy design and the
> connector audit/allowlist mechanism.
>
> Companion to `06-runtime-and-publish.md` and `02-framework-abstraction.md`.
> Solves: *"Generated apps cannot reach connected connectors and databases
> because Doable today is a static-Vite-only host with browser-only env."*
>
> **Threat model:** server-only credentials never leave the API host. The
> generated app sees a proxy or a process-scoped env var, never the raw secret.
>
> **Date:** 2026-05-02. Cites code at `main` @ `88de0b3`.

---

## 1. Goals & non-goals

### Goals

1. **Any generated app, any framework, can call any connected integration**
   — Slack, GitHub, Stripe, Postgres, Supabase, Notion, Gmail, the full
   Activepieces catalog (`services/api/src/integrations/registry/*.ts`).
2. **Server-only credentials never reach the browser.** The vault-bridge
   `client/server` split (`services/api/src/env/vault-bridge.ts:111-140`) is
   preserved bit-for-bit.
3. **Two delivery mechanisms**, picked automatically by the framework's
   `runtime_kind`:
   - **Direct env injection** for `process` kind (Next.js, Nuxt, Django, …)
     — secret lands in the app's `process.env` server-side.
   - **Connector-bridge proxy** for `static` kind (Vite, Astro static, …)
     — secret stays in Doable's API; the app calls a project-scoped HTTP
     proxy.
4. **Database access is a tier on the same ladder** — external Postgres,
   Supabase (today's path), or local SQLite for `process` apps.
5. **Per-framework env-name conventions** — `VITE_*` for Vite,
   `NEXT_PUBLIC_*` for Next.js, `NUXT_PUBLIC_*` for Nuxt, etc. The
   vault-bridge allowlist becomes a `framework_id`-keyed table instead of
   a single `VITE_` constant.

### Non-goals

- Doable does **NOT** become a managed-DB provider. We expose adapters; the
  user's Supabase / their own Postgres / SQLite-on-disk are the realistic
  paths. (Open issue: future "Doable-Cloud Postgres" — out of scope.)
- We do **NOT** introduce a new credential-storage system. Everything reuses
  the existing `credentials_vault` (`services/api/src/integrations/credential-vault.ts`).
- We do **NOT** support live secret rotation. Secret edits require a runtime
  restart (PRD 06 §10).
- We do **NOT** ship a per-connector code-generation layer. The proxy speaks
  the existing Activepieces action shape; the AI generates the call site.

---

## 2. Audit: what exists today

| Surface | File | Today | After |
|---|---|---|---|
| Credential vault | `services/api/src/integrations/credential-vault.ts` | Stores all integration creds, encrypted. | Unchanged. |
| Env resolution | `services/api/src/env/resolve.ts:34-74` | `resolveProjectEnvVars` merges vault + env_vars table at spawn. | Unchanged for process kind; static kind drops to "no vault env on disk". |
| Vault bridge allowlist | `services/api/src/env/vault-bridge.ts:111-140` | Hardcodes `VITE_` as the only browser prefix. Drops `server.*` mappings that violate. | Becomes `BROWSER_PREFIXES[frameworkId]`-keyed. |
| AI tool bridge | `services/api/src/integrations/tool-bridge.ts:175-297` | `createIntegrationTools()` walks vault, emits one `defineTool` per Activepieces action. **AI-only.** | Unchanged. The AI keeps its tools. |
| Project-side proxy | none | Does not exist. | New: `services/api/src/routes/connector-proxy.ts`. |
| Per-project DB | none | No DB provisioning per project. Supabase via user's own account is the only path. | New tier list (§5). |

---

## 3. Architecture

```
                   ┌─────────────────────────────────────┐
                   │     User opens preview / live       │
                   │           myapp.doable.me           │
                   └───────────────┬─────────────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
            ▼                      ▼                      ▼
   ┌───────────────────┐   ┌───────────────────┐   ┌──────────────────┐
   │ static (Vite,     │   │ process (Next.js, │   │ Both kinds       │
   │ Astro static, …)  │   │ Nuxt, Hono, …)    │   │ for shared steps │
   └────────┬──────────┘   └─────────┬─────────┘   └──────────────────┘
            │                        │
            │ fetch('/__doable/      │  process.env.STRIPE_SECRET_KEY
            │  connector-proxy/      │  process.env.DATABASE_URL
            │  stripe/charges')      │  (server-side, RuntimeContext.env)
            │                        │
            ▼                        ▼
   ┌─────────────────────┐   ┌────────────────────────────────┐
   │ Connector-Bridge    │   │ /etc/doable/apps/{slug}.env    │
   │ HTTP proxy          │   │ (systemd EnvironmentFile)      │
   │ (Doable API)        │   └────────────┬───────────────────┘
   └────────┬────────────┘                │
            │                             │
            ▼                             ▼
   ┌─────────────────────┐   ┌────────────────────────────────┐
   │ credential-vault    │   │ vault-bridge.ts (per-framework │
   │ → Activepieces run  │   │  prefix table)                 │
   └─────────────────────┘   └────────────────────────────────┘
```

### 3.1 The `ConnectorBridgeAdapter` capability

`FrameworkPack` (PRD 02 §3) gains one capability:

```ts
type Capability =
  | …
  | "connector-bridge-direct"   // app server has process.env access
  | "connector-bridge-proxy";   // app must call /__doable/connector-proxy
```

A pack declares exactly one of these (or neither — a framework with no
connector access at all). The publish pipeline reads `capabilities` and
configures the runtime accordingly.

| Framework family | Capability |
|---|---|
| Vite (static SPA) | `connector-bridge-proxy` |
| Astro (static) | `connector-bridge-proxy` |
| Astro (SSR) | `connector-bridge-direct` |
| Next.js App / Pages | `connector-bridge-direct` |
| Nuxt (process) | `connector-bridge-direct` |
| Nuxt (static export) | `connector-bridge-proxy` |
| SvelteKit (Node) | `connector-bridge-direct` |
| SvelteKit (static) | `connector-bridge-proxy` |
| Hono / Express / Fastify | `connector-bridge-direct` |
| Django / FastAPI / Rails / Phoenix | `connector-bridge-direct` |
| Expo (React Native) | `connector-bridge-proxy` (mobile app calls Doable API) |

---

## 4. Direct env injection (`connector-bridge-direct`)

### 4.1 Per-framework env prefix table

`services/api/src/env/vault-bridge.ts` gains:

```ts
// services/api/src/env/framework-env.ts (new)
export const BROWSER_PREFIXES: Record<string, readonly string[]> = {
  "vite-react":   ["VITE_"],
  "nextjs-app":   ["NEXT_PUBLIC_"],
  "nextjs-pages": ["NEXT_PUBLIC_"],
  "nuxt":         ["NUXT_PUBLIC_"],
  "sveltekit":    ["PUBLIC_"],
  "astro":        ["PUBLIC_"],          // both static and SSR; PUBLIC_ leaks to client only via import.meta.env
  "remix":        [],                    // remix uses loader/action — no client env leak by default
  "expo":         ["EXPO_PUBLIC_"],
  "django":       [],                    // Python backends — no client env
  "fastapi":      [],
  "hono":         [],
  "express":      [],
  "rails":        [],
  "phoenix":      [],
};
```

The validator in `vault-bridge.ts:111-140` swaps the hardcoded `VITE_` check
for `BROWSER_PREFIXES[frameworkId]`. Backwards-compat: when `frameworkId`
is absent (legacy paths), defaults to `["VITE_"]`.

### 4.2 Build-time embedding for browser env

Most framework build steps embed `<PREFIX>*` values into client bundles at
build time (`vite.config.ts` `define`, `next build` static replacement,
`nuxt.config.ts` `runtimeConfig.public`, etc.). This is the existing leak
path — unchanged. The publish pipeline writes the env file once; each
framework's build/runtime reads it according to its own conventions.

### 4.3 Runtime-only env for server-only secrets

`server.*` mappings (no browser prefix) flow into `EnvironmentFile=/etc/doable/apps/{slug}.env`
and reach the framework's server runtime via `process.env`. Per PRD 06 §10,
file mode is `0640 root:root`, regenerated each publish, never logged.

### 4.4 Health-check env

The launcher always sets, regardless of framework:

```
DOABLE_PROJECT_ID={uuid}
DOABLE_PROJECT_SLUG={slug}
DOABLE_PUBLIC_URL=https://{slug}.doable.me
DOABLE_API_URL=https://api.doable.me     # for proxy callbacks (mobile, static fallback)
DOABLE_RUNTIME_KIND=process|static
NODE_ENV=production
```

---

## 5. Connector-bridge proxy (`connector-bridge-proxy`)

For `static`-kind apps that have no server runtime, Doable's API hosts a
project-scoped proxy.

### 5.1 Endpoint shape

```
POST /__doable/connector-proxy/:integration/:action
Authorization: Bearer <project-scoped JWT>
Content-Type: application/json

{ "props": { … action params … } }
```

- `:integration` — integration_id from the catalog (e.g. `slack`, `github`,
  `stripe`).
- `:action` — action_name from the integration's `actions: string[]`.
- The proxy is mounted at `/__doable/connector-proxy/*` on **the same origin
  as the published site**. For published apps that's `myapp.doable.me`; for
  preview that's the preview-proxy origin. Caddy adds a `handle_path
  /__doable/connector-proxy/*` block that reverse-proxies to the API.
  This keeps the SPA's `fetch` same-origin, avoiding CORS.

### 5.2 Project-scoped JWT

Issued at preview/published-page load:

- Lifetime: 15 min, refreshable from the same-origin cookie (`doable_project_session`).
- Claims: `projectId`, `workspaceId`, `userId?` (or `anon: true` for
  unauthenticated visitors of public apps), `iat`, `exp`,
  `kind: "connector-proxy"`.
- Signed with a per-project HMAC key derived from a server-side root key
  (`services/api/src/auth/project-jwt.ts:newKey(projectId)` — new file).
- The published site's HTML response sets the cookie. Static SPAs read
  `document.cookie` and refresh via `GET /__doable/auth/connector-proxy-token`.

### 5.3 Authorization

The proxy enforces three checks:

1. **JWT valid + projectId matches the URL path** (the SPA can't call the
   proxy for a different project).
2. **Integration is connected** to this project (look up
   `integration_connections` row by `(workspace_id, integration_id)` —
   same lookup as the AI tool bridge).
3. **Per-(integration, action) allowlist** — the project's
   `.doable/connector-allowlist.json` (new file) declares which actions the
   app is allowed to call. Default: deny all. The AI agent edits this file
   when generating code that needs a new action; the user reviews diffs in the
   editor. Closes the "AI generated code that calls Slack admin API" foot-gun.

### 5.4 Execution

The proxy calls the **same** code path the AI tool bridge uses:

```ts
// services/api/src/routes/connector-proxy.ts (new)
import { runAction } from "../integrations/runner.js";

connectorProxyRoutes.post("/:integration/:action", async (c) => {
  const { projectId, workspaceId, userId } = verifyProjectJwt(c);
  await assertIntegrationAllowed({ projectId, integration, action });
  const props = await c.req.json();
  const result = await runAction({
    integrationId: integration,
    actionName: action,
    props,
    userId,
    workspaceId,
    projectId,
  });
  return c.json(result);
});
```

Same vault decryption, same Activepieces piece, same audit trail — just a
different caller. Deduplicates with the AI tool bridge naturally.

### 5.5 Rate limits + audit

- Per project: 600 calls/minute default, override per project.
- Per (project, integration, action): 60 calls/minute default.
- Every call writes a row:

```sql
CREATE TABLE connector_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL,
  integration   text NOT NULL,
  action        text NOT NULL,
  user_id       uuid,                  -- null when anonymous
  status        text NOT NULL,         -- 'ok' | 'denied' | 'error'
  duration_ms   int,
  ts            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON connector_audit (project_id, ts DESC);
```

Retention: 30 days. Visible to the workspace admin in the project settings
panel.

### 5.6 SSRF / DNS rebind

Activepieces pieces dial out to fixed third-party hostnames; the SSRF surface
is limited compared to a generic HTTP proxy. We still:

- Bind `runner.ts` HTTP clients to a `dns.lookup`-resolved IP (no rebind).
- Reject any action whose pre-declared upstream host is RFC1918 / loopback /
  link-local. (No legitimate connector dials to a private network.)
- Custom HTTP-call actions (the Activepieces "HTTP" piece) remain
  AI-tool-only — not exposed via the proxy. This deliberately refuses the
  SSRF amplification path.

---

## 6. Database access

Four tiers, framework adapter declares which it supports.

### Tier 1 — External Postgres / MySQL (any framework)

User connects their own DB via the existing connector vault. Adapter provides
a typed DSN env var (`DATABASE_URL`, `POSTGRES_URL`, `MYSQL_URL` per framework
convention).

- **Process kind:** DSN reaches `process.env.DATABASE_URL` server-side.
- **Static kind:** DSN is server-only. The SPA must call the connector-proxy's
  query action, which we **do not auto-expose**. (Generic SQL execution from
  a browser is a footgun.) Instead, a static SPA reaches its DB via Tier 2
  (Supabase).

### Tier 2 — Supabase (today's path)

`services/api/src/integrations/supabase/provisioner.ts` already creates
projects in the user's own Supabase account. Generated apps get
`{PREFIX}_SUPABASE_URL` + `{PREFIX}_SUPABASE_ANON_KEY` (browser) +
`SUPABASE_SERVICE_ROLE_KEY` (server-only). Unchanged.

### Tier 3 — SQLite (process kind only)

For projects that want zero external dependencies. The runtime adapter
declares `supportsSqlite: true` (Node, Python, Ruby — yes; Cloudflare Workers
— no). Database file lives at:

```
/data/projects/{projectId}/.doable/data.sqlite
```

- Excluded from `listIgnore` so the AI agent can introspect.
- Backed up with the project tarball.
- Open issue: WAL-mode contention if a `process`-kind app has multiple
  workers. Recommend `WAL` + `busy_timeout=5000`; document in framework
  skill files (PRD 09).

### Tier 4 — Doable-Cloud Postgres (future)

Per-project schema on a shared cluster. Offered as a one-click "add
database" option. Out of scope here; PRD will be `10-managed-db.md` if/when
prioritized.

---

## 7. AI awareness

PRD 09 owns the per-framework system prompts. The connector-bridge-specific
prompt fragments live there but are summarized:

- **Process-kind prompt** (Next.js, Nuxt, Django, …): "Use `process.env.X`
  for server-only secrets. Use `<PREFIX>_X` for browser-safe values. Never
  ship a server-only secret in a `<PREFIX>_*` variable."
- **Static-kind prompt** (Vite, Astro static, …): "To call a connector,
  POST to `/__doable/connector-proxy/<integration>/<action>` with JSON body.
  The `.doable/connector-allowlist.json` file declares which (integration,
  action) pairs are allowed; add to it before generating call sites."

Both prompts include a worked example per common integration: Slack send
message, GitHub create issue, Stripe charge create, Supabase select.

---

## 8. Migration

### 8.1 Existing Vite-React projects

Continue working unchanged. They get `connector-bridge-proxy` capability by
default. The `.doable/connector-allowlist.json` file is created empty on
first publish; the AI agent populates it as needed.

### 8.2 First non-Vite project

A user creating a Next.js project gets:

- `runtime_kind = "process"` from PRD 06.
- `connector-bridge-direct` capability from this PRD.
- Server-only secrets injected at `process.env`.
- The proxy mounted at `/__doable/connector-proxy/*` is **not** required for
  the app to function (server can call connectors directly). It's still
  available for client-side fetch from React server components or for
  dynamic-import client components.

### 8.3 Schema additions

```sql
-- One-time migration
ALTER TABLE projects
  ADD COLUMN connector_allowlist jsonb NOT NULL DEFAULT '{}'::jsonb;
-- (Mirrors .doable/connector-allowlist.json, kept in sync; file is canonical.)

CREATE TABLE connector_audit (…);  -- §5.5
```

---

## 9. Security review checklist

- [ ] JWT secret per project, rotated on workspace ownership change.
- [ ] JWT lifetime ≤ 15 min; refresh requires same-origin cookie.
- [ ] Proxy denies all integration/action pairs not in
      `connector_allowlist`. Default-deny.
- [ ] Allowlist edits require a project-write permission (same as code edits).
- [ ] Per-project rate limit applied before vault decryption (deny-fast).
- [ ] Audit row written even on denied calls.
- [ ] SSRF defenses: hostnames resolved once, no rebinding; RFC1918 deny.
- [ ] No raw vault credentials in any HTTP response, log line, or telemetry
      payload (per PRD 04 redaction chain).
- [ ] CSP on the published site `connect-src` includes only the proxy origin
      and the integration's known callback domains.

---

## 10. Open issues

1. **Multi-tenant integration sharing.** A workspace admin connects Slack
   once; can multiple projects in that workspace use it? Today the AI tool
   bridge does this implicitly (`tool-bridge.ts:185` walks all
   workspace creds). The proxy must enforce the same scope: project's
   workspace must own the connection. Encoded in §5.3 step 2.
2. **Action props validation.** Activepieces pieces declare prop schemas. The
   proxy should validate JSON against the declared schema before invoking the
   piece, returning 400 on mismatch — currently `runAction` validates inside
   the piece. Cheap defense.
3. **Streaming responses.** Some actions (e.g. AI completion connectors)
   stream. v1 of the proxy is request-response only; streaming through the
   proxy is a follow-up.
4. **Cost / quota allocation.** Calls through the proxy consume the user's
   third-party quota (Stripe API, OpenAI tokens). v1 surfaces this only via
   the audit log; quota enforcement is a follow-up.
5. **Cross-origin embedding.** A published Doable app embedded in another
   site (`<iframe src="https://myapp.doable.me">`) — does the connector-proxy
   work? Yes if the iframe has the same-origin cookie path; CSP on the parent
   may interfere. Document in 09 prompt.
6. **The `allow-same-origin` trade-off** of the recent iframe-sandbox commit
   (`88de0b3`). Preview iframes are now opaque-origin → cannot read the
   project session cookie → cannot call the proxy from preview. Two
   resolutions: (a) issue the JWT via `postMessage` from the editor host
   on iframe load (preferred — no cookies), or (b) move preview to a
   separate origin per PRD 06 §9 Option B. **(a) is the v1 plan.**
