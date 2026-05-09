# TC-AI-CHAT-MODELS — Model selection (Copilot, OpenAI, Anthropic, BYOK)

Covers /chat/models, GET workspace AI settings, model fallback, BYOK key validation, model-specific features, errors, and admin controls.

## TC-AI-CHAT-MODELS-001 — List available models (smoke)
- **Steps:** GET /chat/models
- **Expected:** array including copilot-default + BYOK options when keys present
- **Severity:** smoke

## TC-AI-CHAT-MODELS-002 — Default model is Copilot
- **Pre:** no BYOK
- **Expected:** model=`copilot/gpt-4.1` (or configured default)
- **Severity:** smoke

## TC-AI-CHAT-MODELS-003 — Switch model via session settings
- **Steps:** PATCH /chat/sessions/:id {model:"anthropic/claude-3-5-sonnet"}
- **Expected:** subsequent messages use that model
- **Severity:** high

## TC-AI-CHAT-MODELS-004 — Per-message model override
- **Steps:** POST message with model param
- **Expected:** that turn uses override; session unchanged
- **Severity:** medium

## TC-AI-CHAT-MODELS-005 — BYOK Anthropic key configured
- **Pre:** workspace adds anthropic key
- **Steps:** verify key endpoint
- **Expected:** key stored encrypted; quick validate (1 token call) returns ok
- **Severity:** high

## TC-AI-CHAT-MODELS-006 — BYOK invalid key rejected at save
- **Steps:** save invalid key
- **Expected:** 400 with provider error message
- **Severity:** high

## TC-AI-CHAT-MODELS-007 — BYOK key revoked at provider
- **Pre:** valid key revoked externally
- **Steps:** send message
- **Expected:** SSE error 401 from provider; user prompted to re-add key
- **Severity:** medium

## TC-AI-CHAT-MODELS-008 — BYOK OpenAI key
- **Pre:** openai key set
- **Steps:** select gpt-4o; send
- **Expected:** routes to openai; usage logged
- **Severity:** high

## TC-AI-CHAT-MODELS-009 — Copilot CLI not authed → fallback to BYOK
- **Pre:** copilot logged out; openai key present
- **Steps:** default model send
- **Expected:** auto-fallback to openai; UI notice
- **Severity:** high

## TC-AI-CHAT-MODELS-010 — No fallback available → error
- **Pre:** copilot down, no BYOK
- **Steps:** send
- **Expected:** SSE error provider_unavailable; retry CTA
- **Severity:** high

## TC-AI-CHAT-MODELS-011 — Model selection persisted in session
- **Severity:** medium

## TC-AI-CHAT-MODELS-012 — Workspace AI settings define allowed models
- **Pre:** admin restricts to copilot only
- **Steps:** list models
- **Expected:** only copilot returned
- **Severity:** high

## TC-AI-CHAT-MODELS-013 — Disallowed model in PATCH rejected
- **Steps:** set claude when restricted
- **Expected:** 403
- **Severity:** high

## TC-AI-CHAT-MODELS-014 — BYOK key encryption at rest
- **Steps:** read DB row
- **Expected:** ciphertext only; not plaintext
- **Severity:** critical

## TC-AI-CHAT-MODELS-015 — BYOK key never returned in API responses
- **Steps:** GET /workspace/ai-settings
- **Expected:** key fields show last-4 only
- **Severity:** critical

## TC-AI-CHAT-MODELS-016 — Model-specific token cost recorded
- **Severity:** medium

## TC-AI-CHAT-MODELS-017 — Model temperature override per session
- **Steps:** PATCH session {temperature:0.2}
- **Expected:** assistant respects setting
- **Severity:** low

## TC-AI-CHAT-MODELS-018 — Model maxOutputTokens override
- **Severity:** low

## TC-AI-CHAT-MODELS-019 — Streaming supported for all listed models
- **Steps:** test each
- **Expected:** SSE works; non-streaming providers wrapped
- **Severity:** high

## TC-AI-CHAT-MODELS-020 — Tool-use disabled when model lacks tool support
- **Pre:** non-tool model
- **Steps:** agent send
- **Expected:** UI warns or auto-switch to chat mode
- **Severity:** medium

## TC-AI-CHAT-MODELS-021 — Default model name visible in UI
- **Severity:** low

## TC-AI-CHAT-MODELS-022 — Model dropdown lists provider grouping
- **Severity:** low

## TC-AI-CHAT-MODELS-023 — Model upgrade banner shown when better model available
- **Severity:** low

## TC-AI-CHAT-MODELS-024 — Audit log on BYOK key add/remove
- **Severity:** high

## TC-AI-CHAT-MODELS-025 — Concurrent BYOK calls don't share state
- **Severity:** medium

## TC-AI-CHAT-MODELS-026 — Provider rate limit returns 429 to user
- **Pre:** OpenAI 429
- **Expected:** propagated; UI retryAfter shown
- **Severity:** medium

## TC-AI-CHAT-MODELS-027 — Provider 5xx triggers retry with backoff
- **Severity:** medium

## TC-AI-CHAT-MODELS-028 — Provider response with no choices handled
- **Expected:** SSE error model_returned_empty; no credit deducted
- **Severity:** medium

## TC-AI-CHAT-MODELS-029 — Workspace BYOK overrides personal
- **Severity:** medium

## TC-AI-CHAT-MODELS-030 — Personal BYOK enables when no workspace key
- **Severity:** medium

## TC-AI-CHAT-MODELS-031 — Removing BYOK clears cache
- **Steps:** DELETE key; immediate next call uses Copilot fallback
- **Severity:** high

## TC-AI-CHAT-MODELS-032 — BYOK key validation rate limited
- **Severity:** low

## TC-AI-CHAT-MODELS-033 — Model list cached for 60s
- **Severity:** low

## TC-AI-CHAT-MODELS-034 — Per-model system prompt template
- **Pre:** template per provider
- **Severity:** medium

## TC-AI-CHAT-MODELS-035 — Vision-capable model accepts image attachments (when chat allows)
- **Severity:** medium

## TC-AI-CHAT-MODELS-036 — Model deprecation banner with switch CTA
- **Severity:** low

## TC-AI-CHAT-MODELS-037 — Admin lock model for entire org
- **Severity:** medium

## TC-AI-CHAT-MODELS-038 — BYOK quota exhausted at provider returns proper error
- **Severity:** medium

## TC-AI-CHAT-MODELS-039 — Mixed-mode session: provider switch mid-session preserves history
- **Severity:** medium

## TC-AI-CHAT-MODELS-040 — Model identity logged on each ai_messages row
- **Severity:** medium
