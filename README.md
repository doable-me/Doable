# Doable

Build apps and websites by chatting with AI.

## Architecture

Monorepo managed with [pnpm](https://pnpm.io) workspaces and [Turborepo](https://turbo.build).

```
apps/
  web/          Next.js 15 frontend (Turbopack)
services/
  api/          Hono REST API
  ws/           WebSocket server
packages/
  db/           Database schema & migrations
  shared/       Shared types & utilities
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+
- [psmux](https://github.com/marlocarlo/psmux) (terminal multiplexer, optional but recommended on Windows)

## Setup

```bash
# Install dependencies
pnpm install

# Copy environment file and configure
cp .env.example .env

# Run database migrations
pnpm db:migrate
```

## Development

### Quick start (recommended)

```powershell
.\dev.ps1
```

This launches a psmux session with all three services in separate windows. Use `.\dev.ps1 -Kill` to stop.

### Manual start

```bash
# All services at once via Turborepo
pnpm dev

# Or individually
pnpm dev:web    # http://localhost:3000
pnpm dev:api    # http://localhost:4000
pnpm dev:ws     # ws://localhost:4001
```

### psmux controls

| Key | Action |
|-----|--------|
| `Ctrl+B` then `0-2` | Switch between windows |
| `Ctrl+B` then `n`/`p` | Next / previous window |
| `Ctrl+B` then `d` | Detach (services keep running) |

Re-attach with `psmux attach -t doable`.

## Services

| Service | Port | Description |
|---------|------|-------------|
| **Web** | 3000 | Next.js frontend with Turbopack |
| **API** | 4000 | Hono REST API (auth, projects, AI chat, billing) |
| **WS** | 4001 | WebSocket server for real-time collaboration |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all services in dev mode |
| `pnpm build` | Build all packages and services |
| `pnpm db:migrate` | Run database migrations |
| `pnpm type-check` | TypeScript type checking |
| `pnpm lint` | Run linting |
| `pnpm format` | Format code with Prettier |
