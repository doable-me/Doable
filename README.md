# Doable

Dream it. Do it. Done. Tell AI what you want to do and Doable gets it done.

## Quick Start (Docker)

The fastest way to try Doable — no Node.js or PostgreSQL install needed:

```bash
git clone https://github.com/doable-me/doable.git
cd doable
./docker/setup.sh
```

When prompted, press Enter for localhost. Open <https://localhost> (accept the self-signed cert warning).

> See [`docker/README.md`](docker/README.md) for full Docker documentation: one-liner deploys, configuration, operations, and troubleshooting.

> **Note:** AI features require an API key. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `docker/.env`, or configure the GitHub Copilot SDK (see [AI Configuration](#ai-configuration)).

To stop everything: `docker compose -f docker/docker-compose.yml down` (add `-v` to also remove database data).

### Deploy with a Domain (one-liner)

To deploy on a server with a custom domain, nginx reverse proxy, and automatic SSL:

```bash
# One-liner: generates secrets, configures nginx, obtains Let's Encrypt SSL, builds & starts
DOMAIN=app.example.com ./docker/setup.sh

# Or with email for SSL cert notifications:
DOMAIN=app.example.com EMAIL=you@example.com ./docker/setup.sh
```

This script:
1. Generates `docker/.env` with random secrets and domain-aware URLs
2. Installs and configures **nginx** as a reverse proxy (ports 80/443 → internal services)
3. Obtains a free **Let's Encrypt** SSL certificate via certbot
4. Builds and starts all Docker containers
5. Configures UFW firewall (only ports 22, 80, 443 open)

**Behind Cloudflare or another proxy?** Use `--skip-ssl` to configure nginx with a self-signed certificate instead of Let's Encrypt:
```bash
DOMAIN=app.example.com ./docker/setup.sh --skip-ssl
```

### Deploy on a Private Network (no domain)

For LAN / air-gapped / private network deployments without a domain name — uses self-signed SSL:

```bash
# Private network — use your server's LAN IP:
HOST=192.168.1.50 ./docker/setup.sh

# Localhost only — self-signed SSL on 127.0.0.1:
./docker/setup.sh
```

Browsers will show a certificate warning for the self-signed cert. Accept it, or import `/etc/ssl/doable/cert.pem` into your OS/browser trust store.

> **Security:** In all modes, application services bind to `127.0.0.1` only. Only nginx accepts external connections.

## Quick Start (Docker)

The fastest way to try Doable — no Node.js or PostgreSQL install needed:

```bash
git clone https://github.com/nicekid1/doable.git
cd doable
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) once everything is up.

> **Note:** AI features require an API key. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in the `api` service environment inside `docker-compose.yml`, or configure the GitHub Copilot SDK (see [AI Configuration](#ai-configuration)).

To stop everything: `docker compose down` (add `-v` to also remove database data).

## Architecture

Monorepo managed with [pnpm](https://pnpm.io) workspaces and [Turborepo](https://turbo.build).

```
apps/
  web/          Next.js 15 frontend (React 19, Tailwind 4, Monaco Editor)
services/
  api/          Hono REST API (auth, projects, AI chat, billing)
  ws/           WebSocket server (Yjs CRDT real-time collaboration)
packages/
  db/           Database queries & types
  shared/       Shared types & utilities
  docore/       AI agent engine (wraps GitHub Copilot SDK)
  dovault/      Runtime sandbox for generated code
```

## Local Development Setup

### Prerequisites

- Node.js 22+ (20+ minimum)
- pnpm 9+
- PostgreSQL 16+ with extensions: `pgvector`, `pgcrypto`, `pg_trgm`
- [psmux](https://github.com/marlocarlo/psmux) (optional, Windows terminal multiplexer)

> **Tip:** Use the Docker Compose PostgreSQL service instead of installing PostgreSQL locally:
> ```bash
> docker compose up postgres
> ```

### Install & Run

```bash
# Install dependencies
pnpm install

# Copy environment file and configure
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET to a random string

# Run database migrations
pnpm db:migrate

# Start all services
pnpm dev
```

### Quick start (Windows)

```powershell
.\dev.ps1
```

Launches a psmux session with all three services. Use `.\dev.ps1 -Kill` to stop.

### Manual start

```bash
pnpm dev         # All services via Turborepo
pnpm dev:web     # http://localhost:3000
pnpm dev:api     # http://localhost:4000
pnpm dev:ws      # ws://localhost:4001
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| **Web** | 3000 | Next.js frontend with Turbopack |
| **API** | 4000 | Hono REST API (auth, projects, AI chat, billing) |
| **WS** | 4001 | WebSocket server for real-time collaboration |
| **PostgreSQL** | 5432 | Database (pgvector/pgcrypto/pg_trgm) |
<<<<<<< Updated upstream
| **Redis** | 6379 | Optional — shared rate limiting & sessions (for multi-instance) |
=======
>>>>>>> Stashed changes

## AI Configuration

Doable supports multiple AI backends. Set one of these in your `.env`:

| Provider | Environment Variable |
|----------|---------------------|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| GitHub Copilot SDK | `COPILOT_CLI_PATH` or `COPILOT_CLI_URL` |

## Optional Integrations

These are not required to run Doable but enable additional features:

| Feature | Variables | Purpose |
|---------|-----------|---------|
<<<<<<< Updated upstream
| Redis | `REDIS_URL` | Shared rate limiting & sessions (multi-instance) |
=======
>>>>>>> Stashed changes
| GitHub OAuth | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Login with GitHub |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login with Google |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing & subscriptions |
| S3 Storage | `S3_BUCKET`, `S3_ACCESS_KEY`, etc. | File uploads |

See `.env.example` for all available options and `.env.integrations.example` for OAuth provider setup.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all services in dev mode |
| `pnpm build` | Build all packages and services |
| `pnpm db:migrate` | Run database migrations |
| `pnpm type-check` | TypeScript type checking |
| `pnpm lint` | Run linting |
| `pnpm format` | Format code with Prettier |

<<<<<<< Updated upstream
## Security

- **Secrets**: Never commit real secrets. Use `docker/.env` (gitignored) for Docker deployments and `.env` for local dev. Generate secrets with `openssl rand -hex 32`.
- **Required secrets** (Docker will refuse to start without these): `JWT_SECRET`, `ENCRYPTION_KEY`, `INTERNAL_SECRET`.
- **Network binding**: All Docker services bind to `127.0.0.1` only — no ports are exposed to the public internet. Only nginx accepts external connections. This applies in ALL deployment modes (domain, private network, localhost).
- **Non-root containers**: API, WS, Web, and Migrate containers run as the unprivileged `node` user.
- **Database**: PostgreSQL is only accessible within the Docker network and via `127.0.0.1:5432` on the host.

## Production Deployment

### Docker + nginx (recommended)

```bash
# On a fresh Ubuntu 22.04+ server with Docker installed:
git clone https://github.com/doable-me/doable.git
cd doable

# Public domain with Let's Encrypt:
DOMAIN=app.example.com EMAIL=admin@example.com ./docker/setup.sh

# Or private network with self-signed SSL:
HOST=192.168.1.50 ./docker/setup.sh
```

This runs the automated setup: secret generation, nginx reverse proxy, SSL (Let's Encrypt or self-signed), Docker build, and starts all services.

### Bare-metal (setup-server.sh)

For a non-Docker deployment on a fresh Ubuntu server:

```bash
./setup-server.sh
```

This handles: Node.js 22, pnpm, PostgreSQL 16, Caddy, Cloudflare Tunnel, firewall (UFW deny-all + allow SSH), fail2ban, systemd services, and secure secret generation.

**Key production requirements:**
- Set unique, strong values for `JWT_SECRET`, `ENCRYPTION_KEY`, and `INTERNAL_SECRET`
- Configure `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_APP_URL` to match your domain
- Use a reverse proxy (nginx via `setup.sh`, or Caddy, Traefik, etc.) — never expose application ports directly
- Verify with `ss -tlnp` that no service binds to `0.0.0.0` (except SSH)

### Environment Variables Reference

See `docker/.env.example` for all Docker variables and `.env.example` for local development variables.

=======
>>>>>>> Stashed changes
## Contributing

1. Fork the repo and create a feature branch
2. Run `pnpm install` and `pnpm dev` to verify the setup works
3. Make your changes and ensure `pnpm type-check` passes
4. Submit a pull request

## License

[MIT](LICENSE)
