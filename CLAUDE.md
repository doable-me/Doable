# Doable — Project Rules

## CRITICAL: Network Security

**ALL services MUST bind to 127.0.0.1 ONLY. NEVER bind to 0.0.0.0 or any public interface.**

- Next.js dev: `--hostname 127.0.0.1` (already in package.json dev script)
- Next.js start: `-H 127.0.0.1` (already in package.json start script)
- API server: `API_HOST=127.0.0.1` in .env
- WS server: `WS_HOST=127.0.0.1` in .env
- PostgreSQL: `listen_addresses = 'localhost'` in postgresql.conf
- Caddy: `bind 127.0.0.1` in Caddyfile
- All external access goes through Cloudflare Tunnel — no port should be publicly reachable
- Before any deployment or server restart, verify with `ss -tlnp` that nothing listens on `0.0.0.0`
- This rule applies to ALL environments: dev, staging, production

## Deployment

- Server: `do.fid.pw` (SSH key: `~/Documents/itdept`)
- App directory: `/root/doable`
- Services run in tmux session `doable` (windows: api, web, ws)
- API and WS use `tsx watch` — no build step needed, auto-reloads on file changes
- Web uses Next.js with Turbopack HMR in dev mode
- Systemd service `doable.service` wraps the tmux session (auto-starts on boot)
- Cloudflare Tunnel runs as systemd service `cloudflared`

## Fresh Server Setup

Run `./setup-server.sh` on a fresh Ubuntu 22.04/24.04 server. It handles:
- System packages (Node.js 22, pnpm, PostgreSQL 16, Caddy, cloudflared, tmux, fail2ban)
- Puppeteer/Chrome dependencies for thumbnail generation
- Database creation, user setup, and migrations
- Environment file generation with secure random secrets
- UFW firewall (deny all, allow SSH only)
- Swap file creation
- Cloudflare Tunnel configuration (prompts for login)
- Systemd services (doable + cloudflared)
- tmux session with 3 windows (api, web, ws)

## Architecture

- **Monorepo**: pnpm workspaces + Turborepo
- **Frontend**: Next.js 15 + React 19 + Tailwind 4 + Monaco Editor + Yjs
- **API**: Hono on Node.js + PostgreSQL + Copilot SDK + Puppeteer
- **WebSocket**: Hono + ws + Yjs CRDT
- **Database**: PostgreSQL 16 with pgcrypto, pgvector, pg_trgm extensions
- **Tunnel**: Cloudflare Tunnel → all services on 127.0.0.1
- **Static Sites**: Caddy serves published sites at *.doable.me subdomains

## UX Guidelines

- Design for creators, designers, producers, CEOs — not developers
- Progressive disclosure, no jargon
- Use neutral terms like "platform admin" — never "god mode"
- No Redis — use lightweight in-memory or DB-backed solutions (~100 user scale)
