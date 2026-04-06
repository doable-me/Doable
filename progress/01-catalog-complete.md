# Phase 1 Complete: Static Provider Catalog

**PRD:** 23 — Universal LLM Provider Bridge
**Date:** 2026-04-06
**Status:** Done

## Files Created

### `packages/shared/src/ai/provider-types.ts`
TypeScript interfaces for the provider bridge:
- `ProviderPreset` — full provider definition (id, name, category, SDK type, auth, capabilities, models, etc.)
- `ModelPreset` — model metadata (id, context window, tool/vision support, tier)
- `UsageMetrics` — per-request usage tracking (tokens, cost, duration, TTFT)

### `packages/shared/src/ai/provider-catalog.ts`
Complete catalog of **61 providers** with `as const satisfies readonly ProviderPreset[]`:

| Tier | Category | Count |
|------|----------|-------|
| Tier 1 | Major Cloud | 6 (OpenAI, Anthropic, Google AI Studio, Azure OpenAI, AWS Bedrock, Google Vertex) |
| Tier 2 | Aggregators | 4 (OpenRouter, Together AI, Fireworks AI, Unify AI) |
| Tier 3 | Specialized Cloud | 9 (Groq, Mistral, Cohere, xAI, DeepSeek, Perplexity, SambaNova, Novita, PPIO) |
| Tier 4 | Regional/Emerging | 12 (Moonshot, Alibaba, Zhipu, Baidu, Volcengine, MiniMax, StepFun, 01.AI, Tencent, Cerebras, AI21, Hyperbolic) |
| Tier 5 | Infrastructure | 8 (DeepInfra, NVIDIA NIM, Cloudflare, Nebius, Scaleway, Infermatic, Lepton, OVHcloud) |
| Local Primary | Local Engines | 7 (Ollama, LM Studio, vLLM, llama.cpp, Jan, LocalAI, GPT4All) |
| Local Secondary | Local Engines | 12 (text-gen-webui, KoboldCpp, TGI, TabbyML, llamafile, Cortex, Docker, LMDeploy, SGLang, TabbyAPI, MLC LLM, Aphrodite) |
| Local Frontends | Local UI | 3 (Msty, Open WebUI, LibreChat) |

Derived lookups (all tree-shakeable):
- `PROVIDER_BY_ID` — O(1) lookup by provider ID
- `PROVIDERS_BY_CATEGORY` — grouped by cloud/local/gateway
- `PROVIDERS_BY_SUBCATEGORY` — grouped by all 8 subcategories
- `FREE_PROVIDERS` — providers with free tiers
- `PROVIDER_COUNT` — total count (61)
- `ProviderId` — union type of all valid provider IDs

### `packages/shared/src/ai/index.ts`
Barrel export for the `ai/` module.

### `packages/shared/src/index.ts` (updated)
Added `export * from "./ai/index.js"` to re-export from the shared package root.

## Verified
- TypeScript compiles cleanly (`tsc --noEmit` passes)
- Provider count confirmed: 61
- Zero runtime dependencies
- Tree-shakeable exports
- Importable from both API (`@doable/shared`) and frontend
