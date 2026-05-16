# 05 — Fly.io

Fly.io's model is one-app-per-`fly.toml`. Each Doable service is its own
Fly app, plus a Fly Postgres cluster. Fly's internal DNS lets apps talk to
each other privately via `<app>.flycast` or `<app>.internal`.

## Deliverable

Three new files in `fly/`:
- `fly/api.toml`
- `fly/ws.toml`
- `fly/web.toml`

Plus a `fly/DEPLOY.md` operator guide and a one-shot `fly/migrate.sh` script.

## fly/api.toml (target)

```toml
app = "doable-api"
primary_region = "iad"

[build]
  image = "ghcr.io/doable-me/doable-api:latest"

[experimental]
  auto_rollback = true

# Run migrations before every deploy (Heroku-style release phase).
# The migrate image's CMD runs services/api/src/db/migrate.ts; since api
# also has that code, we can just invoke it from the same image instead
# of pulling the migrate image separately.
[deploy]
  release_command = "node /app/services/api/dist/db/migrate.js"
  strategy = "rolling"

[env]
  API_PORT = "4000"
  API_HOST = "0.0.0.0"
  WS_PORT = "4001"
  WS_HOST = "0.0.0.0"
  WS_INTERNAL_URL = "http://doable-ws.flycast:4001"
  API_URL = "http://doable-api.flycast:4000"
  NODE_ENV = "production"
  PROJECTS_ROOT = "/data/projects"

# Internal-only service (no public IP) — only doable-web reaches this via
# flycast. The browser hits api via doable-web's /api proxy path.
[[services]]
  internal_port = 4000
  protocol = "tcp"
  auto_stop_machines = "stop"     # scales to zero when idle
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

  [[services.ports]]
    port = 4000

[checks]
  [checks.health]
    type = "http"
    interval = "15s"
    timeout = "5s"
    grace_period = "30s"
    method = "GET"
    path = "/health"

[mounts]
  source = "doable_api_data"
  destination = "/data"
```

Secrets set via `fly secrets set` (not in fly.toml — they're encrypted at
rest by Fly):
- `DATABASE_URL` (from `fly postgres attach`)
- `JWT_SECRET`, `ENCRYPTION_KEY`, `INTERNAL_SECRET`, `DOABLE_KEK`
- `INSTALL_BOOTSTRAP_TOKEN`, `INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT`
- All 19 AI provider keys (optional)
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_APP_URL` = the
  doable-web app's public URL (`https://doable-web.fly.dev`) with `/api`,
  `/ws` paths
- `CORS_ORIGINS` = doable-web's public URL

## fly/ws.toml

```toml
app = "doable-ws"
primary_region = "iad"

[build]
  image = "ghcr.io/doable-me/doable-ws:latest"

[env]
  WS_PORT = "4001"
  WS_HOST = "0.0.0.0"
  API_URL = "http://doable-api.flycast:4000"
  NODE_ENV = "production"

[[services]]
  internal_port = 4001
  protocol = "tcp"
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

  [[services.ports]]
    port = 4001

[mounts]
  source = "doable_ws_data"
  destination = "/data"
```

Shared secrets via `fly secrets set --app doable-ws`: `DATABASE_URL`,
`JWT_SECRET`, `INTERNAL_SECRET`.

## fly/web.toml

```toml
app = "doable-web"
primary_region = "iad"

[build]
  image = "ghcr.io/doable-me/doable-web:latest"

[env]
  HOSTNAME = "0.0.0.0"
  PORT = "3000"
  NODE_ENV = "production"
  NEXT_PUBLIC_API_URL = "https://doable-web.fly.dev/api"
  NEXT_PUBLIC_WS_URL = "wss://doable-web.fly.dev/ws"
  NEXT_PUBLIC_APP_URL = "https://doable-web.fly.dev"

# Public-facing service
[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

  [http_service.concurrency]
    type = "requests"
    hard_limit = 250
    soft_limit = 200

# Proxy /api/* and /ws/* to the internal flycast services.
# Fly's machines proxy doesn't natively reverse-proxy, so this is handled
# by Next.js rewrites in apps/web/next.config.ts (already configured to
# rewrite /api → API_URL and /ws → WS_URL when those env vars point at
# fly.internal/.flycast names).

[checks]
  [checks.web_health]
    type = "http"
    interval = "30s"
    timeout = "5s"
    grace_period = "30s"
    method = "GET"
    path = "/"
```

## Postgres setup

