#!/usr/bin/env bash
# install-all-pieces.sh — Install all 632 Activepieces piece packages
# Usage: bash tools/install-all-pieces.sh (from repo root)
set -uo pipefail
# NOTE: not using set -e because some packages may not exist on npm
# and we want to continue installing the rest

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$REPO_ROOT/services/api"
PKG_JSON="$API_DIR/package.json"

cd "$API_DIR"

# Full list of all 632 piece names
ALL_PIECES=(
  activecampaign activepieces actualbudget acuity-scheduling acumbamail
  afforai agentx ai aianswer aidbase
  air-ops aircall airparser airtable airtop
  alai algolia alt-text-ai alttextify amazon-bedrock
  amazon-s3 amazon-secrets-manager amazon-ses amazon-sns amazon-sqs
  amazon-textract aminos ampeco anyhook-graphql anyhook-websocket
  apify apitable apitemplate-io apollo appfollow
  asana ashby ask-handle asknews assembled
  assemblyai attio autocalls avoma azure-blob-storage
  azure-communication-services azure-openai backblaze bamboohr bannerbear
  barcode-lookup baremetrics base44 baserow beamer
  beehiiv bettermode bexio bigcommerce bigin-by-zoho
  bika billplz binance bitly bland-ai
  blockscout bluesky bokio bolna bonjoro
  bookedin box brave-search brilliant-directories browse-ai
  browserless bubble bumpups bursty-ai buttondown
  cal-com calendly call-rounded camb-ai campaign-monitor
  capsule-crm captain-data carbone cartloom cashfree-payments
  certopus chain-aware chainalysis-api chaindesk chargekeep
  chartly chat-aid chat-data chatbase chatfly
  chatling chatnode chatsistant chatwoot checkout
  circle clarifai claude clearout clearoutphone
  clicdata clickfunnels clicksend clickup clockify
  clockodo close cloudconvert cloudinary cloutly
  coda cody cognito-forms cohere cometapi
  comfyicu confluence constant-contact contentful contextual-ai
  contiguity convertkit copper copy-ai coralogix
  couchbase crisp cryptolens cursor customer-io
  customgpt cyberark dappier dashworks datadog
  datafuel datocms deepgram deepl deepseek
  denser-ai detecting-ai devin digital-ocean digital-pilot
  dimo discord discourse dittofeed docsbot
  doctly documentpro documerge docusign drip
  dropbox drupal dub duckdb dumpling-ai
  dust easy-peasy-ai echowin eden-ai elevenlabs
  emailit emailoctopus enrichlayer esignatures eth-name-service
  everhour exa extracta-ai facebook-leads facebook-pages
  famulor fathom-analytics fathom feathery fellow
  figma fillout-forms fireberry firecrawl fireflies-ai
  flipando fliqr-ai flow-helper flow-parser flowise
  flowlu folk foreplay-co formbricks formitable
  formsite formspark formstack fountain fragment
  frame free-agent freshdesk freshsales front
  gameball gamma gcloud-pubsub gender-api generatebanners
  getresponse ghostcms giftbit gistly gitea
  github gitlab gladia gmail goodmem
  google-bigquery google-calendar google-cloud-storage google-contacts google-docs
  google-drive google-forms google-gemini google-my-business google-search-console
  google-search google-sheets google-slides google-tasks google-vertexai
  googlechat gotify gptzero-detect-ai gravityforms greenpt
  greip griptape grist grok-xai groq
  guidelite hackernews harvest hashi-corp-vault hastewire
  heartbeat hedy help-scout heygen heymarket-sms
  housecall-pro http-oauth2 hubspot hugging-face hume-ai
  hunter hystruct ibm-cognose image-router imap
  influencers-club insightly insighto-ai insta-charts instabase
  instagram-business instantly-ai instasent intercom intruder
  invoiceninja jina-ai jira-cloud jira-data-center jogg-ai
  jotform json just-invoice kallabot-ai kapso
  katana kimai kissflow kizeo-forms klaviyo
  knack kommo krisp-call kudosity lead-connector
  leap-ai leexi lemlist lemon-squeezy lets-calendar
  letta lever lightfunnels line linear
  linka linkedin linkup livesession llmrails
  lobstermail localai lofty logrocket logsnag
  lokalise loops lucidya lusha luxury-presence
  magical-api magicslides mailchain mailchimp mailer-lite
  mailercheck maileroo mailjet manus manychat
  mastodon matomo matrix mattermost mautic
  mcp medullar meetgeek-ai meistertask mem
  mempool-space messagebird metabase metatext microsoft-365-people
  microsoft-365-planner microsoft-copilot microsoft-dynamics-365-business-central microsoft-dynamics-crm microsoft-excel-365
  microsoft-onedrive microsoft-onenote microsoft-outlook-calendar microsoft-outlook microsoft-power-bi
  microsoft-sharepoint microsoft-teams microsoft-todo millionverifier mind-studio
  mindee missive mistral-ai mixpanel modelslab
  mollie monday mongodb moonclerk mooninvoice
  motion motiontools moveo-ai moxie-crm murf-api
  mycase-piece mysendingbox mysql netlify netsuite
  neverbounce nifty ninox nocodb notion
  ntfy nuelink octopush-sms odoo okta
  omni-co omnihr oncehub oneclickimpact onfleet
  open-phone open-router openai openmic-ai opnform
  opportify oracle-database oracle-fusion-cloud-erp orimon outseta
  pandadoc paperform parser-expert parseur pastebin
  pastefy paywhirl pdf-co pdfcrowd pdfmonkey
  peekshot perplexity-ai personal-ai phantombuster phone-validator
  photoroom pinch-payments pinecone pinterest pipedrive
  placid plausible pocketbase podio pollybot-ai
  poper postgres posthog predict-leads predis-ai
  presenton productboard prompthub promptmate pushbullet
  pushover pylon qdrant quaderno queue
  quickbase quickbooks quickzu qwilr rabbitmq
  raia-ai rapidtext-ai razorpay reachinbox recall-ai
  reddit reoon-verifier resend respaid respond-io
  retable retell-ai retune returning-ai robolly
  roe-ai rss runware runway saastic
  saleor salesforce sap-ariba sardis savvycal
  scenario scrapegrapghai scrapeless seek-table segment
  send-it sender sendfox sendgrid sendinblue
  sendpulse sendy senja serp-api serpstat
  service-now sessions-us seven shippo shopify
  short-io sign-now signrequest simplepdf simpliroute
  simplybookme sitespeakai skyprep skyvern slack
  slidespeak smaily smartlead smartsheet smartsuite
  smoove smsmode snowflake soap socialkit
  softr sperse splitwise spotify square
  stability-ai stable-diffusion-webui straico stripe supabase
  supadata surrealdb surveymonkey surveytale swarmnode
  synthesia systeme-io tableau talkable tally
  tarvent taskade tavily teable teamleader
  teamwork telegram-bot tenzo textcortex-ai thankster
  ticktick tidely tidycal time-ops timelines-ai
  tiny-talk-ai tl-dv todoist toggl-track totalcms
  trello truelayer twenty twilio twin-labs
  twitch twitter typeform upgradechat uscreen
  vadoo-ai validatedmails valyu vbout vercel
  vero videoask vidlab7 vidnoz village
  vimeo visible vlm-run voipstudio vouchery-io
  vtex vtiger waitwhile wealthbox webex
  webflow webling webscraping-ai wedof week-done
  what-converts whatsable whatsapp whatsscale wonderchat
  woocommerce woodpecker wootric wordpress workable
  wrike writesonic-bulk wufoo xero youcanbookme
  youform youtube zagomail zendesk-sell zendesk
  zeplin zerobounce zoho-bookings zoho-books zoho-campaigns
  zoho-crm zoho-desk zoho-invoice zoho-mail zoo
  zoom zuora
)

