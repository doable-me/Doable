import type { IntegrationDefinition, IntegrationCategory } from "./types.js";

// ─── Integration Registry ────────────────────────────────
//
// Static map of integration IDs to their definitions.
// Each entry describes how to authenticate, which Activepieces
// piece package backs it, and which actions are exposed.

export const REGISTRY: Record<string, IntegrationDefinition> = {
  // NOTE: GitHub is NOT in the catalog — Doable has a dedicated built-in git sync
  // feature (connect repo, push/pull, branch management) in the MCP connectors section.
  // The Activepieces GitHub piece (create issues, list repos, PRs) can be added later
  // as "github_api" if users need GitHub API access beyond git sync.

  slack: {
    id: "slack",
    piecePackage: "@activepieces/piece-slack",
    displayName: "Slack",
    description: "Send messages, manage channels, and react to messages in Slack.",
    logoUrl: "https://cdn.activepieces.com/pieces/slack.png",
    category: "communication",
    tags: ["messaging", "chat", "team", "notifications"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: [
        "chat:write",
        "channels:read",
        "channels:manage",
        "users:read",
        "reactions:write",
      ],
    },
    actions: [
      "send_channel_message",
      "send_direct_message",
      "create_channel",
      "list_channels",
      "slack-add-reaction-to-message",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  notion: {
    id: "notion",
    piecePackage: "@activepieces/piece-notion",
    displayName: "Notion",
    description: "Create pages, manage databases, and search content in Notion.",
    logoUrl: "https://cdn.activepieces.com/pieces/notion.png",
    category: "productivity",
    tags: ["wiki", "docs", "database", "knowledge-base"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      scopes: [],
      authorizationMethod: "HEADER",
    },
    actions: [
      "create_page",
      "create_database_item",
      "update_database_item",
      "retrieve_database",
      "search",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  openai: {
    id: "openai",
    piecePackage: "@activepieces/piece-openai",
    displayName: "OpenAI",
    description: "Generate text, images, and audio using OpenAI models.",
    logoUrl: "https://cdn.activepieces.com/pieces/openai.png",
    category: "ai_ml",
    tags: ["ai", "gpt", "chatgpt", "dall-e", "whisper"],
    authType: "secret_text",
    actions: [
      "ask_chatgpt",
      "generate_image",
      "text_to_speech",
      "transcribe",
      "vision_prompt",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  google_sheets: {
    id: "google_sheets",
    piecePackage: "@activepieces/piece-google-sheets",
    displayName: "Google Sheets",
    description: "Read, write, and manage data in Google Sheets spreadsheets.",
    logoUrl: "https://cdn.activepieces.com/pieces/google-sheets.png",
    category: "productivity",
    tags: ["spreadsheet", "data", "google", "sheets"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      pkce: true,
      pkceMethod: "S256",
      prompt: "consent",
      extraParams: {
        access_type: "offline",
      },
    },
    actions: [
      "insert_row",
      "get_values",
      "update_row",
      "clear_sheet",
      "find_rows",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },
};

// ─── Helper Functions ────────────────────────────────────

/**
 * Look up a single integration by ID.
 */
export function getIntegration(id: string): IntegrationDefinition | undefined {
  return REGISTRY[id];
}

/**
 * Return all integrations, optionally filtered by category and/or
 * a free-text search across name, description, and tags.
 */
export function listIntegrations(opts?: {
  category?: IntegrationCategory;
  search?: string;
}): IntegrationDefinition[] {
  let results = Object.values(REGISTRY);

  if (opts?.category) {
    results = results.filter((i) => i.category === opts.category);
  }

  if (opts?.search) {
    const q = opts.search.toLowerCase();
    results = results.filter(
      (i) =>
        i.displayName.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  return results;
}

/**
 * Return all distinct categories present in the registry.
 */
export function getCategories(): IntegrationCategory[] {
  const cats = new Set<IntegrationCategory>();
  for (const def of Object.values(REGISTRY)) {
    cats.add(def.category);
  }
  return [...cats];
}
