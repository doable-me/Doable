#!/bin/bash
source /root/doable/.env
USERID=$(sudo -u postgres psql -tAq doable -c "SELECT id FROM users LIMIT 1")
EMAIL=$(sudo -u postgres psql -tAq doable -c "SELECT email FROM users WHERE id='$USERID'")
TOKEN=$(node -e "
const crypto = require('crypto');
const uid = process.argv[1];
const sec = process.argv[2];
const email = process.argv[3];
const h = JSON.stringify({alg:'HS256',typ:'JWT'});
const p = JSON.stringify({sub:uid,email:email,iss:'doable',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});
const b64 = s => Buffer.from(s).toString('base64url');
const hdr = b64(h); const pay = b64(p);
const sig = crypto.createHmac('sha256',sec).update(hdr+'.'+pay).digest('base64url');
console.log(hdr+'.'+pay+'.'+sig);
" "$USERID" "$JWT_SECRET" "$EMAIL")
echo "TOKEN=${TOKEN:0:40}..."
echo "---"
# Deploy the project
echo "DEPLOYING..."
RESULT=$(curl -s -m 120 -X POST http://127.0.0.1:4000/deploy/007ebf84-bbb9-4a89-84cb-7f8def34547b \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"environment":"production"}')
echo "DEPLOY_RESULT=$RESULT"
echo "---"
# Check API keys
KEYS=$(sudo -u postgres psql -tAq doable -c "SELECT key_prefix, tier, label, allowed_tools, allowed_origins FROM project_api_keys WHERE project_id='007ebf84-bbb9-4a89-84cb-7f8def34547b' AND revoked_at IS NULL")
echo "KEYS=$KEYS"
echo "---"
# Check env var
ENVVAR=$(sudo -u postgres psql -tAq doable -c "SELECT key, target FROM env_vars WHERE project_id='007ebf84-bbb9-4a89-84cb-7f8def34547b' AND key='VITE_DOABLE_PROJECT_KEY'")
echo "ENVVAR=$ENVVAR"
