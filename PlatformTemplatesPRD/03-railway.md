# 03 — Railway

Railway has a service-per-process model: each component (api/ws/web/migrate)
is a separate Railway service sharing a single Postgres plugin. The
`railway.json` file lives at repo root.

## Deliverable

Rewrite of **`railway.json`**. Current file is incomplete (missing DOABLE_KEK,
the 19 AI provider env vars, the migrate releaseCommand wiring, and
source-builds instead of pulling ghcr.io which OOMs on Railway's 8GB build
sandbox).

## Final `railway.json` shape

Railway's `railway.json` is a single root config. Multi-service projects are
typically defined via the Railway UI (link each service to its directory),
but `railway.json` can declare per-service settings via templates.

For Doable, the cleanest path is to use **Railway's "Deploy from Image"**
flow per service (skips the on-Railway build entirely):

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "version": 2,
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "docker/Dockerfile"
  },
  "deploy": {
    "numReplicas": 1,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

The above applies to whichever service Railway picks up by default. The
**recommended setup is per-service via Railway templates**, not a single
`railway.json`. See `railway-template.json` for the full multi-service shape.

### Railway template URL pattern

```
https://railway.com/template/<template-id>?referralCode=...
```

A reusable Railway template definition (lives at `railway/template.json` or
is registered in Railway's template registry) defines:

- 4 services: doable-api, doable-ws, doable-web, doable-migrate-onceoff
- 1 Postgres plugin
- Pre-populated env vars (the user fills in secrets via the Railway UI)
- Each service's image source: `ghcr.io/doable-me/doable-<svc>:latest`

### Per-service env contract

**doable-api**:
- Source = `ghcr.io/doable-me/doable-api:latest` (Deploy from Image)
- All 19 AI provider env vars + 5 required secrets + bootstrap (see
  [00-baseline.md](00-baseline.md))
- Railway shared variables (project-level) for: `POSTGRES_PASSWORD`,
  `JWT_SECRET`, `INTERNAL_SECRET`, `DOABLE_KEK` — let api/ws/migrate
  all reference `${{shared.JWT_SECRET}}` etc.
- Per-service vars: `NEXT_PUBLIC_*` set per-service since each has its
  own public URL.

**doable-ws**:
- Source = `ghcr.io/doable-me/doable-ws:latest`
- Subset of env: `DATABASE_URL`, `JWT_SECRET`, `INTERNAL_SECRET`, `API_URL`,
  `WS_PORT=4001`, `WS_HOST=0.0.0.0`, `NODE_ENV=production`

**doable-web**:
- Source = `ghcr.io/doable-me/doable-web:latest`
- Env: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_APP_URL`,
  `HOSTNAME=0.0.0.0`, `PORT=3000`, `NODE_ENV=production`
- Railway assigns a `.up.railway.app` domain; configure via Railway settings.
  Custom domain in the same UI panel.

**doable-migrate** (one-shot):
- Source = `ghcr.io/doable-me/doable-migrate:latest`
- Set "restart policy" = NEVER
- Set "service type" = job (Railway supports this)
- Env: just `DATABASE_URL`
- Run order: must complete before api/ws start. Railway lacks
  service-completion dependencies, so the canonical pattern is:
  - Either run migrate as a Railway `releaseCommand` field on the api
    service (Heroku-style release phase), OR
  - Run it manually once on first deploy, then disable the service.

The `releaseCommand` approach is preferred. In Railway UI:
- doable-api service → Settings → Deploy → Custom Start Command =
  `node /app/services/api/dist/db/migrate.js && exec tmux-entrypoint api npx tsx services/api/src/index.ts`

This runs the migration before the api process takes over. Idempotent
because every migration is `IF NOT EXISTS`.

### Postgres plugin

Railway's Postgres plugin is a managed Postgres but **does not support
pgvector by default**. Two options:

1. **Use a Docker-based Postgres** (preferred): add a fifth Railway service
   `doable-postgres` using image `pgvector/pgvector:pg16`. Set
   `POSTGRES_PASSWORD` from shared vars, mount a persistent volume.
   `DATABASE_URL=postgres://postgres:${{shared.POSTGRES_PASSWORD}}@doable-postgres.railway.internal:5432/postgres`.
2. **Use Railway's managed Postgres + pgvector extension**: file a Railway
   support ticket to enable pgvector on your DB (they support it on
   request, no UI toggle). Once enabled, run `CREATE EXTENSION` via
   Railway's database query UI. Less control; faster onboarding.

We recommend option 1 for production; option 2 for "try Doable on Railway
fast" templates.

## Operator flow

1. Click "Deploy on Railway" button (URL points at the template).
2. Railway clones the template definition, prompts for required secrets.
3. Postgres service comes up first (~30s).
4. api service deploys — releaseCommand runs migrations (~10-30s) then
   starts api proper.
5. ws, web deploy in parallel (~30s each).
6. Visit `<doable-web>.up.railway.app/auth/register`.

## 1-click button

```markdown
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Fdoable-me%2Fdoable)
```

(Replace with the actual template URL once registered.)

## Railway-specific gotchas

- **`up.railway.app` domains are HTTPS-only** with Railway's wildcard cert.
  `NEXT_PUBLIC_*` URLs MUST use `https://` and `wss://`.
- **Internal service-to-service DNS** is `<service>.railway.internal`. Use
  this for `API_URL`, `WS_INTERNAL_URL`, `DATABASE_URL`.
- **Build vs Image deploy**: We MUST use Image (ghcr.io). The build path
  OOMs on Railway's 8GB sandbox during the Next.js build (Doable's web
  package is heavy with Monaco + Tailwind + 200+ dependencies).
- **Ephemeral filesystem**: api_projects + api_thumbnails do not survive
  redeploys. For production, configure object storage via
  `STORAGE_BACKEND=s3` etc. (see api code at `services/api/src/lib/storage/`).
- **Cost**: Railway charges by resource use. A typical Doable deployment
  (1 api / 1 ws / 1 web / 1 postgres) runs ~$15-25/mo on Railway's $5
  base + usage.

## Acceptance criteria

- [ ] `railway.json` validates against the Railway schema
- [ ] Template-based deploy works end-to-end with prompted secrets
- [ ] Migration runs via releaseCommand on api start
- [ ] Browser at `<doable-web>.up.railway.app` reaches landing page
- [ ] `/api/health` returns 200
- [ ] Postgres service uses pgvector image (or managed PG with extension
      enabled)
