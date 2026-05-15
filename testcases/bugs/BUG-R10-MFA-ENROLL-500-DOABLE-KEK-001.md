# BUG-R10-MFA-ENROLL-500-DOABLE-KEK-001 — /auth/mfa/enroll/start 500 (DOABLE_KEK env var missing on dev)

- **Severity**: P0 (functional + info-disclosure)
- **Env**: dev (dev-api.doable.me)
- **Filed**: 2026-05-14 (Ralph R10)
- **Status**: FIXED + R12 verified (2026-05-15) — fix `6e019a8` on `fix/setup-server-doable-kek` merged to main; DOABLE_KEK set on dev; live returns 200 with secret + otpauthUrl
- **Discovered by**: scripts/r10-api-matrix.ts (A00126, A00133, A00134, A00135)

## Repro
```bash
TOKEN=<qa-owner JWT>
curl -X POST https://dev-api.doable.me/auth/mfa/enroll/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Actual:
HTTP/2 500
{"error":"Internal Server Error","message":"[envelope-crypto] DOABLE_KEK is not set. Provide a base64-encoded 32-byte key in the API process env."}
```

## Expected
- 200 with `{secret, qrCode, recoveryCodes}` — or 400 on missing input
- NEVER 500 with the raw envelope-crypto module identifier or operational hints

## Root cause
- `DOABLE_KEK` environment variable is NOT set on dev-api (services/api/.env missing it).
- The R9 commit `911a540 fix(security): encrypt platform_settings.cf_api_token at rest with KEK` made the KEK mandatory for envelope-crypto operations.
- `setup-server.sh` was never updated to auto-generate `DOABLE_KEK` during fresh installs. Consequence: every freshly-deployed server inherits this gap until manually patched.

## Why this is exactly a "setup-server.sh root-cause" bug
- The deployed code is correct (fail-closed when no KEK).
- The infra script is wrong (didn't generate the KEK).
- A "code patch" here would mean removing the fail-closed check — that's a workaround.
- The correct fix is to generate `DOABLE_KEK` during initial .env scaffolding in setup-server.sh AND document it in .env templates.

## Fix in flight (Opus on fix/setup-server-doable-kek)
- Add `DOABLE_KEK=$(openssl rand -base64 32)` (or equivalent) to setup-server.sh's env-gen block, gated so re-runs do not clobber existing keys.
- Add startup validation in services/api/ that rejects empty/wrong-length KEK at boot (fail-fast).
- Document the variable in .env templates so operators know the contract.

## Live remediation (out of scope here; this fixes future deploys)
The dev-api host needs a manual KEK-add today:
```bash
# On dodev.fid.pw (SSH access required — currently denied for this session)
sudo bash -c 'echo "DOABLE_KEK=$(openssl rand -base64 32)" >> /root/doable/services/api/.env'
sudo systemctl restart doable.service
```
This will brick any rows already encrypted with a different KEK — which on dev should be none (KEK never existed → nothing was ever encrypted with it).

## Follow-ups
- Audit other secret-touching env vars in setup-server.sh for similar gaps (DOABLE_SESSION_SECRET, JWT_SECRET).
- Add an integration test: stand up the API with no KEK, verify it refuses to start (fail-fast).
- Document the KEK-rotation procedure (re-wrap encrypted columns, swap key) — separate ticket.
