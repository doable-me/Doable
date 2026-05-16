#!/bin/sh
# Web container runtime entrypoint — rewrites NEXT_PUBLIC_* placeholders
# baked into the Next.js client bundle at build time with the operator's
# real URLs from container env.
#
# Why: Next.js inlines NEXT_PUBLIC_* into the client JS at build time, so a
# pre-built distributable image would normally be locked to whatever URL it
# was built with. Building with placeholder strings (__DOABLE_API_URL__,
# __DOABLE_WS_URL__, __DOABLE_APP_URL__) and sed-replacing them here at
# startup lets one image work for any deployment.
#
# Local source builds pass real URLs as docker-compose build args, so the
# placeholders never make it into the bundle — sed below finds no matches
# and the operation is effectively a no-op (~50-100ms file scan).
set -e

API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:4000}"
WS_URL="${NEXT_PUBLIC_WS_URL:-ws://localhost:4001}"
APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"

# Only touch JS/HTML/JSON in the standalone bundle + static assets — the
# only files where NEXT_PUBLIC_* values end up after `next build`.
TARGET_DIRS="/app/apps/web/.next/standalone /app/apps/web/.next/static"

# Use find -exec instead of xargs to handle no-match gracefully; redirect
# 2>/dev/null to swallow "Permission denied" on files the node user can't
# read (shouldn't happen since build chowned everything, but cheap defense).
for d in $TARGET_DIRS; do
  [ -d "$d" ] || continue
  find "$d" -type f \( -name '*.js' -o -name '*.html' -o -name '*.json' -o -name '*.css' \) \
    -exec sed -i \
      -e "s|__DOABLE_API_URL__|${API_URL}|g" \
      -e "s|__DOABLE_WS_URL__|${WS_URL}|g" \
      -e "s|__DOABLE_APP_URL__|${APP_URL}|g" {} + 2>/dev/null || true
done

exec "$@"
