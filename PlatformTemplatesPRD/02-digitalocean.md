# 02 — DigitalOcean App Platform

DO App Platform is one of the most popular managed-PaaS targets at our user
stage. It's well-suited because (a) DO's managed Postgres supports pgvector
via an extension, (b) the platform supports pre-deploy jobs (for migrate),
(c) per-service env scoping makes the NEXT_PUBLIC_* placeholder mechanism
work cleanly.

## Deliverable

Rewrite of **`.do/app.yaml`** (the current file is incomplete — missing
DOABLE_KEK, missing the 19 AI provider env vars, missing the migrate job,
source-builds instead of pulling from ghcr.io).

## Final `.do/app.yaml` shape (target)

```yaml
spec:
  name: doable
  region: nyc
  features:
    - buildpack-stack=ubuntu-22

  # ─── Managed Postgres ──────────────────────────────────────────
  # DO managed Postgres supports pgvector — must enable the extension
  # after creation (run `CREATE EXTENSION IF NOT EXISTS vector;` via the
  # connection string or the doctl databases sql endpoint).
  databases:
    - engine: PG
      name: doable-db
      version: "16"
      size: db-s-1vcpu-1gb     # bump to db-s-2vcpu-4gb for >50 users
      num_nodes: 1
      production: true

  # ─── Pre-deploy migrate job ────────────────────────────────────
  jobs:
    - name: migrate
      kind: PRE_DEPLOY
      image:
        registry_type: GHCR
        registry: ghcr.io
        repository: doable-me/doable-migrate
        tag: latest             # pin to v0.1.0 etc. in prod
      instance_count: 1
      instance_size_slug: basic-xxs
      envs:
        - { key: DATABASE_URL, scope: RUN_TIME, value: ${doable-db.DATABASE_URL} }

  # ─── Services ──────────────────────────────────────────────────
  services:
    # ─── api ─────────────────────────────────────────────────────
    - name: api
      image:
        registry_type: GHCR
        registry: ghcr.io
        repository: doable-me/doable-api
        tag: latest
      instance_count: 1
      instance_size_slug: basic-xs   # api needs more RAM than basic-xxs
      http_port: 4000
      health_check:
        http_path: /health
      internal_ports: [4000]         # ws talks to api via internal URL
      envs:
        # ─── Connection ────
        - { key: DATABASE_URL, scope: RUN_TIME, value: ${doable-db.DATABASE_URL} }
        - { key: NODE_ENV,    scope: RUN_AND_BUILD_TIME, value: production }
        - { key: API_PORT,    scope: RUN_TIME, value: "4000" }
        - { key: API_HOST,    scope: RUN_TIME, value: "0.0.0.0" }
        - { key: WS_PORT,     scope: RUN_TIME, value: "4001" }
        - { key: WS_HOST,     scope: RUN_TIME, value: "0.0.0.0" }
        - { key: WS_INTERNAL_URL, scope: RUN_TIME, value: ${ws.PRIVATE_URL} }
        - { key: API_URL,     scope: RUN_TIME, value: ${api.PRIVATE_URL} }
        # ─── Public URLs (for emails, OG tags) ────
        - { key: NEXT_PUBLIC_API_URL, scope: RUN_TIME, value: ${web.PUBLIC_URL}/api }
        - { key: NEXT_PUBLIC_WS_URL,  scope: RUN_TIME, value: ${web.PUBLIC_URL}/ws }
        - { key: NEXT_PUBLIC_APP_URL, scope: RUN_TIME, value: ${web.PUBLIC_URL} }
        - { key: CORS_ORIGINS,        scope: RUN_TIME, value: ${web.PUBLIC_URL} }
        # ─── Required secrets — set via doctl or UI ────
        - { key: JWT_SECRET,     scope: RUN_TIME, type: SECRET, value: REPLACE_ME_OR_USE_doctl_secret }
        - { key: ENCRYPTION_KEY, scope: RUN_TIME, type: SECRET, value: REPLACE_ME }
        - { key: INTERNAL_SECRET, scope: RUN_TIME, type: SECRET, value: REPLACE_ME }
        - { key: DOABLE_KEK,     scope: RUN_TIME, type: SECRET, value: REPLACE_ME }
        # ─── Bootstrap ────
        - { key: INSTALL_BOOTSTRAP_TOKEN,            scope: RUN_TIME, type: SECRET, value: REPLACE_ME }
        - { key: INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT, scope: RUN_TIME, value: "REPLACE_WITH_ISO8601_NOW_PLUS_24H" }
        # ─── 19 AI provider env-seeds (all optional, any one pre-configures the wizard) ────
        - { key: ANTHROPIC_API_KEY,    scope: RUN_TIME, type: SECRET, value: "" }
        - { key: OPENAI_API_KEY,       scope: RUN_TIME, type: SECRET, value: "" }
        - { key: GEMINI_API_KEY,       scope: RUN_TIME, type: SECRET, value: "" }
        - { key: MINIMAX_API_KEY,      scope: RUN_TIME, type: SECRET, value: "" }
        - { key: OPENROUTER_API_KEY,   scope: RUN_TIME, type: SECRET, value: "" }
        - { key: TOGETHER_API_KEY,     scope: RUN_TIME, type: SECRET, value: "" }
        - { key: FIREWORKS_API_KEY,    scope: RUN_TIME, type: SECRET, value: "" }
        - { key: OPENCODE_ZEN_API_KEY, scope: RUN_TIME, type: SECRET, value: "" }
        - { key: GROQ_API_KEY,         scope: RUN_TIME, type: SECRET, value: "" }
        - { key: CEREBRAS_API_KEY,     scope: RUN_TIME, type: SECRET, value: "" }
        - { key: DEEPSEEK_API_KEY,     scope: RUN_TIME, type: SECRET, value: "" }
        - { key: MISTRAL_API_KEY,      scope: RUN_TIME, type: SECRET, value: "" }
        - { key: COHERE_API_KEY,       scope: RUN_TIME, type: SECRET, value: "" }
        - { key: XAI_API_KEY,          scope: RUN_TIME, type: SECRET, value: "" }
        - { key: PERPLEXITY_API_KEY,   scope: RUN_TIME, type: SECRET, value: "" }
        - { key: DEEPINFRA_API_KEY,    scope: RUN_TIME, type: SECRET, value: "" }
        - { key: NVIDIA_API_KEY,       scope: RUN_TIME, type: SECRET, value: "" }
        - { key: MOONSHOT_API_KEY,     scope: RUN_TIME, type: SECRET, value: "" }
        - { key: ZHIPU_API_KEY,        scope: RUN_TIME, type: SECRET, value: "" }
        # ─── Optional OAuth + Stripe ────
        - { key: GITHUB_CLIENT_ID,     scope: RUN_TIME, value: "" }
        - { key: GITHUB_CLIENT_SECRET, scope: RUN_TIME, type: SECRET, value: "" }
        - { key: GOOGLE_CLIENT_ID,     scope: RUN_TIME, value: "" }
        - { key: GOOGLE_CLIENT_SECRET, scope: RUN_TIME, type: SECRET, value: "" }
        - { key: STRIPE_SECRET_KEY,    scope: RUN_TIME, type: SECRET, value: "" }
        - { key: STRIPE_WEBHOOK_SECRET, scope: RUN_TIME, type: SECRET, value: "" }

    # ─── ws ──────────────────────────────────────────────────────
    - name: ws
      image:
        registry_type: GHCR
        registry: ghcr.io
        repository: doable-me/doable-ws
        tag: latest
      instance_count: 1
      instance_size_slug: basic-xxs
      http_port: 4001
      internal_ports: [4001]
      envs:
        - { key: DATABASE_URL,     scope: RUN_TIME, value: ${doable-db.DATABASE_URL} }
        - { key: JWT_SECRET,       scope: RUN_TIME, type: SECRET, value: ${api.JWT_SECRET} }
        - { key: INTERNAL_SECRET,  scope: RUN_TIME, type: SECRET, value: ${api.INTERNAL_SECRET} }
        - { key: API_URL,          scope: RUN_TIME, value: ${api.PRIVATE_URL} }
        - { key: WS_PORT,          scope: RUN_TIME, value: "4001" }
        - { key: WS_HOST,          scope: RUN_TIME, value: "0.0.0.0" }
        - { key: NODE_ENV,         scope: RUN_TIME, value: production }

    # ─── web ─────────────────────────────────────────────────────
    - name: web
      image:
        registry_type: GHCR
        registry: ghcr.io
        repository: doable-me/doable-web
        tag: latest
      instance_count: 1
      instance_size_slug: basic-xxs
      http_port: 3000
      routes:
        - { path: / }
      envs:
        - { key: NEXT_PUBLIC_API_URL, scope: RUN_TIME, value: ${web.PUBLIC_URL}/api }
        - { key: NEXT_PUBLIC_WS_URL,  scope: RUN_TIME, value: ${web.PUBLIC_URL}/ws }
        - { key: NEXT_PUBLIC_APP_URL, scope: RUN_TIME, value: ${web.PUBLIC_URL} }
        - { key: HOSTNAME,            scope: RUN_TIME, value: "0.0.0.0" }
        - { key: PORT,                scope: RUN_TIME, value: "3000" }
        - { key: NODE_ENV,            scope: RUN_TIME, value: production }

  # ─── Ingress routing ─────────────────────────────────────────────
  # Only web is public-facing. api and ws are reachable internally via
  # ${api.PRIVATE_URL} and ${ws.PRIVATE_URL}. The Next.js server-side fetcher
  # in web hits api via PRIVATE_URL; the browser hits api/ws through web's
  # PUBLIC_URL/api and /ws paths (proxied by Next.js or a tiny nginx if you
  # add one — currently Next.js rewrites handle /api and /ws to ${api.PRIVATE_URL}
  # and ${ws.PRIVATE_URL} respectively; documented at apps/web/next.config.ts).
```

