#!/usr/bin/env bash
# Doable — local development without root/sudo.
# Requires: Node 22+, pnpm 9 (via corepack), Docker (user in docker group).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Prefer nvm Node 22 if present (avoids Cursor-bundled node prefix issues)
if [ -d "${HOME}/.nvm/versions/node" ]; then
  LATEST22="$(ls -1d "${HOME}"/.nvm/versions/node/v22.* 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "${LATEST22:-}" ]; then
    export PATH="${LATEST22}/bin:${PATH}"
  fi
fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1" >&2; exit 1; }; }
need node
need pnpm
need docker
need openssl

NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Need Node 22+, got $(node -v). Put nvm Node 22 first on PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker not reachable. Is the daemon running? Are you in the docker group?" >&2
  exit 1
fi

# Docker compose postgres secrets
if [ ! -f deployment/docker/.env ]; then
  cp deployment/docker/.env.example deployment/docker/.env
  PGPASS="$(openssl rand -hex 16)"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PGPASS}|" deployment/docker/.env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" deployment/docker/.env
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -hex 32)|" deployment/docker/.env
  sed -i "s|^INTERNAL_SECRET=.*|INTERNAL_SECRET=$(openssl rand -hex 32)|" deployment/docker/.env
  sed -i "s|^DOABLE_KEK=.*|DOABLE_KEK=$(openssl rand -base64 32)|" deployment/docker/.env
  chmod 600 deployment/docker/.env
  echo "Created deployment/docker/.env"
fi

# Root .env for pnpm services
if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    echo "Missing .env.example" >&2
    exit 1
  fi
  cp .env.example .env
  # Pull password/KEK from docker .env so they match
  PGPASS="$(grep '^POSTGRES_PASSWORD=' deployment/docker/.env | cut -d= -f2-)"
  KEK="$(grep '^DOABLE_KEK=' deployment/docker/.env | cut -d= -f2-)"
  JWT="$(grep '^JWT_SECRET=' deployment/docker/.env | cut -d= -f2-)"
  ENC="$(grep '^ENCRYPTION_KEY=' deployment/docker/.env | cut -d= -f2-)"
  INT="$(grep '^INTERNAL_SECRET=' deployment/docker/.env | cut -d= -f2-)"
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgres://doable:${PGPASS}@127.0.0.1:5432/doable|" .env
  sed -i "s|^DOABLE_KEK=.*|DOABLE_KEK=${KEK}|" .env
  # Fill optional secrets if still blank / placeholders
  grep -q '^JWT_SECRET=' .env || echo "JWT_SECRET=${JWT}" >> .env
  sed -i "s|^# JWT_SECRET=.*|JWT_SECRET=${JWT}|" .env || true
  if ! grep -q '^JWT_SECRET=.\+' .env; then echo "JWT_SECRET=${JWT}" >> .env; fi
  if ! grep -q '^ENCRYPTION_KEY=.\+' .env; then echo "ENCRYPTION_KEY=${ENC}" >> .env; fi
  if ! grep -q '^INTERNAL_SECRET=.\+' .env; then echo "INTERNAL_SECRET=${INT}" >> .env; fi
  # Replace CHANGE_ME kek if still placeholder
  sed -i "s|^DOABLE_KEK=CHANGE_ME.*|DOABLE_KEK=${KEK}|" .env
  chmod 600 .env
  echo "Created .env"
fi

echo "Starting Postgres (Docker, no sudo)…"
docker compose -f deployment/docker/docker-compose.dev.yml \
  --env-file deployment/docker/.env up postgres -d

echo "Waiting for Postgres…"
for _ in $(seq 1 40); do
  if docker exec doable-postgres pg_isready -U doable >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec doable-postgres pg_isready -U doable

echo "pnpm install… (skipping Chromium downloads — set DOABLE_SKIP_BROWSERS=0 to fetch)"
export PUPPETEER_SKIP_DOWNLOAD="${PUPPETEER_SKIP_DOWNLOAD:-1}"
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="${PUPPETEER_SKIP_CHROMIUM_DOWNLOAD:-1}"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD="${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-1}"
export DOABLE_SKIP_BROWSERS="${DOABLE_SKIP_BROWSERS:-1}"
pnpm install

echo "Migrating…"
pnpm db:migrate

echo ""
echo "Ready. Start services with:"
echo "  export PATH=\"\$HOME/.nvm/versions/node/v22.23.1/bin:\$PATH\"  # if needed"
echo "  pnpm dev"
echo ""
echo "Then open http://localhost:3000 — first signup becomes platform owner."
echo "Sandbox/hardening is OFF in .env (no root / bubblewrap needed)."
