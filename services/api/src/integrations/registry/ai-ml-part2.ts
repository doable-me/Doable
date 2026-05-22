import type { IntegrationDefinition } from "../types.js";

export const AI_ML_PART2: Record<string, IntegrationDefinition> = {

  assemblyai: {
    id: "assemblyai",
    piecePackage: "@activepieces/piece-assemblyai",
    displayName: "AssemblyAI",
    description:
      "Transcribe audio and summarize content using AssemblyAI.",
    logoUrl: "https://cdn.activepieces.com/pieces/assemblyai.png",
    category: "ai_ml",
    tags: ["speech", "transcription", "summarization", "audio", "ai"],
    authType: "secret_text",
    actions: ["transcribe_audio", "summarize"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  gladia: {
    id: "gladia",
    piecePackage: "@activepieces/piece-gladia",
    displayName: "Gladia",
    description:
      "Transcribe audio files with Gladia's speech-to-text API.",
    logoUrl: "https://cdn.activepieces.com/pieces/gladia.png",
    category: "ai_ml",
    tags: ["speech", "transcription", "audio", "ai"],
    authType: "secret_text",
    actions: ["transcribe_audio"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  murf_api: {
    id: "murf_api",
    piecePackage: "@activepieces/piece-murf-api",
    displayName: "Murf",
    description:
      "Generate lifelike voiceovers and manage voices with the Murf API.",
    logoUrl: "https://cdn.activepieces.com/pieces/murf-api.png",
    category: "ai_ml",
    tags: ["speech", "tts", "voice", "voiceover", "ai"],
    authType: "secret_text",
    actions: ["text_to_speech", "list_voices"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Image & Video ─────────────────────────────────────

  stability_ai: {
    id: "stability_ai",
    piecePackage: "@activepieces/piece-stability-ai",
    displayName: "Stability AI",
    description:
      "Generate and upscale images using Stable Diffusion models via Stability AI.",
    logoUrl: "https://cdn.activepieces.com/pieces/stability-ai.png",
    category: "ai_ml",
    tags: ["image", "stable-diffusion", "generation", "upscale", "ai"],
    authType: "secret_text",
    actions: ["generate_image", "upscale_image"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  runway: {
    id: "runway",
    piecePackage: "@activepieces/piece-runway",
    displayName: "Runway",
    description:
      "Generate videos and images using Runway's AI creative tools.",
    logoUrl: "https://cdn.activepieces.com/pieces/runway.png",
    category: "ai_ml",
    tags: ["video", "image", "generation", "creative", "ai"],
    authType: "secret_text",
    actions: ["generate_video", "generate_image"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  photoroom: {
    id: "photoroom",
    piecePackage: "@activepieces/piece-photoroom",
    displayName: "PhotoRoom",
    description:
      "Remove backgrounds from images automatically with PhotoRoom.",
    logoUrl: "https://cdn.activepieces.com/pieces/photoroom.png",
    category: "ai_ml",
    tags: ["image", "background-removal", "editing", "ai"],
    authType: "secret_text",
    actions: ["remove_background"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  heygen: {
    id: "heygen",
    piecePackage: "@activepieces/piece-heygen",
    displayName: "HeyGen",
    description:
      "Create AI-generated videos with virtual avatars using HeyGen.",
    logoUrl: "https://cdn.activepieces.com/pieces/heygen.png",
    category: "ai_ml",
    tags: ["video", "avatar", "generation", "ai", "presentation"],
    authType: "secret_text",
    actions: ["create_video", "list_avatars"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  synthesia: {
    id: "synthesia",
    piecePackage: "@activepieces/piece-synthesia",
    displayName: "Synthesia",
    description:
      "Create AI-generated videos from text using Synthesia templates and avatars.",
    logoUrl: "https://cdn.activepieces.com/pieces/synthesia.png",
    category: "ai_ml",
    tags: ["video", "avatar", "generation", "ai", "enterprise"],
    authType: "secret_text",
    actions: ["create_video", "list_templates"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  modelslab: {
    id: "modelslab",
    piecePackage: "@activepieces/piece-modelslab",
    displayName: "ModelsLab",
    description:
      "Generate images using Stable Diffusion and other models via ModelsLab.",
    logoUrl: "https://cdn.activepieces.com/pieces/modelslab.png",
    category: "ai_ml",
    tags: ["image", "generation", "stable-diffusion", "ai"],
    authType: "secret_text",
    actions: ["generate_image"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  runware: {
    id: "runware",
    piecePackage: "@activepieces/piece-runware",
    displayName: "Runware",
    description:
      "Generate images and run AI models with Runware's inference API.",
    logoUrl: "https://cdn.activepieces.com/pieces/runware.png",
    category: "ai_ml",
    tags: ["image", "generation", "inference", "ai"],
    authType: "secret_text",
    actions: ["generate_image", "run_model"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── AI Tools ──────────────────────────────────────────

  firecrawl: {
    id: "firecrawl",
    piecePackage: "@activepieces/piece-firecrawl",
    displayName: "Firecrawl",
    description:
      "Scrape, crawl, and search web pages with AI-friendly extraction via Firecrawl.",
    logoUrl: "https://cdn.activepieces.com/pieces/firecrawl.png",
    category: "ai_ml",
    tags: ["scraping", "crawling", "web", "extraction", "ai"],
    authType: "secret_text",
    actions: ["scrape", "crawl", "search"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  tavily: {
    id: "tavily",
    piecePackage: "@activepieces/piece-tavily",
    displayName: "Tavily",
    description:
      "Search the web and extract structured content with Tavily's AI search API.",
    logoUrl: "https://cdn.activepieces.com/pieces/tavily.png",
    category: "ai_ml",
    tags: ["search", "extraction", "web", "ai", "research"],
    authType: "secret_text",
    actions: ["search", "extract"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  exa: {
    id: "exa",
    piecePackage: "@activepieces/piece-exa",
    displayName: "Exa",
    description:
      "Search the web, find similar pages, and get page contents with Exa's neural search.",
    logoUrl: "https://cdn.activepieces.com/pieces/exa.png",
    category: "ai_ml",
    tags: ["search", "neural-search", "web", "ai", "discovery"],
    authType: "secret_text",
    actions: ["search", "find_similar_links", "get_contents"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  brave_search: {
    id: "brave_search",
    piecePackage: "@activepieces/piece-brave-search",
    displayName: "Brave Search",
    description:
      "Search the web using Brave's privacy-focused search API.",
    logoUrl: "https://cdn.activepieces.com/pieces/brave-search.png",
    category: "ai_ml",
    tags: ["search", "web", "privacy", "brave"],
    authType: "secret_text",
    actions: ["web_search"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  google_search: {
    id: "google_search",
    piecePackage: "@activepieces/piece-google-search",
    displayName: "Google Search",
    description:
      "Perform web searches using the Google Custom Search JSON API.",
    logoUrl: "https://cdn.activepieces.com/pieces/google-search.png",
    category: "ai_ml",
    tags: ["search", "web", "google", "serp"],
    authType: "secret_text",
    actions: ["search"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  jina_ai: {
    id: "jina_ai",
    piecePackage: "@activepieces/piece-jina-ai",
    displayName: "Jina AI",
    description:
      "Create embeddings, rerank search results, and perform neural search with Jina AI.",
    logoUrl: "https://cdn.activepieces.com/pieces/jina-ai.png",
    category: "ai_ml",
    tags: ["embeddings", "reranking", "search", "ai", "neural-search"],
    authType: "secret_text",
    actions: ["embed", "rerank", "search"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  eden_ai: {
    id: "eden_ai",
    piecePackage: "@activepieces/piece-eden-ai",
    displayName: "Eden AI",
    description:
      "Access multiple AI providers for text generation, image creation, and OCR through Eden AI.",
    logoUrl: "https://cdn.activepieces.com/pieces/eden-ai.png",
    category: "ai_ml",
    tags: ["ai", "aggregator", "text", "image", "ocr"],
    authType: "secret_text",
    actions: ["text_summarization", "image_generation", "ocr"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Automation ────────────────────────────────────────

  flowise: {
    id: "flowise",
    piecePackage: "@activepieces/piece-flowise",
    displayName: "Flowise",
    description:
      "Run chatflows and predictions on a self-hosted Flowise instance.",
    logoUrl: "https://cdn.activepieces.com/pieces/flowise.png",
    category: "automation",
    tags: ["automation", "chatflow", "langchain", "self-hosted", "ai"],
    authType: "secret_text",
    actions: ["run_chatflow", "make_prediction"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  griptape: {
    id: "griptape",
    piecePackage: "@activepieces/piece-griptape",
    displayName: "Griptape",
    description:
      "Run AI agents built with the Griptape framework.",
    logoUrl: "https://cdn.activepieces.com/pieces/griptape.png",
    category: "automation",
    tags: ["automation", "agents", "griptape", "framework", "ai"],
    authType: "secret_text",
    actions: ["run_agent"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },
};
