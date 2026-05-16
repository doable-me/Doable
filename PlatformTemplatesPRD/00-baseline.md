# 00 — Baseline: shared env contract, images, and runtime mechanism

The canonical reference every per-platform doc points back at. If any of these
constants change, update this doc first, then propagate to all platform
templates.

## Service topology

Four containers + one Postgres. All app containers bind `0.0.0.0` **inside**
the container; the host port mapping pins to `127.0.0.1` so only the
fronting proxy/ingress is publicly reachable.

```
                       ┌──────────────────────┐
   Internet ─────► 80/443 of platform's ingress (Coolify Traefik,
                       │  DO ingress, Render proxy, Fly fly-proxy, k8s
                       │  Ingress controller, etc.)
                       └─────────┬────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
       web :3000           api :4000            ws :4001
       Next.js standalone  Hono REST API        Yjs websocket
            │                    │                    │
            └────────────────────┴────────────────────┘
                                 │
                                 ▼
                      postgres :5432 (pgvector/pgvector:pg16)
                                 ▲
                                 │ once at startup
                      migrate (one-shot Job)
```

**Start ordering** (every platform template must enforce this):

1. `postgres` starts and reports healthy
2. `migrate` runs to completion (exit 0)
3. `api` and `ws` start in parallel; both depend on `migrate` having completed
4. `web` starts; depends on `api` and `ws` running (Next.js server-side fetches)

## Published image references

After the first `vX.Y.Z` tag fires `.github/workflows/publish-docker-images.yml`:

```
ghcr.io/doable-me/doable-api:vX.Y.Z       ghcr.io/doable-me/doable-api:latest
ghcr.io/doable-me/doable-ws:vX.Y.Z        ghcr.io/doable-me/doable-ws:latest
ghcr.io/doable-me/doable-web:vX.Y.Z       ghcr.io/doable-me/doable-web:latest
ghcr.io/doable-me/doable-migrate:vX.Y.Z   ghcr.io/doable-me/doable-migrate:latest
```

The same image is `amd64`-only at v0.x. arm64 is a follow-up build matrix
addition (low-effort, defer until a user asks).

**Tag policy** (canonical):
- `:vX.Y.Z` — immutable, pinned to a single commit. Platform templates that
  target production SHOULD use `vX.Y.Z` pinning, not `:latest`.
- `:latest` — always tracks the most recent published `vX.Y.Z`. Built only
  off tagged commits, never off main HEAD between releases.

## Required secrets (5)

Every deployment MUST set these. Compose / k8s / app-spec validation will
refuse to start without them.

| Var | How to generate | Notes |
|-----|----------------|-------|
| `JWT_SECRET` | `openssl rand -hex 32` | Signs access + refresh JWTs |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` | Symmetric key for legacy column-encryption paths |
| `INTERNAL_SECRET` | `openssl rand -hex 32` | Internal api ↔ ws auth (HMAC on the loopback) |
| `DOABLE_KEK` | `openssl rand -base64 32` | Key-encryption-key for envelope-encrypted secrets stored via the wizard. **Never roll this — rolling it equals data loss on every wizard-saved credential.** |
| `POSTGRES_PASSWORD` | `openssl rand -hex 16` | Set on the Postgres service, passed to api/ws/migrate via `DATABASE_URL` |

## Bootstrap (optional, but always shipped)

| Var | Default | Notes |
|-----|---------|-------|
| `INSTALL_BOOTSTRAP_TOKEN` | `openssl rand -hex 32` | Single-use signup token. If the users table is empty, the first signup gets platform-owner; if it's not empty but the token is presented and unexpired, the holder is granted platform-owner. |
| `INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT` | install time + 24h, ISO8601 UTC | Once expired, the token-presentation path closes; the empty-table path still works for true greenfield installs. |

## URL contract

| Var | Set at | Purpose |
|-----|--------|---------|
| `NEXT_PUBLIC_API_URL` | RUNTIME for prebuilt images; BUILD for source builds | What the browser fetches the api at |
| `NEXT_PUBLIC_WS_URL` | RUNTIME for prebuilt; BUILD for source | WebSocket connect target |
| `NEXT_PUBLIC_APP_URL` | RUNTIME for prebuilt; BUILD for source | Self-URL for absolute links in emails / OG tags |
| `CORS_ORIGINS` | RUNTIME | Comma-list of origins the api accepts. Usually `https://<your-domain>` |
| `API_URL` | RUNTIME (in-cluster only) | What web's server-side code fetches the api at (e.g. `http://api:4000`) |
| `WS_INTERNAL_URL` | RUNTIME | What api uses to ping ws internally (e.g. `http://ws:4001`) |

