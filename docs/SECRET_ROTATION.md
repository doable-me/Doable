# Secret Rotation — Operator Playbook

Doable has three independently rotatable secrets.  This document explains
when to rotate, what breaks, and the exact steps for each case.

---

## Threat Model — When to Rotate

| Trigger | Action |
|---------|--------|
| Suspected credential leak (breach, phishing, bad offboard) | Rotate all three immediately |
| Employee with server access offboards | Rotate JWT_SECRET (log them out) + INTERNAL_SECRET |
| Quarterly scheduled hygiene | Rotate JWT_SECRET + INTERNAL_SECRET; defer ENCRYPTION_KEY unless policy requires |
| Compromised DB backup / pg_dump exposed | Rotate ENCRYPTION_KEY (re-encrypt at-rest data) |
| Suspicious session activity in audit logs | Rotate JWT_SECRET |
| Internal API abuse / forged X-Internal-Secret calls | Rotate INTERNAL_SECRET |

---

## Rotation Matrix

| Secret | Effect of rotation | Services requiring restart | Data migration |
|--------|--------------------|---------------------------|----------------|
| `JWT_SECRET` | All active user sessions invalidated immediately — every logged-in user gets a 401 on their next request and must re-login | API only (`doable.service`) | None |
| `INTERNAL_SECRET` | In-flight API↔WS internal calls fail with 403 during the restart gap | API **and** WS (same systemd unit, restart once) | None |
| `ENCRYPTION_KEY` | **Nothing reads correctly until migration SQL runs** — every `pgp_sym_decrypt` call fails | API (after SQL migration) | **Yes** — re-encrypt all encrypted columns with the new key |

---

## The Script

```
scripts/rotate-secrets.sh {jwt|internal|encryption|all} [--apply]
```

Dry-run by default (safe to call at any time).  Pass `--apply` to mutate
`.env` and write timestamped backups to `/var/backups/doable/`.

---

## Step-by-Step: JWT_SECRET

**Impact:** all active sessions expire.  Users see "Session expired, please
log in again."  No data is at risk.

```bash
# 1. Dry-run first — inspect output
./scripts/rotate-secrets.sh jwt

# 2. Apply
./scripts/rotate-secrets.sh jwt --apply

# 3. Restart API
systemctl restart doable.service

# 4. Verify
curl -sf https://api.doable.me/health | jq .
# Expect: { "status": "ok" }

# 5. Confirm old tokens are rejected
curl -H "Authorization: Bearer <OLD_TOKEN>" https://api.doable.me/me
# Expect: 401 Unauthorized
```

**Rollback:** if the new JWT_SECRET is lost, restore `.env` from backup:

```bash
cp /var/backups/doable/env-<timestamp> /root/doable/.env
systemctl restart doable.service
```

---

## Step-by-Step: INTERNAL_SECRET

**Impact:** very brief (seconds) 403 window between API and WS during
restart.  In-flight AI streaming requests may drop.  No user data at risk.

```bash
# 1. Dry-run
./scripts/rotate-secrets.sh internal

# 2. Apply
./scripts/rotate-secrets.sh internal --apply

# 3. Restart (both API and WS share doable.service)
systemctl restart doable.service

# 4. Verify WS connectivity
tmux list-windows -t doable
# api, web, ws should all show a running process

# 5. Smoke-test an AI chat turn in the browser — WS→API bridge should work
```

**Rollback:** restore `.env` from backup, restart.

---

## Step-by-Step: ENCRYPTION_KEY

**Impact:** highest risk.  Every call to `pgp_sym_decrypt` fails until the
SQL migration runs with the **old** key.  Do not restart the API between
updating `.env` and running the migration.

> ⚠  The script writes the SQL migration file but does **not** execute it.
> You must inspect and run it manually via `psql`.

```bash
# 0. Generate new key
NEW_KEY=$(openssl rand -base64 48 | tr -d '\n' | head -c 64)
printf '%s\n' "${NEW_KEY}"   # save this somewhere safe NOW

# 1. Capture current key
OLD_KEY=$(grep '^ENCRYPTION_KEY=' /root/doable/.env | cut -d= -f2-)

# 2. Dry-run (emits SQL to /tmp for preview)
OLD_KEY="${OLD_KEY}" NEW_KEY="${NEW_KEY}" \
  ./scripts/rotate-secrets.sh encryption

# 3. Apply — updates .env AND writes final SQL to /var/backups/doable/
OLD_KEY="${OLD_KEY}" NEW_KEY="${NEW_KEY}" \
  ./scripts/rotate-secrets.sh encryption --apply

# 4. Inspect the SQL migration
#    Path printed by the script, typically:
#    /var/backups/doable/encryption-rotation-<YYYYMMDDHHMMSS>.sql
less /var/backups/doable/encryption-rotation-*.sql

# 5. Run the SQL migration (re-encrypts data with NEW_KEY)
psql -d doable -v ON_ERROR_STOP=1 \
     -f /var/backups/doable/encryption-rotation-<timestamp>.sql

# 6. Only after psql exits 0, restart the API
systemctl restart doable.service

# 7. Verify (see Verification section below)
```

**Rollback:**

```bash
# a. Restore old .env (reverts ENCRYPTION_KEY to old value)
cp /var/backups/doable/env-<timestamp> /root/doable/.env

# b. If the SQL migration ran partially, re-run it with OLD/NEW swapped
#    OR restore from a DB backup taken before the rotation.
#    Partial migration is safe to re-run because the script uses
#    ADD COLUMN IF NOT EXISTS + explicit DROP/RENAME — idempotent.

# c. Restart
systemctl restart doable.service
```

---

## Rotating All Three (scheduled hygiene)

