# AI Providers

**63 providers supported out of the box. BYOK (Bring Your Own Key) to use any model you want.**

> Last updated: May 2026 — model IDs and versions verified against live provider docs.

Doable ships a full provider catalog at [`packages/shared/src/ai/provider-catalog.ts`](../packages/shared/src/ai/provider-catalog.ts) with tiered discovery, health checks, and a universal BYOK bridge supporting 3 SDK wire protocols (`openai`, `azure`, `anthropic`) and 6 auth methods.

Any OpenAI-compatible endpoint works: set a base URL and key and you're done.

## Catalog

| Tier | Providers & Latest Models | Count |
|------|---------------------------|-------|
| **Tier 1: Major Cloud** | **OpenAI** — GPT-5.5, GPT-5.5 Pro, GPT-5.4, GPT-5.4 Mini, GPT-5.4 Nano, GPT-4.1, GPT-4.1 Mini, GPT-4o, o3, o4, o4-mini<br>**Anthropic** — Claude Opus 4.7, Claude Opus 4.6, Claude Sonnet 4.6, Claude Haiku 4.5<br>**Google AI Studio** — Gemini 3.1 Pro, Gemini 3.5 Flash, Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.5 Flash-Lite<br>**Azure OpenAI** — GPT-5.5, GPT-5.4, GPT-4.1, GPT-4o (your deployment)<br>**AWS Bedrock** — Claude Sonnet 4, and any Bedrock-hosted model<br>**Google Vertex AI** — Gemini, Claude, and more | 6 |
| **GitHub Copilot** | Full Copilot SDK integration. Use your existing Copilot subscription directly as the AI engine | 1 |
| **Tier 2: Aggregators** | **OpenRouter** — 200+ models, 28+ free<br>**Together AI** — Llama 3.3 70B, Mixtral 8x7B, and 100+ open models<br>**Fireworks AI** — blazing-fast open-source inference<br>**Unify AI** — smart routing across providers<br>**OpenCode Zen** — Claude Sonnet 4.6, GPT-5.4, Gemini 3.1 Pro, Kimi K2.6 (coding-optimised)<br>**OpenCode Go** — Kimi K2.6, GLM 5.1, DeepSeek V4 Pro, Qwen 3.6 Plus (low-cost coding) | 6 |
| **Tier 3: Specialized** | **Groq** — Llama 3.3 70B, Mixtral 8x7B (ultra-fast LPU, free tier)<br>**Mistral AI** — Mistral Large 3 (262k), Mistral Medium 3, Mistral Small 4, Codestral 2508<br>**Cohere** — Command R+ (128k), Command R<br>**xAI (Grok)** — Grok 4.20 (2M ctx), Grok 4.3 (1M ctx), Grok 4.1 Fast (2M ctx), Grok 3 Mini<br>**DeepSeek** — DeepSeek V4 Pro (1M ctx), DeepSeek V4 Flash (1M ctx)<br>**Perplexity** — search-augmented, real-time web<br>**SambaNova**, **Novita AI**, **PPIO** | 9 |
| **Tier 4: Regional** | **Moonshot/Kimi** — Kimi K2.6 (262k ctx)<br>**Alibaba DashScope** — Qwen 3.6 Plus (1M ctx)<br>**Zhipu/GLM** — GLM 5.1<br>**Baidu Qianfan** — ERNIE series<br>**Volcengine/Doubao**, **MiniMax** — M2.7 (205k ctx), M2.5 (196k ctx)<br>**StepFun**, **01.AI/Yi**, **Tencent Hunyuan**, **Cerebras** (1M tokens/day free), **AI21 Labs**, **Hyperbolic** | 12 |
| **Tier 5: Infrastructure** | DeepInfra, NVIDIA NIM, Cloudflare Workers AI, Nebius, Scaleway, Infermatic, Lepton AI, OVHcloud | 8 |
| **Local: Primary** | Ollama, LM Studio, vLLM, llama.cpp, Jan, LocalAI, GPT4All | 7 |
| **Local: Secondary** | text-generation-webui, KoboldCpp, TGI (HuggingFace), TabbyML, llamafile (Mozilla), Cortex, Docker Model Runner, LMDeploy, SGLang, TabbyAPI, MLC LLM, Aphrodite Engine | 12 |
| **Local: Frontends** | Msty, Open WebUI, LibreChat | 3 |

**Total: 63 providers, 19+ local engines, unlimited via BYOK.**

## In the app

The frontend includes:

- **Provider setup wizard**: 5-step admin onboarding on first launch (Welcome, Sign-in, AI Provider, Cloudflare, Plans & Billing)
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