```bash
fly postgres create --name doable-postgres --region iad --vm-size shared-cpu-1x --volume-size 10
fly postgres attach --app doable-api doable-postgres
# This sets DATABASE_URL secret on doable-api automatically.
# Repeat for ws (which also needs DATABASE_URL):
fly postgres attach --app doable-ws doable-postgres
```

**pgvector caveat**: Fly Postgres ships pgvector but it's not enabled by
default. SSH into the cluster and enable:

```bash
fly postgres connect --app doable-postgres
postgres=# CREATE EXTENSION IF NOT EXISTS vector;
postgres=# CREATE EXTENSION IF NOT EXISTS pg_trgm;
postgres=# CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## Operator flow (canonical)

```bash
# One-time setup
brew install flyctl  # or: curl -L https://fly.io/install.sh | sh
fly auth login

cd doable

# Create the three apps + postgres + volumes
fly apps create doable-api
fly apps create doable-ws
fly apps create doable-web
fly postgres create --name doable-postgres --region iad

# Provision storage
fly volumes create doable_api_data --app doable-api --size 5 --region iad
fly volumes create doable_ws_data --app doable-ws --size 1 --region iad

# Attach DB to api + ws
fly postgres attach --app doable-api doable-postgres
fly postgres attach --app doable-ws doable-postgres

# Enable pgvector
echo "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS pgcrypto;" | fly postgres connect --app doable-postgres

# Set required secrets on api (ws + web inherit shared values via fly.toml + fly secrets)
fly secrets set --app doable-api \
  JWT_SECRET=$(openssl rand -hex 32) \
  ENCRYPTION_KEY=$(openssl rand -hex 32) \
  INTERNAL_SECRET=$(openssl rand -hex 32) \
  DOABLE_KEK=$(openssl rand -base64 32) \
  INSTALL_BOOTSTRAP_TOKEN=$(openssl rand -hex 32) \
  INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT=$(date -u -d '+24 hours' +%Y-%m-%dT%H:%M:%SZ) \
  NEXT_PUBLIC_API_URL=https://doable-web.fly.dev/api \
  NEXT_PUBLIC_WS_URL=wss://doable-web.fly.dev/ws \
  NEXT_PUBLIC_APP_URL=https://doable-web.fly.dev \
  CORS_ORIGINS=https://doable-web.fly.dev

# Mirror JWT_SECRET + INTERNAL_SECRET onto ws
JWT=$(fly secrets list --app doable-api -j | jq -r '.[] | select(.Name=="JWT_SECRET") | .Digest')
# (Use fly secrets set --app doable-ws JWT_SECRET=<value> manually — Fly
# doesn't expose secret values for cross-app sharing for security.)

# Optional AI provider keys (any one or more)
fly secrets set --app doable-api OPENAI_API_KEY=sk-... ANTHROPIC_API_KEY=sk-ant-...

# Deploy all three
fly deploy --app doable-api --config fly/api.toml
fly deploy --app doable-ws --config fly/ws.toml
fly deploy --app doable-web --config fly/web.toml

# Visit https://doable-web.fly.dev/auth/register
```

## Fly-specific gotchas

- **flycast vs .internal**: `.flycast` is the load-balanced public-tcp
  alias; `.internal` is direct machine-to-machine WireGuard. Use
  `.flycast` for HTTP (api/ws) — Fly handles failover.
- **`auto_stop_machines = "stop"`** scales to zero when idle. For api/ws,
  set `min_machines_running = 1` so the first request doesn't pay a cold
  start. For web, also keep 1 minimum.
- **Cross-app secret sharing**: Fly intentionally doesn't expose secret
  values across apps. JWT_SECRET / INTERNAL_SECRET must be set on both
  api and ws explicitly with the same value.
- **Volume regions**: volumes are pinned to one region. If you scale to a
  second region, volumes don't follow — you need per-region volumes.
- **Cost estimate**: 3 apps × shared-cpu-1x ($1.94/mo) + postgres
  shared-cpu-1x ($1.94/mo) + 3 small volumes (~$1) = ~$10/mo idle, more
  with traffic.

## Acceptance criteria

- [ ] All three `fly.toml` files validate with `fly config validate`
- [ ] `fly deploy` succeeds for each app
- [ ] `doable-api.flycast:4000/health` returns 200 from inside the Fly
      private network (test via `fly ssh console --app doable-web` then
      `curl http://doable-api.flycast:4000/health`)
- [ ] `https://doable-web.fly.dev` returns 200 HTML
- [ ] `https://doable-web.fly.dev/api/health` returns 200 (Next.js
      rewrite path proxies to api)
- [ ] First user registration succeeds and gets platform-admin
