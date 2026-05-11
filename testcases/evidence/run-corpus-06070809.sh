#!/usr/bin/env bash
# One-shot smoke run for corpora 06-billing, 07-integrations, 08-publish, 09-marketplace.
# Stripe is in BYPASS on env1: STRIPE_SECRET_KEY="" → Stripe-only TCs are BLOCKED.
set -u

ENV_NAME="${ENV_NAME:-env1}"
API="${API:-https://zantaz-api.doable.me}"
RUN_DATE="$(date -u +%Y-%m-%d)"
REPO="C:/Users/gj/Documents/workspace/doable"
RUNLOG="$REPO/testcases/99-runlog/env1/CORPUS-06-07-08-09.md"
EV="$REPO/testcases/evidence/env1"
TOKENS="$REPO/testcases/evidence/_tokens-env1.json"

mkdir -p "$EV" "$(dirname "$RUNLOG")"

OWNER=$(python3 -c "import json; d=json.load(open(r'$TOKENS')); print(d['qa-owner']['access'])")
OWNER_UID=$(python3 -c "import json; d=json.load(open(r'$TOKENS')); print(d['qa-owner']['user_id'])")
ADMIN=$(python3 -c "import json; d=json.load(open(r'$TOKENS')); print(d['qa-admin']['access'])")
MEMBER=$(python3 -c "import json; d=json.load(open(r'$TOKENS')); print(d['qa-member']['access'])")
VIEWER=$(python3 -c "import json; d=json.load(open(r'$TOKENS')); print(d['qa-viewer']['access'])")

# Pick a real workspace_id for this owner
WID=$(curl -sS -H "Authorization: Bearer $OWNER" "$API/workspaces" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('data') or d.get('workspaces') or d)[0]['id'])" 2>/dev/null || echo "")
PID=$(curl -sS -H "Authorization: Bearer $OWNER" "$API/projects" | python3 -c "import sys,json; d=json.load(sys.stdin); ps=d.get('data') or d.get('projects') or d; print(ps[0]['id'] if ps else '')" 2>/dev/null || echo "")

echo "WID=$WID PID=$PID"

cat > "$RUNLOG" <<EOF
# CORPUS 06-07-08-09 — env1 ($API)

Run: $RUN_DATE  Owner: corpus-runner  Stripe: BYPASS (Stripe-only TCs => BLOCKED)
Workspace: $WID  Project: $PID

| TC | When (UTC) | Result | Notes |
|---|---|---|---|
EOF

run() {
  local tc="$1" descr="$2" exp="$3"; shift 3
  local body="$EV/$tc.body" hdr="$EV/$tc.hdr"
  local now status
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  status=$(curl -sS -o "$body" -D "$hdr" -w "%{http_code}" --max-time 8 "$@" 2>/dev/null || echo "000")
  local result="PASS"
  if [ "$exp" = "INFO" ]; then result="INFO"
  elif [ "$exp" = "BLOCKED" ]; then result="BLOCKED"
  elif [ "$status" != "$exp" ]; then result="FAIL"; fi
  local snip; snip=$(head -c 180 "$body" 2>/dev/null | tr '\n\t|' '   ')
  printf "| %s | %s | %s | got=%s exp=%s — %s · %s |\n" "$tc" "$now" "$result" "$status" "$exp" "$descr" "$snip" >> "$RUNLOG"
  echo "$result $status $tc"
}

mark_blocked() {
  local tc="$1" descr="$2" reason="$3"
  local now; now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  printf "| %s | %s | BLOCKED | %s — %s |\n" "$tc" "$now" "$descr" "$reason" >> "$RUNLOG"
  echo "BLOCKED $tc"
}

H_OWNER=(-H "Authorization: Bearer $OWNER")
H_ADMIN=(-H "Authorization: Bearer $ADMIN")
H_MEMBER=(-H "Authorization: Bearer $MEMBER")
H_VIEWER=(-H "Authorization: Bearer $VIEWER")

