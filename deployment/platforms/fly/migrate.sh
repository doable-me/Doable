#!/usr/bin/env bash
# deploy-templates/fly/migrate.sh — one-shot idempotent setup for Doable on Fly.io
# Usage: bash deploy-templates/fly/migrate.sh
# Override region:  FLY_REGION=sin bash deploy-templates/fly/migrate.sh
# Override org:     FLY_ORG=my-org bash deploy-templates/fly/migrate.sh
set -euo pipefail

REGION="${FLY_REGION:-iad}"
ORG="${FLY_ORG:-personal}"

# ── prereq check ──────────────────────────────────────────────────────────────
if ! command -v flyctl &>/dev/null; then
  echo "ERROR: flyctl not found. Install: curl -L https://fly.io/install.sh | sh" >&2
  exit 1
fi

echo "==> Using region=${REGION} org=${ORG}"

# ── create apps (idempotent) ───────────────────────────────────────────────────
echo "==> Creating apps..."
fly apps create doable-api --org "${ORG}" 2>/dev/null || echo "  doable-api already exists"
fly apps create doable-ws  --org "${ORG}" 2>/dev/null || echo "  doable-ws already exists"
fly apps create doable-web --org "${ORG}" 2>/dev/null || echo "  doable-web already exists"

# ── postgres cluster ───────────────────────────────────────────────────────────
echo "==> Creating Postgres cluster doable-postgres (shared-cpu-1x, 10 GB)..."
fly postgres create \
  --name doable-postgres \
  --region "${REGION}" \
  --vm-size shared-cpu-1x \
  --volume-size 10 \
  2>/dev/null || echo "  doable-postgres already exists"

# ── volumes ───────────────────────────────────────────────────────────────────
echo "==> Creating volumes..."
fly volumes create doable_api_data --app doable-api --size 5  --region "${REGION}" 2>/dev/null \
  || echo "  doable_api_data volume already exists (or use 'fly volumes list --app doable-api')"
fly volumes create doable_ws_data  --app doable-ws  --size 1  --region "${REGION}" 2>/dev/null \
  || echo "  doable_ws_data volume already exists"

# ── attach postgres ───────────────────────────────────────────────────────────
echo "==> Attaching Postgres to doable-api (sets DATABASE_URL secret)..."
fly postgres attach --app doable-api doable-postgres 2>/dev/null \
  || echo "  DATABASE_URL already set on doable-api"

echo "==> Attaching Postgres to doable-ws (sets DATABASE_URL secret)..."
fly postgres attach --app doable-ws doable-postgres 2>/dev/null \
  || echo "  DATABASE_URL already set on doable-ws"

# ── pgvector extensions ────────────────────────────────────────────────────────
echo "==> Enabling pgvector, pg_trgm, pgcrypto on doable-postgres..."
echo "CREATE EXTENSION IF NOT EXISTS vector; \
CREATE EXTENSION IF NOT EXISTS pg_trgm; \
CREATE EXTENSION IF NOT EXISTS pgcrypto;" \
  | fly postgres connect --app doable-postgres

# ── generate secrets ───────────────────────────────────────────────────────────
echo "==> Generating secrets..."
JWT_SECRET="$(openssl rand -hex 32)"
ENCRYPTION_KEY="$(openssl rand -hex 32)"
INTERNAL_SECRET="$(openssl rand -hex 32)"
DOABLE_KEK="$(openssl rand -base64 32)"
INSTALL_BOOTSTRAP_TOKEN="$(openssl rand -hex 32)"
# GNU date (-d) used here; on macOS use: date -u -v+24H +%Y-%m-%dT%H:%M:%SZ
INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT="$(date -u -d '+24 hours' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
  || date -u -v+24H +%Y-%m-%dT%H:%M:%SZ)"