The api/ws/web each ALSO accept `API_PORT`, `WS_PORT`, `PORT`, `API_HOST`,
`WS_HOST`, `HOSTNAME` — all already wired up in the published images. Default
values in the published images match the standalone-deploy story; only
override when running behind a non-default reverse proxy.

## NEXT_PUBLIC_* runtime-placeholder mechanism

Next.js inlines `NEXT_PUBLIC_*` env vars into the client bundle at **build
time**. A pre-built distributable image would therefore be locked to whatever
URL it was built with, breaking the "one image, any deployment" promise.

The doable web image is built with placeholder strings instead:
- `NEXT_PUBLIC_API_URL=__DOABLE_API_URL__`
- `NEXT_PUBLIC_WS_URL=__DOABLE_WS_URL__`
- `NEXT_PUBLIC_APP_URL=__DOABLE_APP_URL__`

The web container's `ENTRYPOINT` is `docker/web-runtime-entrypoint.sh`, which
on startup does:

1. Read `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_APP_URL`
   from the container env (set by the platform template).
2. `find /app/apps/web/.next/standalone /app/apps/web/.next/static -type f
   \( -name '*.js' -o -name '*.html' -o -name '*.json' -o -name '*.css' \)`
3. `sed -i -e "s|__DOABLE_API_URL__|${API_URL}|g" ...` on each file
4. `exec` the original CMD (`tmux-entrypoint web node apps/web/server.js`)

For local source builds (via `docker/docker-compose.yml`), the build args pass
real URLs, the placeholders never make it into the bundle, and the runtime sed
finds no matches and is a no-op (~50-100ms scan).

**Per-platform template implications:**
- Templates pointing at `ghcr.io/doable-me/doable-web:<tag>` MUST set
  `NEXT_PUBLIC_*` at RUNTIME (container env). Build-args don't apply to image
  pulls.
- Templates that build from source (none of our managed-PaaS templates do
  this — only `docker-compose.yml` does) SHOULD pass `NEXT_PUBLIC_*` as build
  args so the runtime sed is a no-op.

## AI provider env-seed list (19 vars)

The api's `seedAiProviderFromEnv()` at boot copies the first non-empty match
from this precedence-ordered list into `platform_config` so the setup wizard's
Step 2 shows "configured" without manual entry. **Every platform template MUST
pass all 19 through** so the operator can pre-export any one of them.