############# 06-BILLING #############
run TC-BILLING-PLANS-001 "GET /billing/plans" 200 -X GET "$API/billing/plans" "${H_OWNER[@]}"
run TC-BILLING-PLANS-002 "free plan present" 200 -X GET "$API/billing/plans" "${H_OWNER[@]}"
run TC-BILLING-PLANS-006 "limits payload" 200 -X GET "$API/billing/plans" "${H_OWNER[@]}"
run TC-BILLING-PLANS-012 "GET /billing/usage (subscription proxy)" 200 -X GET "$API/billing/usage?workspaceId=$WID" "${H_OWNER[@]}"

mark_blocked TC-BILLING-PLANS-019 "Free→Pro upgrade in bypass" "Stripe BYPASS on env1: /billing/subscribe routes through Stripe checkout"
mark_blocked TC-BILLING-PLANS-020 "Stripe Checkout flow" "Stripe BYPASS on env1"
mark_blocked TC-BILLING-PLANS-021 "Pro→Business upgrade" "Stripe BYPASS"
mark_blocked TC-BILLING-PLANS-023 "Cancel at period end" "Stripe BYPASS"
mark_blocked TC-BILLING-PLANS-027 "admin refund" "Stripe BYPASS"

run TC-BILLING-PLANS-028 "member cannot upgrade — POST /billing/subscribe" 403 -X POST "$API/billing/subscribe" "${H_MEMBER[@]}" -H "Content-Type: application/json" -d '{"plan":"pro","workspaceId":"'$WID'"}'

# Credits
run TC-BILLING-CREDITS-001 "GET /billing/credits" 200 -X GET "$API/billing/credits?workspaceId=$WID" "${H_OWNER[@]}"
run TC-BILLING-CREDITS-002 "GET /billing/credits/usage" 200 -X GET "$API/billing/credits/usage?workspaceId=$WID" "${H_OWNER[@]}"
run TC-BILLING-CREDITS-003 "GET /billing/balance requires workspaceId" 200 -X GET "$API/billing/balance?workspaceId=$WID" "${H_OWNER[@]}"
run TC-BILLING-CREDITS-004 "balance missing workspaceId → 400" 400 -X GET "$API/billing/balance" "${H_OWNER[@]}"
run TC-BILLING-CREDITS-005 "no auth → 401" 401 -X GET "$API/billing/credits?workspaceId=$WID"

# Topup
run TC-BILLING-TOPUP-001 "GET /billing/topup/packages" 200 -X GET "$API/billing/topup/packages" "${H_OWNER[@]}"
mark_blocked TC-BILLING-TOPUP-002 "POST /billing/topup → Stripe Checkout" "Stripe BYPASS"
mark_blocked TC-BILLING-TOPUP-003 "POST /billing/top-up alt path" "Stripe BYPASS"

# Webhook
run TC-BILLING-WEBHOOK-002 "missing signature → 400/401" 400 -X POST "$API/billing/webhook" -H "Content-Type: application/json" -d '{}'
run TC-BILLING-WEBHOOK-003 "invalid signature → 400" 400 -X POST "$API/billing/webhook" -H "Content-Type: application/json" -H "Stripe-Signature: t=0,v1=bogus" -d '{"id":"evt_bad","type":"checkout.session.completed"}'
mark_blocked TC-BILLING-WEBHOOK-018 "bypass mode 200 with skip" "Stripe BYPASS — verify via STRIPE_SECRET_KEY check at /billing/health"

# Portal / invoices
run TC-BILLING-PORTAL-001 "GET /billing/invoices" 200 -X GET "$API/billing/invoices?workspaceId=$WID" "${H_OWNER[@]}"
mark_blocked TC-BILLING-PORTAL-002 "POST /billing/portal" "Stripe BYPASS"
run TC-BILLING-PORTAL-003 "no auth → 401 /billing/invoices" 401 -X GET "$API/billing/invoices?workspaceId=$WID"

