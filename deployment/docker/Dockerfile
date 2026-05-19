# ==============================================================================
# Doable — Multi-stage Dockerfile
# ==============================================================================
# Targets: api, ws, web, migrate
# Usage:   docker compose -f deployment/docker/docker-compose.yml up
#          docker compose -f deployment/docker/docker-compose.yml up postgres  (DB only)
# ==============================================================================

# --- Base ---
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm && apt-get update && apt-get install -y --no-install-recommends tmux && rm -rf /var/lib/apt/lists/*
COPY deployment/docker/tmux-entrypoint.sh /usr/local/bin/tmux-entrypoint
RUN chmod +x /usr/local/bin/tmux-entrypoint
WORKDIR /app

# --- Dependencies ---
FROM base AS deps

# Copy workspace config + EVERY workspace package.json so `pnpm install` can
# resolve the full dependency graph. Must list each member of pnpm-workspace.yaml
# (apps/*, services/*, packages/*, mcp-servers/*) — pnpm fails at runtime with
# ERR_MODULE_NOT_FOUND if a workspace member is missing here. When adding a new
# workspace package, also add it below.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY services/api/package.json services/api/
COPY services/ws/package.json services/ws/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/docore/package.json packages/docore/
COPY packages/dovault/package.json packages/dovault/
COPY packages/doable-sdk/package.json packages/doable-sdk/
COPY packages/marketplace-bundle/package.json packages/marketplace-bundle/
COPY mcp-servers/markdown-builder/package.json mcp-servers/markdown-builder/
COPY mcp-servers/pdf-builder/package.json mcp-servers/pdf-builder/
COPY mcp-servers/presentation-builder/package.json mcp-servers/presentation-builder/
COPY mcp-servers/spreadsheet-builder/package.json mcp-servers/spreadsheet-builder/

# Skip Puppeteer's bundled Chromium — thumbnails are optional in Docker
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- Build ---
FROM deps AS build

# Next.js bakes NEXT_PUBLIC_* into the client bundle at build time, which
# would normally lock a published image to one URL. To ship one generic image
# that works for any deployment, default the build args to placeholder strings
# that the web container's runtime entrypoint sed-replaces with real values on
# container start. Local source builds (via docker/docker-compose.yml) still
# pass real URLs as build args and override the placeholders — the runtime
# sed then finds nothing to replace (no-op, ~50ms).
ARG NEXT_PUBLIC_API_URL=__DOABLE_API_URL__
ARG NEXT_PUBLIC_WS_URL=__DOABLE_WS_URL__
ARG NEXT_PUBLIC_APP_URL=__DOABLE_APP_URL__
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

# Puppeteer Chrome (project-thumbnail capture) — without these shared
# libs Chrome crashes at first thumbnail attempt with
# `libnspr4.so: cannot open shared object file`. Same dep list as
# deployment/server-setup.sh:298-322 so docker + bare-metal stay in
# lockstep. The bundled Chromium itself downloads in the next layer
# (PUPPETEER_SKIP_CHROMIUM_DOWNLOAD is intentionally unset for the api
# stage).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libatk1.0-0 libatk-bridge2.0-0 libcups2 libatspi2.0-0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libcairo2 libpango-1.0-0 \
    libxshmfence1 libnspr4 libnss3 libdrm2 libxkbcommon0 \
    fonts-liberation \
  && (apt-get install -y --no-install-recommends libasound2t64 \
      || apt-get install -y --no-install-recommends libasound2) \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app .

# Download the puppeteer-bundled Chrome into the image so first-thumbnail
# capture doesn't need network. Cached layer; runs once per build.
#
# R14 BUG-DOCKER-PUPPETEER: PUPPETEER_CACHE_DIR was previously /app/.puppeteer-cache
# but the WORKDIR /app dir itself is owned by root (only the COPY'd contents
# get chowned to node via --chown=node:node). USER node then hit EACCES on
# mkdir of the cache dir and the build logged "Chrome install/smoke test
# failed — thumbnails will be unavailable" on every clean build. Move the
# cache to node's home (/home/node/.cache/puppeteer), which the node:22-slim
# base image already creates and owns. Runtime container inherits the same
# path because the api service also runs as USER node.
USER node
ENV PUPPETEER_CACHE_DIR=/home/node/.cache/puppeteer
RUN mkdir -p "$PUPPETEER_CACHE_DIR" \
  && cd services/api && pnpm exec puppeteer browsers install chrome \
  && find $PUPPETEER_CACHE_DIR/chrome -name chrome -type f -executable -exec {} --headless=new --no-sandbox --disable-gpu --version \; \
  || (echo "[api-image] Chrome install/smoke test failed — thumbnails will be unavailable" && true)

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
# Runtime placeholder rewriter — replaces __DOABLE_*_URL__ placeholders
# baked at build time with the operator's actual NEXT_PUBLIC_* values from
# container env. Lets one image work for any deployment URL.
COPY deployment/docker/web-runtime-entrypoint.sh /usr/local/bin/web-runtime-entrypoint
RUN chmod +x /usr/local/bin/web-runtime-entrypoint
USER node
EXPOSE 3000
ENTRYPOINT ["web-runtime-entrypoint"]
CMD ["tmux-entrypoint", "web", "node", "apps/web/server.js"]

# --- Migration runner ---
FROM base AS migrate
WORKDIR /app
COPY --from=build --chown=node:node /app .
USER node
CMD ["npx", "tsx", "services/api/src/db/migrate.ts"]
