# ==============================================================================
# Doable — Multi-stage Dockerfile
# ==============================================================================
# Targets: api, ws, web, migrate
# Usage:   docker compose -f docker/docker-compose.yml up
#          docker compose -f docker/docker-compose.yml up postgres  (DB only)
# ==============================================================================

# --- Base ---
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm
WORKDIR /app

# --- Dependencies ---
FROM base AS deps

# Copy workspace config + every package.json (for pnpm install)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY services/api/package.json services/api/
COPY services/ws/package.json services/ws/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/docore/package.json packages/docore/
COPY packages/dovault/package.json packages/dovault/

# Skip Puppeteer's bundled Chromium — thumbnails are optional in Docker
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- Build ---
FROM deps AS build
COPY . .

# Build packages that compile cleanly (shared, docore, dovault, web)
RUN pnpm --filter=docore run build || true
RUN pnpm --filter=@doable/web run build

# --- API service ---
FROM base AS api
WORKDIR /app
COPY --from=build /app .
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
EXPOSE 4000
CMD ["npx", "tsx", "services/api/src/index.ts"]

# --- WebSocket service ---
FROM base AS ws
WORKDIR /app
COPY --from=build /app .
EXPOSE 4001
CMD ["npx", "tsx", "services/ws/src/index.ts"]

# --- Web (Next.js standalone) ---
FROM base AS web
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# --- Migration runner ---
FROM base AS migrate
WORKDIR /app
COPY --from=build /app .
CMD ["npx", "tsx", "services/api/src/db/migrate.ts"]
