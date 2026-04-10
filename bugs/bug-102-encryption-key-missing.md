# BUG-102: Missing ENCRYPTION_KEY Breaks All BYOK Provider API Keys

**Severity:** CRITICAL
**Status:** FIXED (2026-04-09)
**Found:** 2026-04-09 (E2E API testing + code analysis)
**Component:** packages/db/src/queries/ai-settings.ts, services/api/.env

## Summary

`ENCRYPTION_KEY` is not set in `services/api/.env`. The `aiSettingsQueries` module receives `undefined` as the encryption key, causing `pgp_sym_encrypt(value, NULL)` to silently produce NULL. All BYOK provider API keys are never stored. AI chat with any BYOK provider fails with "API key is required".

## Root Cause

Inconsistent fallback handling:
- `services/api/src/integrations/credential-vault.ts` line 4: `process.env.ENCRYPTION_KEY ?? "doable-dev-encryption-key"` (HAS fallback)
- `services/api/src/routes/ai-settings.ts` line 10: `aiSettingsQueries(sql, process.env.ENCRYPTION_KEY)` (NO fallback)
- `services/api/src/routes/chat.ts`: Same — passes raw `process.env.ENCRYPTION_KEY`

## Repro Steps

1. Add a BYOK provider (Anthropic/OpenAI) via `POST /workspaces/:id/ai-settings/providers`
2. Set it as workspace default
3. Send an AI chat message
4. Error: "Anthropic API key is required" / provider validate: "x-api-key header is required"

## Impact

- ALL BYOK AI providers are non-functional
- Users cannot use their own API keys for AI chat
- Only GitHub Copilot (which uses token-based auth, not encryption) could potentially work

## Fix

Either:
1. Add `ENCRYPTION_KEY=<random-string>` to `.env`
2. Add fallback in all call sites: `process.env.ENCRYPTION_KEY ?? "doable-dev-encryption-key"`
3. Both (recommended) — use fallback for dev, require env var in production
