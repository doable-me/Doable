# Doable

Build apps and websites by chatting with AI.

## Quick Start (Docker)

The fastest way to try Doable — no Node.js or PostgreSQL install needed:

```bash
git clone https://github.com/doable-me/doable.git
cd doable

# Create environment file with secrets
cp docker/.env.example docker/.env
# Edit docker/.env — generate secrets with: openssl rand -hex 32

docker compose -f docker/docker-compose.yml up --build
```

Open [http://localhost:3000](http://localhost:3000) once everything is up.

> **Note:** AI features require an API key. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `docker/.env`, or configure the GitHub Copilot SDK (see [AI Configuration](#ai-configuration)).

To stop everything: `docker compose -f docker/docker-compose.yml down` (add `-v` to also remove database data).

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
| **Redis** | 6379 | Optional — shared rate limiting & sessions (for multi-instance) |

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
| Redis | `REDIS_URL` | Shared rate limiting & sessions (multi-instance) |
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

## Security

- **Secrets**: Never commit real secrets. Use `docker/.env` (gitignored) for Docker deployments and `.env` for local dev. Generate secrets with `openssl rand -hex 32`.
- **Required secrets** (Docker will refuse to start without these): `JWT_SECRET`, `ENCRYPTION_KEY`, `INTERNAL_SECRET`.
- **Network binding**: All Docker services bind to `127.0.0.1` only — no ports are exposed to the public internet. External access should go through a reverse proxy (e.g., Cloudflare Tunnel, Caddy, nginx).
- **Non-root containers**: API, WS, Web, and Migrate containers run as the unprivileged `node` user.
- **Database**: PostgreSQL is only accessible within the Docker network and via `127.0.0.1:5432` on the host.

## Production Deployment

For production on a fresh Ubuntu server, use the automated setup script:

```bash
./setup-server.sh
```

This handles: Node.js 22, pnpm, PostgreSQL 16, Caddy, Cloudflare Tunnel, firewall (UFW deny-all + allow SSH), fail2ban, systemd services, and secure secret generation.

**Key production requirements:**
- Set unique, strong values for `JWT_SECRET`, `ENCRYPTION_KEY`, and `INTERNAL_SECRET`
- Configure `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_APP_URL` to match your domain
- Use Cloudflare Tunnel or a reverse proxy — never expose application ports directly
- Verify with `ss -tlnp` that no service binds to `0.0.0.0` (except SSH)

### Environment Variables Reference

See `docker/.env.example` for all Docker variables and `.env.example` for local development variables.

## Contributing

1. Fork the repo and create a feature branch
2. Run `pnpm install` and `pnpm dev` to verify the setup works
3. Make your changes and ensure `pnpm type-check` passes
4. Submit a pull request

## License

[MIT](LICENSE)
