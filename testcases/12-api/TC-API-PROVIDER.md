# TC-API-PROVIDER — /ai/provider-catalog + /workspaces/:wid/ai-settings/* (provider bridge)

Mounted at `/ai` and `/workspaces` (`services/api/src/routes.ts:78,79`). Sources: `routes/provider-catalog.ts`, `routes/provider-bridge.ts`, `routes/ai-settings*.ts`.

Tables: `ai_providers`, `user_ai_preferences`, `platform_ai_defaults`, `workspace_ai_settings`, `ai_provider_models`, `model_pricing`.

Endpoints (verified in source):
- `GET    /ai/provider-catalog`                                    — public; ETag-cached
- `POST   /ai/providers/test-connection`                           — auth
- `GET    /workspaces/:wid/ai-settings`                            — workspace AI settings (chat default model, etc.)
- `PUT    /workspaces/:wid/ai-settings`
- `GET    /workspaces/:wid/ai-settings/providers`
- `POST   /workspaces/:wid/ai-settings/providers`                  — save BYOK provider
- `GET    /workspaces/:wid/ai-settings/providers/:id`
- `PUT    /workspaces/:wid/ai-settings/providers/:id`
- `DELETE /workspaces/:wid/ai-settings/providers/:id`
- `POST   /workspaces/:wid/ai-settings/providers/:id/validate`
- `POST   /workspaces/:wid/ai-settings/providers/:id/discover-models`
- `POST   /workspaces/:wid/ai-settings/providers/:id/revoke`
- `GET    /workspaces/:wid/ai-settings/copilot`                    — per-user copilot model override
- `PUT    /workspaces/:wid/ai-settings/copilot`

---

## TC-API-PROV-001 — GET /ai/provider-catalog 200 (public)
- **Steps:** GET no auth.
- **Expected:** 200 `{data:[...providers]}`; `ETag` header; `Cache-Control: no-cache`.
- **Severity:** smoke

## TC-API-PROV-002 — GET catalog with matching `If-None-Match` → 304
- **Steps:** Send the same ETag.
- **Expected:** 304, no body.
- **Severity:** smoke

## TC-API-PROV-003 — GET catalog with stale ETag → 200 with new ETag
- **Steps:** Send wrong ETag.
- **Expected:** 200 fresh body.
- **Severity:** medium

## TC-API-PROV-004 — GET catalog content includes Anthropic, OpenAI presets
- **Expected:** Catalog has `anthropic`, `openai`, `azure`, `minimax` etc.
- **Severity:** smoke

## TC-API-PROV-005 — POST /ai/providers/test-connection 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-PROV-006 — POST test-connection valid OpenAI 200
- **Steps:** `{type:"openai", baseUrl:"https://api.openai.com/v1", apiKey:"<valid>"}`.
- **Expected:** 200 `{ok:true, models:[...]}`.
- **Severity:** smoke

## TC-API-PROV-007 — POST test-connection valid Anthropic 200
- **Steps:** `{type:"anthropic", baseUrl:"https://api.anthropic.com", apiKey:"sk-ant-..."}`.
- **Expected:** 200.
- **Severity:** smoke

## TC-API-PROV-008 — POST test-connection invalid key → 400/401
- **Steps:** apiKey "bogus".
- **Expected:** 400 `{ok:false, error}` or 502.
- **Severity:** smoke

## TC-API-PROV-009 — POST test-connection malformed baseUrl → 400
- **Steps:** baseUrl "not-a-url".
- **Expected:** 400 zod url validator.
- **Severity:** high

## TC-API-PROV-010 — POST test-connection SSRF localhost → 400
- **Steps:** baseUrl `http://localhost:11434`.
- **Expected:** 400 SSRF guard (or 200 — if local providers allowed; document).
- **Severity:** smoke

## TC-API-PROV-011 — POST test-connection 169.254.x.x → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-PROV-012 — POST test-connection unknown type → 400
- **Steps:** type "openrouter".
- **Expected:** 400 enum `[openai,azure,anthropic]`.
- **Severity:** high

