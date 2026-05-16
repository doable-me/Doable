# AI Providers

**53+ providers supported out of the box. BYOK (Bring Your Own Key) to use any model you want.**

Doable ships a full provider catalog at [`packages/shared/src/ai/provider-catalog.ts`](../packages/shared/src/ai/provider-catalog.ts) with tiered discovery, health checks, and a universal BYOK bridge supporting 3 SDK wire protocols (`openai`, `azure`, `anthropic`) and 6 auth methods.

Any OpenAI-compatible endpoint works: set a base URL and key and you're done.

## Catalog

| Tier | Providers | Count |
|------|-----------|-------|
| **Tier 1: Major Cloud** | OpenAI (GPT-4.1, o3, o4-mini), Anthropic (Claude Opus 4, Sonnet 4), Google AI Studio (Gemini 2.5 Pro/Flash), Azure OpenAI, AWS Bedrock, Google Vertex AI | 6 |
| **GitHub Copilot** | Full Copilot SDK integration. Use your existing Copilot subscription directly as the AI engine | 1 |
| **Tier 2: Aggregators** | OpenRouter (200+ models, 28+ free), Together AI, Fireworks AI, Unify AI, OpenCode Zen, OpenCode Go | 6 |
| **Tier 3: Specialized** | Groq (free tier), Mistral, Cohere, xAI (Grok), DeepSeek, Perplexity, SambaNova, Novita AI, PPIO | 9 |
| **Tier 4: Regional** | Moonshot/Kimi, Alibaba DashScope (Qwen), Zhipu/GLM, Baidu Qianfan (ERNIE), Volcengine/Doubao, MiniMax, StepFun, 01.AI/Yi, Tencent Hunyuan, Cerebras, AI21, Hyperbolic | 12 |
| **Tier 5: Infrastructure** | DeepInfra, NVIDIA NIM, Cloudflare Workers AI, Nebius, Scaleway, Infermatic, Lepton AI, OVHcloud | 8 |
| **Local: Primary** | Ollama, LM Studio, vLLM, llama.cpp, Jan, LocalAI, GPT4All | 7 |
| **Local: Secondary** | text-generation-webui, KoboldCpp, TGI (HuggingFace), TabbyML, llamafile (Mozilla), Cortex, Docker Model Runner, LMDeploy, SGLang, TabbyAPI, MLC LLM, Aphrodite Engine | 12 |
| **Local: Frontends** | Msty, Open WebUI, LibreChat | 3 |

**Total: 53+ providers, 19+ local engines, unlimited via BYOK.**

## In the app

The frontend includes:

- **Provider setup wizard** — 5-step onboarding on first launch
- **In-editor model picker** — switch models per conversation
- **Admin model configuration panel** at `apps/web/src/modules/ai-settings/`

## BYOK details

The universal bridge in `packages/docore/` accepts:

- **Wire protocols:** `openai` (chat completions API), `azure` (Azure-flavored OpenAI), `anthropic` (Claude messages API)
- **Auth methods:** API key header, bearer token, Azure key+endpoint, AWS SigV4 (Bedrock), Google service account (Vertex), GitHub Copilot token

Add a custom provider via the admin panel by specifying:

1. Display name
2. Base URL (e.g., `https://your-host/v1`)
3. Wire protocol (`openai` / `azure` / `anthropic`)
4. Auth header pattern
5. Model IDs to expose
