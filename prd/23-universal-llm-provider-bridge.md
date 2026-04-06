# PRD 23: Universal LLM Provider Bridge

> A modular, high-performance bridge enabling Doable users to configure ANY LLM provider — cloud or local — through the Copilot SDK's `ProviderConfig` system, with a rich preset catalog, model discovery, health checks, and multimodal support.
>
> Last updated: 2026-04-06

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Architecture Analysis — Reference Projects](#2-architecture-analysis)
3. [Current Doable State](#3-current-doable-state)
4. [Cloud Provider Catalog (39 Providers)](#4-cloud-provider-catalog)
5. [Local Provider Catalog (22 Engines)](#5-local-provider-catalog)
6. [Multimodal Capabilities Matrix](#6-multimodal-capabilities-matrix)
7. [Implementation Plan — The Bridge](#7-implementation-plan)
8. [Database Schema](#8-database-schema)
9. [API Routes](#9-api-routes)
10. [Frontend UX](#10-frontend-ux)
11. [Performance Guardrails](#11-performance-guardrails)
12. [What We Do NOT Build](#12-what-we-do-not-build)
13. [Cost & Usage Tracking (→ PRD 20)](#13-cost--usage-tracking--prd-20)
14. [Implementation Phases](#14-implementation-phases)

---

## 1. Problem Statement

Doable uses the GitHub Copilot SDK (`@github/copilot-sdk@0.1.32`) as its core AI engine. The SDK supports custom LLM providers via its `ProviderConfig` interface with three wire types: `"openai"`, `"azure"`, and `"anthropic"`. This already enables connecting to **any OpenAI-compatible API** (which covers ~95% of all providers), direct Anthropic API, and Azure OpenAI.

**The SDK plumbing works. What's missing is the user experience:**

- Users don't know which providers exist or how to configure them
- No preset catalog with pre-filled base URLs, key formats, or model lists
- No model discovery (auto-fetching available models from a provider endpoint)
- No health checks or connectivity validation before saving
- No multimodal capability tracking (vision, image gen, tool calling, MCP)
- No provider-specific warnings (e.g., Ollama streaming + tools is broken)
- The `wireApi` field ("completions" vs "responses") is not exposed in the UI
- Only 3 provider types in the DB enum — enough technically, but no preset metadata

**Goal**: Enable any Doable user — creator, designer, producer, CEO — to connect their preferred LLM provider in under 60 seconds, with zero knowledge of API formats or endpoint URLs.

---

## 2. Architecture Analysis — Reference Projects

### 2.1 AnythingLLM (Mintplex-Labs/anything-llm)

**Pattern**: Duck-typing with hardcoded registry. 36+ providers, each a self-contained class in `server/utils/AiProviders/<name>/index.js`. No base class — implicit interface via JSDoc typedef. ~70% of providers reuse the `openai` npm package with different `baseURL`.

**Config**: Environment variables persisted to `.env` file. `KEY_MAPPING` object maps UI fields to env vars with validation. Per-workspace overrides via DB columns (`chatProvider`, `chatModel`).

**Registration**: Hardcoded switch statements. Adding a provider touches 6-9 files. `supportedLLM()` validator is the canonical list.

**Multimodal**: Per-provider `#generateContent()` methods convert attachments to provider-native format. Full OCR pipeline via Tesseract.js. MCP via `MCPHypervisor` class. Model capabilities tracked as `{tools, reasoning, imageGeneration, vision}`.

**Strengths**: Simple, proven at scale (100K+ users). Per-workspace provider overrides. Good OCR pipeline.
**Weaknesses**: Copy-paste heavy. No base class safety. 6-9 file changes per new provider.

### 2.2 AionUI (iOfficeAI/AionUi)

**Pattern**: Generic abstract base class `RotatingApiClient<T>` with Strategy pattern + Protocol Converters. OpenAI format is the lingua franca. Three concrete clients: `OpenAIRotatingClient`, `GeminiRotatingClient`, `AnthropicRotatingClient`.

**Config**: `IProvider` type with `modelProtocols` for per-model protocol routing (critical for "New API" gateways like OneAPI). 25+ preset platforms. Extension-contributed providers.

**Key innovation**: `ApiKeyManager` with multi-key rotation and 90-second blacklisting. `ProtocolConverter<TInput, TOutput, TResponse>` interface cleanly separates format translation from client management.

**Multimodal**: `ModelCapability` type tracks 9 capability types. Protocol converters handle image format conversion (base64/URL). Image generation via built-in MCP server. Three-tier capability detection: user config > hardcoded rules > regex patterns.

**Strengths**: Type-safe generics. Multi-key rotation. Per-model protocol routing. Extension system.
**Weaknesses**: Complex abstraction layers. Desktop-app focused (Electron store).

### 2.3 CCS (kaitranntt/ccs — Claude Code Switch)

**Pattern**: Two-layer abstraction. Layer 1: `TargetAdapter` (which CLI tool — Claude, Droid, Codex). Layer 2: `CLIProxy` (which LLM provider). Anthropic format is the lingua franca (opposite of AionUI). N×M combinations without N*M implementations.

**Config**: YAML-based (`~/.ccs/config.yaml`). 13 provider presets with templates. Composite variants allow mixing providers per tier (e.g., Codex for opus, Gemini for sonnet).

**Key innovation**: Provider presets catalog (`provider-preset-catalog.ts`) with `baseUrl`, `defaultModel`, `apiKeyPlaceholder`, `apiKeyHint`. Quota-aware account selection with failover. Port management for concurrent provider instances.

**Multimodal**: Vision-to-text preprocessing via image analyzer hook. MCP servers for image analysis and web search as capability bridges.

**Strengths**: Two-layer separation is elegant. Presets are user-friendly. Quota-aware failover.
**Weaknesses**: CLI-focused, not web UI. Complex binary management.

### 2.4 Key Takeaways for Doable

| Decision | AnythingLLM | AionUI | CCS | **Doable Choice** |
|----------|-------------|--------|-----|-------------------|
| Abstraction | Duck-typing | Generic base class | Two-layer proxy | **SDK handles it** (no custom abstraction needed) |
| Lingua franca | OpenAI | OpenAI | Anthropic | **SDK-internal** (transparent to us) |
| Config storage | `.env` file | Electron store | YAML file | **PostgreSQL + pgcrypto** (already built) |
| Registration | Hardcoded switch | Factory + extensions | Registry + presets | **Static catalog + DB** |
| Multimodal | Per-provider handlers | Protocol converters | Vision-to-text hooks | **SDK attachments API** |
| MCP | MCPHypervisor | Built-in servers | Provisioned servers | **SDK `mcpServers` config** |

**Critical insight**: The Copilot SDK absorbs the complexity that all three reference projects had to build themselves. We don't need protocol converters, format translators, or proxy layers. We need **a catalog, a validator, and a UI**.

---

## 3. Current Doable State

### 3.1 What Already Exists

**Copilot SDK BYOK** (`services/api/src/ai/providers/copilot.ts:39-45`):
```typescript
export interface ByokProviderConfig {
  type?: "openai" | "azure" | "anthropic";
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  azure?: { apiVersion?: string };
}
```

**SDK ProviderConfig** (`node_modules/@github/copilot-sdk/dist/types.d.ts:618-650`):
```typescript
export interface ProviderConfig {
  type?: "openai" | "azure" | "anthropic";
  wireApi?: "completions" | "responses";
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  azure?: { apiVersion?: string };
}
```

**Database tables** (migrations 009-012):
- `ai_providers` — BYOK provider configs (type enum, base URL, encrypted API key/bearer token, Azure API version)
- `workspace_ai_settings` — defaults + enforcement per workspace
- `user_ai_preferences` — per-user per-workspace model/provider choices
- `github_copilot_accounts` — GitHub OAuth tokens for Copilot subscription auth

**5-tier resolution chain** (`services/api/src/routes/chat.ts:83-175`):
1. Admin enforcement → 2. Request overrides → 3. User preferences → 4. Workspace defaults → 5. System default

**Frontend** (`apps/web/src/modules/ai-settings/`):
- Workspace admin settings with model config tab
- In-editor model selector with hardcoded fallback model lists
- Models grouped as "copilot" (GitHub subscription) and "custom" (BYOK)

### 3.2 What's Missing

- `wireApi` field not exposed (SDK supports "completions" vs "responses")
- No provider preset catalog (users must know base URLs, key formats)
- No model discovery (no auto-fetch from `/v1/models`)
- No health checks (no connectivity validation)
- No multimodal capability tracking
- No provider-specific warnings or configuration hints
- `ai_provider_type` enum limited to `('openai', 'azure', 'anthropic')` — correct technically but no preset metadata
- Secondary `LLMProvider` interface system exists but is unused by main chat flow

---

## 4. Cloud Provider Catalog (39 Providers)

### 4.1 Tier 1 — Major Cloud Providers (6)

| # | Provider | Base URL | SDK Type | Auth Header | Key Prefix | Get Key URL |
|---|----------|----------|----------|-------------|------------|-------------|
| 1 | **OpenAI** | `https://api.openai.com/v1` | `openai` | `Authorization: Bearer` | `sk-` | platform.openai.com/api-keys |
| 2 | **Anthropic** | `https://api.anthropic.com` | `anthropic` | `x-api-key:` | `sk-ant-` | console.anthropic.com/settings/keys |
| 3 | **Google AI Studio (Gemini)** | `https://generativelanguage.googleapis.com/v1beta/openai/` | `openai` | `Authorization: Bearer` | `AIza` | aistudio.google.com/apikey |
| 4 | **Azure OpenAI** | `https://<resource>.openai.azure.com/openai/v1/` | `azure` | `api-key:` | *(hex string)* | portal.azure.com |
| 5 | **AWS Bedrock** | `https://bedrock-runtime.<region>.amazonaws.com/openai/v1` | `openai` | AWS Sig V4 | *(IAM credentials)* | console.aws.amazon.com/iam |
| 6 | **Google Vertex AI** | `https://<region>-aiplatform.googleapis.com/v1/...` | `openai` | `Authorization: Bearer` | *(GCP OAuth)* | console.cloud.google.com |

### 4.2 Tier 2 — Aggregators / Routers (4)

| # | Provider | Base URL | SDK Type | Key Prefix | Free Tier |
|---|----------|----------|----------|------------|-----------|
| 7 | **OpenRouter** | `https://openrouter.ai/api/v1` | `openai` | `sk-or-v1-` | Yes (28+ free models) |
| 8 | **Together AI** | `https://api.together.xyz/v1` | `openai` | *(none)* | $25 free credits |
| 9 | **Fireworks AI** | `https://api.fireworks.ai/inference/v1` | `openai` | `fw_` | $1 free credits |
| 10 | **Unify AI** | `https://api.unify.ai/v0` | `openai` | *(none)* | Yes |

### 4.3 Tier 3 — Specialized Cloud (9)

| # | Provider | Base URL | SDK Type | Key Prefix | Free Tier |
|---|----------|----------|----------|------------|-----------|
| 11 | **Groq** | `https://api.groq.com/openai/v1` | `openai` | `gsk_` | Yes (generous, no CC) |
| 12 | **Mistral AI** | `https://api.mistral.ai/v1` | `openai` | *(none)* | Yes (Experiment plan) |
| 13 | **Cohere** | `https://api.cohere.ai/compatibility/v1` | `openai` | *(none)* | 1K calls/month |
| 14 | **xAI (Grok)** | `https://api.x.ai/v1` | `openai` | `xai-` | $25 free + $150/mo |
| 15 | **DeepSeek** | `https://api.deepseek.com` | `openai` | `dsk-` | Yes (free tokens) |
| 16 | **Perplexity** | `https://api.perplexity.ai` | `openai` | `pplx-` | $5/mo (Pro users) |
| 17 | **SambaNova** | `https://api.sambanova.ai/v1` | `openai` | *(none)* | $5 free credits |
| 18 | **Novita AI** | `https://api.novita.ai/v3/openai` | `openai` | *(none)* | Yes |
| 19 | **PPIO** | `https://api.ppinfra.com/v3/openai` | `openai` | *(none)* | Unknown |

### 4.4 Tier 4 — Regional / Emerging (12)

| # | Provider | Base URL | SDK Type | Key Prefix |
|---|----------|----------|----------|------------|
| 20 | **Moonshot / Kimi** | `https://api.moonshot.ai/v1` | `openai` | *(none)* |
| 21 | **Alibaba / DashScope** | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `openai` | `sk-` |
| 22 | **Zhipu AI / GLM** | `https://open.bigmodel.cn/api/paas/v4` | `openai` | *(none)* |
| 23 | **Baidu Qianfan** | `https://qianfan.baidubce.com/v2` | `openai` | *(AK/SK pair)* |
| 24 | **Volcengine / Doubao** | `https://ark.cn-beijing.volces.com/api/v3` | `openai` | *(none)* |
| 25 | **MiniMax** | `https://api.minimax.io/v1` | `openai` | *(none)* |
| 26 | **StepFun** | `https://api.stepfun.ai/v1` | `openai` | *(none)* |
| 27 | **01.AI / Yi** | `https://api.01.ai/v1` | `openai` | *(none)* |
| 28 | **Tencent Hunyuan** | `https://api.hunyuan.cloud.tencent.com/v1` | `openai` | *(none)* |
| 29 | **Cerebras** | `https://api.cerebras.ai/v1` | `openai` | *(none)* |
| 30 | **AI21 Labs** | `https://api.ai21.com/studio/v1` | `openai` | *(none)* |
| 31 | **Hyperbolic** | `https://api.hyperbolic.xyz/v1` | `openai` | *(none)* |

### 4.5 Tier 5 — Infrastructure / Platform (8)

| # | Provider | Base URL | SDK Type | Key Prefix |
|---|----------|----------|----------|------------|
| 32 | **DeepInfra** | `https://api.deepinfra.com/v1/openai` | `openai` | *(none)* |
| 33 | **NVIDIA NIM** | `https://integrate.api.nvidia.com/v1` | `openai` | `nvapi-` |
| 34 | **Cloudflare Workers AI** | `https://api.cloudflare.com/client/v4/accounts/{id}/ai/v1` | `openai` | *(CF token)* |
| 35 | **Nebius AI Studio** | `https://api.studio.nebius.ai/v1` | `openai` | *(none)* |
| 36 | **Scaleway** | `https://api.scaleway.ai/v1` | `openai` | *(SCW key)* |
| 37 | **Infermatic** | `https://api.totalgpt.ai` | `openai` | *(none)* |
| 38 | **Lepton AI** | `https://<model>.lepton.run/api/v1` | `openai` | *(none)* |
| 39 | **OVHcloud** | `https://endpoints.ai.cloud.ovh.net` | `openai` | *(OVH token)* |

### 4.6 SDK Type Distribution

| SDK Type | Count | Providers |
|----------|-------|-----------|
| `openai` | **37** | All except Anthropic and Azure OpenAI |
| `anthropic` | **1** | Anthropic (+ MiniMax/Zhipu have anthropic-compat endpoints as alternates) |
| `azure` | **1** | Azure OpenAI |

### 4.7 Auth Header Formats

| Format | Providers |
|--------|-----------|
| `Authorization: Bearer <key>` | 34 providers (vast majority) |
| `x-api-key: <key>` | Anthropic, MiniMax (anthropic endpoint) |
| `api-key: <key>` | Azure OpenAI |
| AWS Signature V4 | AWS Bedrock |
| GCP OAuth Token | Google Vertex AI |
| AK/SK pair | Baidu Qianfan |

### 4.8 Known API Key Prefixes

| Prefix | Provider |
|--------|----------|
| `sk-` | OpenAI, Alibaba DashScope |
| `sk-ant-` | Anthropic |
| `sk-or-v1-` | OpenRouter |
| `AIza` | Google AI Studio (Gemini) |
| `gsk_` | Groq |
| `xai-` | xAI (Grok) |
| `dsk-` | DeepSeek |
| `pplx-` | Perplexity |
| `nvapi-` | NVIDIA NIM |
| `fw_` | Fireworks AI |

### 4.9 Generous Free Tiers

| Provider | Free Offering |
|----------|---------------|
| Google Gemini | 5-15 RPM, no credit card |
| Groq | All models free, no credit card, 30 RPM |
| Cerebras | 1M tokens/day free, no credit card |
| xAI | $25 credits + $150/mo (data sharing) |
| OpenRouter | 28+ free models, no credit card |
| DeepSeek | ~500M tokens/month free |
| Mistral | Experiment plan free, no credit card |
| Together AI | $25 free credits |
| SambaNova | $5 free credits |

---

## 5. Local Provider Catalog (22 Engines)

### 5.1 Primary Engines (7)

| # | Engine | Default URL | Port | Auth | GPU Required | Install |
|---|--------|-------------|------|------|--------------|---------|
| 1 | **Ollama** | `http://localhost:11434/v1` | 11434 | No | No | `brew install ollama` / `curl -fsSL https://ollama.com/install.sh \| sh` |
| 2 | **LM Studio** | `http://localhost:1234/v1` | 1234 | Optional | No | Desktop app from lmstudio.ai |
| 3 | **vLLM** | `http://localhost:8000/v1` | 8000 | Optional | **Yes** | `pip install vllm` |
| 4 | **llama.cpp** | `http://localhost:8080/v1` | 8080 | Optional | No | `brew install llama.cpp` / CMake build |
| 5 | **Jan** | `http://localhost:1337/v1` | 1337 | No | No | Desktop app from jan.ai |
| 6 | **LocalAI** | `http://localhost:8080/v1` | 8080 | No | No | `docker pull localai/localai` |
| 7 | **GPT4All** | `http://localhost:4891/v1` | 4891 | No | No | Desktop app from gpt4all.io |

### 5.2 Secondary Engines (12)

| # | Engine | Default URL | Port | GPU Required |
|---|--------|-------------|------|--------------|
| 8 | **text-generation-webui** | `http://localhost:5000/v1` | 5000 | No |
| 9 | **KoboldCpp** | `http://localhost:5001/v1` | 5001 | No |
| 10 | **TGI** (HuggingFace) | `http://localhost:8080/v1` | 8080 | **Yes** |
| 11 | **TabbyML** | `http://localhost:8080/v1` | 8080 | Recommended |
| 12 | **llamafile** (Mozilla) | `http://localhost:8080/v1` | 8080 | No |
| 13 | **Cortex** (by Jan) | `http://localhost:7331/v1` | 7331 | No |
| 14 | **Docker Model Runner** | `http://localhost:12434/engines/v1` | 12434 | No |
| 15 | **LMDeploy** | `http://localhost:23333/v1` | 23333 | **Yes** |
| 16 | **SGLang** | `http://localhost:30000/v1` | 30000 | **Yes** |
| 17 | **TabbyAPI** (ExLlamaV2) | `http://localhost:5000/v1` | 5000 | **Yes** |
| 18 | **MLC LLM** | `http://localhost:8000/v1` | 8000 | No |
| 19 | **Aphrodite Engine** | `http://localhost:2242/v1` | 2242 | **Yes** |

### 5.3 Managed Local-First Frontends (3)

| # | App | Default URL | Port |
|---|-----|-------------|------|
| 20 | **Msty** | `http://localhost:10000/v1` | 10000 |
| 21 | **Open WebUI** | `http://localhost:3000/v1` | 3000 |
| 22 | **LibreChat** | `http://localhost:3080` | 3080 |

### 5.4 Local Engine Feature Matrix

| Engine | Stream | Tools | Vision | MCP | Video | OCR | `/v1/models` |
|--------|--------|-------|--------|-----|-------|-----|--------------|
| **Ollama** | Yes* | Yes* | Yes | No** | No | Yes | Yes |
| **LM Studio** | Yes | Yes | Yes | Yes | No | Yes | Yes |
| **vLLM** | Yes | Yes | Yes | No | Yes | Yes | Yes |
| **llama.cpp** | Yes | Yes | Yes | No | No | Yes | Yes |
| **Jan** | Yes | Yes | Yes | Yes | No | Yes | Yes |
| **LocalAI** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **GPT4All** | Yes | **No** | **No** | No | No | No | Yes |
| **text-gen-webui** | Yes | Yes | Yes | No | No | Yes | Yes |
| **KoboldCpp** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **TGI** | Yes | Yes | Yes | No | No | Yes | Yes |
| **llamafile** | Yes | Yes | Yes | No | No | Yes | Yes |
| **SGLang** | Yes | Yes | Yes | No | Yes | Yes | Yes |
| **Aphrodite** | Yes | Yes | Yes | No | No | Yes | Yes |

*\* Ollama: streaming + tool calling broken on `/v1` endpoint — must use `stream: false` when tools present*
*\*\* Ollama: no native MCP, third-party bridges exist*

### 5.5 Critical Warnings

| Engine | Warning |
|--------|---------|
| **Ollama** | Streaming + tool calling broken on `/v1`. Use `stream: false` with tools, or native `/api/chat` |
| **Ollama** | `tool_choice` parameter NOT supported |
| **GPT4All** | No tool calling, no vision — most limited of primary engines |
| **TGI** | **Maintenance mode** since Dec 2025. HuggingFace recommends vLLM or SGLang |
| **Cortex/Nitro** | Nitro is **deprecated**, replaced by Cortex |
| **TabbyML** | Code completion focused, not general-purpose LLM server |

### 5.6 Timeout Recommendations

| Scenario | Timeout |
|----------|---------|
| Small model (<7B), GPU | 30s |
| Medium model (7-13B), GPU | 60s |
| Large model (30B+), GPU | 120s |
| Any model, CPU only | 300s |
| Model loading (first request) | 600s |

---

## 6. Multimodal Capabilities Matrix

### 6.1 Cloud Provider Capabilities

| Provider | Vision | Image Gen | Video In | Audio In | OCR | MCP | Tool Calling |
|----------|--------|-----------|----------|----------|-----|-----|-------------|
| **OpenAI** | Yes | Yes (gpt-image-1) | Yes (frames) | Yes (Whisper) | Yes | Yes | Yes |
| **Anthropic** | Yes | No | No | No | Yes | Yes (creator) | Yes |
| **Google Gemini** | Yes | Yes (native) | Yes (native) | Yes (Live API) | Yes | Yes | Yes |
| **Azure OpenAI** | Yes | Yes (DALL-E 3) | No | Yes | Yes | Yes | Yes |
| **Groq** | Yes | No | No | No | Yes | No | Yes |
| **Mistral** | Yes (Pixtral) | No | No | No | Yes (Document AI) | Yes | Yes |
| **xAI** | Yes (Aurora) | Yes (Imagine) | Yes (Imagine video) | No | Yes | No | Yes |
| **DeepSeek** | **No** (text-only) | No | No | No | No | No | Yes |
| **Together AI** | Yes | Yes (FLUX, SD) | No | No | Yes | No | Yes |
| **OpenRouter** | Yes* | Yes* | Yes* | No | Yes* | No | Yes* |
| **Fireworks** | Yes | Yes | No | No | Yes | No | Yes |
| **Cohere** | Yes | No | No | No | Yes | No | Yes |
| **Perplexity** | No | No | No | No | No | No | Yes |
| **SambaNova** | No | No | No | No | No | No | Yes* |
| **Cerebras** | No | No | No | No | No | No | Yes |

*\* Model-dependent — varies by which model is selected*

### 6.2 Copilot SDK Multimodal Support

The SDK natively supports multimodal through several mechanisms:

**Image Input** via `MessageOptions.attachments`:
```typescript
session.send({
  prompt: "Describe this image",
  attachments: [
    { type: "blob", data: base64Data, mimeType: "image/png", displayName: "screenshot.png" },
    { type: "file", path: "/absolute/path/to/image.jpg" },
  ],
});
```

**Tool Binary Results** — Tools can return images/audio to the model:
```typescript
type ToolBinaryResult = {
  data: string;        // base64-encoded
  mimeType: string;    // "image/png", "audio/wav", etc.
  type: string;
  description?: string;
};
```

**Model Capabilities Detection**:
```typescript
interface ModelCapabilities {
  supports: { vision: boolean; reasoningEffort: boolean };
  limits: {
    vision?: {
      supported_media_types: string[];  // ["image/png", "image/jpeg"]
      max_prompt_images: number;
      max_prompt_image_size: number;    // bytes
    };
  };
}
```

**MCP Servers** via `SessionConfig.mcpServers`:
```typescript
mcpServers: {
  "local-tool": { type: "local", command: "node", args: ["./server.js"], tools: ["*"] },
  "remote-tool": { type: "http", url: "https://api.example.com/mcp/", tools: ["*"] },
}
```

**Key takeaway**: The SDK handles format translation automatically. When using BYOK with `type: "openai"`, blob attachments are converted to OpenAI's `image_url` format. With `type: "anthropic"`, they become Anthropic's `image` source format. No custom converters needed.

### 6.3 How Reference Projects Handle Multimodal

**AnythingLLM**: Per-provider `#generateContent()` converts attachments to native format:
- OpenAI: `{type: "input_image", image_url: contentString}`
- Anthropic: `{type: "image", source: {type: "base64", media_type, data}}`
- Ollama: `{content: text, images: [base64Data]}`
- DeepSeek: Explicitly strips attachments ("do not support vision/image inputs")
- Full OCR pipeline via Tesseract.js for pre-processing

**AionUI**: Protocol converters handle image conversion:
- `OpenAI2AnthropicConverter`: Extracts MIME + data from data URLs → Anthropic image blocks
- `OpenAI2GeminiConverter`: Creates `{inlineData: {mimeType, data}}` (no HTTP URLs supported)
- Image generation via built-in MCP server with `aionui_image_generation` tool
- `ModelCapability` tracks 9 types: text, vision, function_calling, image_generation, web_search, reasoning, embedding, rerank, excludeFromPrimary

**CCS**: Vision-to-text preprocessing:
- Intercepts file reads targeting images/PDFs
- Routes through external vision model for text description
- Returns text to the LLM (works with any model, even text-only)
- MCP server for image analysis with workspace-scoped validation

---

## 7. Implementation Plan — The Bridge

### 7.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Provider      │  │ Model        │  │ Health Status │  │
│  │ Setup Wizard  │  │ Selector     │  │ Badges        │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
└─────────┼──────────────────┼──────────────────┼──────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                    API Routes (Hono)                      │
│  /ai/provider-catalog    /ai/providers/:id/validate      │
│  /ai/providers/:id/discover-models                       │
│  /ai/providers/test-connection                           │
└─────────────────────┬───────────────────────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
┌──────────────┐ ┌──────────┐ ┌──────────────────────┐
│ Provider     │ │ Provider │ │ PostgreSQL            │
│ Catalog      │ │ Discovery│ │ ai_providers +        │
│ (static TS)  │ │ Service  │ │ ai_provider_models +  │
│ 61 presets   │ │ (health, │ │ pgcrypto encryption   │
│              │ │  models) │ │                       │
└──────────────┘ └──────────┘ └──────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              Copilot SDK (ProviderConfig)                 │
│  type: "openai" | "azure" | "anthropic"                  │
│  wireApi: "completions" | "responses"                    │
│  baseUrl + apiKey/bearerToken                            │
│                                                          │
│  → Handles all format translation internally             │
│  → Vision attachments auto-converted per provider type   │
│  → MCP servers managed via SessionConfig                 │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Module 1: Provider Preset Catalog

**File**: `packages/shared/src/ai/provider-catalog.ts`

A static, typed catalog of all 61 providers. Zero runtime cost — pure data.

```typescript
export interface ProviderPreset {
  /** Unique identifier: "openai", "ollama", "openrouter", etc. */
  id: string;
  /** Display name: "OpenAI", "Ollama", etc. */
  name: string;
  /** Categorization */
  category: "cloud" | "local" | "gateway";
  /** Sub-category for UI grouping */
  subcategory: "major" | "aggregator" | "specialized" | "regional" | "infrastructure"
             | "primary" | "secondary" | "frontend";
  /** SDK provider type — maps directly to ProviderConfig.type */
  sdkType: "openai" | "azure" | "anthropic";
  /** Wire API format for OpenAI/Azure providers */
  wireApi?: "completions" | "responses";
  /** Default base URL (pre-filled in setup form) */
  defaultBaseUrl: string;
  /** Whether the user can edit the base URL (true for local providers) */
  baseUrlEditable: boolean;
  /** Whether the URL has template variables like {resource} or {region} */
  baseUrlTemplate?: boolean;
  /** Auth method */
  authMethod: "api-key" | "bearer" | "azure-key" | "aws-sig" | "gcp-oauth" | "none";
  /** Placeholder text for API key input */
  apiKeyPlaceholder?: string;
  /** Known API key prefix for validation */
  apiKeyPrefix?: string;
  /** URL where user gets their API key */
  apiKeyHelpUrl?: string;
  /** Whether GET /v1/models works for this provider */
  supportsModelDiscovery: boolean;
  /** Default models to show when discovery fails */
  defaultModels: ModelPreset[];
  /** Provider icon identifier (maps to frontend icon component) */
  icon: string;
  /** One-line description */
  description: string;
  /** Capability flags */
  capabilities: {
    streaming: boolean;
    toolCalling: boolean;
    vision: boolean;
    imageGeneration: boolean;
    video: boolean;
    audio: boolean;
    mcp: boolean;
  };
  /** Provider-specific warnings */
  warnings?: string[];
  /** Tags for search/filter: ["free", "fast", "local", "vision", "reasoning"] */
  tags: string[];
  /** Recommended timeout in ms for this provider (important for local) */
  defaultTimeoutMs?: number;
  /** Free tier info */
  freeTier?: string;
}

export interface ModelPreset {
  id: string;           // "gpt-4o", "claude-sonnet-4", etc.
  name: string;         // "GPT-4o"
  contextWindow?: number;
  supportsTools: boolean;
  supportsVision: boolean;
  tier?: "fast" | "balanced" | "powerful";
}
```

**Total: 61 presets** (39 cloud + 22 local). The catalog is ~15KB uncompressed, ~3KB gzipped. Imported statically — no API call needed.

### 7.3 Module 2: Provider Discovery Service

**File**: `services/api/src/ai/provider-discovery.ts`

```typescript
export interface ProviderDiscoveryService {
  /** Health check — validates connectivity + auth. Hard 3s timeout. */
  validateProvider(config: ByokProviderConfig): Promise<ValidationResult>;

  /** Fetch model list from /v1/models or equivalent */
  discoverModels(config: ByokProviderConfig, presetId?: string): Promise<DiscoveredModel[]>;

  /** Quick ping — HEAD request, 500ms timeout */
  ping(baseUrl: string): Promise<boolean>;
}

interface ValidationResult {
  ok: boolean;
  latencyMs: number;
  error?: "invalid_api_key" | "unreachable" | "timeout" | "rate_limited" | "unknown";
  providerName?: string;   // Detected from response headers
  models?: DiscoveredModel[];
}

interface DiscoveredModel {
  id: string;
  name?: string;
  contextWindow?: number;
  capabilities?: { vision?: boolean; tools?: boolean };
}
```

**Implementation**:
- `type: "openai"` → `GET {baseUrl}/models` with `Authorization: Bearer {apiKey}`
- `type: "anthropic"` → `GET {baseUrl}/v1/models` with `x-api-key: {apiKey}`
- `type: "azure"` → `GET {baseUrl}/models?api-version={version}` with `api-key: {apiKey}`
- **3-second hard timeout** on all validation requests
- **Model list cache**: In-memory Map with 5-minute TTL per provider ID. Persisted to DB `models_cache` JSONB column.
- **Provider-specific quirks**: Ollama returns models differently, some providers don't support `/v1/models` — fallback to preset defaults.

### 7.4 Module 3: Expose `wireApi` in ByokProviderConfig

**File**: `services/api/src/ai/providers/copilot.ts` — one-line addition:

```typescript
export interface ByokProviderConfig {
  type?: "openai" | "azure" | "anthropic";
  wireApi?: "completions" | "responses";  // ← ADD THIS
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  azure?: { apiVersion?: string };
}
```

**File**: `services/api/src/routes/chat.ts` — pass through in session creation.

---

## 8. Database Schema

**File**: `services/api/src/db/migrations/038_provider_enhancements.sql`

```sql
-- Enhance ai_providers with preset metadata and health tracking
ALTER TABLE ai_providers
  ADD COLUMN IF NOT EXISTS preset_id         text,
  ADD COLUMN IF NOT EXISTS wire_api          text CHECK (wire_api IN ('completions', 'responses')),
  ADD COLUMN IF NOT EXISTS supports_tools    boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS supports_vision   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_mcp      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_health_check timestamptz,
  ADD COLUMN IF NOT EXISTS health_status     text DEFAULT 'unknown'
    CHECK (health_status IN ('healthy', 'degraded', 'down', 'unknown')),
  ADD COLUMN IF NOT EXISTS health_latency_ms integer,
  ADD COLUMN IF NOT EXISTS display_order     integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS models_cache      jsonb,
  ADD COLUMN IF NOT EXISTS default_timeout_ms integer;

-- Per-provider model list with enable/disable
CREATE TABLE IF NOT EXISTS ai_provider_models (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  model_id        text NOT NULL,
  display_name    text,
  is_enabled      boolean NOT NULL DEFAULT true,
  context_window  integer,
  supports_tools  boolean DEFAULT true,
  supports_vision boolean DEFAULT false,
  display_order   integer DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_apm_provider ON ai_provider_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_apm_enabled ON ai_provider_models(provider_id, is_enabled)
  WHERE is_enabled = true;
```

**Key decisions**:
- No new enum values — `ai_provider_type` (`openai`/`azure`/`anthropic`) already covers everything
- `preset_id` links to the static catalog for icon, help URL, warnings
- `models_cache` JSONB avoids hitting provider on every page load
- `ai_provider_models` gives per-model enable/disable, reordering, custom labels

---

## 9. API Routes

Added to existing `services/api/src/routes/ai-settings.ts`:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/ai/provider-catalog` | Return static catalog (all 61 presets) |
| `POST` | `/ai/providers/test-connection` | Test before saving: validate + discover models |
| `POST` | `/ai/providers/:id/validate` | Health check existing provider |
| `POST` | `/ai/providers/:id/discover-models` | Fetch models from provider endpoint |
| `GET` | `/ai/providers/:id/models` | Get cached/discovered models |

**Behaviors**:
- `test-connection` accepts raw config (baseUrl, apiKey, type), returns `{ok, latencyMs, models[]}` — all before saving to DB
- `validate` updates `health_status`, `health_latency_ms`, `last_health_check` columns
- `discover-models` updates `models_cache` JSONB and `ai_provider_models` table
- All endpoints decrypt API keys server-side — keys never sent to frontend

---

## 10. Frontend UX

### 10.1 Provider Setup Wizard (new component)

**Step 1 — Choose Provider**: Grid of provider cards with tabs (Cloud / Local / Gateway). Search/filter by name or tag. Cards show: icon, name, description, "Free" badge if applicable, category tag.

**Step 2 — Configure**: Dynamic form pre-filled from preset defaults:
- Base URL (pre-filled, editable for local providers)
- API Key (with placeholder showing expected format, e.g., `sk-or-v1-...`)
- Label (auto-generated from provider name, editable)
- "Get API Key" link opens provider's developer console
- For Azure: additional resource name + API version fields
- For local: port detection hint ("Ollama default: 11434")

**Step 3 — Validate**: "Test Connection" button → calls `test-connection`:
- Shows spinner with "Connecting..."
- On success: green checkmark, latency in ms, number of models found
- On failure: red X with specific error ("Invalid API key", "Unreachable", "Timeout")
- Provider-specific warnings shown (e.g., "Ollama: streaming + tool calling is broken")

**Step 4 — Select Models**: Checkboxes for discovered models. Set default. Show context window size and capability badges (tools, vision) per model.

### 10.2 Provider List Enhancement

- Health status dot (green/yellow/red) per provider
- "Test" button for quick re-validation
- "Refresh Models" button
- Drag-to-reorder
- Expand to see model list per provider

### 10.3 Model Selector Enhancement

Enhance existing `editor-model-selector.tsx`:
- Group models by provider with provider icon
- Show health status dot inline
- "Local" badge for local providers
- Latency hint from last health check
- Capability badges (vision eye icon, tools wrench icon)

### 10.4 Provider Icon System

Icons referenced by `preset.icon` identifier. Map to a set of provider logos stored as small SVGs or using a consistent icon set. For providers without recognizable logos, use category-based icons (cloud, server, chip).

---

## 11. Performance Guardrails

| Concern | Solution |
|---------|----------|
| Catalog size | Static TypeScript module, ~3KB gzipped. No API call for preset grid. |
| Model discovery latency | In-memory Map cache (5-min TTL) + JSONB DB column. Lazy fetch on user action only. |
| Health check cost | Only on explicit user action (button click) or provider creation. No background polling. |
| Validation timeout | 3s hard cap. Provider unresponsive = marked degraded, no retry. |
| Chat hot path impact | **Zero**. `chat.ts` → `CopilotEngine.createSession()` unchanged. Provider resolution already reads from DB. New columns are read-only context. |
| Memory overhead | Model discovery cache: ~2KB per provider entry × max 20 providers = ~40KB. Negligible. |
| New dependencies | **None** for catalog. Discovery service uses native `fetch`. No new npm packages. |
| Frontend bundle | Catalog is tree-shakeable. Only imported in AI settings pages, not in editor. |

---

## 12. What We Do NOT Build

| Component | Why Not |
|-----------|---------|
| Protocol converter layer | SDK handles all format translation internally |
| Proxy binary | SDK handles provider connection directly |
| Multi-key rotation | Overkill at ~100 user scale (AionUI pattern) |
| Composite variants | CCS's "mix providers per tier" adds complexity without clear user value |
| Extension/plugin system | AionUI's extension-contributed providers is for plugin ecosystems. Our catalog suffices |
| `.env` file config | AnythingLLM's approach. We already have encrypted DB storage |
| Background health polling | No Redis, no cron. Lazy validation on user action only |
| Custom tokenizer per provider | Use SDK's built-in estimation. Exact token counts not critical for UX |

---

## 13. Cost & Usage Tracking (→ PRD 20)

**[PRD 20 — Usage, Token & Cost Tracking](20-usage-token-cost-tracking.md)** specifies the complete usage observability system. It has been updated to account for all 61 providers in this PRD. Key integration points:

### 13.1 What the Copilot SDK Already Provides

The SDK sends **rich usage events** on every API call that the chat route currently **discards** (`chat.ts:2521-2522`). These must be captured:

| SDK Event | Key Fields | Frequency |
|-----------|-----------|-----------|
| `assistant.usage` | `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `cost`, `duration`, `ttftMs`, `model` | Per API call |
| `session.shutdown` | `totalPremiumRequests`, per-model `modelMetrics`, `codeChanges` | Per session end |
| `session.usage_info` | `tokenLimit`, `currentTokens`, context breakdown | Per turn |

### 13.2 Multi-Provider Pricing Registry

With 61 providers, a `model_pricing` table maps model IDs to 4-category per-token costs (input, output, cache creation, cache read). Multi-step model name resolution handles provider-prefixed names, date suffixes, and aliases.

**Special cases by provider type:**
- **Local engines** (Ollama, LM Studio, vLLM, etc.): $0 cost, track tokens for context awareness only
- **OpenRouter**: Returns `cost` directly in API response — use it instead of calculating
- **GitHub Copilot subscription**: SDK's `cost` field is a billing multiplier, not USD. Calculate estimated cost from public model pricing.
- **BYOK providers**: Cost attributed to user via `byok_provider_id` FK to `ai_providers`

### 13.3 What Must Be Built (from PRD 20, currently 0% implemented)

1. **Token extraction** — Stop discarding `assistant.usage` events; capture into `ai_usage_log`
2. **Cost calculation** — `model_pricing` table with initial seed data for top models
3. **Per-message display** — `⚡ 1,234 tokens · $0.003 · 2.1s` footer on each AI response
4. **Per-provider spend dashboard** — Group costs by BYOK provider, showing which API keys cost what
5. **Budget controls** — Per-member daily/monthly caps, workspace spending limits, alerts at 80%/100%
6. **Credit consumption** — Wire `consumeCredits()` into the chat route (exists but never called)
7. **Aggregation** — Daily/monthly rollup tables for fast dashboard rendering

See [PRD 20](20-usage-token-cost-tracking.md) for complete schema, API routes, dashboard specs, and implementation phases.

---

## 14. Implementation Phases

| Phase | Module | Files | Effort | Impact |
|-------|--------|-------|--------|--------|
| **1** | Provider Catalog | `packages/shared/src/ai/provider-catalog.ts` | Small | Foundation for everything |
| **2** | DB Migration | `services/api/src/db/migrations/038_provider_enhancements.sql` | Small | Schema ready |
| **3** | `wireApi` exposure | `copilot.ts` + `chat.ts` (1-line each) | Tiny | Unlocks "responses" API format |
| **4** | Discovery Service | `services/api/src/ai/provider-discovery.ts` | Medium | Backend validation + model fetch |
| **5** | API Routes | `services/api/src/routes/ai-settings.ts` (extend) | Medium | Frontend-accessible |
| **6** | Frontend Wizard + UI | `apps/web/src/modules/ai-settings/components/` | Medium-Large | User-facing experience |

**Phase 1-3** can ship immediately (catalog + schema + wireApi).
**Phase 4-5** enables validation and discovery.
**Phase 6** is the full UX.

**Total provider support: 61** (39 cloud + 22 local), all through the same `ProviderConfig` interface. No custom adapters, no protocol converters, no proxy layers. The SDK does the heavy lifting.

---

## Sources

### Reference Project Repositories
- [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) — 36+ providers, duck-typing pattern
- [AionUI](https://github.com/iOfficeAI/AionUi) — Generic rotating client, protocol converters
- [CCS](https://github.com/kaitranntt/ccs) — Two-layer proxy, composite variants

### Provider Documentation
- [OpenAI API](https://developers.openai.com/api/reference/overview)
- [Anthropic API](https://platform.claude.com/docs/en/api/overview)
- [Google Gemini OpenAI Compat](https://ai.google.dev/gemini-api/docs/openai)
- [Azure OpenAI REST API](https://learn.microsoft.com/en-us/azure/foundry/openai/reference)
- [AWS Bedrock OpenAI Compat](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html)
- [OpenRouter API](https://openrouter.ai/docs/api/reference/overview)
- [Groq Models](https://console.groq.com/docs/models)
- [Mistral API](https://docs.mistral.ai/api)
- [DeepSeek API](https://api-docs.deepseek.com/)
- [xAI API](https://docs.x.ai/docs/api-reference)

### Local Engine Documentation
- [Ollama OpenAI Compat](https://docs.ollama.com/api/openai-compatibility)
- [LM Studio OpenAI Compat](https://lmstudio.ai/docs/developer/openai-compat)
- [vLLM OpenAI Server](https://docs.vllm.ai/en/stable/serving/openai_compatible_server/)
- [llama.cpp Server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [LocalAI Documentation](https://localai.io/)

### SDK Documentation
- [Copilot SDK Image Input](https://docs.github.com/en/copilot/how-tos/copilot-sdk/use-copilot-sdk/image-input)
- [Copilot SDK MCP Servers](https://docs.github.com/en/copilot/how-tos/copilot-sdk/use-copilot-sdk/mcp-servers)
- [CopilotKit Custom LLM](https://docs.copilotkit.ai/direct-to-llm/guides/bring-your-own-llm)
