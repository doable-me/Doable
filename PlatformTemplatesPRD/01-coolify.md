# 01 — Coolify (self-hosted PaaS)

Coolify is the most common self-hosted PaaS target for Doable's audience
(creators, designers, small teams running on their own VPS). It runs on
Docker + Traefik on a single VPS (or a small swarm) and reads
`docker-compose.yml` directly.

## Deliverable

**No new manifest file is needed.** Coolify can consume our existing
`docker/docker-compose.prod.yml` as-is. The deliverable is the
`docker/coolify.md` operator guide documenting the connect flow.

## Operator flow (canonical)

1. SSH to a fresh Ubuntu 22.04/24.04 VPS. Install Coolify per
   <https://coolify.io/docs/installation>.
2. In the Coolify UI: Resources → New → Public Repository → enter the public
   git URL: `https://github.com/doable-me/doable.git`.
3. Build Pack = **Docker Compose**.
4. Docker Compose Location = `docker/docker-compose.prod.yml` (the prebuilt
   variant — pulls from ghcr.io, no on-VPS build needed).
5. Coolify auto-detects the 4 services + postgres. Configure each:
   - **postgres**: persistent volume `postgres_data` (Coolify creates a
     Docker volume). No public domain.
   - **migrate**: no domain, no persistent volume. Mark as one-shot (Coolify
     supports services with `restart: "no"`).
   - **api**, **ws**: internal-only by default (no public domain assigned).
   - **web**: assign a public domain. Coolify creates the Traefik route +
     issues a Let's Encrypt cert.
6. Set env vars (Coolify env-secrets UI). At minimum:
   - The five secrets from
     [00-baseline.md](00-baseline.md#required-secrets-5). Coolify can
     generate-random for each.
   - `INSTALL_BOOTSTRAP_TOKEN` (generate) +
     `INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT` (manual ISO8601 string, 24h ahead).
   - At least one of the 19 AI provider keys, OR skip (configure later via
     the wizard).
   - `NEXT_PUBLIC_API_URL=https://<your-domain>/api`
   - `NEXT_PUBLIC_WS_URL=wss://<your-domain>/ws`
   - `NEXT_PUBLIC_APP_URL=https://<your-domain>`
   - `CORS_ORIGINS=https://<your-domain>`
7. Click Deploy. Coolify pulls the four images (~30s), runs migrate, then
   brings up api/ws/web behind Traefik.
8. Visit `https://<your-domain>/auth/register`. First user becomes platform
   admin. Setup wizard runs at `/setup`.

## Coolify-specific notes

- **Traefik is Coolify's reverse proxy.** Our docker/setup.sh nginx is
  irrelevant in this path — Coolify handles 80/443 termination and routes
  per-service. The `docker/nginx.conf.template` is unused.
- **Coolify rewrites docker-compose port bindings.** It expects services to
  expose ports without `127.0.0.1:` prefixes so Traefik can route. The
  prebuilt compose binds `127.0.0.1:NNNN:NNNN`; Coolify reads the second
  number and routes Traefik traffic to it. If you see "service not
  reachable" in Coolify, double-check Traefik labels (Coolify adds them
  automatically).
- **Magic env handling for NEXT_PUBLIC_*** is documented in
  [00-baseline.md](00-baseline.md#next_public_-runtime-placeholder-mechanism).
  Coolify just sets the env vars at container runtime; the web container's
  entrypoint sed-replaces the build-baked placeholders.
- **Coolify-managed Postgres alternative**: if you'd rather use Coolify's
  managed Postgres service (separate resource), set `DATABASE_URL` on
  migrate/api/ws to point at it and remove the `postgres` service from
  the compose. The pgvector extension MUST be available — Coolify's default
  Postgres image is `postgres:16-alpine` which doesn't ship it. Stick with
  the bundled `pgvector/pgvector:pg16` service unless you've manually built
  a Coolify Postgres image with pgvector.
- **Persistent volume gotcha**: Coolify deletes volumes when a stack is
  deleted. To survive stack recreation, name the postgres volume explicitly
  in `docker-compose.prod.yml` (already done — the volume is named
  `postgres_data`, Coolify keeps it as `<stack-name>_postgres_data`).

## Acceptance criteria

- [ ] An admin clicking through the Coolify UI with the public repo URL
      reaches the wizard at `https://<domain>/setup` without editing any
      compose YAML.
- [ ] Postgres survives stack restart (re-deploy uses existing volume).
- [ ] Setup wizard's AI step shows MiniMax / OpenAI / etc. pre-configured
      if the corresponding env var was set in the Coolify UI.

## Verification

Smoke-test against a fresh Coolify install:

```bash
# After deploy:
curl -k https://<domain>/api/health
# → {"status":"healthy","timestamp":"...","checks":{"database":{"status":"up"}}}

curl -k https://<domain>/
# → 200 HTML (Next.js root)
```

If both pass, deploy is good. Then run the smoke harness from
`scripts/smoke-tests-docker.sh` against `HOST=<domain>`.
