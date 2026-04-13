import type { IntegrationDefinition } from "../types.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const AI_ML_PART1: Record<string, IntegrationDefinition> = {
  // ── AI & ML Providers ─────────────────────────────────

  claude: {
    id: "claude",
    piecePackage: "@activepieces/piece-claude",
    displayName: "Claude",
    description:
      "Generate text and have conversations using Anthropic's Claude models.",
    logoUrl: "https://cdn.activepieces.com/pieces/claude.png",
    category: "ai_ml",
    tags: ["ai", "anthropic", "claude", "llm", "text-generation"],
    authType: "secret_text",
    actions: ["ask_claude", "generate_text"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  google_gemini: {
    id: "google_gemini",
    piecePackage: "@activepieces/piece-google-gemini",
    displayName: "Google Gemini",
    description:
      "Generate text, chat, and create images using Google Gemini models.",
    logoUrl: "https://cdn.activepieces.com/pieces/google-gemini.png",
    category: "ai_ml",
    tags: ["ai", "google", "gemini", "llm", "multimodal"],
    authType: "secret_text",
    actions: ["generate_text", "chat", "generate_image"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  groq: {
    id: "groq",
    piecePackage: "@activepieces/piece-groq",
    displayName: "Groq",
    description:
      "Run ultra-fast LLM inference with Groq's LPU hardware.",
    logoUrl: "https://cdn.activepieces.com/pieces/groq.png",
    category: "ai_ml",
    tags: ["ai", "groq", "llm", "fast-inference"],
    authType: "secret_text",
    actions: ["chat_completion"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  mistral_ai: {
    id: "mistral_ai",
    piecePackage: "@activepieces/piece-mistral-ai",
    displayName: "Mistral AI",
    description:
      "Generate text completions and embeddings using Mistral AI models.",
    logoUrl: "https://cdn.activepieces.com/pieces/mistral-ai.png",
    category: "ai_ml",
    tags: ["ai", "mistral", "llm", "embeddings", "open-source"],
    authType: "secret_text",
    actions: ["chat_completion", "generate_embeddings"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  deepseek: {
    id: "deepseek",
    piecePackage: "@activepieces/piece-deepseek",
    displayName: "DeepSeek",
    description:
      "Generate text and code completions using DeepSeek models.",
    logoUrl: "https://cdn.activepieces.com/pieces/deepseek.png",
    category: "ai_ml",
    tags: ["ai", "deepseek", "llm", "code-generation"],
    authType: "secret_text",
    actions: ["chat_completion"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  cohere: {
    id: "cohere",
    piecePackage: "@activepieces/piece-cohere",
    displayName: "Cohere",
    description:
      "Generate text, create embeddings, classify content, and rerank results with Cohere.",
    logoUrl: "https://cdn.activepieces.com/pieces/cohere.png",
    category: "ai_ml",
    tags: ["ai", "cohere", "llm", "embeddings", "classification", "rag"],
    authType: "secret_text",
    actions: ["generate_text", "embed", "classify", "rerank"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  perplexity_ai: {
    id: "perplexity_ai",
    piecePackage: "@activepieces/piece-perplexity-ai",
    displayName: "Perplexity AI",
    description:
      "Ask questions and search the web with AI-powered answers via Perplexity.",
    logoUrl: "https://cdn.activepieces.com/pieces/perplexity-ai.png",
    category: "ai_ml",
    tags: ["ai", "perplexity", "search", "answers", "research"],
    authType: "secret_text",
    actions: ["ask_question", "search"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  amazon_bedrock: {
    id: "amazon_bedrock",
    piecePackage: "@activepieces/piece-amazon-bedrock",
    displayName: "Amazon Bedrock",
    description:
      "Invoke foundation models on AWS Bedrock including Claude, Llama, and Titan.",
    logoUrl: "https://cdn.activepieces.com/pieces/amazon-bedrock.png",
    category: "ai_ml",
    tags: ["ai", "aws", "bedrock", "llm", "enterprise"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "accessKeyId",
        displayName: "Access Key ID",
        description: "Your AWS access key ID",
        type: "text",
        required: true,
      },
      {
        name: "secretAccessKey",
        displayName: "Secret Access Key",
        description: "Your AWS secret access key",
        type: "secret",
        required: true,
      },
      {
        name: "region",
        displayName: "Region",
        description: "AWS region (e.g. us-east-1)",
        type: "text",
        required: true,
      },
    ],
    actions: ["invoke_model"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  azure_openai: {
    id: "azure_openai",
    piecePackage: "@activepieces/piece-azure-openai",
    displayName: "Azure OpenAI",
    description:
      "Generate text and embeddings using OpenAI models hosted on Microsoft Azure.",
    logoUrl: "https://cdn.activepieces.com/pieces/azure-openai.png",
    category: "ai_ml",
    tags: ["ai", "azure", "openai", "llm", "enterprise", "microsoft"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "endpoint",
        displayName: "Endpoint",
        description: "Your Azure OpenAI resource endpoint URL",
        type: "text",
        required: true,
      },
      {
        name: "apiKey",
        displayName: "API Key",
        description: "Your Azure OpenAI API key",
        type: "secret",
        required: true,
      },
      {
        name: "deploymentName",
        displayName: "Deployment Name",
        description: "The name of your model deployment",
        type: "text",
        required: true,
      },
    ],
    actions: ["chat_completion", "generate_embeddings"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  google_vertexai: {
    id: "google_vertexai",
    piecePackage: "@activepieces/piece-google-vertexai",
    displayName: "Google Vertex AI",
    description:
      "Run predictions and generate text using models on Google Cloud Vertex AI.",
    logoUrl: "https://cdn.activepieces.com/pieces/google-vertexai.png",
    category: "ai_ml",
    tags: ["ai", "google", "vertex", "gcp", "enterprise", "ml"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: GOOGLE_AUTH_URL,
      tokenUrl: GOOGLE_TOKEN_URL,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      // PKCE not needed for confidential clients (server-side with client_secret)
      prompt: "consent",
      extraParams: {
        access_type: "offline",
      },
    },
    actions: ["predict", "generate_text"],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  open_router: {
    id: "open_router",
    piecePackage: "@activepieces/piece-open-router",
    displayName: "OpenRouter",
    description:
      "Access hundreds of AI models through a single API with OpenRouter.",
    logoUrl: "https://cdn.activepieces.com/pieces/open-router.png",
    category: "ai_ml",
    tags: ["ai", "openrouter", "llm", "aggregator", "multi-model"],
    authType: "secret_text",
    actions: ["chat_completion"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  grok_xai: {
    id: "grok_xai",
    piecePackage: "@activepieces/piece-grok-xai",
    displayName: "Grok (xAI)",
    description:
      "Generate text completions using xAI's Grok models.",
    logoUrl: "https://cdn.activepieces.com/pieces/grok-xai.png",
    category: "ai_ml",
    tags: ["ai", "xai", "grok", "llm"],
    authType: "secret_text",
    actions: ["chat_completion"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  localai: {
    id: "localai",
    piecePackage: "@activepieces/piece-localai",
    displayName: "LocalAI",
    description:
      "Run AI models locally with a self-hosted LocalAI instance.",
    logoUrl: "https://cdn.activepieces.com/pieces/localai.png",
    category: "ai_ml",
    tags: ["ai", "local", "self-hosted", "open-source", "llm"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "baseUrl",
        displayName: "Base URL",
        description: "URL of your LocalAI instance (e.g. http://localhost:8080)",
        type: "text",
        required: true,
      },
    ],
    actions: ["chat_completion"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  hugging_face: {
    id: "hugging_face",
    piecePackage: "@activepieces/piece-hugging-face",
    displayName: "Hugging Face",
    description:
      "Run text generation, classification, and image classification models on Hugging Face.",
    logoUrl: "https://cdn.activepieces.com/pieces/hugging-face.png",
    category: "ai_ml",
    tags: ["ai", "huggingface", "ml", "open-source", "models"],
    authType: "secret_text",
    actions: ["image_generation", "text_classification", "image_classification"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Speech & Audio ────────────────────────────────────

  elevenlabs: {
    id: "elevenlabs",
    piecePackage: "@activepieces/piece-elevenlabs",
    displayName: "ElevenLabs",
    description:
      "Generate realistic speech, transcribe audio, and manage voices with ElevenLabs.",
    logoUrl: "https://cdn.activepieces.com/pieces/elevenlabs.png",
    category: "ai_ml",
    tags: ["speech", "tts", "voice", "audio", "ai"],
    authType: "secret_text",
    actions: ["text_to_speech", "speech_to_text", "list_voices"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  deepgram: {
    id: "deepgram",
    piecePackage: "@activepieces/piece-deepgram",
    displayName: "Deepgram",
    description:
      "Transcribe audio and generate speech with Deepgram's AI-powered APIs.",
    logoUrl: "https://cdn.activepieces.com/pieces/deepgram.png",
    category: "ai_ml",
    tags: ["speech", "transcription", "tts", "audio", "ai"],
    authType: "secret_text",
    actions: ["transcribe", "text_to_speech"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },
};