```bash
# Generate new keys
NEW_JWT=$(openssl rand -base64 48 | tr -d '\n' | head -c 64)
NEW_INT=$(openssl rand -base64 48 | tr -d '\n' | head -c 64)
NEW_ENC=$(openssl rand -base64 48 | tr -d '\n' | head -c 64)
OLD_ENC=$(grep '^ENCRYPTION_KEY=' /root/doable/.env | cut -d= -f2-)

# Rotate internal + JWT together (no data migration needed)
./scripts/rotate-secrets.sh internal --apply
./scripts/rotate-secrets.sh jwt --apply
systemctl restart doable.service   # picks up new internal + jwt

# Rotate encryption key separately (requires SQL migration)
OLD_KEY="${OLD_ENC}" NEW_KEY="${NEW_ENC}" \
  ./scripts/rotate-secrets.sh encryption --apply
psql -d doable -v ON_ERROR_STOP=1 \
     -f /var/backups/doable/encryption-rotation-<timestamp>.sql
systemctl restart doable.service
```

---

## Verification Commands

### Health check

```bash
curl -sf https://api.doable.me/health | jq .
# Expected: { "status": "ok" }
```

### JWT invalidation confirmed

```bash
# Replace with a token captured before rotation
curl -H "Authorization: Bearer <OLD_TOKEN>" https://api.doable.me/me
# Expected: 401
```

### Encryption re-key confirmed

```sql
-- Run in psql after the migration.
-- Decrypt a row with the NEW key — should return readable JSON/text.
SELECT
  id,
  pgp_sym_decrypt(encrypted_api_key::bytea, current_setting('app.new_enc_key', true))
    AS decrypted_api_key_sample
FROM ai_providers
WHERE encrypted_api_key IS NOT NULL
LIMIT 3;

-- Counts: every encrypted row should be non-null
SELECT
  COUNT(*) FILTER (WHERE encrypted_api_key IS NOT NULL) AS provider_keys,
  COUNT(*) AS provider_total
FROM ai_providers;

-- ai_messages (if DOABLE_ENCRYPT_AI_MESSAGES=1)
SELECT
  COUNT(*) FILTER (WHERE encrypted_content IS NOT NULL) AS encrypted_msgs,
  COUNT(*) FILTER (WHERE content IS NOT NULL)           AS plaintext_msgs
FROM ai_messages;
```

### Audit log correlation

The script prints the first-6 characters of both the old and new values.
Cross-reference these prefixes against application logs to confirm no
requests are still being signed with the old secret.

```bash
# API logs (tmux doable:api)
tmux capture-pane -t doable:api -p | grep -i "jwt\|secret\|401\|403" | tail -20
```

---

## Code References

The following source paths (verified by grep) consume these secrets.
If you add new consumers, update this list.

### JWT_SECRET

- `services/api/src/lib/secrets.ts` — exports `JWT_SECRET`
- `services/api/src/lib/jwt.ts` — `signJwt`, `verifyJwt` (signing + verify)
- `services/api/src/lib/secrets.ts` — exports `PROJECT_JWT_SECRET`
  (falls back to `JWT_SECRET`; used for per-project sandbox JWTs)
- `services/api/src/routes/connector-proxy.ts` — verifies `PROJECT_JWT_SECRET`
- `services/api/src/routes/projects/item-routes.ts` — issues `PROJECT_JWT_SECRET`
- `services/api/src/routes/preview-proxy/proxy-handler.ts` — verifies project JWT

### INTERNAL_SECRET

- `services/api/src/lib/secrets.ts` — exports `INTERNAL_SECRET`
- `services/api/src/routes/internal.ts` — `X-Internal-Secret` header gate
- `services/api/src/ai/yjs-bridge.ts` — API→WS calls carry the header
- `services/api/src/routes/team-chat.ts` — inbound + outbound internal calls
- `services/api/src/routes/design-comments.ts` — internal comment relay
- `services/api/src/lib/activity.ts` — activity fan-out calls

### ENCRYPTION_KEY

- `services/api/src/lib/secrets.ts` — exports `ENCRYPTION_KEY`
- `services/api/src/integrations/credential-vault.ts` — integration credential
  encrypt/decrypt (`pgp_sym_encrypt` / `pgp_sym_decrypt`)
- `services/api/src/routes/ai-settings-providers.ts` — AI provider API key storage
- `services/api/src/ai/engine-resolver.ts` — reads provider keys at runtime
- `services/api/src/routes/provider-bridge.ts` — provider-bridge key access
- `services/api/src/routes/auth/platform-ai-bootstrap.ts` — GitHub + provider
  token bootstrap (encrypted_token, encrypted_api_key, encrypted_bearer_token)
- `services/api/src/deploy/auto-api-key.ts` — deploy API key encryption
- `services/api/src/routes/admin-email.ts` — email credentials encrypt/decrypt
- `services/api/src/mcp/oauth.ts` — MCP OAuth state encryption (falls back to
  `CREDENTIALS_ENCRYPTION_KEY` for legacy compat)
- `services/api/src/integrations/oauth2.ts` — OAuth2 state encryption (same fallback)

---

## Backup Location

All `.env` backups land in `/var/backups/doable/` (mode 0700, root-only):

```
/var/backups/doable/env-20260512153000   ← timestamped .env snapshots
/var/backups/doable/encryption-rotation-20260512153000.sql  ← SQL migrations
```

Keep at least the last 3 backups.  Delete older ones manually when confident:

```bash
ls -lt /var/backups/doable/ | head -20
rm /var/backups/doable/env-<old-timestamp>
```

---

## Cross-References

- `services/api/src/lib/envelope-crypto.ts` — envelope-v1 per-workspace DEK
  (separate from the global ENCRYPTION_KEY; not rotated by this script)
- `services/api/src/lib/secrets.ts` — runtime secret loading + validation
