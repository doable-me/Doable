# `/root/doable/.env` template — per-org environment

Replace `${ENV_NAME}` with your `DOABLE_ENV_NAME` (e.g. `myorg`, `qa`,
`prod`). Web=`https://${ENV_NAME}.doable.me`,
API=`https://${ENV_NAME}-api.doable.me`, WS=`wss://${ENV_NAME}-ws.doable.me`.

Three value classes used below:
- **literal** — copy verbatim
- `<GENERATE_RANDOM_HEX_32>` — `setup-server.sh` will fill in via
  `openssl rand -hex 32` (or longer where noted). Safe to leave as the
  placeholder before running the script.
- `<MUST_BE_FILLED_BY_HUMAN: …>` — operator must paste a real value
  before the relevant feature works. Server will boot without these but
  those flows will 5xx.

## Hostnames + URLs (literal)

```ini
NODE_ENV=production
DOABLE_DOMAIN=doable.me
WEB_HOSTNAME=${ENV_NAME}.doable.me
PUBLISH_SUBDOMAIN_PREFIX=${ENV_NAME}-

# Public URLs (must be HTTPS — they go through Cloudflare)
NEXT_PUBLIC_APP_URL=https://${ENV_NAME}.doable.me
NEXT_PUBLIC_API_URL=https://${ENV_NAME}-api.doable.me
NEXT_PUBLIC_WS_URL=wss://${ENV_NAME}-ws.doable.me
API_URL=https://${ENV_NAME}-api.doable.me
CORS_ORIGINS=https://${ENV_NAME}.doable.me

# Internal binds (CRITICAL: 127.0.0.1 only — see CLAUDE.md)
API_HOST=127.0.0.1
API_PORT=4000
WS_HOST=127.0.0.1
WS_PORT=4001
WS_INTERNAL_URL=http://127.0.0.1:4001
```

## Cloudflare (literal where derivable)

```ini
CLOUDFLARE_API_TOKEN=cfut_sGbCpls2W8vV1CoaI0MF0XUeIuerpPe1QOM3f5iNa8f3be6e
CLOUDFLARE_ACCOUNT_ID=bf06f74a16822a91da3769c1ba282f48
CLOUDFLARED_TUNNEL_ID=<MUST_BE_FILLED_BY_HUMAN: UUID printed by `cloudflared tunnel create ${ENV_NAME}` — see manual-steps.md step 1>
```

> Note: the staging API token above appears to lack
> `Account.Cloudflare Tunnel:Edit` scope (probe on 2026-05-09 returned
> `code:10000 Authentication error` against `/cfd_tunnel`). Tunnel must
> therefore be created interactively via `cloudflared login` — see
> manual-steps.md.

## Database (script generates / writes locally)

```ini
DATABASE_URL=postgres://doable:<GENERATE_RANDOM_HEX_32>@127.0.0.1:5432/doable
DATABASE_POOL_SIZE=20
```

## Secrets (script generates)

```ini
JWT_SECRET=<GENERATE_RANDOM_HEX_64>
JWT_ISSUER=https://${ENV_NAME}-api.doable.me
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=30d
INTERNAL_SECRET=<GENERATE_RANDOM_HEX_32>
PROJECT_JWT_SECRET=<GENERATE_RANDOM_HEX_64>
ENCRYPTION_KEY=<GENERATE_RANDOM_HEX_32>
```

> **ENCRYPTION_KEY is the most critical secret in the stack** — pgcrypto
> uses it for `integration_connections`, `env_vars`, `mcp_connectors`,
> `oauth_apps`, `github_copilot_accounts`. Lose it = lose every encrypted
> row. Once `setup-server.sh` writes it, back it up immediately.

## Filesystem paths (literal)

```ini
PROJECTS_ROOT=/root/doable-projects
DOABLE_PROJECTS_DIR=/root/doable-projects
SITES_DIR=/var/www/published
CADDYFILE_PATH=/etc/caddy/Caddyfile
COPILOT_CLI_PATH=/usr/local/bin/copilot
COPILOT_CLI_URL=http://127.0.0.1:4002
COPILOT_DEFAULT_MODEL=claude-3.5-sonnet
DOVAULT_BACKEND=systemd
DOABLE_HARDENING=on
```

