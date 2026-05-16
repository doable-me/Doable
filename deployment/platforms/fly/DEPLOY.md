# Doable — Fly.io Operator Guide

This guide covers a full fresh deployment of Doable on Fly.io: three apps
(`doable-api`, `doable-ws`, `doable-web`), a shared Postgres cluster, and
persistent volumes. Read every section before running commands.

---

## Prerequisites

- [flyctl](https://fly.io/docs/hands-on/install-flyctl/) installed and on PATH
- A Fly.io account with billing set up (shared-cpu machines require it)
- Docker-published images at `ghcr.io/doable-me/doable-{api,ws,web}:latest`
  (CI pushes these on every merge to main — no local build needed)

```bash
brew install flyctl          # macOS
# or: curl -L https://fly.io/install.sh | sh   # Linux / WSL
fly auth login
```

---

## Architecture on Fly

```
Internet
  └─► doable-web  (public, fly.dev + custom domain, port 3000)
        ├─► /api/*  rewritten → http://doable-api.flycast:4000  (private)
        └─► /ws/*   rewritten → http://doable-ws.flycast:4001   (private)

doable-api ──► doable-postgres (Fly Postgres, private)
doable-ws  ──► doable-postgres (same cluster, shared)
```

api and ws are **internal-only** — no public IP, reachable only via Fly's
private WireGuard network (`flycast`). The web app's Next.js rewrites proxy
browser traffic to them.

---

## One-time Setup

You can run `deployment/platforms/fly/migrate.sh` (see below) to automate most of this, or follow
the manual steps.

### 1. Create the apps

```bash
fly apps create doable-api
fly apps create doable-ws
fly apps create doable-web
```

### 2. Create Postgres and volumes

```bash
fly postgres create --name doable-postgres --region iad \
  --vm-size shared-cpu-1x --volume-size 10

fly volumes create doable_api_data --app doable-api --size 5 --region iad
fly volumes create doable_ws_data  --app doable-ws  --size 1 --region iad
```

### 3. Attach DB to api and ws

`fly postgres attach` automatically sets the `DATABASE_URL` secret on the
target app.

```bash
fly postgres attach --app doable-api doable-postgres
fly postgres attach --app doable-ws  doable-postgres
```

### 4. Enable Postgres extensions

```bash
echo "CREATE EXTENSION IF NOT EXISTS vector; \
      CREATE EXTENSION IF NOT EXISTS pg_trgm; \
      CREATE EXTENSION IF NOT EXISTS pgcrypto;" \
  | fly postgres connect --app doable-postgres
```

### 5. Set required secrets on api

Generate cryptographically random values for each secret. **Never reuse these
across environments.**

```bash
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
```

> **Custom domain**: if you have `app.example.com` instead of
> `doable-web.fly.dev`, replace all three URL values above with your domain
> and run `fly certs add app.example.com --app doable-web`.

### 6. Mirror shared secrets to ws

Fly does **not** expose secret values across apps. Copy `JWT_SECRET` and
`INTERNAL_SECRET` to `doable-ws` manually with the same values you used above:

```bash
fly secrets set --app doable-ws \
  JWT_SECRET=<same value as doable-api> \
  INTERNAL_SECRET=<same value as doable-api>
```

### 7. Optional: AI provider keys

Uncomment whichever providers you want:

The 19 vars `seedAiProviderFromEnv()` consumes at api boot. Set any one or more:

```bash
fly secrets set --app doable-api \
  # ANTHROPIC_API_KEY=sk-ant-... \
  # OPENAI_API_KEY=sk-... \
  # GEMINI_API_KEY=... \
  # OPENROUTER_API_KEY=sk-or-v1-... \
  # TOGETHER_API_KEY=... \
  # FIREWORKS_API_KEY=... \
  # OPENCODE_ZEN_API_KEY=... \
  # GROQ_API_KEY=gsk_... \
  # CEREBRAS_API_KEY=... \
  # DEEPSEEK_API_KEY=sk-... \
  # MISTRAL_API_KEY=... \
  # COHERE_API_KEY=... \
  # XAI_API_KEY=xai-... \
  # PERPLEXITY_API_KEY=pplx-... \
  # DEEPINFRA_API_KEY=... \
  # NVIDIA_API_KEY=nvapi-... \
  # MINIMAX_API_KEY=... \
  # MOONSHOT_API_KEY=... \
  # ZHIPU_API_KEY=...
```

Local providers (Ollama, LM Studio, vLLM, …) need no env var — configure them in the setup wizard at runtime with their own base URL.

---

## Deploy

```bash
# Deploy in order: api first (runs DB migrations via release_command),
# then ws, then web.
fly deploy --app doable-api --config deployment/platforms/fly/api.toml
fly deploy --app doable-ws  --config deployment/platforms/fly/ws.toml
fly deploy --app doable-web --config deployment/platforms/fly/web.toml
```

Each deploy streams logs. The api deploy runs
`node /app/services/api/dist/db/migrate.js` before the new machine becomes
live (Fly release phase) — watch for migration output in the log stream.

### Re-deploy after image update

CI tags `ghcr.io/doable-me/doable-{api,ws,web}:latest` on every main merge.
To pick up the new images:

```bash
fly deploy --app doable-api --config deployment/platforms/fly/api.toml --image ghcr.io/doable-me/doable-api:latest
fly deploy --app doable-ws  --config deployment/platforms/fly/ws.toml  --image ghcr.io/doable-me/doable-ws:latest
fly deploy --app doable-web --config deployment/platforms/fly/web.toml  --image ghcr.io/doable-me/doable-web:latest
```

---

## Smoke-test

```bash
# Public health check
curl -i https://doable-web.fly.dev/
curl -i https://doable-web.fly.dev/api/health

# Internal health check (from inside the private network)
fly ssh console --app doable-web
# Inside the console:
curl http://doable-api.flycast:4000/health
curl http://doable-ws.flycast:4001/health
exit

# Then open a browser:
# https://doable-web.fly.dev/auth/register
```

---

## Gotchas

| Issue | Fix |
|---|---|
| `flycast` hostname not resolving | Fly private networking uses WireGuard; `.flycast` only works machine-to-machine, not from your laptop. Use `fly ssh console` for internal curl tests. |
| `auto_stop_machines = "stop"` causes slow first request | Expected. `min_machines_running = 1` keeps one machine warm at all times. |
| Volume region mismatch | Volumes are pinned per region. If you scale to a second region, create per-region volumes first. |
| Cross-app secret sharing | Fly intentionally does not expose secret values across apps. Set `JWT_SECRET` and `INTERNAL_SECRET` on both api and ws with identical values. |
| `INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT` expired | Re-generate: `fly secrets set --app doable-api INSTALL_BOOTSTRAP_TOKEN=$(openssl rand -hex 32) INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT=$(date -u -d '+24 hours' +%Y-%m-%dT%H:%M:%SZ)` |
| Migration fails on release | Check `fly releases --app doable-api` and `fly logs --app doable-api` for the release phase output. Fix the migration, push a new image, redeploy. |

---

## Cost estimate (idle)

| Resource | Price |
|---|---|
| 3 × shared-cpu-1x machines | ~$5.82/mo |
| Fly Postgres shared-cpu-1x | ~$1.94/mo |
| 3 volumes (5 GB + 1 GB + default) | ~$0.60/mo |
| **Total idle** | **~$8–10/mo** |

Traffic adds egress ($0.02/GB outbound after 160 GB free).
