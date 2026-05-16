# 04 — Render

Render uses a Blueprint mechanism — a single `render.yaml` at repo root that
Render auto-detects on Connect and creates all resources from. This is the
cleanest declarative path of the managed PaaS options.

## Deliverable

Rewrite of **`render.yaml`**. Current file is incomplete (missing DOABLE_KEK,
the 19 AI provider env vars, points at source-build via `dockerfilePath` —
Render's free tier OOMs during the Next.js build).

## Final `render.yaml` shape

```yaml
# Render Blueprint — https://render.com/docs/blueprint-spec
# Auto-detected on Connect to a public GitHub repo.

databases:
  - name: doable-db
    databaseName: doable
    user: doable
    plan: starter        # bump to standard for >50 users
    postgresMajorVersion: 16
    ipAllowList: []      # internal-only

services:
  # ─── Pre-deploy migrate (Cron Job that runs once on deploy) ────────
  - type: pserv          # private service (no public URL)
    name: doable-migrate
    runtime: image
    image:
      url: ghcr.io/doable-me/doable-migrate:latest
    plan: starter
    envVars:
      - { key: DATABASE_URL, fromDatabase: { name: doable-db, property: connectionString } }
    autoDeploy: false    # manual deploy; or use Render's preDeployCommand on api instead

  # ─── api ───────────────────────────────────────────────────────────
  - type: web
    name: doable-api
    runtime: image
    image:
      url: ghcr.io/doable-me/doable-api:latest
    plan: starter        # 512MB; bump to standard (2GB) for >25 users
    region: oregon
    healthCheckPath: /health
    # preDeployCommand runs migrations before each deploy (replaces the
    # separate doable-migrate service above, simpler operationally)
    preDeployCommand: node /app/services/api/dist/db/migrate.js
    envVars:
      - { key: DATABASE_URL, fromDatabase: { name: doable-db, property: connectionString } }
      - { key: API_PORT, value: "4000" }
      - { key: API_HOST, value: "0.0.0.0" }
      - { key: WS_PORT, value: "4001" }
      - { key: WS_HOST, value: "0.0.0.0" }
      - { key: WS_INTERNAL_URL, value: http://doable-ws:4001 }
      - { key: API_URL, value: http://doable-api:4000 }
      - { key: NODE_ENV, value: production }
      - { key: NEXT_PUBLIC_API_URL, fromService: { type: web, name: doable-web, property: host, envVarKey: SELF }, value: https://${SELF}/api }
      - { key: NEXT_PUBLIC_WS_URL,  fromService: { type: web, name: doable-web, property: host, envVarKey: SELF }, value: wss://${SELF}/ws }
      - { key: NEXT_PUBLIC_APP_URL, fromService: { type: web, name: doable-web, property: host, envVarKey: SELF }, value: https://${SELF} }
      - { key: CORS_ORIGINS,        fromService: { type: web, name: doable-web, property: host, envVarKey: SELF }, value: https://${SELF} }
      # Required secrets — Render UI generates these on first deploy if generateValue: true
      - { key: JWT_SECRET,      generateValue: true }
      - { key: ENCRYPTION_KEY,  generateValue: true }
      - { key: INTERNAL_SECRET, generateValue: true }
      - { key: DOABLE_KEK,      generateValue: true }
      - { key: INSTALL_BOOTSTRAP_TOKEN, generateValue: true }
      - { key: INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT, sync: false }   # manual entry, 24h from now
      # 19 AI provider env-seeds (optional — leave empty, configure via wizard)
      - { key: ANTHROPIC_API_KEY,    sync: false }
      - { key: OPENAI_API_KEY,       sync: false }
      - { key: GEMINI_API_KEY,       sync: false }
      - { key: MINIMAX_API_KEY,      sync: false }
      - { key: OPENROUTER_API_KEY,   sync: false }
      - { key: TOGETHER_API_KEY,     sync: false }
      - { key: FIREWORKS_API_KEY,    sync: false }
      - { key: OPENCODE_ZEN_API_KEY, sync: false }
      - { key: GROQ_API_KEY,         sync: false }
      - { key: CEREBRAS_API_KEY,     sync: false }
      - { key: DEEPSEEK_API_KEY,     sync: false }
      - { key: MISTRAL_API_KEY,      sync: false }
      - { key: COHERE_API_KEY,       sync: false }
      - { key: XAI_API_KEY,          sync: false }
      - { key: PERPLEXITY_API_KEY,   sync: false }
      - { key: DEEPINFRA_API_KEY,    sync: false }
      - { key: NVIDIA_API_KEY,       sync: false }
      - { key: MOONSHOT_API_KEY,     sync: false }
      - { key: ZHIPU_API_KEY,        sync: false }
      - { key: GITHUB_CLIENT_ID,     sync: false }
      - { key: GITHUB_CLIENT_SECRET, sync: false }
      - { key: GOOGLE_CLIENT_ID,     sync: false }
      - { key: GOOGLE_CLIENT_SECRET, sync: false }
      - { key: STRIPE_SECRET_KEY,    sync: false }
      - { key: STRIPE_WEBHOOK_SECRET, sync: false }

  # ─── ws ────────────────────────────────────────────────────────────
  - type: web
    name: doable-ws
    runtime: image
    image:
      url: ghcr.io/doable-me/doable-ws:latest
    plan: starter
    region: oregon
    envVars:
      - { key: DATABASE_URL, fromDatabase: { name: doable-db, property: connectionString } }
      - { key: WS_PORT, value: "4001" }
      - { key: WS_HOST, value: "0.0.0.0" }
      - { key: NODE_ENV, value: production }
      - { key: API_URL, value: http://doable-api:4000 }
      - { key: JWT_SECRET,      fromService: { type: web, name: doable-api, envVarKey: JWT_SECRET } }
      - { key: INTERNAL_SECRET, fromService: { type: web, name: doable-api, envVarKey: INTERNAL_SECRET } }

  # ─── web ───────────────────────────────────────────────────────────
  - type: web
    name: doable-web
    runtime: image
    image:
      url: ghcr.io/doable-me/doable-web:latest
    plan: starter
    region: oregon
    envVars:
      - { key: NEXT_PUBLIC_API_URL, value: /api }
      - { key: NEXT_PUBLIC_WS_URL,  value: /ws }
      - { key: NEXT_PUBLIC_APP_URL, value: / }
      - { key: HOSTNAME, value: "0.0.0.0" }
      - { key: PORT, value: "3000" }
      - { key: NODE_ENV, value: production }
```

## pgvector on Render

Render's managed Postgres SUPPORTS pgvector — you just need to enable it:

```sql
-- Connect via Render UI's "Connect" → "External Connection" → use the
-- provided psql command, then:
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Or run them automatically as part of the migrate image (`docker/init.sql`
already does this; the migrate image executes init.sql when it sees a fresh
DB).

## Operator flow

1. Connect repo to Render: Dashboard → New → Blueprint → connect
   `github.com/doable-me/doable`.
2. Render auto-reads `render.yaml`, prompts for the secrets with
   `sync: false` (operator fills in any AI provider keys + the bootstrap
   expiration timestamp).
3. Render creates: db → migrate (runs once) → api/ws/web in parallel.
4. ~3-5 minutes total.
5. Visit `https://doable-web-<hash>.onrender.com/auth/register`.

## 1-click button

```markdown
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/doable-me/doable)
```

Render reads `render.yaml` automatically. Free tier works for "try it out"
but the api will sleep after 15 min of inactivity (cold start ~30s).

## Render-specific gotchas

- **Free tier sleeping**: api will spin down after 15 min idle. Use Starter
  ($7/mo) for non-sleeping. Same for web.
- **Free tier Postgres expires after 90 days**: not viable for real
  deployments. Use Starter ($7/mo).
- **Service-to-service URLs**: use the bare service name as hostname
  (`http://doable-api:4000`). Render handles internal DNS.
- **`fromService` value substitution** is Render-specific. The `${SELF}`
  pattern above may not work; verify against the current Render
  Blueprint spec. Fallback: hardcode the URLs as `sync: false` and have
  the operator fill them in after the web service gets its onrender.com
  domain.
- **Persistent disks** are not available on free tier. For api_projects /
  api_thumbnails on production, attach a disk via Render UI (or use S3).

## Acceptance criteria

- [ ] `render.yaml` validates against Render's Blueprint schema
- [ ] Auto-detect-on-Connect creates all 4 services + DB without UI tweaks
- [ ] Migration runs as preDeployCommand on api
- [ ] api/ws/web are all reachable internally via service-name DNS
- [ ] `/setup/status` reports `fields_configured.ai_provider=true` when at
      least one AI key was filled in via the prompt