## Operator flow

1. Install `doctl` and log in.
2. `git clone https://github.com/doable-me/doable.git && cd doable`
3. Edit `.do/app.yaml`:
   - Replace all `REPLACE_ME` values with output of `openssl rand -hex 32`
     (or `openssl rand -base64 32` for `DOABLE_KEK`).
   - Set `INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT` to `date -u -d '+24 hours'
     +%Y-%m-%dT%H:%M:%SZ`.
   - Optional: fill in any AI provider key you have.
4. `doctl apps spec validate .do/app.yaml` — must pass.
5. `doctl apps create --spec .do/app.yaml`
6. Wait ~3-5 minutes for the pre-deploy migrate job + service spin-up.
7. After the app reports healthy, enable the pgvector extension on the
   managed Postgres:
   ```bash
   doctl databases sql <db-id> --command "CREATE EXTENSION IF NOT EXISTS vector;"
   doctl databases sql <db-id> --command "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
   doctl databases sql <db-id> --command "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
   ```
   (The migrate job tries this too — but DO doesn't grant the `CREATE
   EXTENSION` permission to the app's DB role by default, so it must be
   run as the admin user via doctl.)
8. Visit `${web.PUBLIC_URL}/auth/register`. First user → platform admin.
9. `/setup` wizard.

## Instance size guidance

| Service | Min | Recommended | Why |
|---|---|---|---|
| api | basic-xxs (512MB) | basic-xs (1GB) | Hono + tsx + 116 migration files; OOMs on xxs under load |
| ws | basic-xxs | basic-xxs | Yjs is light |
| web | basic-xxs | basic-xxs | Next.js standalone is ~150MB resident |
| migrate (job) | basic-xxs | basic-xxs | Runs once, exits |
| postgres-db | db-s-1vcpu-1gb | db-s-2vcpu-4gb | Default fine for <50 users; bump for production |

**Source-build path WILL OOM** on basic-xs (Next.js build needs ~2GB peak).
This is why we ship `image:` references not `dockerfile_path:` in the
target shape. The current `.do/app.yaml` uses `dockerfile_path` which
will fail on basic-xs — that's part of the bug we're fixing.

## 1-click button

After `.do/app.yaml` is rewritten and committed, the README badge:

```markdown
[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/doable-me/doable/tree/main)
```

When the user clicks, DO clones the repo, reads `.do/app.yaml`, prompts the
user for the `REPLACE_ME` secrets, then deploys. Works without doctl.

## Acceptance criteria

- [ ] `doctl apps spec validate .do/app.yaml` passes
- [ ] Fresh deploy succeeds end-to-end (migrate job exit 0, api/ws/web healthy)
- [ ] `/setup/status` reports `fields_configured.ai_provider=true` when at
      least one AI provider key was set
- [ ] Browser at `${web.PUBLIC_URL}` reaches the landing page
- [ ] Browser at `${web.PUBLIC_URL}/auth/register` can register; first user
      becomes platform admin
- [ ] `${web.PUBLIC_URL}/api/health` returns 200 with `{"status":"healthy"}`
