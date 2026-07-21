# Contributing to Doable

Thank you for your interest in contributing to Doable! This guide will help you get started.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- **Node.js** 22+ (LTS recommended)
- **pnpm** 9+ (`corepack enable` to activate)
- **PostgreSQL** 16+ with extensions: `pgcrypto`, `pgvector`, `pg_trgm`

### Setup (no root / sudo)

You need **Node 22+**, **pnpm 9** (`corepack prepare pnpm@9.15.4 --activate`), and **Docker** with your user in the `docker` group (not root). Do **not** use Bun for this monorepo — it is pnpm/turbo-locked.

```bash
# Prefer nvm Node 22 on PATH (avoids IDE-bundled node)
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
corepack enable && corepack prepare pnpm@9.15.4 --activate

# One-shot: writes .env, starts Postgres in Docker, install, migrate
./scripts/dev-local.sh

# Or manually:
cp .env.example .env
# Set DATABASE_URL + DOABLE_KEK; leave DOABLE_HARDENING=off for laptop use
docker compose -f deployment/docker/docker-compose.dev.yml \
  --env-file deployment/docker/.env up postgres -d
pnpm install && pnpm db:migrate && pnpm dev
```

This starts:
- **Web** (Next.js) on `http://localhost:3000`
- **API** (Hono) on `http://localhost:4000`
- **WebSocket** (Yjs CRDT) on `ws://localhost:4001`

Architecture / agents deep-dive: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Docker Alternative (full stack)

```bash
./deployment/docker/setup.sh
```

See [`deployment/docker/README.md`](deployment/docker/README.md) for details.

## Making Changes

### Branch Naming

- `feat/short-description` — new features
- `fix/short-description` — bug fixes
- `docs/short-description` — documentation changes
- `refactor/short-description` — code refactoring

### Code Style

- **Formatting:** We use [Prettier](https://prettier.io/). Run `pnpm format` before committing.
- **Type checking:** Run `pnpm type-check` to verify TypeScript types.
- **Linting:** Run `pnpm lint` to check for lint errors.

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add template gallery search
fix: resolve websocket reconnection race condition
docs: update deployment guide for Docker
refactor: simplify OAuth token refresh logic
```

## Submitting a Pull Request

1. **Fork** the repository and create your branch from `main`.
2. Make your changes, ensuring code compiles and formatting is clean.
3. Run verification:
   ```bash
   pnpm type-check
   pnpm lint
   pnpm format
   ```
4. Write a clear PR description explaining **what** changed and **why**.
5. Submit the PR against the `main` branch.

### PR Review Process

- A maintainer will review your PR, typically within a few days.
- Address any feedback via additional commits.
- Once approved, a maintainer will merge it.

## Project Structure

```
doable/
├── apps/web/           # Next.js frontend
├── services/api/       # Hono REST API
├── services/ws/        # WebSocket server (Yjs CRDT)
├── packages/db/        # Database schema & migrations
├── packages/shared/    # Shared utilities
├── packages/docore/    # Agent engine (Copilot SDK wrapper)
├── packages/dovault/   # Runtime sandbox
├── mcp-servers/        # MCP server implementations
├── deployment/        # Docker, Fly, K8s, server setup
└── scripts/            # Utility scripts
```

## Reporting Bugs

Use [GitHub Issues](https://github.com/doable-me/doable/issues) with the **bug** label. Include:

- Steps to reproduce
- Expected vs actual behavior
- Browser/OS/Node.js version
- Relevant logs or screenshots

## Requesting Features

Open a [GitHub Issue](https://github.com/doable-me/doable/issues) with the **enhancement** label. Describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Security Vulnerabilities

**Do not** open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