# ── set secrets on api ────────────────────────────────────────────────────────
echo "==> Setting required secrets on doable-api..."
fly secrets set --app doable-api \
  JWT_SECRET="${JWT_SECRET}" \
  ENCRYPTION_KEY="${ENCRYPTION_KEY}" \
  INTERNAL_SECRET="${INTERNAL_SECRET}" \
  DOABLE_KEK="${DOABLE_KEK}" \
  INSTALL_BOOTSTRAP_TOKEN="${INSTALL_BOOTSTRAP_TOKEN}" \
  INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT="${INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT}" \
  NEXT_PUBLIC_API_URL="https://doable-web.fly.dev/api" \
  NEXT_PUBLIC_WS_URL="wss://doable-web.fly.dev/ws" \
  NEXT_PUBLIC_APP_URL="https://doable-web.fly.dev" \
  CORS_ORIGINS="https://doable-web.fly.dev"

# ── mirror shared secrets to ws ───────────────────────────────────────────────
# Fly does not expose secret values across apps — copy them explicitly.
echo "==> Mirroring JWT_SECRET + INTERNAL_SECRET to doable-ws..."
fly secrets set --app doable-ws \
  JWT_SECRET="${JWT_SECRET}" \
  INTERNAL_SECRET="${INTERNAL_SECRET}"

# ── print bootstrap token info ────────────────────────────────────────────────
echo ""
echo "==> Bootstrap token info (save these somewhere safe):"
echo "    INSTALL_BOOTSTRAP_TOKEN         = ${INSTALL_BOOTSTRAP_TOKEN}"
echo "    INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT = ${INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT}"
echo ""
echo "    Present this token at /auth/register to receive platform-owner role."
echo "    It expires in 24 hours. Re-generate if needed:"
echo "    fly secrets set --app doable-api INSTALL_BOOTSTRAP_TOKEN=\$(openssl rand -hex 32) \\"
echo "      INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT=\$(date -u -d '+24 hours' +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# ── optional AI provider keys reminder ────────────────────────────────────────
echo "==> Optional: set one or more AI provider keys on doable-api:"
echo "    fly secrets set --app doable-api OPENAI_API_KEY=sk-..."
echo "    fly secrets set --app doable-api ANTHROPIC_API_KEY=sk-ant-..."
echo "    fly secrets set --app doable-api GEMINI_API_KEY=..."
echo "    fly secrets set --app doable-api OPENROUTER_API_KEY=..."
echo "    fly secrets set --app doable-api TOGETHER_API_KEY=..."
echo "    fly secrets set --app doable-api FIREWORKS_API_KEY=..."
echo "    fly secrets set --app doable-api OPENCODE_ZEN_API_KEY=..."
echo "    fly secrets set --app doable-api GROQ_API_KEY=..."
echo "    fly secrets set --app doable-api CEREBRAS_API_KEY=..."
echo "    fly secrets set --app doable-api DEEPSEEK_API_KEY=..."
echo "    fly secrets set --app doable-api MISTRAL_API_KEY=..."
echo "    fly secrets set --app doable-api COHERE_API_KEY=..."
echo "    fly secrets set --app doable-api XAI_API_KEY=..."
echo "    fly secrets set --app doable-api PERPLEXITY_API_KEY=..."
echo "    fly secrets set --app doable-api DEEPINFRA_API_KEY=..."
echo "    fly secrets set --app doable-api NVIDIA_API_KEY=..."
echo "    fly secrets set --app doable-api MINIMAX_API_KEY=..."
echo "    fly secrets set --app doable-api MOONSHOT_API_KEY=..."
echo "    fly secrets set --app doable-api ZHIPU_API_KEY=..."
echo ""
echo "==> Setup complete. Now deploy:"
echo "    fly deploy --app doable-api --config deploy-templates/fly/api.toml"
echo "    fly deploy --app doable-ws  --config deploy-templates/fly/ws.toml"
echo "    fly deploy --app doable-web --config deploy-templates/fly/web.toml"
echo ""
echo "See deploy-templates/fly/DEPLOY.md for full operator instructions."
