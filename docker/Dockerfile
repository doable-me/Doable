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
RUN corepack enable pnpm && apt-get update && apt-get install -y --no-install-recommends tmux && rm -rf /var/lib/apt/lists/*
COPY docker/tmux-entrypoint.sh /usr/local/bin/tmux-entrypoint
RUN chmod +x /usr/local/bin/tmux-entrypoint
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

# Next.js needs NEXT_PUBLIC_* at build time (client-side bundling)
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_WS_URL=ws://localhost:4001
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

COPY . .

# Build packages that compile cleanly (docore, dovault, web)
RUN pnpm --filter=docore run build || true
RUN pnpm --filter=dovault run build || true
RUN pnpm --filter=@doable/web run build

# --- API service ---
FROM base AS api
WORKDIR /app
COPY --from=build --chown=node:node /app .
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
USER node
EXPOSE 4000
ENTRYPOINT ["tmux-entrypoint"]
CMD ["api", "npx", "tsx", "services/api/src/index.ts"]

# --- WebSocket service ---
FROM base AS ws
WORKDIR /app
COPY --from=build --chown=node:node /app .
USER node
EXPOSE 4001
ENTRYPOINT ["tmux-entrypoint"]
CMD ["ws", "npx", "tsx", "services/ws/src/index.ts"]

# --- Web (Next.js standalone) ---
FROM base AS web
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
ENTRYPOINT ["tmux-entrypoint"]
CMD ["web", "node", "apps/web/server.js"]

# --- Migration runner ---
FROM base AS migrate
WORKDIR /app
COPY --from=build --chown=node:node /app .
USER node
CMD ["npx", "tsx", "services/api/src/db/migrate.ts"]