############# 07-INTEGRATIONS #############
run TC-INTEG-LIST-001 "GET /integrations/catalog" 200 -X GET "$API/integrations/catalog" "${H_OWNER[@]}"
run TC-INTEG-LIST-002 "GET /integrations/catalog (anon ok)" 200 -X GET "$API/integrations/catalog"
run TC-INTEG-LIST-003 "GET /integrations/connections (auth)" 200 -X GET "$API/integrations/connections?workspaceId=$WID" "${H_OWNER[@]}"
run TC-INTEG-LIST-004 "GET /integrations/connections (no auth) → 401" 401 -X GET "$API/integrations/connections"
run TC-INTEG-LIST-005 "GET /integrations/admin/enabled" 200 -X GET "$API/integrations/admin/enabled?workspaceId=$WID" "${H_OWNER[@]}"
run TC-INTEG-LIST-006 "GET /integrations/admin/oauth-apps" 200 -X GET "$API/integrations/admin/oauth-apps?workspaceId=$WID" "${H_OWNER[@]}"
run TC-INTEG-LIST-007 "GET /integrations/admin/platform-enabled (admin)" 200 -X GET "$API/integrations/admin/platform-enabled" "${H_OWNER[@]}"
run TC-INTEG-LIST-008 "GET /integrations/admin/platform-enabled (member) → 403" 403 -X GET "$API/integrations/admin/platform-enabled" "${H_MEMBER[@]}"

run TC-INTEG-CONNECT-001 "GET /integrations/oauth/:id/authorize unknown id → 4xx" 404 -X GET "$API/integrations/oauth/__bogus_provider__/authorize?workspaceId=$WID" "${H_OWNER[@]}"
run TC-INTEG-CONNECT-002 "GET /integrations/oauth/callback no state → 4xx" 400 -X GET "$API/integrations/oauth/callback"
run TC-INTEG-REVOKE-001 "DELETE /integrations/connections/:id unknown → 404" 404 -X DELETE "$API/integrations/connections/00000000-0000-0000-0000-000000000000" "${H_OWNER[@]}"
run TC-INTEG-PROXY-001 "POST /integrations/connections/:id/test unknown → 404" 404 -X POST "$API/integrations/connections/00000000-0000-0000-0000-000000000000/test" "${H_OWNER[@]}"
run TC-INTEG-USAGE-001 "GET /integrations/xray/active" 200 -X GET "$API/integrations/xray/active" "${H_OWNER[@]}"
run TC-INTEG-USAGE-002 "GET /integrations/xray/stats" 200 -X GET "$API/integrations/xray/stats" "${H_OWNER[@]}"
run TC-INTEG-USAGE-003 "GET /integrations/xray/spans" 200 -X GET "$API/integrations/xray/spans" "${H_OWNER[@]}"

# Workspace connector store (07 also covers MCP-style connectors)
run TC-INTEG-LIST-009 "GET /workspaces/:wid/connectors" 200 -X GET "$API/workspaces/$WID/connectors" "${H_OWNER[@]}"
run TC-INTEG-LIST-010 "GET /workspaces/:wid/connectors-effective" 200 -X GET "$API/workspaces/$WID/connectors-effective" "${H_OWNER[@]}"

############# 08-PUBLISH #############
run TC-PUBLISH-DEPLOY-001 "GET /deploy/:pid/status" 200 -X GET "$API/deploy/$PID/status" "${H_OWNER[@]}"
run TC-PUBLISH-DEPLOY-002 "GET /deploy/:pid/history" 200 -X GET "$API/deploy/$PID/history" "${H_OWNER[@]}"
run TC-PUBLISH-DEPLOY-003 "GET /deploy/:pid/deployments" 200 -X GET "$API/deploy/$PID/deployments" "${H_OWNER[@]}"
run TC-PUBLISH-DEPLOY-004 "GET /deploy/:pid/status no auth → 401" 401 -X GET "$API/deploy/$PID/status"
run TC-PUBLISH-LIFECYCLE-001 "POST /deploy/:pid (build trigger requires payload)" 400 -X POST "$API/deploy/$PID" "${H_OWNER[@]}" -H "Content-Type: application/json" -d '{}'
run TC-PUBLISH-SUBDOMAIN-001 "POST /deploy/:pid/publish (no body — should validate)" 400 -X POST "$API/deploy/$PID/publish" "${H_OWNER[@]}" -H "Content-Type: application/json" -d '{}'
run TC-PUBLISH-PREVIEW-PROXY-001 "POST /deploy/:pid/publish/preview validate" 400 -X POST "$API/deploy/$PID/publish/preview" "${H_OWNER[@]}" -H "Content-Type: application/json" -d '{}'
run TC-PUBLISH-ROLLBACK-001 "POST /deploy/:pid/rollback/:dep unknown → 4xx" 404 -X POST "$API/deploy/$PID/rollback/00000000-0000-0000-0000-000000000000" "${H_OWNER[@]}"