BATCH_SIZE=50
TOTAL=${#ALL_PIECES[@]}
NUM_BATCHES=$(( (TOTAL + BATCH_SIZE - 1) / BATCH_SIZE ))

echo "=== Activepieces: Installing all $TOTAL piece packages ==="
echo "Batch size: $BATCH_SIZE | Total batches: $NUM_BATCHES"
echo ""

# Read existing package.json dependencies once
EXISTING_DEPS=$(grep -oP '"@activepieces/piece-[^"]*"' "$PKG_JSON" 2>/dev/null | tr -d '"' || true)

installed_count=0
skipped_count=0
batch_num=0

for (( i=0; i<TOTAL; i+=BATCH_SIZE )); do
  batch_num=$(( batch_num + 1 ))
  end=$(( i + BATCH_SIZE ))
  if (( end > TOTAL )); then
    end=$TOTAL
  fi
  batch_count=$(( end - i ))

  # Build list of packages for this batch, skipping already-installed ones
  batch_packages=()
  batch_skipped=0
  for (( j=i; j<end; j++ )); do
    name="${ALL_PIECES[$j]}"
    pkg="@activepieces/piece-${name}"
    if echo "$EXISTING_DEPS" | grep -qF "$pkg"; then
      batch_skipped=$(( batch_skipped + 1 ))
    else
      batch_packages+=("$pkg")
    fi
  done

  skipped_count=$(( skipped_count + batch_skipped ))

  if (( ${#batch_packages[@]} == 0 )); then
    echo "Batch $batch_num/$NUM_BATCHES — all $batch_count packages already installed, skipping."
    continue
  fi

  echo "Installing batch $batch_num/$NUM_BATCHES (${#batch_packages[@]} packages, $batch_skipped skipped)..."
  pnpm add --save-exact "${batch_packages[@]}" || {
    echo "WARNING: Batch $batch_num had errors. Some packages may not exist. Continuing..."
  }
  installed_count=$(( installed_count + ${#batch_packages[@]} ))
done

echo ""
echo "=== Done ==="
echo "Attempted: $installed_count | Skipped (already installed): $skipped_count | Total: $TOTAL"
