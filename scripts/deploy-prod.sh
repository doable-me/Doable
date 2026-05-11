#!/usr/bin/env bash
#
# Canonical doable.me / 167.71.235.230 deploy.
#
# Usage:
#   scripts/deploy-prod.sh                       # uses default host + key
#   DEPLOY_HOST=root@host scripts/deploy-prod.sh # override
#
# Why this exists: the prior deploy snippet lived in .omc/project-memory.json
# (gitignored) so it never reached other devs / fresh clones. It also lacked
# `pnpm db:migrate` and piped every step to `tail`, which masked migration
# failures from `set -e`. See git history for the 2026-05-11 RLS-activation
# incident this script was extracted from.
#
# Properties:
# - `set -eo pipefail` so pipe-upstream failures abort the run
# - `pnpm db:migrate` runs BEFORE web build + service restart, so a stale
#   schema can never serve new code (RLS policies in particular depend on
#   migration ordering)
# - Each step trimmed by `tail -N` for log brevity; pipefail preserves the
#   upstream exit code so failures still surface

set -eo pipefail

HOST="${DEPLOY_HOST:-root@167.71.235.230}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/itdept_staging}"

ssh -i "$KEY" -o BatchMode=yes "$HOST" "
  set -eo pipefail
  cd /root/doable

  echo '--- BEFORE ---'
  git rev-parse --short HEAD

  git fetch origin main 2>&1 | tail -2
  git log --oneline HEAD..origin/main | head -15
  git reset --hard origin/main 2>&1 | tail -2

  echo '--- install ---'
  pnpm install --frozen-lockfile 2>&1 | tail -5

  echo '--- db:migrate ---'
  pnpm db:migrate 2>&1 | tail -15

  echo '--- web build ---'
  cd apps/web && rm -rf .next .turbo && pnpm build 2>&1 | tail -8
  cd /root/doable

  echo '--- restart ---'
  systemctl restart doable.service
  sleep 8

  echo '--- /health ---'
  curl -s http://127.0.0.1:4000/health | head -c 250
  echo

  echo '--- AFTER ---'
  git rev-parse --short HEAD
"