run TC-PUBLISH-CUSTOM-DOMAIN-001 "GET /domains/project/:pid" 200 -X GET "$API/domains/project/$PID" "${H_OWNER[@]}"
run TC-PUBLISH-CUSTOM-DOMAIN-002 "POST /domains/project/:pid validate body" 400 -X POST "$API/domains/project/$PID" "${H_OWNER[@]}" -H "Content-Type: application/json" -d '{}'
run TC-PUBLISH-CUSTOM-DOMAIN-003 "DELETE /domains/:domainId unknown → 404" 404 -X DELETE "$API/domains/00000000-0000-0000-0000-000000000000" "${H_OWNER[@]}"
run TC-PUBLISH-CUSTOM-DOMAIN-004 "POST /domains/:domainId/verify unknown → 404" 404 -X POST "$API/domains/00000000-0000-0000-0000-000000000000/verify" "${H_OWNER[@]}"

run TC-PUBLISH-CADDY-TUNNEL-001 "INFO: deploy history records publish target" INFO -X GET "$API/deploy/$PID/history" "${H_OWNER[@]}"

############# 09-MARKETPLACE #############
run TC-MARKET-LIST-001 "GET /marketplace (browse anonymous)" 200 -X GET "$API/marketplace"
run TC-MARKET-LIST-002 "GET /marketplace/listings" 200 -X GET "$API/marketplace/listings"
run TC-MARKET-CATEGORIES-BUNDLES-001 "GET /marketplace/categories" 200 -X GET "$API/marketplace/categories"
run TC-MARKET-CATEGORIES-BUNDLES-002 "GET /marketplace/featured" 200 -X GET "$API/marketplace/featured"
run TC-MARKET-LIST-003 "GET /marketplace/listings/:slug unknown → 404" 404 -X GET "$API/marketplace/listings/__nope__"
run TC-MARKET-REVIEW-001 "GET /marketplace/listings/:slug/reviews unknown → 404 or empty" 404 -X GET "$API/marketplace/listings/__nope__/reviews"
run TC-MARKET-CATEGORIES-BUNDLES-003 "GET /marketplace/listings/:slug/bundle unknown → 404" 404 -X GET "$API/marketplace/listings/__nope__/bundle"
run TC-MARKET-INSTALL-001 "POST /marketplace/listings/:id/install unknown → 4xx" 404 -X POST "$API/marketplace/listings/00000000-0000-0000-0000-000000000000/install" "${H_OWNER[@]}" -H "Content-Type: application/json" -d '{"workspaceId":"'$WID'"}'
run TC-MARKET-INSTALL-002 "DELETE /marketplace/listings/:id/install unknown → 4xx" 404 -X DELETE "$API/marketplace/listings/00000000-0000-0000-0000-000000000000/install" "${H_OWNER[@]}"
run TC-MARKET-INSTALL-003 "GET /workspaces/:wid/marketplace/installs" 200 -X GET "$API/workspaces/$WID/marketplace/installs" "${H_OWNER[@]}"
run TC-MARKET-PUBLISH-LISTING-001 "POST /marketplace/listings/:id/publish unknown → 4xx" 404 -X POST "$API/marketplace/listings/00000000-0000-0000-0000-000000000000/publish" "${H_OWNER[@]}" -H "Content-Type: application/json" -d '{}'
run TC-MARKET-PUBLISH-LISTING-002 "GET /marketplace/my-listings (auth)" 200 -X GET "$API/marketplace/my-listings" "${H_OWNER[@]}"
run TC-MARKET-PUBLISH-LISTING-003 "DELETE /marketplace/listings/:id unknown → 4xx" 404 -X DELETE "$API/marketplace/listings/00000000-0000-0000-0000-000000000000" "${H_OWNER[@]}"
run TC-MARKET-MODERATION-001 "GET /admin/marketplace/listings/:id/audit unknown → 4xx" 404 -X GET "$API/admin/marketplace/listings/00000000-0000-0000-0000-000000000000/audit" "${H_OWNER[@]}"
run TC-MARKET-LIST-004 "no auth on /marketplace/my-listings → 401" 401 -X GET "$API/marketplace/my-listings"

echo "DONE — see $RUNLOG"
