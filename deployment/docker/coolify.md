# Deploying Doable on Coolify

Coolify is a self-hosted PaaS that runs on Docker + Traefik on a single VPS
(or a small swarm). It reads `docker-compose.yml` directly, so there is no
new manifest file for Coolify — this guide describes the connect flow against
the prebuilt `deployment/docker/docker-compose.prod.yml` (pulls from `ghcr.io/doable-me/doable-*`).


## Prerequisites

- A fresh Ubuntu 22.04 / 24.04 VPS (2 vCPU, 4 GB RAM, 40 GB disk minimum)
- A domain name pointed at the VPS IP (A record)
- Coolify installed: <https://coolify.io/docs/installation>

## Connect flow

1. **Log into Coolify** → Resources → New → Public Repository.
2. **Public git URL**: `https://github.com/doable-me/doable.git`.
3. **Build Pack**: Docker Compose.
4. **Docker Compose Location**: `deployment/docker/docker-compose.prod.yml` (the prebuilt
   variant — pulls images from ghcr.io, no on-VPS build).
5. **Coolify auto-detects** the 4 services + postgres. Configure each:
   - **postgres**: persistent volume `postgres_data` (Coolify creates a
     Docker volume automatically). No public domain.
   - **migrate**: no domain, no persistent volume. Restart policy: `no` —
     it's a one-shot Job.
   - **api**, **ws**: internal-only by default (no public domain assigned).
   - **web**: assign a public domain. Coolify creates the Traefik route +
     issues a Let's Encrypt cert.
6. **Set env vars** (Coolify env-secrets UI). At minimum:
   - The five required secrets (Coolify can generate-random):
     - `JWT_SECRET`
     - `ENCRYPTION_KEY`
     - `INTERNAL_SECRET`
     - `DOABLE_KEK` (base64 — `openssl rand -base64 32`)
     - `POSTGRES_PASSWORD`
   - Bootstrap:
     - `INSTALL_BOOTSTRAP_TOKEN` (generate)
     - `INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT` (manual ISO8601, 24h ahead —
       e.g. `2026-05-17T12:00:00Z`)
   - At least one of the 19 AI provider keys (or skip — the setup wizard
     can configure them at runtime). The setup wizard lists all supported providers.
   - URL contract:
     - `NEXT_PUBLIC_API_URL=https://<your-domain>/api`
     - `NEXT_PUBLIC_WS_URL=wss://<your-domain>/ws`
     - `NEXT_PUBLIC_APP_URL=https://<your-domain>`
     - `CORS_ORIGINS=https://<your-domain>`
7. **Click Deploy.** Coolify pulls the four images (~30s on a 100 Mbit/s VPS),
   runs migrate, then brings up api/ws/web behind Traefik.
8. **First user**: visit `https://<your-domain>/auth/register`. The first
   user becomes the platform owner. The `/setup` wizard runs after signup.

## Coolify-specific notes

- **Traefik is Coolify's reverse proxy.** The nginx templates and setup script nginx code are unused on this path — Coolify handles
  80/443 termination and adds Traefik labels automatically.
- **Coolify rewrites port bindings.** The prebuilt compose binds
  `127.0.0.1:NNNN:NNNN`; Coolify reads the second number for routing. If you
  see "service not reachable", double-check Traefik labels (Coolify usually
  adds them on Save).
- **NEXT_PUBLIC_* runtime substitution** works transparently — Coolify sets
  the env vars at container runtime, and the web container's entrypoint
  (the web container's entrypoint) sed-replaces the build-baked
  placeholders. One image, any deployment URL.
- **Coolify-managed Postgres alternative**: if you'd rather use Coolify's
  managed Postgres service (a separate resource), set `DATABASE_URL` on
  migrate/api/ws to point at it and remove the `postgres` service from the
  compose. The pgvector extension MUST be available — Coolify's default
  `postgres:16-alpine` image doesn't ship it. Stick with the bundled
  `pgvector/pgvector:pg16` service unless you've built a custom Coolify
  Postgres image with pgvector.
- **Persistent-volume gotcha**: Coolify deletes volumes when a stack is
  deleted. The compose names the volume `postgres_data` explicitly so
  Coolify keeps it as `<stack-name>_postgres_data` across re-deploys.

## Smoke test

After deploy:

```bash
curl https://<your-domain>/api/health
# Expected: {"status":"healthy","timestamp":"...","checks":{"database":{"status":"up"}}}

curl -I https://<your-domain>/
# Expected: HTTP/2 200, content-type: text/html
```

If both pass, run `scripts/smoke-tests-docker.sh HOST=<your-domain>` for the
full smoke harness.

## Upgrading

Coolify "Force Rebuild" pulls fresh `:latest` images. For pinned upgrades,
set `DOABLE_IMAGE_TAG=v0.2.0` in the env (the compose references
`${DOABLE_IMAGE_TAG:-latest}`).
