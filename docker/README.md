# Docker Deployment

Everything you need to self-host Doable with Docker.

## Quick Start (localhost)

```bash
git clone https://github.com/doable-me/doable.git
cd doable
cp docker/.env.example docker/.env
# Edit docker/.env — at minimum, generate real secrets:
#   openssl rand -hex 32

docker compose -f docker/docker-compose.yml up --build
```

Open <https://localhost> (self-signed SSL — accept the browser warning).

## One-liner Setup

The `setup.sh` script handles everything: secret generation, nginx, SSL, Docker build, and firewall.

### Public domain (Let's Encrypt)

```bash
DOMAIN=app.example.com ./docker/setup.sh
```

Optionally add `EMAIL=you@example.com` for certificate expiry notifications.

### Private network / LAN (self-signed SSL)

```bash
HOST=192.168.1.50 ./docker/setup.sh
```

Replace `192.168.1.50` with your server's LAN IP. Browsers will show a certificate warning — accept it, or import `/etc/ssl/doable/cert.pem` into your trust store.

### Localhost only (self-signed SSL)

```bash
./docker/setup.sh
```

When prompted, press Enter to default to `localhost`.

### Behind Cloudflare or another proxy

```bash
DOMAIN=app.example.com ./docker/setup.sh --skip-ssl
```

Uses a self-signed certificate between your proxy and nginx.

## What `setup.sh` Does

1. Checks that Docker and Docker Compose v2 are installed
2. Generates `docker/.env` with random secrets and correct URLs
3. Installs nginx (if not present)
4. Obtains SSL certificate (Let's Encrypt for domains, self-signed for IPs/localhost)
5. Generates nginx reverse proxy config from `nginx.conf.template`
6. Configures UFW firewall (ports 22, 80, 443 only)
7. Builds and starts all Docker containers

## Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | All services: PostgreSQL, API, WS, Web, Migrate, Redis (optional) |
| `Dockerfile` | Multi-stage build (base → deps → build → service targets) |
| `setup.sh` | Automated setup script (secrets, nginx, SSL, build, firewall) |
| `.env.example` | Template environment file — copy to `.env` and edit |
| `nginx.conf.template` | nginx reverse proxy template (used by `setup.sh`) |
| `init.sql` | PostgreSQL extensions setup (pgvector, pgcrypto, pg_trgm) |
| `tmux-entrypoint.sh` | Container entrypoint for tmux session management |

## Configuration

### Required secrets

These must be set in `docker/.env` — Docker will refuse to start without them:

| Variable | How to generate |
|----------|----------------|
| `JWT_SECRET` | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `INTERNAL_SECRET` | `openssl rand -hex 32` |

> **Note:** `setup.sh` generates these automatically. You only need to set them manually if using `docker compose` directly.

### URLs

When using `setup.sh`, URLs are set automatically based on your domain/IP.  
For manual setup, edit these in `docker/.env`:

| Variable | Default | With nginx |
|----------|---------|------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | `https://yourdomain.com/api` |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:4001` | `wss://yourdomain.com/ws` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `https://yourdomain.com` |

### Optional features

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | AI features (Claude) |
| `OPENAI_API_KEY` | AI features (OpenAI) |
| `REDIS_URL` | Shared rate limiting & sessions (multi-instance) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth login |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth login |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Billing |

### Redis

Redis is optional. Without it, Doable uses an in-memory KV store (works fine for ~100 users).

To enable Redis:
```bash
# Set in docker/.env:
REDIS_URL=redis://redis:6379

# Start with Redis profile:
docker compose -f docker/docker-compose.yml --profile redis up --build
```

## Common Operations

```bash
# View logs
docker compose -f docker/docker-compose.yml logs -f

# View specific service logs
docker compose -f docker/docker-compose.yml logs -f api

# Restart a service
docker compose -f docker/docker-compose.yml restart api

# Stop everything
docker compose -f docker/docker-compose.yml down

# Stop and remove all data (database, volumes)
docker compose -f docker/docker-compose.yml down -v

# Rebuild after code changes
docker compose -f docker/docker-compose.yml up --build -d

# Run database migrations manually
docker compose -f docker/docker-compose.yml run --rm migrate
```

## Architecture

```
Internet
  │
  ▼
nginx (ports 80/443) ─── SSL termination
  │
  ├── /        → web    (127.0.0.1:3000)  Next.js frontend
  ├── /api/    → api    (127.0.0.1:4000)  Hono REST API
  ├── /auth/   → api    (127.0.0.1:4000)  OAuth routes
  └── /ws      → ws     (127.0.0.1:4001)  WebSocket (Yjs CRDT)
                   │
                   ▼
              PostgreSQL (127.0.0.1:5432)
```

All application services bind to `127.0.0.1` only. Only nginx accepts external connections.

## Security

- **No ports exposed publicly** — all Docker services bind to `127.0.0.1`
- **nginx always in front** — in all deployment modes (domain, LAN, localhost)
- **Non-root containers** — API, WS, Web run as unprivileged `node` user
- **Firewall** — `setup.sh` configures UFW to allow only ports 22, 80, 443
- **Secrets** — never committed; `docker/.env` is gitignored

## Troubleshooting

### API returns 502 Bad Gateway
The API container may still be starting. Check logs:
```bash
docker compose -f docker/docker-compose.yml logs api
```

### Database connection error
Ensure PostgreSQL is healthy:
```bash
docker compose -f docker/docker-compose.yml ps postgres
```

### Self-signed certificate warning
Expected behavior for `HOST=` and localhost modes. Either:
- Accept the browser warning, or
- Import `/etc/ssl/doable/cert.pem` into your OS/browser trust store

### Port already in use
Stop any existing services on ports 3000, 4000, 4001, or 5432:
```bash
docker compose -f docker/docker-compose.yml down
```

### Rebuild from scratch
```bash
docker compose -f docker/docker-compose.yml down -v
docker system prune -af
docker compose -f docker/docker-compose.yml up --build
```
