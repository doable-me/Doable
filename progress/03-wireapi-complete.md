# Phase 3: wireApi Field Plumbing (PRD 23)

**Status:** Complete
**Date:** 2026-04-06

## Summary

Exposed the `wireApi` field from the database through the BYOK provider config to the Copilot SDK session creation. This allows providers using the OpenAI Responses API format to be correctly configured.

## Changes

### 1. `packages/db/src/types.ts` — AiProviderRow type
- Added `wire_api: "completions" | "responses" | null` to the `AiProviderRow` interface to match the column added in migration 038.

### 2. `services/api/src/ai/providers/copilot.ts` — ByokProviderConfig interface
- Added `wireApi?: "completions" | "responses"` to the `ByokProviderConfig` interface.
- No change needed in `createSession` — it already spreads `config.provider` directly into the SDK's `SessionConfig`, which accepts `wireApi` on its `ProviderConfig` type.

### 3. `services/api/src/routes/chat.ts` — Provider resolution (2 locations)
- **Line ~155** (direct provider resolution): Added `wireApi` mapping from `providerData.row.wire_api`.
- **Line ~2076** (`resolveProvider` helper for suggestion configs): Added `wireApi` mapping from `providerData.row.wire_api`.

Both locations use conditional spread (`...(row.wire_api ? { wireApi: row.wire_api } : {})`) so existing providers without `wire_api` set are unaffected.

## Verification

- TypeScript type-check passes with no new errors.
- The SDK's `ProviderConfig` type (`@github/copilot-sdk`) already declares `wireApi?: "completions" | "responses"`, so the field flows through cleanly.
