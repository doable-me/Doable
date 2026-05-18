# Bare-Metal Fix R12 — HIGH fixes

Branch: r12/baremetal-highs-fix
Date: 2026-05-19

## Changes made

### HIGH 1 — scripts/setup-build-proxy.sh created
File: scripts/setup-build-proxy.sh (new)

- Installs Squid via apt if not present
- Writes /etc/squid/conf.d/doable-allowlist.conf with 15-host allow-list:
  registry.npmjs.org, registry.yarnpkg.com, pypi.org, files.pythonhosted.org,
  github.com, objects/raw/releases/codeload.githubusercontent.com, api.github.com,
  nodejs.org, deb.nodesource.com, dl.cloudflare.com, cdn.jsdelivr.net, unpkg.com
- Writes /etc/squid/squid.conf binding ONLY to 127.0.0.1:3128 (CLAUDE.md compliant)
- Denies CONNECT to non-443 ports, denies all hosts not on allow-list
- Runs `squid -k parse` to validate config before restart
- Smoke-tests registry.npmjs.org reachability after start
- deployment/server-setup.sh Step 12.5 already calls this script — no changes to setup script needed for this fix

### HIGH 2 — CF_API_TOKEN KEK-encrypted before writing to .env
File: deployment/server-setup.sh (L1107-L1145 region)

- After extracting CF_API_TOKEN from cert.pem, encrypts it with:
  `openssl enc -aes-256-cbc -pbkdf2 -pass pass:"$DOABLE_KEK" -base64`
- Stores result as CF_API_TOKEN_ENC in .env instead of plaintext CF_API_TOKEN
- sed cleanup updated to also strip prior CF_API_TOKEN_ENC= lines (idempotent re-run)
- Updated .env comment block with decrypt recipe:
  `echo "$CF_API_TOKEN_ENC" | openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:"$DOABLE_KEK" -base64`
- In-memory $CF_API_TOKEN variable still used for same-run wildcard DNS curl calls — no change needed there
- Updated .env template comment at line ~818 to reference CF_API_TOKEN_ENC

## How to verify

HIGH 1:
  After setup-server.sh completes: `systemctl is-active squid` → active
  `curl -x http://127.0.0.1:3128 https://registry.npmjs.org/ -o /dev/null -w "%{http_code}"` → 200
  `curl -x http://127.0.0.1:3128 https://evil.example.com/ -o /dev/null -w "%{http_code}"` → 403/000

HIGH 2:
  After setup: grep CF_API_TOKEN /root/doable/.env → shows CF_API_TOKEN_ENC=<base64>, NOT plaintext token
  Decrypt check: `echo "$CF_API_TOKEN_ENC" | openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:"$DOABLE_KEK" -base64` → original token
