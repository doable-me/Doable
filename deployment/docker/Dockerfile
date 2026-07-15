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
# `curl` is shared by all final images (api/ws/web/migrate inherit from base).
# It backs the prod compose healthchecks and is the go-to for in-container
# debugging; node:22-slim ships without it.
RUN corepack enable pnpm && apt-get update && apt-get install -y --no-install-recommends tmux curl && rm -rf /var/lib/apt/lists/*
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
# notebooklm/server is a workspace member (pnpm-workspace.yaml). Without
# its package.json in this stage, `pnpm install --frozen-lockfile` errors
# with "workspace package not found: notebooklm-mcp-server" and the whole
# build fails. Docker deploys don't spawn NLM (only bare-metal does — the
# notebooklm tmux window in start.sh), so we only need the resolution to
# succeed here; no build target for it below.
COPY mcp-servers/notebooklm/server/package.json mcp-servers/notebooklm/server/

# Skip Puppeteer's bundled Chromium during `pnpm install` — the api stage
# installs Chrome (and uses apt-chromium as the runtime executable) later.
# Both env vars are required because Puppeteer renamed the skip flag at
# v22: the old name (PUPPETEER_SKIP_CHROMIUM_DOWNLOAD) was dropped for
# v25, so we set the new name (PUPPETEER_SKIP_DOWNLOAD) AND keep the
# legacy one so a future puppeteer downgrade doesn't silently regress.
# Without the new var, postinstall fires `node install.mjs` → downloads
# chrome-headless-shell → fails extracting because node:22-slim has no
# `unzip` in PATH, breaking the entire build.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Same reasoning for Playwright — notebooklm-mcp-server's postinstall runs
# `playwright install chromium`, which would fetch ~180MB into the deps
# layer for a service the Docker path never spawns. Skip it to keep the
# image small; bare-metal server-setup.sh runs the postinstall unrestricted
# because bare-metal actually launches NLM.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

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
#
# `chromium` is the distro-native browser we point Puppeteer at via
# PUPPETEER_EXECUTABLE_PATH below. On Apple Silicon hosts running native
# arm64 containers, puppeteer's @puppeteer/browsers bundled download still
# fetches an x86_64 chrome (folder gets named `linux_arm-…` but the ELF
# is EM_X86_64), which fails at runtime with
#   "rosetta error: failed to open elf at /lib64/ld-linux-x86-64.so.2"
# because node:22-slim has neither the x86_64 dynamic linker nor Rosetta.
# Using the apt `chromium` package gives us a binary that always matches
# the container's architecture (amd64 on Linux x86_64 hosts, arm64 on
# Apple Silicon hosts under linux/arm64).
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libatk1.0-0 libatk-bridge2.0-0 libcups2 libatspi2.0-0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libcairo2 libpango-1.0-0 \
    libxshmfence1 libnspr4 libnss3 libdrm2 libxkbcommon0 \
    fonts-liberation \
    git \
    bubblewrap \
    unzip \
  && (apt-get install -y --no-install-recommends libasound2t64 \
      || apt-get install -y --no-install-recommends libasound2) \
  && rm -rf /var/lib/apt/lists/*
# `git` is required by FileManager (per-project init / version history).
# `bubblewrap` is the user-namespace jail used by services/api/src/sandbox/
# orchestrator.ts (jailedSpawn) to confine AI-spawned subprocesses
# (install_package, vite, node) to the per-project directory tree. Without
# it the orchestrator falls back to a plain spawn that runs with the full
# api container privileges — DOABLE_HARDENING_LEVEL is effectively ignored.

COPY --from=build --chown=node:node /app .

# BUG-R26-013: Create the volume mount points + symlink BEFORE the volume mount
# happens at runtime. Without these explicit mkdirs the directories don't exist
# in the image (the build stage never creates them), so docker compose creates
# them on first volume mount with root:root ownership — and USER node then hits
# EACCES on every mkdir/write under /app/projects (PROJECTS_ROOT=./projects).
# Pre-creating the dirs with node ownership in the image lets docker preserve
# that ownership when it copies the (empty) dir contents into the volume on
# first up.
#
# /data/sites is the SITES_DIR volume the deploy adapters write published
# static sites into (path publish topology). Same root:root-on-first-mount
# trap — pre-create it node-owned so the doable_sites volume initialises
# writable by USER node.
RUN mkdir -p /app/services/api/projects /app/services/api/thumbnails /data/sites \
  && chown -R node:node /app/services/api/projects /app/services/api/thumbnails /data/sites \
  && ln -sf services/api/projects /app/projects \
  && ln -sf services/api/thumbnails /app/thumbnails \
  && chown -h node:node /app/projects /app/thumbnails

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
# Point Puppeteer at the apt-installed `chromium` so puppeteer.launch()
# always uses a native-arch binary (see the chrome-arch comment above the
# apt install block). The bundled `puppeteer browsers install chrome`
# step below still runs as a fallback / cache-warmer — if PUPPETEER_EXECUTABLE_PATH
# is ever unset at runtime, the bundled binary takes over.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN mkdir -p "$PUPPETEER_CACHE_DIR" \
  && cd services/api && pnpm exec puppeteer browsers install chrome \
  && /usr/bin/chromium --headless=new --no-sandbox --disable-gpu --version \
  || (echo "[api-image] Chromium smoke test failed — thumbnails will be unavailable" && true)

EXPOSE 4000
ENTRYPOINT ["tmux-entrypoint"]
CMD ["api", "npx", "tsx", "services/api/src/index.ts"]

# --- WebSocket service ---
FROM base AS ws
WORKDIR /app
COPY --from=build --chown=node:node /app .
# Pre-create + chown the volume mount target so USER node can write yjs
# persistence files. Without this, the named volume mounts over an unowned
# dir created root:root on first `docker compose up`, every persistAll mkdir
# fails EACCES, and the WS healthcheck stays "healthy" because it only probes
# the listener — silent collaborative-edit data loss.
RUN mkdir -p /app/services/ws/projects \
  && chown -R node:node /app/services/ws/projects
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
