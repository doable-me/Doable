#!/usr/bin/env bash
# heal-stale-project-node-modules.sh — one-shot migration for existing installs.
#
# Context: Before the BUG-PUB-004 fix (commit 5546b73), the project scaffold
# inherited NODE_ENV=production from the API service, causing npm install to
# silently apply --omit=dev. Devs deps (vite, typescript, @vitejs/plugin-react,
# etc.) were never installed. New projects post-fix are fine; older projects
# have a partial node_modules and their dev-server spawn fails with
# MODULE_NOT_FOUND. This script re-runs `NODE_ENV=development npm install
# --include=dev --legacy-peer-deps` for every project under PROJECTS_ROOT
# whose package.json contains build-tool deps but whose node_modules/vite/
# (or required-build-tool's) directory is missing.
#
# Usage (on the server, as root):
#   sudo bash setup-v3/heal-stale-project-node-modules.sh         # heal all
#   sudo bash setup-v3/heal-stale-project-node-modules.sh --dry-run
#
# Detects PROJECTS_ROOT from /opt/doable/.env (DOABLE_PROJECTS_DIR or PROJECTS_ROOT).
# Idempotent: skips projects that already have the build tool present.
# Per-project timeout: 240s. On failure, project is left as-is and the next one
# is attempted. A summary is printed at the end.
set -u

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

ENV_FILE=/opt/doable/.env
[[ ! -f "$ENV_FILE" ]] && { echo "ERR: $ENV_FILE not found"; exit 1; }

# Pull PROJECTS_ROOT from env (DOABLE_PROJECTS_DIR preferred, PROJECTS_ROOT fallback)
PROJECTS_ROOT=$(grep -E '^(DOABLE_PROJECTS_DIR|PROJECTS_ROOT)=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"')
[[ -z "$PROJECTS_ROOT" ]] && PROJECTS_ROOT=/opt/doable/services/api/projects
[[ ! -d "$PROJECTS_ROOT" ]] && { echo "ERR: PROJECTS_ROOT $PROJECTS_ROOT does not exist"; exit 1; }

echo "PROJECTS_ROOT = $PROJECTS_ROOT"
echo "DRY_RUN       = $DRY_RUN"
echo ""

TOTAL=0; HEALED=0; SKIPPED=0; FAILED=0
FAIL_LIST=""

# Map framework_id (from package.json hint) → required build-tool path
required_for() {
  local pkg="$1"
  if grep -q '"vite"' "$pkg"; then echo "vite"; return; fi
  if grep -q '"next"' "$pkg"; then echo "next"; return; fi
  echo ""  # unknown
}

for dir in "$PROJECTS_ROOT"/*/; do
  PRJ=$(basename "$dir")
  [[ "$PRJ" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || continue
  PKG="$dir/package.json"
  [[ ! -f "$PKG" ]] && continue
  TOTAL=$((TOTAL+1))

  TOOL=$(required_for "$PKG")
  if [[ -z "$TOOL" ]]; then
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  if [[ -f "$dir/node_modules/$TOOL/package.json" ]]; then
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  echo "[heal] $PRJ — missing node_modules/$TOOL/, reinstalling…"
  if [[ "$DRY_RUN" == "1" ]]; then
    HEALED=$((HEALED+1)); continue
  fi
  if timeout 240 sudo -u doable bash -c "cd $dir && NODE_ENV=development npm install --legacy-peer-deps --include=dev --loglevel=error" >/dev/null 2>&1; then
    if [[ -f "$dir/node_modules/$TOOL/package.json" ]]; then
      HEALED=$((HEALED+1))
      echo "       ok"
    else
      FAILED=$((FAILED+1))
      FAIL_LIST="$FAIL_LIST $PRJ(post-install-still-missing)"
      echo "       FAIL: install completed but $TOOL still missing"
    fi
  else
    FAILED=$((FAILED+1))
    FAIL_LIST="$FAIL_LIST $PRJ(install-error)"
    echo "       FAIL: install errored or timed out"
  fi
done

echo ""
echo "=== summary ==="
echo "total projects scanned: $TOTAL"
echo "healed:                 $HEALED"
echo "skipped (already-ok):   $SKIPPED"
echo "failed:                 $FAILED"
[[ -n "$FAIL_LIST" ]] && echo "failed list:$FAIL_LIST"
[[ "$FAILED" -gt 0 ]] && exit 2 || exit 0