## TC-API-PROV-013 — POST test-connection presetId for non-discovery preset uses validationModel
- **Steps:** type:"openai", presetId:"minimax".
- **Expected:** Validator falls back to chat.completions ping using preset's defaultModels[0].id.
- **Severity:** medium

## TC-API-PROV-014 — POST test-connection unknown presetId ignored
- **Steps:** presetId:"not-real".
- **Expected:** 200/400 — preset lookup returns null; no validation fallback.
- **Severity:** low

## TC-API-PROV-015 — POST test-connection azure with apiVersion
- **Steps:** azure:{apiVersion:"2024-02-15"}.
- **Expected:** 200/400 based on key.
- **Severity:** medium

## TC-API-PROV-016 — POST test-connection bearerToken instead of apiKey
- **Steps:** bearerToken set, apiKey omitted.
- **Expected:** 200 if valid; otherwise 400.
- **Severity:** medium

## TC-API-PROV-017 — POST test-connection both apiKey and bearerToken
- **Steps:** Both set.
- **Expected:** 200; one used per provider rules.
- **Severity:** medium

## TC-API-PROV-018 — POST test-connection 5MB body → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-PROV-019 — POST test-connection wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-PROV-020 — POST test-connection malformed JSON → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-PROV-021 — GET /workspaces/:wid/ai-settings 200
- **Expected:** 200 settings (default chat provider, model).
- **Severity:** smoke

## TC-API-PROV-022 — GET ai-settings 401
- **Expected:** 401.
- **Severity:** smoke

## TC-API-PROV-023 — GET ai-settings non-member → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-PROV-024 — PUT ai-settings 200 (admin)
- **Steps:** PUT `{defaultProviderId, defaultModelId}`.
- **Expected:** 200.
- **Severity:** high

## TC-API-PROV-025 — PUT ai-settings by viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-PROV-026 — PUT ai-settings provider not in workspace → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-PROV-027 — GET providers list 200
- **Expected:** 200 list with redacted apiKey.
- **Severity:** smoke

## TC-API-PROV-028 — POST providers (save BYOK) 201
- **Steps:** POST `{type:"anthropic", baseUrl, apiKey, presetId:"anthropic"}`.
- **Expected:** 201; row encrypted in DB; response redacts.
- **Severity:** smoke

## TC-API-PROV-029 — POST providers admin-only → 403 viewer
- **Expected:** 403.
- **Severity:** high

## TC-API-PROV-030 — POST providers duplicate type+baseUrl → 409
- **Expected:** 409 unique.
- **Severity:** medium

## TC-API-PROV-031 — POST providers with `is_admin:true` field stripped
- **Expected:** 201; no privilege change.
- **Severity:** smoke

## TC-API-PROV-032 — GET providers/:id 200 redacted
- **Expected:** 200 without plaintext secret.
- **Severity:** smoke

## TC-API-PROV-033 — GET providers/:id from another workspace → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-PROV-034 — PUT providers/:id rotate key 200
- **Expected:** 200; new key encrypted; old invalidated in cache.
- **Severity:** high

## TC-API-PROV-035 — DELETE providers/:id 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-PROV-036 — DELETE provider currently used by ai_settings
- **Steps:** Provider is the workspace default.
- **Expected:** 409 must reassign.
- **Severity:** high

## TC-API-PROV-037 — POST /:id/validate success 200
- **Expected:** 200; ai_providers.health_status = "healthy".
- **Severity:** smoke

## TC-API-PROV-038 — POST /:id/validate bad key → 200 with errored status
- **Expected:** 200 `{ok:false}`; health_status = "errored".
- **Severity:** high

## TC-API-PROV-039 — POST /:id/discover-models 200 caches into ai_provider_models
- **Steps:** Auth as admin.
- **Expected:** 200; rows upserted; models_cache JSON populated.
- **Severity:** smoke

## TC-API-PROV-040 — POST discover-models for revoked provider → 400/404
- **Expected:** 400/404.
- **Severity:** medium

## TC-API-PROV-041 — POST discover-models non-admin → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-PROV-042 — POST discover-models cross-workspace → 404
- **Expected:** 404.
- **Severity:** smoke

