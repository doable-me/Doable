#!/usr/bin/env bash
# install-top-50.sh — Install the top 50 priority Activepieces piece packages
# Usage: bash tools/install-top-50.sh (from repo root)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$REPO_ROOT/services/api"
PKG_JSON="$API_DIR/package.json"

cd "$API_DIR"

# Top 50 priority pieces
TOP_PIECES=(
  slack discord microsoft-teams telegram-bot whatsapp
  gmail microsoft-outlook twilio notion google-sheets
  google-docs google-calendar google-drive airtable monday
  asana clickup trello todoist linear
  jira-cloud hubspot salesforce pipedrive zoho-crm
  github gitlab postgres mysql mongodb
  supabase firebase stripe quickbooks xero
  mailchimp sendgrid activecampaign beehiiv convertkit
  twitter linkedin instagram-business facebook-pages reddit
  bluesky openai claude google-gemini amazon-s3
  dropbox shopify woocommerce wordpress webflow
)

TOTAL=${#TOP_PIECES[@]}

echo "=== Activepieces: Installing top $TOTAL priority pieces ==="
echo ""

# Read existing package.json dependencies once
EXISTING_DEPS=$(grep -oP '"@activepieces/piece-[^"]*"' "$PKG_JSON" 2>/dev/null | tr -d '"' || true)

# Build list of packages to install, skipping already-installed ones
packages=()
skipped=0
for name in "${TOP_PIECES[@]}"; do
  pkg="@activepieces/piece-${name}"
  if echo "$EXISTING_DEPS" | grep -qF "$pkg"; then
    echo "  SKIP: $pkg (already installed)"
    skipped=$(( skipped + 1 ))
  else
    packages+=("$pkg")
  fi
done

if (( ${#packages[@]} == 0 )); then
  echo ""
  echo "All $TOTAL packages are already installed. Nothing to do."
  exit 0
fi

echo ""
echo "Installing ${#packages[@]} packages ($skipped already installed)..."
pnpm add --save-exact "${packages[@]}"

echo ""
echo "=== Done ==="
echo "Installed: ${#packages[@]} | Skipped: $skipped | Total: $TOTAL"
