#!/usr/bin/env bash
# Post-create script for Doable Codespaces / Dev Container.
# Spec: .devcontainer/devcontainer.json + deployment/docker/docker-compose.dev.yml
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Installing dependencies (pnpm install)..."
pnpm install --frozen-lockfile

echo "==> Bringing up Postgres (docker compose up postgres)..."
docker compose -f deployment/docker/docker-compose.dev.yml up -d postgres
sleep 5

echo "==> Generating local deployment/docker/.env if missing..."
if [ ! -f deployment/docker/.env ]; then
  bash deployment/docker/setup.sh 2>&1 | tail -5 || true
fi

echo "==> Running migrations..."
docker compose -f deployment/docker/docker-compose.dev.yml run --rm migrate || \
  echo "WARN: migrate failed (postgres may need more startup time — retry: docker compose -f deployment/docker/docker-compose.dev.yml run --rm migrate)"

cat <<'EOF'

==> Setup complete!

To start the full dev stack:
  pnpm dev                       # Runs api + ws + web in dev mode

Or run inside docker:
  docker compose -f deployment/docker/docker-compose.dev.yml up -d

Ports (in Codespaces, prefixed with the codespace host):
  Web:  http://localhost:3000
  API:  http://localhost:4000
  WS:   ws://localhost:4001

For Codespaces, set NEXT_PUBLIC_* in deployment/docker/.env to the *.app.github.dev URLs
that Codespaces assigns each forwarded port. The pattern is
https://<codespace-name>-<port>.app.github.dev — copy each forwarded URL from the Ports tab.
EOF