| Var | Provider | Default baseUrl | Default model |
|-----|----------|-----------------|--------------|
| `ANTHROPIC_API_KEY` | Anthropic | `https://api.anthropic.com` | `claude-sonnet-4-6` |
| `OPENAI_API_KEY` | OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| `GEMINI_API_KEY` | Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-2.5-pro` |
| `OPENROUTER_API_KEY` | OpenRouter aggregator | `https://openrouter.ai/api/v1` | — |
| `TOGETHER_API_KEY` | Together AI | `https://api.together.xyz/v1` | — |
| `FIREWORKS_API_KEY` | Fireworks AI | `https://api.fireworks.ai/inference/v1` | — |
| `OPENCODE_ZEN_API_KEY` | OpenCode Zen | `https://opencode.ai/zen/v1` | — |
| `GROQ_API_KEY` | Groq | `https://api.groq.com/openai/v1` | — |
| `CEREBRAS_API_KEY` | Cerebras | `https://api.cerebras.ai/v1` | — |
| `DEEPSEEK_API_KEY` | DeepSeek | `https://api.deepseek.com` | — |
| `MISTRAL_API_KEY` | Mistral AI | `https://api.mistral.ai/v1` | — |
| `COHERE_API_KEY` | Cohere | `https://api.cohere.ai/compatibility/v1` | — |
| `XAI_API_KEY` | xAI Grok | `https://api.x.ai/v1` | — |
| `PERPLEXITY_API_KEY` | Perplexity | `https://api.perplexity.ai` | — |
| `DEEPINFRA_API_KEY` | DeepInfra | `https://api.deepinfra.com/v1/openai` | — |
| `NVIDIA_API_KEY` | NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | — |
| `MINIMAX_API_KEY` | MiniMax | `https://api.minimax.io/v1` | `MiniMax-M2.7` |
| `MOONSHOT_API_KEY` | Moonshot/Kimi | `https://api.moonshot.ai/v1` | — |
| `ZHIPU_API_KEY` | Zhipu GLM | `https://open.bigmodel.cn/api/paas/v4` | — |

**Doable does NOT bundle, ship, or proxy any third-party AI keys.** Every key
is BYOK — the operator obtains it from the provider directly. Local providers
(Ollama, LM Studio, vLLM, llama.cpp, Jan, LocalAI, …) are configured at
runtime via the wizard with their own base URL (no env var; no API key).

## Optional integrations

These can stay empty; the wizard can fill them at runtime.

| Var | Purpose |
|-----|---------|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth signin + repo-import |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth signin |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Paid plans |
| `REDIS_URL` | Shared rate-limit + session state across multi-instance deploys; empty = in-memory KV (fine up to ~100 users) |

## Network security invariant

All app services bind to `127.0.0.1` on the host (or are ClusterIP-only in
k8s). Exactly one fronting proxy/ingress takes 80/443. The published images
bind `0.0.0.0` **inside** the container — that's Docker networking, not
public exposure. Templates that don't preserve this invariant must be rejected
at review.

Concretely:
- Compose / Coolify / Docker Stack: port mappings always `127.0.0.1:NNNN:NNNN`
- DigitalOcean App Platform: web is the only `service` with a `routes:` block;
  api/ws use internal `${api.PRIVATE_URL}` URLs
- Fly.io: api/ws are `internal` services (flycast-only); web is the only
  public app
- Kubernetes: api/ws/postgres are `ClusterIP`; only web (or an Ingress)
  faces the LoadBalancer

## Migration handling per platform

Every platform must run `migrate` before `api` and `ws` start. The image is
idempotent — re-running on an already-migrated DB is a no-op (every migration
SQL is `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … IF NOT EXISTS`).

| Platform | Migration mechanism |
|---|---|
| Compose / Coolify | `depends_on: { migrate: { condition: service_completed_successfully } }` |
| DigitalOcean | App Platform pre-deploy `jobs:` block |
| Fly.io | `release_command = "node services/api/dist/db/migrate.js"` in api's fly.toml |
| Railway | `releaseCommand` field in service config (similar to Heroku release phase) |
| Render | `preDeployCommand` field on the api service |
| Kubernetes | `Job` resource with `initContainer` blocking on its completion (or Helm pre-install hook) |
| Heroku app.json | `release` script in `scripts:` block |

## Volume contract

| Volume | Service | Purpose |
|---|---|---|
| `postgres_data` | postgres | Database storage |
| `api_projects` | api | Per-project source trees (the AI-built apps live here) |
| `api_thumbnails` | api | Generated screenshots for marketplace listings |
| `ws_projects` | ws | Per-project Yjs persistence files (shared mount with api_projects on some platforms) |

On Kubernetes, these are PVCs. On Fly, `fly volumes`. On managed PaaS (DO,
Render, Railway), services have ephemeral filesystems — projects/thumbnails
SHOULD use an object-storage backend (S3/Spaces/R2) configured via env vars,
OR accept that uploads survive only the lifetime of the container. The
default published image uses local filesystem; per-platform docs flag where
this matters.