## TC-API-PROV-043 — POST /:id/revoke 200
- **Expected:** 200; encrypted key deleted; provider marked revoked.
- **Severity:** smoke

## TC-API-PROV-044 — POST revoke twice idempotent
- **Expected:** 200/409.
- **Severity:** medium

## TC-API-PROV-045 — GET copilot settings 200 (per-user override)
- **Expected:** 200 with current user's override (or defaults).
- **Severity:** smoke

## TC-API-PROV-046 — PUT copilot settings 200
- **Steps:** PUT `{providerId, modelId}`.
- **Expected:** 200; row in `user_ai_preferences`.
- **Severity:** high

## TC-API-PROV-047 — PUT copilot pointing to non-member workspace's provider → 403/404
- **Expected:** 403/404.
- **Severity:** high

## TC-API-PROV-048 — PUT copilot clearing override
- **Steps:** PUT `{providerId:null}`.
- **Expected:** 200; row deleted.
- **Severity:** medium

## TC-API-PROV-049 — Provider switching: chat picks new provider after PUT ai-settings
- **Steps:** Admin changes default; send chat.
- **Expected:** Chat uses new provider.
- **Severity:** smoke

## TC-API-PROV-050 — Per-user override beats workspace default
- **Steps:** User sets copilot override; admin sets diff default.
- **Expected:** User's chat uses their override.
- **Severity:** smoke

## TC-API-PROV-051 — Path SQL injection on :wid / :id
- **Expected:** 400.
- **Severity:** smoke

## TC-API-PROV-052 — UUID with extra suffix on /:id
- **Expected:** 404.
- **Severity:** medium

## TC-API-PROV-053 — Wrong method PATCH /providers → 405/404
- **Expected:** 405/404.
- **Severity:** low

## TC-API-PROV-054 — Body 5MB on POST providers → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-PROV-055 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-PROV-056 — Header CRLF on Authorization → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-PROV-057 — Header injection on apiKey field stripped
- **Steps:** apiKey containing `\r\n`.
- **Expected:** 400 or sanitized.
- **Severity:** high

## TC-API-PROV-058 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-PROV-059 — CORS from disallowed origin
- **Expected:** No allow header.
- **Severity:** smoke

## TC-API-PROV-060 — Idempotency-Key on POST providers → single row
- **Expected:** Single provider created.
- **Severity:** medium

## TC-API-PROV-061 — Encryption key rotation: old keys decryptable, new encrypts new
- **Pre:** Rotate ENCRYPTION_KEY (advanced).
- **Expected:** Existing keys still decrypt; new ones use new.
- **Severity:** high

## TC-API-PROV-062 — Provider response large (1 MB models list) handled
- **Expected:** 200; models persisted.
- **Severity:** medium

## TC-API-PROV-063 — Discover-models cache hit on second call
- **Steps:** Two consecutive POSTs.
- **Expected:** Second uses cached result; first clear forces refresh.
- **Severity:** medium

## TC-API-PROV-064 — DB unavailable mid-discover → 500 JSON, no half-state
- **Expected:** 500.
- **Severity:** high

## TC-API-PROV-065 — Pagination on /providers cursor edges
- **Expected:** Empty/end correct.
- **Severity:** medium

## TC-API-PROV-066 — Filter combo (type × status × workspace) matrix
- **Expected:** Correct subsets.
- **Severity:** medium

## TC-API-PROV-067 — model_pricing populated alongside ai_provider_models
- **Steps:** discover-models, then check pricing rows for known models.
- **Expected:** Rows exist for known pricing.
- **Severity:** medium

## TC-API-PROV-068 — platform_ai_defaults applied when workspace has none
- **Pre:** Wipe workspace_ai_settings; ensure platform default set.
- **Steps:** Send chat.
- **Expected:** Chat uses platform default.
- **Severity:** high

## TC-API-PROV-069 — POST test-connection cross-tenant key reuse blocked
- **Steps:** Use another workspace's saved key (paste cipher into payload).
- **Expected:** 400; cannot reuse encrypted blobs.
- **Severity:** smoke

## TC-API-PROV-070 — Unicode in provider name
- **Expected:** 201.
- **Severity:** low