## GitHub OAuth (human must create new app)

```ini
GITHUB_CLIENT_ID=<MUST_BE_FILLED_BY_HUMAN: Client ID from new "DoableMe-<Env>" OAuth app — see manual-steps.md step 2>
GITHUB_CLIENT_SECRET=<MUST_BE_FILLED_BY_HUMAN: Client Secret from same app>
GITHUB_REDIRECT_URI=https://${ENV_NAME}-api.doable.me/auth/github/callback
GITHUB_COPILOT_REDIRECT_URI=https://${ENV_NAME}-api.doable.me/auth/github/copilot/callback
GITHUB_REPO_REDIRECT_URI=https://${ENV_NAME}-api.doable.me/auth/github/repo/callback
```

> Per `reference_oauth_apps.md`: a single GitHub OAuth app whose
> registered callback ends in `/auth/github/` (trailing slash) covers
> all three redirect URIs above via prefix matching.

## Supabase Management OAuth (literal — shared app)

The single Supabase Management OAuth app is multi-URL; just add the
new env's callback to it (see manual-steps.md step 3). Then:

```ini
OAUTH_SUPABASE_MGMT_CLIENT_ID=6b07e5e1-c170-429d-967e-034074fd89db
OAUTH_SUPABASE_MGMT_CLIENT_SECRET=sba_f6027500a0a66598be9458bbbba7d135cdc60059
INTEGRATIONS_ENHANCED_AUTH_REDIRECT_URI=https://${ENV_NAME}-api.doable.me/integrations/enhanced-auth/callback
MCP_OAUTH_REDIRECT_URI=https://${ENV_NAME}-api.doable.me/mcp/oauth/callback
```

## LLM keys (human)

```ini
ANTHROPIC_API_KEY=<MUST_BE_FILLED_BY_HUMAN: per-workspace, get from console.anthropic.com>
OPENAI_API_KEY=<MUST_BE_FILLED_BY_HUMAN: optional, for OpenAI fallback>
```

## GitHub Copilot account (per-workspace, runtime-bound)

GITHUB_COPILOT_* keys are per-tenant and stored encrypted in DB via the
in-app Copilot connect flow — no env var needed at boot. Confirm post-
deploy by signing in as platform admin and connecting Copilot.

## Email (Resend recommended for staging-style env)

```ini
EMAIL_PROVIDER=resend
EMAIL_SERVICE=resend
EMAIL_FROM=${ENV_NAME}@doable.me
RESEND_API_KEY=<MUST_BE_FILLED_BY_HUMAN: from resend.com dashboard, or copy from staging if same domain>
# SMTP fallbacks — leave empty unless using SMTP instead of Resend
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
GOOGLE_EMAIL_USER=
GOOGLE_REFRESH_TOKEN=
```

## Google OAuth (sign-in / Drive / Calendar)

```ini
GOOGLE_CLIENT_ID=<MUST_BE_FILLED_BY_HUMAN: optional, only if Google sign-in needed for this env>
GOOGLE_CLIENT_SECRET=<MUST_BE_FILLED_BY_HUMAN: same>
GOOGLE_REDIRECT_URI=https://${ENV_NAME}-api.doable.me/auth/google/callback
```

## S3 / object storage (optional — keep empty unless thumbnails go to S3)

```ini
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

## Stripe (LEAVE EMPTY for staging-style envs with no real payments)

```ini
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_MONTHLY_PRICE_ID=
STRIPE_PRO_YEARLY_PRICE_ID=
STRIPE_BUSINESS_MONTHLY_PRICE_ID=
STRIPE_BUSINESS_YEARLY_PRICE_ID=
```

## Misc / debug

```ini
MCP_DEBUG=0
BUILD_HTTP_PROXY=
```
